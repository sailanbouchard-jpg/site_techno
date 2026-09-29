/*
 * outils/options_communes.js
 * Les réglages que plusieurs modes affichent dans leur bandeau.
 */

export const OPTION_PAS_DE_ROTATION = {
  cle: "pasDeRotation",
  etiquette: "Pas de rotation",
  aide: "Angle d'un cran quand une pièce tourne avec les anneaux. Maj : rotation sans crans.",
  type: "choix",
  defaut: 15,
  choix: [1, 5, 15, 30, 45, 90].map((v) => ({ valeur: v, etiquette: v + "°" })),
  // Même valeur pour tous les modes : la changer dans l'un la change partout.
  partage: true,
};
