"""
flag_detector.py
----------------
Recognizes attribute values by their format alone — no key=value syntax needed.

HOW IT WORKS:
  Each recognized value category has a completely disjoint set of values,
  so there is never any ambiguity. The parser scans each word and asks
  "which category does this belong to?"

  =gif> xl centre animation.gif "La Terre tourne"
         ^    ^        ^              ^
         |    |        |              └─ quoted string → legend
         |    |        └─ word.extension → filename
         |    └─ known alignment word → align
         └─ known size word → size

RECOGNIZED FLAG CATEGORIES (all disjoint — no word can belong to two categories):
  SIZE    : xxs  xs  s  m  l  xl  xxl
  ALIGN   : gauche  centre  droite
  COLOR   : bleu  vert  orange  rouge  jaune  violet  gris
  FILE    : any word ending in a known file extension (.png, .gif, .mp4, ...)
  LEGEND  : "text in double quotes" — may contain spaces
  PERCENT : 150%  — PDF height override (percentage of reference height)
  INTEGER : 2  3  — equal-column count for ::col

TO ADD A NEW NAMED COLOR:
  1. Add its name to COLOR_FLAGS below
  2. Add a matching [section] in your .palette files
  The new color will then be usable as a flag on any structure block.

PDF SPECIFICS:
  The first SIZE flag = panel width.
  The second SIZE flag = panel height.
  A PERCENT flag overrides the height: 150% means 1.5× the reference height for that width.
  The bare keyword "raw" removes the buttons and the browser PDF viewer chrome
  (toolbar/panel/scrollbar) — see detect_pdf_flags.
  The bare keyword "horizontal" does the same, with pages side by side (scroll right).
"""

import re


# ─────────────────────────────────────────────────────────────
# RECOGNIZED VALUE SETS — ALL DISJOINT
# ─────────────────────────────────────────────────────────────

SIZE_FLAGS  = {"xxs", "xs", "s", "m", "l", "xl", "xxl"}
ALIGN_FLAGS = {"gauche", "centre", "droite"}

# Named colors that map to sections in .palette files.
# Add new color names here when you add new [sections] to your palettes.
COLOR_FLAGS = {"bleu", "vert", "orange", "rouge", "jaune", "violet", "gris"}

# Extensions that identify a word as a filename
_FILE_EXTENSIONS = frozenset({
    ".gif", ".png", ".jpg", ".jpeg", ".webp", ".svg",
    ".mp4", ".webm", ".ogg",
    ".pdf",
    ".stl",
})

# ─────────────────────────────────────────────────────────────
# PDF HEIGHT REFERENCE VALUES (in vh)
# Keep in sync with the height sizing in style.css
# ─────────────────────────────────────────────────────────────

PDF_REFERENCE_HEIGHTS_VH = {
    "xxs": 30,
    "xs":  40,
    "s":   60,
    "m":   100,
    "l":   150,
    "xl":  185,
    "xxl": 210,
}


# ─────────────────────────────────────────────────────────────
# INTERNAL REGEX PATTERNS
# ─────────────────────────────────────────────────────────────

_RE_QUOTED_STRING = re.compile(r'"([^"]*)"')
_RE_PERCENTAGE    = re.compile(r"^(\d+(?:\.\d+)?)%$")
_RE_INTEGER       = re.compile(r"^(\d+)$")
_RE_ROWSPAN       = re.compile(r"^v(\d+)$", re.IGNORECASE)


# ─────────────────────────────────────────────────────────────
# PUBLIC FUNCTIONS — one per calling context
# ─────────────────────────────────────────────────────────────

def detect_media_flags(text: str) -> dict:
    """
    For: =img>  =gif>  =vid>

    Input:  'xl centre animation.gif "La Terre tourne"'
    Output: {"size": "xl", "align": "centre", "file": "animation.gif",
             "legend": "La Terre tourne"}

    Defaults: size=m, align=centre, file="", legend=""
    """
    attrs = {"size": "m", "align": "centre", "file": "", "legend": ""}

    text, legend = _pull_out_quoted_legend(text)
    attrs["legend"] = legend

    for word in text.split():
        word_lower = word.lower()
        if   word_lower in SIZE_FLAGS:                        attrs["size"]  = word_lower
        elif word_lower in ALIGN_FLAGS:                       attrs["align"] = word_lower
        elif word_lower.startswith(("http://", "https://")):  attrs["file"]  = word
        elif _looks_like_filename(word):                      attrs["file"]  = word

    return attrs


