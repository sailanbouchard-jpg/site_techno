#!/usr/bin/env python3
"""
server.py — OBSOLÈTE (ne plus utiliser ce serveur autonome).
────────────────────────────────────────────────────────────
Les sauvegardes du simulateur sont désormais gérées par le SERVEUR FLASK du
projet (../server.py à la racine), via les routes /api/sim-structures et la base
SQLite (data.db), comme les bloc-notes et les réponses élèves. Plus de stockage
navigateur (localStorage), plus de dossier saves/ : tout passe par le serveur.

  → Pour lancer le simulateur AVEC les sauvegardes : depuis la racine du projet,
       python server.py
    puis ouvrir http://127.0.0.1:5000/simulateur-structures/ (connecté en élève).

Ce fichier n'est conservé que parce qu'il ne peut pas être supprimé ici ; il
n'est plus importé ni exécuté par l'application. Lancé directement, il se contente
de rappeler la marche à suivre ci-dessus, puis sert le dossier en statique SANS
API de sauvegarde (utile seulement pour tester la physique hors connexion).
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    print(__doc__)
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=ROOT, **k)
    httpd = http.server.ThreadingHTTPServer(("", port), handler)
    print(f"(secours statique SANS sauvegardes) http://localhost:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
