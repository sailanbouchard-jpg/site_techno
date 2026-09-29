/*
 * noyau/commandes/commande_modifier_plateau.js
 * Poser, déplacer, tourner ou retirer des pièces du plateau d'impression : la
 * section impression entière avant et après. Elle ne tient que quelques
 * nombres par pièce, la recopier ne coûte rien.
 *
 * geste : un nom commun aux commandes d'un même geste (une flèche maintenue,
 * un champ qu'on fait défiler) ; elles fusionnent en une seule annulation.
 */

import { avecImpression } from "../document.js";

export const commandeModifierPlateau = {
  type: "modifier_plateau",

  creer(avant, apres, geste = null) {
    return { type: "modifier_plateau", avant, apres, geste };
  },

  appliquer(document, commande) {
    return avecImpression(document, commande.apres);
  },

  annuler(document, commande) {
    return avecImpression(document, commande.avant);
  },

  fusionnerAvec(precedente, courante) {
    if (courante.geste === null || precedente.geste !== courante.geste) return null;
    return { ...precedente, apres: courante.apres };
  },
};