def detect_pdf_flags(text: str) -> dict:
    """
    For: =pdf>

    Handles up to two SIZE flags: first = width, second = height.
    A PERCENT flag overrides the height, calculated against the
    reference height for the chosen width size.

    'l 150% fiche.pdf' → width=l, height_vh=225 (150% of l's 150vh)
    'm l fiche.pdf'    → width=m, height_vh=150  (l reference)
    'm fiche.pdf'      → width=m, height_vh=100  (m default)
    'raw m fiche.pdf'  → raw=True, width=m, height_vh=100 — pas de boutons,
                         pas de barre d'outils/panneau/scrollbar du lecteur PDF.

    'horizontal m fiche.pdf' → horizontal=True — comme raw, mais les pages sont
                         côte à côte et on défile vers la droite.
    'horizontal fleches m fiche.pdf' → + boutons verticaux page précédente/suivante
                         sur les bords.

    Output keys: size, height_vh (int), align, file, legend, raw, horizontal, fleches
    """
    attrs = {"size": "m", "height_vh": None, "align": "centre", "file": "", "legend": "",
             "raw": False, "horizontal": False, "fleches": False}

    text, legend = _pull_out_quoted_legend(text)
    attrs["legend"] = legend

    sizes_found = []
    height_pct  = None

    for word in text.split():
        word_lower = word.lower()
        if   word_lower == "raw":        attrs["raw"]   = True
        elif word_lower == "horizontal": attrs["horizontal"] = True
        elif word_lower == "fleches":    attrs["fleches"]    = True
        elif word_lower in SIZE_FLAGS:   sizes_found.append(word_lower)
        elif word_lower in ALIGN_FLAGS:  attrs["align"] = word_lower
        elif _looks_like_filename(word): attrs["file"]  = word
        elif _RE_PERCENTAGE.match(word):
            height_pct = float(_RE_PERCENTAGE.match(word).group(1))

    if sizes_found:
        attrs["size"] = sizes_found[0]

    reference_vh = PDF_REFERENCE_HEIGHTS_VH.get(attrs["size"], 100)

    if height_pct is not None:
        attrs["height_vh"] = int(height_pct / 100 * reference_vh)
    elif len(sizes_found) >= 2:
        attrs["height_vh"] = PDF_REFERENCE_HEIGHTS_VH.get(sizes_found[1], reference_vh)
    else:
        attrs["height_vh"] = reference_vh

    return attrs


def detect_structure_flags(text: str) -> dict:
    """
    For all structure blocks: ::pg  ::cdr  ::def  ::alr  (and any future block)

    Detects size, alignment, and optional named color override.
    All three are optional — unrecognized words are silently ignored.

    Input:  'l centre'      → {"size": "l",   "align": "centre", "color": None}
    Input:  'bleu xl gauche' → {"size": "xl",  "align": "gauche", "color": "bleu"}
    Input:  ''              → {"size": None,   "align": "centre", "color": None}
                              size=None means "use the block's built-in default width"
    """
    attrs = {"size": None, "align": "centre", "color": None}

    for word in text.split():
        word_lower = word.lower()
        if   word_lower in SIZE_FLAGS:   attrs["size"]  = word_lower
        elif word_lower in ALIGN_FLAGS:  attrs["align"] = word_lower
        elif word_lower in COLOR_FLAGS:  attrs["color"] = word_lower

    return attrs


def detect_column_flags(text: str) -> dict:
    """
    For: ::col

    Input:  '55% 45%'   → {"grid_template": "55% 45%"}
    Input:  '3'         → {"grid_template": "1fr 1fr 1fr"}
    Input:  ''          → {"grid_template": "1fr 1fr"}    (default: 2 equal columns)
    """
    text = text.strip()

    if not text:
        return {"grid_template": "1fr 1fr"}

    if "%" in text or "fr" in text:
        return {"grid_template": text}

    m = _RE_INTEGER.match(text)
    if m:
        n = max(1, int(m.group(1)))
        return {"grid_template": " ".join(["1fr"] * n)}

    return {"grid_template": text}  # fallback: trust the user wrote valid CSS


