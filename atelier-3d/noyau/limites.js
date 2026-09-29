/*
 * noyau/limites.js
 * ────────────────
 * Les bornes de l'atelier. Un élève qui tape 100000 dans une case, ou qui
 * lâche une pièce en visant le vide, envoyait son objet à l'autre bout du
 * monde : introuvable, et la vue inutilisable. Tout ce qui écrit une position
 * ou une taille passe donc par ici.
 *
 * L'atelier tient dans un cube de 1 m de côté centré sur l'origine : aucun
 * objet de ce cours ne dépasse cette envergure.
 */

export const PORTEE_MM = 500;          // distance maximale à l'origine, sur chaque axe
export const TAILLE_MAX_MM = 1000;     // envergure maximale d'une pièce
export const TAILLE_MIN_MM = 0.05;     // en dessous, la forme n'est plus calculable

export const borner = (valeur, min, max) => Math.min(max, Math.max(min, valeur));

/* Une coordonnée, dans l'atelier. Une valeur absurde (NaN) retombe à zéro. */
export function bornerCoordonnee(valeur) {
  return Number.isFinite(valeur) ? borner(valeur, -PORTEE_MM, PORTEE_MM) : 0;
}

/* Une dimension, signe gardé : une échelle négative retourne la pièce. */
export function bornerTaille(valeur) {
  if (!Number.isFinite(valeur) || valeur === 0) return TAILLE_MIN_MM;
  const signe = valeur < 0 ? -1 : 1;
  return signe * borner(Math.abs(valeur), TAILLE_MIN_MM, TAILLE_MAX_MM);
}
