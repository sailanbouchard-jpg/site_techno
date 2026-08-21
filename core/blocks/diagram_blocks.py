"""
blocks/diagram_blocks.py
-------------------------
Renders the "diagramme fonctionnel" block family : ::diag  ::dracine  ::dniveau  ::dcase

Arbre généralisé : une case racine unique (::dracine), des colonnes/niveaux
colorés (::dniveau), chacun contenant des cases (::dcase) reliées par une
flèche à une case d'un niveau antérieur (ou à la racine). N'importe quelle
case peut être le parent de plusieurs cases du niveau suivant.

SYNTAX:
  ::diag [size] [espacement] [align]     ← conteneur global (comme ::cdr, sans couleur)
                                            [size] = largeur des cases (xs/s/m/l/xl,
                                            voir palette["diag"]["largeur_case_*"]) ;
                                            [espacement] = écart vertical entre les cases
                                            d'une colonne (xs/s/m/l/xl, voir
                                            palette["diag"]["ecart_cases_*"]), même échelle
                                            de mots-clés que [size] mais flag positionnel
                                            distinct (comme la double taille de =pdf>, voir
                                            detect_diagram_flags) ; le conteneur s'ajuste à
                                            son contenu et se positionne via [align]

    ::dracine [size] [couleur] ["titre"]  ← case racine unique, taille selon palette
                                             ["dracine"]["largeur_*"], id implicite "racine" ;
                                             titre optionnel affiché au-dessus
                                             (même principe que ::dniveau)
      =txt> ...  ou  =rep> q1  ou  =choix> q1 | ...
    ::/dracine

    ::dniveau <couleur> ["titre"]        ← une colonne ; couleur appliquée à ses cases
      ::dcase id=xxx parent=yyy [couleur]
        =txt> ...  ou  =rep> qN
      ::/dcase
      ...
    ::/dniveau

  ::/diag

  id=     identifiant de la case, pour qu'une case d'un niveau suivant s'y
          rattache via parent=. Optionnel — seulement utile si référencé.
  parent= id de la case (ou "racine") à laquelle cette case est reliée par
          une flèche. Sans lui, aucune flèche n'est tracée pour cette case
          (avertissement HTML en commentaire, le bloc reste affiché).
  couleur (sur ::dcase) déroge à la couleur du ::dniveau englobant.

Cases "sœurs" vs "cousines" (::dcase consécutives d'une même ::dniveau) :
  deux ::dcase de suite qui partagent le même parent= sont sœurs, séparées par
  ecart_cases (le gap normal de la colonne). Dès que parent= change (nouveau
  groupe), un écart supplémentaire ecart_cousins s'ajoute avant la première
  case du nouveau groupe — l'écart total devient donc ecart_cases + ecart_cousins
  à cette frontière. Suivi par context["diag_state"]["last_parent"], remis à
  zéro à chaque ::dniveau (voir render_dniveau_open / render_dcase_open).

Les =rep>/=choix> directement dans une ::dcase ou une ::dracine passent
automatiquement en mode compact (voir core/blocks/input_blocks.py,
_zone_positioning).

PALETTE KEYS (section [diag]) :
  largeur_case_xs/s/m/l/xl     → largeur des cases (niveaux ≥2) selon le [size] de
                                  ::diag ; "m" si ::diag n'a pas de [size] explicite
  ecart_cases_xs/s/m/l/xl      → écart vertical entre cases sœurs (même parent=) d'une
                                  colonne, selon le [espacement] de ::diag ; "m" si absent
  ecart_cousins_xs/s/m/l/xl    → écart vertical SUPPLÉMENTAIRE entre deux cases cousines
                                  (parent= différent) d'une colonne, même échelle de mots-clés
                                  que ecart_cases ; "0px" si absent → comportement inchangé
  hauteur_case, ecart_colonnes → hauteur commune des cases (::dcase ET ::dracine) / écart
                                  horizontal entre colonnes
  rayon_case                    → arrondi des coins des cases (::dcase ET ::dracine)
  case_marge                   → padding interne d'une ::dcase (valeur CSS, ex. "1.6px 2px")
  fleche_couleur, fleche_epaisseur → tracées par le JS de templates/base.html
  titre_couleur, titre_taille  → titre au-dessus d'un ::dniveau
  case_taille, case_interligne → police compacte du texte dans une case (voir text_blocks.py)

PALETTE KEYS (section [dracine]) :
  fond, bordure, texte         → défauts si ::dracine sans couleur explicite
                                  (même mécanisme que [def]/[alr]/[cdr])
  largeur_xs/s/m/l/xl          → largeur de la case racine selon le [size] de
                                  ::dracine ; "m" si absent
  marge                        → padding interne de la case racine (valeur CSS)

Les fermetures (::/diag, ::/dniveau, ::/dcase) sont de simples </div>.
::/dracine ferme deux balises (la case + sa colonne-titre) — voir
render_dracine_close, enregistré dans STRUCTURE_BLOCK_CLOSERS (registry.py).
"""

