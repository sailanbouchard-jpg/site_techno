/*
 * noyau/commandes/commande_renommer_document.js
 * Le nom du projet fait partie du document : le changer passe par une
 * commande comme le reste, et s'annule comme le reste.
 */

import { avecNom } from "../document.js";

// Au-delà, le nom ne tient plus dans la barre haute ni dans la liste des projets.
export const LONGUEUR_MAXIMALE_DU_NOM = 80;

export const commandeRenommerDocument = {
  type: "renommer_document",

  creer(nomAvant, nomApres) {
    const propre = String(nomApres).trim().slice(0, LONGUEUR_MAXIMALE_DU_NOM);
    if (propre === "") {
      throw new Error("Un projet doit avoir un nom.");
    }
    return { type: "renommer_document", nomAvant, nomApres: propre };
  },

  appliquer(document, commande) {
    return avecNom(document, commande.nomApres);
  },

  annuler(document, commande) {
    return avecNom(document, commande.nomAvant);
  },

  fusionnerAvec(precedente, courante) {
    return { ...precedente, nomApres: courante.nomApres };
  },
};
