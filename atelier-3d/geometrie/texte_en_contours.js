/*
 * geometrie/texte_en_contours.js
 * ──────────────────────────────
 * Aligne les lettres d'un texte et rend leurs contours en millimètres, le
 * texte centré sur l'origine. « taille » est la hauteur d'une majuscule : la
 * cote que l'élève mesure sur la pièce imprimée.
 */

export function contoursDuTexte(police, texte, taille, nomDeLaPolice) {
  const echelle = taille / police.hauteurDeCapitale;
  const contours = [];
  const manquants = new Set();
  let curseur = 0;
  for (const lettre of texte) {
    const glyphe = police.contoursDe(lettre);
    if (glyphe === null) {
      manquants.add(lettre);
      continue;
    }
    for (const contour of glyphe.contours) {
      contours.push(contour.map(([x, y]) => [curseur + x * echelle, y * echelle]));
    }
    curseur += glyphe.avance * echelle;
  }
  if (manquants.size > 0) {
    throw new Error("la police « " + nomDeLaPolice + " » n'a pas le caractère « " + [...manquants].join(" ") + " ». Choisir une autre police.");
  }
  if (contours.length === 0) return [];

  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const contour of contours) {
    for (const [x, y] of contour) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const [cx, cy] = [(minX + maxX) / 2, (minY + maxY) / 2];
  return contours.map((contour) => contour.map(([x, y]) => [x - cx, y - cy]));
}
