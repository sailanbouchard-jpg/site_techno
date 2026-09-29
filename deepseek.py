"""Client DeepSeek en ligne de commande (via la passerelle Token Harbor).

Autonome : stdlib uniquement, aucun lien avec le serveur Flask du site.

Usage :
    python deepseek.py "ta question"      # reponse unique
    python deepseek.py                    # mode conversation
    python deepseek.py -f server.py "explique ce fichier"
    python deepseek.py -a "explore le projet et explique X"   # mode observateur
    python deepseek.py -m deepseek-v4-pro "question"

Le mode observateur (-a) donne au modele trois outils EN LECTURE SEULE
(lister, lire, chercher) pour qu'il explore le projet lui-meme.
Aucun outil n'ecrit, ne modifie ni ne supprime quoi que ce soit.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

# ── Configuration ──
API_URL = "https://tokenharbor.ai/v1/chat/completions"
RACINE = os.path.dirname(os.path.abspath(__file__))
FICHIER_CLE = os.path.join(RACINE, "deepseek_key.txt")
FICHIER_SESSION = os.path.join(RACINE, "deepseek_session.json")
MODELE_DEFAUT = "deepseek-v4.1-flash:free"

SYSTEME = (
    "Tu es un assistant de programmation. Reponds en francais, de maniere concise. "
    "Donne le code directement, sans preambule inutile."
)
SYSTEME_OBSERVATEUR = (
    "You are a senior code reviewer inspecting a real project. Explore it yourself with the "
    "read-only tools before answering: start with lister('.'), then chercher() to locate the "
    "relevant area, then lire() the files that matter. Never guess a path or invent file "
    "contents: if you have not read it, say so. You are an observer only - you cannot and must "
    "not write, modify or create anything. Do not output code blocks or patches; describe issues "
    "and improvements in prose. Always answer the user in FRENCH, even though these instructions "
    "are in English. Cite the files and line numbers you actually read."
)

# ── Exploration : limites ──
DOSSIERS_IGNORES = {"site", "__pycache__", ".git", ".venv", "venv", "uploads", "node_modules", ".claude"}
EXTENSIONS_LISIBLES = {".py", ".js", ".html", ".css", ".md", ".json", ".palette", ".txt", ".cmd", ".csv"}
MAX_CARACTERES = 40000   # par lecture de fichier
MAX_RESULTATS = 60       # par recherche
MAX_TOURS = 30           # garde-fou contre une boucle d'outils infinie

# Commandes du mode conversation
CMD_QUITTER = ("/quit", "/exit", "/q")
CMD_RESET = "/reset"
CMD_FICHIER = "/fichier"


def charge_cle():
    """La cle vient de la variable DEEPSEEK_KEY, sinon du fichier deepseek_key.txt."""
    cle = os.environ.get("DEEPSEEK_KEY", "").strip()
    if cle:
        return cle
    if os.path.exists(FICHIER_CLE):
        with open(FICHIER_CLE, encoding="utf-8") as f:
            return f.read().strip()
    sys.exit("Cle absente : cree deepseek_key.txt ou definis DEEPSEEK_KEY.")


# ── Outils de lecture seule ──

def chemin_sur(chemin):
    """Empeche toute sortie du dossier du projet."""
    absolu = os.path.abspath(os.path.join(RACINE, chemin))
    if absolu != RACINE and not absolu.startswith(RACINE + os.sep):
        raise ValueError("Chemin hors du projet : %s" % chemin)
    return absolu


def fichiers_du_projet():
    for dossier, sous_dossiers, fichiers in os.walk(RACINE):
        sous_dossiers[:] = [d for d in sous_dossiers if d not in DOSSIERS_IGNORES]
        for nom in fichiers:
            if os.path.splitext(nom)[1].lower() in EXTENSIONS_LISIBLES:
                yield os.path.join(dossier, nom)


def outil_lister(chemin="."):
    """Contenu d'un dossier : sous-dossiers puis fichiers avec leur taille."""
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
    contenu = "\n".join("  " + e for e in dossiers + fichiers) or "  (vide)"
    return "%s\n%s" % (chemin, contenu)


