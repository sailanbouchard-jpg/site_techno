"""
blocks/input_blocks.py
----------------------
Renders interactive input blocks for student answers.

SYNTAX:
  =rep> question_id                               → standalone textarea
  =rep> question_id x=X% y=Y%                    → compact zone on a ::schema image
  =rep> question_id x=X% y=Y% l=N% 60%           → + largeur et opacité custom
  =rep> question_id x=X% y=Y% e=70%              → largeur = 70% de la taille par défaut
  =rep> question_id x=X% y=Y% asymetrique        → grandit seulement vers le bas (par défaut : des deux côtés)
  (inside a ::tc, ::dcase ou ::dracine, sans x/y) → compact zone inline (tableau ou diagramme fonctionnel)

  =choix> question_id | Choix 1 | Choix 2 | ...           → liste déroulante, mode normal
  =choix> question_id x=X% y=Y% | Choix 1 | Choix 2       → compact, sur un ::schema
  =choix> question_id x=X% y=Y% e=70% asymetrique | ...   → mêmes réglages que =rep>
  Pas de bonne réponse marquée (contrairement à =qcm>) : juste sauvegardé tel quel.

  =options> nom | Choix 1 | Choix 2 | ...                 → set d'options nommé,
  défini une fois puis référencé par plusieurs =choix> via options=nom, au lieu
  de réécrire la même liste à chaque fois. Doit apparaître avant les =choix>
  qui le référencent (document lu en un seul passage, du haut vers le bas).
  =choix> question_id x=X% y=Y% options=nom               → utilise ce set

PALETTE KEYS  (section [rep] in the .palette file):
  fond         → textarea background color (post-it)
  fond_cadre   → outer container background (mode normal uniquement)
  bordure      → left-border accent color
  texte        → textarea text color
  bouton_fond  → save button background
  bouton_texte → save button text color
  police_rep      → font-family for the textarea (e.g. "Caveat, cursive")
  taille_rep      → font-size for the textarea in normal mode (e.g. "1.2em")
  facteur_compact → ratio applied to taille_rep for compact mode (e.g. 0.75)
  taille_bouton         → font-size of the Sauvegarder/Charger icon buttons in normal mode (e.g. ".88em")
  taille_bouton_compact → font-size of the icon buttons in compact mode — schema/table (e.g. ".47em")
                           (button padding and icon size are in em, so both scale along with these)

  [choix] (optionnel) : mêmes clés que [rep] ci-dessus (sans bouton_fond/texte, pas de
  bouton Sauvegarder) ; toute clé absente retombe sur la valeur de [rep].

The JS that handles load/save lives in templates/base.html and runs on every page.
"""

import re
from core.parser.token_types import Token

_COMPACT_DEFAULT_OPACITY = 0.82

# Doit rester synchronisé avec ".block-rep.schema-zone { width: 15%; }" dans style.css —
# c'est la largeur que l'argument e= (échelle) prend comme référence à 100%.
_DEFAULT_SCHEMA_ZONE_WIDTH_PERCENT = 15

# Doit rester synchronisé avec ".block-rep.compact-zone .rep-textarea { min-height: 28px; }"
# dans style.css — c'est la hauteur d'une case à une seule ligne, utilisée comme référence
# fixe pour le mode asymetrique (voir render_rep).
_SCHEMA_ZONE_BASELINE_HEIGHT_PX = 28

# Icônes des boutons Sauvegarder/Charger (=rep>, =choix>), normal et compact — aucun texte,
# voir CLAUDE.md. stroke="currentColor" suit color:{bouton_texte|charger_texte} posé inline
# sur le <button> ; width/height="1em" suit font-size, donc taille_bouton/taille_bouton_compact.
_ICON_SAUVEGARDER = (
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/>'
    '<path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>'
)
_ICON_CHARGER = (
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>'
)


def _scale_css_size(value: str, factor: float) -> str:
    """
    Multiply a CSS length value by factor.
    Supports em, rem, px, %.  Returns value unchanged if unparseable.
    Examples: _scale_css_size("1.2em", 0.75) → "0.9em"
              _scale_css_size("20px",  0.75) → "15px"
    """
    m = re.match(r'^([\d.]+)(em|rem|px|%)$', value.strip())
    if not m:
        return value
    num  = float(m.group(1))
    unit = m.group(2)
    scaled = num * factor
    # Drop trailing zeros but keep at least one decimal for em/rem
    formatted = f"{scaled:.4g}"
    return f"{formatted}{unit}"


