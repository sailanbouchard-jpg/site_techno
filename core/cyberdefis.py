"""
core/cyberdefis.py
------------------
LE SEUL FICHIER À ÉDITER pour ajouter un défi, changer un flag, un indice ou une
leçon. Le front-end (dossier cyberdefis/) n'en connaît rien : il lit les titres
via /api/defi/catalogue et les réponses via /api/defi/verifier.

POURQUOI LE FLAG EST ICI, ET EN CLAIR
  Le flag ne doit jamais partir dans la page livrée au navigateur : le premier
  élève qui ouvre le code source aurait sinon toutes les réponses. Ici le flag ne
  quitte jamais le serveur ; seule la comparaison s'y fait. Il est écrit en clair
  parce que c'est le corrigé : le professeur doit pouvoir le lire et le modifier
  sans outil.

AJOUTER UN DÉFI
  1. Ajouter une entrée dans DEFIS (l'ordre du dict fixe l'ordre d'affichage).
  2. Créer la page à l'URL indiquée, dans cyberdefis/<categorie>/.
  3. Rien d'autre : l'accueil du module et la page de catégorie se remplissent
     depuis ce fichier.
"""

import re
import unicodedata

# ─────────────────────────────────────────────────────────────
# CATÉGORIES  (l'ordre du dict fixe l'ordre d'affichage)
# ─────────────────────────────────────────────────────────────

CATEGORIES = {
    "web": {
        "titre":  "Sous le capot du Web",
        "url":    "/cyberdefis/web/",
        "resume": "Une page web est un document reçu par ton ordinateur. "
                  "Ce que cela implique, un défi après l'autre.",
    },
    "reseaux": {
        "titre":  "Réseaux informatiques",
        "url":    "/cyberdefis/reseaux/",
        "resume": "Les adresses qui identifient les machines, et ce qu'on peut "
                  "lire d'un réseau local.",
    },
    "crypto": {
        "titre":  "Codes secrets",
        "url":    "/cyberdefis/crypto/",
        "resume": "Coder, décoder, chiffrer : des méthodes anciennes aux notions "
                  "qui protègent aujourd'hui les communications.",
    },
    "fichiers": {
        "titre":  "Manipulation de fichiers",
        "url":    "/cyberdefis/fichiers/",
        "resume": "Renommer, ouvrir autrement, décompresser : ce qu'un fichier "
                  "contient ne se limite pas à ce qu'il montre.",
    },
}

# ─────────────────────────────────────────────────────────────
# LES DÉFIS
# ─────────────────────────────────────────────────────────────