from core.parser.token_types import Token


# ─────────────────────────────────────────────────────────────
# ::dracine — case racine, taille libre (enfant flex, pas en flux de page)
# ─────────────────────────────────────────────────────────────

def render_dracine_open(token: Token, context: dict) -> str:
    """
    ::dracine — case racine unique du diagramme. id implicite "racine".
    Titre optionnel affiché au-dessus, dans une colonne englobante (même
    mécanisme que ::dniveau) — voir render_dracine_close pour la fermeture.

    Largeur et marge interne viennent de la palette (section [dracine],
    clés largeur_xs/s/m/l/xl et marge) — "m" si ::dracine n'a pas de [size]
    explicite.
    """
    colors  = context.get("block_colors", {})
    dracine = context["palette"].get("dracine", {})

    size  = token.attrs.get("size") or "m"
    width = dracine.get(f"largeur_{size}", "138px")
    marge = dracine.get("marge", "2px 2.8px")

    titre = token.attrs.get("titre", "")
    diag  = context["palette"].get("diag", {})
    titre_html = ""
    if titre:
        couleur = diag.get("titre_couleur", "#333333")
        taille  = diag.get("titre_taille", ".9em")
        titre_html = (
            f'<div class="diag-niveau-titre" style="color:{couleur}; font-size:{taille};">'
            f'{titre}</div>'
        )

    parts = [f"width: {width};", f"padding: {marge};"]
    if colors.get("fond"):
        parts.append(f"background-color: {colors['fond']};")
    if colors.get("bordure"):
        parts.append(f"border: 2px solid {colors['bordure']};")
    if colors.get("texte"):
        parts.append(f"color: {colors['texte']};")

    return (
        f'<div class="block block-dracine-col">{titre_html}'
        f'<div class="block-dracine" data-diag-id="racine" style="{" ".join(parts)}">'
    )


def render_dracine_close(_name: str) -> str:
    """Ferme la case (.block-dracine) puis sa colonne-titre englobante."""
    return "</div></div><!-- ::/dracine -->"


# ─────────────────────────────────────────────────────────────
# ::dniveau — une colonne du diagramme : couleur + titre optionnel
# ─────────────────────────────────────────────────────────────

def render_dniveau_open(token: Token, context: dict) -> str:
    """
    ::dniveau <couleur> ["titre"] — colonne de cases. Ne dessine pas de boîte
    elle-même (layout uniquement) : sa couleur résolue est seulement transmise
    aux ::dcase enfants via context["parent_resolved_colors"], posé par
    document_renderer.py à partir du block_stack.

    Remet à zéro context["diag_state"]["last_parent"] : chaque colonne démarre
    sans groupe "cousins" précédent, voir render_dcase_open.
    """
    titre = token.attrs.get("titre", "")
    diag  = context["palette"].get("diag", {})

    diag_state = context.get("diag_state")
    if diag_state is not None:
        diag_state["last_parent"] = None

    titre_html = ""
    if titre:
        couleur = diag.get("titre_couleur", "#333333")
        taille  = diag.get("titre_taille", ".9em")
        titre_html = (
            f'<div class="diag-niveau-titre" style="color:{couleur}; font-size:{taille};">'
            f'{titre}</div>'
        )

    return f'<div class="block block-dniveau">{titre_html}'


# ─────────────────────────────────────────────────────────────
# ::dcase — une case, reliée par une flèche à une case d'un niveau antérieur
# ─────────────────────────────────────────────────────────────

