/*
 * noyau/commandes/commande_ajouter_noeud.js
 * La commande transporte le nœud entier, identifiant compris : refaire un
 * ajout doit redonner le MÊME objet, pas un jumeau avec un autre identifiant,
 * sinon tout ce qui le désignait (sélection, groupes) se retrouve orphelin.
 */

import { insererNoeud, supprimerNoeud } from "../document.js";

export const commandeAjouterNoeud = {
  type: "ajouter_noeud",

  creer(idParent, noeud, index = -1) {
    return { type: "ajouter_noeud", idParent, noeud, index };
  },

  appliquer(document, commande) {
    return insererNoeud(document, commande.idParent, commande.noeud, commande.index);
  },

  annuler(document, commande) {
    return supprimerNoeud(document, commande.noeud.id);
  },

  identifiantsCrees(commande) {
    return [commande.noeud.id];
  },
};
