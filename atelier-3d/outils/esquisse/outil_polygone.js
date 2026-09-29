/*
 * outils/esquisse/outil_polygone.js
 * Un polygone régulier : le centre, puis un sommet. Le nombre de côtés se
 * règle dans le bandeau.
 */

import { ajouterPolyligne } from "../../noyau/esquisse/elements_esquisse.js";
import { outilDepuisUnCentre } from "./trace_depuis_un_centre.js";
import { OPTIONS_DE_TRACE } from "./options_esquisse.js";

function sommets([cu, cv], rayon, angle, { cotes = 6 }) {
  const n = Math.max(3, Math.round(cotes));
  return Array.from({ length: n }, (_, i) => {
    const a = angle + (i * Math.PI * 2) / n;
    return [cu + rayon * Math.cos(a), cv + rayon * Math.sin(a)];
  });
}

export default outilDepuisUnCentre({
  nom: "polygone",
  etiquette: "Polygone",
  termeDuProgramme: "polygone régulier",
  aide: "Un polygone régulier : centre, puis sommet. Le nombre de côtés se règle dans le bandeau.",
  raccourci: "O",
  optionsBandeau: [
    { cle: "cotes", etiquette: "Côtés", type: "nombre", defaut: 6, min: 3, max: 24, entier: true, aide: "Nombre de côtés du polygone." },
    ...OPTIONS_DE_TRACE,
  ],
  champ: {
    cle: "rayon",
    etiquette: "Rayon",
    unite: "mm",
    versRayon: (rayon) => Math.abs(rayon),
    depuisRayon: (rayon) => rayon,
  },
  contour: sommets,
  // Le centre sert de repère mais n'appartient pas au contour.
  ajouter(contenu, centre, rayon, angle, options) {
    const c = typeof centre === "string" ? contenu.points[centre] : centre;
    return ajouterPolyligne(contenu, sommets(c, rayon, angle, options).map((point) => ({ point })), true).contenu;
  },
});
