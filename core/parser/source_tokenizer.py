"""
source_tokenizer.py
-------------------
Reads a Lanternes source file line by line and converts each meaningful line
into a Token object. Lines that don't match any known pattern are silently ignored.

ROUTING LOGIC (checked in this order per line):
  1. Starts with ::/      → BLOCK_CLOSE
  2. Starts with ::       → BLOCK_OPEN  (or PALETTE if name is "palette")
  3. Starts with =name>   → CONTENT or DIRECTIVE (depending on name)
  4. Starts with # ## ### → HEADING
  5. Anything else        → ignored (blank lines, plain text, comments)

STRUCTURE BLOCKS (open + close tags, can have colors):
  pg   col   c   cdr   def   alr
  All of these except col and c accept: size, alignment, and a named color.

  diag   dracine   dniveau   dcase  — diagramme fonctionnel (voir core/blocks/diagram_blocks.py)
  diag accepts up to two size flags (first = case width, second = vertical
  gap between cases) plus an alignment, like the dual-size of =pdf>. dracine
  and dniveau accept a color and an optional quoted title (displayed above
  the case/column). dcase accepts id=/parent= plus an optional color.

TEXT BLOCKS (no flag parsing — everything after > is raw text):
  txt   h1   h2   h3

MEDIA BLOCKS (flag parsing for size/align/file/legend):
  img   gif   vid   pdf

UTILITY DIRECTIVES (no closing tag):
  esp   saut   sep   options

  =options> nom | Item1 | Item2 | ...  définit un set d'options réutilisable
  par plusieurs =choix> (flag options=nom) — voir flag_detector.py.

TO ADD A NEW STRUCTURE BLOCK:
  1. Add its name to STRUCTURE_BLOCK_NAMES
  2. Write a render function in core/blocks/structure_blocks.py
  3. Register it in core/registry.py — that's all the pipeline needs.

TO ADD A NEW CONTENT BLOCK:
  1. Add handling in _build_content_or_directive_token() below
  2. Write a render function in the appropriate blocks/*.py file
  3. Register it in core/registry.py
"""

import re
from core.parser.token_types import (
    Token,
    BLOCK_OPEN, BLOCK_CLOSE, CONTENT, DIRECTIVE, HEADING, PALETTE,
)
from core.parser.flag_detector import (
    detect_media_flags,
    detect_pdf_flags,
    detect_lien_flags,
    detect_structure_flags,
    detect_column_flags,
    detect_spacing_size,
    detect_table_flags,
    detect_row_flags,
    detect_table_cell_flags,
    detect_rep_flags,
    detect_choix_flags,
    detect_options_flags,
    detect_corrige_flags,
    detect_schema_flags,
    detect_interactive_flags,
    detect_verif_flags,
    detect_diagram_flags,
    detect_diagram_root_flags,
    detect_diagram_level_flags,
    detect_diagram_case_flags,
)


# ─────────────────────────────────────────────────────────────
# BLOCK NAME SETS
# ─────────────────────────────────────────────────────────────

# All structure blocks: have matching open/close tags
STRUCTURE_BLOCK_NAMES = {
    "pg", "col", "c", "cdr", "def", "alr", "tbl", "tr", "trh", "tc", "schema", "resume",
    "diag", "dracine", "dniveau", "dcase",
}

# Text content: value is raw text after the >, no flag parsing
TEXT_BLOCK_NAMES = {"txt", "h1", "h2", "h3", "ques", "obj"}

# Interactive blocks: pipe-separated flags
INTERACTIVE_BLOCK_NAMES = {"qcm", "associer", "trier", "repg"}

# Media content: flags parsed with detect_media_flags or detect_pdf_flags
MEDIA_BLOCK_NAMES = {"img", "gif", "vid"}

# Objet 3D : bloc =3D> — visualisateur STL (voir core/blocks/objet3d_blocks.py).
# Réutilise detect_media_flags (size, align, file .stl, legend).
OBJET3D_BLOCK_NAMES = {"3D"}

# Utility directives: no closing tag
DIRECTIVE_NAMES = {"esp", "saut", "sep"}


# ─────────────────────────────────────────────────────────────
# REGEX PATTERNS
# ─────────────────────────────────────────────────────────────

