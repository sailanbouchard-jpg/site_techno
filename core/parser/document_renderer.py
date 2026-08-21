"""
document_renderer.py
--------------------
Walks the flat list of Tokens produced by the tokenizer and generates HTML.

─────────────────────────────────────────────────────────────
THE ACTIVE PALETTE
─────────────────────────────────────────────────────────────
  ::palette <name> MUST be the first meaningful line of every source document.
  If content is encountered before a ::palette directive, the build crashes
  with a clear error message.

  A second ::palette mid-document switches the active palette from that point
  onward. Already-open blocks keep the colors they were resolved with at open time.

─────────────────────────────────────────────────────────────
THE BLOCK STACK + PARAGRAPH COLOR INHERITANCE
─────────────────────────────────────────────────────────────
  Every structure block open pushes an entry onto the block stack.
  Every structure block close pops it.

  Each stack entry is (block_name, text_color_or_None, resolved_colors_dict).
  When a paragraph (=txt>) needs its color, we walk the stack from top to bottom
  and use the first non-None text color we find.

  If no block defines a text color, we fall back to palette["corps"]["couleur"].

  SPECIAL BLOCKS that never set paragraph text color (always push None):
    pg       — the page container. Paragraphs inside an otherwise-empty pg use corps color.
    col, c   — layout-only, no color system.
    tbl, tr, trh — color lives on the <tr>, not inherited by paragraphs.
    diag, dniveau — pure layout/grouping for the diagramme fonctionnel; their
                    direct children (dracine/dcase) carry the actual text color.

  ALL OTHER structure blocks (def, alr, cdr, dracine, dcase, ...) DO set
  paragraph text color if their palette section (or color override) defines "texte".

─────────────────────────────────────────────────────────────
THE RENDER CONTEXT
─────────────────────────────────────────────────────────────
  Each renderer receives a context dict instead of a bare palette dict.
  This lets us cleanly pass multiple pieces of state without changing every
  renderer signature every time we add a new concept.

  Context keys used by different renderers:
    "palette"               → full active palette dict (all renderers may access)
    "paragraph_color"       → current text color for =txt> (text_blocks use this)
    "block_colors"          → {"fond", "bordure", "texte"} resolved for THIS block
                              (structure_blocks use this; other renderers ignore it)
    "parent_resolved_colors" → {"fond", "bordure", "texte"} resolved for the DIRECT
                              parent block (or {} if none). Most blocks ignore this —
                              it exists because ::dcase needs to inherit its enclosing
                              ::dniveau's color (unlike ::tc, our cases are visually
                              separate boxes, not transparent cells over a colored row).
    "defined_sets"          → {nom: [items]} rempli par =options>, lu par =choix>
                              options=nom (voir core/blocks/input_blocks.py)
    "diag_state"            → {"last_parent": ...} mémorise le parent= de la
                              dernière ::dcase rendue dans la ::dniveau en cours,
                              pour ajouter un écart "cousins" entre deux groupes
                              de cases qui ne partagent pas le même parent (voir
                              core/blocks/diagram_blocks.py)
"""

import sys
from core.parser.token_types import (
    Token, BLOCK_OPEN, BLOCK_CLOSE, CONTENT, DIRECTIVE, HEADING, PALETTE,
)
from core.palette.palette_loader import get_active_palette
from core.blocks.structure_blocks import resolve_block_colors
from core.registry import (
    STRUCTURE_BLOCK_OPENERS,
    STRUCTURE_BLOCK_CLOSER,
    STRUCTURE_BLOCK_CLOSERS,
    ALL_CONTENT_RENDERERS,
    TEXT_BLOCK_RENDERERS,
)


# ─────────────────────────────────────────────────────────────
# PUBLIC FUNCTION
# ─────────────────────────────────────────────────────────────

