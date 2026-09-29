/*
 * noyau/commandes/commande_modifier_esquisse.js
 * Remplace le contenu d'une esquisse (points, tracés et contraintes) : un
 * trait ajouté, un point déplacé, une cote posée. Chaque geste de tracé en émet une, au
 * relâcher ou au clic — une entrée d'annulation par geste.
 */

import { remplacerNoeud, trouverNoeud } from "../document.js";
import { avecParametres } from "../noeud.js";

function regler(document, idNoeud, contenu) {
  const noeud = trouverNoeud(document, idNoeud);
  if (noeud === null) {
    throw new Error("Modification impossible : cette esquisse n'existe plus.");
  }
  return remplacerNoeud(document, idNoeud, avecParametres(noeud, {
    points: contenu.points, courbes: contenu.courbes, contraintes: contenu.contraintes ?? [],
  }));
}

export const commandeModifierEsquisse = {
  type: "modifier_esquisse",

  /* avant, apres : { points, courbes, contraintes } */
  creer(idNoeud, avant, apres, libelle = "Tracer") {
    return { type: "modifier_esquisse", idNoeud, avant, apres, libelle };
  },

  appliquer(document, commande) {
    return regler(document, commande.idNoeud, commande.apres);
  },

  annuler(document, commande) {
    return regler(document, commande.idNoeud, commande.avant);
  },
};
