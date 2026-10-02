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

            -- Progression du simulateur : une ligne par niveau RÉUSSI. On ne
            -- garde que le MEILLEUR essai (le pont le plus léger), et le PONT
            -- lui-même (pont_json) : l'élève rouvre le niveau sur sa propre
            -- construction. signature = empreinte de l'énoncé au moment de la
            -- réussite ; si l'administrateur modifie le niveau, elle ne
            -- correspond plus et le pont n'est pas rechargé (voir le simulateur,
            -- model/levels.js::signatureEnonce).
            CREATE TABLE IF NOT EXISTS sim_niveaux (
                eleve_id    INTEGER NOT NULL,
                niveau_id   TEXT    NOT NULL,
                etoiles     INTEGER NOT NULL,
                masse_kg    REAL    NOT NULL,
                reussi_le   TEXT    NOT NULL,
                pont_json   TEXT,
                signature   TEXT,
                PRIMARY KEY (eleve_id, niveau_id)
            );

            -- Catalogue de niveaux du simulateur : UNE seule ligne (id = 1),
            -- le JSON des fiches. Tant qu'elle n'existe pas, le simulateur
            -- utilise le catalogue livré avec son code. Seul l'administrateur
            -- l'écrit ; tout le monde la lit.
            CREATE TABLE IF NOT EXISTS sim_catalogue (
                id          INTEGER PRIMARY KEY CHECK (id = 1),
                contenu     TEXT    NOT NULL,
                modifie_le  TEXT    NOT NULL
            );

            -- Préréglages d'impression de l'Atelier 3D. Le logiciel en livre un
            -- jeu dans son code ; cette table garde ce que l'ADMINISTRATEUR en a
            -- changé, et c'est la même chose pour tout le monde. Rien n'est
            -- rangé dans le navigateur : un réglage vu sur un poste doit être le
            -- réglage vu sur tous. Même forme que sim_catalogue : une seule
            -- ligne, le JSON entier, réécrit en bloc.
            CREATE TABLE IF NOT EXISTS prereglages_impression (
                id          INTEGER PRIMARY KEY CHECK (id = 1),
                contenu     TEXT    NOT NULL,
                modifie_le  TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projets_cao (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                eleve_id       INTEGER NOT NULL,
                nom            TEXT    NOT NULL,
                document_json  TEXT    NOT NULL,
                vignette_png   TEXT,
                cree_le        TEXT    NOT NULL,
                modifie_le     TEXT    NOT NULL
            );

            -- Fichiers STL importés dans l'atelier 3D : le document n'en garde
            -- que la clé, les octets sont rangés dans uploads/cao/<eleve_id>/.
            CREATE TABLE IF NOT EXISTS fichiers_cao (
                eleve_id      INTEGER NOT NULL,
                cle           TEXT    NOT NULL,
                nom_original  TEXT    NOT NULL,
                taille        INTEGER NOT NULL,
                cree_le       TEXT    NOT NULL,
                PRIMARY KEY (eleve_id, cle)
            );

            -- Cyber-défis : une ligne par élève et par défi tenté. Les flags et
            -- les indices vivent dans core/cyberdefis.py, jamais ici.
            CREATE TABLE IF NOT EXISTS defi_resolutions (
                eleve_id    INTEGER NOT NULL,
                defi_id     TEXT    NOT NULL,
                tentatives  INTEGER NOT NULL DEFAULT 0,
                indices_vus INTEGER NOT NULL DEFAULT 0,
                resolu_le   TEXT,
                PRIMARY KEY (eleve_id, defi_id)
            );
        """)

        # ── Migration sim_niveaux → pont sauvegardé ─────────────────────────────
        # Les lignes déjà en base n'ont pas de pont : l'élève y garde ses étoiles
        # et sa masse, et le premier essai réussi suivant y dépose son pont.
        sim_cols = {r[1] for r in conn.execute("PRAGMA table_info(sim_niveaux)")}
        if "pont_json" not in sim_cols:
            conn.execute("ALTER TABLE sim_niveaux ADD COLUMN pont_json TEXT")
        if "signature" not in sim_cols:
            conn.execute("ALTER TABLE sim_niveaux ADD COLUMN signature TEXT")

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


# ── Simulateur de structures (progression des niveaux) ────────────────────────
# Un niveau réussi = des étoiles (0 à 3) et la masse du pont validé. Rejouer un
# niveau n'écrase la ligne que si le nouveau pont est PLUS LÉGER : on ne perd
# jamais ses étoiles en réessayant.

def get_sim_niveaux(eleve_id: int) -> list[dict]:
    """La progression, SANS les ponts : ils sont gros et se lisent un par un."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT niveau_id, etoiles, masse_kg,
                   pont_json IS NOT NULL AS a_pont, signature
            FROM sim_niveaux WHERE eleve_id = ?
            """,
            (eleve_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_sim_pont(eleve_id: int, niveau_id: str) -> str | None:
    """Le JSON du pont sauvegardé pour ce niveau, ou None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT pont_json FROM sim_niveaux WHERE eleve_id = ? AND niveau_id = ?",
            (eleve_id, niveau_id),
        ).fetchone()
        return row["pont_json"] if row else None


