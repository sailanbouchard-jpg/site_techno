"""
generer_livret_cyberdefis.py
-----------------------------
Génère le corrigé du professeur (livret_professeur_cyberdefis.md) à partir de
la source unique core/cyberdefis.py. À relancer après toute modification des
défis pour garder le corrigé à jour.

  python generer_livret_cyberdefis.py

Bibliothèque standard uniquement.
"""

from pathlib import Path

from core.cyberdefis import CATEGORIES, DEFIS

SORTIE = Path(__file__).parent / "livret_professeur_cyberdefis.md"


def main():
    lignes = []
    A = lignes.append

    A("# Cyber-défis — livret du professeur")
    A("")
    A("> Corrigé de référence, **généré automatiquement** depuis `core/cyberdefis.py` "
      "(via `generer_livret_cyberdefis.py`). Les flags, indices et leçons y sont la "
      "source unique — ne pas éditer ce fichier à la main.")
    A("")
    A("> Un flag s'écrit `FLAG{…}`. La validation ignore majuscules, accents, tirets "
      "et espaces : seul le contenu entre accolades compte.")
    A("")

    for cle, cat in CATEGORIES.items():
        A("---")
        A("")
        A(f"## {cat['titre']}")
        A("")
        A(f"*{cat['resume']}*")
        A("")

        for defi_id, defi in DEFIS.items():
            if defi["categorie"] != cle:
                continue

            A(f"### {defi_id.upper()} — {defi['titre']}")
            A("")
            A(f"**Résumé.** {defi['resume']}")
            A("")
            A(f"**Réponse.** `{defi['flag']}`")
            A("")

            if defi["indices"]:
                A("**Indices (donnés dans l'ordre, à la demande).**")
                for i, ind in enumerate(defi["indices"], 1):
                    A(f"{i}. {ind}")
            else:
                A("**Indices.** Aucun.")
            A("")

            A(f"**Ce que l'élève retient.** {defi['lecon']}")
            A("")

    SORTIE.write_text("\n".join(lignes), encoding="utf-8")
    total = len(DEFIS)
    print(f"  ecrit  {SORTIE.name}  ({total} défis, {len(CATEGORIES)} catégories)")


if __name__ == "__main__":
    main()
