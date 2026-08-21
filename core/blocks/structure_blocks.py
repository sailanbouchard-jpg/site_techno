"""
blocks/structure_blocks.py
--------------------------
Renders structure block open tags to HTML, and provides resolve_block_colors()
which is also used by document_renderer to update the paragraph color stack.

─────────────────────────────────────────────────────────────
COLOR RESOLUTION (resolve_block_colors)
─────────────────────────────────────────────────────────────
  Every structure block can carry three colors: fond (background),
  bordure (border), texte (text). The source of those colors depends on
  whether the user specified a named color override:

  No override   →  all three come from palette[block_name]
                   e.g. ::def  →  palette["def"]["fond/bordure/texte"]

  With override →  fond + bordure come from palette[color_name]
                   texte: palette[color_name]["texte"] if present,
                          else palette[block_name]["texte"],
                          else None
                   e.g. ::def rouge  →  fond/bordure from palette["rouge"],
                                        texte from palette["rouge"]["texte"]
                                        or palette["def"]["texte"] as fallback

  Any value can be None if the palette section doesn't define it.
  Missing values simply produce no CSS property for that attribute.

─────────────────────────────────────────────────────────────
SIZE + ALIGNMENT
─────────────────────────────────────────────────────────────
  Each block has a default width. Specifying a size flag overrides it.
  Alignment controls left/center/right via CSS margin.

─────────────────────────────────────────────────────────────
THE RENDER CONTEXT
─────────────────────────────────────────────────────────────
  All render functions receive (token, context) where context is a dict with:
    "palette"         → full active palette
    "paragraph_color" → current inherited text color (not used here)
    "block_colors"    → {"fond": ..., "bordure": ..., "texte": ...}
                        pre-resolved by document_renderer
"""

from core.parser.token_types import Token


# ─────────────────────────────────────────────────────────────
# SIZE + ALIGNMENT MAPS
# ─────────────────────────────────────────────────────────────

_SIZE_TO_WIDTH = {
    "xs": "20%",
    "s":  "40%",
    "m":  "60%",
    "l":  "80%",
    "xl": "95%",
}

_ALIGN_TO_MARGIN_CSS = {
    "gauche": "margin-left: 0; margin-right: auto;",
    "centre": "margin-left: auto; margin-right: auto;",
    "droite": "margin-left: auto; margin-right: 0;",
}

# Default widths when no size flag is specified, per block type
_DEFAULT_BLOCK_WIDTH = {
    "pg":  "100%",
    "col": "100%",
    "c":   "100%",
    "cdr": "90%",
    "def": "85%",
    "alr": "85%",
}


# ─────────────────────────────────────────────────────────────
# PUBLIC: COLOR RESOLUTION
# ─────────────────────────────────────────────────────────────

def resolve_block_colors(block_name: str, color_override: str, palette: dict) -> dict:
    """
    Resolve the three colors for a structure block: fond, bordure, texte.

    block_name     : e.g. "def", "alr", "cdr", "pg"
    color_override : e.g. "rouge", "bleu", or None if no override was specified
    palette        : the full active palette dict

    Returns {"fond": str|None, "bordure": str|None, "texte": str|None}.
    Any value may be None if the palette section doesn't define it.
    """
    if color_override:
        color_section = palette.get(color_override, {})
        block_section = palette.get(block_name, {})
        return {
            "fond":    color_section.get("fond"),
            "bordure": color_section.get("bordure"),
            # texte: prefer color override's texte, fall back to block's own texte
            "texte":   color_section.get("texte") or block_section.get("texte"),
        }
    else:
        block_section = palette.get(block_name, {})
        return {
            "fond":    block_section.get("fond"),
            "bordure": block_section.get("bordure"),
            "texte":   block_section.get("texte"),
        }


# ─────────────────────────────────────────────────────────────
# PUBLIC: BLOCK RENDERERS
# ─────────────────────────────────────────────────────────────

def render_page_open(token: Token, context: dict) -> str:
    """::pg — full-width page container. Has background and border, but no text color."""
    if context.get("is_page_mode"):
        page_num = context.get("page_number", 1)
        colors   = context.get("block_colors", {})
        parts    = []
        if colors.get("fond"):
            parts.append(f"background-color: {colors['fond']};")
        if colors.get("bordure"):
            parts.append(f"border-left: 4px solid {colors['bordure']};")
        style = " ".join(parts)
        return (
            f'<div class="block block-pg pg-a4" '
            f'id="page-{page_num}" data-page="{page_num}" style="{style}">'
        )
    style = _build_block_style(token, context, include_text_color=False)
    return f'<div class="block block-pg" style="{style}">'


def render_columns_open(token: Token, _context: dict) -> str:
    """::col — CSS grid container. Layout-only: no color system."""
    grid = token.attrs.get("grid_template", "1fr 1fr")
    return f'<div class="block block-col" style="grid-template-columns: {grid};">'


