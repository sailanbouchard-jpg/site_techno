/*
 * noyau/types/type_noeud_tore.js
 *
 * Token attendu dans le document :
 *   { type: "tore", parametres: { ouverture: 50, facettes: 48 },
 *     transformation: { echelle: { x: 40, y: 40, z: 10 } } }
 *
 * « ouverture » est le diamètre du trou central en pourcentage du diamètre
 * extérieur. Aux dimensions par défaut (40 × 40 × 10) avec une ouverture de
 * 50 %, l'anneau fait 10 mm de large et 10 mm de haut : sa section est ronde.
 */

import { COTES_DU_TORE, OUVERTURE_MIN, OUVERTURE_MAX } from "../cotes_des_formes.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "tore",
  etiquette: "Tore",
  termeDuProgramme: "anneau torique",
  aide: "Anneau à section ronde, comme une bouée.",
  icone: "tore",
  categorie: "primitive",
  dimensionsParDefaut: { x: 40, y: 40, z: 10 },

  nomAuto: (_n, { dimensions: [x] }) => "Anneau Ø" + cote(x),

  cotes: COTES_DU_TORE,

  parametres: {
    // Réglé par les deux rayons (voir cotes_des_formes.js), pas directement.
    ouverture: { etiquette: "Trou central", unite: "%", defaut: 50, min: OUVERTURE_MIN, max: OUVERTURE_MAX, cache: true },
    facettes: { etiquette: "Facettes", defaut: 48, min: 8, max: 128, pasFixe: 4, entier: true, avance: true },
  },

  construire(atelier, p) {
    // Rayon extérieur 0,5 : grand rayon + petit rayon = 0,5, et le trou vaut
    // (grand − petit) / (grand + petit).
    const k = p.ouverture / 100;
    const grandRayon = (1 + k) / 4;
    const petitRayon = (1 - k) / 4;
    const segmentsDeSection = Math.max(8, Math.round(p.facettes / 2));
    return atelier.CrossSection
      .circle(petitRayon, segmentsDeSection)
      .translate([grandRayon, 0])
      .revolve(p.facettes);
  },
};