def render_dcase_open(token: Token, context: dict) -> str:
    """
    ::dcase id=xxx parent=yyy [couleur] — hérite la couleur de son ::dniveau
    englobant (context["parent_resolved_colors"]) sauf si elle déroge
    explicitement avec sa propre couleur.

    Si parent= diffère de celui de la ::dcase précédente dans la même
    ::dniveau (context["diag_state"]["last_parent"]), cette case démarre un
    nouveau groupe "cousins" : un margin-top supplémentaire (ecart_cousins)
    s'ajoute par-dessus le gap normal de la colonne (ecart_cases).
    """
    own    = context.get("block_colors", {})
    colors = own if own.get("fond") else context.get("parent_resolved_colors", {})

    case_id   = token.attrs.get("id")
    parent_id = token.attrs.get("parent")

    parts = []
    diag_state = context.get("diag_state")
    if diag_state is not None:
        last_parent = diag_state.get("last_parent")
        if last_parent is not None and parent_id != last_parent:
            parts.append("margin-top: var(--diag-ecart-cousins, 0px);")
        diag_state["last_parent"] = parent_id

    if colors.get("fond"):
        parts.append(f"background-color: {colors['fond']};")
    if colors.get("bordure"):
        parts.append(f"border: 2px solid {colors['bordure']};")
    if colors.get("texte"):
        parts.append(f"color: {colors['texte']};")

    id_attr     = f' data-diag-id="{case_id}"' if case_id else ""
    parent_attr = f' data-diag-parent="{parent_id}"' if parent_id else ""
    warning     = "" if parent_id else "<!-- ATTENTION : ::dcase sans parent=, aucune flèche ne sera tracée -->"

    return f'{warning}<div class="block block-dcase"{id_attr}{parent_attr} style="{" ".join(parts)}">'


# ─────────────────────────────────────────────────────────────
# ::diag — conteneur global : taille/alignement de page + variables CSS de mise en page
# ─────────────────────────────────────────────────────────────

def render_diag_open(token: Token, context: dict) -> str:
    """
    ::diag [size] [espacement] [align] — conteneur du diagramme. Pas de couleur propre.

    [size] règle la largeur de TOUTES les cases (niveaux ≥2) via les clés
    palette["diag"]["largeur_case_xs/s/m/l/xl"] ("m" si absent). [espacement]
    règle l'écart vertical entre cases sœurs (même parent=) d'une même colonne
    via palette["diag"]["ecart_cases_xs/s/m/l/xl"] ("m" si absent), et l'écart
    SUPPLÉMENTAIRE entre cases cousines (parent= différent) via
    palette["diag"]["ecart_cousins_xs/s/m/l/xl"] ("0px" si absent) — donc la
    hauteur totale du diagramme. Le conteneur lui-même n'a pas de largeur
    propre (width: fit-content) : il s'ajuste à son contenu, puis [align] le
    positionne sur la page. La hauteur des cases (min-height, palette["diag"]
    ["hauteur_case"]) et leur arrondi (palette["diag"]["rayon_case"]) ne sont
    jamais forcés par [size] : ce sont des valeurs uniques partagées par
    ::dcase ET ::dracine (voir .block-dcase / .block-dracine dans
    static/style.css). La hauteur reste libre de s'adapter au texte, donc une
    case se réduit déjà d'elle-même si l'élargir fait passer son texte sur
    moins de lignes.
    """
    from core.blocks.structure_blocks import _ALIGN_TO_MARGIN_CSS

    diag = context["palette"].get("diag", {})

    size         = token.attrs.get("size") or "m"
    largeur_case = diag.get(f"largeur_case_{size}", "174px")

    gap_size      = token.attrs.get("gap_size") or "m"
    ecart_cases   = diag.get(f"ecart_cases_{gap_size}", "18px")
    ecart_cousins = diag.get(f"ecart_cousins_{gap_size}", "0px")

    align      = token.attrs.get("align", "centre")
    margin_css = _ALIGN_TO_MARGIN_CSS.get(align, _ALIGN_TO_MARGIN_CSS["centre"])

    css_vars = (
        f"--diag-largeur-case:{largeur_case};"
        f"--diag-hauteur-case:{diag.get('hauteur_case', '80px')};"
        f"--diag-rayon-case:{diag.get('rayon_case', '8px')};"
        f"--diag-ecart-colonnes:{diag.get('ecart_colonnes', '56px')};"
        f"--diag-ecart-cases:{ecart_cases};"
        f"--diag-ecart-cousins:{ecart_cousins};"
        f"--diag-case-marge:{diag.get('case_marge', '1.6px 2px')};"
    )
    fleche_couleur   = diag.get("fleche_couleur", "#888888")
    fleche_epaisseur = diag.get("fleche_epaisseur", "2px")

    return (
        f'<div class="block block-diag" '
        f'data-fleche-couleur="{fleche_couleur}" data-fleche-epaisseur="{fleche_epaisseur}" '
        f'style="width: fit-content; {margin_css} {css_vars}">'
        f'<svg class="diag-svg"></svg>'
    )