def render_column_child_open(token: Token, _context: dict) -> str:
    """::c — individual column cell inside ::col. Layout-only: no color system."""
    return '<div class="block block-c">'


def render_cadre_open(token: Token, context: dict) -> str:
    """::cdr — generic colored box. All three colors apply."""
    style = _build_block_style(token, context, include_text_color=True)
    return f'<div class="block block-cdr" style="{style}">'


def render_definition_open(token: Token, context: dict) -> str:
    """::def — definition/key-point box. All three colors apply."""
    style = _build_block_style(token, context, include_text_color=True)
    return f'<div class="block block-def" style="{style}">'


def render_alerte_open(token: Token, context: dict) -> str:
    """::alr — alert/warning box. All three colors apply."""
    style = _build_block_style(token, context, include_text_color=True)
    return f'<div class="block block-alr" style="{style}">'


def render_schema_open(token: Token, context: dict) -> str:
    """
    ::schema filename [size] [align] — image container for overlaid =rep> zones.

    Generates a responsive wrapper (max-width from size flag) containing a
    position:relative div. The =rep> blocks inside with x=/y= attrs are
    absolutely positioned over the image using CSS percentages.
    """
    from core.blocks.media_blocks import (
        _resolve_media_url,
        _SIZE_TO_MAX_WIDTH,
        _ALIGN_TO_CSS,
        _DEFAULT_MEDIA_SIZE,
        _DEFAULT_MEDIA_ALIGN,
    )

    filename  = token.attrs.get("file", "")
    src       = _resolve_media_url(filename, context)
    size      = token.attrs.get("size", _DEFAULT_MEDIA_SIZE)
    max_width = _SIZE_TO_MAX_WIDTH.get(size, _SIZE_TO_MAX_WIDTH[_DEFAULT_MEDIA_SIZE])
    align     = token.attrs.get("align", _DEFAULT_MEDIA_ALIGN)
    align_css = _ALIGN_TO_CSS.get(align, _ALIGN_TO_CSS[_DEFAULT_MEDIA_ALIGN])

    return (
        f'<div class="media schema-wrapper" '
        f'style="max-width:{max_width}; width:100%; {align_css}">'
        f'<div class="schema-container">'
        f'<img src="{src}" class="schema-img" alt="{filename}">'
    )


def render_schema_close(block_name: str) -> str:
    """Closing tag for ::schema — closes both schema-container and schema-wrapper."""
    return f"</div></div><!-- ::/{block_name} -->"


def render_resume_open(_token: Token, context: dict) -> str:
    """::resume — dynamic summary block. Styled identically to =rep> outer container."""
    rep     = context["palette"].get("rep", {})
    fond    = rep.get("fond_cadre", rep.get("fond", "#fdf8ed"))
    bordure = rep.get("bordure",    "#c8a84a")
    texte   = rep.get("texte",      "#1a1200")
    police  = rep.get("police_rep", "inherit")
    taille  = rep.get("taille_rep", "inherit")
    style   = (
        f"background:{fond}; border-left:4px solid {bordure}; "
        f"color:{texte}; font-family:{police}; font-size:{taille};"
    )
    return (
        f'<div class="block block-resume" style="{style}">'
        f'<p class="resume-label">Résumé de vos réponses&nbsp;:</p>'
    )


def render_structure_close(block_name: str) -> str:
    """Shared closing tag for all structure blocks."""
    return f"</div><!-- ::/{block_name} -->"


# ─────────────────────────────────────────────────────────────
# INTERNAL: STYLE BUILDER
# ─────────────────────────────────────────────────────────────

def _build_block_style(token: Token, context: dict, include_text_color: bool) -> str:
    """
    Build the inline style string for a structure block div.

    Width  : from token.attrs["size"] or the block's default
    Margin : from token.attrs["align"] (default: centre)
    Colors : from context["block_colors"] (pre-resolved by document_renderer)
             background-color ← fond
             border-left      ← bordure
             color            ← texte (only if include_text_color=True)
    """
    block_name = token.name
    attrs      = token.attrs
    colors     = context.get("block_colors", {})

    # Width
    size  = attrs.get("size")
    width = _SIZE_TO_WIDTH.get(size) if size else _DEFAULT_BLOCK_WIDTH.get(block_name, "100%")

    # Alignment → margin
    align      = attrs.get("align", "centre")
    margin_css = _ALIGN_TO_MARGIN_CSS.get(align, _ALIGN_TO_MARGIN_CSS["centre"])

    parts = [
        f"width: {width};",
        margin_css,
    ]

    if colors.get("fond"):
        parts.append(f"background-color: {colors['fond']};")

    if colors.get("bordure"):
        parts.append(f"border-left: 4px solid {colors['bordure']};")

    if include_text_color and colors.get("texte"):
        parts.append(f"color: {colors['texte']};")

    return " ".join(parts)
