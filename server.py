"""
server.py
---------
Lance le build du site puis démarre le serveur Flask.

  python server.py

RÉPONSES INDIVIDUELLES
  Les réponses sont désormais stockées par élève (eleve_id), pas par groupe.
  Le groupe reste une métadonnée de l'élève par activité (table groupes),
  mais chaque élève a ses propres réponses indépendantes.
"""

import hashlib
import json
import os
import secrets
import mimetypes
import shutil
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory, session
from werkzeug.utils import secure_filename

import build as site_builder
from core.database import (
    authenticate,
    create_bloc_note,
    create_drop_link,
    create_note_volante,
    delete_bloc_note,
    delete_drop_fichier,
    delete_drop_link,
    delete_note_volante,
    delete_sim_structure,
    get_all_drop_links,
    get_bloc_notes,
    get_connection,
    get_drop_fichiers_for_eleve,
    get_drop_fichiers_for_link,
    get_drop_links_for_classe,
    get_eleve_classe,
    get_eleve_niveau,
    get_groupe,
    get_notes_volantes,
    get_reponses,
    get_sim_structure,
    get_sim_structures,
    init_db,
    save_drop_fichier,
    save_reponse,
    save_sim_structure,
    seed_test_data,
    update_bloc_note,
    update_drop_link,
    update_note_volante,
)
from core.page_builder import build_navbar_html
from core.page_catalog import build_catalog
from core.palette.palette_loader import load_all_palettes

# ── Config ─────────────────────────────────────────────────────────────────────

SITE_DIR            = Path(__file__).parent / "site"
CONTENT_DIR         = Path(__file__).parent / "contenu"
UPLOADS_DIR         = Path(__file__).parent / "uploads" / "drops"
SIMULATEUR_DIR      = Path(__file__).parent / "simulateur-cmd"

# Sous Windows, le registre associe parfois .js à text/plain : les modules ES
# du simulateur exigent un type MIME JavaScript correct.
mimetypes.add_type("text/javascript", ".js")
ADMIN_PASSWORD        = "admin"   # ← change this before deploying
MAX_REPONSE_CHARS     = 2000
MAX_DROP_FILE_BYTES   = 20 * 1024 * 1024   # 20 Mo

_DROP_ALLOWED_EXT = {
    ".pdf", ".doc", ".docx", ".odt", ".txt", ".rtf",
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".ppt", ".pptx", ".odp",
    ".xls", ".xlsx", ".ods",
    ".zip",
}

app = Flask(__name__, static_folder=None)
# Clé secrète : lue depuis secret_key.txt (créé automatiquement au premier lancement).
# Ce fichier ne doit jamais être partagé ni versionné.
_SECRET_KEY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secret_key.txt")
if not os.path.exists(_SECRET_KEY_FILE):
    with open(_SECRET_KEY_FILE, "w") as f:
        f.write(secrets.token_hex(32))
with open(_SECRET_KEY_FILE) as f:
    app.secret_key = f.read().strip()
app.config["MAX_CONTENT_LENGTH"] = MAX_DROP_FILE_BYTES + 1024 * 1024


@app.errorhandler(413)
def fichier_trop_grand(_e):
    return jsonify({"erreur": f"Fichier trop volumineux (maximum {MAX_DROP_FILE_BYTES // 1024 // 1024} Mo)"}), 413


# ── Classes (depuis classes.json) ──────────────────────────────────────────────

_CLASSES_FILE = Path(__file__).parent / "classes.json"
with open(_CLASSES_FILE, encoding="utf-8") as _f:
    CLASSES: dict[str, list[str]] = json.load(_f)


def _niveau_for_classe(classe: str) -> str | None:
    """Retourne le niveau correspondant à une classe (ex: '5eA' → '5eme')."""
    for niv, classes in CLASSES.items():
        if classe in classes:
            return niv
    return None


# ── Catalogue et palettes ──────────────────────────────────────────────────────

CATALOG: dict = {}
_PALETTES_DIR = Path(__file__).parent / "palettes"
_PALETTES: dict = load_all_palettes(_PALETTES_DIR)


def _reload_catalog() -> None:
    global CATALOG
    CATALOG = build_catalog(CONTENT_DIR)


