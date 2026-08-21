"""
blocks/objet3d_blocks.py
------------------------
Rend le bloc =3D> : un visualisateur d'objet 3D au format STL.

SYNTAXE (mêmes flags que les médias : size, align, fichier .stl, légende)
  =3D> l centre stylo_bic.stl "Un stylo Bic en 3D"

Le rendu WebGL est assuré par static/libs/stl_viewer.js (vanilla, auto-hébergé,
zéro dépendance). Ce renderer ne fait qu'émettre le HTML + les couleurs/tailles
lues dans la palette [obj3d] ; il n'écrit AUCUNE couleur en dur. Les couleurs
partent vers le JS via des attributs data-* (fond du canvas, couleur par défaut
du modèle, puissance de la lumière), et vers le CSS via des variables --obj3d-*.

Le fichier .stl est résolu par le media_map (comme les images), donc il vit
dans contenu/medias/ (n'importe quel sous-dossier).

COULEUR PAR FACE : si le STL encode une couleur par triangle (attribut 5-5-5,
bit15 = valide), le visualisateur l'utilise ; sinon il applique couleur_defaut.
"""

from core.parser.token_types import Token
# Réutilise les barèmes de taille/alignement des médias — source unique (voir
# le commentaire "the ONE place these numbers live" dans media_blocks.py).
from core.blocks.media_blocks import (
    _SIZE_TO_MAX_WIDTH,
    _ALIGN_TO_CSS,
    _DEFAULT_MEDIA_ALIGN,
    _resolve_media_url,
    _build_legend_html,
)

# Chemin du visualisateur auto-hébergé (jamais un CDN).
_VIEWER_SCRIPT = "/static/libs/stl_viewer.js"

_DEFAULT_SIZE = "l"   # un objet 3D se regarde plus grand qu'une image lambda


def render_objet_3d(token: Token, context: dict) -> str:
    """=3D> — visualisateur STL interactif (rotation, zoom, lumière réglable)."""
    src    = _resolve_media_url(token.value, context)
    legend = _build_legend_html(token)

    size      = token.attrs.get("size", _DEFAULT_SIZE)
    max_width = _SIZE_TO_MAX_WIDTH.get(size, _SIZE_TO_MAX_WIDTH[_DEFAULT_SIZE])
    align     = token.attrs.get("align", _DEFAULT_MEDIA_ALIGN)
    align_css = _ALIGN_TO_CSS.get(align, _ALIGN_TO_CSS[_DEFAULT_MEDIA_ALIGN])

    pal = context.get("palette", {}).get("obj3d", {})
    fond          = pal.get("fond",           "#eef2f5")
    couleur_def   = pal.get("couleur_defaut", "#b7bdc4")
    lumiere       = pal.get("lumiere",        "0.9")
    ambiance      = pal.get("ambiance",       "0.45")
    hauteur       = pal.get("hauteur",        "420px")
    bordure       = pal.get("bordure",        "#d0d7de")
    rayon         = pal.get("rayon",          "8px")
    ctrl_fond     = pal.get("controle_fond",        "#ffffff")
    ctrl_bordure  = pal.get("controle_bordure",     "#cbd5e1")
    ctrl_texte    = pal.get("controle_texte",       "#1e293b")
    ctrl_survol   = pal.get("controle_fond_survol", "#e2e8f0")
    accent        = pal.get("accent",         "#2980b9")

    wrapper_style = f"max-width: {max_width}; width: 100%; {align_css}"

    block_style = (
        f"--obj3d-fond: {fond}; --obj3d-bordure: {bordure}; --obj3d-rayon: {rayon}; "
        f"--obj3d-hauteur: {hauteur}; --obj3d-ctrl-fond: {ctrl_fond}; "
        f"--obj3d-ctrl-bordure: {ctrl_bordure}; --obj3d-ctrl-texte: {ctrl_texte}; "
        f"--obj3d-ctrl-survol: {ctrl_survol}; --obj3d-accent: {accent};"
    )

    controls = (
        '<div class="obj3d-controls">'
        '<button type="button" class="obj3d-btn obj3d-zoom" data-dir="in" '
        'aria-label="Zoomer" title="Zoomer">+</button>'
        '<button type="button" class="obj3d-btn obj3d-zoom" data-dir="out" '
        'aria-label="Dézoomer" title="Dézoomer">−</button>'
        '<button type="button" class="obj3d-btn obj3d-reset" '
        'title="Recentrer la vue">Recentrer</button>'
        '<label class="obj3d-light-label" title="Puissance de l\'éclairage">'
        'Lumière'
        '<input type="range" class="obj3d-light" min="0" max="2" step="0.05">'
        '</label>'
        '</div>'
    )

    return (
        f'<div class="media media-obj3d" style="{wrapper_style}">'
        f'<div class="block-obj3d" style="{block_style}" '
        f'data-stl="{src}" data-fond="{fond}" data-couleur-defaut="{couleur_def}" '
        f'data-lumiere="{lumiere}" data-ambiance="{ambiance}">'
        f'<canvas class="obj3d-canvas"></canvas>'
        f'<div class="obj3d-message">Chargement du modèle 3D…</div>'
        f'{controls}'
        f'</div>'
        f'{legend}'
        f'<script src="{_VIEWER_SCRIPT}" defer></script>'
        f'</div>'
    )