def outil_lire(chemin, debut=1, lignes=600):
    """Lit un fichier texte, numerote les lignes."""
    absolu = chemin_sur(chemin)
    if not os.path.isfile(absolu):
        return "Fichier introuvable : %s" % chemin
    with open(absolu, encoding="utf-8", errors="replace") as f:
        toutes = f.readlines()
    debut = max(1, int(debut))
    extrait = toutes[debut - 1:debut - 1 + int(lignes)]
    texte = "".join("%5d| %s" % (debut + i, l) for i, l in enumerate(extrait))
    if len(texte) > MAX_CARACTERES:
        texte = texte[:MAX_CARACTERES] + "\n[...tronque...]"
    fin = debut + len(extrait) - 1
    return "%s (lignes %d-%d sur %d)\n%s" % (chemin, debut, fin, len(toutes), texte)


def outil_chercher(motif, extension=""):
    """Cherche une expression reguliere dans les fichiers texte du projet."""
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
                            return "\n".join(resultats) + "\n[...limite atteinte...]"
        except OSError:
            continue
    return "\n".join(resultats) if resultats else "Aucun resultat pour %s" % motif


OUTILS = {"lister": outil_lister, "lire": outil_lire, "chercher": outil_chercher}

SPEC_OUTILS = [
    {"type": "function", "function": {
        "name": "lister",
        "description": "Liste le contenu d'un dossier du projet. Commence par '.' pour la racine.",
        "parameters": {"type": "object", "properties": {
            "chemin": {"type": "string", "description": "Chemin relatif du dossier, ex '.' ou 'core/blocks'"}},
            "required": ["chemin"]}}},
    {"type": "function", "function": {
        "name": "lire",
        "description": "Lit un fichier texte du projet avec numeros de ligne.",
        "parameters": {"type": "object", "properties": {
            "chemin": {"type": "string", "description": "Chemin relatif du fichier"},
            "debut": {"type": "integer", "description": "Premiere ligne a lire (defaut 1)"},
            "lignes": {"type": "integer", "description": "Nombre de lignes (defaut 600)"}},
            "required": ["chemin"]}}},
    {"type": "function", "function": {
        "name": "chercher",
        "description": "Cherche une expression reguliere dans tout le projet. Retourne fichier:ligne:contenu.",
        "parameters": {"type": "object", "properties": {
            "motif": {"type": "string", "description": "Expression reguliere"},
            "extension": {"type": "string", "description": "Filtre optionnel, ex '.py'"}},
            "required": ["motif"]}}},
]


# ── Appels API ──

