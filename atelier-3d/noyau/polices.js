/*
 * noyau/polices.js
 * ────────────────
 * Les quatre polices fournies avec l'atelier, toutes vérifiées sur les
 * accents français. Le document ne retient que leur nom ; le fichier est
 * chargé par l'ouvrier la première fois qu'un texte en a besoin.
 */

export const POLICES = Object.freeze([
  { nom: "baton", etiquette: "Bâton", fichier: "Lato-Bold.ttf" },
  { nom: "arrondie", etiquette: "Arrondie", fichier: "VarelaRound-Regular.ttf" },
  { nom: "manuscrite", etiquette: "Manuscrite", fichier: "Pacifico-Regular.ttf" },
  { nom: "machine", etiquette: "À empattements", fichier: "ZillaSlab-Bold.ttf" },
]);

const PREFIXE = "police:";

export const cleDePolice = (nom) => PREFIXE + nom;
export const estUneCleDePolice = (cle) => cle.startsWith(PREFIXE);

export function policeDeLaCle(cle) {
  const police = POLICES.find((p) => PREFIXE + p.nom === cle);
  if (police === undefined) throw new Error("Police inconnue : « " + cle.slice(PREFIXE.length) + " ».");
  return police;
}