def _hex_to_rgba(color: str, alpha: float) -> str:
    """
    Convert a CSS hex color (#rgb or #rrggbb) to rgba(r,g,b,alpha).
    Returns the color unchanged if it is not a hex value.
    """
    m = re.match(r'^#([0-9a-fA-F]{3,6})$', color.strip())
    if not m:
        return color
    h = m.group(1)
    if len(h) == 3:
        h = h[0] * 2 + h[1] * 2 + h[2] * 2
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


def _zone_positioning(token: Token, context: dict) -> dict:
    """
    Shared placement logic for compact answer blocks (=rep>, =choix>): normal /
    schema (x=/y= on a ::schema image) / table (inside a ::tc cell, or a
    ::dcase/::dracine, diagramme fonctionnel) mode, plus the schema-mode width
    (l=/e=) and centering transform (symetrique/asymetrique).
    See render_rep's docstring for the x=/y=/l=/e=/asymetrique syntax.
    """
    x = token.attrs.get("x")
    y = token.attrs.get("y")
    schema_mode = x is not None and y is not None
    table_mode  = not schema_mode and context.get("parent_block") in ("tc", "dcase", "dracine")

    zone_transform = None
    if schema_mode:
        largeur = token.attrs.get("largeur")
        echelle = token.attrs.get("echelle", 1.0)
        if not largeur and echelle != 1.0:
            largeur = f"{_DEFAULT_SCHEMA_ZONE_WIDTH_PERCENT * echelle:.4g}%"
        width_style = f" width:{largeur};" if largeur else ""
        # Le centre x/y placé dans l'outil de schéma doit toujours correspondre au centre
        # de la ZONE DE RÉPONSE seule, jamais "réponse + boutons" — donc le footer est sorti
        # du flux (position:absolute dans .rep-zone-anchor) et la transformation -50% ne
        # porte que sur l'ancre, dont la hauteur "auto" colle exactement à celle de la réponse.
        #
        # Mode par défaut (symétrique) : translateY(-50%), recalculé sur la hauteur réelle
        # à chaque agrandissement → la case grandit des deux côtés, son centre reste fixe.
        # Mode asymetrique : translateY figé en pixels (= moitié de la hauteur 1 ligne) →
        # le haut ne bouge plus, un contenu qui grandit déborde vers le bas (le centre du
        # bloc agrandi se décale alors vers le bas, et c'est voulu).
        if token.attrs.get("symetrique"):
            transform_y = "-50%"
        else:
            transform_y = f"-{_SCHEMA_ZONE_BASELINE_HEIGHT_PX // 2}px"
        zone_transform = f"translate(-50%,{transform_y})"
        extra_class = " compact-zone schema-zone"
        extra_style = f" position:absolute; left:{x}; top:{y};{width_style}"
    elif table_mode:
        extra_class = " compact-zone table-zone"
        extra_style = ""
    else:
        extra_class = ""
        extra_style = ""

    return {
        "schema_mode":    schema_mode,
        "table_mode":     table_mode,
        "compact":        schema_mode or table_mode,
        "extra_class":    extra_class,
        "extra_style":    extra_style,
        "zone_transform": zone_transform,
    }


