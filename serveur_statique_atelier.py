"""Serveur statique pour l'Atelier 3D, en développement seulement.

`python -m http.server` ne suffisait pas pour deux raisons :
  - il est mono-thread, et l'Atelier demande des dizaines de modules d'un coup :
    les requêtes en trop se font couper (ERR_CONNECTION_RESET) ;
  - il laisse le navigateur garder les modules en cache, si bien qu'un fichier
    modifié n'est pas relu sans vidage manuel du cache.

Ce serveur-ci est multi-thread et interdit le cache. Il ne sert qu'à regarder
l'Atelier pendant le développement : le vrai service passe par server.py.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DOSSIER = Path(__file__).parent / "atelier-3d"
PORT_PAR_DEFAUT = 5057


class SansCache(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, format, *args):   # noqa: A002 — signature imposée
        # Une ligne par module rendrait la console illisible : seules les erreurs comptent.
        if not args or not str(args[0]).startswith(("GET", "HEAD")):
            super().log_message(format, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT_PAR_DEFAUT
    gestionnaire = partial(SansCache, directory=str(DOSSIER))
    with ThreadingHTTPServer(("127.0.0.1", port), gestionnaire) as serveur:
        print(f"Atelier 3D sur http://127.0.0.1:{port}/ (dossier {DOSSIER})")
        serveur.serve_forever()


if __name__ == "__main__":
    main()