# Block open:  ::name  optionally followed by flags
# Examples:  ::pg   ::col 55% 45%   ::def l centre   ::cdr bleu xl
_RE_BLOCK_OPEN = re.compile(
    r"^::(?P<name>[a-z]+)"
    r"(?:\s+(?P<flags>.+))?$"
)

# Block close:  ::/name
_RE_BLOCK_CLOSE = re.compile(r"^::/(?P<name>[a-z]+)$")

# Content / directive:  =name>  optionally followed by content or flags
# Examples:  =txt> Hello   =img> xl centre img.png "caption"   =sep>   =h3> Titre
# Le nom accepte chiffres et majuscules pour autoriser des blocs comme =3D>.
_RE_CONTENT_LINE = re.compile(
    r"^=(?P<name>[A-Za-z0-9]+)"
    r">"
    r"\s*(?P<rest>.*)"
)

# Heading:  # Title   ## Subtitle   ### Small title
_RE_HEADING = re.compile(r"^(?P<hashes>#{1,3})\s+(?P<text>.+)")


# ─────────────────────────────────────────────────────────────
# PUBLIC FUNCTION
# ─────────────────────────────────────────────────────────────

def tokenize(source_text: str) -> list:
    """
    Convert a full source body into a flat list of Token objects.

    Blank lines and unrecognized lines are silently skipped.
    Indentation is ignored — each line is stripped before matching.
    """
    tokens = []

    for raw_line in source_text.splitlines():
        stripped = raw_line.strip()

        if not stripped:
            continue

        token = _classify_line(stripped, raw_line)

        if token is not None:
            tokens.append(token)

    return tokens


# ─────────────────────────────────────────────────────────────
# INTERNAL: LINE CLASSIFIER
# ─────────────────────────────────────────────────────────────

def _classify_line(line: str, raw_line: str):
    """
    Try each pattern in priority order.
    Return a Token if one matches, None if the line should be ignored.
    """
    # Block close must be checked before block open (both start with ::)
    m = _RE_BLOCK_CLOSE.match(line)
    if m:
        return _build_block_close_token(m, raw_line)

    m = _RE_BLOCK_OPEN.match(line)
    if m:
        return _build_block_open_token(m, raw_line)

    m = _RE_CONTENT_LINE.match(line)
    if m:
        return _build_content_or_directive_token(m, raw_line)

    m = _RE_HEADING.match(line)
    if m:
        return _build_heading_token(m, raw_line)

    return None  # line is ignored


# ─────────────────────────────────────────────────────────────
# INTERNAL: TOKEN BUILDERS
# ─────────────────────────────────────────────────────────────

def _build_block_open_token(m: re.Match, raw_line: str) -> Token:
    """
    Build a BLOCK_OPEN or PALETTE token from a ::name line.

    ::palette <name>  → special PALETTE token (not a structure block)
    ::col <flags>     → column layout (uses detect_column_flags)
    ::c               → column child (no flags)
    ::pg, ::cdr, ::def, ::alr, ...
                      → structure block (uses detect_structure_flags:
                        detects size, alignment, and optional named color)
    """
    name  = m.group("name")
    flags = (m.group("flags") or "").strip()

    if name == "palette":
        return Token(type=PALETTE, name=name, value=flags, source_line=raw_line)

    if name == "col":
        attrs = detect_column_flags(flags)

    elif name == "c":
        attrs = {}  # column child has no flags

    elif name == "tbl":
        attrs = detect_table_flags(flags)

    elif name in ("tr", "trh"):
        attrs = detect_row_flags(flags)

    elif name == "tc":
        attrs = detect_table_cell_flags(flags)

    elif name == "schema":
        attrs = detect_schema_flags(flags)

    elif name == "diag":
        attrs = detect_diagram_flags(flags)

    elif name == "dracine":
        attrs = detect_diagram_root_flags(flags)

    elif name == "dniveau":
        attrs = detect_diagram_level_flags(flags)

    elif name == "dcase":
        attrs = detect_diagram_case_flags(flags)

    elif name in STRUCTURE_BLOCK_NAMES:
        # All remaining structure blocks: size + align + optional named color
        attrs = detect_structure_flags(flags)

    else:
        attrs = {}  # unknown block — renderer will emit a warning comment

    return Token(type=BLOCK_OPEN, name=name, attrs=attrs, source_line=raw_line)


