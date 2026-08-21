"""
blocks/lien_blocks.py
---------------------
Renders the =lien> block : a square card linking to an external website.

SYNTAX:
  =lien> https://example.com
  =lien> https://example.com l
  =lien> https://example.com m gauche "Titre"
  =lien> https://example.com m "Titre" logo.png

FLAGS:
  SIZE    : xs  s  m  l  xl            (défaut : m)
  ALIGN   : gauche  centre  droite      (défaut : centre)
  LEGEND  : "texte entre guillemets"    (optionnel, affiché dans l'en-tête)
  URL     : valeur commençant par http:// ou https://
  IMAGE   : nom de fichier image (png/jpg/svg/gif/webp) depuis le dossier media
             Si absent → l'icône de site (site_icons) remplit le corps de la carte.

CARTE (deux zones) :
  ┌─────────────────────────┐
  │ [🌐 favicon] Légende    │  ← lien-header  (favicon 16px + texte)
  ├─────────────────────────┤
  │                         │
  │     [grande image]      │  ← lien-body    (image media ou icône de site)
  │                         │
  ├─────────────────────────┤
  │  domain.com             │  ← lien-domain  (bas de carte)
  └─────────────────────────┘

FAVICON :
  Résolu depuis media_map sous "{domaine}.png" ou "{domaine}.svg"
  (fichiers produits par core/site_icons.py au build).
  Si absent → SVG lettre-avatar inline généré depuis la palette.

GRANDE IMAGE :
  Si image= précisé → cherché dans media_map comme tout autre media.
  Sinon → même source que le favicon (icône de site agrandie).
"""

import base64
from core.parser.token_types import Token


_LIEN_SIZE_TO_MAX_WIDTH = {
    "xs": "130px",
    "s":  "180px",
    "m":  "240px",
    "l":  "320px",
    "xl": "380px",
}

_ALIGN_TO_CSS = {
    "gauche": "margin-left: 0; margin-right: auto;",
    "centre": "margin-left: auto; margin-right: auto;",
    "droite": "margin-left: auto; margin-right: 0;",
}


# ─────────────────────────────────────────────────────────────
# PUBLIC RENDER FUNCTION
# ─────────────────────────────────────────────────────────────

def render_lien(token: Token, context: dict) -> str:
    """=lien> — external website link card with favicon header and large image body."""
    url        = token.value
    legend     = token.attrs.get("legend", "")
    size       = token.attrs.get("size",   "m")
    align      = token.attrs.get("align",  "centre")
    image_file = token.attrs.get("image",  "")

    palette  = context.get("palette", {})
    lien_pal = palette.get("lien", {})
    fond    = lien_pal.get("fond",    "#f0f7ff")
    bordure = lien_pal.get("bordure", "#3b82f6")
    texte   = lien_pal.get("texte",   "#1e3a8a")

    domain = _extract_domain(url)

    # Small favicon (header, 16px): from site_icons cache or inline SVG
    favicon_src = _resolve_site_icon(domain, fond, bordure, context)

    # Large image (body): user-provided file or same site icon as fallback
    if image_file:
        large_src = _resolve_media_file(image_file, context)
    else:
        large_src = favicon_src

    # Label shown in header next to favicon
    label = legend if legend else domain

    max_width     = _LIEN_SIZE_TO_MAX_WIDTH.get(size, "190px")
    align_css     = _ALIGN_TO_CSS.get(align, _ALIGN_TO_CSS["centre"])
    wrapper_style = f"max-width: {max_width}; width: 100%; {align_css}"
    card_style    = f"background: {fond}; border: 2px solid {bordure};"
    text_style    = f"color: {texte};"

    return (
        f'<div class="media media-lien" style="{wrapper_style}">'
        f'<a href="{url}" class="lien-card" target="_blank" rel="noopener noreferrer"'
        f' style="{card_style}">'

        # ── header : favicon + label ──────────────────────────────
        f'<div class="lien-header" style="{text_style}">'
        f'<img class="lien-favicon" src="{favicon_src}" alt="">'
        f'<span class="lien-label">{label}</span>'
        f'</div>'

        # ── body : large image ────────────────────────────────────
        f'<div class="lien-body">'
        f'<img class="lien-img" src="{large_src}" alt="{label}">'
        f'</div>'

        # ── footer : domain ───────────────────────────────────────
        f'<span class="lien-domain" style="{text_style}">{domain}</span>'

        f'</a>'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────

def _extract_domain(url: str) -> str:
    """'https://www.example.com/path' → 'www.example.com'"""
    url = url.strip()
    for prefix in ("https://", "http://"):
        if url.lower().startswith(prefix):
            url = url[len(prefix):]
            break
    return url.split("/")[0].lower()


def _resolve_site_icon(domain: str, bg_color: str, letter_color: str, context: dict) -> str:
    """
    Resolve the cached favicon for a domain.
    Checks {domain}.png then {domain}.svg in media_map (site_icons folder).
    Falls back to an inline SVG letter-avatar using palette colors.
    """
    media_map = context.get("media_map", {})
    for ext in ("png", "svg"):
        key = f"{domain}.{ext}"
        if key in media_map:
            return "/medias/" + media_map[key]

    # Inline SVG letter-avatar — always available, palette-colored
    letter = domain[0].upper() if domain else "?"
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="10" fill="{bg_color}"/>'
        f'<text x="32" y="46" font-size="34" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-weight="bold" fill="{letter_color}">{letter}</text>'
        '</svg>'
    )
    b64 = base64.b64encode(svg.encode("utf-8")).decode()
    return f"data:image/svg+xml;base64,{b64}"


def _resolve_media_file(filename: str, context: dict) -> str:
    """Resolve a user-specified media filename via the standard media_map."""
    media_map = context.get("media_map", {})
    rel = media_map.get(filename)
    if rel:
        return "/medias/" + rel
    return "/medias/" + filename  # best-effort fallback
