"""
blocks/utility_blocks.py
------------------------
Renders utility directives: spacing, line breaks, and separators.
These have no content and no closing tag.

SPACING SCALE (height in pixels):
  xs → 8px     s → 20px     m → 40px (default)     l → 70px     xl → 120px
"""

from core.parser.token_types import Token


_SPACING_SCALE = {
    "xs":  "8px",
    "s":   "20px",
    "m":   "40px",
    "l":   "70px",
    "xl":  "120px",
}

_DEFAULT_SPACING_SIZE = "m"


def render_spacing(token: Token, _context: dict) -> str:
    """=esp> size — a vertical spacer div with a fixed height."""
    size   = token.attrs.get("size", _DEFAULT_SPACING_SIZE)
    height = _SPACING_SCALE.get(size, _SPACING_SCALE[_DEFAULT_SPACING_SIZE])
    return f'<div class="spacing spacing-{size}" style="height: {height};"></div>'


def render_line_break(token: Token, _context: dict) -> str:
    """=saut> — a simple line break."""
    return "<br>"


def render_separator(token: Token, _context: dict) -> str:
    """=sep> — a horizontal separator line."""
    return '<hr class="separator">'
