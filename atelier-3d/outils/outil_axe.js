/*
 * outils/outil_axe.js
 * Trois flèches : le déplacement est contraint à X, Y ou Z, par pas, avec la
 * distance parcourue affichée. L'objet lui-même ne se traîne pas à la souris.
 */

import { creerManipulation } from "./manipulation.js";
import { OPTION_PAS_DE_ROTATION } from "./options_communes.js";

const manipulation = creerManipulation(null);

export default {
  nom: "axe",
  etiquette: "Axe",
  termeDuProgramme: "translation selon un axe",
  aide: "Déplacer une pièce le long d'un seul axe avec les flèches, ou la faire tourner avec les anneaux. C'est le seul mode qui tourne.",
  raccourci: "A",
  curseur: "default",
  modeGizmo: "axe",
  optionsBandeau: [
    // Une liste plutôt qu'un champ : les flèches d'un champ, parties d'un
    // minimum de 0,1, donnaient des crans de 1,1 ou 1,6 mm.
    {
      cle: "pas", etiquette: "Pas", type: "choix", defaut: 1,
      choix: [0.1, 0.5, 1, 2, 5, 10].map((v) => ({ valeur: v, etiquette: String(v).replace(".", ",") + " mm" })),
      aide: "Longueur d'un cran quand on tire une flèche.",
    },
    OPTION_PAS_DE_ROTATION,
  ],

  activer() {},
  desactiver: (contexte) => manipulation.annuler(contexte),
  surAppui: manipulation.surAppui,
  surDeplacement: manipulation.surDeplacement,
  surRelache: manipulation.surRelache,
  surTouche: manipulation.surTouche,
};
