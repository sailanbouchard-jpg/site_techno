"""
page_header_parser.py
---------------------
Reads the optional metadata header at the top of a Lanternes source file.

WHY THIS EXISTS:
  Each .md source file can optionally start with a metadata block between
  triple-dash separators. This block provides the page title, level, theme,
  and any other per-page settings used by the build system.

HEADER FORMAT:
  ---
  titre:  L'orientation des panneaux solaires
  niveau: 6eme
  bg:     dark
  ---

  (rest of the document starts here)

SUPPORTED:
  Simple "key: value" pairs only. One per line.
  No nested keys. No lists. No multi-line values.
  This intentional simplicity avoids the need for a YAML library.

RETURNS:
  meta = {"titre": "...", "niveau": "6eme", "bg": "dark"}
  body = the complete document text, minus the header block
"""


def split_header_from_body(source_text: str) -> tuple:
    """
    Split the source text into (metadata dict, body text).

    If no --- header is found, metadata is empty and body is the full text.
    """
    if not source_text.startswith("---"):
        return {}, source_text

    parts = source_text.split("---", maxsplit=2)

    # Expected structure: ["", " yaml content ", " body content "]
    if len(parts) < 3:
        return {}, source_text

    raw_header = parts[1].strip()
    body       = parts[2].strip()
    metadata   = _parse_key_value_lines(raw_header)

    return metadata, body


# ─────────────────────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────────────────────

def _parse_key_value_lines(raw_header: str) -> dict:
    """
    Extract key: value pairs from the header block.
    Lines without a colon are silently skipped.
    The value extends to end-of-line (colons in values are preserved).
    """
    metadata = {}

    for line in raw_header.splitlines():
        line = line.strip()

        if not line or ":" not in line:
            continue

        # partition() splits on the FIRST colon only
        key, _, value = line.partition(":")
        metadata[key.strip()] = value.strip()

    return metadata
