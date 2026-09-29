"""Conversations persistantes : une conversation = un objectif + une memoire + un historique.

Un fichier JSON par conversation dans deepseek_conversations/.
La memoire est la liste des conclusions durables ; elle est reinjectee dans la
consigne systeme a chaque lancement, meme apres compactage de l'historique.
"""

import json
import os
import re
import time

from . import outils

DOSSIER = os.path.join(outils.RACINE, "deepseek_conversations")
MAX_MEMOIRE = 40           # conclusions durables gardees d'une tache a l'autre
SEUIL_COMPACTAGE = 200000  # caracteres d'historique avant compactage
TOURS_GARDES = 12          # derniers messages conserves lors d'un compactage
MAX_CARNET = 12            # lignes gardees pour "etabli" et "reste"
MAX_PLAN = 25              # etapes gardees, faites comprises : c est la trace du travail


def carnet_vide():
    """Etat de travail de la tache en cours : ce qui est su, ce qui reste, ce qui est prevu."""
    return {"etabli": [], "reste": [], "plan": [], "prochaine": ""}


def carnet(conversation):
    if not isinstance(conversation.get("carnet"), dict):
        conversation["carnet"] = carnet_vide()
    return conversation["carnet"]


def carnet_lisible(carnet_dict):
    lignes = []
    for rubrique, titre in (("etabli", "Etabli"), ("reste", "Reste a verifier")):
        for entree in carnet_dict.get(rubrique) or []:
            lignes.append("  [%s] %s" % (titre, entree))
    for etape in carnet_dict.get("plan") or []:
        if isinstance(etape, dict):
            marque = {"fait": "x", "en_cours": ">"}.get(etape.get("etat"), " ")
            lignes.append("  [%s] %s" % (marque, etape.get("etape", "")))
    if carnet_dict.get("prochaine"):
        lignes.append("  [->] %s" % carnet_dict["prochaine"])
    return "\n".join(lignes) or "  (carnet vide)"


def _slug(nom):
    slug = re.sub(r"[^a-z0-9]+", "_", nom.lower()).strip("_")
    return slug or "conversation"


def chemin_de(conversation):
    return os.path.join(DOSSIER, conversation["fichier"])


def creer(nom, objectif):
    os.makedirs(DOSSIER, exist_ok=True)
    fichier = _slug(nom) + ".json"
    if os.path.exists(os.path.join(DOSSIER, fichier)):
        fichier = "%s_%s.json" % (_slug(nom), time.strftime("%H%M%S"))
    conversation = {
        "fichier": fichier,
        "nom": nom,
        "objectif": objectif,
        "cree": time.strftime("%Y-%m-%d %H:%M"),
        "memoire": [],
        "carnet": carnet_vide(),
        "messages": [],
    }
    sauver(conversation)
    return conversation


def lister():
    """Conversations existantes, la plus recemment utilisee en premier."""
    if not os.path.isdir(DOSSIER):
        return []
    trouvees = []
    for nom in os.listdir(DOSSIER):
        if not nom.endswith(".json"):
            continue
        complet = os.path.join(DOSSIER, nom)
        try:
            with open(complet, encoding="utf-8") as f:
                conversation = json.load(f)
        except (OSError, ValueError):
            continue
        conversation["fichier"] = nom
        conversation["modifie"] = os.path.getmtime(complet)
        trouvees.append(conversation)
    return sorted(trouvees, key=lambda c: c["modifie"], reverse=True)


def charger(fichier):
    with open(os.path.join(DOSSIER, fichier), encoding="utf-8") as f:
        conversation = json.load(f)
    conversation["fichier"] = fichier
    return conversation


def sauver(conversation):
    os.makedirs(DOSSIER, exist_ok=True)
    a_ecrire = {c: v for c, v in conversation.items() if c != "modifie"}
    with open(chemin_de(conversation), "w", encoding="utf-8") as f:
        json.dump(a_ecrire, f, ensure_ascii=False, indent=1)


def noter(conversation, texte):
    """Ajoute une conclusion durable, sans doublon."""
    texte = texte.strip()
    if texte and texte not in conversation["memoire"]:
        conversation["memoire"].append(texte)
        del conversation["memoire"][:-MAX_MEMOIRE]


def assainir(conversation):
    """Retire un appel d'outil reste sans reponse (interruption en plein travail).

    L'API refuse un historique ou un tool_calls n'a pas toutes ses reponses.
    """
    messages = conversation["messages"]
    while messages:
        dernier_appel = None
        for i, message in enumerate(messages):
            if message.get("role") == "assistant" and message.get("tool_calls"):
                dernier_appel = i
        if dernier_appel is None:
            return 0
        attendus = {a["id"] for a in messages[dernier_appel]["tool_calls"]}
        recus = {m.get("tool_call_id") for m in messages[dernier_appel + 1:]}
        if attendus <= recus:
            return 0
        retires = len(messages) - dernier_appel
        del messages[dernier_appel:]
        return retires
    return 0


def taille(conversation):
    return len(json.dumps(conversation["messages"]))


def doit_compacter(conversation):
    return taille(conversation) > SEUIL_COMPACTAGE


def coupe_propre(messages, garder):
    """Indice de coupe ne laissant aucun message 'tool' orphelin.

    Un 'tool' repond a un 'tool_calls' qui le precede : couper juste avant lui ferait
    echouer l'API. Tout autre role est un debut valide.
    """
    depart = max(1, len(messages) - garder)
    for i in range(depart, len(messages)):
        if messages[i].get("role") != "tool":
            return i
    return len(messages)


def compacter(conversation, resume):
    """Remplace le vieil historique par un resume verse dans la memoire."""
    messages = conversation["messages"]
    indice = coupe_propre(messages, TOURS_GARDES)
    if indice <= 1:
        return 0
    for ligne in resume.splitlines():
        noter(conversation, ligne.strip(" -*\t"))
    # La consigne systeme porte l'objectif et la memoire : elle survit au compactage.
    tete = messages[:1] if messages[0].get("role") == "system" else []
    reprise = [{"role": "user", "content":
                "Reprise apres compactage de l'historique. Ce que tu avais etabli avant est "
                "resume dans ta consigne systeme ; la suite ci-dessous est l'historique recent."}]
    conversation["messages"] = tete + reprise + messages[indice:]
    return indice - len(tete)
