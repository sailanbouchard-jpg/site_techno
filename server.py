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

import ftplib
import hashlib
import json
import os
import secrets
import mimetypes
import re
import shutil
import socket
import ssl
import threading
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory, session
from werkzeug.utils import secure_filename

import build as site_builder
import imprimante_bambu
from core.database import (
    authenticate,
    count_projets_cao,
    create_bloc_note,
    create_drop_link,
    create_note_volante,
    create_projet_cao,
    delete_bloc_note,
    delete_drop_fichier,
    delete_drop_link,
    delete_note_volante,
    delete_projet_cao,
    delete_sim_structure,
    enregistrer_indice,
    enregistrer_tentative,
    fichier_cao_existe,
    get_all_drop_links,
    get_bloc_notes,
    get_connection,
    get_defis_eleve,
    get_drop_fichiers_for_eleve,
    get_drop_fichiers_for_link,
    get_drop_links_for_classe,
    get_eleve_classe,
    get_eleve_niveau,
    get_groupe,
    get_notes_volantes,
    get_projet_cao,
    get_projets_cao,
    get_reponses,
    get_sim_structure,
    get_sim_structures,
    get_sim_niveaux,
    get_sim_pont,
    get_sim_catalogue,
    init_db,
    save_drop_fichier,
    save_fichier_cao,
    save_reponse,
    save_sim_structure,
    save_sim_niveau,
    save_sim_catalogue,
    seed_test_data,
    update_bloc_note,
    update_drop_link,
    update_note_volante,
    update_projet_cao,
)
from core.cyberdefis import catalogue_public, flag_correct, indice, lecon, DEFIS
from core.page_builder import build_navbar_html, inject_navbar_into_standalone
from core.page_catalog import build_catalog
from core.palette.palette_loader import load_all_palettes

# ── Config ─────────────────────────────────────────────────────────────────────

SITE_DIR            = Path(__file__).parent / "site"
CONTENT_DIR         = Path(__file__).parent / "contenu"
UPLOADS_DIR         = Path(__file__).parent / "uploads" / "drops"
UPLOADS_CAO_DIR     = Path(__file__).parent / "uploads" / "cao"
SIMULATEUR_DIR      = Path(__file__).parent / "simulateur-cmd"
ATELIER_3D_DIR      = Path(__file__).parent / "atelier-3d"
CYBERDEFIS_DIR      = Path(__file__).parent / "cyberdefis"
# Adresses et codes d'accès des imprimantes 3D du réseau local : propres à chaque poste, jamais versionnés.
IMPRIMANTES_FICHIER = Path(__file__).parent / "imprimantes.json"

# Sous Windows, le registre associe parfois .js à text/plain : les modules ES
# du simulateur exigent un type MIME JavaScript correct.
mimetypes.add_type("text/javascript", ".js")
# WebAssembly.instantiateStreaming refuse tout ce qui n'est pas application/wasm :
# sans cette ligne, le moteur de géométrie de l'Atelier 3D ne démarre pas.
mimetypes.add_type("application/wasm", ".wasm")
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


# ── Atelier 3D (dossier autonome, hors pipeline Markdown) ─────────────────────
#
# Servi depuis le dossier SOURCE, comme le simulateur : en développement, une
# modification d'un module ES est visible au rechargement, sans rebuild.
# build.py en dépose une copie dans site/cao/ pour que nginx puisse le servir
# directement en production, à la même URL.

@app.route("/cao/")
def serve_atelier_3d() -> Response:
    # La page porte la navbar du site, comme toutes les autres (voir build.py).
    navbar_template = (TEMPLATES_DIR / "navbar.html").read_text(encoding="utf-8")
    navbar_html = build_navbar_html(CATALOG, navbar_template, _PALETTES)
    page = (ATELIER_3D_DIR / "index.html").read_text(encoding="utf-8")
    return Response(inject_navbar_into_standalone(page, navbar_html), mimetype="text/html")


@app.route("/cao/<path:path>")
def serve_atelier_3d_fichier(path: str) -> Response:
    # Un dossier → son index.html (ex. /cao/v0/, la page de mesures du jalon V0).
    if (ATELIER_3D_DIR / path).is_dir():
        path = f"{path.rstrip('/')}/index.html"
    return send_from_directory(ATELIER_3D_DIR, path)


