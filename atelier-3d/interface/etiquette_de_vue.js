/*
 * interface/etiquette_de_vue.js
 * ─────────────────────────────
 * Une étiquette posée sur un point de la scène, pendant un geste : la hauteur
 * d'une pièce au-dessus du sol, lue sous la pièce elle-même plutôt que dans
 * un coin de l'écran.
 */

import { creer } from "./elements.js";

export function creerEtiquetteDeVue(vue) {
  const etiquette = creer("div", { classe: "etiquette-de-vue", attributs: { "aria-live": "polite" } });
  etiquette.hidden = true;
  vue.append(etiquette);

  return {
    /* [x, y] : en pixels de la page ; l'étiquette est centrée dessus. */
    montrer([x, y], texte) {
      const cadre = vue.getBoundingClientRect();
      etiquette.textContent = texte;
      etiquette.hidden = false;
      etiquette.style.transform = "translate(" + Math.round(x - cadre.left) + "px, " + Math.round(y - cadre.top) + "px) translate(-50%, -50%)";
    },

    cacher() {
      etiquette.hidden = true;
    },
  };
}