def appel_api(charge, cle):
    requete = urllib.request.Request(
        API_URL,
        data=json.dumps(charge).encode("utf-8"),
        headers={"Authorization": "Bearer " + cle, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(requete) as reponse:
        return reponse.read().decode("utf-8")


def demande(messages, modele, cle):
    """Envoie la conversation et affiche la reponse au fil de l'eau. Retourne le texte complet."""
    corps = json.dumps({"model": modele, "messages": messages, "stream": True}).encode("utf-8")
    requete = urllib.request.Request(
        API_URL,
        data=corps,
        headers={"Authorization": "Bearer " + cle, "Content-Type": "application/json"},
    )
    morceaux = []
    try:
        with urllib.request.urlopen(requete) as reponse:
            for ligne in reponse:
                ligne = ligne.decode("utf-8").strip()
                if not ligne.startswith("data: "):
                    continue
                donnees = ligne[6:]
                if donnees == "[DONE]":
                    break
                choix = json.loads(donnees).get("choices") or []
                if not choix:  # dernier evenement : usage seul, pas de contenu
                    continue
                texte = choix[0].get("delta", {}).get("content")
                if texte:
                    morceaux.append(texte)
                    print(texte, end="", flush=True)
    except urllib.error.HTTPError as e:
        print("\nErreur API (%s) : %s" % (e.code, e.read().decode("utf-8", "replace")))
        return ""
    print()
    return "".join(morceaux)


def observateur(messages, modele, cle):
    """Boucle outils : le modele explore le projet lui-meme, puis repond."""
    for _ in range(MAX_TOURS):
        try:
            brut = appel_api({"model": modele, "messages": messages, "tools": SPEC_OUTILS}, cle)
        except urllib.error.HTTPError as e:
            print("\nErreur API (%s) : %s" % (e.code, e.read().decode("utf-8", "replace")))
            return
        message = json.loads(brut)["choices"][0]["message"]
        appels = message.get("tool_calls")
        if not appels:
            print(message.get("content") or "(reponse vide)")
            messages.append({"role": "assistant", "content": message.get("content") or ""})
            return
        messages.append(message)
        for appel in appels:
            nom = appel["function"]["name"]
            try:
                arguments = json.loads(appel["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                arguments = {}
            apercu = ", ".join("%s=%s" % (cle_arg, valeur) for cle_arg, valeur in arguments.items())
            print("  . %s(%s)" % (nom, apercu), flush=True)
            fonction = OUTILS.get(nom)
            if fonction is None:
                resultat = "Outil inconnu : %s" % nom
            else:
                try:
                    resultat = fonction(**arguments)
                except Exception as e:  # argument invalide venant du modele
                    resultat = "Erreur outil : %s" % e
            messages.append({"role": "tool", "tool_call_id": appel["id"], "content": resultat})
    print("\nLimite de %d tours d'outils atteinte." % MAX_TOURS)


# ── Memoire de la conversation ──

def sauve_session(messages):
    with open(FICHIER_SESSION, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False)


def charge_session():
    if not os.path.exists(FICHIER_SESSION):
        sys.exit("Aucune session a reprendre (%s absent)." % os.path.basename(FICHIER_SESSION))
    with open(FICHIER_SESSION, encoding="utf-8") as f:
        return json.load(f)


def boucle_observateur(messages, modele, cle, repondre_dabord=True):
    """Repond, puis garde la main pour les questions de suite avec tout l'historique."""
    if repondre_dabord:
        observateur(messages, modele, cle)
        sauve_session(messages)
    while True:
        print("\n(question de suite, %s pour sortir)" % CMD_QUITTER[0])
        try:
            entree = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not entree or entree in CMD_QUITTER:
            return
        messages.append({"role": "user", "content": entree})
        observateur(messages, modele, cle)
        sauve_session(messages)


# ── Entree en ligne de commande ──

def lit_fichier(chemin):
    with open(chemin, encoding="utf-8", errors="replace") as f:
        return "Contenu de %s :\n%s" % (chemin, f.read())


def analyse_arguments(argv):
    """Retourne (modele, contextes_fichiers, mode_observateur, reprise, question)."""
    modele = MODELE_DEFAUT
    contextes = []
    observe = False
    reprise = False
    mots = []
    i = 0
    while i < len(argv):
        if argv[i] == "-m" and i + 1 < len(argv):
            modele = argv[i + 1]
            i += 2
        elif argv[i] == "-f" and i + 1 < len(argv):
            contextes.append(lit_fichier(argv[i + 1]))
            i += 2
        elif argv[i] == "-a":
            observe = True
            i += 1
        elif argv[i] == "-c":
            reprise = True
            observe = True  # une reprise garde les outils
            i += 1
        else:
            mots.append(argv[i])
            i += 1
    return modele, contextes, observe, reprise, " ".join(mots)


def conversation(messages, modele, cle):
    print("DeepSeek (%s) — %s pour sortir, %s pour effacer l'historique,\n"
          "%s <chemin> pour joindre un fichier.\n" % (modele, CMD_QUITTER[0], CMD_RESET, CMD_FICHIER))
    while True:
        try:
            entree = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not entree:
            continue
        if entree in CMD_QUITTER:
            return
        if entree == CMD_RESET:
            del messages[1:]
            print("Historique efface.\n")
            continue
        if entree.startswith(CMD_FICHIER + " "):
            chemin = entree[len(CMD_FICHIER) + 1:].strip()
            try:
                messages.append({"role": "user", "content": lit_fichier(chemin)})
                print("Fichier joint : %s\n" % chemin)
            except OSError as e:
                print("Lecture impossible : %s\n" % e)
            continue
        messages.append({"role": "user", "content": entree})
        reponse = demande(messages, modele, cle)
        messages.append({"role": "assistant", "content": reponse})
        print()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cle = charge_cle()
    modele, contextes, observe, reprise, question = analyse_arguments(sys.argv[1:])

    if reprise:
        messages = charge_session()
        print("Session reprise (%d messages).\n" % len(messages))
    else:
        messages = [{"role": "system", "content": SYSTEME_OBSERVATEUR if observe else SYSTEME}]
    for contexte in contextes:
        messages.append({"role": "user", "content": contexte})

    if observe:
        if not question and not reprise:
            sys.exit("Le mode -a attend une question.")
        if question:
            messages.append({"role": "user", "content": question})
            boucle_observateur(messages, modele, cle)
        else:
            boucle_observateur(messages, modele, cle, repondre_dabord=False)
    elif question:
        messages.append({"role": "user", "content": question})
        demande(messages, modele, cle)
    else:
        conversation(messages, modele, cle)


if __name__ == "__main__":
    main()
