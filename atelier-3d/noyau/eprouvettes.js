/*
 * noyau/eprouvettes.js
 * ────────────────────
 * Les éprouvettes de calibration viennent avec le logiciel, comme les polices :
 * le document ne retient que le nom du fichier Draco, et l'ouvrier va le
 * chercher dans calibration/modeles/ la première fois qu'un calcul en a
 * besoin. Rien ne part dans le stockage de l'élève — ce n'est pas son fichier.
 */

const PREFIXE = "eprouvette:";

// La clé sert à construire une URL : seuls un nom de fichier et un sous-dossier
// du catalogue y sont acceptés. Pas de « .. », pas de chemin absolu.
const MODELE_VALIDE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.drc$/;

export const cleDEprouvette = (modele) => PREFIXE + modele;
export const estUneCleDEprouvette = (cle) => cle.startsWith(PREFIXE);

export function modeleDeLaCle(cle) {
  const modele = cle.slice(PREFIXE.length);
  if (!MODELE_VALIDE.test(modele)) {
    throw new Error("Éprouvette inconnue : « " + modele + " ».");
  }
  return modele;
}
