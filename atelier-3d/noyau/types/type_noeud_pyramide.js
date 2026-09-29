/*
 * noyau/types/type_noeud_pyramide.js
 *
 * Token attendu dans le document :
 *   { type: "pyramide", parametres: { cotes: 4 },
 *     transformation: { echelle: { x: 20, y: 20, z: 20 } } }
 */

import { coteDAxe } from "../cotes_des_formes.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "pyramide",
  etiquette: "Pyramide",
  termeDuProgramme: "pyramide régulière",
  aide: "Pyramide à base rectangulaire, pointe vers le haut.",
  icone: "pyramide",
  categorie: "primitive",
  dimensionsParDefaut: { x: 20, y: 20, z: 20 },

  nomAuto: (_n, { dimensions: [x, y, z] }) => "Pyramide " + cote(x) + " × " + cote(y) + " × " + cote(z),

  cotes: [
    coteDAxe("longueur", "Longueur", "x"),
    coteDAxe("largeur", "Largeur", "y"),
    coteDAxe("hauteur", "Hauteur", "z"),
  ],

  parametres: {
    cotes: { etiquette: "Côtés de la base", defaut: 4, min: 3, max: 12, entier: true },
  },

  construire(atelier, p) {
    // On tourne le polygone pour qu'un côté soit en bas : une pyramide à base
    // carrée doit arriver alignée sur les axes, pas en losange.
    return atelier.CrossSection
      .circle(0.5, p.cotes)
      .rotate(-90 + 180 / p.cotes)
      .extrude(1, 0, 0, [0, 0]);
  },
};
