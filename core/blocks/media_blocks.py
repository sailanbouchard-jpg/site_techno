"""
blocks/media_blocks.py
----------------------
Renders media content blocks to HTML wrapper divs.

SIZE SCALE (page-absolute max-width — NOT relative to container):
  xxs = 165px   xs = 300px   s = 440px   m = 575px   l = 715px   xl = 850px   xxl = 990px

  These are pixel values based on 1100px page width, so a "medium" image
  always looks medium whether it is inside a column or not.
  (A percentage width would shrink inside narrow columns: 50% of 50% = 25%)

  This is the ONE place these numbers live. Every consumer (img/gif/vid/pdf
  wrappers, ::schema, the size dropdown in outils_schema.html, the =pdf>
  height reference table in flag_detector.py) reads from here — changing a
  value here must never break anything downstream. If it does, that
  downstream code is hardcoding a duplicate and should read this dict instead.

PDF SPECIFICS:
  Width is controlled by size= (same scale as images).
  Height is stored in attrs["height_vh"] (an integer, unit is vh).
  This value is computed by flag_detector.detect_pdf_flags().

MEDIA RESOLUTION:
  File names are unique across all of /contenu/medias/.
  At build time, build.py scans that folder recursively and passes a
  media_map dict ({filename: relative_url_path}) via the render context.
  _resolve_media_url() uses this map so the correct URL is always emitted,
  regardless of which subfolder the file actually lives in.

TO ADD A NEW MEDIA TYPE:
  1. Write a render_X() function below
  2. Register it in registry.py under MEDIA_BLOCK_RENDERERS
"""

from core.parser.token_types import Token


# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

_SIZE_TO_MAX_WIDTH = {
    "xxs": "165px",
    "xs":  "300px",
    "s":   "440px",
    "m":   "575px",
    "l":   "715px",
    "xl":  "850px",
    "xxl": "990px",
}

_DEFAULT_MEDIA_SIZE  = "m"
_DEFAULT_MEDIA_ALIGN = "centre"

# Sans ça, le lecteur PDF du navigateur garde le panneau latéral ouvert d'une page à l'autre
# (préférence globale) — avec 20+ PDF sur une même page ça ouvre 20 panneaux et ça rame.
_PDF_VIEWER_FRAGMENT = "#pagemode=none"

# Variante "raw" (=pdf> raw ...) : rendu canvas via pdf.js auto-hébergé,
# sans passer par le lecteur PDF intégré du navigateur (voir render_pdf).
_PDFJS_SCRIPT        = "/static/libs/pdfjs/pdf.min.js"
_PDFJS_VIEWER_SCRIPT = "/static/libs/pdf_raw_viewer.js"

# Icônes SVG inline pour les boutons du bloc =pdf> (pas de CDN, couleur via currentColor)
_ICON_OUVRIR_ONGLET = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>'
    '</svg>'
)

_ICON_TELECHARGER = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>'
    '</svg>'
)

_ALIGN_TO_CSS = {
    "gauche": "margin-left: 0; margin-right: auto;",
    "centre": "margin-left: auto; margin-right: auto;",
    "droite": "margin-left: auto; margin-right: 0;",
}

# ─────────────────────────────────────────────────────────────
# PUBLIC RENDER FUNCTIONS
# ─────────────────────────────────────────────────────────────

def render_image(token: Token, context: dict) -> str:
    """=img> — static image."""
    src    = _resolve_media_url(token.value, context)
    alt    = token.attrs.get("legend", token.value)
    style  = _build_media_wrapper_style(token)
    legend = _build_legend_html(token)
    return (
        f'<div class="media media-img" style="{style}">'
        f'<img src="{src}" alt="{alt}">'
        f'{legend}'
        f'</div>'
    )


def render_gif(token: Token, context: dict) -> str:
    """=gif> — animated GIF (click to pause/resume, handled in base.html JS)."""
    src    = _resolve_media_url(token.value, context)
    alt    = token.attrs.get("legend", token.value)
    style  = _build_media_wrapper_style(token)
    legend = _build_legend_html(token)
    return (
        f'<div class="media media-gif" style="{style}">'
        f'<img src="{src}" alt="{alt}" class="gif-img">'
        f'{legend}'
        f'</div>'
    )


def render_video(token: Token, context: dict) -> str:
    """=vid> — local video file or YouTube URL (auto-detected by URL pattern)."""
    filename = token.value
    style    = _build_media_wrapper_style(token)
    legend   = _build_legend_html(token)

    if "youtube.com" in filename or "youtu.be" in filename:
        embed_url = _convert_youtube_url_to_embed(filename)
        inner = f'<iframe src="{embed_url}" frameborder="0" allowfullscreen></iframe>'
    else:
        src   = _resolve_media_url(filename, context)
        inner = f'<video src="{src}" controls></video>'

    return (
        f'<div class="media media-vid" style="{style}">'
        f'{inner}'
        f'{legend}'
        f'</div>'
    )