def _catalog_for_api() -> dict:
    return {
        class_name: [
            {
                "slug":       seq["slug"],
                "title":      seq["title"],
                "activities": [{"slug": a["slug"], "title": a["title"]} for a in seq["activities"]],
            }
            for seq in sequences
        ]
        for class_name, sequences in CATALOG.items()
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _section_of(activite_slug: str) -> str:
    """Extrait la section (niveau) depuis 'section/slug'."""
    return activite_slug.split("/", 1)[0] if "/" in activite_slug else ""


# ── Fichiers statiques ─────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def static_files(path: str) -> Response:
    target = SITE_DIR / path
    if target.is_dir():
        # send_from_directory n'accepte que des séparateurs "/" : ne jamais
        # construire ce chemin avec pathlib.Path (qui met des "\" sous Windows).
        path = f"{path.rstrip('/')}/index.html" if path else "index.html"
    return send_from_directory(SITE_DIR, path if path else "index.html")


# ── Simulateur CMD (dossier autonome, hors pipeline Markdown) ──────────────────

@app.route("/simulateur-cmd/<path:path>")
def serve_simulateur(path: str) -> Response:
    # Un dossier → son index.html (ex. /simulateur-cmd/challenges/00-prise-en-main/).
    if (SIMULATEUR_DIR / path).is_dir():
        path = f"{path.rstrip('/')}/index.html"
    return send_from_directory(SIMULATEUR_DIR, path)


# ── Catalogue (public) ─────────────────────────────────────────────────────────

@app.get("/api/catalog")
def api_catalog() -> Response:
    return jsonify(_catalog_for_api())


@app.get("/api/classes")
def api_classes() -> Response:
    """Retourne la liste des classes par niveau (depuis classes.json)."""
    return jsonify(CLASSES)


# ── Auth élève ─────────────────────────────────────────────────────────────────

@app.post("/api/login")
def login() -> Response:
    data = request.get_json(silent=True) or {}
    identifiant  = data.get("identifiant", "").strip()
    mot_de_passe = data.get("mot_de_passe", "")
    eleve = authenticate(identifiant, mot_de_passe)
    if eleve is None:
        return jsonify({"erreur": "Identifiant ou mot de passe incorrect"}), 401
    session["eleve_id"]    = eleve["id"]
    session["identifiant"] = eleve["identifiant"]
    return jsonify({"message": "Connecté", "identifiant": eleve["identifiant"]})


@app.post("/api/logout")
def logout() -> Response:
    session.clear()
    return jsonify({"message": "Déconnecté"})


@app.get("/api/me")
def me() -> Response:
    eleve_id = session.get("eleve_id")
    if eleve_id is None:
        return jsonify({"connecte": False}), 401
    classe = get_eleve_classe(eleve_id)
    niveau = get_eleve_niveau(eleve_id)
    with get_connection() as conn:
        groupes = [dict(r) for r in conn.execute(
            "SELECT activite_slug, numero_groupe FROM groupes WHERE eleve_id = ?",
            (eleve_id,),
        ).fetchall()]
    return jsonify({
        "connecte":    True,
        "eleve_id":    eleve_id,
        "identifiant": session.get("identifiant"),
        "classe":      classe,
        "niveau":      niveau,
        "groupes":     groupes,
    })


# ── Auth admin ─────────────────────────────────────────────────────────────────

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("admin"):
            return jsonify({"erreur": "Accès réservé à l'administrateur"}), 403
        return f(*args, **kwargs)
    return decorated


@app.post("/api/admin/login")
def admin_login() -> Response:
    data = request.get_json(silent=True) or {}
    if data.get("mot_de_passe", "") == ADMIN_PASSWORD:
        session["admin"] = True
        return jsonify({"message": "Connecté en tant qu'administrateur"})
    return jsonify({"erreur": "Mot de passe administrateur incorrect"}), 401


@app.post("/api/admin/logout")
def admin_logout() -> Response:
    session.pop("admin", None)
    return jsonify({"message": "Déconnecté"})


@app.get("/api/admin/me")
def admin_me() -> Response:
    return jsonify({"admin": bool(session.get("admin"))})


# ── Admin — catalogue ──────────────────────────────────────────────────────────

@app.get("/api/admin/catalog")
@require_admin
def admin_catalog() -> Response:
    return jsonify(_catalog_for_api())


# ── Admin — élèves ─────────────────────────────────────────────────────────────

@app.get("/api/admin/eleves")
@require_admin
def admin_list_eleves() -> Response:
    with get_connection() as conn:
        eleves = [dict(r) for r in conn.execute(
            "SELECT id, identifiant, niveau, classe FROM eleves ORDER BY identifiant"
        ).fetchall()]
        for e in eleves:
            e["groupes"] = [dict(r) for r in conn.execute(
                "SELECT activite_slug, numero_groupe FROM groupes "
                "WHERE eleve_id = ? ORDER BY activite_slug",
                (e["id"],),
            ).fetchall()]
    return jsonify(eleves)


@app.post("/api/admin/eleves")
@require_admin
def admin_create_eleve() -> Response:
    data         = request.get_json(silent=True) or {}
    identifiant  = data.get("identifiant", "").strip()
    mot_de_passe = data.get("mot_de_passe", "").strip()
    if not identifiant or not mot_de_passe:
        return jsonify({"erreur": "Identifiant et mot de passe requis"}), 400
    h = hashlib.sha256(mot_de_passe.encode()).hexdigest()
    try:
        with get_connection() as conn:
            cur = conn.execute(
                "INSERT INTO eleves (identifiant, mot_de_passe) VALUES (?, ?)",
                (identifiant, h),
            )
            new_id = cur.lastrowid
    except Exception:
        return jsonify({"erreur": f"L'identifiant « {identifiant} » existe déjà"}), 409
    return jsonify({"message": "Élève créé", "id": new_id, "identifiant": identifiant}), 201


@app.patch("/api/admin/eleves/<int:eleve_id>")
@require_admin
def admin_update_eleve(eleve_id: int) -> Response:
    data   = request.get_json(silent=True) or {}
    fields = {}

    if "niveau" in data:
        fields["niveau"] = data["niveau"].strip() or None

    if "classe" in data:
        classe = data["classe"].strip() or None
        fields["classe"] = classe
        # Quand on assigne une classe, le niveau est déduit automatiquement
        if classe:
            niv = _niveau_for_classe(classe)
            if niv:
                fields["niveau"] = niv

    if not fields:
        return jsonify({"erreur": "Aucun champ à mettre à jour"}), 400

    sets = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [eleve_id]
    with get_connection() as conn:
        conn.execute(f"UPDATE eleves SET {sets} WHERE id = ?", vals)
    return jsonify({"message": "Mis à jour"})


@app.delete("/api/admin/eleves/<int:eleve_id>")
@require_admin
def admin_delete_eleve(eleve_id: int) -> Response:
    with get_connection() as conn:
        conn.execute("DELETE FROM groupes         WHERE eleve_id = ?", (eleve_id,))
        conn.execute("DELETE FROM bloc_notes      WHERE eleve_id = ?", (eleve_id,))
        conn.execute("DELETE FROM notes_volantes  WHERE eleve_id = ?", (eleve_id,))
        conn.execute("DELETE FROM reponses        WHERE eleve_id = ?", (eleve_id,))
        conn.execute("DELETE FROM eleves          WHERE id = ?",       (eleve_id,))
    return jsonify({"message": "Élève supprimé"})


@app.post("/api/admin/eleves/<int:eleve_id>/reset-mdp")
@require_admin
def admin_reset_mdp(eleve_id: int) -> Response:
    data        = request.get_json(silent=True) or {}
    nouveau_mdp = data.get("nouveau_mdp", "").strip()
    if not nouveau_mdp:
        return jsonify({"erreur": "nouveau_mdp requis"}), 400
    h = hashlib.sha256(nouveau_mdp.encode()).hexdigest()
    with get_connection() as conn:
        conn.execute("UPDATE eleves SET mot_de_passe = ? WHERE id = ?", (h, eleve_id))
    return jsonify({"message": "Mot de passe réinitialisé"})


# ── Admin — groupes ────────────────────────────────────────────────────────────

@app.get("/api/admin/groupes")
@require_admin
def admin_list_groupes() -> Response:
    with get_connection() as conn:
        rows = [dict(r) for r in conn.execute(
            """SELECT g.eleve_id, e.identifiant, e.niveau, e.classe,
                      g.activite_slug, g.numero_groupe
               FROM groupes g JOIN eleves e ON e.id = g.eleve_id
               ORDER BY g.activite_slug, g.numero_groupe, e.identifiant"""
        ).fetchall()]
    return jsonify(rows)


@app.post("/api/admin/groupes")
@require_admin
def admin_assign_groupe() -> Response:
    data          = request.get_json(silent=True) or {}
    eleve_id      = data.get("eleve_id")
    activite_slug = data.get("activite_slug", "").strip()
    numero_groupe = data.get("numero_groupe")
    if not eleve_id or not activite_slug or numero_groupe is None:
        return jsonify({"erreur": "eleve_id, activite_slug et numero_groupe requis"}), 400

    # Vérifie que l'activité correspond au niveau de l'élève
    with get_connection() as conn:
        row = conn.execute("SELECT niveau FROM eleves WHERE id = ?", (eleve_id,)).fetchone()
    if row is None:
        return jsonify({"erreur": "Élève introuvable"}), 404

    eleve_niveau = row["niveau"]
    section = _section_of(activite_slug)
    if eleve_niveau and section != eleve_niveau:
        return jsonify({
            "erreur": f"Cette activité ({section}) ne correspond pas au niveau de l'élève ({eleve_niveau})"
        }), 400

    with get_connection() as conn:
        conn.execute(
            """INSERT INTO groupes (eleve_id, activite_slug, numero_groupe) VALUES (?, ?, ?)
               ON CONFLICT(eleve_id, activite_slug)
               DO UPDATE SET numero_groupe = excluded.numero_groupe""",
            (eleve_id, activite_slug, numero_groupe),
        )
    return jsonify({"message": "Groupe assigné"})


@app.delete("/api/admin/groupes/<int:eleve_id>/<path:activite_slug>")
@require_admin
def admin_delete_groupe(eleve_id: int, activite_slug: str) -> Response:
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM groupes WHERE eleve_id = ? AND activite_slug = ?",
            (eleve_id, activite_slug),
        )
    return jsonify({"message": "Assignation supprimée"})