# ── Cyber-défis (sous-site autonome « à l'ancienne ») ─────────────────────────
#
# Ces pages sont servies TELLES QUELLES : chaque défi est un vrai fichier .html à
# une URL en .html, au code source court et lisible — c'est le sujet même de ces
# défis. La navbar du site y est ajoutée CÔTÉ CLIENT (cyberdefis/site-nav.js, qui
# lit /api/navbar) : ainsi la barre latérale est présente sur chaque page sans
# alourdir le code source du fichier que l'élève inspecte.

@app.route("/cyberdefis/", defaults={"path": ""})
@app.route("/cyberdefis/<path:path>")
def serve_cyberdefis(path: str) -> Response:
    if path == "" or (CYBERDEFIS_DIR / path).is_dir():
        path = f"{path.rstrip('/')}/index.html" if path else "index.html"
    return send_from_directory(CYBERDEFIS_DIR, path)


@app.get("/api/navbar")
def api_navbar() -> Response:
    """La navbar du site, bâtie à la volée — injectée côté client par site-nav.js."""
    navbar_template = (TEMPLATES_DIR / "navbar.html").read_text(encoding="utf-8")
    return Response(build_navbar_html(CATALOG, navbar_template, _PALETTES), mimetype="text/html")


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
    navbar_html = build_navbar_html(CATALOG, navbar_template, _PALETTES)
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


# ── Simulateur de structures — progression des niveaux ────────────────────────
# Étoiles (0 à 3), masse du pont validé et LE PONT lui-même, par niveau. Rejouer
# plus lourd ne fait perdre ni ses étoiles ni son pont : la base ne garde que le
# meilleur essai. Le pont se relit à part (route /pont) : la progression entière
# doit rester légère, elle est demandée à chaque ouverture du simulateur.

NIVEAUX_MAX_ID_CHARS = 60
# Un pont tient largement dedans (une scène de niveau chargée pèse ~10 ko) ; la
# borne est là pour qu'un envoi malformé ne remplisse pas la base.
PONT_MAX_OCTETS = 300_000


@app.get("/api/sim-niveaux")
def api_get_sim_niveaux() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    return jsonify(get_sim_niveaux(eleve_id))


@app.get("/api/sim-niveaux/<niveau_id>/pont")
def api_get_sim_pont(niveau_id: str) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    pont = get_sim_pont(eleve_id, niveau_id.strip()[:NIVEAUX_MAX_ID_CHARS])
    if pont is None:
        return jsonify({"erreur": "Pas de pont sauvegardé"}), 404
    return jsonify({"pont": json.loads(pont)})


@app.post("/api/sim-niveaux")
def api_save_sim_niveau() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    data      = request.get_json(silent=True) or {}
    niveau_id = (data.get("niveau_id") or "").strip()[:NIVEAUX_MAX_ID_CHARS]
    etoiles   = data.get("etoiles")
    masse_kg  = data.get("masse_kg")
    pont      = data.get("pont")
    signature = data.get("signature")
    if not niveau_id:
        return jsonify({"erreur": "Niveau manquant"}), 400
    if not isinstance(etoiles, int) or not 0 <= etoiles <= 3:
        return jsonify({"erreur": "Nombre d'étoiles invalide"}), 400
    if not isinstance(masse_kg, (int, float)) or masse_kg < 0:
        return jsonify({"erreur": "Masse invalide"}), 400
    pont_json = None
    if pont is not None:
        pont_json = json.dumps(pont, ensure_ascii=False)
        if len(pont_json.encode("utf-8")) > PONT_MAX_OCTETS:
            return jsonify({"erreur": "Pont trop volumineux"}), 413
    signature = str(signature)[:64] if signature is not None else None
    now = datetime.now(timezone.utc).isoformat()
    return jsonify(save_sim_niveau(
        eleve_id, niveau_id, etoiles, float(masse_kg), now, pont_json, signature,
    )), 201


# ── Simulateur de structures — catalogue de niveaux ───────────────────────────
# Lecture PUBLIQUE : tout élève doit pouvoir charger les niveaux. Écriture
# réservée à l'ADMINISTRATEUR, qui crée, modifie et supprime les niveaux depuis
# le simulateur lui-même. Le catalogue est envoyé en entier à chaque
# enregistrement (voir core/database.py).