def render_document(tokens: list, available_palettes: dict, media_map: dict = None, is_page_mode: bool = False) -> str:
    """
    Convert a list of Tokens into an HTML string.

    available_palettes : dict loaded from palettes/ by palette_loader.
    media_map          : {filename: relative_url_path} passed through to media block renderers.
    is_page_mode       : when True, ::pg blocks become A4-format pages with sequential IDs.
    Crashes if the first non-palette token is encountered without an active palette.
    """
    html_parts     = []
    active_palette = None
    _media_map     = media_map or {}

    # Stack of (block_name, text_color_or_None, resolved_colors) tuples.
    # text_color is the resolved "texte" value for this block, or None if the
    # block does not participate in paragraph color inheritance. resolved_colors
    # is the full {"fond","bordure","texte"} dict, exposed to children as
    # context["parent_resolved_colors"] (see ::dcase inheriting ::dniveau's color).
    block_stack = []

    # Mutable counter for =ques> auto-numbering; passed by reference via list.
    question_counter = [0]

    # Mutable counter for ::pg pages in page mode.
    page_counter = [0]

    # Sets registered by =options>, keyed by name — consumed by =choix> options=.
    # Shared by reference across iterations, so a definition stays visible to
    # every =choix> that comes after it later in the same document.
    defined_sets = {}

    # Suivi du parent de la ::dcase précédente dans la ::dniveau en cours, pour
    # détecter une rupture de groupe ("cousines") — reset dans render_dniveau_open,
    # lu/écrit dans render_dcase_open (voir core/blocks/diagram_blocks.py).
    diag_state = {"last_parent": None}

    for token in tokens:

        # ── Palette switch ───────────────────────────────────────────────────
        if token.type == PALETTE:
            active_palette = get_active_palette(token.value, available_palettes)
            continue

        # ── Enforce ::palette before any content ─────────────────────────────
        if active_palette is None:
            print(
                f"\n[ERREUR] Le document doit commencer par ::palette <nom>.\n"
                f"  Ligne problématique : {token.source_line.strip()}\n"
                f"  Palettes disponibles : {list(available_palettes.keys()) or ['(aucune)']}\n"
                f"  Exemple : ::palette defaut\n"
            )
            sys.exit(1)

        # ── Build the context common to all non-block renderers ──────────────
        paragraph_color      = _compute_current_paragraph_color(block_stack, active_palette)
        parent_block         = block_stack[-1][0] if block_stack else None
        parent_resolved_colors = block_stack[-1][2] if block_stack else {}
        context = {
            "palette":               active_palette,
            "paragraph_color":       paragraph_color,
            "question_counter":      question_counter,
            "media_map":             _media_map,
            "parent_block":          parent_block,
            "parent_resolved_colors": parent_resolved_colors,
            "defined_sets":          defined_sets,
            "diag_state":            diag_state,
        }

        # ── Structure block open ─────────────────────────────────────────────
        if token.type == BLOCK_OPEN:
            if token.name == "pg" and is_page_mode:
                page_counter[0] += 1

            color_override = token.attrs.get("color")
            resolved       = resolve_block_colors(token.name, color_override, active_palette)

            parent_block  = block_stack[-1][0] if block_stack else None
            block_context = dict(
                context,
                block_colors=resolved,
                parent_block=parent_block,
                is_page_mode=is_page_mode,
                page_number=page_counter[0],
            )

            renderer = STRUCTURE_BLOCK_OPENERS.get(token.name)
            if renderer:
                html_parts.append(renderer(token, block_context))
                text_color = _pick_block_text_color(token.name, resolved)
                block_stack.append((token.name, text_color, resolved))
            else:
                html_parts.append(f"<!-- inconnu : ::{token.name} -->")
            continue

        # ── Structure block close ────────────────────────────────────────────
        if token.type == BLOCK_CLOSE:
            html_parts.append(_handle_block_close(token, block_stack))
            continue

        # ── Content and directive blocks ─────────────────────────────────────
        if token.type in (CONTENT, DIRECTIVE):
            renderer = ALL_CONTENT_RENDERERS.get(token.name)
            if renderer:
                html_parts.append(renderer(token, context))
            else:
                html_parts.append(f"<!-- inconnu : ={token.name}> -->")
            continue

        # ── Headings (# ## ###) ──────────────────────────────────────────────
        if token.type == HEADING:
            renderer = TEXT_BLOCK_RENDERERS.get(token.name)
            if renderer:
                html_parts.append(renderer(token, context))
            continue

    # Warn about any blocks left open at end of document
    for block_name, _, _ in block_stack:
        html_parts.append(f'<!-- ATTENTION : le bloc "::{block_name}" n\'a pas été fermé -->')

    return "\n".join(html_parts)


# ─────────────────────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────────────────────

def _pick_block_text_color(block_name: str, resolved_colors: dict):
    """
    Determine what text color this block contributes to the paragraph color stack.

    pg, col, c never set paragraph color → always returns None.
    All other blocks return their resolved "texte" (which may itself be None
    if the palette section doesn't define a text color for that block).
    """
    if block_name in {"pg", "col", "c", "tbl", "tr", "trh", "diag", "dniveau"}:
        return None
    return resolved_colors.get("texte")


def _compute_current_paragraph_color(block_stack: list, active_palette: dict) -> str:
    """
    Walk the block stack from innermost (top) to outermost (bottom).
    Return the first non-None text color found.
    Fall back to palette corps text color if no block defines one.
    """
    for _block_name, text_color, _resolved in reversed(block_stack):
        if text_color is not None:
            return text_color

    return active_palette.get("corps", {}).get("couleur", "#222222")


def _handle_block_close(token: Token, block_stack: list) -> str:
    """
    Pop the block stack and generate the closing HTML.
    Emits an HTML comment error if the close tag doesn't match the open tag.
    """
    if not block_stack:
        return f"<!-- ERREUR : ::/{ token.name } trouvé mais aucun bloc n'est ouvert -->"

    expected_name, _, _ = block_stack[-1]

    if token.name != expected_name:
        return (
            f"<!-- ERREUR : ::/{ token.name } trouvé "
            f"mais le bloc ouvert est \"::{expected_name}\" -->"
        )

    block_stack.pop()
    closer_fn = STRUCTURE_BLOCK_CLOSERS.get(token.name, STRUCTURE_BLOCK_CLOSER)
    return closer_fn(token.name)