def detect_lien_flags(text: str) -> dict:
    """
    For: =lien>

    Input:  'https://example.com m centre "Titre du lien" logo.png'
    Output: {"url": "https://example.com", "size": "m", "align": "centre",
             "legend": "Titre du lien", "image": "logo.png"}

    Defaults: size=m, align=centre, url="", legend="", image=""
    image is optional — any word ending in a known image extension (.png .jpg .svg …).
    If omitted, the card shows the cached site favicon as the large image.
    """
    attrs = {"url": "", "size": "m", "align": "centre", "legend": "", "image": ""}

    text, legend = _pull_out_quoted_legend(text)
    attrs["legend"] = legend

    for word in text.split():
        word_lower = word.lower()
        if word_lower.startswith("http://") or word_lower.startswith("https://"):
            attrs["url"] = word
        elif word_lower in SIZE_FLAGS:
            attrs["size"] = word_lower
        elif word_lower in ALIGN_FLAGS:
            attrs["align"] = word_lower
        elif _looks_like_filename(word) and not word_lower.endswith(".pdf"):
            attrs["image"] = word   # optional custom image from media folder

    return attrs


def detect_table_flags(text: str) -> dict:
    """
    For: ::tbl

    Parses column widths (% or fr values, or integer = N equal columns),
    plus optional table-width size, alignment, and palette color override.

    '30% 40% 30%'     → columns=["30%","40%","30%"], size="xl", align="centre", color=None
    '3'               → columns=["33%","33%","34%"], size="xl", ...
    'l rouge'         → columns=[], size="l", color="rouge"
    '60% 40% m gauche'→ columns=["60%","40%"], size="m", align="gauche"
    """
    attrs = {"columns": [], "size": "xl", "align": "centre", "color": None}

    col_parts  = []
    int_cols   = None

    for word in text.split():
        word_lower = word.lower()
        if word_lower in SIZE_FLAGS:
            attrs["size"] = word_lower
        elif word_lower in ALIGN_FLAGS:
            attrs["align"] = word_lower
        elif word_lower in COLOR_FLAGS:
            attrs["color"] = word_lower
        elif "%" in word or "fr" in word:
            col_parts.append(word)
        elif _RE_INTEGER.match(word):
            int_cols = max(1, int(word))

    if col_parts:
        attrs["columns"] = col_parts
    elif int_cols is not None:
        # Build equal-width columns; last one absorbs rounding remainder
        each = 100 // int_cols
        cols = [f"{each}%"] * (int_cols - 1) + [f"{100 - each * (int_cols - 1)}%"]
        attrs["columns"] = cols

    return attrs


def detect_row_flags(text: str) -> dict:
    """
    For: ::tr  and  ::trh

    Only a named color override is meaningful on rows (they always span full width).

    'rouge' → {"color": "rouge"}
    ''      → {"color": None}
    """
    attrs = {"color": None}
    for word in text.split():
        if word.lower() in COLOR_FLAGS:
            attrs["color"] = word.lower()
    return attrs


def detect_table_cell_flags(text: str) -> dict:
    """
    For: ::tc

    Parses colspan (first bare integer found), rowspan (vN, ex: v2 = fusionne
    2 lignes), cell text alignment, and color override.
    The bare integer means colspan, NOT number of equal grid columns.

    '2'           → {"colspan": 2, "rowspan": 1, "align": "gauche", "color": None}
    'v3'          → {"colspan": 1, "rowspan": 3, "align": "gauche", "color": None}
    'centre bleu' → {"colspan": 1, "rowspan": 1, "align": "centre", "color": "bleu"}
    '3 droite'    → {"colspan": 3, "rowspan": 1, "align": "droite", "color": None}
    ''            → {"colspan": 1, "rowspan": 1, "align": "gauche", "color": None}
    """
    attrs = {"colspan": 1, "rowspan": 1, "align": "gauche", "color": None}
    for word in text.split():
        word_lower = word.lower()
        rowspan_match = _RE_ROWSPAN.match(word)
        if word_lower in ALIGN_FLAGS:
            attrs["align"] = word_lower
        elif word_lower in COLOR_FLAGS:
            attrs["color"] = word_lower
        elif rowspan_match:
            attrs["rowspan"] = max(1, int(rowspan_match.group(1)))
        elif _RE_INTEGER.match(word):
            attrs["colspan"] = max(1, int(word))
    return attrs


