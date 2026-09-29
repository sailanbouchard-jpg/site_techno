/*
 * noyau/types/type_noeud_symetrie.js
 *
 * L'original et son reflet par un plan (ou le reflet seul : « retourner sur
 * place »). Vivant : changer de plan met la vue à jour tout de suite.
 *
 * Token attendu dans le document :
 *   { type: "symetrie", parametres: { plan: "YZ", position: 0, garder: true },
 *     enfants: [{ type: "etoile", … }] }
 * position : la place du plan le long de sa normale, dans le repère de la
 * symétrie (qui est posée au pied de l'original).
 */

import { copiesSymetriques } from "../matrices_de_copies.js";
import { PARAMETRE_CENTRE_OBJET, PARAMETRE_TAILLE_OBJET } from "./parametres_de_repetition.js";

export default {
  nom: "symetrie",
  etiquette: "Symétrie",
  termeDuProgramme: "symétrie plane",
  aide: "Reflet d'un objet par rapport à un plan.",
  verbe: "Symétrie",
  icone: "symetrie",
  categorie: "interne",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  degroupable: true,

  nomAuto: (n, { nommer }) => "Symétrie de " + (n.enfants[0] ? nommer(n.enfants[0]) : "…"),

  parametres: {
    plan: {
      etiquette: "Plan",
      defaut: "YZ",
      choix: [
        { valeur: "YZ", etiquette: "YZ (gauche ↔ droite)" },
        { valeur: "XZ", etiquette: "XZ (avant ↔ arrière)" },
        { valeur: "XY", etiquette: "XY (haut ↔ bas)" },
      ],
    },
    position: { etiquette: "Position du plan", unite: "mm", defaut: 0, min: -2000, max: 2000 },
    garder: { etiquette: "Original", case: "conserver l'original", defaut: true },
    centreObjet: PARAMETRE_CENTRE_OBJET,
    tailleObjet: PARAMETRE_TAILLE_OBJET,
  },

  copies: copiesSymetriques,
};
