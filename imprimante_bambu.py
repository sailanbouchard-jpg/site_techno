"""
imprimante_bambu.py
-------------------
Parle aux imprimantes Bambu Lab P1P/P1S du réseau local, sans cloud Bambu.

  MQTT sur TLS, port 8883   état de l'imprimante et ordres (imprimer, pause, arrêt)
  FTPS implicite, port 990  dépôt du fichier à imprimer
  Identifiant : bblp ; mot de passe : le code d'accès affiché par l'imprimante.

L'imprimante doit être en mode « LAN uniquement » avec le mode développeur
activé (écran de l'imprimante : Réglages › WLAN › LAN Only Mode, puis, plus bas,
Developer Mode › Enable). Sans le mode développeur, les firmwares récents
vérifient la signature des ordres MQTT : l'état et les commandes de service
passent encore, mais tout ordre d'impression est refusé (err_code 0x05024007,
alerte HMS_0500_0500_0001_0007 « MQTT command verification failed »). Ce réglage
est propre à chaque machine et une remise à zéro le désactive.

Le fichier envoyé est un .gcode.3mf : une archive ZIP qui contient le G-code
(Metadata/plate_1.gcode) et ce que le firmware lit autour (modèle d'imprimante,
durée, masse de filament). Même disposition que les fichiers de Bambu Studio.

Tout tient dans la bibliothèque standard : ssl, socket, ftplib, zipfile.
Le client MQTT est réduit à ce qu'il faut : connexion, abonnement, publication
en QoS 0, maintien de la connexion.
"""

import ftplib
import hashlib
import io
import json
import socket
import ssl
import struct
import threading
import time
import zipfile

# ── Constantes ─────────────────────────────────────────────────────────────────

PORT_MQTT          = 8883
PORT_FTPS          = 990
PORT_CAMERA        = 6000
TAILLE_IMAGE_MAX   = 4 * 1024 * 1024   # une image JPEG 1280×720 fait ~100 ko : au-delà, le flux est corrompu
UTILISATEUR        = "bblp"
DELAI_RESEAU_S     = 10
MAINTIEN_MQTT_S    = 30      # un PINGREQ toutes les 30 s garde la connexion ouverte
REESSAI_MQTT_S     = 5
DELAI_ACCUSE_S     = 10      # le firmware accuse un ordre d'impression en moins d'une seconde
FICHIER_DU_PLATEAU = "Metadata/plate_1.gcode"

# Les refus d'ordre d'impression qu'on sait provoquer, traduits. Le catalogue
# complet est chez Bambu (e.bambulab.com) : on ne le recopie pas, on nomme les
# seuls cas que l'atelier rencontre vraiment.
REFUS_CONNUS = {
    0x05024007: "l'imprimante refuse les ordres venus d'un autre logiciel que Bambu Studio. "
                "Sur son écran : Réglages › WLAN, activer « LAN Only Mode », puis, plus bas, "
                "« Developer Mode » › Enable.",
    0x0502400D: "l'imprimante n'a pas fini de charger ou de décharger son filament.",
    0x05024010: "l'imprimante refuse le fichier tranché : elle le juge incompatible.",
    0x05024030: "l'imprimante n'a pas su lire le G-code du fichier.",
}


class OrdreRefuse(Exception):
    """Le firmware a répondu, et il a dit non : le message porte la raison."""


# Les champs de l'état MQTT que l'Atelier affiche.
CHAMPS_ETAT = (
    "gcode_state", "mc_percent", "mc_remaining_time", "layer_num", "total_layer_num",
    "nozzle_temper", "nozzle_target_temper", "bed_temper", "bed_target_temper",
    "subtask_name", "print_error", "ams",
)


def _contexte_tls() -> ssl.SSLContext:
    # L'imprimante présente un certificat signé par Bambu, pas par une autorité
    # reconnue : on chiffre sans vérifier son identité (réseau local).
    contexte = ssl.create_default_context()
    contexte.check_hostname = False
    contexte.verify_mode = ssl.CERT_NONE
    return contexte


# ── Archive .gcode.3mf ─────────────────────────────────────────────────────────

_TYPES_DE_CONTENU = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>
"""

_RELATIONS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
"""

# Le modèle 3D est vide : l'imprimante n'en a pas besoin, seul le G-code compte.
_MODELE = """<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 <metadata name="Application">Atelier 3D</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <resources>
 </resources>
 <build/>
</model>
"""

_REGLAGES_DU_MODELE = """<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="gcode_file" value="Metadata/plate_1.gcode"/>
  </plate>
</config>
"""

