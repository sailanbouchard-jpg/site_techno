/*
 * noyau/types/type_noeud_epaississement.js
 *
 * Un tracé devient un muret : une largeur dans le plan, une hauteur hors du
 * plan. Un prénom tracé au pinceau devient un objet imprimable ; un contour
 * fermé épaissi devient un cadre.
 *
 * Token attendu dans le document :
 *   { type: "epaississement", parametres: { largeur: 2, cote: "centre", hauteur: 5, esquisse: "n4_…" } }
 */

import { PARAMETRE_ORIGINE, PARAMETRE_ESQUISSE } from "../esquisse/plans_esquisse.js";
import { polygonesDEpaisseur } from "../esquisse/epaisseur_de_trait.js";
import { cote } from "../format_cotes.js";

export default {
  nom: "epaississement",
  etiquette: "Épaississement",
  termeDuProgramme: "extrusion d'un tracé",
  aide: "Transforme un tracé, même ouvert, en paroi d'une largeur et d'une hauteur données.",
  verbe: "Épaissir",
  icone: "epaississement",
  categorie: "interne",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  profilRequis: "trace",

  nomAuto: (n) => "Tracé épaissi " + cote(n.parametres.largeur) + " mm",

  parametres: {
    largeur: { etiquette: "Largeur du trait", unite: "mm", defaut: 2, min: 0.2, max: 200 },
    cote: {
      etiquette: "Côté",
      defaut: "centre",
      choix: [
        { valeur: "centre", etiquette: "Centré sur le tracé" },
        { valeur: "gauche", etiquette: "À gauche du tracé" },
        { valeur: "droite", etiquette: "À droite du tracé" },
      ],
    },
    hauteur: { etiquette: "Hauteur", unite: "mm", defaut: 10, min: 0.1, max: 1000 },
    origine: PARAMETRE_ORIGINE,
    esquisse: PARAMETRE_ESQUISSE,
  },

  boiteDansLePlan(p, boite) {
    return {
      min: [boite.min[0] - p.largeur, boite.min[1] - p.largeur, 0],
      max: [boite.max[0] + p.largeur, boite.max[1] + p.largeur, p.hauteur],
    };
  },

  construireDepuisProfil(atelier, p, profil) {
    const traces = [
      ...profil.ouverts.map((points) => ({ points, fermee: false })),
      ...profil.fermes.map((points) => ({ points, fermee: true })),
    ];
    const morceaux = polygonesDEpaisseur(traces, p.largeur, p.cote);
    if (morceaux.length === 0) throw new Error("l'esquisse ne contient aucun tracé à épaissir.");
    // « Positive » : les morceaux qui se recouvrent s'additionnent.
    return new atelier.CrossSection(morceaux, "Positive").extrude(p.hauteur);
  },
};