CATALOGUE_MAX_OCTETS = 400_000


@app.get("/api/sim-catalogue")
def api_get_sim_catalogue() -> Response:
    contenu = get_sim_catalogue()
    return jsonify({"catalogue": json.loads(contenu) if contenu else None})


@app.put("/api/sim-catalogue")
@require_admin
def api_save_sim_catalogue() -> Response:
    data = request.get_json(silent=True) or {}
    catalogue = data.get("catalogue")
    if not isinstance(catalogue, list) or not catalogue:
        return jsonify({"erreur": "Catalogue invalide"}), 400
    contenu = json.dumps(catalogue, ensure_ascii=False)
    if len(contenu.encode("utf-8")) > CATALOGUE_MAX_OCTETS:
        return jsonify({"erreur": "Catalogue trop volumineux"}), 400
    save_sim_catalogue(contenu, datetime.now(timezone.utc).isoformat())
    return jsonify({"message": "Catalogue enregistré"})


# ── Atelier 3D — projets et fichiers élève ────────────────────────────────────
# Même principe que les sauvegardes du simulateur : l'atelier (/cao/) tourne sur
# la même origine, le cookie de session suit tout seul, et chaque élève ne voit
# que ses propres projets. Sans connexion, l'atelier enregistre dans le
# navigateur et ces routes ne sont jamais appelées.

FORMAT_DOCUMENT_CAO        = "cao-college"
MAX_CAO_NOM_CHARS          = 80
MAX_CAO_DOCUMENT_CHARS     = 2 * 1024 * 1024
MAX_CAO_VIGNETTE_CHARS     = 300 * 1024
MAX_CAO_PROJETS_PAR_ELEVE  = 100
MAX_CAO_FICHIER_BYTES      = 20 * 1024 * 1024
PREFIXE_VIGNETTE_CAO       = "data:image/png;base64,"
EXTENSION_FICHIER_CAO      = ".stl"
# La clé d'un fichier importé est calculée par l'atelier à partir de son contenu
# (geometrie/cle_de_fichier.js) : 40 caractères hexadécimaux, rien d'autre.
FORMAT_CLE_CAO             = re.compile(r"^[0-9a-f]{40}$")


def _lire_projet_cao(data: dict):
    """Valide le corps d'une création ou d'un enregistrement. Rend (valeurs, erreur)."""
    nom      = (data.get("nom") or "").strip()[:MAX_CAO_NOM_CHARS]
    document = data.get("document")
    vignette = data.get("vignette")

    if not nom:
        return None, (jsonify({"erreur": "Le projet doit avoir un nom"}), 400)
    if (not isinstance(document, dict) or document.get("format") != FORMAT_DOCUMENT_CAO
            or not isinstance(document.get("version"), int)):
        return None, (jsonify({"erreur": "Ce n'est pas un projet de l'Atelier 3D"}), 400)

    document_json = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
    if len(document_json) > MAX_CAO_DOCUMENT_CHARS:
        return None, (jsonify({"erreur": "Projet trop volumineux"}), 413)

    if vignette is not None and (not isinstance(vignette, str)
                                 or not vignette.startswith(PREFIXE_VIGNETTE_CAO)
                                 or len(vignette) > MAX_CAO_VIGNETTE_CHARS):
        return None, (jsonify({"erreur": "Vignette invalide"}), 400)

    return {"nom": nom, "document_json": document_json, "vignette": vignette}, None


@app.get("/api/cao/projets")
def api_get_projets_cao() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    return jsonify(get_projets_cao(eleve_id))