def render_rep(token: Token, context: dict) -> str:
    """
    =rep> question_id — student text-answer input block.

    Three rendering modes (same save mechanism for all three):

    Normal mode   : full textarea + "Sauvegarder" button.

    Schema mode   : compact 1-line zone absolutely positioned on the parent
                    ::schema image (x=/y= attrs required).

    Table mode    : same compact appearance as schema mode but inline inside
                    a table cell (automatically when parent block is ::tc).
    """
    question_id = token.value.strip() or "q"
    pos         = _zone_positioning(token, context)
    schema_mode = pos["schema_mode"]
    table_mode  = pos["table_mode"]
    compact     = pos["compact"]

    rep = context["palette"].get("rep", {})

    fond         = rep.get("fond",         "#fdf8ed")
    fond_cadre   = rep.get("fond_cadre",   fond)       # fallback = fond si absent
    bordure      = rep.get("bordure",      "#c8a84a")
    texte        = rep.get("texte",        "#1a1200")
    bouton_fond  = rep.get("bouton_fond",  "#9b7a00")
    bouton_texte = rep.get("bouton_texte", "#ffffff")
    police_rep      = rep.get("police_rep",      "inherit")
    taille_rep      = rep.get("taille_rep",      "1em")
    facteur_compact = float(rep.get("facteur_compact", 0.75))

    taille_bouton         = rep.get("taille_bouton",         ".88em")
    taille_bouton_compact = rep.get("taille_bouton_compact", ".6em")

    charger_fond  = rep.get("charger_fond",  "#4f46e5")
    charger_texte = rep.get("charger_texte", "#ffffff")
    annuler_fond  = rep.get("annuler_fond",  "#b91c1c")
    annuler_texte = rep.get("annuler_texte", "#ffffff")
    charge_statut = rep.get("charge_statut", "#6d28d9")

    css_vars = (
        f"--rep-fond:{fond};"
        f"--rep-texte:{texte};"
        f"--rep-bordure:{bordure};"
        f"--rep-bouton-taille:{taille_bouton};"
        f"--rep-bouton-taille-compact:{taille_bouton_compact};"
        f"--rep-charger-fond:{charger_fond};"
        f"--rep-charger-texte:{charger_texte};"
        f"--rep-annuler-fond:{annuler_fond};"
        f"--rep-annuler-texte:{annuler_texte};"
        f"--rep-charge-statut:{charge_statut};"
    )

    if schema_mode:
        alpha        = token.attrs.get("opacite") or _COMPACT_DEFAULT_OPACITY
        outer_colors = ""
        textarea_bg  = f"background:{_hex_to_rgba(fond, alpha)}; "
        placeholder  = "…"

    elif table_mode:
        alpha        = _COMPACT_DEFAULT_OPACITY
        outer_colors = ""
        textarea_bg  = f"background:{_hex_to_rgba(fond, alpha)}; "
        placeholder  = "…"

    else:
        outer_colors = f"background:{fond_cadre}; border-left-color:{bordure};"
        textarea_bg  = f"background:{fond}; "
        placeholder  = "Votre réponse…"

    rows = ' rows="1"' if compact else ""

    taille_compacte = _scale_css_size(taille_rep, facteur_compact)
    taille_active   = taille_compacte if compact else taille_rep
    align           = "center" if compact else "left"
    font_style      = f"font-family:{police_rep}; font-size:{taille_active}; text-align:{align}; "

    textarea_html = (
        f'<textarea class="rep-textarea"{rows} style="{textarea_bg}color:{texte}; {font_style}" '
        f'placeholder="{placeholder}"></textarea>'
    )
    footer_html = (
        f'<div class="rep-footer">'
        f'<span class="rep-status"></span>'
        f'<button class="rep-load-btn" aria-label="Charger" title="Charger" '
        f'style="background:{charger_fond}; color:{charger_texte};">{_ICON_CHARGER}</button>'
        f'<button class="rep-save-btn" aria-label="Sauvegarder" title="Sauvegarder" '
        f'style="background:{bouton_fond}; color:{bouton_texte};">{_ICON_SAUVEGARDER}</button>'
        f'</div>'
    )

    if schema_mode:
        # L'ancre ne contient QUE le textarea en flux normal (le footer est positionné en
        # absolu dedans) — sa hauteur "auto" est donc toujours exactement celle du textarea,
        # jamais celle du footer. C'est ce qui garantit que translate(...) centre sur le
        # texte seul, quel que soit le mode symétrique/asymetrique.
        inner = (
            f'<div class="rep-zone-anchor" style="transform:{pos["zone_transform"]};">'
            f'{textarea_html}{footer_html}'
            f'</div>'
        )
    else:
        inner = f'{textarea_html}\n  {footer_html}'

    return (
        f'<div class="block block-rep{pos["extra_class"]}" data-question-id="{question_id}" '
        f'style="{outer_colors}{pos["extra_style"]}{css_vars}">'
        f'{inner}'
        f'</div>'
    )


