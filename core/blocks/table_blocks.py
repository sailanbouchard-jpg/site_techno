"""
blocks/table_blocks.py
----------------------
Renders table structure blocks: ::tbl, ::trh, ::tr, ::tc

SYNTAX SUMMARY:
  ::tbl [largeurs_colonnes] [size] [align] [couleur]
  ::tbl 30% 40% 30%        ← largeurs explicites (comme ::col)
  ::tbl 3                  ← 3 colonnes égales
  ::tbl l rouge            ← tableau large, couleur de bordure rouge
  ::tbl                    ← pleine largeur, colonnes auto

    ::trh [couleur]        ← ligne d'en-tête (fond/texte depuis [tbl] palette)
    ::tr  [couleur]        ← ligne de données, couleur optionnelle

      ::tc [colspan] [vN] [align] [couleur]
      ::tc                 ← cellule standard
      ::tc 2               ← colspan=2 (fusion horizontale)
      ::tc v3              ← rowspan=3 (fusion verticale, sur N lignes)
      ::tc centre bleu     ← centré, fond bleu

      ::/tc

  TABLEAU MODULAIRE (ligne qui se divise en plusieurs sous-lignes) :
    On utilise rowspan (vN) sur les cellules qui doivent couvrir plusieurs
    lignes. La cellule fusionnée s'écrit UNE SEULE FOIS, sur la première
    ::tr concernée. Sur les ::tr suivantes, on ne réécrit pas cette cellule :
    on n'écrit que les ::tc des colonnes qui changent à cette ligne-là.

    ::tr
      ::tc v3
        =txt> Exigence 1.2
      ::/tc
      ::tc v3
        =txt> Plaire à l'œil
      ::/tc
      ::tc centre
        =txt> Forme
      ::/tc
    ::/tr
    ::tr
      ::tc centre
        =txt> Couleur
      ::/tc
    ::/tr
    ::tr
      ::tc centre
        =txt> Matériaux
      ::/tc
    ::/tr

    ::/tr (ou ::/trh)

  ::/tbl

TAILLE DU TABLEAU (flag size sur ::tbl) :
  xs=30%  s=50%  m=70%  l=85%  xl=100% (défaut)

HTML émis :
  <table class="block block-tbl" style="…">
    <colgroup> … </colgroup>          ← si largeurs définies
    <tr class="block block-tr block-trh" …>   ← ::trh
      <td class="block block-tc" …> … </td>
    </tr>
    <tr class="block block-tr" …>             ← ::tr
      <td class="block block-tc" colspan="2" …> … </td>
    </tr>
  </table>

Les closers (::/tbl, ::/tr, ::/trh, ::/tc) émettent </table>, </tr>, </td>
au lieu de </div> — voir STRUCTURE_BLOCK_CLOSERS dans registry.py.
"""

from core.parser.token_types import Token


# ─────────────────────────────────────────────────────────────
# TAILLE DU TABLEAU (largeur globale)
# ─────────────────────────────────────────────────────────────

_TABLE_SIZE_TO_WIDTH = {
    "xs": "30%",
    "s":  "50%",
    "m":  "70%",
    "l":  "85%",
    "xl": "100%",
}

_ALIGN_TO_MARGIN = {
    "gauche": "margin-right: auto;",
    "centre": "margin-left: auto; margin-right: auto;",
    "droite": "margin-left: auto;",
}

_TEXT_ALIGN_MAP = {
    "gauche": "left",
    "centre": "center",
    "droite": "right",
}


# ─────────────────────────────────────────────────────────────
# OPENERS
# ─────────────────────────────────────────────────────────────

def render_table_open(token: Token, context: dict) -> str:
    """::tbl — opens <table> with optional <colgroup> for column widths."""
    attrs   = token.attrs
    colors  = context.get("block_colors", {})
    palette = context.get("palette", {})
    tbl_pal = palette.get("tbl", {})

    size    = attrs.get("size",    "xl")
    align   = attrs.get("align",   "centre")
    columns = attrs.get("columns", [])

    width      = _TABLE_SIZE_TO_WIDTH.get(size, "100%")
    margin_css = _ALIGN_TO_MARGIN.get(align, _ALIGN_TO_MARGIN["centre"])

    fond    = colors.get("fond")    or tbl_pal.get("fond",    "#ffffff")
    bordure = colors.get("bordure") or tbl_pal.get("bordure", "#cccccc")

    style = (
        f"width: {width}; {margin_css} "
        f"border-collapse: collapse; "
        f"background-color: {fond}; "
        f"border: 2px solid {bordure};"
    )

    html = f'<table class="block block-tbl" style="{style}">'

    if columns:
        html += "<colgroup>"
        for w in columns:
            html += f'<col style="width: {w};">'
        html += "</colgroup>"

    return html


def render_header_row_open(token: Token, context: dict) -> str:
    """::trh — header row, styled with entete_fond / entete_texte from [tbl] palette."""
    colors  = context.get("block_colors", {})
    palette = context.get("palette", {})
    tbl_pal = palette.get("tbl", {})

    # Color override (e.g. ::trh rouge) takes precedence over palette entete keys
    fond  = colors.get("fond")  or tbl_pal.get("entete_fond",  "#e8f0f8")
    texte = colors.get("texte") or tbl_pal.get("entete_texte", "#1a3a5e")

    style = f"background-color: {fond}; color: {texte};"
    return f'<tr class="block block-tr block-trh" style="{style}">'


def render_row_open(token: Token, context: dict) -> str:
    """::tr — data row, optional color override."""
    colors = context.get("block_colors", {})

    parts = []
    if colors.get("fond"):
        parts.append(f"background-color: {colors['fond']};")
    if colors.get("texte"):
        parts.append(f"color: {colors['texte']};")

    style = " ".join(parts)
    return f'<tr class="block block-tr" style="{style}">'


def render_cell_open(token: Token, context: dict) -> str:
    """::tc — table cell with optional colspan, rowspan, alignment, and color override."""
    attrs   = token.attrs
    colors  = context.get("block_colors", {})
    palette = context.get("palette", {})
    tbl_pal = palette.get("tbl", {})

    colspan    = attrs.get("colspan", 1)
    rowspan    = attrs.get("rowspan", 1)
    cell_align = attrs.get("align",   "gauche")

    bordure    = tbl_pal.get("bordure", "#cccccc")
    text_align = _TEXT_ALIGN_MAP.get(cell_align, "left")

    parts = [
        f"padding: 10px 14px;",
        f"border: 1px solid {bordure};",
        f"vertical-align: top;",
        f"text-align: {text_align};",
    ]
    if colors.get("fond"):
        parts.append(f"background-color: {colors['fond']};")
    if colors.get("texte"):
        parts.append(f"color: {colors['texte']};")

    style        = " ".join(parts)
    colspan_attr = f' colspan="{colspan}"' if colspan > 1 else ""
    rowspan_attr = f' rowspan="{rowspan}"' if rowspan > 1 else ""

    return f'<td class="block block-tc"{colspan_attr}{rowspan_attr} style="{style}">'


# ─────────────────────────────────────────────────────────────
# CLOSERS (appelés depuis STRUCTURE_BLOCK_CLOSERS dans registry.py)
# ─────────────────────────────────────────────────────────────

def render_table_close(_name: str) -> str:
    return "</table><!-- ::/tbl -->"

def render_header_row_close(_name: str) -> str:
    return "</tr><!-- ::/trh -->"

def render_row_close(_name: str) -> str:
    return "</tr><!-- ::/tr -->"

def render_cell_close(_name: str) -> str:
    return "</td><!-- ::/tc -->"