# ── Admin — médias disponibles ─────────────────────────────────────────────────

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}


@app.get("/api/admin/medias")
@require_admin
def admin_list_medias() -> Response:
    medias_dir = CONTENT_DIR / "medias"
    files = []
    if medias_dir.exists():
        for f in medias_dir.rglob("*"):
            if f.suffix.lower() in _IMAGE_EXTENSIONS:
                files.append(f.name)
    files.sort()
    return jsonify(files)


# ── Mon espace ────────────────────────────────────────────────────────────────

TEMPLATES_DIR = Path(__file__).parent / "templates"


@app.route("/mon-espace")
@app.route("/mon-espace/")
def serve_mon_espace() -> Response:
    navbar_template = (TEMPLATES_DIR / "navbar.html").read_text(encoding="utf-8")
    navbar_html = build_navbar_html(CATALOG, navbar_template)
    rep = _PALETTES.get("defaut", {}).get("rep", {})
    rep_vars = (
        f"--rep-bg:{rep.get('fond_cadre', rep.get('fond', '#fefcf7'))};"
        f"--rep-border:{rep.get('bordure', '#d5b65a')};"
        f"--rep-color:{rep.get('texte', '#1a1200')};"
        f"--rep-font:{rep.get('police_rep', 'inherit')};"
        f"--rep-size:{rep.get('taille_rep', 'inherit')};"
    )
    template = (TEMPLATES_DIR / "mon_espace.html").read_text(encoding="utf-8")
    html = (template
            .replace("{{navbar}}", navbar_html)
            .replace("/*REP_PALETTE_VARS*/", rep_vars))
    return Response(html, mimetype="text/html")