def render_choix(token: Token, context: dict) -> str:
    """
    =choix> question_id | Choix 1 | Choix 2 | ... — réponse à choix multiple.

    Pas autocorrigé (contrairement à =qcm>) : cliquer sur la case ouvre la
    liste des choix ; en sélectionner un l'enregistre comme une réponse
    =rep> classique (même sauvegarde/chargement, même position centre x/y).
    Mêmes trois modes de placement que =rep>, voir _zone_positioning().

    Si options=nom est présent, les choix viennent du set défini par un
    =options> plus haut dans le document (voir render_options) plutôt que
    de la liste littérale après les "|".
    """
    question_id = token.value.strip() or "q"
    options_set = token.attrs.get("options_set")

    if options_set:
        items = context.get("defined_sets", {}).get(options_set)
        if items is None:
            return (
                f'<!-- ERREUR : =options> "{options_set}" non défini '
                f'(référencé par =choix> {question_id}) -->'
            )
    else:
        items = token.attrs.get("items", [])

    pos = _zone_positioning(token, context)
    schema_mode = pos["schema_mode"]
    compact     = pos["compact"]

    # [choix] retombe sur [rep] pour chaque couleur absente — même look par défaut,
    # personnalisable séparément si besoin (comme [repg] le fait déjà pour [rep]).
    rep   = context["palette"].get("rep", {})
    choix = context["palette"].get("choix", {})

    fond         = choix.get("fond",         rep.get("fond",         "#fdf8ed"))
    fond_cadre   = choix.get("fond_cadre",   rep.get("fond_cadre",   fond))
    bordure      = choix.get("bordure",      rep.get("bordure",      "#c8a84a"))
    texte        = choix.get("texte",        rep.get("texte",        "#1a1200"))
    police_rep      = choix.get("police_rep",      rep.get("police_rep",      "inherit"))
    taille_rep      = choix.get("taille_rep",      rep.get("taille_rep",      "1em"))
    facteur_compact = float(choix.get("facteur_compact", rep.get("facteur_compact", 0.75)))

    taille_bouton         = choix.get("taille_bouton",         rep.get("taille_bouton",         ".88em"))
    taille_bouton_compact = choix.get("taille_bouton_compact", rep.get("taille_bouton_compact",  ".6em"))

    charger_fond  = choix.get("charger_fond",  rep.get("charger_fond",  "#4f46e5"))
    charger_texte = choix.get("charger_texte", rep.get("charger_texte", "#ffffff"))
    charge_statut = choix.get("charge_statut", rep.get("charge_statut", "#6d28d9"))

    css_vars = (
        f"--rep-fond:{fond};"
        f"--rep-texte:{texte};"
        f"--rep-bordure:{bordure};"
        f"--rep-bouton-taille:{taille_bouton};"
        f"--rep-bouton-taille-compact:{taille_bouton_compact};"
        f"--rep-charger-fond:{charger_fond};"
        f"--rep-charger-texte:{charger_texte};"
        f"--rep-charge-statut:{charge_statut};"
    )

    if compact:
        alpha        = _COMPACT_DEFAULT_OPACITY
        outer_colors = ""
        field_bg     = f"background:{_hex_to_rgba(fond, alpha)}; "
        placeholder  = "…"
    else:
        outer_colors = f"background:{fond_cadre}; border-left-color:{bordure};"
        field_bg     = f"background:{fond}; "
        placeholder  = "Choisir…"

    taille_compacte = _scale_css_size(taille_rep, facteur_compact)
    taille_active   = taille_compacte if compact else taille_rep
    align           = "center" if compact else "left"
    font_style      = f"font-family:{police_rep}; font-size:{taille_active}; text-align:{align}; "

    options_html = "".join(
        f'<button type="button" class="choix-option" data-value="{item}">{item}</button>'
        for item in items
    )

    field_html = (
        f'<div class="choix-field is-placeholder" tabindex="0" '
        f'style="{field_bg}color:{texte}; {font_style}" '
        f'data-placeholder="{placeholder}">{placeholder}</div>'
    )
    list_attr = f' data-options-set="{options_set}"' if options_set else ""
    list_html = f'<div class="choix-list"{list_attr}>{options_html}</div>'
    # Pas de bouton "Sauvegarder" : choisir une option enregistre immédiatement
    # (il n'y a pas d'état "brouillon" pour un choix, contrairement à du texte libre).
    footer_html = (
        f'<div class="rep-footer">'
        f'<span class="rep-status"></span>'
        f'<button class="rep-load-btn" aria-label="Charger" title="Charger" '
        f'style="background:{charger_fond}; color:{charger_texte};">{_ICON_CHARGER}</button>'
        f'</div>'
    )

    if schema_mode:
        # Même principe que render_rep : le footer (absolu) ne doit jamais compter dans
        # la hauteur utilisée pour centrer la case sur x/y — voir _zone_positioning().
        inner = (
            f'<div class="rep-zone-anchor choix-field-wrap" style="transform:{pos["zone_transform"]};">'
            f'{field_html}{list_html}{footer_html}'
            f'</div>'
        )
    else:
        inner = f'<div class="choix-field-wrap">{field_html}{list_html}</div>\n  {footer_html}'

    return (
        f'<div class="block block-rep block-choix{pos["extra_class"]}" data-question-id="{question_id}" '
        f'style="{outer_colors}{pos["extra_style"]}{css_vars}">'
        f'{inner}'
        f'</div>'
    )


# ─────────────────────────────────────────────────────────────
# =options> — set d'options nommé et réutilisable par =choix>
# ─────────────────────────────────────────────────────────────

def render_options(token: Token, context: dict) -> str:
    """
    =options> nom | Choix 1 | Choix 2 | ... — ne produit aucun HTML : range la
    liste dans context["defined_sets"] pour que les =choix> options=nom qui
    suivent dans le même document puissent la réutiliser (voir render_choix).
    """
    name = token.value.strip()
    if name:
        context["defined_sets"][name] = token.attrs.get("items", [])
    return ""
