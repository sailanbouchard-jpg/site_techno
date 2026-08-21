"""
blocks/verif_blocks.py
-----------------------
Renders the =verif> button : checks =rep>/=choix> blocks that appear earlier
in the same document against an answer key, with 3 display modes.

=verif> SYNTAX (see detect_verif_flags in core/parser/flag_detector.py) :
  =verif> mode=1 | q1=Métal | q2=Bois | q3=Plastique
  =verif> q1=Métal | q2=Bois | mode=3
  =verif> q1=Métal | q2=Bois            (mode=1 par défaut)

  mode=1 : icône juste/faux sous chaque case concernée                [défaut]
  mode=2 : un seul message global, sans détail par case
  mode=3 : comme mode=1, + "Voir le corrigé" / "Effacer les réponses"

  Comparaison stricte (égalité de chaînes), 100% côté JS — voir templates/base.html.

Volontairement limité aux blocs =rep>/=choix> (seuls blocs sans correction
intégrée) — voir templates/base.html pour la logique JS de vérification.

PALETTE KEYS (section [verif]) :
  bouton_fond/texte, corrige_btn_fond/texte, effacer_btn_fond/texte.
  Les couleurs des icônes ✓/✗, du statut et du texte de corrigé (dont la
  couleur réutilise palette["rouge"]["bordure"]) sont injectées comme
  variables CSS au niveau :root par core/page_builder.py — pas ici — car
  elles sont consommées par du HTML injecté ailleurs dans la page (cases
  =rep>/=choix>, ::schema), pas par .block-verif lui-même.
"""

from core.parser.token_types import Token


def render_verif(token: Token, context: dict) -> str:
    verif = context["palette"].get("verif", {})

    bouton_fond       = verif.get("bouton_fond",       "#3b82f6")
    bouton_texte      = verif.get("bouton_texte",      "#ffffff")
    corrige_btn_fond  = verif.get("corrige_btn_fond",  "#f59e0b")
    corrige_btn_texte = verif.get("corrige_btn_texte", "#ffffff")
    effacer_btn_fond  = verif.get("effacer_btn_fond",  "#b91c1c")
    effacer_btn_texte = verif.get("effacer_btn_texte", "#ffffff")

    mode    = token.attrs.get("mode", 1)
    answers = token.attrs.get("answers", {})
    answers_str = "|".join(f"{qid}={valeur}" for qid, valeur in answers.items())

    return (
        f'<div class="block-verif" data-mode="{mode}" data-answers="{answers_str}">'
        f'<button type="button" class="verif-btn" '
        f'style="background:{bouton_fond}; color:{bouton_texte};">Vérifier les réponses</button>'
        f'<button type="button" class="verif-corrige-btn" style="display:none; '
        f'background:{corrige_btn_fond}; color:{corrige_btn_texte};">Voir le corrigé</button>'
        f'<button type="button" class="verif-effacer-btn" style="display:none; '
        f'background:{effacer_btn_fond}; color:{effacer_btn_texte};">Effacer les réponses</button>'
        f'<span class="verif-status"></span>'
        f'</div>'
    )
