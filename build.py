"""
build.py
--------
Entry point. Run from the project root to generate the full website.

  python build.py

OUTPUT:
  site/
    index.html
    static/style.css
    medias/...        (copié depuis contenu/medias/, arborescence préservée)
    simulateur-structures/...  (copié tel quel depuis simulateur-structures/, module autonome)
    3eme/
      s01_systemes_automatises/
        activite_01_automatismes.html
        ...
    4eme/
      ...
"""

import sys
from pathlib import Path
import shutil

# Ensure Unicode output works on Windows terminals (cp1252 → utf-8)
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf_8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from core.page_catalog             import build_catalog
from core.page_renderer            import render_page
from core.page_builder             import (
    build_navbar_html,
    build_content_page_html,
    build_home_page_html,
)
from core.palette.palette_loader   import load_all_palettes
from core.site_icons               import fetch_all_site_icons


# ─────────────────────────────────────────────────────────────
# PROJECT PATHS  (all relative to this file)
# ─────────────────────────────────────────────────────────────

ROOT      = Path(__file__).parent
SITE      = ROOT / "site"            # generated output — never edit manually
CONTENT   = ROOT / "contenu"         # source files (.md) + medias
MEDIAS    = ROOT / "contenu" / "medias"  # images, GIFs, PDFs, videos
TEMPLATES = ROOT / "templates"       # HTML templates
STATIC    = ROOT / "static"          # CSS, fonts, JS
PALETTES  = ROOT / "palettes"        # .palette files
PAGES     = ROOT / "pages"           # standalone HTML pages copied verbatim to site/
SIMULATEUR_STRUCTURES = ROOT / "simulateur-structures"  # module autonome (HTML/CSS/JS), copié tel quel


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def read_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_media_map(medias_root: Path) -> dict:
    """
    Scan all files recursively under medias_root.
    Returns {filename: relative_url_path} so that any file can be referenced
    by name alone — the build finds its actual subfolder automatically.

    Example:
      contenu/medias/pdf/fiche.pdf  →  {"fiche.pdf": "pdf/fiche.pdf"}
      contenu/medias/animation.gif  →  {"animation.gif": "animation.gif"}
    """
    mapping = {}
    if not medias_root.exists():
        return mapping
    for f in medias_root.rglob("*"):
        if f.is_file():
            rel = f.relative_to(medias_root)
            mapping[f.name] = str(rel).replace("\\", "/")
    return mapping


# ─────────────────────────────────────────────────────────────
# MAIN BUILD
# ─────────────────────────────────────────────────────────────

def main():
    print("▶  Build started\n")

    # 1. Clean output folder
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir()
    print("   ✓ site/ cleaned")

    # 2. Copy static assets
    shutil.copytree(STATIC, SITE / "static")
    print("   ✓ static/ copied")

    # 3. Télécharger les icônes des liens externes avant la copie (incrémental, cache dans contenu/medias/site_icons/)
    print("   ↓ Icônes de liens externes :")
    fetch_all_site_icons(CONTENT, MEDIAS / "site_icons")

    # 4. Copy media files (contenu/medias/ → site/medias/, arborescence préservée, icônes incluses)
    if MEDIAS.exists():
        shutil.copytree(MEDIAS, SITE / "medias", dirs_exist_ok=True)
        print("   ✓ medias/ copied")
    else:
        print("   ⚠ contenu/medias/ not found — skipping")

    # 5. Build the media map (filename → relative URL path)
    media_map = build_media_map(MEDIAS)
    print(f"   ✓ Media map: {len(media_map)} fichiers indexés")

    # 6. Load palettes
    available_palettes = load_all_palettes(PALETTES)
    print(f"   ✓ Palettes loaded: {list(available_palettes.keys()) or ['(none — using defaults)']}")

    # 7. Load HTML templates
    navbar_template = read_file(TEMPLATES / "navbar.html")
    base_template   = read_file(TEMPLATES / "base.html")
    home_template   = read_file(TEMPLATES / "accueil.html")
    print("   ✓ Templates loaded")

    # 8. Build page catalog (class → sequences → activities)
    catalog    = build_catalog(CONTENT)
    page_count = sum(
        len(seq["activities"])
        for sequences in catalog.values()
        for seq in sequences
    )
    seq_count  = sum(len(sequences) for sequences in catalog.values())
    print(f"   ✓ Catalog: {page_count} activités, {seq_count} séquences, {len(catalog)} classes")

    # 9. Build shared navbar (same on every page)
    navbar_html = build_navbar_html(catalog, navbar_template)

    # 10. Render and write each content page
    print("\n   Rendering pages:")

    for class_name, sequences in catalog.items():
        for seq_info in sequences:
            for page_info in seq_info["activities"]:

                source_text = read_file(page_info["path"])
                page_metadata, html, active_palette = render_page(source_text, available_palettes, media_map)

                page_title = page_metadata.get("titre", page_info["title"])

                page_html = build_content_page_html(
                    page_metadata  = page_metadata,
                    html_content   = html,
                    page_title     = page_title,
                    navbar_html    = navbar_html,
                    base_template  = base_template,
                    active_palette = active_palette,
                )

                output_path = SITE / class_name / seq_info["slug"] / f"{page_info['slug']}.html"
                write_file(output_path, page_html)
                print(f"     ✓ {class_name}/{seq_info['slug']}/{page_info['slug']}.html")

    # 11. Build and write the home page
    home_html = build_home_page_html(navbar_html, home_template)
    write_file(SITE / "index.html", home_html)
    print("\n   ✓ index.html")

    # 12. Copy standalone pages (pages/*.html → site/*.html)
    if PAGES.exists():
        extra = list(PAGES.glob("*.html"))
        for f in extra:
            shutil.copy(f, SITE / f.name)
        if extra:
            print(f"   ✓ pages/ copied ({len(extra)} files)")

    # 13. Copy the structure simulator (module autonome, copié tel quel, jamais régénéré)
    if SIMULATEUR_STRUCTURES.exists():
        shutil.copytree(SIMULATEUR_STRUCTURES, SITE / "simulateur-structures")
        print("   ✓ simulateur-structures/ copied")

    print(f"\n✔  Build complete — {page_count} pages written to site/\n")


if __name__ == "__main__":
    main()