def detect_rep_flags(text: str) -> dict:
    """
    For: =rep>

    =rep> q1                            → standalone textarea (normal)
    =rep> q1 x=45% y=30%               → schema zone, opacité et largeur par défaut
    =rep> q1 x=45% y=30% 60%           → schema zone, opacité 60 %
    =rep> q1 x=45% y=30% l=25%         → largeur 25 % de l'image
    =rep> q1 x=45% y=30% l=180px 60%   → largeur 180 px, opacité 60 %
    =rep> q1 x=45% y=30% e=70%         → largeur réduite à 70 % de la taille par défaut de la case
    =rep> q1 x=45% y=30% asymetrique   → en cas de retour à la ligne, grandit seulement vers le bas

    x=/y=      : position sur le schéma (% du conteneur image)
    l=         : largeur — valeur CSS directe (ex. l=20%, l=200px)
    e=         : échelle — % de la largeur par défaut de la case (100% si absent)
                 ignoré si l= est aussi présent (l= est plus précis, il gagne)
    asymetrique: mode de croissance verticale — par défaut (absent), la case grandit
                 en haut et en bas à la fois, donc son centre reste fixé sur le point
                 x/y. Avec ce mot-clé, elle grandit uniquement vers le bas.
    bare %     : opacité du fond (0–100)
    Sans x=/y= : rendu normal (ou compact si dans un ::tc)
    """
    rest = text.strip()
    x_match = re.search(r'\bx=(\d+(?:\.\d+)?)%', rest)
    y_match = re.search(r'\by=(\d+(?:\.\d+)?)%', rest)

    if x_match and y_match:
        # 1. Remove x= and y=
        cleaned = re.sub(r'\b[xy]=\d+(?:\.\d+)?%', '', rest).strip()
        # 2. Extract l= before scanning for bare %
        l_match = re.search(r'\bl=(\d+(?:\.\d+)?(?:px|%))', cleaned)
        if l_match:
            largeur = l_match.group(1)
            cleaned = re.sub(r'\bl=\d+(?:\.\d+)?(?:px|%)', '', cleaned).strip()
        else:
            largeur = None
        # 3. Extract e= (échelle relative à la largeur par défaut, ignoré si l= déjà fixé)
        e_match = re.search(r'\be=(\d+(?:\.\d+)?)%', cleaned)
        if e_match:
            echelle = float(e_match.group(1)) / 100.0
            cleaned = re.sub(r'\be=\d+(?:\.\d+)?%', '', cleaned).strip()
        else:
            echelle = 1.0
        # 4. Extract the "asymetrique" bare keyword (mode de croissance verticale).
        #    Par défaut (mot-clé absent) la croissance est symétrique.
        asym_match = re.search(r'\basymetrique\b', cleaned)
        symetrique = asym_match is None
        if asym_match:
            cleaned = re.sub(r'\basymetrique\b', '', cleaned).strip()
        # 5. Remaining bare % = opacity override
        op_match = re.search(r'\b(\d+(?:\.\d+)?)%', cleaned)
        if op_match:
            qid     = re.sub(r'\b\d+(?:\.\d+)?%', '', cleaned).strip()
            opacite = float(op_match.group(1)) / 100.0
        else:
            qid     = cleaned
            opacite = None
        return {
            "question_id": qid,
            "x":          x_match.group(1) + "%",
            "y":          y_match.group(1) + "%",
            "opacite":    opacite,
            "largeur":    largeur,
            "echelle":    echelle,
            "symetrique": symetrique,
        }
    return {"question_id": rest}


