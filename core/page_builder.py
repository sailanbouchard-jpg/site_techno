"""
page_builder.py
---------------
Assembles final HTML pages by injecting content into HTML templates.
Also builds the shared navbar (dropdown menu + search index).

TEMPLATE VARIABLES (in HTML template files):
  {{titre}}       → the page title (shown in the browser tab)
  {{navbar}}      → the navbar HTML (same on every page)
  {{contenu}}     → the rendered page content
  {{body_class}}  → optional CSS class on <body> (from "bg:" in page header)
  {{menu}}        → the dropdown menu HTML (used inside navbar.html)
  {{search_data}} → JSON array of all pages for the search bar

CATALOG STRUCTURE (new, 3 levels):
  {
    "3eme": [
      {
        "slug":       "s01_xxx",
        "title":      "S01 Xxx",
        "activities": [{"slug": "activite_01", "title": "...", "path": Path}, ...]
      }
    ]
  }

NAVBAR DROPDOWN BEHAVIOUR:
  Hover class button → dropdown showing sequences
  Hover sequence     → flyout to the right showing activities
"""

import json


# ─────────────────────────────────────────────────────────────
# NAVBAR
# ─────────────────────────────────────────────────────────────

def build_navbar_html(catalog: dict, navbar_template: str) -> str:
    """
    Fill the navbar template with the dropdown menu and the search index.
    The navbar is the same on every page, so we build it once.
    """
    menu_html   = _build_dropdown_menu_html(catalog)
    search_json = _build_search_index_json(catalog)

    navbar = navbar_template.replace("{{menu}}",        menu_html)
    navbar = navbar.replace(         "{{search_data}}", search_json)
    return navbar


def _build_dropdown_menu_html(catalog: dict) -> str:
    """
    Two-level flyout menu:
      Class button → dropdown with sequence items
      Hover sequence → flyout to the right with activity links
    """
    parts = []

    for class_name, sequences in catalog.items():
        seq_items = []
        for seq in sequences:
            activity_links = "\n".join(
                f'<a href="/{class_name}/{seq["slug"]}/{a["slug"]}.html">{a["title"]}</a>'
                for a in seq["activities"]
            )
            seq_items.append(
                f'<div class="seq-item">'
                f'<span class="seq-label">{seq["title"]}</span>'
                f'<div class="seq-flyout">{activity_links}</div>'
                f'</div>'
            )

        parts.append(
            f'<div class="nav-item">'
            f'<a class="nav-link" href="#">{class_name}</a>'
            f'<div class="dropdown">{"".join(seq_items)}</div>'
            f'</div>'
        )

    return "\n".join(parts)


def _build_search_index_json(catalog: dict) -> str:
    """JSON array of all activity pages for the client-side search bar."""
    entries = []
    for class_name, sequences in catalog.items():
        for seq in sequences:
            for a in seq["activities"]:
                entries.append({
                    "title": a["title"],
                    "url":   f"/{class_name}/{seq['slug']}/{a['slug']}.html",
                })
    return json.dumps(entries, ensure_ascii=False)


# ─────────────────────────────────────────────────────────────
# INDIVIDUAL CONTENT PAGES
# ─────────────────────────────────────────────────────────────

def build_content_page_html(
    page_metadata:  dict,
    html_content:   str,
    page_title:     str,
    navbar_html:    str,
    base_template:  str,
    active_palette: dict = None,
) -> str:
    """
    Inject all variables into the base.html template.
    Returns the complete HTML for one content page.
    """
    page = base_template
    page = page.replace("{{titre}}",   page_title)
    page = page.replace("{{navbar}}",  navbar_html)
    page = page.replace("{{contenu}}", html_content)

    is_entrainement = page_metadata.get("entrainement") == "oui"
    verif_section   = (active_palette or {}).get("verif", {})

    body_classes = []
    if page_metadata.get("bg"):
        body_classes.append(page_metadata["bg"])
    if page_metadata.get("mode") == "pages":
        body_classes.append("page-mode")
    if is_entrainement:
        body_classes.append("entrainement-mode")
    page = page.replace("{{body_class}}", " ".join(body_classes))

    # Bouton "Effacer les réponses" en haut de page, seulement en mode entraînement
    if is_entrainement:
        effacer_fond  = verif_section.get("effacer_btn_fond",  "#b91c1c")
        effacer_texte = verif_section.get("effacer_btn_texte", "#ffffff")
        entrainement_bar = (
            f'<button type="button" id="btn-effacer-entrainement" '
            f'style="background:{effacer_fond}; color:{effacer_texte};">'
            f'Effacer les réponses</button>'
        )
    else:
        entrainement_bar = ""
    page = page.replace("{{entrainement_bar}}", entrainement_bar)

    # Generate CSS custom properties from palette [pages] section (mode pages only)
    pages_section = (active_palette or {}).get("pages", {}) if page_metadata.get("mode") == "pages" else {}
    css_var_lines = [
        f"        --pm-{key.replace('_', '-')}: {value};"
        for key, value in pages_section.items()
    ]

    # CSS custom properties pour =verif> — déclarées au niveau :root (pas sur
    # .block-verif) car les icônes ✓/✗ et le texte de corrigé sont injectés par
    # JS DANS d'autres blocs (=rep>/=choix>, ::schema), pas dans .block-verif
    # lui-même : une variable scoped sur .block-verif ne les atteindrait pas.
    rouge_section = (active_palette or {}).get("rouge", {})
    css_var_lines += [
        f"        --verif-valide: {verif_section.get('valide_couleur', '#16a34a')};",
        f"        --verif-croix: {verif_section.get('croix_couleur', '#dc2626')};",
        f"        --verif-symbole-taille: {verif_section.get('symbole_taille', '1.3em')};",
        f"        --verif-ok: {verif_section.get('ok_couleur', '#065f46')};",
        f"        --verif-err: {verif_section.get('err_couleur', '#991b1b')};",
        f"        --verif-corrige-fond: {verif_section.get('corrige_fond', '#ffffff')};",
        f"        --verif-corrige-couleur: {rouge_section.get('bordure', '#c0392b')};",
    ]

    page_style = "    <style>\n    :root {\n" + "\n".join(css_var_lines) + "\n    }\n    </style>"
    page = page.replace("{{page_style}}", page_style)

    return page


# ─────────────────────────────────────────────────────────────
# HOME PAGE
# ─────────────────────────────────────────────────────────────

def build_home_page_html(
    navbar_html:    str,
    home_template:  str,
) -> str:
    """Inject the navbar into the home page template."""
    return home_template.replace("{{navbar}}", navbar_html)
