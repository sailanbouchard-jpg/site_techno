"""
blocks/interactive_blocks.py
----------------------------
Renders interactive content blocks for student activities.

SYNTAX:
  =obj>      La problématique : comment un objet peut-il être automatisé ?
  =qcm>      q1 | Plastique | *Métal | Bois | Verre
  =associer> q1 | Acier=Métal | Chêne=Bois | PVC=Plastique
  =trier>    q1 | Bois | Métal | Verre | Plastique
  =repg>     q1 | Ce système est {nom} | Il est alimenté par {énergie}

NOTES:
  - =qcm>      : * marks correct choice(s). "multiple" keyword enables checkboxes.
  - =associer> : Each item uses = to separate left from right.
  - =trier>    : Source order = correct order. JS shuffles on display.
  - =repg>     : Each pipe segment may contain {fieldname} for inline inputs.

PALETTE KEYS (section names):
  [obj]    fond, bordure, texte, label
  [qcm]    fond, bordure, texte, bouton_fond, bouton_texte,
           ok_fond, ok_bordure, err_fond, err_bordure
  [assoc]  fond, bordure, texte, item_fond, item_bordure,
           ok_fond, bouton_fond, bouton_texte
  [trier]  fond, bordure, texte, item_fond, item_bordure,
           ok_fond, ok_bordure, bouton_fond, bouton_texte
  [repg]   fond, fond_cadre, bordure, texte, champ_fond, champ_bordure,
           bouton_fond, bouton_texte

All interactive blocks save via /api/reponses (same as =rep>).
"""

import re
from core.parser.token_types import Token

# Icône du bouton Sauvegarder de =repg> — même dessin que dans input_blocks.py (=rep>),
# pas d'import croisé : chaque fichier blocks/ reste autonome (voir CLAUDE.md).
_ICON_SAUVEGARDER = (
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>'
    '<path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>'
)


# ─────────────────────────────────────────────────────────────
# =obj> — sticky objective
# ─────────────────────────────────────────────────────────────

