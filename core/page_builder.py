"""
page_builder.py
---------------
Assembles final HTML pages by injecting content into HTML templates.
Also builds the shared navbar (arborescence de navigation + search index).

TEMPLATE VARIABLES (in HTML template files):
  {{titre}}       → the page title (shown in the browser tab)
  {{navbar}}      → the navbar HTML (same on every page)
  {{contenu}}     → the rendered page content
  {{body_class}}  → optional CSS class on <body> (from "bg:" in page header)
  {{menu}}        → the tree menu HTML (used inside navbar.html)
  {{nav_style}}   → CSS variables emitted from the [navbar] palette section
  {{search_data}} → JSON array of all pages for the search bar

PAGE DE GARDE (accueil.html) :
  {{accueil_style}}   → CSS variables emitted from the [accueil] palette section

CATALOG STRUCTURE (3 levels):
  {
    "3eme": [
      {
        "slug":       "s01_xxx",
        "title":      "S01 Xxx",
        "activities": [{"slug": "activite_01", "title": "...", "path": Path}, ...]
      }
    ]
  }

NAVBAR TREE BEHAVIOUR:
  Sidebar verticale fixée à gauche, façon explorateur de fichiers.
  Clic sur un dossier (classe ou séquence) → déplie/replie ses enfants
  (<details>/<summary> natifs, aucun JS nécessaire, plusieurs dossiers
  peuvent rester ouverts en même temps). Clic sur une page → navigation.
  La page courante est surlignée et ses dossiers parents dépliés
  automatiquement (petit script dans navbar.html).
"""

import json

from core.page_catalog import titre_section


# ─────────────────────────────────────────────────────────────
# NAVBAR
# ─────────────────────────────────────────────────────────────

# La navbar est partagée par toutes les pages : elle lit toujours cette palette.
NAVBAR_PALETTE = "defaut"

# Correspondance clé de la section [navbar] → variable CSS émise sur <nav>.
# Une clé absente de la palette → pas de variable émise (comportement voulu).
NAVBAR_PALETTE_VARS = {
    "largeur":      "--nav-largeur",
    "taille_classe":  "--nav-taille-classe",
    "poids_classe":   "--nav-poids-classe",
    "largeur_classe": "--nav-largeur-classe",
    "taille_dossier": "--nav-taille-dossier",
    "poids_dossier":  "--nav-poids-dossier",
    "espacement_dossier": "--nav-espacement-dossier",
    "taille_page":    "--nav-taille-page",
    "poids_page":     "--nav-poids-page",
    "taille_champ":   "--nav-taille-champ",
    "fond":         "--nav-fond",
    "bordure":      "--nav-bordure",
    "texte":        "--nav-texte",
    "titre":        "--nav-titre",
    "survol_fond":  "--nav-survol-fond",
    "dossier":      "--nav-dossier",
    "fichier":      "--nav-fichier",
    "ligne":        "--nav-ligne",
    "classe_texte": "--nav-classe-texte",
    "actif_fond":   "--nav-actif-fond",
    "actif_texte":  "--nav-actif-texte",
    "actif_barre":  "--nav-actif-barre",
    "police":       "--nav-police",
    "ombre":        "--nav-ombre",
    "champ_fond":   "--nav-champ-fond",
    "bouton_fond":  "--nav-bouton-fond",
    "bouton_texte": "--nav-bouton-texte",
}

# Les modules autonomes (atelier 3D) portent ce commentaire là où la navbar
# du site doit apparaître. Ouverts seuls, sans le site, ils restent valides.
MARQUE_NAVBAR_AUTONOME = "<!-- {{navbar}} -->"

# Sections de navbar qui ne viennent pas de contenu/ : elles pointent vers les
# modules autonomes du site (dossiers copiés tels quels au build). Affichées
# après les sections de contenu, dans l'ordre d'écriture ci-dessous.
#   nom de la section → [(libellé du lien, url, description au survol), ...]
SECTIONS_LIENS = {
    "outils": [
        {
            "libelle": "Atelier 3D",
            "url":     "/cao/",
            "resume":  "Conception 3D dans le navigateur : formes, trous, assemblages, export STL.",
            "icone":   "cube",
        },
    ],
    "contenu additionnel": [
        {
            "libelle": "Simulateur de structures",
            "url":     "/simulateur-structures/",
            "resume":  "Poutres, nœuds et appuis : observer la déformation sous charge.",
            "icone":   "structure",
        },
        {
            "libelle": "Terminal — défi 00",
            "url":     "/simulateur-cmd/challenges/00-prise-en-main/",
            "resume":  "Prise en main d'une ligne de commande, en trois niveaux.",
            "icone":   "terminal",
        },
        {
            "libelle": "Cyber-défis",
            "url":     "/cyberdefis/",
            "resume":  "Réseaux et Web : retrouver un flag en comprenant la notion qui le cache.",
            "icone":   "drapeau",
        },
    ],
}

