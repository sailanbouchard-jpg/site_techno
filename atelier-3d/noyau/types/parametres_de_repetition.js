/*
 * noyau/types/parametres_de_repetition.js
 * Les réglages que partagent les trois nœuds de répétition.
 */

export const CHOIX_D_AXE = [
  { valeur: "x", etiquette: "X" },
  { valeur: "y", etiquette: "Y" },
  { valeur: "z", etiquette: "Z" },
];

export const PARAMETRE_NOMBRE = { etiquette: "Nombre", defaut: 3, min: 1, max: 100, entier: true, direct: true };

/* Le centre de l'original au moment de la création, dans le repère de la
   répétition : les boutons « … par le centre de l'objet » s'en servent. */
/* La taille de l'original à la création : la fenêtre d'opération en déduit
   « miroir collé à l'objet » ou l'écart qui évite que les copies se touchent. */
export const PARAMETRE_TAILLE_OBJET = Object.freeze({
  etiquette: "Taille de l'objet",
  defaut: Object.freeze({ x: 0, y: 0, z: 0 }),
  cache: true,
});

export const PARAMETRE_CENTRE_OBJET = Object.freeze({
  etiquette: "Centre de l'objet",
  defaut: Object.freeze({ x: 0, y: 0, z: 0 }),
  cache: true,
});
