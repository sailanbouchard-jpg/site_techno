/*
 * noyau/types/type_noeud_sphere.js
 *
 * Token attendu dans le document :
 *   { type: "sphere", parametres: { facettes: 32 },
 *     transformation: { echelle: { x: 20, y: 20, z: 20 } } }
 */

import { coteRayon, coteOvalite } from "../cotes_des_formes.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "sphere",
  etiquette: "Sphère",
  termeDuProgramme: "boule",
  aide: "Boule ; les deux ovalités l'allongent en ellipsoïde.",
  icone: "sphere",
  categorie: "primitive",
  dimensionsParDefaut: { x: 20, y: 20, z: 20 },

  nomAuto: (_n, { dimensions: [x, y, z] }) => (Math.abs(x - y) < 0.05 && Math.abs(x - z) < 0.05 ? "Sphère Ø" + cote(x) : "Ovoïde " + cote(x) + " × " + cote(y) + " × " + cote(z)),

  cotes: [
    coteRayon(["y", "z"]),
    coteOvalite("ovaliteH", "Ovalité horiz.", "y", "Allongement en Y (1 : rond)"),
    coteOvalite("ovaliteV", "Ovalité vert.", "z", "Allongement en hauteur (1 : rond)"),
  ],

  parametres: {
    // Manifold arrondit au multiple de 4 supérieur : on n'en propose pas d'autre.
    facettes: { etiquette: "Facettes", defaut: 32, min: 8, max: 96, pasFixe: 4, entier: true, avance: true },
  },

  construire(atelier, p) {
    return atelier.Manifold.sphere(0.5, p.facettes);
  },
};