# Logo affiché en tête de navbar (copié dans site/medias/ au build)
NAVBAR_LOGO_URL = "/medias/site_style/logo_navbar.png"

# Icônes SVG inline (auto-hébergées, aucune ressource externe).
# La couleur vient de currentColor, fixé par les classes .tree-ico-* (voir style.css).
ICONE_DOSSIER_FERME = (
    '<svg class="tree-ico tree-ico-dossier tree-ico-ferme" viewBox="0 0 24 24"'
    ' fill="currentColor" aria-hidden="true">'
    '<path d="M4 4.5h5.2l2 2.3h9a1.6 1.6 0 0 1 1.6 1.6v9.5a1.6 1.6 0 0 1-1.6'
    ' 1.6H4a1.6 1.6 0 0 1-1.6-1.6V6.1A1.6 1.6 0 0 1 4 4.5z"/></svg>'
)
ICONE_DOSSIER_OUVERT = (
    '<svg class="tree-ico tree-ico-dossier tree-ico-ouvert" viewBox="0 0 24 24"'
    ' fill="currentColor" aria-hidden="true">'
    '<path d="M4 4.5h5.2l2 2.3h7.2a1.6 1.6 0 0 1 1.6 1.6v1.1H7.3a2.1 2.1 0 0 0-2'
    ' 1.5L2.4 17V6.1A1.6 1.6 0 0 1 4 4.5z"/>'
    '<path d="M7.3 10.6h13.2a1 1 0 0 1 .95 1.3l-1.85 5.9a2.1 2.1 0 0 1-2 1.5H4.4'
    'a1 1 0 0 1-.95-1.3l1.9-5.9a2.1 2.1 0 0 1 1.95-1.5z"/></svg>'
)
ICONE_FICHIER = (
    '<svg class="tree-ico tree-ico-fichier" viewBox="0 0 24 24" fill="none"'
    ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
    ' stroke-linejoin="round" aria-hidden="true">'
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
    '<path d="M14 2v6h6"/>'
    '<path d="M9 13h6"/><path d="M9 17h4"/></svg>'
)


def build_navbar_html(catalog: dict, navbar_template: str, available_palettes: dict = None) -> str:
    """
    Fill the navbar template with the tree menu, the palette CSS variables
    and the search index. The navbar is the same on every page, built once.
    """
    palette     = (available_palettes or {}).get(NAVBAR_PALETTE, {})
    menu_html   = _build_tree_menu_html(catalog)
    nav_style   = _build_navbar_style_vars(palette)
    search_json = _build_search_index_json(catalog)

    navbar = navbar_template.replace("{{menu}}",        menu_html)
    navbar = navbar.replace(         "{{nav_style}}",   nav_style)
    navbar = navbar.replace(         "{{search_data}}", search_json)
    navbar = navbar.replace(         "{{logo_url}}",    NAVBAR_LOGO_URL)
    return navbar


def _build_tree_menu_html(catalog: dict) -> str:
    """
    Arborescence à 3 niveaux : section → séquence → activité, puis les
    sections de liens (SECTIONS_LIENS) à un seul niveau.

      <details class="tree-dossier tree-classe">
        <summary>[icônes dossier] 5e</summary>
        <div class="tree-enfants">
          <details class="tree-dossier">
            <summary>[icônes dossier] S01 Xxx</summary>
            <div class="tree-enfants">
              <a class="tree-page" href="…">[icône fichier] Activite 01 Xxx</a>
            </div>
          </details>
        </div>
      </details>

    Les deux icônes dossier (fermé + ouvert) sont émises ensemble : le CSS
    n'affiche que celle qui correspond à l'état du <details>.
    """
    parts = [
        _section_arborescence(titre_section(class_name), _sequences_html(class_name, sequences))
        for class_name, sequences in catalog.items()
    ]

    # Sections de liens (outils, contenu additionnel) : un seul niveau, pas de séquences.
    for nom_section, liens in SECTIONS_LIENS.items():
        enfants = "".join(
            f'<a class="tree-page" href="{lien["url"]}" title="{lien["resume"]}">'
            f'{ICONE_FICHIER}<span>{lien["libelle"]}</span></a>'
            for lien in liens
        )
        parts.append(_section_arborescence(nom_section, enfants))

    return "\n".join(parts)


