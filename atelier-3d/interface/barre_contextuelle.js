/*
 * interface/barre_contextuelle.js
 * ───────────────────────────────
 * Quelques boutons qui flottent juste au-dessus de la sélection : on agit là
 * où l'on regarde, sans aller chercher la commande dans le ruban. La barre se
 * cache pendant qu'on manipule la vue ou un objet.
 */

import { creer, bouton } from "./elements.js";

const ECART_PX = 14;

/*
 * vue : l'élément qui contient la 3D ;
 * commandes : [{ nom, icone, aide, texte?, action() }] — texte : écrit à côté de
 * l'icône, pour la commande qu'on vient chercher en premier.
 */
export function creerBarreContextuelle(vue, commandes) {
  const boutons = new Map(commandes.map((c) => [c.nom, bouton({
    icone: c.icone, texte: c.texte, aide: c.aide, classe: "plat" + (c.texte ? " mis-en-avant" : ""), surClic: c.action,
  })]));
  const barre = creer("div", { classe: "barre-contextuelle", attributs: { role: "toolbar", "aria-label": "Actions sur la sélection" } }, [...boutons.values()]);
  barre.hidden = true;
  vue.append(barre);
  let enPause = false;

  return {
    /*
     * coins : les coins de la boîte de la sélection, en pixels de la page
     * ([[x, y], …]), ou null pour cacher ; disponibles : { nom: bool } ;
     * evites : d'autres points à laisser dégagés (le gizmo) — la barre passe
     * au-dessus d'eux aussi, mais reste centrée sur la sélection.
     */
    placer(coins, disponibles = {}, evites = []) {
      if (coins === null || enPause) {
        barre.hidden = true;
        return;
      }
      for (const [nom, b] of boutons) b.hidden = disponibles[nom] === false;
      barre.hidden = false;
      const cadre = vue.getBoundingClientRect();
      const xs = coins.map(([x]) => x - cadre.left);
      const haut = Math.min(...[...coins, ...evites].map(([, y]) => y - cadre.top));
      const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
      const largeur = barre.offsetWidth;
      // Dans une vue plus étroite que la barre, elle s'aligne à gauche : Grouper, en tête, reste visible.
      const x = Math.max(Math.min(centre - largeur / 2, cadre.width - largeur - 4), 4);
      // Au-dessus de la pièce ; si elle touche le haut de la vue, juste en dessous du bord.
      const y = Math.max(haut - barre.offsetHeight - ECART_PX, 4);
      barre.style.transform = "translate(" + Math.round(x) + "px, " + Math.round(y) + "px)";
    },

    /* Pendant un geste (glisser, tourner la vue), la barre s'efface. */
    pause(active) {
      enPause = active;
      if (active) barre.hidden = true;
    },
  };
}