@app.get("/api/cao/projets/<int:projet_id>")
def api_get_projet_cao(projet_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    projet = get_projet_cao(projet_id, eleve_id)
    if projet is None:
        return jsonify({"erreur": "Projet introuvable"}), 404
    return jsonify({
        "id":         projet["id"],
        "nom":        projet["nom"],
        "modifie_le": projet["modifie_le"],
        "document":   json.loads(projet["document_json"]),
    })


@app.post("/api/cao/projets")
def api_create_projet_cao() -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    if count_projets_cao(eleve_id) >= MAX_CAO_PROJETS_PAR_ELEVE:
        return jsonify({"erreur": f"Tu as déjà {MAX_CAO_PROJETS_PAR_ELEVE} projets : supprimes-en avant d'en créer"}), 409
    valeurs, err = _lire_projet_cao(request.get_json(silent=True) or {})
    if err:
        return err
    now = datetime.now(timezone.utc).isoformat()
    projet_id = create_projet_cao(eleve_id, valeurs["nom"], valeurs["document_json"], valeurs["vignette"], now)
    return jsonify({"id": projet_id, "modifie_le": now}), 201


@app.put("/api/cao/projets/<int:projet_id>")
def api_update_projet_cao(projet_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    valeurs, err = _lire_projet_cao(request.get_json(silent=True) or {})
    if err:
        return err
    now = datetime.now(timezone.utc).isoformat()
    if not update_projet_cao(projet_id, eleve_id, valeurs["nom"], valeurs["document_json"], valeurs["vignette"], now):
        return jsonify({"erreur": "Projet introuvable"}), 404
    return jsonify({"id": projet_id, "modifie_le": now})


@app.delete("/api/cao/projets/<int:projet_id>")
def api_delete_projet_cao(projet_id: int) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    if not delete_projet_cao(projet_id, eleve_id):
        return jsonify({"erreur": "Projet introuvable"}), 404
    return jsonify({"message": "Projet supprimé"})


@app.get("/api/cao/fichiers/<cle>")
def api_get_fichier_cao(cle: str) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    if not FORMAT_CLE_CAO.match(cle) or not fichier_cao_existe(eleve_id, cle):
        return jsonify({"erreur": "Fichier introuvable"}), 404
    return send_from_directory(UPLOADS_CAO_DIR / str(eleve_id), cle + EXTENSION_FICHIER_CAO,
                               mimetype="application/octet-stream", max_age=0)


@app.put("/api/cao/fichiers/<cle>")
def api_put_fichier_cao(cle: str) -> Response:
    eleve_id, err = _require_login()
    if err:
        return err
    if not FORMAT_CLE_CAO.match(cle):
        return jsonify({"erreur": "Clé de fichier invalide"}), 400
    trop_gros = jsonify({"erreur": f"Fichier trop volumineux (maximum {MAX_CAO_FICHIER_BYTES // 1024 // 1024} Mo)"}), 413
    # La taille annoncée permet de refuser sans rien lire ; sans elle (envoi par
    # morceaux), on lit et on vérifie après — MAX_CONTENT_LENGTH borne la lecture.
    if request.content_length is not None and request.content_length > MAX_CAO_FICHIER_BYTES:
        return trop_gros

    if not fichier_cao_existe(eleve_id, cle):
        octets = request.get_data(cache=False)
        if not octets:
            return jsonify({"erreur": "Fichier vide"}), 400
        if len(octets) > MAX_CAO_FICHIER_BYTES:
            return trop_gros
        dossier = UPLOADS_CAO_DIR / str(eleve_id)
        dossier.mkdir(parents=True, exist_ok=True)
        (dossier / (cle + EXTENSION_FICHIER_CAO)).write_bytes(octets)
        nom = secure_filename(request.args.get("nom", "")) or cle + EXTENSION_FICHIER_CAO
        save_fichier_cao(eleve_id, cle, nom, len(octets), datetime.now(timezone.utc).isoformat())
    return jsonify({"cle": cle}), 201


# ── Atelier 3D — bibliothèque d'objets paramétriques ─────────────────────────
# Commune à tous : un fichier JSON par modèle dans atelier-3d/bibliotheque/,
# plus un index. L'atelier la lit comme ses autres fichiers (/cao/bibliotheque/…),
# y compris hors connexion ; seul l'administrateur y écrit. build.py la recopie
# dans site/cao/ ; on y écrit aussi la copie, pour que nginx serve la nouvelle
# version sans attendre le prochain build.

FORMAT_MODELE_CAO          = "cao-college-modele"
DOSSIER_BIBLIOTHEQUE_CAO   = ATELIER_3D_DIR / "bibliotheque"
COPIE_BIBLIOTHEQUE_CAO     = SITE_DIR / "cao" / "bibliotheque"
INDEX_BIBLIOTHEQUE_CAO     = "index.json"
MAX_CAO_DESCRIPTION_CHARS  = 400
FORMAT_ID_MODELE_CAO       = re.compile(r"^[a-z0-9_]{1,50}$")


def _ecrire_json_bibliotheque(nom_fichier: str, contenu) -> None:
    """Écrit un fichier de la bibliothèque (source et copie servie), sans jamais laisser un fichier à moitié écrit."""
    texte = json.dumps(contenu, ensure_ascii=False, indent=1)
    for dossier in (DOSSIER_BIBLIOTHEQUE_CAO, COPIE_BIBLIOTHEQUE_CAO):
        if dossier == COPIE_BIBLIOTHEQUE_CAO and not dossier.parent.is_dir():
            continue
        dossier.mkdir(parents=True, exist_ok=True)
        provisoire = dossier / (nom_fichier + ".tmp")
        provisoire.write_text(texte, encoding="utf-8")
        os.replace(provisoire, dossier / nom_fichier)


def _lire_index_bibliotheque() -> list:
    chemin = DOSSIER_BIBLIOTHEQUE_CAO / INDEX_BIBLIOTHEQUE_CAO
    if not chemin.is_file():
        return []
    try:
        index = json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return index if isinstance(index, list) else []


@app.put("/api/cao/bibliotheque/<ident>")
@require_admin
def api_put_modele_cao(ident: str) -> Response:
    if not FORMAT_ID_MODELE_CAO.match(ident):
        return jsonify({"erreur": "Identifiant de modèle invalide"}), 400
    data        = request.get_json(silent=True) or {}
    nom         = (data.get("nom") or "").strip()[:MAX_CAO_NOM_CHARS]
    description = (data.get("description") or "").strip()[:MAX_CAO_DESCRIPTION_CHARS]
    document    = data.get("document")
    if not nom:
        return jsonify({"erreur": "L'objet doit avoir un nom"}), 400
    if (not isinstance(document, dict) or document.get("format") != FORMAT_DOCUMENT_CAO
            or not isinstance(document.get("version"), int)):
        return jsonify({"erreur": "Ce n'est pas un projet de l'Atelier 3D"}), 400
    if len(json.dumps(document, ensure_ascii=False)) > MAX_CAO_DOCUMENT_CHARS:
        return jsonify({"erreur": "Objet trop volumineux"}), 413

    modifie_le = datetime.now(timezone.utc).isoformat()
    _ecrire_json_bibliotheque(ident + ".json", {
        "format": FORMAT_MODELE_CAO, "id": ident, "nom": nom,
        "description": description, "modifie_le": modifie_le, "document": document,
    })
    index = [e for e in _lire_index_bibliotheque() if isinstance(e, dict) and e.get("id") != ident]
    index.append({"id": ident, "nom": nom, "description": description, "modifie_le": modifie_le})
    index.sort(key=lambda e: str(e.get("nom", "")).lower())
    _ecrire_json_bibliotheque(INDEX_BIBLIOTHEQUE_CAO, index)
    return jsonify({"id": ident, "modifie_le": modifie_le})


@app.delete("/api/cao/bibliotheque/<ident>")
@require_admin
def api_delete_modele_cao(ident: str) -> Response:
    if not FORMAT_ID_MODELE_CAO.match(ident):
        return jsonify({"erreur": "Identifiant de modèle invalide"}), 400
    index = _lire_index_bibliotheque()
    restant = [e for e in index if isinstance(e, dict) and e.get("id") != ident]
    if len(restant) == len(index):
        return jsonify({"erreur": "Modèle introuvable"}), 404
    _ecrire_json_bibliotheque(INDEX_BIBLIOTHEQUE_CAO, restant)
    # Le fichier du modèle reste sur le disque : un projet qui l'utilise encore
    # peut être réparé en le remettant dans l'index.
    return jsonify({"message": "Retiré de la bibliothèque"})


# ── Atelier 3D — imprimantes Bambu Lab en réseau local ────────────────────────
# Le navigateur ne sait parler ni MQTT ni FTPS : le serveur fait le pont
# (imprimante_bambu.py). Il doit donc tourner sur le même réseau que les
# imprimantes. Réservé à l'administrateur : le code d'accès donne la main sur la machine.

MODELES_IMPRIMANTE       = {"C11", "C12"}          # P1P, P1S
ACTIONS_IMPRIMANTE       = {"pause": "pause", "reprendre": "resume", "arreter": "stop"}
FORMAT_ID_IMPRIMANTE     = re.compile(r"^[a-z0-9_-]{1,40}$")
FORMAT_NUMERO_SERIE      = re.compile(r"^[A-Z0-9]{8,20}$")
FORMAT_CODE_ACCES        = re.compile(r"^[A-Za-z0-9]{8}$")
FORMAT_COULEUR           = re.compile(r"^#[0-9A-Fa-f]{6}$")
MATIERES_IMPRIMANTE      = {"PLA", "PETG"}
BUSES_IMPRIMANTE         = {0.2, 0.4, 0.6, 0.8}    # les diametres que les P1 acceptent
ETATS_OCCUPES            = {"RUNNING", "PAUSE", "PREPARE"}
_imprimantes_connectees: dict = {}                 # id → imprimante_bambu.Imprimante
_verrou_imprimantes      = threading.Lock()


def _lire_imprimantes() -> dict:
    if not IMPRIMANTES_FICHIER.is_file():
        return {}
    try:
        donnees = json.loads(IMPRIMANTES_FICHIER.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return donnees if isinstance(donnees, dict) else {}


def _ecrire_imprimantes(imprimantes: dict) -> None:
    IMPRIMANTES_FICHIER.write_text(json.dumps(imprimantes, ensure_ascii=False, indent=2), encoding="utf-8")


def _connexion_imprimante(ident: str, config: dict):
    """La connexion MQTT de l'imprimante, ouverte au premier besoin et gardée ensuite."""
    cle = (config["ip"], config["numero_serie"], config["code_acces"])
    with _verrou_imprimantes:
        connue = _imprimantes_connectees.get(ident)
        if connue is not None and (connue.ip, connue.numero_serie, connue.code_acces) == cle:
            return connue
        if connue is not None:
            connue.arreter()
        nouvelle = imprimante_bambu.Imprimante(*cle)
        _imprimantes_connectees[ident] = nouvelle
        return nouvelle


def _infos_pour_3mf(data: dict):
    """Les informations du fichier à imprimer, vérifiées : (infos, erreur)."""
    gcode = data.get("gcode")
    if not isinstance(gcode, str) or "; MACHINE_START_GCODE_END" not in gcode:
        return None, "G-code manquant"
    modele = data.get("modele")
    matiere = data.get("matiere")
    couleur = data.get("couleur") or "#FFFFFF"
    if modele not in MODELES_IMPRIMANTE or matiere not in MATIERES_IMPRIMANTE or not FORMAT_COULEUR.match(couleur):
        return None, "Informations du fichier invalides"
    try:
        chiffres = {k: float(data.get(k)) for k in ("duree", "poids", "longueur")}
        # Le diametre de buse figure dans le fichier : l'imprimante verifie qu'il
        # correspond a la buse montee. Les anciens clients ne l'envoyaient pas.
        buse = round(float(data.get("buse", 0.4)), 2)
    except (TypeError, ValueError):
        return None, "Informations du fichier invalides"
    if buse not in BUSES_IMPRIMANTE:
        return None, "Diametre de buse inconnu"
    return {"modele": modele, "matiere": matiere, "buse": buse, "couleur": couleur.upper(), **chiffres}, None


def _nom_de_fichier_3mf(nom: str) -> str:
    # L'imprimante range le fichier à la racine de sa carte : un nom ASCII sans espace.
    propre = re.sub(r"[^A-Za-z0-9_-]+", "_", nom).strip("_")[:40] or "atelier3d"
    return propre + ".gcode.3mf"


@app.post("/api/cao/gcode3mf")
def api_gcode_3mf() -> Response:
    data = request.get_json(silent=True) or {}
    infos, err = _infos_pour_3mf(data)
    if err:
        return jsonify({"erreur": err}), 400
    archive = imprimante_bambu.construire_3mf(data["gcode"], infos)
    return Response(archive, mimetype="application/octet-stream", headers={
        "Content-Disposition": f'attachment; filename="{_nom_de_fichier_3mf(str(data.get("nom", "")))}"',
    })


@app.get("/api/imprimantes")
@require_admin
def api_get_imprimantes() -> Response:
    liste = []
    for ident, config in sorted(_lire_imprimantes().items()):
        liste.append({
            "id": ident, "nom": config.get("nom", ident), "modele": config.get("modele", "C12"),
            "ip": config["ip"], "numero_serie": config["numero_serie"],
            "etat": _connexion_imprimante(ident, config).resume(),
        })
    return jsonify(liste)


@app.put("/api/imprimantes/<ident>")
@require_admin
def api_put_imprimante(ident: str) -> Response:
    if not FORMAT_ID_IMPRIMANTE.match(ident):
        return jsonify({"erreur": "Identifiant d'imprimante invalide"}), 400
    data = request.get_json(silent=True) or {}
    imprimantes = _lire_imprimantes()
    ancienne = imprimantes.get(ident, {})
    ip = str(data.get("ip", "")).strip()
    numero_serie = str(data.get("numero_serie", "")).strip().upper()
    # Un code d'accès laissé vide garde le précédent : l'Atelier ne le relit jamais.
    code_acces = str(data.get("code_acces") or ancienne.get("code_acces", "")).strip()
    modele = data.get("modele", "C12")
    try:
        socket.inet_aton(ip)
    except OSError:
        return jsonify({"erreur": "Adresse IP invalide"}), 400
    if not FORMAT_NUMERO_SERIE.match(numero_serie):
        return jsonify({"erreur": "Numéro de série invalide"}), 400
    if not FORMAT_CODE_ACCES.match(code_acces):
        return jsonify({"erreur": "Le code d'accès a 8 caractères"}), 400
    if modele not in MODELES_IMPRIMANTE:
        return jsonify({"erreur": "Modèle d'imprimante inconnu"}), 400
    imprimantes[ident] = {
        "nom": str(data.get("nom") or ident).strip()[:60], "modele": modele,
        "ip": ip, "numero_serie": numero_serie, "code_acces": code_acces,
    }
    _ecrire_imprimantes(imprimantes)
    return jsonify({"id": ident})


@app.delete("/api/imprimantes/<ident>")
@require_admin
def api_delete_imprimante(ident: str) -> Response:
    imprimantes = _lire_imprimantes()
    if imprimantes.pop(ident, None) is None:
        return jsonify({"erreur": "Imprimante inconnue"}), 404
    _ecrire_imprimantes(imprimantes)
    with _verrou_imprimantes:
        connue = _imprimantes_connectees.pop(ident, None)
    if connue is not None:
        connue.arreter()
    return jsonify({"message": "Imprimante retirée"})


@app.post("/api/imprimantes/<ident>/impression")
@require_admin
def api_imprimer(ident: str) -> Response:
    config = _lire_imprimantes().get(ident)
    if config is None:
        return jsonify({"erreur": "Imprimante inconnue"}), 404
    data = request.get_json(silent=True) or {}
    infos, err = _infos_pour_3mf(data)
    if err:
        return jsonify({"erreur": err}), 400
    if infos["modele"] != config.get("modele", "C12"):
        return jsonify({"erreur": "Le plateau est tranché pour un autre modèle d'imprimante"}), 400
    imprimante = _connexion_imprimante(ident, config)
    if not imprimante.connectee:
        return jsonify({"erreur": "Imprimante injoignable : " + (imprimante.erreur or "connexion en cours")}), 503
    if imprimante.etat.get("gcode_state") in ETATS_OCCUPES:
        return jsonify({"erreur": "L'imprimante est déjà en train d'imprimer"}), 409
    # La bobine : un emplacement de l'AMS (0 à 15), ou None pour la bobine externe.
    emplacement = data.get("emplacement")
    if emplacement is not None and (not isinstance(emplacement, int) or not 0 <= emplacement <= 15):
        return jsonify({"erreur": "Emplacement de bobine invalide"}), 400
    nom = str(data.get("nom") or "Atelier 3D").strip()[:60]
    archive = imprimante_bambu.construire_3mf(data["gcode"], infos)
    try:
        imprimante_bambu.envoyer_et_imprimer(imprimante, _nom_de_fichier_3mf(nom), nom, archive, emplacement)
    except (OSError, EOFError, ConnectionError, ftplib.Error) as e:
        return jsonify({"erreur": f"Envoi impossible : {e}"}), 502
    return jsonify({"message": "Impression lancée"})


@app.get("/api/imprimantes/<ident>/camera")
@require_admin
def api_camera_imprimante(ident: str) -> Response:
    """La caméra en direct, en MJPEG : une balise <img> l'affiche sans autre code."""
    config = _lire_imprimantes().get(ident)
    if config is None:
        return jsonify({"erreur": "Imprimante inconnue"}), 404

    def flux():
        try:
            for image in imprimante_bambu.images_camera(config["ip"], config["code_acces"]):
                entete = b"--image\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(image)).encode() + b"\r\n\r\n"
                yield entete + image + b"\r\n"
        except (OSError, ConnectionError, ssl.SSLError):
            return

    return Response(flux(), mimetype="multipart/x-mixed-replace; boundary=image",
                    headers={"Cache-Control": "no-store"})


@app.post("/api/imprimantes/<ident>/commande")
@require_admin
def api_commande_imprimante(ident: str) -> Response:
    config = _lire_imprimantes().get(ident)
    if config is None:
        return jsonify({"erreur": "Imprimante inconnue"}), 404
    action = ACTIONS_IMPRIMANTE.get((request.get_json(silent=True) or {}).get("action"))
    if action is None:
        return jsonify({"erreur": "Commande inconnue"}), 400
    try:
        _connexion_imprimante(ident, config).commande(action)
    except (OSError, ConnectionError) as e:
        return jsonify({"erreur": str(e)}), 503
    return jsonify({"message": "Commande envoyée"})


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


# ── Cyber-défis ───────────────────────────────────────────────────────────────
#
# Le flag ne descend jamais dans le navigateur : la page envoie la proposition,
# le serveur répond oui ou non. La progression n'est enregistrée que pour un
# élève connecté — un visiteur non connecté peut jouer, sans rien conserver.

MAX_TENTATIVES_PAR_MINUTE = 30

# {clé (élève ou adresse IP) → [horodatages des tentatives récentes]}.
# En mémoire seulement : un redémarrage du serveur remet tout le monde à zéro,
# ce qui est sans conséquence pour un garde-fou de salle de classe.
_TENTATIVES_RECENTES: dict = {}


def _trop_de_tentatives(cle: str) -> bool:
    maintenant = datetime.now(timezone.utc).timestamp()
    recentes = [t for t in _TENTATIVES_RECENTES.get(cle, []) if maintenant - t < 60]
    recentes.append(maintenant)
    _TENTATIVES_RECENTES[cle] = recentes
    return len(recentes) > MAX_TENTATIVES_PAR_MINUTE


@app.get("/api/defi/catalogue")
def api_defi_catalogue() -> Response:
    """Catégories, titres et résumés des défis. Ni flags, ni indices, ni leçons."""
    return jsonify(catalogue_public())


@app.get("/api/defi/progression")
def api_defi_progression() -> Response:
    eleve_id = session.get("eleve_id")
    if eleve_id is None:
        return jsonify({"connecte": False, "defis": []})
    return jsonify({"connecte": True, "defis": get_defis_eleve(eleve_id)})


@app.post("/api/defi/verifier")
def api_defi_verifier() -> Response:
    data        = request.get_json(silent=True) or {}
    defi_id     = data.get("defi", "").strip()
    proposition = data.get("proposition", "")

    if defi_id not in DEFIS:
        return jsonify({"erreur": "Défi inconnu"}), 404

    eleve_id = session.get("eleve_id")
    if _trop_de_tentatives(str(eleve_id or request.remote_addr)):
        return jsonify({"erreur": "Trop de tentatives — attends une minute."}), 429

    resolu = flag_correct(defi_id, proposition)

    if eleve_id is not None:
        enregistrer_tentative(eleve_id, defi_id, resolu, datetime.now(timezone.utc).isoformat())

    # La leçon ne part qu'une fois le défi résolu : c'est sa récompense.
    return jsonify({"resolu": resolu, "lecon": lecon(defi_id) if resolu else None})


@app.post("/api/defi/indice")
def api_defi_indice() -> Response:
    data    = request.get_json(silent=True) or {}
    defi_id = data.get("defi", "").strip()
    numero  = data.get("numero", 0)

    if defi_id not in DEFIS:
        return jsonify({"erreur": "Défi inconnu"}), 404

    texte = indice(defi_id, numero)
    if texte is None:
        return jsonify({"erreur": "Plus d'indice pour ce défi"}), 404

    eleve_id = session.get("eleve_id")
    if eleve_id is not None:
        enregistrer_indice(eleve_id, defi_id, numero)

    return jsonify({"indice": texte})


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
