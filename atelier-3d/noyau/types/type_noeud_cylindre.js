/*
 * noyau/types/type_noeud_cylindre.js
 *
 * Token attendu dans le document :
 *   { type: "cylindre", parametres: { facettes: 48 },
 *     transformation: { echelle: { x: 20, y: 20, z: 20 } } }
 *
 * Le rayon, la hauteur et l'ovalité se lisent dans l'échelle, pas dans les
 * paramètres : voir type_noeud_pave.js et noyau/cotes_des_formes.js.
 */

import { coteDAxe, coteRayon, coteOvalite } from "../cotes_des_formes.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "cylindre",
  etiquette: "Cylindre",
  termeDuProgramme: "cylindre de révolution",
  aide: "Cylindre à base ronde, ou ovale avec l'ovalité. Rayon et hauteur se règlent dans l'inspecteur.",
  icone: "cylindre",
  categorie: "primitive",
  dimensionsParDefaut: { x: 20, y: 20, z: 20 },

  nomAuto: (_n, { dimensions: [x, y, z] }) => (Math.abs(x - y) < 0.05 ? "Cylindre Ø" + cote(x) : "Cylindre ovale " + cote(x) + " × " + cote(y)) + " × " + cote(z),

  cotes: [
    coteRayon(["y"]),
    coteDAxe("hauteur", "Hauteur", "z"),
    coteOvalite("ovalite", "Ovalité", "y", "Allongement de la base en Y (1 : rond)"),
  ],

  parametres: {
    facettes: { etiquette: "Facettes", defaut: 48, min: 8, max: 128, pasFixe: 4, entier: true, avance: true },
  },

  construire(atelier, p) {
    return atelier.Manifold.cylinder(1, 0.5, 0.5, p.facettes, false);
  },
};
