"""ds — agent DeepSeek pour ce projet.

    ds                 choisir ou creer une conversation
    ds <numero>        ouvrir directement la conversation n de la liste
    ds --auto          n'autorise plus chaque ecriture une par une

Dans une conversation, l'intensite de reflexion est le premier caractere du message :
    1 corrige la faute de frappe dans la navbar
    2 le panneau de calibration deborde en 1280px, trouve pourquoi et repare
    3 revois toute la gestion des surplombs, elle me parait incoherente
Sans chiffre, l'intensite 2 s'applique.
"""

import os
import re
import sys

from assistant import conversations, moteur, outils

FICHIER_CLE = os.path.join(outils.RACINE, "deepseek_key.txt")

COMMANDES = """
  /carnet     le plan de la tache en cours : fait, a faire, prochaine action
  /memoire    ce que la conversation a retenu
  /oubli N    retire la note numero N
  /objectif   revoir ou changer l'objectif
  /auto       basculer l'autorisation automatique des ecritures
  /liste      revenir au choix des conversations
  /quit       sortir
"""


def charge_cle():
    cle = os.environ.get("DEEPSEEK_KEY", "").strip()
    if cle:
        return cle
    if os.path.exists(FICHIER_CLE):
        with open(FICHIER_CLE, encoding="utf-8") as f:
            return f.read().strip()
    sys.exit("Cle absente : cree deepseek_key.txt ou definis DEEPSEEK_KEY.")


def saisir(invite):
    try:
        return input(invite).lstrip("﻿").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return "/quit"


# ── Choix de la conversation ──

def nouvelle():
    nom = saisir("  Nom court : ")
    if not nom or nom == "/quit":
        return None
    objectif = saisir("  Objectif (ce sur quoi elle travaillera toujours) : ")
    if objectif == "/quit":
        return None
    conversation = conversations.creer(nom, objectif or nom)
    print("  Creee.\n")
    return conversation


def choisir(numero=None):
    existantes = conversations.lister()
    if numero is not None:
        if 1 <= numero <= len(existantes):
            return conversations.charger(existantes[numero - 1]["fichier"])
        print("Pas de conversation numero %d." % numero)
        return None
    print("\nConversations")
    for i, c in enumerate(existantes, 1):
        print("  %d. %-24s %s" % (i, c["nom"][:24], c["objectif"][:60]))
    if not existantes:
        print("  (aucune)")
    print("  n. nouvelle conversation\n")
    choix = saisir("Choix : ")
    if choix == "/quit":
        return None
    if choix.lower().startswith("n"):
        return nouvelle()
    if choix.isdigit():
        return choisir(int(choix))
    return None


# ── Boucle de travail ──

def intensite_et_demande(entree):
    """Le premier caractere vaut intensite s'il est 1, 2 ou 3."""
    if entree[:1] in ("1", "2", "3") and entree[1:2] in ("", " ", ":"):
        return int(entree[0]), entree[1:].lstrip(": ").strip()
    return 2, entree


def developper_fichiers(demande):
    """Remplace chaque @chemin par le contenu du fichier : pour les consignes longues."""
    def remplace(trouve):
        chemin = trouve.group(1)
        try:
            with open(os.path.join(outils.RACINE, chemin), encoding="utf-8") as f:
                return "\n--- consigne, %s ---\n%s\n--- fin de la consigne ---\n" % (chemin, f.read())
        except OSError as e:
            return "(%s illisible : %s)" % (chemin, e)
    return re.sub(r"@([\w./\\-]+)", remplace, demande)


def montrer_memoire(conversation):
    if not conversation["memoire"]:
        print("  (memoire vide)")
    for i, note in enumerate(conversation["memoire"], 1):
        print("  %2d. %s" % (i, note))


def commande(entree, conversation):
    """Retourne 'continue', 'liste' ou 'quit' si l'entree est une commande, sinon None."""
    if entree in ("/quit", "/exit", "/q"):
        return "quit"
    if entree == "/liste":
        return "liste"
    if entree == "/aide":
        print(COMMANDES)
        return "continue"
    if entree == "/carnet":
        print(conversations.carnet_lisible(conversations.carnet(conversation)))
        return "continue"
    if entree == "/memoire":
        montrer_memoire(conversation)
        return "continue"
    if entree.startswith("/oubli "):
        numero = entree.split()[-1]
        if numero.isdigit() and 1 <= int(numero) <= len(conversation["memoire"]):
            oubliee = conversation["memoire"].pop(int(numero) - 1)
            conversations.sauver(conversation)
            print("  Retiree : %s" % oubliee[:80])
        return "continue"
    if entree == "/objectif":
        print("  Actuel : %s" % conversation["objectif"])
        nouveau = saisir("  Nouveau (vide = garder) : ")
        if nouveau and nouveau != "/quit":
            conversation["objectif"] = nouveau
            conversations.sauver(conversation)
        return "continue"
    if entree == "/auto":
        outils.AUTO["actif"] = not outils.AUTO["actif"]
        print("  Autorisation automatique : %s" % ("ACTIVE" if outils.AUTO["actif"] else "desactivee"))
        return "continue"
    return None


def travailler(conversation, cle):
    print("\n=== %s ===\n%s" % (conversation["nom"], conversation["objectif"]))
    print("%d notes en memoire, %d messages. /aide pour les commandes.\n"
          % (len(conversation["memoire"]), len(conversation["messages"])))
    while True:
        entree = saisir("\n> ")
        if not entree:
            continue
        suite = commande(entree, conversation)
        if suite == "quit":
            return "quit"
        if suite == "liste":
            return "liste"
        if suite == "continue":
            continue
        intensite, demande = intensite_et_demande(entree)
        if not demande:
            continue
        demande = developper_fichiers(demande)
        print("[intensite %d]\n" % intensite)
        try:
            moteur.traiter(conversation, demande, intensite, cle)
        except KeyboardInterrupt:
            conversations.assainir(conversation)
            conversations.sauver(conversation)
            print("\n\n[interrompu — travail en cours abandonne, historique conserve]")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    arguments = [a for a in sys.argv[1:] if a != "--auto"]
    outils.AUTO["actif"] = "--auto" in sys.argv[1:]
    cle = charge_cle()

    conversation = choisir(int(arguments[0])) if arguments and arguments[0].isdigit() else choisir()
    try:
        while conversation is not None:
            if travailler(conversation, cle) == "quit":
                break
            conversation = choisir()
    finally:
        outils.tout_arreter()


if __name__ == "__main__":
    main()
