/*
 * outils/esquisse/outil_cercle.js
 * Un clic au centre, un clic pour la taille. On tape le diamètre : c'est la
 * cote que les élèves mesurent au pied à coulisse.
 */

import { ajouterCercle } from "../../noyau/esquisse/elements_esquisse.js";
import { pointsDeCercle } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDepuisUnCentre } from "./trace_depuis_un_centre.js";

export default outilDepuisUnCentre({
  nom: "cercle",
  etiquette: "Cercle",
  termeDuProgramme: "cercle",
  aide: "Un cercle : un clic au centre, un clic pour la taille. Le diamètre peut se saisir au clavier.",
  raccourci: "C",
  champ: {
    cle: "diametre",
    etiquette: "Diamètre",
    unite: "mm",
    versRayon: (diametre) => Math.abs(diametre) / 2,
    depuisRayon: (rayon) => rayon * 2,
  },
  contour: (centre, rayon) => pointsDeCercle(centre, rayon),
  ajouter: (contenu, centre, rayon) => ajouterCercle(contenu, centre, rayon).contenu,
});
