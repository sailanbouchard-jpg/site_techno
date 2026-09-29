/*
 * noyau/types/type_noeud_profil_bibliotheque.js
 *
 * Fabrique un type de nœud à partir d'une entrée de la bibliothèque (voir
 * noyau/bibliotheque_de_profils.js). Tous les profils se construisent de la
 * même façon : le contour, extrudé sur une hauteur unité.
 *
 * Token attendu dans le document, par exemple :
 *   { type: "etoile", parametres: { branches: 5, creux: 40 },
 *     transformation: { echelle: { x: 30, y: 30, z: 4 } } }
 */

export function typeDepuisProfil(profil) {
  return {
    nom: profil.nom,
    etiquette: profil.etiquette,
    termeDuProgramme: "profil extrudé",
    aide: "Forme prête à l'emploi, déjà en volume. Ses dimensions se règlent dans l'inspecteur.",
    icone: profil.nom,
    categorie: "bibliotheque",
    dimensionsParDefaut: profil.dimensionsParDefaut,
    parametres: profil.parametres,

    construire(atelier, p) {
      // Règle pair-impair : un contour contenu dans un autre est un trou, quel
      // que soit le sens dans lequel on l'a écrit.
      return new atelier.CrossSection(profil.contours(p), "EvenOdd").extrude(1);
    },
  };
}