DEFIS = {

    # ── Web ──────────────────────────────────────────────────

    "w1": {
        "categorie": "web",
        "titre":     "La face cachée des pages web",
        "resume":    "Le flag est dans la page, mais l'affichage ne le montre pas.",
        "url":       "/cyberdefis/web/w1-code-source.html",
        "flag":      "FLAG{CODE_SOURCE}",
        "indices": [
            "On peut cacher plein de choses dans le code source d'une page…",
        ],
        "lecon":
            "Une page web est un document envoyé à ton ordinateur, que le navigateur "
            "met ensuite en forme. Son code source contient parfois davantage que ce "
            "qui s'affiche : commentaires, éléments masqués, textes préparés à l'avance. "
            "Une information confidentielle n'a donc pas sa place dans une page — elle "
            "resterait lisible à qui en ouvre le code.",
    },

    "w2": {
        "categorie": "web",
        "titre":     "Fouiller les dossiers d'un site web",
        "resume":    "Un fichier mal rangé dans le même dossier que cette page, "
                     "à retrouver par son adresse.",
        "url":       "/cyberdefis/web/w2-dossiers.html",
        "flag":      "FLAG{6ix7even}",
        "indices": [
            "En regardant l'URL d'une page web, on voit dans quel dossier du site on se "
            "trouve. En modifiant cette URL, on peut tomber sur des fichiers cachés…",
        ],
        "lecon":
            "Une page à laquelle aucun lien ne mène reste accessible à qui connaît son "
            "adresse, et un fichier rangé à côté se devine parfois. « Discret » n'est pas "
            "« protégé » : seule une vérification sur le serveur protège réellement un "
            "fichier. En déposer un sensible dans un dossier public est une faute courante.",
    },

    "w3": {
        "categorie": "web",
        "titre":     "La page cachée",
        "resume":    "Deux versions de la page existent : une en français, une en anglais.",
        "url":       "/cyberdefis/web/w3-page-cachee.html?lgue=fr",
        "flag":      "FLAG{IN_ENGLISH_PLEASE}",
        "indices": [],
        "lecon":
            "L'adresse d'une page peut contenir des paramètres — ici la langue, après le "
            "point d'interrogation. Les modifier demande au serveur une autre version de "
            "la page. Savoir lire et changer une URL fait partie des gestes de base pour "
            "explorer un site et comprendre ce qu'il attend.",
    },

    "w4": {
        "categorie": "web",
        "titre":     "Le bouton grisé",
        "resume":    "Un profil « administrateur » proposé en grisé. Le débloquer donne l'accès.",
        "url":       "/cyberdefis/web/w4-bouton-grise.html",
        "flag":      "FLAG{ADMIN}",
        "indices": [
            "Avec Clic droit → Inspecter, on peut modifier le code source d'une page. "
            "Comment cela pourrait-il être utile ?",
        ],
        "lecon":
            "Une fois la page reçue, son code se trouve sur ton ordinateur et tu peux le "
            "modifier. Les attributs comme disabled ne font qu'ajuster l'affichage ; les "
            "retirer ne franchit aucune barrière réelle. La seule vérification qui compte "
            "est celle du serveur — ici, c'est lui qui a accepté l'accès, une faute de "
            "conception que le défi met volontairement en scène.",
    },

    "w5": {
        "categorie": "web",
        "titre":     "Voulez-vous des cookies ?",
        "resume":    "En arrivant, ton navigateur a enregistré un cookie. Le flag est dedans.",
        "url":       "/cyberdefis/web/w5-cookies.html",
        "flag":      "FLAG{J'<3_LES_DEFIS}",
        "indices": [
            "Avec Clic droit → Inspecter, on peut vraiment trouver plein de choses utiles !",
        ],
        "lecon":
            "Un cookie est un court texte que le site fait enregistrer par ton navigateur "
            "pour te reconnaître d'une visite à l'autre : un identifiant, un nombre de "
            "visites, une langue préférée… Il est stocké sur ton ordinateur, donc tout ce "
            "qu'un site y inscrit en clair, tu peux le lire. Les sites sérieux n'y placent "
            "qu'un identifiant illisible et gardent le reste sur le serveur.",
    },

    "w6": {
        "categorie": "web",
        "titre":     "Reprenez donc des cookies !",
        "resume":    "Un mini-jeu : atteindre 999 999 sans recharger la page un million de fois.",
        "url":       "/cyberdefis/web/w6-mini-jeu.html",
        "flag":      "FLAG{VICTOIRE}",
        "indices": [
            "Je vais quand même pas recharger la page 999 999 fois, si ?",
        ],
        "lecon":
            "Le score est gardé dans un cookie, sur ta machine — donc modifiable. Un jeu, "
            "un site ou une note qui accordent leur confiance à une valeur stockée chez "
            "toi peuvent être trompés en la changeant. Ce qui doit vraiment compter se "
            "calcule et se vérifie sur le serveur, jamais dans le navigateur du visiteur.",
    },

    # ── Réseaux ──────────────────────────────────────────────

    "r1": {
        "categorie": "reseaux",
        "titre":     "Le bon réseau",
        "resume":    "Cinq machines du collège. Une seule est sur le même réseau local que ton poste.",
        "url":       "/cyberdefis/reseaux/r1-reseau.html",
        "flag":      "FLAG{POSTE-B12}",
        "indices": [
            "Avec le masque 255.255.255.0, les trois premiers nombres d'une adresse "
            "désignent le réseau ; le quatrième désigne la machine.",
        ],
        "lecon":
            "Une adresse IP ne prend son sens qu'avec son masque : c'est lui qui sépare la "
            "partie « réseau » de la partie « machine ». Deux machines du même réseau local "
            "échangent directement, par le commutateur ; pour toute autre destination, les "
            "données passent par le routeur. C'est la distinction entre ce qui est « chez "
            "soi » et ce qui sort vers Internet.",
    },

    "r2": {
        "categorie": "reseaux",
        "titre":     "Qui a branché son appareil au CDI ?",
        "resume":    "Quatre appareils branchés au CDI, un seul absent de l'inventaire.",
        "url":       "/cyberdefis/reseaux/r2-appareil-cdi.html",
        "flag":      "FLAG{SAMSUNG}",
        "indices": [
            "L'adresse MAC d'une machine, c'est un peu comme son nom. En lisant une adresse "
            "MAC, on peut y trouver le nom du constructeur…",
        ],
        "lecon":
            "L'adresse MAC est inscrite dans la carte réseau à la fabrication ; ses trois "
            "premiers octets sont attribués à un fabricant, et ces attributions sont "
            "publiques. On peut donc retrouver la marque d'un appareil sans y avoir accès. "
            "C'est ainsi qu'un administrateur repère ce qui est réellement connecté à son "
            "réseau — et remarque un appareil qui n'a rien à y faire.",
    },

    # ── Codes secrets ────────────────────────────────────────

    "c1": {
        "categorie": "crypto",
        "titre":     "Le chiffrement de César",
        "resume":    "Un message chiffré par décalage des lettres, comme au temps de César.",
        "url":       "/cyberdefis/crypto/c1-cesar.html",
        "flag":      "FLAG{DECALAGE}",
        "indices": [],
        "lecon":
            "Le chiffre de César remplace chaque lettre par celle située un nombre fixe de "
            "positions plus loin dans l'alphabet ; ce nombre est la clé. Vingt-cinq "
            "décalages seulement sont possibles, et il suffit de les essayer pour retrouver "
            "le message. Une méthode aussi simple ne protège rien de sérieux, mais elle "
            "introduit l'idée de clé, au cœur de tout chiffrement.",
    },

    "c2": {
        "categorie": "crypto",
        "titre":     "Le binaire",
        "resume":    "Un espace de connexion qui ne comprend que le binaire.",
        "url":       "/cyberdefis/crypto/c2-binaire.html",
        "flag":      "FLAG{10110010}",
        "indices": [
            "Cet espace de connexion ne comprend que le binaire.",
        ],
        "lecon":
            "Dans une machine, tout est représenté par des nombres, y compris le texte : "
            "chaque caractère correspond à un octet — huit chiffres binaires — selon une "
            "table commune. Traduire du binaire en lettres n'est qu'un changement "
            "d'écriture, pas un déchiffrement. Encoder et chiffrer sont deux opérations "
            "différentes : la première rend lisible par une machine, la seconde protège.",
    },

    "c3": {
        "categorie": "crypto",
        "titre":     "Le base64",
        "resume":    "Un message encodé en base64, à retraduire en clair.",
        "url":       "/cyberdefis/crypto/c3-base64.html",
        "flag":      "FLAG{TRADUIT}",
        "indices": [
            "Beaucoup de sites savent décoder le base64. À toi d'en trouver un.",
        ],
        "lecon":
            "Le base64 sert à transporter des données à travers des systèmes qui "
            "n'acceptent que du texte ordinaire : une image jointe à un courriel, par "
            "exemple, y est convertie. Ce n'est en aucun cas une protection — le décodage "
            "est immédiat et sans clé. Confondre du base64 avec un contenu chiffré est une "
            "erreur fréquente.",
    },

    # ── Manipulation de fichiers ─────────────────────────────

    "f1": {
        "categorie": "fichiers",
        "titre":     "Changer l'extension d'un fichier",
        "resume":    "Un fichier en .jpg qui ne s'ouvre pas comme une image.",
        "url":       "/cyberdefis/fichiers/f1-extension.html",
        "flag":      "FLAG{FICHIERTXT}",
        "indices": [
            "Dans l'Explorateur de fichiers de Windows, va dans Affichage → Afficher (ou "
            "options d'affichage) et coche « Extensions de noms de fichiers ».",
        ],
        "lecon":
            "L'extension d'un fichier est une étiquette qui indique aux logiciels comment "
            "l'ouvrir ; elle ne détermine pas son contenu. Renommer un fichier ne "
            "transforme pas ce qu'il contient. C'est le principe d'un piège courant : une "
            "pièce jointe nommée « photo.jpg » peut être tout autre chose, et son extension "
            "réelle est ce qu'il faut vérifier avant de l'ouvrir.",
    },

    "f2": {
        "categorie": "fichiers",
        "titre":     "Le texte invisible",
        "resume":    "Ce document paraît vide. Il contient pourtant un texte.",
        "url":       "/cyberdefis/fichiers/f2-texte-invisible.html",
        "flag":      "FLAG{blanc-sur-blanc}",
        "indices": [
            "Le raccourci Ctrl+A sélectionne tout le contenu d'un document.",
            "Une fois le texte sélectionné, la surbrillance le fait apparaître : il était "
            "écrit en blanc sur fond blanc.",
        ],
        "lecon":
            "Ce qui est invisible à l'écran n'est pas absent du fichier. Un texte écrit "
            "dans la même couleur que le fond, ou placé hors de la zone visible, reste "
            "présent dans le document et voyage avec lui. Masquer une information par "
            "l'apparence ne l'efface pas.",
    },

    "f3": {
        "categorie": "fichiers",
        "titre":     "Les informations cachées d'une image",
        "resume":    "Une image contient, en plus de l'image, des informations sur sa création.",
        "url":       "/cyberdefis/fichiers/f3-metadonnees.html",
        "flag":      "FLAG{metadonnees}",
        "indices": [
            "Télécharge l'image, puis dépose-la dans le lecteur de métadonnées de la page.",
            "Le lecteur affiche plusieurs champs : appareil, date, lieu, et une "
            "description. Le flag est dans la description.",
        ],
        "lecon":
            "Une image enregistre souvent, à côté de l'image elle-même, des informations "
            "sur sa création : l'appareil utilisé, la date, parfois le lieu précis. Ces "
            "métadonnées voyagent avec le fichier lorsqu'on le partage. Retirer les "
            "métadonnées d'une photo avant de la publier évite de révéler, sans y penser, "
            "où et quand elle a été prise.",
    },

    "f4": {
        "categorie": "fichiers",
        "titre":     "Les archives imbriquées",
        "resume":    "Une archive contient une archive, qui contient une archive. "
                     "Il faut aller au bout.",
        "url":       "/cyberdefis/fichiers/f4-archives.html",
        "flag":      "FLAG{tout-au-fond}",
        "indices": [
            "Décompresser une archive .zip se fait par un clic droit, puis « Extraire tout ».",
            "Chaque archive extraite en contient une autre. Recommence jusqu'au fichier "
            "texte final.",
        ],
        "lecon":
            "Une archive regroupe et compresse des fichiers, et rien n'empêche qu'elle en "
            "contienne d'autres. Atteindre le contenu demande de répéter la même opération "
            "avec méthode. C'est aussi pourquoi un fichier compressé reçu doit être ouvert "
            "avec prudence : son apparence ne dit rien de ce qu'il renferme.",
    },

    "f5": {
        "categorie": "fichiers",
        "titre":     "Le message ajouté",
        "resume":    "Cette image s'affiche normalement. Un texte a pourtant été ajouté "
                     "à la fin du fichier.",
        "url":       "/cyberdefis/fichiers/f5-message-ajoute.html",
        "flag":      "FLAG{a-la-fin-du-fichier}",
        "indices": [
            "Un fichier image peut aussi s'ouvrir avec un éditeur de texte : clic droit, "
            "« Ouvrir avec », puis le Bloc-notes.",
            "Le début du fichier est illisible, c'est l'image. Fais défiler jusqu'en bas : "
            "un passage lisible y a été ajouté.",
        ],
        "lecon":
            "Un même fichier peut se lire de plusieurs manières : comme une image par une "
            "visionneuse, comme du texte par un éditeur. On peut ainsi ajouter des données "
            "après la fin de l'image, sans empêcher son affichage. Un fichier présenté "
            "comme une simple image ne transporte pas toujours que l'image.",
    },
}