def _build_block_close_token(m: re.Match, raw_line: str) -> Token:
    """Build a BLOCK_CLOSE token from a ::/name line."""
    return Token(type=BLOCK_CLOSE, name=m.group("name"), source_line=raw_line)


def _build_content_or_directive_token(m: re.Match, raw_line: str) -> Token:
    """
    Build a CONTENT or DIRECTIVE token from a =name> line.

    Text blocks (txt, h1, h2, h3)  → no flag parsing, value = raw text after >
    Media blocks (img, gif, vid)    → detect_media_flags, filename → token.value
    PDF block (pdf)                 → detect_pdf_flags (handles dual-size + percent)
    Spacing (esp)                   → detect_spacing_size
    Other directives (saut, sep)    → no flags, no value
    Unknown names                   → passed through for the renderer to handle
    """
    name = m.group("name")
    rest = (m.group("rest") or "").strip()

    if name == "rep":
        attrs = detect_rep_flags(rest)
        qid   = attrs.pop("question_id", "q")
        return Token(type=CONTENT, name=name, attrs=attrs, value=qid, source_line=raw_line)

    if name == "choix":
        attrs = detect_choix_flags(rest)
        qid   = attrs.pop("question_id", "q")
        return Token(type=CONTENT, name=name, attrs=attrs, value=qid, source_line=raw_line)

    if name == "options":
        attrs    = detect_options_flags(rest)
        set_name = attrs.pop("name", "")
        return Token(type=DIRECTIVE, name=name, attrs=attrs, value=set_name, source_line=raw_line)

    if name == "corrige":
        attrs  = detect_corrige_flags(rest)
        texte  = attrs.pop("texte", "")
        return Token(type=CONTENT, name=name, attrs=attrs, value=texte, source_line=raw_line)

    if name == "verif":
        attrs = detect_verif_flags(rest)
        return Token(type=CONTENT, name=name, attrs=attrs, value="", source_line=raw_line)

    if name in TEXT_BLOCK_NAMES:
        return Token(type=CONTENT, name=name, value=rest, source_line=raw_line)

    if name in MEDIA_BLOCK_NAMES or name in OBJET3D_BLOCK_NAMES:
        attrs    = detect_media_flags(rest)
        filename = attrs.pop("file", "")
        return Token(type=CONTENT, name=name, attrs=attrs, value=filename, source_line=raw_line)

    if name == "lien":
        attrs = detect_lien_flags(rest)
        url   = attrs.pop("url", "")
        return Token(type=CONTENT, name=name, attrs=attrs, value=url, source_line=raw_line)

    if name == "pdf":
        attrs    = detect_pdf_flags(rest)
        filename = attrs.pop("file", "")
        return Token(type=CONTENT, name=name, attrs=attrs, value=filename, source_line=raw_line)

    if name in INTERACTIVE_BLOCK_NAMES:
        attrs = detect_interactive_flags(rest)
        qid   = attrs.pop("question_id", "q")
        return Token(type=CONTENT, name=name, attrs=attrs, value=qid, source_line=raw_line)

    if name == "esp":
        attrs = detect_spacing_size(rest)
        return Token(type=DIRECTIVE, name=name, attrs=attrs, source_line=raw_line)

    if name in DIRECTIVE_NAMES:
        return Token(type=DIRECTIVE, name=name, source_line=raw_line)

    # Unknown — pass through; the renderer will emit a warning comment
    return Token(type=CONTENT, name=name, value=rest, source_line=raw_line)


def _build_heading_token(m: re.Match, raw_line: str) -> Token:
    """
    Build a HEADING token from a # Title line.
    token.name will be "h1", "h2", or "h3" — same as if =h1> were used.
    Both syntaxes produce the same HTML via the same render functions.
    """
    level = len(m.group("hashes"))  # 1, 2, or 3
    text  = m.group("text").strip()
    return Token(type=HEADING, name=f"h{level}", value=text, source_line=raw_line)
