/*
 * tranchage/protocole_tranchage.js
 * ────────────────────────────────
 * Ce que le fil principal et l'ouvrier de tranchage ont en commun. Importé des
 * deux côtés : rien que des constantes.
 */

export const TYPES_DE_LIGNE = Object.freeze({
  paroiExterieure: 0,
  paroisInterieures: 1,
  dessus: 2,
  dessous: 3,
  pleinInterieur: 4,
  remplissage: 5,
  jupe: 6,
  bordure: 7,
  paroiEnSurplomb: 8,
  pont: 9,
  interstices: 10,
  repassage: 11,
  pontInterieur: 12,
});
export const NOMBRE_DE_TYPES = 13;

// Un chemin, dans la réponse : couche, type de ligne, premier point, nombre de
// points, largeur en micromètres, fermé (1) ou ouvert (0), vitesse réelle en
// centièmes de mm/s (avant le ralentissement des couches courtes, que le fil
// principal applique).
export const CHAMPS_PAR_CHEMIN = 7;
