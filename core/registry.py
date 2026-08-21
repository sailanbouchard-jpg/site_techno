"""
registry.py
-----------
THE SINGLE FILE TO EDIT when:

  ✎ Adding a new block type:
      1. Write the render function in the appropriate blocks/*.py file
      2. Import it here
      3. Add it to the correct dict below
      That's all — the rest of the pipeline picks it up automatically.

  ✎ Renaming or moving a renderer to another file:
      Just update the import here.
      No other file needs to change.

  ✎ Removing a block type:
      Remove it from the dict here.
      The renderer will emit an HTML comment warning for unknown blocks.

DICT OVERVIEW:
  STRUCTURE_BLOCK_OPENERS   ::pg  ::col  ::c  ::cdr  ::def  ::alr
  STRUCTURE_BLOCK_CLOSER    ::/name  (shared by all structure blocks)
  MEDIA_BLOCK_RENDERERS     =img>  =gif>  =vid>  =pdf>
  TEXT_BLOCK_RENDERERS      =txt>  =h1>  =h2>  =h3>  (and # ## ### headings)
  UTILITY_BLOCK_RENDERERS   =esp>  =saut>  =sep>

  =options> (in TEXT_BLOCK_RENDERERS, alongside =rep>/=choix>) defines a
  named, reusable option set consumed by =choix> options=nom — see
  core/blocks/input_blocks.py.
"""

from core.blocks.structure_blocks import (
    render_page_open,
    render_columns_open,
    render_column_child_open,
    render_cadre_open,
    render_definition_open,
    render_alerte_open,
    render_schema_open,
    render_schema_close,
    render_resume_open,
    render_structure_close,
)
from core.blocks.diagram_blocks import (
    render_diag_open,
    render_dracine_open,
    render_dracine_close,
    render_dniveau_open,
    render_dcase_open,
)
from core.blocks.interactive_blocks import (
    render_obj,
    render_qcm,
    render_associer,
    render_trier,
    render_repg,
)
from core.blocks.media_blocks import (
    render_image,
    render_gif,
    render_video,
    render_pdf,
)
from core.blocks.objet3d_blocks import render_objet_3d
from core.blocks.lien_blocks import render_lien
from core.blocks.table_blocks import (
    render_table_open,
    render_header_row_open,
    render_row_open,
    render_cell_open,
    render_table_close,
    render_header_row_close,
    render_row_close,
    render_cell_close,
)
from core.blocks.text_blocks import (
    render_text_paragraph,
    render_heading_1,
    render_heading_2,
    render_heading_3,
    render_question,
    render_corrige,
)
from core.blocks.input_blocks import render_rep, render_choix, render_options
from core.blocks.verif_blocks import render_verif
from core.blocks.utility_blocks import (
    render_spacing,
    render_line_break,
    render_separator,
)


# ─────────────────────────────────────────────────────────────
# STRUCTURE BLOCKS
# ─────────────────────────────────────────────────────────────

STRUCTURE_BLOCK_OPENERS = {
    "pg":     render_page_open,
    "col":    render_columns_open,
    "c":      render_column_child_open,
    "cdr":    render_cadre_open,
    "def":    render_definition_open,
    "alr":    render_alerte_open,
    "schema": render_schema_open,
    "resume": render_resume_open,
    # Table blocks
    "tbl": render_table_open,
    "trh": render_header_row_open,
    "tr":  render_row_open,
    "tc":  render_cell_open,
    # Diagramme fonctionnel
    "diag":    render_diag_open,
    "dracine": render_dracine_open,
    "dniveau": render_dniveau_open,
    "dcase":   render_dcase_open,
}

# Default close function for div-based blocks (</div>)
STRUCTURE_BLOCK_CLOSER = render_structure_close

# Block-specific closers for non-div HTML elements
STRUCTURE_BLOCK_CLOSERS = {
    "schema":  render_schema_close,
    "tbl":     render_table_close,
    "trh":     render_header_row_close,
    "tr":      render_row_close,
    "tc":      render_cell_close,
    "dracine": render_dracine_close,
}


# ─────────────────────────────────────────────────────────────
# CONTENT BLOCKS (media + text + utility)
# ─────────────────────────────────────────────────────────────

MEDIA_BLOCK_RENDERERS = {
    "img":  render_image,
    "gif":  render_gif,
    "vid":  render_video,
    "pdf":  render_pdf,
    "lien": render_lien,
    "3D":   render_objet_3d,   # visualisateur STL (voir core/blocks/objet3d_blocks.py)
}

TEXT_BLOCK_RENDERERS = {
    "txt":     render_text_paragraph,
    "h1":      render_heading_1,
    "h2":      render_heading_2,
    "h3":      render_heading_3,
    "ques":    render_question,
    "rep":     render_rep,
    "choix":   render_choix,
    "options": render_options,
    "corrige": render_corrige,
}

INTERACTIVE_BLOCK_RENDERERS = {
    "obj":      render_obj,
    "qcm":      render_qcm,
    "associer": render_associer,
    "trier":    render_trier,
    "repg":     render_repg,
}

UTILITY_BLOCK_RENDERERS = {
    "esp":  render_spacing,
    "saut": render_line_break,
    "sep":  render_separator,
}

VERIF_BLOCK_RENDERERS = {
    "verif": render_verif,
}

# Combined dict used by document_renderer — all content in one lookup
ALL_CONTENT_RENDERERS = {
    **MEDIA_BLOCK_RENDERERS,
    **TEXT_BLOCK_RENDERERS,
    **INTERACTIVE_BLOCK_RENDERERS,
    **UTILITY_BLOCK_RENDERERS,
    **VERIF_BLOCK_RENDERERS,
}
