"""
palette_loader.py
-----------------
Reads .palette files from the palettes/ folder and returns them as Python dicts.

PALETTE FILE FORMAT:
  # This is a comment
  [section_name]
  key = value    other_key = other_value

  Multiple key=value pairs on one line are allowed:
  [h1]
  taille = 1.9em    couleur = #1a1a2e    poids = bold

NO PYTHON DEFAULTS:
  Palettes are loaded exactly as written — there is no hidden fallback in Python.
  Every color or style a block needs must be present in the .palette file.
  If a key is missing, the corresponding CSS property is simply not emitted.

RETURNED STRUCTURE:
  {
    "defaut": {
        "corps":  {"police": "Arial, sans-serif", "taille": "16px",
                   "couleur": "#222222", "interligne": "1.7"},
        "h1":     {"taille": "1.9em", "couleur": "#1a1a2e", "poids": "bold"},
        "pg":     {"fond": "#ffffff", "bordure": "#000000"},
        "def":    {"fond": "#e8f4fd", "bordure": "#2980b9", "texte": "#1a5276"},
        "bleu":   {"fond": "#e8f4fd", "bordure": "#2980b9"},
        ...
    },
    "sombre": { ... },
  }
"""

import sys
from pathlib import Path


# ─────────────────────────────────────────────────────────────
# PUBLIC FUNCTIONS
# ─────────────────────────────────────────────────────────────

def load_all_palettes(palettes_folder: Path) -> dict:
    """
    Scan palettes/ and load every .palette file.
    Returns a dict keyed by palette name (filename without extension).
    If the folder does not exist or is empty, returns an empty dict.
    """
    available = {}

    if not palettes_folder.exists():
        return available

    for palette_file in sorted(palettes_folder.glob("*.palette")):
        palette_name = palette_file.stem
        available[palette_name] = _parse_palette_file(palette_file)

    return available


def get_active_palette(palette_name: str, available_palettes: dict) -> dict:
    """
    Return the palette dict for the given name.
    Crashes with a clear error if the palette is not found.
    Called by the document renderer when ::palette <name> is encountered.
    """
    if palette_name in available_palettes:
        return available_palettes[palette_name]

    available_names = list(available_palettes.keys()) or ["(aucune)"]
    print(
        f"\n[ERREUR] La palette \"{palette_name}\" est introuvable.\n"
        f"  Palettes disponibles : {available_names}\n"
        f"  Vérifiez le dossier palettes/ et la directive ::palette dans votre fichier source.\n"
    )
    sys.exit(1)


# ─────────────────────────────────────────────────────────────
# INTERNAL: PARSE ONE .palette FILE
# ─────────────────────────────────────────────────────────────

def _parse_palette_file(palette_file: Path) -> dict:
    """
    Parse a .palette file into a nested dict {section_name: {key: value}}.
    Skips blank lines and comment lines (those starting with #).
    """
    sections        = {}
    current_section = None

    for raw_line in palette_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        # Section header: [section_name]
        if line.startswith("[") and line.endswith("]"):
            current_section = line[1:-1].strip()
            if current_section not in sections:
                sections[current_section] = {}
            continue

        # Key-value pairs are only valid inside a section
        if current_section is None:
            continue

        for key, value in _extract_key_value_pairs(line):
            sections[current_section][key] = value

    return sections


def _extract_key_value_pairs(line: str) -> list:
    """
    Extract all key = value pairs from a single line.
    The value extends until the next key= or end of line.

    'taille = 1.9em   couleur = #1a1a2e'
    → [('taille', '1.9em'), ('couleur', '#1a1a2e')]
    """
    import re
    pattern = re.compile(r"(\w+)\s*=\s*")
    matches = list(pattern.finditer(line))

    pairs = []
    for i, match in enumerate(matches):
        key   = match.group(1)
        start = match.end()
        end   = matches[i + 1].start() if i + 1 < len(matches) else len(line)
        value = line[start:end].strip()
        if value:
            pairs.append((key, value))

    return pairs
