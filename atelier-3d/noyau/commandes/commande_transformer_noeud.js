/*
 * noyau/commandes/commande_transformer_noeud.js
 * Position, rotation et dimensions d'un objet en une seule commande : c'est ce
 * qu'émettent les poignées, le mode « Poser » et les champs de l'inspecteur.
 */

import { remplacerNoeud, trouverNoeud } from "../document.js";
import { avecChamps } from "../noeud.js";

function transformer(document, idNoeud, transformation) {
  const noeud = trouverNoeud(document, idNoeud);
  if (noeud === null) {
    throw new Error("Modification impossible : l'objet « " + idNoeud + " » n'existe plus.");
  }
  return remplacerNoeud(document, idNoeud, avecChamps(noeud, { transformation }));
}

export const commandeTransformerNoeud = {
  type: "transformer_noeud",

  creer(idNoeud, transformationAvant, transformationApres) {
    return { type: "transformer_noeud", idNoeud, transformationAvant, transformationApres };
  },

  appliquer(document, commande) {
    return transformer(document, commande.idNoeud, commande.transformationApres);
  },

  annuler(document, commande) {
    return transformer(document, commande.idNoeud, commande.transformationAvant);
  },

  // Une flèche du clavier maintenue, un champ qu'on fait défiler : un seul
  // geste, une seule annulation, qui ramène au point de départ.
  fusionnerAvec(precedente, courante) {
    if (precedente.idNoeud !== courante.idNoeud) return null;
    return { ...precedente, transformationApres: courante.transformationApres };
  },
};
