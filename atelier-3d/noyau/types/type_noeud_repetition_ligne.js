/*
 * noyau/types/type_noeud_repetition_ligne.js
 *
 * L'original recopié le long d'un axe, à écart régulier. Vivant : passer de
 * trois à cinq copies est un chiffre à changer.
 *
 * Token attendu dans le document :
 *   { type: "repetition_ligne", parametres: { axe: "x", nombre: 4, ecart: 12, deuxSens: false },
 *     enfants: [{ type: "cylindre", … }] }
 */

import { copiesEnLigne } from "../matrices_de_copies.js";
import { CHOIX_D_AXE, PARAMETRE_NOMBRE, PARAMETRE_CENTRE_OBJET, PARAMETRE_TAILLE_OBJET } from "./parametres_de_repetition.js";

export default {
  nom: "repetition_ligne",
  etiquette: "Répétition en ligne",
  termeDuProgramme: "répétition linéaire",
  aide: "Copies d'un objet alignées à intervalle régulier.",
  verbe: "Répéter en ligne",
  verbeCourt: "En ligne",
  icone: "repetition_ligne",
  categorie: "interne",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  degroupable: true,

  nomAuto: (n, { nommer }) => n.parametres.nombre + " × " + (n.enfants[0] ? nommer(n.enfants[0]) : "…") + " en ligne",

  parametres: {
    axe: { etiquette: "Axe", defaut: "x", choix: CHOIX_D_AXE },
    nombre: { ...PARAMETRE_NOMBRE, defaut: 3 },
    ecart: { etiquette: "Écart", unite: "mm", defaut: 20, min: -2000, max: 2000, direct: true },
    deuxSens: { etiquette: "Sens", case: "dans les deux sens", defaut: false },
    centreObjet: PARAMETRE_CENTRE_OBJET,
    tailleObjet: PARAMETRE_TAILLE_OBJET,
  },

  copies: copiesEnLigne,
};
