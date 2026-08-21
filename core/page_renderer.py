"""
page_renderer.py
----------------
Orchestrates the three-step pipeline that turns one source file into HTML.

PIPELINE:
  1. split_header_from_body  →  extract metadata, get clean body text
  2. tokenize                →  classify every line into a Token
  3. render_document         →  walk Tokens with palette state → HTML string

This is the only function build.py needs to call per page.
Everything else is an implementation detail.
"""

from core.page_header_parser        import split_header_from_body
from core.parser.source_tokenizer   import tokenize
from core.parser.document_renderer  import render_document
from core.paginator                 import auto_paginate_tokens
from core.parser.token_types        import PALETTE


def render_page(source_text: str, available_palettes: dict, media_map: dict = None) -> tuple:
    """
    Transform the raw text of a source file into (metadata, html_content, active_palette).

    source_text        : the full text content of a .md source file
    available_palettes : dict loaded from palettes/ by palette_loader.load_all_palettes()
    media_map          : {filename: relative_url_path} built by build.py at build time

    Returns:
      metadata       : dict from the header block (may be empty)
      html_content   : the rendered HTML body, ready to inject into a page template
      active_palette : the full palette dict used by this document (or {} if none found)
    """
    metadata, body = split_header_from_body(source_text)
    tokens         = tokenize(body)
    is_page_mode   = metadata.get("mode") == "pages"

    if is_page_mode:
        tokens = auto_paginate_tokens(tokens)

    # Detect which palette is active (first ::palette token in the stream)
    active_palette_name = next(
        (t.value for t in tokens if t.type == PALETTE), None
    )
    active_palette = available_palettes.get(active_palette_name, {}) if active_palette_name else {}

    html = render_document(tokens, available_palettes, media_map or {}, is_page_mode=is_page_mode)

    return metadata, html, active_palette
