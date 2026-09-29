/*
 * noyau/commandes/commande_supprimer_noeud.js
 * « creer » reçoit le document parce qu'une suppression doit mémoriser d'où
 * l'objet venait : son parent et son rang. Sans le rang, annuler le remettrait
 * en fin de liste et l'arbre de construction se réordonnerait tout seul.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, trouverParent, indexDansParent } from "../document.js";

export const commandeSupprimerNoeud = {
  type: "supprimer_noeud",

  creer(document, idNoeud) {
    const noeud = trouverNoeud(document, idNoeud);
    if (noeud === null) {
      throw new Error("Suppression impossible : l'objet « " + idNoeud + " » n'existe plus.");
    }
    const parent = trouverParent(document, idNoeud);
    if (parent === null) {
      throw new Error("La racine du document ne peut pas être supprimée.");
    }
    return {
      type: "supprimer_noeud",
      idParent: parent.id,
      index: indexDansParent(document, idNoeud),
      noeud,
    };
  },

  appliquer(document, commande) {
    return supprimerNoeud(document, commande.noeud.id);
  },

  annuler(document, commande) {
    return insererNoeud(document, commande.idParent, commande.noeud, commande.index);
  },

  identifiantsRestaures(commande) {
    return [commande.noeud.id];
  },
};