def render_obj(token: Token, context: dict) -> str:
    obj   = context["palette"].get("obj", {})
    corps = context["palette"].get("corps", {})

    fond    = obj.get("fond",    "#fefce8")
    bordure = obj.get("bordure", "#ca8a04")
    texte   = obj.get("texte",   "#713f12")
    label   = obj.get("label",   "Objectif")
    police  = obj.get("police")  or corps.get("police", "inherit")

    style = (
        f"background:{fond}; border-left:5px solid {bordure}; "
        f"color:{texte}; font-family:{police};"
    )
    return (
        f'<div class="block-obj" style="{style}">'
        f'<span class="obj-label">{label}</span>'
        f'<span class="obj-text">{token.value}</span>'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# =qcm> — multiple-choice question
# ─────────────────────────────────────────────────────────────

def render_qcm(token: Token, context: dict) -> str:
    qcm   = context["palette"].get("qcm", {})
    corps = context["palette"].get("corps", {})

    fond         = qcm.get("fond",         "#f8fafc")
    bordure      = qcm.get("bordure",      "#64748b")
    texte        = qcm.get("texte",        "#1e293b")
    bouton_fond  = qcm.get("bouton_fond",  "#3b82f6")
    bouton_texte = qcm.get("bouton_texte", "#ffffff")
    ok_fond      = qcm.get("ok_fond",      "#dcfce7")
    ok_bordure   = qcm.get("ok_bordure",   "#16a34a")
    err_fond     = qcm.get("err_fond",     "#fee2e2")
    err_bordure  = qcm.get("err_bordure",  "#dc2626")
    police       = corps.get("police", "inherit")

    question_id = token.value
    items       = token.attrs.get("items", [])
    multiple    = token.attrs.get("multiple", False)
    input_type  = "checkbox" if multiple else "radio"

    choices_html = ""
    for i, item in enumerate(items):
        correct  = item.startswith("*")
        text     = item.lstrip("* ").strip()
        data_c   = 'data-correct="true"' if correct else ""
        choices_html += (
            f'<label class="qcm-choice" {data_c}>'
            f'<input type="{input_type}" name="qcm-{question_id}" value="{i}">'
            f'<span class="qcm-choice-text">{text}</span>'
            f'</label>\n'
        )

    outer_style = (
        f"background:{fond}; border-left:4px solid {bordure}; "
        f"color:{texte}; font-family:{police};"
    )
    btn_style = f"background:{bouton_fond}; color:{bouton_texte};"

    return (
        f'<div class="block-qcm" data-question-id="{question_id}" '
        f'style="{outer_style}">\n'
        f'  <div class="qcm-choices">\n{choices_html}  </div>\n'
        f'  <div class="qcm-footer">\n'
        f'    <button class="qcm-btn" style="{btn_style}">Vérifier</button>\n'
        f'    <button class="qcm-reset-btn">Recommencer</button>\n'
        f'    <span class="qcm-status"></span>\n'
        f'  </div>\n'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# =associer> — click-to-match two columns
# ─────────────────────────────────────────────────────────────

def render_associer(token: Token, context: dict) -> str:
    assoc = context["palette"].get("assoc", {})
    corps = context["palette"].get("corps", {})

    fond         = assoc.get("fond",         "#f8fafc")
    bordure      = assoc.get("bordure",      "#64748b")
    texte        = assoc.get("texte",        "#1e293b")
    item_fond    = assoc.get("item_fond",    "#e2e8f0")
    item_bordure = assoc.get("item_bordure", "#94a3b8")
    ok_fond      = assoc.get("ok_fond",      "#dcfce7")
    bouton_fond  = assoc.get("bouton_fond",  "#3b82f6")
    bouton_texte = assoc.get("bouton_texte", "#ffffff")
    police       = corps.get("police", "inherit")

    question_id = token.value
    items       = token.attrs.get("items", [])

    # Parse "Acier=Métal" → (left="Acier", right="Métal")
    pairs = []
    for item in items:
        if "=" in item:
            left, right = item.split("=", 1)
            pairs.append((left.strip(), right.strip()))

    # Correct pairing encoded for JS: "Acier=Métal|Chêne=Bois|..."
    correct_str = "|".join(f"{l}={r}" for l, r in pairs)

    item_style   = f"background:{item_fond}; border:1px solid {item_bordure};"
    outer_style  = (
        f"background:{fond}; border-left:4px solid {bordure}; "
        f"color:{texte}; font-family:{police};"
    )
    btn_style    = f"background:{bouton_fond}; color:{bouton_texte};"

    left_col  = "".join(
        f'<div class="assoc-item assoc-left"  data-key="{l}" style="{item_style}">{l}</div>\n'
        for l, _ in pairs
    )
    # Right column rendered in source order; JS will shuffle on load
    right_col = "".join(
        f'<div class="assoc-item assoc-right" data-key="{r}" style="{item_style}">{r}</div>\n'
        for _, r in pairs
    )

    return (
        f'<div class="block-assoc" data-question-id="{question_id}" '
        f'data-correct="{correct_str}" '
        f'style="{outer_style}">\n'
        f'  <div class="assoc-columns">\n'
        f'    <div class="assoc-col assoc-col-left">{left_col}    </div>\n'
        f'    <div class="assoc-col assoc-col-right">{right_col}    </div>\n'
        f'    <svg class="assoc-svg" aria-hidden="true"></svg>\n'
        f'  </div>\n'
        f'  <div class="assoc-footer">\n'
        f'    <button class="assoc-verify-btn" style="{btn_style}">Vérifier</button>\n'
        f'    <button class="assoc-reset-btn">Recommencer</button>\n'
        f'    <span class="assoc-status"></span>\n'
        f'  </div>\n'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# =trier> — drag-to-reorder list
# ─────────────────────────────────────────────────────────────

def render_trier(token: Token, context: dict) -> str:
    trier = context["palette"].get("trier", {})
    corps = context["palette"].get("corps", {})

    fond         = trier.get("fond",         "#f8fafc")
    bordure      = trier.get("bordure",      "#64748b")
    texte        = trier.get("texte",        "#1e293b")
    item_fond    = trier.get("item_fond",    "#e2e8f0")
    item_bordure = trier.get("item_bordure", "#94a3b8")
    ok_fond      = trier.get("ok_fond",      "#dcfce7")
    ok_bordure   = trier.get("ok_bordure",   "#16a34a")
    bouton_fond  = trier.get("bouton_fond",  "#3b82f6")
    bouton_texte = trier.get("bouton_texte", "#ffffff")
    police       = corps.get("police", "inherit")

    question_id   = token.value
    items         = [i.strip() for i in token.attrs.get("items", [])]
    correct_order = "|".join(items)  # source order = correct

    item_style  = f"background:{item_fond}; border:1px solid {item_bordure};"
    outer_style = (
        f"background:{fond}; border-left:4px solid {bordure}; "
        f"color:{texte}; font-family:{police};"
    )
    btn_style   = f"background:{bouton_fond}; color:{bouton_texte};"

    items_html = "".join(
        f'<div class="trier-item" draggable="true" data-val="{t}" style="{item_style}">'
        f'<span class="trier-handle">⠿</span>'
        f'<span class="trier-text">{t}</span>'
        f'</div>\n'
        for t in items
    )

    return (
        f'<div class="block-trier" data-question-id="{question_id}" '
        f'data-correct="{correct_order}" '
        f'data-ok-fond="{ok_fond}" data-ok-bordure="{ok_bordure}" '
        f'style="{outer_style}">\n'
        f'  <div class="trier-list">\n{items_html}  </div>\n'
        f'  <div class="trier-footer">\n'
        f'    <button class="trier-btn" style="{btn_style}">Vérifier l\'ordre</button>\n'
        f'    <span class="trier-status"></span>\n'
        f'  </div>\n'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# =repg> — guided response with inline {field} placeholders
# ─────────────────────────────────────────────────────────────

_RE_FIELD = re.compile(r'\{([^}]+)\}')


def render_repg(token: Token, context: dict) -> str:
    repg  = context["palette"].get("repg", {})
    rep   = context["palette"].get("rep",  {})   # fallback colors from rep
    corps = context["palette"].get("corps", {})

    fond          = repg.get("fond",          rep.get("fond",         "#fdf8ed"))
    fond_cadre    = repg.get("fond_cadre",    rep.get("fond_cadre",   fond))
    bordure       = repg.get("bordure",       rep.get("bordure",      "#c8a84a"))
    texte         = repg.get("texte",         rep.get("texte",        "#1a1200"))
    champ_fond    = repg.get("champ_fond",    "#ffffff")
    champ_bordure = repg.get("champ_bordure", bordure)
    bouton_fond   = repg.get("bouton_fond",   rep.get("bouton_fond",  "#9b7a00"))
    bouton_texte  = repg.get("bouton_texte",  rep.get("bouton_texte", "#ffffff"))
    police_rep    = rep.get("police_rep",     "inherit")
    police        = corps.get("police", "inherit")

    question_id = token.value
    segments    = token.attrs.get("items", [])

    lines_html = ""
    for seg in segments:
        def _make_input(m, cf=champ_fond, cb=champ_bordure, pr=police_rep, tc=texte):
            fname = m.group(1)
            s = (f"border:none; border-bottom:2px solid {cb}; background:{cf}; "
                 f"font-family:{pr}; color:{tc}; padding:2px 4px; min-width:80px;")
            return f'<input class="repg-field" data-field="{fname}" placeholder="{fname}" style="{s}">'
        line = _RE_FIELD.sub(_make_input, seg.strip())
        lines_html += f'<div class="repg-line">{line}</div>\n'

    outer_style = (
        f"background:{fond_cadre}; border-left:4px solid {bordure}; "
        f"color:{texte}; font-family:{police};"
    )
    inner_style = f"background:{fond}; border-radius:4px; padding:10px 12px;"
    btn_style   = f"background:{bouton_fond}; color:{bouton_texte};"

    return (
        f'<div class="block-repg" data-question-id="{question_id}" style="{outer_style}">\n'
        f'  <div class="repg-content" style="{inner_style}">\n'
        f'{lines_html}'
        f'  </div>\n'
        f'  <div class="repg-footer">\n'
        f'    <span class="repg-status"></span>\n'
        f'    <button class="repg-save-btn" aria-label="Sauvegarder" title="Sauvegarder" '
        f'style="{btn_style}">{_ICON_SAUVEGARDER}</button>\n'
        f'  </div>\n'
        f'</div>'
    )