def save_sim_niveau(eleve_id: int, niveau_id: str, etoiles: int, masse_kg: float, now: str,
                    pont_json: str | None = None, signature: str | None = None) -> dict:
    """Enregistre une réussite. Le MEILLEUR essai (le pont le plus léger) gagne :
    rejouer plus lourd ne fait perdre ni ses étoiles ni son pont. Un pont est
    aussi déposé quand la ligne n'en a pas encore (réussite d'avant cette
    fonctionnalité, ou énoncé modifié depuis) : sinon « validé » resterait sans
    rien à rouvrir. La décision se prend ici, en clair, plutôt que dans un
    ON CONFLICT que personne ne relit."""
    with get_connection() as conn:
        ancien = conn.execute(
            "SELECT etoiles, masse_kg, pont_json, signature FROM sim_niveaux WHERE eleve_id = ? AND niveau_id = ?",
            (eleve_id, niveau_id),
        ).fetchone()
        if ancien is None:
            conn.execute(
                """
                INSERT INTO sim_niveaux (eleve_id, niveau_id, etoiles, masse_kg, reussi_le, pont_json, signature)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (eleve_id, niveau_id, etoiles, masse_kg, now, pont_json, signature),
            )
        else:
            record = masse_kg < ancien["masse_kg"]
            # Pont orphelin : la ligne n'a pas de pont, ou celui-ci a été bâti sur
            # un énoncé qui a changé depuis. On le remplace sans toucher au score.
            orphelin = ancien["pont_json"] is None or ancien["signature"] != signature
            if record:
                conn.execute(
                    """
                    UPDATE sim_niveaux SET etoiles = ?, masse_kg = ?, reussi_le = ?, pont_json = ?, signature = ?
                    WHERE eleve_id = ? AND niveau_id = ?
                    """,
                    (etoiles, masse_kg, now, pont_json, signature, eleve_id, niveau_id),
                )
            elif orphelin and pont_json is not None:
                conn.execute(
                    "UPDATE sim_niveaux SET pont_json = ?, signature = ? WHERE eleve_id = ? AND niveau_id = ?",
                    (pont_json, signature, eleve_id, niveau_id),
                )
        row = conn.execute(
            """
            SELECT niveau_id, etoiles, masse_kg,
                   pont_json IS NOT NULL AS a_pont, signature
            FROM sim_niveaux WHERE eleve_id = ? AND niveau_id = ?
            """,
            (eleve_id, niveau_id),
        ).fetchone()
        return dict(row)


# ── Simulateur de structures (catalogue de niveaux) ───────────────────────────
# Le catalogue tient dans UNE ligne : le JSON de toutes les fiches de niveau.
# L'administrateur l'écrit en entier à chaque enregistrement (il n'y a jamais
# deux rédacteurs en même temps, et ça évite toute gestion d'ordre partiel).

def get_prereglages_impression() -> str | None:
    """Le JSON des préréglages d'impression du site, ou None s'il est resté celui du logiciel."""
    with get_connection() as conn:
        row = conn.execute("SELECT contenu FROM prereglages_impression WHERE id = 1").fetchone()
        return row["contenu"] if row else None


def save_prereglages_impression(contenu_json: str, now: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO prereglages_impression (id, contenu, modifie_le)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET contenu    = excluded.contenu,
                                          modifie_le = excluded.modifie_le
            """,
            (contenu_json, now),
        )


def get_sim_catalogue() -> str | None:
    """Le JSON du catalogue enregistré, ou None s'il n'y en a jamais eu."""
    with get_connection() as conn:
        row = conn.execute("SELECT contenu FROM sim_catalogue WHERE id = 1").fetchone()
        return row["contenu"] if row else None