_RELATIONS_DES_REGLAGES = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/Metadata/plate_1.gcode" Id="rel-1" Type="http://schemas.bambulab.com/package/2021/gcode"/>
</Relationships>
"""


def _infos_de_tranchage(infos: dict) -> str:
    """slice_info.config : ce que l'écran de l'imprimante affiche avant de lancer."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="01.00.00.00"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="printer_model_id" value="{infos['modele']}"/>
    <metadata key="nozzle_diameters" value="{infos['buse']}"/>
    <metadata key="prediction" value="{int(infos['duree'])}"/>
    <metadata key="weight" value="{infos['poids']:.2f}"/>
    <metadata key="outside" value="false"/>
    <metadata key="support_used" value="false"/>
    <metadata key="label_object_enabled" value="false"/>
    <filament id="1" type="{infos['matiere']}" color="{infos['couleur']}" used_m="{infos['longueur']:.2f}" used_g="{infos['poids']:.2f}"/>
  </plate>
</config>
"""


def construire_3mf(gcode: str, infos: dict) -> bytes:
    """infos : modele (C11/C12), buse (mm), duree (s), poids (g), longueur (m), matiere, couleur (#RRGGBB)."""
    octets_gcode = gcode.encode("utf-8")
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _TYPES_DE_CONTENU)
        archive.writestr("_rels/.rels", _RELATIONS)
        archive.writestr("3D/3dmodel.model", _MODELE)
        archive.writestr("Metadata/model_settings.config", _REGLAGES_DU_MODELE)
        archive.writestr("Metadata/_rels/model_settings.config.rels", _RELATIONS_DES_REGLAGES)
        archive.writestr("Metadata/slice_info.config", _infos_de_tranchage(infos))
        archive.writestr(FICHIER_DU_PLATEAU, octets_gcode)
        archive.writestr(FICHIER_DU_PLATEAU + ".md5", hashlib.md5(octets_gcode).hexdigest().upper())
    return tampon.getvalue()


# ── FTPS implicite ─────────────────────────────────────────────────────────────

