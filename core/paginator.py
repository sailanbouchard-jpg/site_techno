"""
paginator.py
------------
Automatic page-breaking for page-mode activities.

When mode: pages is set, render_page() calls auto_paginate_tokens() BEFORE
rendering.  This function:

  1. Strips existing ::pg / ::/pg wrappers and records their positions as
     "forced page-break" markers.  The teacher's explicit ::pg lines mean
     "always start a new page here, no matter what."
  2. Groups the remaining flat token stream into atomic segments — each
     segment is one indivisible content unit (a whole block like ::def…::/def,
     or a single =txt> / =ques> line, etc.).
  3. Walks the segments and re-wraps them in ::pg blocks:
       - A forced break always opens a new page.
       - An auto break fires when accumulated height would exceed PAGE_HEIGHT.

Height estimates are intentionally conservative so pages never appear under-full.
Exact rendered heights can only be known in a browser; these approximations are
good enough to avoid obvious overflow.
"""

from core.parser.token_types import (
    Token,
    BLOCK_OPEN, BLOCK_CLOSE, CONTENT, DIRECTIVE, HEADING, PALETTE,
)

PAGE_HEIGHT = 1050   # px — usable height per A4 page (conservative, ~1123 - padding)


# ─────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────

def auto_paginate_tokens(tokens: list, page_height: int = PAGE_HEIGHT) -> list:
    """
    Return a new token list where all content is wrapped in ::pg blocks,
    with automatic page breaks inserted when height would overflow.
    """
    # 1. Separate palette tokens — they live before any page block.
    palette_tokens = [t for t in tokens if t.type == PALETTE]
    rest           = [t for t in tokens if t.type != PALETTE]

    # 2. Flatten existing ::pg containers; record forced-break positions.
    flat, forced_breaks = _flatten_pages(rest)

    # 3. Build atomic segments: (token_list, height_px, is_forced, pg_attrs)
    segments = _build_segments(flat, forced_breaks)

    # 4. Paginate.
    result    = list(palette_tokens)
    current_h = 0
    in_pg     = False

    for toks, height, forced, attrs in segments:
        if forced:
            if in_pg:
                result.append(_pg_close())
            result.append(_pg_open(attrs))
            in_pg     = True
            current_h = 0
        elif not in_pg:
            result.append(_pg_open())
            in_pg     = True
            current_h = 0
        elif current_h > 0 and current_h + height > page_height:
            result.append(_pg_close())
            result.append(_pg_open())
            current_h = 0

        result.extend(toks)
        current_h += height

    if in_pg:
        result.append(_pg_close())

    return result


# ─────────────────────────────────────────────────────────────
# STEP 2 — FLATTEN
# ─────────────────────────────────────────────────────────────

def _flatten_pages(rest: list):
    """
    Strip ::pg / ::/pg tokens from `rest`, note forced break positions.

    Returns:
      flat          : token list with no pg OPEN/CLOSE tokens
      forced_breaks : {index_in_flat: original_pg_attrs}
    """
    flat          = []
    forced_breaks = {}

    for t in rest:
        if t.type == BLOCK_OPEN and t.name == "pg":
            if flat:   # first ::pg auto-opens, subsequent ones are forced breaks
                forced_breaks[len(flat)] = dict(t.attrs)
        elif t.type == BLOCK_CLOSE and t.name == "pg":
            pass
        else:
            flat.append(t)

    return flat, forced_breaks


# ─────────────────────────────────────────────────────────────
# STEP 3 — SEGMENT BUILDER
# ─────────────────────────────────────────────────────────────

def _build_segments(flat: list, forced_breaks: dict) -> list:
    """
    Convert `flat` into (tokens, height, is_forced, attrs) tuples.
    An entire block group (::def…::/def, ::col…::/col …) is one atomic segment.
    """
    segments = []
    i = 0

    while i < len(flat):
        t      = flat[i]
        forced = i in forced_breaks
        attrs  = forced_breaks.get(i, {})

        if t.type == BLOCK_OPEN:
            group, i = _collect_block(flat, i)
            segments.append((group, _block_height(group), forced, attrs))
        else:
            segments.append(([t], _token_height(t), forced, attrs))
            i += 1

    return segments


def _collect_block(tokens: list, start: int):
    """
    Starting at tokens[start] (a BLOCK_OPEN), collect up to and including
    the matching BLOCK_CLOSE.  Returns (group, next_index).
    """
    group = [tokens[start]]
    depth = 1
    i     = start + 1

    while i < len(tokens) and depth > 0:
        t = tokens[i]
        group.append(t)
        if t.type == BLOCK_OPEN:
            depth += 1
        elif t.type == BLOCK_CLOSE:
            depth -= 1
        i += 1

    return group, i


# ─────────────────────────────────────────────────────────────
# HEIGHT ESTIMATION
# ─────────────────────────────────────────────────────────────