@app.route("/outils/schema")
@app.route("/outils/schema/")
def serve_outils_schema() -> Response:
    from core.blocks.media_blocks import _SIZE_TO_MAX_WIDTH, _DEFAULT_MEDIA_SIZE

    options_html = "\n".join(
        f'            <option value="{taille}"{" selected" if taille == _DEFAULT_MEDIA_SIZE else ""}>'
        f'{taille} — {largeur}</option>'
        for taille, largeur in _SIZE_TO_MAX_WIDTH.items()
    )
    template = (TEMPLATES_DIR / "outils_schema.html").read_text(encoding="utf-8")
    html = template.replace("{{TAILLE_OPTIONS}}", options_html)
    return Response(html, mimetype="text/html")


# ── Bloc-notes élève ───────────────────────────────────────────────────────────

@app.get("/api/bloc-notes")
def api_get_bloc_notes() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    return jsonify(get_bloc_notes(eleve_id))


@app.post("/api/bloc-notes")
def api_create_bloc_note() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    data   = request.get_json(silent=True) or {}
    titre  = (data.get("titre") or "Sans titre").strip() or "Sans titre"
    contenu = data.get("contenu") or ""
    now    = datetime.now(timezone.utc).isoformat()
    note   = create_bloc_note(eleve_id, titre, contenu, now)
    return jsonify(note), 201