def detect_choix_flags(text: str) -> dict:
    """
    For: =choix>  — réponse à choix multiple (liste déroulante au clic)

    Même positionnement que =rep> (x=/y=/l=/e=/asymetrique), plus les choix
    proposés après le premier "|" (comme =qcm>, mais sans marqueur de bonne
    réponse — ce bloc n'est pas autocorrigé, juste sauvegardé comme =rep>).

    =choix> q1 | Plastique | Métal | Bois                     → mode normal, 3 choix
    =choix> q1 x=45% y=30% | Plastique | Métal | Bois         → zone de schéma
    =choix> q1 x=45% y=30% e=70% asymetrique | Plastique | Bois

    Au lieu de répéter la même liste sur plusieurs =choix>, on peut référencer
    un set défini une fois via =options> (voir detect_options_flags) :

    =options> fonctions | X | CONVERTIR | ACQUÉRIR | TRANSMETTRE
    =choix> q1 x=45% y=30% e=70% options=fonctions

    options=nom  : remplace la liste "| Item | Item" par une référence à un
                   set =options> défini plus haut dans le même document.
                   Si présent, prime sur d'éventuels items littéraux.

    x=/y=/l=/e=/asymetrique : identiques à =rep>, voir plus haut.
    Items (après les "|")    : les choix proposés, dans l'ordre donné
                               (ignorés si options= est présent).
    """
    parts  = [p.strip() for p in text.split("|")]
    header = parts[0] if parts else ""
    items  = [p for p in parts[1:] if p]

    x_match = re.search(r'\bx=(\d+(?:\.\d+)?)%', header)
    y_match = re.search(r'\by=(\d+(?:\.\d+)?)%', header)
    cleaned = re.sub(r'\b[xy]=\d+(?:\.\d+)?%', '', header).strip()

    l_match = re.search(r'\bl=(\d+(?:\.\d+)?(?:px|%))', cleaned)
    if l_match:
        largeur = l_match.group(1)
        cleaned = re.sub(r'\bl=\d+(?:\.\d+)?(?:px|%)', '', cleaned).strip()
    else:
        largeur = None

    e_match = re.search(r'\be=(\d+(?:\.\d+)?)%', cleaned)
    if e_match:
        echelle = float(e_match.group(1)) / 100.0
        cleaned = re.sub(r'\be=\d+(?:\.\d+)?%', '', cleaned).strip()
    else:
        echelle = 1.0

    options_match = re.search(r'\boptions=(\S+)', cleaned)
    if options_match:
        options_set = options_match.group(1)
        cleaned     = re.sub(r'\boptions=\S+', '', cleaned).strip()
    else:
        options_set = None

    asym_match = re.search(r'\basymetrique\b', cleaned)
    symetrique = asym_match is None
    if asym_match:
        cleaned = re.sub(r'\basymetrique\b', '', cleaned).strip()

    return {
        "question_id": cleaned,
        "x":           (x_match.group(1) + "%") if x_match else None,
        "y":           (y_match.group(1) + "%") if y_match else None,
        "largeur":     largeur,
        "echelle":     echelle,
        "symetrique":  symetrique,
        "options_set": options_set,
        "items":       items,
    }


def detect_options_flags(text: str) -> dict:
    """
    For: =options>  — définit un set d'options nommé, réutilisable par
    plusieurs =choix> via le flag options=nom (voir detect_choix_flags).

    Ne produit aucun affichage : sert uniquement à éviter de réécrire la
    même liste de choix sur chaque =choix> qui la partage. Doit apparaître
    avant tout =choix> qui le référence (document lu en un seul passage).

    =options> fonctions | X | CONVERTIR | ACQUÉRIR | TRANSMETTRE
        → {"name": "fonctions", "items": ["X", "CONVERTIR", "ACQUÉRIR", "TRANSMETTRE"]}
    """
    parts = [p.strip() for p in text.split("|")]
    name  = parts[0] if parts else ""
    items = [p for p in parts[1:] if p]
    return {"name": name, "items": items}


def detect_corrige_flags(text: str) -> dict:
    """
    For: =corrige>  — texte figé positionné comme une case =rep> (schéma "corrigé")

    =corrige> "CONVERTIR" x=9.9% y=14.6% e=85%

    Permet de transformer un schéma vierge en version pré-remplie : on remplace
    =rep> par =corrige> sur la même ligne (mêmes x=/y=/l=/e=) sans rien recalculer,
    le texte entre guillemets remplace la case de réponse par le texte affiché.

    x=/y=/l=/e= : identiques à =rep>, voir plus haut.
    asymetrique : accepté mais sans effet utile ici — un texte figé n'a pas de
                  hauteur dynamique, son centre reste donc toujours sur x/y.
    """
    rest = text.strip()
    cleaned, texte = _pull_out_quoted_legend(rest)

    x_match = re.search(r'\bx=(\d+(?:\.\d+)?)%', cleaned)
    y_match = re.search(r'\by=(\d+(?:\.\d+)?)%', cleaned)
    cleaned = re.sub(r'\b[xy]=\d+(?:\.\d+)?%', '', cleaned).strip()

    l_match = re.search(r'\bl=(\d+(?:\.\d+)?(?:px|%))', cleaned)
    if l_match:
        largeur = l_match.group(1)
        cleaned = re.sub(r'\bl=\d+(?:\.\d+)?(?:px|%)', '', cleaned).strip()
    else:
        largeur = None

    e_match = re.search(r'\be=(\d+(?:\.\d+)?)%', cleaned)
    if e_match:
        echelle = float(e_match.group(1)) / 100.0
        cleaned = re.sub(r'\be=\d+(?:\.\d+)?%', '', cleaned).strip()
    else:
        echelle = 1.0

    symetrique = "asymetrique" not in cleaned

    return {
        "texte":      texte,
        "x":          (x_match.group(1) + "%") if x_match else None,
        "y":          (y_match.group(1) + "%") if y_match else None,
        "largeur":    largeur,
        "echelle":    echelle,
        "symetrique": symetrique,
    }


