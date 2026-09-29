/*
 * noyau/finitions.js
 * ──────────────────
 * L'aspect de surface d'un objet, en plus de sa couleur : de quoi distinguer
 * les matériaux d'une maquette (un boîtier en plastique, des contacts en
 * métal, une lentille). Purement visuel : la finition n'entre ni dans le
 * maillage ni dans l'export STL.
 *
 * null : mat, la finition par défaut. La vue décrit le rendu de chaque
 * finition (vue/materiaux.js) ; ici, seulement leurs noms.
 */

export const FINITIONS = [
  { valeur: null, etiquette: "Mat", aide: "Surface mate, sans reflet : plastique brut, bois, carton." },
  { valeur: "brillant", etiquette: "Brillant", aide: "Plastique brillant ou verni : reflets nets sur la couleur." },
  { valeur: "metal", etiquette: "Métal", aide: "Métal poli : la surface reflète son environnement. La couleur teinte le reflet (gris : acier, jaune : laiton, cuivre…)." },
  { valeur: "translucide", etiquette: "Translucide", aide: "Laisse voir au travers : verre, plexiglas, lentille de LED." },
];