@app.patch("/api/bloc-notes/<int:note_id>")
def api_update_bloc_note(note_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    data    = request.get_json(silent=True) or {}
    titre   = (data.get("titre") or "Sans titre").strip() or "Sans titre"
    contenu = data.get("contenu") or ""
    now     = datetime.now(timezone.utc).isoformat()
    found   = update_bloc_note(note_id, eleve_id, titre, contenu, now)
    if not found:
        return jsonify({"erreur": "Bloc-note introuvable"}), 404
    return jsonify({"message": "Sauvegardé", "modifie_le": now})


@app.delete("/api/bloc-notes/<int:note_id>")
def api_delete_bloc_note(note_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    found = delete_bloc_note(note_id, eleve_id)
    if not found:
        return jsonify({"erreur": "Bloc-note introuvable"}), 404
    return jsonify({"message": "Supprimé"})


# ── Notes volantes (flottantes, accessibles depuis la navbar) ─────────────────

@app.get("/api/notes-volantes")
def api_get_notes_volantes() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    return jsonify(get_notes_volantes(eleve_id))


@app.post("/api/notes-volantes")
def api_create_note_volante() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    data    = request.get_json(silent=True) or {}
    contenu = data.get("contenu") or ""
    now     = datetime.now(timezone.utc).isoformat()
    note    = create_note_volante(eleve_id, contenu, now)
    return jsonify(note), 201


@app.patch("/api/notes-volantes/<int:note_id>")
def api_update_note_volante(note_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    data    = request.get_json(silent=True) or {}
    contenu = data.get("contenu") or ""
    now     = datetime.now(timezone.utc).isoformat()
    found   = update_note_volante(note_id, eleve_id, contenu, now)
    if not found:
        return jsonify({"erreur": "Note introuvable"}), 404
    return jsonify({"message": "Sauvegardé", "modifie_le": now})


@app.delete("/api/notes-volantes/<int:note_id>")
def api_delete_note_volante(note_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    found = delete_note_volante(note_id, eleve_id)
    if not found:
        return jsonify({"erreur": "Note introuvable"}), 404
    return jsonify({"message": "Supprimé"})


# ── Simulateur de structures (sauvegardes élève) ──────────────────────────────
# Le simulateur (site/simulateur-structures/, copié par build.py) tourne sur la
# MÊME origine que ces routes : le cookie de session élève est donc envoyé tout
# seul. Chaque élève ne voit et ne gère QUE ses propres sauvegardes.

MAX_SIM_LABEL_CHARS = 120


@app.get("/api/sim-structures")
def api_get_sim_structures() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    return jsonify(get_sim_structures(eleve_id))


@app.get("/api/sim-structures/<int:struct_id>")
def api_get_sim_structure(struct_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    row = get_sim_structure(struct_id, eleve_id)
    if row is None:
        return jsonify({"erreur": "Sauvegarde introuvable"}), 404
    return jsonify({"id": row["id"], "label": row["label"],
                    "structure": json.loads(row["structure"])})


@app.post("/api/sim-structures")
def api_save_sim_structure() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    data      = request.get_json(silent=True) or {}
    label     = (data.get("label") or "").strip()[:MAX_SIM_LABEL_CHARS]
    structure = data.get("structure")
    if not label:
        return jsonify({"erreur": "Nom de sauvegarde manquant"}), 400
    if not isinstance(structure, dict):
        return jsonify({"erreur": "Structure invalide"}), 400
    now   = datetime.now(timezone.utc).isoformat()
    saved = save_sim_structure(eleve_id, label, json.dumps(structure, ensure_ascii=False), now)
    return jsonify(saved), 201


@app.delete("/api/sim-structures/<int:struct_id>")
def api_delete_sim_structure(struct_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    if not delete_sim_structure(struct_id, eleve_id):
        return jsonify({"erreur": "Sauvegarde introuvable"}), 404
    return jsonify({"message": "Supprimé"})


# ── Réponses élève (individuelles) ────────────────────────────────────────────

def _require_login():
    eleve_id = session.get("eleve_id")
    if eleve_id is None:
        return None, (jsonify({"erreur": "Non connecté"}), 401)
    return eleve_id, None


@app.get("/api/reponses")
def lire_reponses() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err

    activite_slug = request.args.get("activite", "").strip()
    if not activite_slug:
        return jsonify({"erreur": "Paramètre 'activite' manquant"}), 400

    reponses = get_reponses(activite_slug, eleve_id)
    groupe   = get_groupe(eleve_id, activite_slug)
    return jsonify({"numero_groupe": groupe, "reponses": reponses})


@app.get("/api/reponses/groupe")
def lire_reponses_groupe() -> Response:
    """Réponses des camarades du même groupe pour une question donnée."""
    eleve_id, err = _require_login()
    if err:
        return err

    activite_slug = request.args.get("activite", "").strip()
    question_id   = request.args.get("question_id", "").strip()
    if not activite_slug or not question_id:
        return jsonify({"erreur": "Paramètres 'activite' et 'question_id' requis"}), 400

    groupe = get_groupe(eleve_id, activite_slug)
    if groupe is None:
        return jsonify([])

    with get_connection() as conn:
        rows = conn.execute(
            """SELECT e.identifiant, r.contenu
               FROM groupes g
               JOIN eleves e ON e.id = g.eleve_id
               JOIN reponses r ON r.eleve_id = g.eleve_id
                               AND r.activite_slug = g.activite_slug
                               AND r.question_id = ?
               WHERE g.activite_slug = ?
                 AND g.numero_groupe = ?
                 AND g.eleve_id != ?
                 AND r.contenu != ''
            """,
            (question_id, activite_slug, groupe, eleve_id),
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/reponses")
def poster_reponse() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    activite_slug = data.get("activite_slug", "").strip()
    question_id   = data.get("question_id", "").strip()
    contenu       = data.get("contenu", "")

    if not activite_slug or not question_id:
        return jsonify({"erreur": "Champs 'activite_slug' et 'question_id' requis"}), 400

    if len(contenu) > MAX_REPONSE_CHARS:
        return jsonify({
            "erreur": f"Réponse trop longue ({len(contenu)} caractères). Maximum autorisé : {MAX_REPONSE_CHARS}."
        }), 400

    modifie_le = datetime.now(timezone.utc).isoformat()
    save_reponse(activite_slug, eleve_id, question_id, contenu, modifie_le)
    return jsonify({"message": "Réponse enregistrée"}), 200


# ── Dépôts de fichiers — élève ────────────────────────────────────────────────

@app.get("/api/drops")
def api_get_drops() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    classe = get_eleve_classe(eleve_id)
    if not classe:
        return jsonify([])
    links = get_drop_links_for_classe(classe)
    for link in links:
        link["mes_fichiers"] = get_drop_fichiers_for_eleve(link["id"], eleve_id)
    return jsonify(links)


@app.post("/api/drops/<int:link_id>/upload")
def api_drop_upload(link_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err

    with get_connection() as conn:
        link = conn.execute(
            "SELECT id, is_open, classe FROM drop_links WHERE id = ?", (link_id,)
        ).fetchone()
    if not link:
        return jsonify({"erreur": "Lien introuvable"}), 404
    if not link["is_open"]:
        return jsonify({"erreur": "Ce lien de dépôt est fermé"}), 403

    classe = get_eleve_classe(eleve_id)
    if link["classe"] != "*" and link["classe"] != classe:
        return jsonify({"erreur": "Accès non autorisé pour cette classe"}), 403

    if "fichier" not in request.files:
        return jsonify({"erreur": "Aucun fichier reçu"}), 400
    f = request.files["fichier"]
    if not f.filename:
        return jsonify({"erreur": "Nom de fichier vide"}), 400

    ext = Path(f.filename).suffix.lower()
    if ext not in _DROP_ALLOWED_EXT:
        return jsonify({"erreur": f"Type non autorisé. Formats acceptés : {', '.join(sorted(_DROP_ALLOWED_EXT))}"}), 400

    data = f.read()
    if len(data) > MAX_DROP_FILE_BYTES:
        return jsonify({"erreur": f"Fichier trop volumineux (max {MAX_DROP_FILE_BYTES // 1024 // 1024} Mo)"}), 413

    nom_stocke = uuid.uuid4().hex + ext
    dest = UPLOADS_DIR / str(link_id)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / nom_stocke).write_bytes(data)

    nom_original = secure_filename(f.filename) or nom_stocke
    now = datetime.now(timezone.utc).isoformat()
    fichier_id = save_drop_fichier(
        link_id, eleve_id, nom_original, nom_stocke, len(data), f.content_type or "", now
    )
    return jsonify({"id": fichier_id, "nom_original": nom_original,
                    "taille": len(data), "uploade_le": now}), 201


@app.delete("/api/drops/fichiers/<int:fichier_id>")
def api_drop_delete_fichier(fichier_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    nom_stocke, link_id = delete_drop_fichier(fichier_id, eleve_id)
    if nom_stocke is None:
        return jsonify({"erreur": "Fichier introuvable ou non autorisé"}), 404
    path = UPLOADS_DIR / str(link_id) / nom_stocke
    if path.exists():
        path.unlink()
    return jsonify({"message": "Fichier supprimé"})


# ── Dépôts de fichiers — admin ─────────────────────────────────────────────────

@app.get("/api/admin/drops")
@require_admin
def admin_list_drops() -> Response:
    return jsonify(get_all_drop_links())


@app.post("/api/admin/drops")
@require_admin
def admin_create_drop() -> Response:
    data   = request.get_json(silent=True) or {}
    titre  = data.get("titre", "").strip()
    classe = data.get("classe", "").strip()
    if not titre or not classe:
        return jsonify({"erreur": "titre et classe requis"}), 400
    now  = datetime.now(timezone.utc).isoformat()
    link = create_drop_link(titre, classe, now)
    return jsonify(link), 201


@app.patch("/api/admin/drops/<int:link_id>")
@require_admin
def admin_update_drop(link_id: int) -> Response:
    data    = request.get_json(silent=True) or {}
    titre   = data.get("titre")
    is_open = data.get("is_open")
    now     = datetime.now(timezone.utc).isoformat()
    if not update_drop_link(link_id, titre, is_open, now):
        return jsonify({"erreur": "Lien introuvable"}), 404
    return jsonify({"message": "Mis à jour"})


@app.delete("/api/admin/drops/<int:link_id>")
@require_admin
def admin_delete_drop(link_id: int) -> Response:
    link_dir = UPLOADS_DIR / str(link_id)
    if link_dir.exists():
        shutil.rmtree(link_dir)
    delete_drop_link(link_id)
    return jsonify({"message": "Lien et fichiers supprimés"})


@app.get("/api/admin/drops/<int:link_id>/fichiers")
@require_admin
def admin_list_drop_fichiers(link_id: int) -> Response:
    return jsonify(get_drop_fichiers_for_link(link_id))


@app.get("/api/admin/drops/<int:link_id>/fichiers/<int:fichier_id>")
@require_admin
def admin_download_fichier(link_id: int, fichier_id: int) -> Response:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT nom_original, nom_stocke FROM drop_fichiers WHERE id = ? AND drop_link_id = ?",
            (fichier_id, link_id),
        ).fetchone()
    if not row:
        return jsonify({"erreur": "Fichier introuvable"}), 404
    return send_from_directory(
        UPLOADS_DIR / str(link_id),
        row["nom_stocke"],
        download_name=row["nom_original"],
        as_attachment=True,
    )


@app.delete("/api/admin/drops/<int:link_id>/fichiers/<int:fichier_id>")
@require_admin
def admin_delete_drop_fichier(link_id: int, fichier_id: int) -> Response:
    nom_stocke, _ = delete_drop_fichier(fichier_id)
    if nom_stocke is None:
        return jsonify({"erreur": "Fichier introuvable"}), 404
    path = UPLOADS_DIR / str(link_id) / nom_stocke
    if path.exists():
        path.unlink()
    return jsonify({"message": "Fichier supprimé"})


# ── Lancement ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("▶  Build du site…")
    site_builder.main()
    _reload_catalog()

    init_db()
    seed_test_data()
    print("✓  Base de données prête (data.db)")
    print(f"✓  Mot de passe admin : {ADMIN_PASSWORD}")
    print("✓  Comptes élèves : lancer seed_test.py pour créer dede01–dede20")
    print("▶  Serveur démarré sur http://127.0.0.1:5000\n")
    app.run(debug=True)