def detect_schema_flags(text: str) -> dict:
    """
    For: ::schema

    Same parsing as detect_media_flags (file, size, align).
    Legend is ignored for schema containers.

    '::schema circuit.png l'  → {"file": "circuit.png", "size": "l", "align": "centre"}
    """
    attrs = detect_media_flags(text)
    attrs.pop("legend", None)
    return attrs


def detect_interactive_flags(text: str) -> dict:
    """
    For: =qcm>  =associer>  =trier>  =repg>

    Pipe-separated: first segment = question_id (+ optional "multiple" keyword),
    remaining segments = items (choices, pairs, ordered items, or template segments).

    '=qcm> q1 | Plastique | *Métal | Bois'
        → {"question_id": "q1", "multiple": False, "items": ["Plastique", "*Métal", "Bois"]}

    '=qcm> q1 multiple | *A | B'
        → {"question_id": "q1", "multiple": True, "items": ["*A", "B"]}
    """
    parts    = [p.strip() for p in text.split("|")]
    qid_raw  = parts[0] if parts else "q"
    items    = parts[1:] if len(parts) > 1 else []

    words    = qid_raw.split()
    multiple = "multiple" in words
    qid      = " ".join(w for w in words if w != "multiple").strip() or "q"

    return {"question_id": qid, "multiple": multiple, "items": items}


def detect_verif_flags(text: str) -> dict:
    """
    For: =verif>  — bouton de vérification des réponses précédentes

    =verif> mode=1 | q1=Métal | q2=Bois | q3=Plastique
    =verif> q1=Métal | q2=Bois | mode=3      (mode= peut être n'importe où dans la liste)
    =verif> q1=Métal | q2=Bois                (mode=1 par défaut si absent)

    mode=1 : juste/faux par case (icône sous chaque case concernée)        [défaut]
    mode=2 : ensemble juste/faux (un seul message global, sans détail)
    mode=3 : comme mode=1, + boutons "Voir le corrigé" et "Effacer les réponses"

    Chaque item restant (hors mode=) est qid=valeur attendue : le premier "="
    sépare l'identifiant de la valeur (qui peut elle-même contenir des "=").
    """
    parts   = [p.strip() for p in text.split("|") if p.strip()]
    mode    = 1
    answers = {}
    for part in parts:
        m = re.match(r'(?i)^mode\s*=\s*([123])$', part)
        if m:
            mode = int(m.group(1))
            continue
        if "=" in part:
            qid, valeur = part.split("=", 1)
            answers[qid.strip()] = valeur.strip()
    return {"mode": mode, "answers": answers}


def detect_diagram_flags(text: str) -> dict:
    """
    For: ::diag — conteneur global du diagramme fonctionnel

    Jusqu'à deux flags SIZE positionnels (même principe que detect_pdf_flags) :
      le premier  → taille des cases (largeur), voir _DIAG_SIZE_TO_CASE_WIDTH
      le second   → espacement vertical entre les cases d'une colonne,
                    voir _DIAG_SIZE_TO_CASE_GAP
    + un flag ALIGN optionnel qui positionne le diagramme sur la page.

    '::diag l xs'      → {"size": "l", "gap_size": "xs", "align": "centre"}
    '::diag m droite'  → {"size": "m", "gap_size": None, "align": "droite"}
    '::diag'           → {"size": None, "gap_size": None, "align": "centre"}
    """
    attrs = {"size": None, "gap_size": None, "align": "centre"}

    sizes_found = []
    for word in text.split():
        word_lower = word.lower()
        if   word_lower in SIZE_FLAGS:   sizes_found.append(word_lower)
        elif word_lower in ALIGN_FLAGS:  attrs["align"] = word_lower

    if sizes_found:
        attrs["size"] = sizes_found[0]
    if len(sizes_found) >= 2:
        attrs["gap_size"] = sizes_found[1]

    return attrs