# ─────────────────────────────────────────────────────────────
# COMPARAISON DES RÉPONSES
# ─────────────────────────────────────────────────────────────
#
# Un élève ne doit pas échouer sur une majuscule, un accent, un tiret ou un
# espace. On compare des formes normalisées, et « FLAG{POSTE-B12} » comme
# « poste b12 » sont acceptés.

_ENTRE_ACCOLADES = re.compile(r"\{(.*)\}", re.S)


def _noyau(texte: str) -> str:
    """Contenu des accolades s'il y en a, sinon le texte entier."""
    trouve = _ENTRE_ACCOLADES.search(texte)
    return trouve.group(1) if trouve else texte


def _normaliser(texte: str) -> str:
    """Minuscules, sans accents, sans ponctuation ni espaces."""
    decompose = unicodedata.normalize("NFD", texte)
    sans_accents = "".join(c for c in decompose if unicodedata.category(c) != "Mn")
    return "".join(c for c in sans_accents.lower() if c.isalnum())


def flag_correct(defi_id: str, proposition: str) -> bool:
    defi = DEFIS.get(defi_id)
    if defi is None:
        return False
    return _normaliser(_noyau(proposition)) == _normaliser(_noyau(defi["flag"]))


def indice(defi_id: str, numero: int) -> str | None:
    """Indice n°`numero` (à partir de 1), ou None s'il n'y en a plus."""
    defi = DEFIS.get(defi_id)
    if defi is None or not 1 <= numero <= len(defi["indices"]):
        return None
    return defi["indices"][numero - 1]


def lecon(defi_id: str) -> str:
    """Le texte « Ce que tu viens de faire », affiché après résolution."""
    return DEFIS[defi_id]["lecon"]


# ─────────────────────────────────────────────────────────────
# CATALOGUE PUBLIC (tout sauf les flags, les indices et les leçons)
# ─────────────────────────────────────────────────────────────

def catalogue_public() -> dict:
    """
    Ce que le front-end a le droit de connaître avant résolution.
    Les catégories sont une LISTE ordonnée (ordre de CATEGORIES), pour que
    l'affichage suive l'ordre voulu même si jsonify trie les clés.
    """
    return {
        "categories": [
            {
                "cle":    nom,
                "titre":  infos["titre"],
                "url":    infos["url"],
                "resume": infos["resume"],
                "defis": [
                    {
                        "id":         defi_id,
                        "titre":      defi["titre"],
                        "resume":     defi["resume"],
                        "url":        defi["url"],
                        "nb_indices": len(defi["indices"]),
                    }
                    for defi_id, defi in DEFIS.items()
                    if defi["categorie"] == nom
                ],
            }
            for nom, infos in CATEGORIES.items()
        ],
    }
