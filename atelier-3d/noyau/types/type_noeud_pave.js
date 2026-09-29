/*
 * noyau/types/type_noeud_pave.js
 *
 * Token attendu dans le document :
 *   { type: "pave", transformation: { echelle: { x: 20, y: 20, z: 10 } } }
 *
 * Toutes les formes « normalisées » (celles qui déclarent dimensionsParDefaut)
 * suivent la même règle : la couche géométrie ramène ce que rend construire()
 * dans le cube unité — centré en X et Y, posé sur Z = 0 — et les dimensions en
 * millimètres sont portées par l'échelle de la transformation. Conséquences :
 *   - les dimensions affichées sont exactement l'échelle, sans calcul ;
 *   - redimensionner ne recalcule rien, comme déplacer ;
 *   - tous les pavés du projet partagent un seul maillage.
 */

import { coteDAxe } from "../cotes_des_formes.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "pave",
  etiquette: "Pavé",
  termeDuProgramme: "parallélépipède rectangle",
  aide: "Boîte à six faces rectangulaires. Longueur, largeur et hauteur se règlent dans l'inspecteur.",
  icone: "pave",
  categorie: "primitive",
  dimensionsParDefaut: { x: 20, y: 20, z: 20 },

  nomAuto: (_n, { dimensions: [x, y, z] }) => "Pavé " + cote(x) + " × " + cote(y) + " × " + cote(z),

  cotes: [
    coteDAxe("longueur", "Longueur", "x"),
    coteDAxe("largeur", "Largeur", "y"),
    coteDAxe("hauteur", "Hauteur", "z"),
  ],

  parametres: {},

  construire(atelier) {
    return atelier.Manifold.cube([1, 1, 1], true);
  },
};