def _section_arborescence(titre: str, enfants_html: str) -> str:
    """Un dossier de premier niveau de la navbar, et son contenu déjà rendu."""
    icones_dossier = ICONE_DOSSIER_FERME + ICONE_DOSSIER_OUVERT
    return (
        f'<details class="tree-dossier tree-classe">'
        f'<summary>{icones_dossier}<span>{titre}</span></summary>'
        f'<div class="tree-enfants">{enfants_html}</div>'
        f'</details>'
    )


def _sequences_html(class_name: str, sequences: list) -> str:
    """Les séquences d'une section, chacune dépliable sur ses activités."""
    icones_dossier = ICONE_DOSSIER_FERME + ICONE_DOSSIER_OUVERT
    blocs = []

    for seq in sequences:
        liens = "".join(
            f'<a class="tree-page" href="/{class_name}/{seq["slug"]}/{a["slug"]}.html">'
            f'{ICONE_FICHIER}<span>{a["title"]}</span></a>'
            for a in seq["activities"]
        )
        blocs.append(
            f'<details class="tree-dossier">'
            f'<summary>{icones_dossier}<span>{seq["title"]}</span></summary>'
            f'<div class="tree-enfants">{liens}</div>'
            f'</details>'
        )

    return "".join(blocs)


def _build_navbar_style_vars(palette: dict) -> str:
    """Variables CSS inline issues de la section [navbar] de la palette."""
    section = palette.get("navbar", {})
    return " ".join(
        f"{css_var}: {section[cle]};"
        for cle, css_var in NAVBAR_PALETTE_VARS.items()
        if cle in section
    )


def _build_search_index_json(catalog: dict) -> str:
    """JSON array of every page (activités + modules autonomes) for the search bar."""
    entries = []
    for class_name, sequences in catalog.items():
        for seq in sequences:
            for a in seq["activities"]:
                entries.append({
                    "title": a["title"],
                    "url":   f"/{class_name}/{seq['slug']}/{a['slug']}.html",
                })

    # Les outils et contenus additionnels sont cherchables comme les activités.
    for liens in SECTIONS_LIENS.values():
        entries += [{"title": l["libelle"], "url": l["url"]} for l in liens]

    return json.dumps(entries, ensure_ascii=False)


def inject_navbar_into_standalone(page_html: str, navbar_html: str) -> str:
    """Place la navbar partagée dans la page d'un module autonome."""
    return page_html.replace(MARQUE_NAVBAR_AUTONOME, navbar_html)


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

# La page de garde lit la même palette que la navbar : elle en reprend les codes.
ACCUEIL_PALETTE = "defaut"

# Correspondance clé de la section [accueil] → variable CSS émise sur <body>.
# Une clé absente de la palette → pas de variable émise (comportement voulu).
ACCUEIL_PALETTE_VARS = {
    "police":           "--acc-police",
    "fond":             "--acc-fond",
    "texte":            "--acc-texte",
    "titre":            "--acc-titre",
    "muet":             "--acc-muet",
    "titre_taille":     "--acc-titre-taille",
    # Encadrés d'explication en bas de page : texte, fenêtre de code, aperçu
    "expl_titre":        "--acc-expl-titre",
    "expl_texte":        "--acc-expl-texte",
    "expl_muet":         "--acc-expl-muet",
    "expl_taille":       "--acc-expl-taille",
    "cadre_bordure":     "--acc-cadre-bordure",
    "cadre_barre_fond":  "--acc-cadre-barre-fond",
    "cadre_barre_texte": "--acc-cadre-barre-texte",
    "rendu_fond":        "--acc-rendu-fond",
    "code_fond":         "--acc-code-fond",
    "code_texte":        "--acc-code-texte",
    "code_balise":       "--acc-code-balise",
    "code_attribut":     "--acc-code-attribut",
    "code_valeur":       "--acc-code-valeur",
    "code_barre_fond":   "--acc-code-barre-fond",
    "code_barre_texte":  "--acc-code-barre-texte",
}


def build_home_page_html(
    navbar_html:        str,
    home_template:      str,
    available_palettes: dict = None,
) -> str:
    """Remplit la page de garde : navbar et variables CSS de la section [accueil]."""
    palette = (available_palettes or {}).get(ACCUEIL_PALETTE, {})

    page = home_template
    page = page.replace("{{navbar}}",        navbar_html)
    page = page.replace("{{accueil_style}}", _build_accueil_style_vars(palette))
    return page


def _build_accueil_style_vars(palette: dict) -> str:
    """Variables CSS inline issues de la section [accueil] de la palette."""
    section = palette.get("accueil", {})
    return " ".join(
        f"{css_var}: {section[cle]};"
        for cle, css_var in ACCUEIL_PALETTE_VARS.items()
        if cle in section
    )
