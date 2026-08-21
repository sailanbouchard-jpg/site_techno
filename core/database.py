"""
core/database.py
Initialisation SQLite et accès aux données.
"""

import hashlib
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS eleves (
                id           INTEGER PRIMARY KEY,
                identifiant  TEXT UNIQUE NOT NULL,
                mot_de_passe TEXT NOT NULL,
                niveau       TEXT,
                classe       TEXT
            );

            CREATE TABLE IF NOT EXISTS groupes (
                eleve_id      INTEGER NOT NULL,
                activite_slug TEXT    NOT NULL,
                numero_groupe INTEGER NOT NULL,
                PRIMARY KEY (eleve_id, activite_slug)
            );

            CREATE TABLE IF NOT EXISTS bloc_notes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                eleve_id    INTEGER NOT NULL,
                titre       TEXT    NOT NULL DEFAULT 'Sans titre',
                contenu     TEXT    NOT NULL DEFAULT '',
                cree_le     TEXT    NOT NULL,
                modifie_le  TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS drop_links (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                titre       TEXT    NOT NULL,
                classe      TEXT    NOT NULL,
                is_open     INTEGER NOT NULL DEFAULT 1,
                cree_le     TEXT    NOT NULL,
                ferme_le    TEXT
            );

            CREATE TABLE IF NOT EXISTS drop_fichiers (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                drop_link_id  INTEGER NOT NULL,
                eleve_id      INTEGER NOT NULL,
                nom_original  TEXT    NOT NULL,
                nom_stocke    TEXT    NOT NULL UNIQUE,
                taille        INTEGER NOT NULL,
                mime_type     TEXT,
                uploade_le    TEXT    NOT NULL,
                FOREIGN KEY (drop_link_id) REFERENCES drop_links(id)
            );

            CREATE TABLE IF NOT EXISTS notes_volantes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                eleve_id    INTEGER NOT NULL,
                contenu     TEXT    NOT NULL DEFAULT '',
                cree_le     TEXT    NOT NULL,
                modifie_le  TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sim_structures (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                eleve_id    INTEGER NOT NULL,
                label       TEXT    NOT NULL,
                structure   TEXT    NOT NULL,
                cree_le     TEXT    NOT NULL,
                modifie_le  TEXT    NOT NULL,
                UNIQUE (eleve_id, label)
            );
        """)

        # ── Migration eleves ─────────────────────────────────────────────────────
        existing_cols = {r[1] for r in conn.execute("PRAGMA table_info(eleves)")}

        if "niveau" not in existing_cols:
            conn.execute("ALTER TABLE eleves ADD COLUMN niveau TEXT")
            # Ancienne colonne 'classe' stockait le niveau (ex: '4eme') → migrer
            conn.execute("UPDATE eleves SET niveau = classe")
            conn.execute("UPDATE eleves SET classe = NULL")
        elif "classe" not in existing_cols:
            conn.execute("ALTER TABLE eleves ADD COLUMN classe TEXT")

        # ── Migration reponses → individuelle par élève ──────────────────────────
        reponses_cols = {r[1] for r in conn.execute("PRAGMA table_info(reponses)")}

        if not reponses_cols:
            # Table absente → créer avec nouveau schéma individuel
            conn.execute("""
                CREATE TABLE reponses (
                    activite_slug  TEXT    NOT NULL,
                    eleve_id       INTEGER NOT NULL,
                    question_id    TEXT    NOT NULL,
                    contenu        TEXT    NOT NULL,
                    modifie_le     TEXT    NOT NULL,
                    PRIMARY KEY (activite_slug, eleve_id, question_id)
                )
            """)
        elif "eleve_id" not in reponses_cols:
            # Ancien schéma partagé (numero_groupe) → recréer en individuel
            # Les anciennes réponses partagées sont perdues (migration volontaire)
            conn.execute("DROP TABLE reponses")
            conn.execute("""
                CREATE TABLE reponses (
                    activite_slug  TEXT    NOT NULL,
                    eleve_id       INTEGER NOT NULL,
                    question_id    TEXT    NOT NULL,
                    contenu        TEXT    NOT NULL,
                    modifie_le     TEXT    NOT NULL,
                    PRIMARY KEY (activite_slug, eleve_id, question_id)
                )
            """)


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def seed_test_data() -> None:
    """Désactivé — les comptes sont maintenant créés manuellement via seed_test.py."""
    pass


# ── Authentification ───────────────────────────────────────────────────────────

def authenticate(identifiant: str, mot_de_passe: str):
    """Retourne la ligne élève si les identifiants sont corrects, sinon None."""
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM eleves WHERE identifiant = ? AND mot_de_passe = ?",
            (identifiant, _hash(mot_de_passe)),
        ).fetchone()


# ── Élève — niveau et classe ───────────────────────────────────────────────────

def get_eleve_classe(eleve_id: int) -> str | None:
    """Retourne la classe de l'élève (ex: '5eA'), ou None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT classe FROM eleves WHERE id = ?", (eleve_id,)
        ).fetchone()
        return row["classe"] if row else None


