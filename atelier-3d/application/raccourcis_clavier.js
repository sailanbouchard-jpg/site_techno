/*
 * application/raccourcis_clavier.js
 * ─────────────────────────────────
 * Les raccourcis de l'atelier. Aucun ne s'applique pendant la frappe dans un
 * champ : taper « t » dans le nom d'un objet ne doit pas en faire un trou.
 */

const PAS_FIN_MM = 1;
const PAS_LARGE_MM = 10;

function champDeSaisie(cible) {
  return cible instanceof HTMLElement && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
}

/*
 * actions : { annuler, refaire, supprimer, grouper, degrouper, dupliquer,
 *             selectionnerTout, deselectionner, basculerTrou, cadrer,
 *             enregistrer, choisirOutil(raccourci), deplacer(dx, dy, dz),
 *             toucheOutil(evenement) → true si l'outil a pris la touche,
 *             enEsquisse(), revenirALaSelection() }
 *
 * Dans une esquisse, les lettres choisissent les outils de tracé et Échap
 * revient à l'outil Sélection. On n'en sort qu'en validant, par le bouton :
 * une touche ne referme pas le travail en cours. Les raccourcis qui agiraient
 * sur les objets (déplacer, grouper…) sont inactifs : on dessine, on ne range pas.
 */
export function activerRaccourcis(actions) {
  globalThis.addEventListener("keydown", (evenement) => {
    if (champDeSaisie(evenement.target) || evenement.defaultPrevented) return;
    if (actions.toucheOutil(evenement)) {
      evenement.preventDefault();
      return;
    }

    const ctrl = evenement.ctrlKey || evenement.metaKey;
    const maj = evenement.shiftKey;
    const touche = evenement.key.toLowerCase();
    const pas = maj ? PAS_LARGE_MM : PAS_FIN_MM;

    const enEsquisse = actions.enEsquisse();
    const tableau = ctrl && enEsquisse ? {
      z: maj ? actions.refaire : actions.annuler,
      y: actions.refaire,
      s: actions.enregistrer,
    } : enEsquisse ? {
      escape: actions.revenirALaSelection,
      f: actions.cadrer,
    } : ctrl ? {
      z: maj ? actions.refaire : actions.annuler,
      y: actions.refaire,
      g: maj ? actions.degrouper : actions.grouper,
      d: actions.dupliquer,
      a: actions.selectionnerTout,
      c: actions.copier,
      v: actions.coller,
      s: actions.enregistrer,
    } : {
      delete: actions.supprimer,
      backspace: actions.supprimer,
      escape: actions.deselectionner,
      t: actions.basculerTrou,
      f: actions.cadrer,
      k: actions.nouvelleEsquisse,
      // Un quart de tour : R autour de Z, Maj+R autour de X. C'est la rotation
      // la plus demandée, et elle évite d'aller taper un angle dans l'inspecteur.
      r: () => actions.tourner(maj ? "x" : "z", 90),
      arrowleft: () => actions.deplacer(-pas, 0, 0),
      arrowright: () => actions.deplacer(pas, 0, 0),
      arrowup: () => actions.deplacer(0, pas, 0),
      arrowdown: () => actions.deplacer(0, -pas, 0),
      pageup: () => actions.deplacer(0, 0, pas),
      pagedown: () => actions.deplacer(0, 0, -pas),
    };

    const action = tableau[touche] ?? (!ctrl && !evenement.altKey ? () => actions.choisirOutil(touche) : null);
    if (action === null) return;
    // Ctrl+S, Ctrl+D, Ctrl+G… ont un sens pour le navigateur : on le lui retire.
    if (tableau[touche] !== undefined) evenement.preventDefault();
    action();
  });
}