class _FtpsImplicite(ftplib.FTP_TLS):
    """ftplib ne connaît que le FTPS explicite (AUTH TLS) : ici, la connexion est chiffrée dès l'ouverture."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sock = None

    @property
    def sock(self):
        return self._sock

    @sock.setter
    def sock(self, valeur):
        if valeur is not None and not isinstance(valeur, ssl.SSLSocket):
            valeur = self.context.wrap_socket(valeur)
        self._sock = valeur

    def ntransfercmd(self, cmd, rest=None):
        # L'imprimante exige que le canal de données reprenne la session TLS du canal de commande.
        conn, taille = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, taille

    def storbinary(self, cmd, fp, blocksize=32768, callback=None, rest=None):
        # Sans la fermeture TLS polie (unwrap) de ftplib, que l'imprimante laisse sans réponse.
        self.voidcmd("TYPE I")
        with self.transfercmd(cmd, rest) as conn:
            while bloc := fp.read(blocksize):
                conn.sendall(bloc)
        return self.voidresp()


def deposer_fichier(ip: str, code_acces: str, nom: str, octets: bytes) -> None:
    ftp = _FtpsImplicite(context=_contexte_tls(), timeout=DELAI_RESEAU_S * 6)
    try:
        ftp.connect(ip, PORT_FTPS)
        ftp.login(UTILISATEUR, code_acces)
        ftp.prot_p()
        ftp.storbinary(f"STOR {nom}", io.BytesIO(octets))
    finally:
        try:
            ftp.quit()
        except (OSError, EOFError, ftplib.Error):
            ftp.close()


# ── MQTT minimal ───────────────────────────────────────────────────────────────

def _longueur_variable(n: int) -> bytes:
    sortie = bytearray()
    while True:
        octet, n = n % 128, n // 128
        sortie.append(octet | (0x80 if n else 0))
        if not n:
            return bytes(sortie)


def _chaine(texte: str) -> bytes:
    donnees = texte.encode("utf-8")
    return struct.pack("!H", len(donnees)) + donnees


def _paquet(entete: int, corps: bytes) -> bytes:
    return bytes([entete]) + _longueur_variable(len(corps)) + corps


def _lire_exactement(sock, n: int) -> bytes:
    donnees = bytearray()
    while len(donnees) < n:
        morceau = sock.recv(n - len(donnees))
        if not morceau:
            raise ConnectionError("Connexion fermée par l'imprimante")
        donnees.extend(morceau)
    return bytes(donnees)


def _lire_paquet(sock) -> tuple[int, bytes]:
    entete = _lire_exactement(sock, 1)[0]
    longueur, facteur = 0, 1
    while True:
        octet = _lire_exactement(sock, 1)[0]
        longueur += (octet & 0x7F) * facteur
        facteur *= 128
        if not octet & 0x80:
            break
    return entete, _lire_exactement(sock, longueur)


class Imprimante:
    """Une connexion MQTT tenue en arrière-plan : l'état reçu est gardé, les ordres partent par la même connexion."""

    def __init__(self, ip: str, numero_serie: str, code_acces: str):
        self.ip = ip
        self.numero_serie = numero_serie
        self.code_acces = code_acces
        self.etat: dict = {}
        self.connectee = False
        self.erreur = ""
        # Les accusés d'ordre d'impression reçus, par numéro d'ordre : MQTT en
        # QoS 0 ne dit pas si un message est arrivé, seul l'accusé le prouve.
        self._accuses: dict = {}
        self._numero_d_ordre = 0
        self._sock = None
        self._verrou = threading.Lock()
        self._arret = threading.Event()
        self._fil = threading.Thread(target=self._boucle, daemon=True)
        self._fil.start()

    def arreter(self) -> None:
        self._arret.set()
        self._fermer()

    # ── Connexion ──
    def _connecter(self) -> None:
        brut = socket.create_connection((self.ip, PORT_MQTT), timeout=DELAI_RESEAU_S)
        sock = _contexte_tls().wrap_socket(brut, server_hostname=self.ip)
        # CONNECT : MQTT 3.1.1, session propre, identifiant et mot de passe.
        variable = _chaine("MQTT") + bytes([4, 0xC2]) + struct.pack("!H", MAINTIEN_MQTT_S * 2)
        charge = _chaine("atelier3d-" + str(int(time.time()))) + _chaine(UTILISATEUR) + _chaine(self.code_acces)
        sock.sendall(_paquet(0x10, variable + charge))
        entete, corps = _lire_paquet(sock)
        if entete >> 4 != 2 or len(corps) < 2 or corps[1] != 0:
            sock.close()
            raise ConnectionError("Connexion refusée : vérifier le code d'accès" if corps[1:2] in (b"\x04", b"\x05")
                                  else "Connexion MQTT refusée")
        # SUBSCRIBE au compte rendu de l'imprimante, QoS 0.
        sock.sendall(_paquet(0x82, struct.pack("!H", 1) + _chaine(f"device/{self.numero_serie}/report") + b"\x00"))
        self._sock = sock
        self.connectee = True
        self.erreur = ""
        self.publier({"pushing": {"sequence_id": "0", "command": "pushall"}})

    def _fermer(self) -> None:
        self.connectee = False
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
        self._sock = None

    def _boucle(self) -> None:
        while not self._arret.is_set():
            try:
                self._connecter()
                self._sock.settimeout(MAINTIEN_MQTT_S)
                while not self._arret.is_set():
                    try:
                        entete, corps = _lire_paquet(self._sock)
                    except socket.timeout:
                        with self._verrou:
                            self._sock.sendall(b"\xC0\x00")   # PINGREQ
                        continue
                    if entete >> 4 == 3:
                        self._recevoir(entete, corps)
            except (OSError, ConnectionError, ssl.SSLError) as e:
                self.erreur = str(e) or e.__class__.__name__
            self._fermer()
            self._arret.wait(REESSAI_MQTT_S)

    def _recevoir(self, entete: int, corps: bytes) -> None:
        longueur_sujet = struct.unpack("!H", corps[:2])[0]
        debut = 2 + longueur_sujet + (2 if (entete >> 1) & 0x03 else 0)
        try:
            message = json.loads(corps[debut:].decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return
        # Les P1 n'envoient que ce qui change : on fusionne dans l'état connu.
        rapport = message.get("print")
        if isinstance(rapport, dict):
            if rapport.get("command") == "project_file":
                self._accuses[str(rapport.get("sequence_id"))] = rapport
            self.etat.update({k: v for k, v in rapport.items() if k in CHAMPS_ETAT})

    # ── Ordres ──
    def publier(self, message: dict) -> None:
        with self._verrou:
            if self._sock is None:
                raise ConnectionError(self.erreur or "Imprimante non connectée")
            corps = _chaine(f"device/{self.numero_serie}/request") + json.dumps(message).encode("utf-8")
            self._sock.sendall(_paquet(0x30, corps))

    def imprimer(self, nom_fichier: str, nom_tache: str, md5: str, emplacement) -> None:
        """emplacement : le numéro de la bobine dans l'AMS (0 à 15, 4 par AMS), ou None pour la bobine externe.
        Le G-code appelle le filament 0 (T0) : ams_mapping dit à l'imprimante quelle bobine lui donner.
        Rend la main quand le firmware a accusé l'ordre, lève OrdreRefuse sinon."""
        avec_ams = emplacement is not None
        self._numero_d_ordre += 1
        numero = str(self._numero_d_ordre)
        self._accuses.pop(numero, None)
        self.publier({"print": {
            "sequence_id": numero, "command": "project_file", "param": FICHIER_DU_PLATEAU,
            "project_id": "0", "profile_id": "0", "task_id": "0", "subtask_id": "0",
            "subtask_name": nom_tache, "file": "", "url": f"ftp:///{nom_fichier}", "md5": md5,
            "timelapse": False, "bed_type": "auto", "bed_levelling": True,
            "flow_cali": False, "vibration_cali": False, "layer_inspect": False,
            "ams_mapping": [emplacement] if avec_ams else "", "use_ams": avec_ams,
        }})
        self._attendre_l_accuse(numero)

    def _attendre_l_accuse(self, numero: str) -> None:
        """L'imprimante renvoie l'ordre sur son sujet de compte rendu, avec un
        err_code s'il est refusé. Sans cet accusé, l'ordre n'est pas arrivé :
        un PUBLISH en QoS 0 réussit même dans une connexion déjà morte, et le
        fichier est alors sur la carte sans que rien ne démarre."""
        fin = time.monotonic() + DELAI_ACCUSE_S
        while time.monotonic() < fin:
            accuse = self._accuses.pop(numero, None)
            if accuse is not None:
                code = accuse.get("err_code")
                if code:
                    raise OrdreRefuse(REFUS_CONNUS.get(code, f"l'imprimante a refusé l'ordre (code {code:#010x})"))
                return
            time.sleep(0.2)
        raise OrdreRefuse("l'imprimante n'a pas accusé réception de l'ordre : le fichier est déposé "
                          "sur sa carte, mais rien n'a démarré. Vérifier qu'elle est bien sur le réseau.")

    def commande(self, action: str) -> None:
        """action : pause, resume ou stop."""
        self.publier({"print": {"sequence_id": "0", "command": action}})

    def bobines(self) -> list:
        """Les bobines chargées dans l'AMS : [{ emplacement, type, couleur }]."""
        liste = []
        for ams in (self.etat.get("ams") or {}).get("ams", []) or []:
            for bac in ams.get("tray", []) or []:
                if not bac.get("tray_type"):
                    continue
                liste.append({
                    "emplacement": int(ams.get("id", 0)) * 4 + int(bac.get("id", 0)),
                    "type": bac.get("tray_type"),
                    "couleur": "#" + str(bac.get("tray_color", "FFFFFFFF"))[:6],
                })
        return liste

    def resume(self) -> dict:
        etat = {k: v for k, v in self.etat.items() if k != "ams"}
        return {"connectee": self.connectee, "erreur": self.erreur, "bobines": self.bobines(), **etat}


# ── Caméra ─────────────────────────────────────────────────────────────────────
# P1P/P1S : TLS sur le port 6000. Un paquet d'identification de 80 octets, puis
# l'imprimante envoie des images JPEG, chacune précédée d'un en-tête de 16 octets
# dont les 4 premiers donnent la taille (petit-boutiste). Format décrit par
# OpenBambuAPI (video.md).

def images_camera(ip: str, code_acces: str):
    """Les images de la caméra, une à une (octets JPEG), tant que l'appelant en demande."""
    brut = socket.create_connection((ip, PORT_CAMERA), timeout=DELAI_RESEAU_S)
    sock = _contexte_tls().wrap_socket(brut, server_hostname=ip)
    try:
        identification = struct.pack("<IIII", 0x40, 0x3000, 0, 0)
        identification += UTILISATEUR.encode("ascii").ljust(32, b"\0") + code_acces.encode("ascii").ljust(32, b"\0")
        sock.sendall(identification)
        while True:
            entete = _lire_exactement(sock, 16)
            taille = struct.unpack("<I", entete[:4])[0]
            if not 0 < taille <= TAILLE_IMAGE_MAX:
                raise ConnectionError("Flux de la caméra illisible")
            image = _lire_exactement(sock, taille)
            if image[:2] == b"\xff\xd8":
                yield image
    finally:
        sock.close()


def envoyer_et_imprimer(imprimante: Imprimante, nom_fichier: str, nom_tache: str, archive: bytes, emplacement) -> None:
    deposer_fichier(imprimante.ip, imprimante.code_acces, nom_fichier, archive)
    imprimante.imprimer(nom_fichier, nom_tache, hashlib.md5(archive).hexdigest(), emplacement)
