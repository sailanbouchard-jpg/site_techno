/*
 * noyau/pose_sur_face.js
 * ──────────────────────
 * L'orientation d'un texte collé sur une face : son dessus regarde hors de la
 * face, et ses lettres restent debout — leur haut suit la verticale du monde
 * autant que la face le permet. Sur une face horizontale, le texte se lit
 * depuis l'avant (le haut des lettres vers +Y).
 */

import { decomposer } from "./transformations.js";

const normaliser = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((c) => c / l);
};
const vectoriel = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function rotationPourTexte(normale) {
  const n = normaliser(normale);
  const vertical = Math.abs(n[2]) > 0.95 ? [0, Math.sign(n[2]) || 1, 0] : [0, 0, 1];
  // Le haut des lettres : la verticale, débarrassée de sa part le long de la normale.
  const produit = vertical[0] * n[0] + vertical[1] * n[1] + vertical[2] * n[2];
  const haut = normaliser(vertical.map((c, i) => c - produit * n[i]));
  const droite = vectoriel(haut, n);
  const matrice = [
    droite[0], haut[0], n[0], 0,
    droite[1], haut[1], n[1], 0,
    droite[2], haut[2], n[2], 0,
  ];
  return decomposer(matrice).rotation;
}

/* Où poser le pied du texte pour qu'il sorte en relief ou qu'il creuse. Le
   relief mord un peu dans la face, le gravé dépasse un peu : dans les deux
   cas la soudure ou la découpe est franche une fois groupé. */
export const RECOUVREMENT_MM = 0.2;

export function positionSurLaFace(surface, normale, epaisseur, grave) {
  const n = normaliser(normale);
  const recul = grave ? epaisseur - RECOUVREMENT_MM : RECOUVREMENT_MM;
  return { x: surface.x - n[0] * recul, y: surface.y - n[1] * recul, z: surface.z - n[2] * recul };
}
