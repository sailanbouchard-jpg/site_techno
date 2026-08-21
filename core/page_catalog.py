"""
page_catalog.py
---------------
Scans the contenu/ folder and builds a structured index of all source files.

EXPECTED FOLDER LAYOUT:
  contenu/
    3eme/
      s01_nom_sequence/
        activite_01_xxx.md
        activite_02_xxx.md
      s02_autre_sequence/
        activite_01_xxx.md
    4eme/
      s01_nom_sequence/
        ...
    medias/          ← ignoré (médias du site, pas des activités)

RETURNED STRUCTURE:
  {
    "3eme": [
      {
        "slug":       "s01_nom_sequence",
        "title":      "S01 Nom Sequence",
        "activities": [
          {"slug": "activite_01_xxx", "title": "Activite 01 Xxx", "path": Path(...)},
          {"slug": "activite_02_xxx", "title": "Activite 02 Xxx", "path": Path(...)},
        ]
      },
    ],
    "4eme": [ ... ]
  }

ORDERING:
  Sections, séquences et activités sont triées alphabétiquement.
  Utiliser des préfixes numériques (s01_, s02_, activite_01_, ...) pour contrôler l'ordre.
"""

from pathlib import Path


def build_catalog(content_root: Path) -> dict:
    """
    Scan content_root for class folders → sequence subfolders → .md activity files.
    Returns a dict mapping class names to lists of sequence descriptors.
    The 'medias' subfolder is automatically excluded.
    """
    catalog = {}

    for class_folder in sorted(content_root.iterdir()):
        if not class_folder.is_dir():
            continue
        if class_folder.name == "medias":
            continue  # dossier des médias, pas une classe

        class_name = class_folder.name
        sequences = []

        for seq_folder in sorted(class_folder.iterdir()):
            if not seq_folder.is_dir():
                continue

            seq_slug  = seq_folder.name
            seq_title = _slug_to_readable_title(seq_slug)
            activities = []

            for source_file in sorted(seq_folder.glob("*.md")):
                slug  = source_file.stem
                title = _slug_to_readable_title(slug)
                activities.append({
                    "slug":  slug,
                    "title": title,
                    "path":  source_file,
                })

            if activities:
                sequences.append({
                    "slug":       seq_slug,
                    "title":      seq_title,
                    "activities": activities,
                })

        catalog[class_name] = sequences

    return catalog


# ─────────────────────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────────────────────

def _slug_to_readable_title(slug: str) -> str:
    """
    Convert a filename slug into a human-readable title.
    Used as fallback when the source file has no "titre:" header.

    "s01_systemes_automatises" → "S01 Systemes Automatises"
    "activite_01_les_panneaux" → "Activite 01 Les Panneaux"
    """
    return slug.replace("_", " ").title()
