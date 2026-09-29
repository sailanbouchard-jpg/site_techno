"""Outils de l'agent DeepSeek : lecture, modification, execution.

Tout est borne au dossier du projet. Les actions qui modifient quelque chose
(ecriture, execution) passent par une demande d'accord, sauf si le mode auto
est actif. Chaque fichier modifie est sauvegarde avant ecriture.
"""

import html
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOSSIER_SAUVEGARDES = os.path.join(RACINE, ".ds_sauvegardes")

DOSSIERS_IGNORES = {"site", "__pycache__", ".git", ".venv", "venv", "uploads",
                    "node_modules", ".claude", ".ds_sauvegardes", "deepseek_conversations"}
EXTENSIONS_LISIBLES = {".py", ".js", ".html", ".css", ".md", ".json", ".palette",
                       ".txt", ".cmd", ".csv", ".gcode"}

# En lecture seule pour l'agent : donnees des eleves, secrets, sortie du build
DOSSIERS_PROTEGES = {"site", "uploads", ".git", ".ds_sauvegardes", "deepseek_conversations"}
FICHIERS_PROTEGES = ("_key.txt", "secret_key.txt", "data.db", "imprimantes.json")

MAX_CARACTERES = 40000   # par lecture de fichier
MAX_RESULTATS = 60       # par recherche
MAX_SORTIE = 8000        # par execution de commande
DELAI_COMMANDE = 180     # secondes
HOTES_LOCAUX = ("localhost", "127.0.0.1")

# Recherche web : point d'entree sans cle ni compte
RECHERCHE_URL = "https://html.duckduckgo.com/html/?q=%s"
RECHERCHE_SECOURS = "https://lite.duckduckgo.com/lite/?q=%s"
NAVIGATEUR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " \
             "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
MAX_RESULTATS_WEB = 10
MAX_PAGE = 20000

# Accords donnes par l'utilisateur pendant la session
AUTO = {"actif": False}
TOUJOURS = set()

# Processus lances en arriere-plan (serveurs de test)
PROCESSUS = {}


# ── Accord de l'utilisateur ──