def get_eleve_niveau(eleve_id: int) -> str | None:
    """Retourne le niveau de l'élève (ex: '5eme'), ou None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT niveau FROM eleves WHERE id = ?", (eleve_id,)
        ).fetchone()
        return row["niveau"] if row else None


# ── Groupes ────────────────────────────────────────────────────────────────────

def get_groupe(eleve_id: int, activite_slug: str) -> int | None:
    """Retourne le numéro de groupe assigné à l'élève pour une activité, ou None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT numero_groupe FROM groupes WHERE eleve_id = ? AND activite_slug = ?",
            (eleve_id, activite_slug),
        ).fetchone()
        return row["numero_groupe"] if row else None


# ── Réponses individuelles ─────────────────────────────────────────────────────

def get_reponses(activite_slug: str, eleve_id: int) -> list[dict]:
    """Retourne les réponses de l'élève pour une activité donnée."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM reponses WHERE activite_slug = ? AND eleve_id = ?",
            (activite_slug, eleve_id),
        ).fetchall()
        return [dict(r) for r in rows]


def save_reponse(
    activite_slug: str,
    eleve_id: int,
    question_id: str,
    contenu: str,
    modifie_le: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO reponses (activite_slug, eleve_id, question_id, contenu, modifie_le)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(activite_slug, eleve_id, question_id)
            DO UPDATE SET contenu    = excluded.contenu,
                          modifie_le = excluded.modifie_le
            """,
            (activite_slug, eleve_id, question_id, contenu, modifie_le),
        )


# ── Bloc-notes élève ───────────────────────────────────────────────────────────

def get_bloc_notes(eleve_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, titre, contenu, cree_le, modifie_le FROM bloc_notes "
            "WHERE eleve_id = ? ORDER BY id ASC",
            (eleve_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def create_bloc_note(eleve_id: int, titre: str, contenu: str, now: str) -> dict:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO bloc_notes (eleve_id, titre, contenu, cree_le, modifie_le) VALUES (?, ?, ?, ?, ?)",
            (eleve_id, titre, contenu, now, now),
        )
        return {"id": cur.lastrowid, "titre": titre, "contenu": contenu, "cree_le": now, "modifie_le": now}


def update_bloc_note(note_id: int, eleve_id: int, titre: str, contenu: str, now: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE bloc_notes SET titre = ?, contenu = ?, modifie_le = ? WHERE id = ? AND eleve_id = ?",
            (titre, contenu, now, note_id, eleve_id),
        )
        return cur.rowcount > 0


def delete_bloc_note(note_id: int, eleve_id: int) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM bloc_notes WHERE id = ? AND eleve_id = ?",
            (note_id, eleve_id),
        )
        return cur.rowcount > 0


# ── Notes volantes (bloc-notes flottants accessibles depuis la navbar) ────────

def get_notes_volantes(eleve_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, contenu, cree_le, modifie_le FROM notes_volantes "
            "WHERE eleve_id = ? ORDER BY id ASC",
            (eleve_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def create_note_volante(eleve_id: int, contenu: str, now: str) -> dict:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO notes_volantes (eleve_id, contenu, cree_le, modifie_le) VALUES (?, ?, ?, ?)",
            (eleve_id, contenu, now, now),
        )
        return {"id": cur.lastrowid, "contenu": contenu, "cree_le": now, "modifie_le": now}


def update_note_volante(note_id: int, eleve_id: int, contenu: str, now: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE notes_volantes SET contenu = ?, modifie_le = ? WHERE id = ? AND eleve_id = ?",
            (contenu, now, note_id, eleve_id),
        )
        return cur.rowcount > 0


def delete_note_volante(note_id: int, eleve_id: int) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM notes_volantes WHERE id = ? AND eleve_id = ?",
            (note_id, eleve_id),
        )
        return cur.rowcount > 0


# ── Dépôts de fichiers ─────────────────────────────────────────────────────────

def get_drop_links_for_classe(classe: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, titre, classe, cree_le FROM drop_links
               WHERE is_open = 1 AND (classe = ? OR classe = '*')
               ORDER BY cree_le DESC""",
            (classe,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_drop_links() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT dl.id, dl.titre, dl.classe, dl.is_open, dl.cree_le, dl.ferme_le,
                      COUNT(df.id) AS nb_fichiers
               FROM drop_links dl
               LEFT JOIN drop_fichiers df ON df.drop_link_id = dl.id
               GROUP BY dl.id
               ORDER BY dl.cree_le DESC"""
        ).fetchall()
        return [dict(r) for r in rows]


def create_drop_link(titre: str, classe: str, now: str) -> dict:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO drop_links (titre, classe, is_open, cree_le) VALUES (?, ?, 1, ?)",
            (titre, classe, now),
        )
        return {"id": cur.lastrowid, "titre": titre, "classe": classe,
                "is_open": 1, "cree_le": now, "ferme_le": None, "nb_fichiers": 0}


