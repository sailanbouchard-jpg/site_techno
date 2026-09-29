/*
 * noyau/types/type_noeud_cone.js
 *
 * Token attendu dans le document :
 *   { type: "cone", parametres: { sommet: 0, facettes: 48 },
 *     transformation: { echelle: { x: 20, y: 20, z: 20 } } }
 *
 * « sommet » est le diamètre du haut en pourcentage de celui de la base :
 * 0 donne une pointe, 50 un cône tronqué, 100 un cylindre.
 */

import { coteDAxe, coteRayon, coteOvalite } from "../cotes_des_formes.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "cone",
  etiquette: "Cône",
  termeDuProgramme: "cône de révolution",
  aide: "Cône à base ronde ou ovale, pointe vers le haut.",
  icone: "cone",
  categorie: "primitive",
  dimensionsParDefaut: { x: 20, y: 20, z: 20 },

  nomAuto: (_n, { dimensions: [x, y, z] }) => (Math.abs(x - y) < 0.05 ? "Cône Ø" + cote(x) : "Cône ovale " + cote(x) + " × " + cote(y)) + " × " + cote(z),

  cotes: [
    coteRayon(["y"]),
    coteDAxe("hauteur", "Hauteur", "z"),
    coteOvalite("ovalite", "Ovalité", "y", "Allongement de la base en Y (1 : rond)"),
  ],

  parametres: {
    sommet: { etiquette: "Haut", unite: "%", defaut: 0, min: 0, max: 100, pasFixe: 5, entier: true },
    facettes: { etiquette: "Facettes", defaut: 48, min: 8, max: 128, pasFixe: 4, entier: true, avance: true },
  },

  construire(atelier, p) {
    return atelier.Manifold.cylinder(1, 0.5, 0.5 * (p.sommet / 100), p.facettes, false);
  },
};
