#!/usr/bin/env python3
"""
seed_test.py
────────────
Supprime TOUS les comptes élèves existants (alice, bob, zap*, hex*, dot*, etc.)
et crée les comptes dede01 à dede20 avec le mot de passe commun "dede".
Les élèves sont créés sans niveau ni classe — l'enseignant les assigne via l'admin.

Usage :
  python seed_test.py
"""

import hashlib
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, str(Path(__file__).parent))

from core.database import get_connection, init_db

MDP_DEDE = "dede"
NB_ELEVES = 20


def _hash(p: str) -> str:
    return hashlib.sha256(p.encode()).hexdigest()


def main() -> None:
    print("▶  Initialisation de la base de données…")
    init_db()

    with get_connection() as conn:
        # ── Suppression de tous les comptes existants ──────────────────────────
        print("▶  Suppression de tous les comptes élèves…")
        ids = [r["id"] for r in conn.execute("SELECT id FROM eleves").fetchall()]
        for eid in ids:
            conn.execute("DELETE FROM groupes    WHERE eleve_id = ?", (eid,))
            conn.execute("DELETE FROM bloc_notes WHERE eleve_id = ?", (eid,))
            conn.execute("DELETE FROM reponses   WHERE eleve_id = ?", (eid,))
        conn.execute("DELETE FROM eleves")
        # Réponses orphelines (au cas où)
        conn.execute("DELETE FROM reponses")
        print(f"  ✓ {len(ids)} compte(s) supprimé(s)")

        # ── Création des comptes dede01 à dede20 ──────────────────────────────
        print(f"▶  Création des {NB_ELEVES} comptes dede…")
        mdp_hash = _hash(MDP_DEDE)
        for i in range(1, NB_ELEVES + 1):
            identifiant = f"dede{i:02d}"
            conn.execute(
                "INSERT INTO eleves (identifiant, mot_de_passe) VALUES (?, ?)",
                (identifiant, mdp_hash),
            )

    print(f"\n✓  Terminé. {NB_ELEVES} comptes créés :\n")
    print(f"  {'IDENTIFIANT':<12}  MOT DE PASSE")
    print(f"  {'-'*12}  {'-'*12}")
    for i in range(1, NB_ELEVES + 1):
        ident = f"dede{i:02d}"
        print(f"  {ident:<12}  {MDP_DEDE}")
    print("\n  → Assignez les niveaux et classes depuis l'interface admin.")


if __name__ == "__main__":
    main()