def update_drop_link(link_id: int, titre: str | None, is_open: int | None, now: str) -> bool:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM drop_links WHERE id = ?", (link_id,)).fetchone()
        if not row:
            return False
        new_titre   = titre   if titre   is not None else row["titre"]
        new_is_open = is_open if is_open is not None else row["is_open"]
        ferme_le    = None if new_is_open else (row["ferme_le"] or now)
        conn.execute(
            "UPDATE drop_links SET titre = ?, is_open = ?, ferme_le = ? WHERE id = ?",
            (new_titre, new_is_open, ferme_le, link_id),
        )
        return True


def delete_drop_link(link_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM drop_fichiers WHERE drop_link_id = ?", (link_id,))
        conn.execute("DELETE FROM drop_links    WHERE id = ?",           (link_id,))


def get_drop_fichiers_for_link(drop_link_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT df.id, df.eleve_id, e.identifiant, df.nom_original,
                      df.nom_stocke, df.taille, df.mime_type, df.uploade_le
               FROM drop_fichiers df
               JOIN eleves e ON e.id = df.eleve_id
               WHERE df.drop_link_id = ?
               ORDER BY e.identifiant, df.uploade_le DESC""",
            (drop_link_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_drop_fichiers_for_eleve(drop_link_id: int, eleve_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT id, nom_original, taille, uploade_le
               FROM drop_fichiers WHERE drop_link_id = ? AND eleve_id = ?
               ORDER BY uploade_le DESC""",
            (drop_link_id, eleve_id),
        ).fetchall()
        return [dict(r) for r in rows]


def save_drop_fichier(
    drop_link_id: int, eleve_id: int, nom_original: str,
    nom_stocke: str, taille: int, mime_type: str, now: str,
) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            """INSERT INTO drop_fichiers
               (drop_link_id, eleve_id, nom_original, nom_stocke, taille, mime_type, uploade_le)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (drop_link_id, eleve_id, nom_original, nom_stocke, taille, mime_type, now),
        )
        return cur.lastrowid


def delete_drop_fichier(fichier_id: int, eleve_id: int | None = None) -> tuple[str | None, int | None]:
    """
    Supprime un fichier. Si eleve_id fourni, vérifie la propriété.
    Retourne (nom_stocke, drop_link_id) pour effacer le disque.
    """
    with get_connection() as conn:
        row = conn.execute(
            "SELECT nom_stocke, drop_link_id, eleve_id FROM drop_fichiers WHERE id = ?",
            (fichier_id,),
        ).fetchone()
        if not row:
            return None, None
        if eleve_id is not None and row["eleve_id"] != eleve_id:
            return None, None
        conn.execute("DELETE FROM drop_fichiers WHERE id = ?", (fichier_id,))
        return row["nom_stocke"], row["drop_link_id"]


# ── Simulateur de structures (sauvegardes élève) ───────────────────────────────
# Une sauvegarde = la structure (nœuds, poutres, sol…) sérialisée en JSON, stockée
# telle quelle dans la colonne `structure`. La clé UNIQUE (eleve_id, label) fait
# qu'enregistrer deux fois sous le même nom ÉCRASE (au lieu de dupliquer).

def get_sim_structures(eleve_id: int) -> list[dict]:
    """Liste LÉGÈRE (sans le contenu JSON) des sauvegardes de l'élève."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, label, modifie_le FROM sim_structures "
            "WHERE eleve_id = ? ORDER BY modifie_le DESC, id DESC",
            (eleve_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_sim_structure(struct_id: int, eleve_id: int) -> dict | None:
    """Une sauvegarde précise AVEC son JSON brut (colonne `structure`), ou None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, label, structure FROM sim_structures WHERE id = ? AND eleve_id = ?",
            (struct_id, eleve_id),
        ).fetchone()
        return dict(row) if row else None


def save_sim_structure(eleve_id: int, label: str, structure_json: str, now: str) -> dict:
    """Crée ou ÉCRASE (même élève + même nom) une sauvegarde. Renvoie {id, label}."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sim_structures (eleve_id, label, structure, cree_le, modifie_le)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(eleve_id, label)
            DO UPDATE SET structure  = excluded.structure,
                          modifie_le = excluded.modifie_le
            """,
            (eleve_id, label, structure_json, now, now),
        )
        # ON CONFLICT ne renvoie pas un lastrowid fiable → on relit l'id réel.
        row = conn.execute(
            "SELECT id FROM sim_structures WHERE eleve_id = ? AND label = ?",
            (eleve_id, label),
        ).fetchone()
        return {"id": row["id"], "label": label}


def delete_sim_structure(struct_id: int, eleve_id: int) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM sim_structures WHERE id = ? AND eleve_id = ?",
            (struct_id, eleve_id),
        )
        return cur.rowcount > 0
