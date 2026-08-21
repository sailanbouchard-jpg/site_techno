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
    """
    src        = _resolve_media_url(token.value, context)
    viewer_src = src + _PDF_VIEWER_FRAGMENT  # sidebar fermée par défaut (sinon le navigateur l'ouvre sur chaque PDF de la page)
    legend     = _build_legend_html(token)

    size      = token.attrs.get("size", _DEFAULT_MEDIA_SIZE)
    max_width = _SIZE_TO_MAX_WIDTH.get(size, _SIZE_TO_MAX_WIDTH[_DEFAULT_MEDIA_SIZE])
    align     = token.attrs.get("align", _DEFAULT_MEDIA_ALIGN)
    align_css = _ALIGN_TO_CSS.get(align, _ALIGN_TO_CSS[_DEFAULT_MEDIA_ALIGN])
    height_vh = token.attrs.get("height_vh", 100)
    height_css = f"{int(height_vh)}vh"

    style    = f"max-width: {max_width}; width: 100%; height: {height_css}; {align_css}"
    actions  = _build_pdf_actions_html(src, viewer_src, context)

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