def render_pdf(token: Token, context: dict) -> str:
    """
    =pdf> — embedded PDF viewer (iframe) with "ouvrir dans un nouvel onglet"
    et "télécharger" buttons.
    Width: from size= (same scale as images).
    Height: from height_vh attr (computed by flag_detector, always in vh).

    =pdf> raw — variante brute : ni boutons, ni bordure, ni barre d'outils/
    panneau/scrollbar. Le navigateur ignore les paramètres d'URL type
    #toolbar=0 sur son lecteur PDF intégré (Firefox les ignore totalement),
    donc cette variante ne passe pas par <iframe> : elle dessine chaque page
    sur un <canvas> via pdf.js (auto-hébergé, static/libs/pdfjs/) et pose
    une couche de texte invisible par-dessus pour garder la sélection.
    Rendu fait côté client par static/libs/pdf_raw_viewer.js.

    =pdf> horizontal — même rendu pdf.js que raw, mais les pages sont posées
    côte à côte dans une bande qui défile vers la droite (une page = largeur
    du bloc, calage page par page). Seule la barre de défilement du navigateur.
    """
    src    = _resolve_media_url(token.value, context)
    legend = _build_legend_html(token)
    raw    = token.attrs.get("raw", False)
    horizontal = token.attrs.get("horizontal", False)

    size      = token.attrs.get("size", _DEFAULT_MEDIA_SIZE)
    max_width = _SIZE_TO_MAX_WIDTH.get(size, _SIZE_TO_MAX_WIDTH[_DEFAULT_MEDIA_SIZE])
    align     = token.attrs.get("align", _DEFAULT_MEDIA_ALIGN)
    align_css = _ALIGN_TO_CSS.get(align, _ALIGN_TO_CSS[_DEFAULT_MEDIA_ALIGN])
    height_vh = token.attrs.get("height_vh", 100)
    height_css = f"{int(height_vh)}vh"

    style = f"max-width: {max_width}; width: 100%; height: {height_css}; {align_css}"

    if raw or horizontal:
        # Pas de hauteur forcée ici : les pages (canvas) imposent leur propre
        # hauteur naturelle (ex. ratio A4) et la page web défile normalement,
        # au lieu d'un ascenseur interne qui donnerait un effet "PDF incrusté".
        raw_style = f"max-width: {max_width}; width: 100%; {align_css}"
        inner_class = "block-pdf-raw pdf-horizontal" if horizontal else "block-pdf-raw"
        top_bar = ""
        if horizontal:
            raw_style += " " + _build_pdf_horizontal_vars(context)
            # Barre du haut : faux curseur piloté par pdf_raw_viewer.js (pas une 2e zone défilante)
            top_bar = (
                _build_pdf_pager_html()
                + '<div class="pdf-scroll-top"><div class="pdf-scroll-top-thumb"></div></div>'
            )
        viewer = f'<div class="{inner_class}" data-pdf-src="{src}"></div>'
        if horizontal and token.attrs.get("fleches", False):
            # Boutons cachés au départ : pdf_raw_viewer.js les affiche selon les pages voisines
            viewer = (
                f'<div class="pdf-nav-zone">'
                f'{viewer}'
                f'<button type="button" class="pdf-nav pdf-nav-prev" aria-label="Page précédente" hidden><span>&lsaquo;</span></button>'
                f'<button type="button" class="pdf-nav pdf-nav-next" aria-label="Page suivante" hidden><span>&rsaquo;</span></button>'
                f'</div>'
            )
        return (
            f'<div class="media media-pdf-raw" style="{raw_style}">'
            f'{top_bar}'
            f'{viewer}'
            f'{legend}'
            f'<script src="{_PDFJS_SCRIPT}" defer></script>'
            f'<script src="{_PDFJS_VIEWER_SCRIPT}" defer></script>'
            f'</div>'
        )

    viewer_src = src + _PDF_VIEWER_FRAGMENT  # sidebar fermée par défaut (sinon le navigateur l'ouvre sur chaque PDF de la page)
    actions    = _build_pdf_actions_html(src, viewer_src, context)

    return (
        f'<div class="media media-pdf" style="{style}">'
        f'{actions}'
        f'<iframe src="{viewer_src}"></iframe>'
        f'{legend}'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────

def _resolve_media_url(filename: str, context: dict) -> str:
    """
    Look up filename in the media_map built at build time by scanning /contenu/medias/.
    Returns the absolute URL for use in <img src="...">, etc.
    Falls back to /medias/{filename} if the file isn't in the map.
    """
    media_map = context.get("media_map", {})
    rel_path  = media_map.get(filename)
    if rel_path:
        return "/medias/" + rel_path
    return "/medias/" + filename


def _build_media_wrapper_style(token: Token) -> str:
    """Build the inline style for image/gif/video wrapper divs."""
    size      = token.attrs.get("size", _DEFAULT_MEDIA_SIZE)
    max_width = _SIZE_TO_MAX_WIDTH.get(size, _SIZE_TO_MAX_WIDTH[_DEFAULT_MEDIA_SIZE])
    align     = token.attrs.get("align", _DEFAULT_MEDIA_ALIGN)
    align_css = _ALIGN_TO_CSS.get(align, _ALIGN_TO_CSS[_DEFAULT_MEDIA_ALIGN])
    return f"max-width: {max_width}; width: 100%; {align_css}"


def _build_pdf_horizontal_vars(context: dict) -> str:
    """Variables CSS (compteur + barres de défilement) du mode =pdf> horizontal."""
    pdf_pal = context.get("palette", {}).get("pdf", {})
    fond          = pdf_pal.get("compteur_fond",        "#ffffff")
    bordure       = pdf_pal.get("compteur_bordure",     "#1e293b")
    texte         = pdf_pal.get("compteur_texte",       "#1e293b")
    barre_fond    = pdf_pal.get("barre_fond",           "#eeeeee")
    barre_curseur = pdf_pal.get("barre_curseur",        "#888888")
    barre_survol  = pdf_pal.get("barre_curseur_survol", "#555555")
    epaisseur     = pdf_pal.get("barre_epaisseur",      "6px")
    return (
        f"--pdf-compteur-fond: {fond}; --pdf-compteur-bordure: {bordure}; "
        f"--pdf-compteur-texte: {texte}; --pdf-barre-fond: {barre_fond}; "
        f"--pdf-barre-curseur: {barre_curseur}; --pdf-barre-curseur-survol: {barre_survol}; "
        f"--pdf-barre-epaisseur: {epaisseur}; "
        f"--pdf-fleche-fond: {pdf_pal.get('fleche_fond', 'transparent')}; "
        f"--pdf-fleche-fond-survol: {pdf_pal.get('fleche_fond_survol', 'rgba(30, 41, 59, 0.25)')}; "
        f"--pdf-fleche-texte: {pdf_pal.get('fleche_texte', '#1e293b')}; "
        f"--pdf-fleche-largeur: {pdf_pal.get('fleche_largeur', '20px')};"
    )


def _build_pdf_pager_html() -> str:
    """Encadré "page n/N" + flèche du mode =pdf> horizontal (rempli par pdf_raw_viewer.js)."""
    return (
        f'<div class="pdf-pager">'
        f'<span class="pdf-pager-box">'
        f'<span class="pdf-pager-text">page -/-</span>'
        f'<span class="pdf-pager-arrow"></span>'
        f'</span>'
        f'</div>'
    )


def _build_pdf_actions_html(src: str, viewer_src: str, context: dict) -> str:
    """Build the "ouvrir dans un nouvel onglet" + "télécharger" button row for =pdf>."""
    pdf_pal = context.get("palette", {}).get("pdf", {})
    fond        = pdf_pal.get("bouton_fond",        "#f8fafc")
    bordure     = pdf_pal.get("bouton_bordure",     "#64748b")
    texte       = pdf_pal.get("bouton_texte",       "#1e293b")
    fond_survol = pdf_pal.get("bouton_fond_survol", "#e2e8f0")

    style = (
        f"--pdf-bouton-fond: {fond}; --pdf-bouton-bordure: {bordure}; "
        f"--pdf-bouton-texte: {texte}; --pdf-bouton-fond-survol: {fond_survol};"
    )

    return (
        f'<div class="pdf-actions" style="{style}">'
        f'<a class="pdf-btn" href="{viewer_src}" target="_blank" rel="noopener noreferrer">'
        f'{_ICON_OUVRIR_ONGLET}<span>Ouvrir dans un nouvel onglet</span>'
        f'</a>'
        f'<a class="pdf-btn" href="{src}" download>'
        f'{_ICON_TELECHARGER}<span>Télécharger</span>'
        f'</a>'
        f'</div>'
    )


def _build_legend_html(token: Token) -> str:
    """Return a caption paragraph if a legend was specified, empty string otherwise."""
    text = token.attrs.get("legend", "").strip()
    if not text:
        return ""
    return f'<p class="media-legend">{text}</p>'


def _convert_youtube_url_to_embed(url: str) -> str:
    """
    Convert any standard YouTube URL to an embed URL.

    https://www.youtube.com/watch?v=VIDEOID   → embed
    https://youtu.be/VIDEOID                  → embed
    https://www.youtube.com/embed/VIDEOID     → returned as-is
    """
    import re

    if "/embed/" in url:
        return url

    m = re.search(r"[?&]v=([a-zA-Z0-9_-]+)", url)
    if m:
        return f"https://www.youtube.com/embed/{m.group(1)}"

    m = re.search(r"youtu\.be/([a-zA-Z0-9_-]+)", url)
    if m:
        return f"https://www.youtube.com/embed/{m.group(1)}"

    return url  # fallback: use as-is
