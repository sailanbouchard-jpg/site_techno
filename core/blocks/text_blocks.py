"""
blocks/text_blocks.py
---------------------
Renders text content blocks: paragraphs and headings.

PARAGRAPH COLOR (=txt>):
  Uses context["paragraph_color"], which is the text color inherited from the
  innermost open block that defines one (see document_renderer.py for the logic).
  If no block sets a text color, this is palette["corps"]["couleur"].

HEADING COLORS (=h1>, =h2>, =h3>, or # ## ###):
  Each heading level reads its color directly from the active palette:
    palette["h1"]["couleur"]  for <h1>
    palette["h2"]["couleur"]  for <h2>
    palette["h3"]["couleur"]  for <h3>
  Other heading style properties (taille, poids, police) also come from the palette.

KEY NAMES IN THE PALETTE (important — don't mix these up):
  palette["corps"]["couleur"]   → body text color
  palette["h1"]["couleur"]      → h1 heading color
  palette["def"]["texte"]       → text color inside a ::def block   (different key!)
  The "couleur" key is for typographic sections; "texte" is for semantic block sections.
"""

import re

from core.parser.token_types import Token

_RE_PLACEHOLDER = re.compile(r'\{\{(\w+)\}\}')


def _process_placeholders(text: str) -> str:
    """Replace {{q1}} with a span that JS updates with the student's saved answer."""
    return _RE_PLACEHOLDER.sub(
        lambda m: f'<span class="res-ph" data-qid="{m.group(1)}">…</span>',
        text,
    )


# ─────────────────────────────────────────────────────────────
# PUBLIC RENDER FUNCTIONS
# ─────────────────────────────────────────────────────────────

def render_text_paragraph(token: Token, context: dict) -> str:
    """=txt> — a paragraph of text. {{q1}} placeholders become live spans."""
    corps = context["palette"].get("corps", {})
    color = context.get("paragraph_color", "#222222")

    in_resume = context.get("parent_block") == "resume"
    in_dcase  = context.get("parent_block") == "dcase"

    if in_resume:
        rep = context["palette"].get("rep", {})
        color      = rep.get("texte", color)
        taille     = rep.get("taille_rep") or corps.get("taille")
        police     = rep.get("police_rep") or corps.get("police")
        interligne = corps.get("interligne")
    elif in_dcase:
        # Texte plus compact dans une case de diagramme fonctionnel — la case
        # a une hauteur fixe partagée par tous les niveaux, pas de place pour
        # l'interligne généreux des paragraphes normaux.
        diag = context["palette"].get("diag", {})
        taille     = diag.get("case_taille") or corps.get("taille")
        police     = corps.get("police")
        interligne = diag.get("case_interligne") or corps.get("interligne")
    else:
        taille     = corps.get("taille")
        police     = corps.get("police")
        interligne = corps.get("interligne")

    parts = [f"color: {color};"]
    if taille:      parts.append(f"font-size: {taille};")
    if police:      parts.append(f"font-family: {police};")
    if interligne:  parts.append(f"line-height: {interligne};")

    return f'<p class="text" style="{" ".join(parts)}">{_process_placeholders(token.value)}</p>'


def render_heading_1(token: Token, context: dict) -> str:
    """=h1> or # — top-level heading."""
    style = _build_heading_style(context["palette"].get("h1", {}))
    return f'<h1 class="heading heading-1" style="{style}">{token.value}</h1>'


def render_heading_2(token: Token, context: dict) -> str:
    """=h2> or ## — section heading."""
    style = _build_heading_style(context["palette"].get("h2", {}))
    return f'<h2 class="heading heading-2" style="{style}">{token.value}</h2>'


def render_heading_3(token: Token, context: dict) -> str:
    """=h3> or ### — sub-section heading."""
    style = _build_heading_style(context["palette"].get("h3", {}))
    return f'<h3 class="heading heading-3" style="{style}">{token.value}</h3>'


def render_corrige(token: Token, context: dict) -> str:
    """
    =corrige> "Texte" x=X% y=Y% e=70% — texte figé, positionné exactement comme
    une case =rep> (même police/couleur/taille via la palette [rep]), mais sans
    aucun encadré ni bouton : juste le texte, à l'endroit. Sert à transformer un
    schéma vierge en version "corrigée" en remplaçant =rep> par =corrige> sur la
    même ligne, sans retoucher au placement.
    """
    from core.blocks.input_blocks import _zone_positioning, _scale_css_size

    texte = token.value or ""
    pos   = _zone_positioning(token, context)
    rep   = context["palette"].get("rep", {})

    couleur         = rep.get("texte",           "#1a1200")
    police_rep      = rep.get("police_rep",      "inherit")
    taille_rep      = rep.get("taille_rep",      "1em")
    facteur_compact = float(rep.get("facteur_compact", 0.75))

    taille_compacte = _scale_css_size(taille_rep, facteur_compact)
    taille_active   = taille_compacte if pos["schema_mode"] else taille_rep
    align           = "center" if pos["compact"] else "left"

    style = (
        f"font-family:{police_rep}; font-size:{taille_active}; "
        f"text-align:{align}; color:{couleur};"
    )
    if pos["schema_mode"]:
        style = f"{pos['extra_style']} transform:{pos['zone_transform']}; z-index:10; {style}"

    return f'<div class="block-corrige" style="{style}">{texte}</div>'


def render_question(token: Token, context: dict) -> str:
    """=ques> — auto-numbered italic question, number increments per document."""
    counter = context["question_counter"]
    counter[0] += 1
    num = counter[0]

    ques = context["palette"].get("ques", {})
    corps = context["palette"].get("corps", {})
    parts = ["font-style: italic;"]
    color = ques.get("couleur") or context.get("paragraph_color", "#222222")
    parts.append(f"color: {color};")
    taille = ques.get("taille") or "1.1em"
    parts.append(f"font-size: {taille};")
    police = ques.get("police") or corps.get("police", "Georgia, serif")
    parts.append(f"font-family: {police};")
    if corps.get("interligne"):
        parts.append(f"line-height: {corps['interligne']};")

    style = " ".join(parts)
    return (
        f'<p class="question" style="{style}">'
        f'<strong class="question-number">{num}.</strong>'
        f'&nbsp;{token.value}'
        f'</p>'
    )


# ─────────────────────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────────────────────

def _build_heading_style(heading_section: dict) -> str:
    """
    Build the inline style string for a heading from its palette section.
    Typography sections use "couleur" for text color (not "texte").
    """
    parts = []
    if heading_section.get("couleur"): parts.append(f'color: {heading_section["couleur"]};')
    if heading_section.get("taille"):  parts.append(f'font-size: {heading_section["taille"]};')
    if heading_section.get("poids"):   parts.append(f'font-weight: {heading_section["poids"]};')
    if heading_section.get("police"):  parts.append(f'font-family: {heading_section["police"]};')
    return " ".join(parts)