def demande_accord(action, apercu):
    """Retourne True si l'utilisateur autorise l'action."""
    if AUTO["actif"] or action in TOUJOURS:
        return True
    print("\n  [!] %s" % action)
    for ligne in apercu.splitlines()[:20]:
        print("      " + ligne[:160])
    try:
        reponse = input("  Autoriser ? [o]ui / [t]oujours / [n]on : ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        return False
    if reponse.startswith("t"):
        TOUJOURS.add(action)
        return True
    return reponse.startswith("o")


# ── Chemins ──

def chemin_sur(chemin):
    absolu = os.path.abspath(os.path.join(RACINE, chemin))
    if absolu != RACINE and not absolu.startswith(RACINE + os.sep):
        raise ValueError("Chemin hors du projet : %s" % chemin)
    return absolu


def chemin_modifiable(chemin):
    """Les donnees, les secrets et le dossier genere ne s'ecrivent pas depuis l'agent."""
    relatif = os.path.relpath(chemin_sur(chemin), RACINE).replace(os.sep, "/")
    premier = relatif.split("/")[0]
    if premier in DOSSIERS_PROTEGES or relatif.endswith(FICHIERS_PROTEGES):
        raise ValueError("Ecriture interdite sur %s (donnees, secrets ou dossier genere)." % relatif)
    return os.path.join(RACINE, relatif.replace("/", os.sep))


def sauvegarde(absolu, relatif):
    """Copie la version actuelle du fichier avant de l'ecraser."""
    if not os.path.isfile(absolu):
        return
    cible = os.path.join(DOSSIER_SAUVEGARDES, time.strftime("%Y%m%d_%H%M%S"), relatif)
    os.makedirs(os.path.dirname(cible), exist_ok=True)
    shutil.copy2(absolu, cible)


def fichiers_du_projet():
    for dossier, sous_dossiers, fichiers in os.walk(RACINE):
        sous_dossiers[:] = [d for d in sous_dossiers if d not in DOSSIERS_IGNORES]
        for nom in fichiers:
            if os.path.splitext(nom)[1].lower() in EXTENSIONS_LISIBLES:
                yield os.path.join(dossier, nom)


# ── Lecture ──

def lister(chemin="."):
    absolu = chemin_sur(chemin)
    if not os.path.isdir(absolu):
        return "Pas un dossier : %s" % chemin
    dossiers, fichiers = [], []
    for nom in sorted(os.listdir(absolu)):
        if nom in DOSSIERS_IGNORES:
            continue
        complet = os.path.join(absolu, nom)
        if os.path.isdir(complet):
            dossiers.append(nom + "/")
        else:
            fichiers.append("%s  (%d o)" % (nom, os.path.getsize(complet)))
    return "%s\n%s" % (chemin, "\n".join("  " + e for e in dossiers + fichiers) or "  (vide)")


def lire(chemin, debut=1, lignes=600):
    absolu = chemin_sur(chemin)
    if not os.path.isfile(absolu):
        return "Fichier introuvable : %s" % chemin
    with open(absolu, encoding="utf-8", errors="replace") as f:
        toutes = f.readlines()
    debut = max(1, int(debut))
    extrait = toutes[debut - 1:debut - 1 + int(lignes)]
    texte = "".join("%5d| %s" % (debut + i, l) for i, l in enumerate(extrait))
    if len(texte) > MAX_CARACTERES:
        texte = texte[:MAX_CARACTERES] + "\n[...tronque, relis avec debut/lignes...]"
    return "%s (lignes %d-%d sur %d)\n%s" % (chemin, debut, debut + len(extrait) - 1, len(toutes), texte)


def chercher(motif, extension=""):
    try:
        regex = re.compile(motif, re.IGNORECASE)
    except re.error as e:
        return "Motif invalide : %s" % e
    resultats = []
    for complet in fichiers_du_projet():
        if extension and not complet.lower().endswith(extension.lower()):
            continue
        relatif = os.path.relpath(complet, RACINE)
        try:
            with open(complet, encoding="utf-8", errors="replace") as f:
                for numero, ligne in enumerate(f, 1):
                    if regex.search(ligne):
                        resultats.append("%s:%d: %s" % (relatif, numero, ligne.strip()[:200]))
                        if len(resultats) >= MAX_RESULTATS:
                            return "\n".join(resultats) + "\n[...limite atteinte, affine le motif...]"
        except OSError:
            continue
    return "\n".join(resultats) if resultats else "Aucun resultat pour %s" % motif


# ── Modification ──

def ecrire(chemin, contenu):
    """Cree ou remplace entierement un fichier."""
    absolu = chemin_modifiable(chemin)
    existe = os.path.isfile(absolu)
    apercu = "%s (%d caracteres, %s)" % (chemin, len(contenu),
                                         "ecrase l'existant" if existe else "nouveau fichier")
    if not demande_accord("Ecrire " + chemin, apercu):
        return "Refuse par l'utilisateur."
    sauvegarde(absolu, chemin.replace("/", os.sep))
    os.makedirs(os.path.dirname(absolu), exist_ok=True)
    with open(absolu, "w", encoding="utf-8", newline="\n") as f:
        f.write(contenu)
    return "Ecrit : %s (%d caracteres)" % (chemin, len(contenu))


def remplacer(chemin, ancien, nouveau):
    """Remplace un extrait exact, qui doit apparaitre une seule fois."""
    absolu = chemin_modifiable(chemin)
    if not os.path.isfile(absolu):
        return "Fichier introuvable : %s" % chemin
    with open(absolu, encoding="utf-8") as f:
        contenu = f.read()
    occurrences = contenu.count(ancien)
    if occurrences == 0:
        return "Extrait introuvable dans %s. Relis le fichier : le texte doit etre exact." % chemin
    if occurrences > 1:
        return "Extrait present %d fois dans %s. Donne un extrait plus large." % (occurrences, chemin)
    apercu = "- %s\n+ %s" % (ancien.strip()[:200], nouveau.strip()[:200])
    if not demande_accord("Modifier " + chemin, apercu):
        return "Refuse par l'utilisateur."
    sauvegarde(absolu, chemin.replace("/", os.sep))
    with open(absolu, "w", encoding="utf-8", newline="\n") as f:
        f.write(contenu.replace(ancien, nouveau))
    return "Modifie : %s" % chemin


# ── Execution et verification ──

def _famille(commande):
    """Premier mot de la commande : un 'toujours' ne vaut que pour cet outil-la."""
    mots = commande.strip().split()
    return mots[0] if mots else "?"


def executer(commande):
    """Lance une commande et attend son resultat (sortie tronquee)."""
    if not demande_accord("Executer : %s ..." % _famille(commande), commande):
        return "Refuse par l'utilisateur."
    try:
        fini = subprocess.run(commande, shell=True, cwd=RACINE, timeout=DELAI_COMMANDE,
                              capture_output=True, text=True, errors="replace")
    except subprocess.TimeoutExpired:
        return "Delai depasse (%d s). Pour un serveur, utilise lancer_en_fond." % DELAI_COMMANDE
    sortie = (fini.stdout or "") + (fini.stderr or "")
    if len(sortie) > MAX_SORTIE:
        sortie = sortie[:MAX_SORTIE] + "\n[...tronque...]"
    return "code de retour %d\n%s" % (fini.returncode, sortie.strip() or "(aucune sortie)")


def lancer_en_fond(commande, nom="serveur"):
    """Demarre un processus qui reste en vie (serveur de test)."""
    if nom in PROCESSUS:
        return "Deja lance sous le nom '%s'. Arrete-le d'abord." % nom
    if not demande_accord("Lancer en arriere-plan : %s ..." % _famille(commande), commande):
        return "Refuse par l'utilisateur."
    PROCESSUS[nom] = subprocess.Popen(commande, shell=True, cwd=RACINE,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)  # laisse le serveur ouvrir son port
    return "Lance sous le nom '%s' (pid %d)." % (nom, PROCESSUS[nom].pid)


def arreter_en_fond(nom="serveur"):
    processus = PROCESSUS.pop(nom, None)
    if processus is None:
        return "Rien ne tourne sous le nom '%s'." % nom
    processus.terminate()
    return "Arrete : %s" % nom


def tout_arreter():
    for nom in list(PROCESSUS):
        arreter_en_fond(nom)


def ouvrir_url(url):
    """Recupere une page servie en local, pour verifier une modification."""
    if not any(("://%s" % hote) in url or ("://%s:" % hote) in url for hote in HOTES_LOCAUX):
        return "Adresse non locale : utilise lire_page pour le web."
    try:
        with urllib.request.urlopen(url, timeout=15) as reponse:
            corps = reponse.read().decode("utf-8", "replace")
            entete = "HTTP %d, %d caracteres" % (reponse.status, len(corps))
    except urllib.error.HTTPError as e:
        return "HTTP %d : %s" % (e.code, e.read().decode("utf-8", "replace")[:1000])
    except Exception as e:
        return "Echec : %s" % e
    if len(corps) > MAX_SORTIE:
        corps = corps[:MAX_SORTIE] + "\n[...tronque...]"
    return "%s\n%s" % (entete, corps)


# ── Web ──

def _telecharger(url):
    requete = urllib.request.Request(url, headers={
        "User-Agent": NAVIGATEUR,
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(requete, timeout=25) as reponse:
        brut = reponse.read()
    jeu = "utf-8"
    type_contenu = ""
    try:
        type_contenu = reponse.headers.get("Content-Type", "")
    except Exception:
        pass
    if "charset=" in type_contenu:
        jeu = type_contenu.split("charset=")[-1].split(";")[0].strip() or "utf-8"
    return brut.decode(jeu, "replace")


def _en_texte(page):
    """HTML vers texte lisible : on jette le decor, on garde le contenu."""
    page = re.sub(r"(?s)<!--.*?-->", " ", page)
    page = re.sub(r"(?is)<(script|style|noscript|svg|head|template)[^>]*>.*?</\1>", " ", page)
    page = re.sub(r"(?is)<(link|meta)\b[^>]*>", " ", page)
    page = re.sub(r"(?is)<(br|/p|/div|/li|/h[1-6]|/tr)\s*>", "\n", page)
    page = re.sub(r"(?s)<[^>]+>", " ", page)
    page = html.unescape(page)
    page = re.sub(r"[ \t\xa0]+", " ", page)
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", page).strip()


def _vraie_adresse(lien):
    """Les liens DuckDuckGo passent par une redirection : on en extrait la cible."""
    if "uddg=" in lien:
        cible = urllib.parse.parse_qs(urllib.parse.urlparse(lien).query).get("uddg")
        if cible:
            return cible[0]
    return "https:" + lien if lien.startswith("//") else lien


def chercher_web(requete, nombre=MAX_RESULTATS_WEB):
    """Recherche sur le web. Retourne titre, adresse et extrait pour chaque resultat."""
    encodee = urllib.parse.quote_plus(requete)
    for modele_url in (RECHERCHE_URL, RECHERCHE_SECOURS):
        try:
            page = _telecharger(modele_url % encodee)
        except Exception as e:
            erreur = str(e)
            continue
        erreur = ""
        liens = re.findall(r'(?is)<a[^>]+class="[^"]*result(?:__a|-link)[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', page)
        extraits = re.findall(r'(?is)<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', page)
        if not liens:  # version lite : simple tableau de liens
            liens = [(a, t) for a, t in re.findall(r'(?is)<a[^>]+href="(http[^"]+|//duckduckgo[^"]+)"[^>]*>(.*?)</a>', page)
                     if "duckduckgo.com/?" not in a][:nombre]
        resultats = []
        for i, (lien, titre) in enumerate(liens[:int(nombre)]):
            extrait = _en_texte(extraits[i]) if i < len(extraits) else ""
            resultats.append("%d. %s\n   %s\n   %s" % (
                i + 1, _en_texte(titre)[:160], _vraie_adresse(lien)[:200], extrait[:300]))
        if resultats:
            return "Resultats pour : %s\n\n%s" % (requete, "\n".join(resultats))
    return "Aucun resultat%s" % (" (%s)" % erreur if erreur else "")


def lire_page(url):
    """Recupere une page web et la rend en texte."""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        texte = _en_texte(_telecharger(url))
    except urllib.error.HTTPError as e:
        return "HTTP %d sur %s" % (e.code, url)
    except Exception as e:
        return "Echec sur %s : %s" % (url, e)
    if len(texte) > MAX_PAGE:
        texte = texte[:MAX_PAGE] + "\n[...page tronquee...]"
    return "%s\n\n%s" % (url, texte)


# ── Declaration pour le modele ──

OUTILS = {
    "lister": lister, "lire": lire, "chercher": chercher,
    "ecrire": ecrire, "remplacer": remplacer,
    "executer": executer, "lancer_en_fond": lancer_en_fond,
    "arreter_en_fond": arreter_en_fond, "ouvrir_url": ouvrir_url,
    "chercher_web": chercher_web, "lire_page": lire_page,
}


def _fonction(nom, description, proprietes, requis):
    return {"type": "function", "function": {
        "name": nom, "description": description,
        "parameters": {"type": "object", "properties": proprietes, "required": requis}}}


SPEC_OUTILS = [
    _fonction("lister", "Liste le contenu d'un dossier du projet ('.' pour la racine).",
              {"chemin": {"type": "string"}}, ["chemin"]),
    _fonction("chercher", "Cherche une expression reguliere dans tout le projet. Retourne fichier:ligne:contenu.",
              {"motif": {"type": "string"}, "extension": {"type": "string", "description": "filtre, ex '.js'"}},
              ["motif"]),
    _fonction("lire", "Lit un fichier avec numeros de ligne.",
              {"chemin": {"type": "string"}, "debut": {"type": "integer"}, "lignes": {"type": "integer"}},
              ["chemin"]),
    _fonction("remplacer", "Remplace un extrait exact dans un fichier. L'extrait doit etre unique. "
                           "A privilegier sur ecrire pour toute modification.",
              {"chemin": {"type": "string"}, "ancien": {"type": "string"}, "nouveau": {"type": "string"}},
              ["chemin", "ancien", "nouveau"]),
    _fonction("ecrire", "Cree un fichier ou remplace tout son contenu. Reserve aux nouveaux fichiers.",
              {"chemin": {"type": "string"}, "contenu": {"type": "string"}}, ["chemin", "contenu"]),
    _fonction("executer", "Lance une commande shell dans le projet et retourne sa sortie. "
                          "Pour verifier : python -c, python build.py, git diff, git status.",
              {"commande": {"type": "string"}}, ["commande"]),
    _fonction("lancer_en_fond", "Demarre un serveur qui reste en vie, ex 'python server.py'.",
              {"commande": {"type": "string"}, "nom": {"type": "string"}}, ["commande"]),
    _fonction("arreter_en_fond", "Arrete un processus lance en arriere-plan.",
              {"nom": {"type": "string"}}, []),
    _fonction("ouvrir_url", "Recupere une page locale (http://localhost:...) pour verifier le rendu.",
              {"url": {"type": "string"}}, ["url"]),
    _fonction("chercher_web", "Cherche sur le web. Utilise-le librement, autant de fois que tu veux, "
                              "des qu'une documentation, une norme, une API ou un ordre de grandeur "
                              "te manque. Retourne titre, adresse et extrait.",
              {"requete": {"type": "string"}, "nombre": {"type": "integer"}}, ["requete"]),
    _fonction("lire_page", "Ouvre une adresse web et retourne son texte. A enchainer apres chercher_web "
                           "pour lire vraiment la source au lieu de se fier a l'extrait.",
              {"url": {"type": "string"}}, ["url"]),
]
