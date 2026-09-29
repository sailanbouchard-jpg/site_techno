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
  Les sections de premier niveau suivent ORDRE_SECTIONS (ordre pédagogique, pas
  alphabétique) ; un dossier absent de cette liste est ajouté à la fin, par ordre
  alphabétique, pour qu'aucun contenu ne disparaisse du site sans qu'on le voie.
  Séquences et activités sont triées alphabétiquement : utiliser des préfixes
  numériques (s01_, s02_, activite_01_, ...) pour contrôler leur ordre.
"""

from pathlib import Path


# ─────────────────────────────────────────────────────────────
# SECTIONS DE PREMIER NIVEAU
# ─────────────────────────────────────────────────────────────

# Dossier des médias du site : jamais une section de contenu.
DOSSIER_MEDIAS = "medias"

# Les trois niveaux du collège, du plus jeune au plus âgé.
SECTIONS_NIVEAUX = ("5eme", "4eme", "3eme")

# Ordre d'affichage des sections dans la navbar et sur l'accueil.
ORDRE_SECTIONS = SECTIONS_NIVEAUX + ("entrainement",)

# Nom du dossier → libellé affiché à l'élève.
TITRES_SECTIONS = {
    "5eme":         "5e",
    "4eme":         "4e",
    "3eme":         "3e",
    "entrainement": "entrainement",
}


def titre_section(nom_dossier: str) -> str:
    """Libellé affiché pour une section de contenu."""
    return TITRES_SECTIONS.get(nom_dossier, nom_dossier)


def build_catalog(content_root: Path) -> dict:
    """
    Scan content_root for class folders → sequence subfolders → .md activity files.
    Returns a dict mapping class names to lists of sequence descriptors.
    Les clés sont insérées dans l'ordre de ORDRE_SECTIONS : le dict conserve cet
    ordre, donc la navbar et l'accueil l'affichent tel quel sans le retrier.
    The 'medias' subfolder is automatically excluded.
    """
    catalog = {}

    for class_folder in _dossiers_sections(content_root):
        catalog[class_folder.name] = _scan_sequences(class_folder)

    return catalog


# ─────────────────────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────────────────────

def _dossiers_sections(content_root: Path) -> list:
    """
    Dossiers de contenu, dans l'ordre de ORDRE_SECTIONS. Un dossier non listé
    est placé à la fin (ordre alphabétique) : un nouveau contenu apparaît donc
    toujours sur le site, quitte à ce que sa place soit à préciser ensuite.
    """
    presents = {
        d.name: d
        for d in content_root.iterdir()
        if d.is_dir() and d.name != DOSSIER_MEDIAS
    }
    attendus = [presents.pop(nom) for nom in ORDRE_SECTIONS if nom in presents]
    return attendus + [presents[nom] for nom in sorted(presents)]


def _scan_sequences(class_folder: Path) -> list:
    """Séquences d'une section, chacune avec ses activités (.md), triées par nom."""
    sequences = []

    for seq_folder in sorted(class_folder.iterdir()):
        if not seq_folder.is_dir():
            continue

        activities = [
            {
                "slug":  source_file.stem,
                "title": _slug_to_readable_title(source_file.stem),
                "path":  source_file,
            }
            for source_file in sorted(seq_folder.glob("*.md"))
        ]

        if activities:
            sequences.append({
                "slug":       seq_folder.name,
                "title":      _slug_to_readable_title(seq_folder.name),
                "activities": activities,
            })

    return sequences


def _slug_to_readable_title(slug: str) -> str:
    """
    Convert a filename slug into a human-readable title.
    Used as fallback when the source file has no "titre:" header.
    La casse est conservée telle qu'écrite dans le nom du fichier/dossier.

    "s01_systemes_automatises" → "s01 systemes automatises"
    "S01 L'évolution des objets" → "S01 L'évolution des objets"
    """
    return slug.replace("_", " ")
