"""
token_types.py
--------------
Data structures that flow through the parser pipeline.

A Token is the output of source_tokenizer.py and the input to document_renderer.py.
Nothing is computed here — this file only defines the shapes of data.

TOKEN TYPE CONSTANTS — one per category of source line:
  BLOCK_OPEN    ::pg  ::col 55% 45%  ::def l centre
  BLOCK_CLOSE   ::/pg  ::/col
  CONTENT       =txt>  =img>  =gif>  =vid>  =pdf>  =h1>  =h2>  =h3>
  DIRECTIVE     =esp> m   =saut>   =sep>
  HEADING       # Titre   ## Sous-titre   ### Petit titre
  PALETTE       ::palette defaut

TOKEN ATTRIBUTES — standardized keys stored in token.attrs:
  size          xs | s | m | l | xl
  align         gauche | centre | droite
  color         bleu | vert | orange | ... (palette color names)
  legend        caption text (from quoted string)
  height_vh     PDF height in vh units (int)
  grid_template CSS grid-template-columns value (for ::col)
"""

from dataclasses import dataclass, field


# ─────────────────────────────────────────────────────────────
# TOKEN TYPE CONSTANTS
# ─────────────────────────────────────────────────────────────

BLOCK_OPEN  = "BLOCK_OPEN"
BLOCK_CLOSE = "BLOCK_CLOSE"
CONTENT     = "CONTENT"
DIRECTIVE   = "DIRECTIVE"
HEADING     = "HEADING"
PALETTE     = "PALETTE"


# ─────────────────────────────────────────────────────────────
# TOKEN DATACLASS
# ─────────────────────────────────────────────────────────────

@dataclass
class Token:
    """
    One parsed instruction from a Lanternes source file.

    type        : token category (one of the constants above)
    name        : the block or directive name  e.g. "pg", "col", "txt", "img"
    attrs       : parsed attributes            e.g. {"size": "m", "align": "centre"}
    value       : text payload                 e.g. text content, filename, heading text
    source_line : the original line (for error messages and debugging)
    """
    type        : str
    name        : str
    attrs       : dict = field(default_factory=dict)
    value       : str  = ""
    source_line : str  = ""

    def __repr__(self):
        return f"Token({self.type}, {self.name!r}, attrs={self.attrs}, value={self.value!r})"
