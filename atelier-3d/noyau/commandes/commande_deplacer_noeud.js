/*
 * noyau/commandes/commande_deplacer_noeud.js
 */

import { remplacerNoeud, trouverNoeud } from "../document.js";
import { avecPosition } from "../noeud.js";

function poser(document, idNoeud, position) {
  const noeud = trouverNoeud(document, idNoeud);
  if (noeud === null) {
    throw new Error("Déplacement impossible : l'objet « " + idNoeud + " » n'existe plus.");
  }
  return remplacerNoeud(document, idNoeud, avecPosition(noeud, position));
}

export const commandeDeplacerNoeud = {
  type: "deplacer_noeud",

  creer(idNoeud, positionAvant, positionApres) {
    return { type: "deplacer_noeud", idNoeud, positionAvant, positionApres };
  },

  appliquer(document, commande) {
    return poser(document, commande.idNoeud, commande.positionApres);
  },

  annuler(document, commande) {
    return poser(document, commande.idNoeud, commande.positionAvant);
  },

  // Fusionne avec la précédente si elle vise le même objet. Sert à ce qu'un
  // glisser de souris, ou une pression maintenue sur une flèche du clavier,
  // produise UNE entrée d'annulation et pas deux cents. Le « avant » de la
  // première est conservé : annuler revient au point de départ du geste.
  fusionnerAvec(precedente, courante) {
    if (precedente.idNoeud !== courante.idNoeud) return null;
    return { ...precedente, positionApres: courante.positionApres };
  },
};