def detect_diagram_root_flags(text: str) -> dict:
    """
    For: ::dracine — case racine unique du diagramme fonctionnel

    Taille + couleur (positionnelles, comme detect_structure_flags) + titre
    optionnel entre guillemets, affiché au-dessus de la case (même principe
    que detect_diagram_level_flags pour ::dniveau). Pas d'alignement : la
    racine n'en a jamais eu besoin.

    '::dracine bleu "Fonction d'usage"' → {"size": None, "color": "bleu", "titre": "Fonction d'usage"}
    '::dracine l vert'                  → {"size": "l", "color": "vert", "titre": ""}
    """
    attrs = {"size": None, "color": None, "titre": ""}

    text, titre = _pull_out_quoted_legend(text)
    attrs["titre"] = titre

    for word in text.split():
        word_lower = word.lower()
        if   word_lower in SIZE_FLAGS:   attrs["size"]  = word_lower
        elif word_lower in COLOR_FLAGS:  attrs["color"] = word_lower

    return attrs


def detect_diagram_level_flags(text: str) -> dict:
    """
    For: ::dniveau — une colonne du diagramme fonctionnel

    Couleur (positionnelle, comme detect_structure_flags) + titre optionnel
    entre guillemets, affiché au-dessus de la colonne.

    '::dniveau vert "Fonctions techniques"' → {"color": "vert", "titre": "Fonctions techniques"}
    '::dniveau orange'                      → {"color": "orange", "titre": ""}
    """
    attrs = {"color": None, "titre": ""}

    text, titre = _pull_out_quoted_legend(text)
    attrs["titre"] = titre

    for word in text.split():
        word_lower = word.lower()
        if word_lower in COLOR_FLAGS:
            attrs["color"] = word_lower

    return attrs


def detect_diagram_case_flags(text: str) -> dict:
    """
    For: ::dcase — une case du diagramme fonctionnel

    ::dcase id=ft1 parent=racine        → relie cette case à la racine, sous l'id "ft1"
    ::dcase parent=ft1                  → relie cette case à la case "ft1" (id optionnel)
    ::dcase parent=ft1 rouge            → + couleur qui déroge à celle du ::dniveau

    id=     : identifiant de cette case, pour qu'une case d'un niveau suivant
              puisse s'y rattacher via parent=. Optionnel — utile seulement si
              la case sert de parent à une autre.
    parent= : id de la case (ou "racine") à laquelle cette case est reliée par
              une flèche. Sans lui, aucune flèche n'est tracée pour cette case.
    couleur : remplace la couleur du ::dniveau englobant pour cette case précise.
    """
    attrs = {"id": None, "parent": None, "color": None}

    id_match = re.search(r'\bid=(\S+)', text)
    if id_match:
        attrs["id"] = id_match.group(1)
        text = re.sub(r'\bid=\S+', '', text)

    parent_match = re.search(r'\bparent=(\S+)', text)
    if parent_match:
        attrs["parent"] = parent_match.group(1)
        text = re.sub(r'\bparent=\S+', '', text)

    for word in text.split():
        word_lower = word.lower()
        if word_lower in COLOR_FLAGS:
            attrs["color"] = word_lower

    return attrs


def detect_spacing_size(text: str) -> dict:
    """
    For: =esp>

    Input:  'l'   → {"size": "l"}
    Input:  ''    → {"size": "m"}    (default)
    """
    for word in text.split():
        if word.lower() in SIZE_FLAGS:
            return {"size": word.lower()}
    return {"size": "m"}


# ─────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────

def _pull_out_quoted_legend(text: str) -> tuple:
    """
    Find and remove a quoted string from the flags text.
    Returns (cleaned_text, legend_string).

    'xl centre anim.gif "La Terre tourne"'
    → ('xl centre anim.gif ', 'La Terre tourne')
    """
    m = _RE_QUOTED_STRING.search(text)
    if m:
        legend  = m.group(1)
        cleaned = text[:m.start()] + text[m.end():]
        return cleaned, legend
    return text, ""


def _looks_like_filename(word: str) -> bool:
    """Return True if the word ends in a known file extension."""
    dot_pos = word.rfind(".")
    if dot_pos < 0 or dot_pos == len(word) - 1:
        return False
    return word[dot_pos:].lower() in _FILE_EXTENSIONS