def save_sim_catalogue(contenu_json: str, now: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sim_catalogue (id, contenu, modifie_le)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET contenu    = excluded.contenu,
                                          modifie_le = excluded.modifie_le
            """,
            (contenu_json, now),
        )


# ── Atelier 3D (projets et fichiers importés) ──────────────────────────────────
# Un projet est un document JSON de quelques kilo-octets : aucun maillage n'y
# est jamais écrit. Chaque élève ne voit et ne gère QUE ses propres projets.

def get_projets_cao(eleve_id: int) -> list[dict]:
    """Liste des projets de l'élève, SANS le document, du plus récent au plus ancien."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, nom, vignette_png, modifie_le FROM projets_cao "
            "WHERE eleve_id = ? ORDER BY modifie_le DESC, id DESC",
            (eleve_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def count_projets_cao(eleve_id: int) -> int:
    with get_connection() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM projets_cao WHERE eleve_id = ?", (eleve_id,)
        ).fetchone()[0]


def get_projet_cao(projet_id: int, eleve_id: int) -> dict | None:
    """Un projet AVEC son document (texte JSON brut), ou None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, nom, document_json, modifie_le FROM projets_cao WHERE id = ? AND eleve_id = ?",
            (projet_id, eleve_id),
        ).fetchone()
        return dict(row) if row else None


def create_projet_cao(eleve_id: int, nom: str, document_json: str, vignette_png: str | None, now: str) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO projets_cao (eleve_id, nom, document_json, vignette_png, cree_le, modifie_le) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (eleve_id, nom, document_json, vignette_png, now, now),
        )
        return cur.lastrowid


def update_projet_cao(
    projet_id: int, eleve_id: int, nom: str, document_json: str, vignette_png: str | None, now: str
) -> bool:
    """Enregistre le projet. Une vignette absente (None) garde la précédente."""
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE projets_cao SET nom = ?, document_json = ?, "
            "vignette_png = COALESCE(?, vignette_png), modifie_le = ? "
            "WHERE id = ? AND eleve_id = ?",
            (nom, document_json, vignette_png, now, projet_id, eleve_id),
        )
        return cur.rowcount > 0


def delete_projet_cao(projet_id: int, eleve_id: int) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM projets_cao WHERE id = ? AND eleve_id = ?", (projet_id, eleve_id)
        )
        return cur.rowcount > 0


def fichier_cao_existe(eleve_id: int, cle: str) -> bool:
    with get_connection() as conn:
        return conn.execute(
            "SELECT 1 FROM fichiers_cao WHERE eleve_id = ? AND cle = ?", (eleve_id, cle)
        ).fetchone() is not None


def save_fichier_cao(eleve_id: int, cle: str, nom_original: str, taille: int, now: str) -> None:
    """Le même contenu a la même clé : le réenregistrer ne change rien."""
    with get_connection() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO fichiers_cao (eleve_id, cle, nom_original, taille, cree_le) "
            "VALUES (?, ?, ?, ?, ?)",
            (eleve_id, cle, nom_original, taille, now),
        )


# ── Cyber-défis ────────────────────────────────────────────────────────────────
# Une ligne par (élève, défi) dès la première tentative. resolu_le reste NULL
# tant que le flag n'est pas trouvé, et n'est plus jamais réécrit ensuite : on
# garde la date de la PREMIÈRE réussite.

def get_defis_eleve(eleve_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT defi_id, tentatives, indices_vus, resolu_le "
            "FROM defi_resolutions WHERE eleve_id = ?",
            (eleve_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def enregistrer_tentative(eleve_id: int, defi_id: str, resolu: bool, now: str) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO defi_resolutions (eleve_id, defi_id, tentatives, resolu_le)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(eleve_id, defi_id)
            DO UPDATE SET tentatives = tentatives + 1,
                          resolu_le  = COALESCE(resolu_le, excluded.resolu_le)
            """,
            (eleve_id, defi_id, now if resolu else None),
        )


def enregistrer_indice(eleve_id: int, defi_id: str, numero: int) -> None:
    """indices_vus = le rang du plus grand indice révélé, jamais décrémenté."""
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO defi_resolutions (eleve_id, defi_id, indices_vus)
            VALUES (?, ?, ?)
            ON CONFLICT(eleve_id, defi_id)
            DO UPDATE SET indices_vus = MAX(indices_vus, excluded.indices_vus)
            """,
            (eleve_id, defi_id, numero),
        )
