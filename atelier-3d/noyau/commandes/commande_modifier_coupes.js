/*
 * noyau/commandes/commande_modifier_coupes.js
 * Créer, régler ou retirer une vue en coupe : la liste entière avant et après.
 * Elle est courte (quelques coupes), la recopier ne coûte rien.
 */

import { avecCoupes } from "../document.js";

export const commandeModifierCoupes = {
  type: "modifier_coupes",

  creer(avant, apres) {
    return { type: "modifier_coupes", avant, apres };
  },

  appliquer(document, commande) {
    return avecCoupes(document, commande.apres);
  },

  annuler(document, commande) {
    return avecCoupes(document, commande.avant);
  },
};
