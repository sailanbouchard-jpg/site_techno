/*
 * noyau/commandes/commande_basculer_trou.js
 * Marquer un objet « trou » ne creuse rien tout de suite : il attend d'être
 * groupé. La commande ne touche donc qu'un booléen du nœud.
 */

import { remplacerNoeud, trouverNoeud } from "../document.js";
import { avecChamps } from "../noeud.js";

function marquer(document, idNoeud, trou) {
  const noeud = trouverNoeud(document, idNoeud);
  if (noeud === null) {
    throw new Error("Modification impossible : l'objet « " + idNoeud + " » n'existe plus.");
  }
  return remplacerNoeud(document, idNoeud, avecChamps(noeud, { trou }));
}

export const commandeBasculerTrou = {
  type: "basculer_trou",

  creer(idNoeud, trouAvant) {
    return { type: "basculer_trou", idNoeud, trouAvant, trouApres: !trouAvant };
  },

  appliquer(document, commande) {
    return marquer(document, commande.idNoeud, commande.trouApres);
  },

  annuler(document, commande) {
    return marquer(document, commande.idNoeud, commande.trouAvant);
  },
};