def _block_height(group: list) -> int:
    """Estimate rendered height (px) of a block group [BLOCK_OPEN … BLOCK_CLOSE]."""
    if not group:
        return 0

    name  = group[0].name
    inner = group[1:-1]   # tokens between open and close

    if name == "col":
        return _col_height(inner)

    if name in ("def", "alr", "cdr"):
        return _sum_height(inner) + 40   # padding top + bottom

    if name == "schema":
        # =rep> zones inside schema are position:absolute — don't add height.
        # Height is determined solely by the background image size.
        size = group[0].attrs.get("size", "xl")
        return {"xs": 120, "s": 200, "m": 300, "l": 400, "xl": 450}.get(size, 400)

    if name == "resume":
        return _sum_height(inner) + 50   # label + padding

    if name == "tbl":
        return _sum_height(inner) + 16

    if name in ("tr", "trh"):
        return _row_height(inner) + 8

    if name == "tc":
        return _sum_height(inner) + 4

    if name == "c":
        return _sum_height(inner)

    return _sum_height(inner) + 16


def _col_height(inner: list) -> int:
    """::col height = its tallest ::c column (columns are side-by-side)."""
    col_heights = []
    i = 0

    while i < len(inner):
        t = inner[i]
        if t.type == BLOCK_OPEN and t.name == "c":
            col_group, i = _collect_block(inner, i)
            col_heights.append(_sum_height(col_group[1:-1]))
        else:
            i += 1

    return max(col_heights) if col_heights else 0


def _row_height(inner: list) -> int:
    """::tr/::trh height = max of its ::tc heights (cells are side-by-side)."""
    tc_heights = []
    i = 0

    while i < len(inner):
        t = inner[i]
        if t.type == BLOCK_OPEN and t.name == "tc":
            tc_group, i = _collect_block(inner, i)
            tc_heights.append(_block_height(tc_group))
        else:
            i += 1

    return max(tc_heights) if tc_heights else 8


def _sum_height(tokens: list) -> int:
    """Recursively sum estimated heights of a mixed token list."""
    total = 0
    i = 0

    while i < len(tokens):
        t = tokens[i]
        if t.type == BLOCK_OPEN:
            group, i = _collect_block(tokens, i)
            total += _block_height(group)
        else:
            total += _token_height(t)
            i += 1

    return total


def _token_height(t: Token) -> int:
    """Estimate height (px) of a single non-block token."""

    if t.type == HEADING:
        return {"h1": 65, "h2": 52, "h3": 42}.get(t.name, 48)

    if t.type == DIRECTIVE:
        if t.name == "sep":
            return 28
        if t.name == "saut":
            return 32
        if t.name == "esp":
            return {"xs": 8, "s": 18, "m": 28, "l": 44}.get(
                t.attrs.get("size", "s"), 18
            )
        return 20

    if t.type == CONTENT:
        n = t.name

        if n == "txt":
            chars = len(t.value or "")
            lines = max(1, (chars + 79) // 80)
            return lines * 28 + 10

        if n in ("h1", "h2", "h3"):
            return {"h1": 65, "h2": 52, "h3": 42}.get(n, 48)

        if n == "ques":
            chars = len(t.value or "")
            lines = max(1, (chars + 79) // 80)
            return lines * 28 + 28

        if n == "obj":
            chars = len(t.value or "")
            lines = max(1, (chars + 79) // 80)
            return lines * 28 + 55

        if n == "rep":
            return 130

        if n in ("img", "gif"):
            s = t.attrs.get("size", "m")
            return {"xs": 90, "s": 160, "m": 260, "l": 370, "xl": 430}.get(s, 260)

        if n == "vid":
            s = t.attrs.get("size", "xl")
            return {"xs": 130, "s": 210, "m": 310, "l": 390, "xl": 460}.get(s, 390)

        if n == "pdf":
            return 65

        if n == "lien":
            return 35

        if n == "qcm":
            parts = (t.value or "").split("|")
            n_ch  = max(0, len(parts) - 1)
            return n_ch * 48 + 85

        if n == "associer":
            parts = (t.value or "").split("|")
            return max(0, len(parts) - 1) * 44 + 90

        if n == "trier":
            parts = (t.value or "").split("|")
            return max(0, len(parts) - 1) * 48 + 85

        if n == "repg":
            parts = (t.value or "").split("|")
            return max(0, len(parts) - 1) * 38 + 85

        return 40

    return 20


# ─────────────────────────────────────────────────────────────
# TOKEN FACTORY
# ─────────────────────────────────────────────────────────────

def _pg_open(attrs: dict = None) -> Token:
    return Token(
        type=BLOCK_OPEN,
        name="pg",
        attrs=attrs or {},
        value="",
        source_line="::pg\n",
    )


def _pg_close() -> Token:
    return Token(
        type=BLOCK_CLOSE,
        name="pg",
        attrs={},
        value="",
        source_line="::/pg\n",
    )
