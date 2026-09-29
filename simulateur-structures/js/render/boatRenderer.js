// render/boatRenderer.js
// ──────────────────────
// Dessine les BATEAUX, vus de face, posés sur l'eau. Ils font partie du décor
// STATIQUE (couche avant, avec le sol) : ils ne bougent jamais.
//
// La coque est peinte en deux temps : la partie immergée en transparence (on la
// devine sous l'eau), la partie émergée en pleines couleurs, séparées par le
// liseré de flottaison. Les formes viennent toutes de model/bateau.js — celles
// qui servent aussi de gabarit — pour que ce qu'on VOIT soit exactement ce qui
// est INTERDIT.
//
// Dessiné dans le contexte déjà transformé par la vue, en « pixels de base »
// (monde × PIXELS_PER_METER). LECTURE SEULE.

import { bateauxDe, formesBateau, typeBateau, LARGEUR_BATEAU } from "../model/bateau.js";
import {
  PIXELS_PER_METER, WATER_LEVEL_M,
  BOAT_HULL_TOP, BOAT_HULL_BOTTOM, BOAT_HULL_LINE, BOAT_WATERLINE,
  BOAT_CABIN, BOAT_CABIN_LINE, BOAT_GLASS, BOAT_MAST, BOAT_MAST_LINE,
  BOAT_SAIL, BOAT_SAIL_SHADE, BOAT_SAIL_LINE,
  BOAT_SUBMERGED_ALPHA, BOAT_LINE_WIDTH_M,
} from "./styleConfig.js";

// Comment se peint chaque pièce, selon son rôle (voir model/bateau.js). Une
// voile reçoit en plus un dégradé, posé par degradeVoile.
const PEINTURE = {
  cabine: [BOAT_CABIN, BOAT_CABIN_LINE],
  mat: [BOAT_MAST, BOAT_MAST_LINE],
  vergue: [BOAT_MAST, BOAT_MAST_LINE],
  voile: [BOAT_SAIL, BOAT_SAIL_LINE],
};

const ppm = PIXELS_PER_METER;

export function drawBoats(ctx, structure) {
  for (const bateau of bateauxDe(structure)) drawBoat(ctx, bateau);
}

function drawBoat(ctx, bateau) {
  const [coque, ...dessus] = formesBateau(bateau);
  const yEau = WATER_LEVEL_M * ppm;
  const trait = BOAT_LINE_WIDTH_M * ppm;

  // Coque immergée : on la laisse transparaître à travers l'eau.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e5, yEau, 2e5, 1e5);
  ctx.clip();
  ctx.globalAlpha = BOAT_SUBMERGED_ALPHA;
  remplirForme(ctx, coque.points, degradeCoque(ctx, bateau), BOAT_HULL_LINE, trait);
  ctx.restore();

  // Coque émergée, puis tout ce qui est au-dessus du pont.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, yEau + 1e5);
  ctx.clip();
  remplirForme(ctx, coque.points, degradeCoque(ctx, bateau), BOAT_HULL_LINE, trait);
  ctx.restore();

  const type = typeBateau(bateau.type);
  for (const forme of dessus) {
    const [remplissage, contour] = PEINTURE[forme.role] || PEINTURE.cabine;
    const peinture = forme.role === "voile" ? degradeVoile(ctx, forme.points) : remplissage;
    remplirForme(ctx, forme.points, peinture, contour, trait);
  }
  hublots(ctx, bateau, type, trait);
  liseauFlottaison(ctx, bateau, trait);
}

function remplirForme(ctx, forme, remplissage, contour, trait) {
  ctx.beginPath();
  ctx.moveTo(forme[0].x * ppm, forme[0].y * ppm);
  for (let k = 1; k < forme.length; k++) ctx.lineTo(forme[k].x * ppm, forme[k].y * ppm);
  ctx.closePath();
  ctx.fillStyle = remplissage;
  ctx.fill();
  ctx.lineWidth = trait;
  ctx.lineJoin = "round";
  ctx.strokeStyle = contour;
  ctx.stroke();
}

function degradeCoque(ctx, bateau) {
  const haut = (WATER_LEVEL_M - 1) * ppm;
  const bas = (WATER_LEVEL_M + 0.9) * ppm;
  const degrade = ctx.createLinearGradient(0, haut, 0, bas);
  degrade.addColorStop(0, BOAT_HULL_TOP);
  degrade.addColorStop(1, BOAT_HULL_BOTTOM);
  return degrade;
}

// Une voile gonflée prend le jour au milieu et s'ombre sur ses bords : ce
// dégradé horizontal suffit à la faire paraître bombée, sans dessiner un pli.
function degradeVoile(ctx, points) {
  const xs = points.map((p) => p.x);
  const degrade = ctx.createLinearGradient(Math.min(...xs) * ppm, 0, Math.max(...xs) * ppm, 0);
  degrade.addColorStop(0, BOAT_SAIL_SHADE);
  degrade.addColorStop(0.45, BOAT_SAIL);
  degrade.addColorStop(1, BOAT_SAIL_SHADE);
  return degrade;
}

// Le liseré de flottaison : la ligne qui dit où le bateau s'enfonce.
function liseauFlottaison(ctx, bateau, trait) {
  const demi = (LARGEUR_BATEAU / 2) * 0.99;
  ctx.beginPath();
  ctx.moveTo((bateau.x - demi) * ppm, WATER_LEVEL_M * ppm);
  ctx.lineTo((bateau.x + demi) * ppm, WATER_LEVEL_M * ppm);
  ctx.lineWidth = trait * 2.2;
  ctx.lineCap = "butt";
  ctx.strokeStyle = BOAT_WATERLINE;
  ctx.stroke();
}

// Deux hublots sur la timonerie : de quoi lire l'échelle du bateau d'un coup d'œil.
function hublots(ctx, bateau, type, trait) {
  const y = (WATER_LEVEL_M - (type.id === "moteur" ? 1.9 : 1.5)) * ppm;
  const rayon = 0.2 * ppm;
  ctx.fillStyle = BOAT_GLASS;
  ctx.strokeStyle = BOAT_CABIN_LINE;
  ctx.lineWidth = trait;
  for (const dx of [-0.6, 0.6]) {
    ctx.beginPath();
    ctx.arc((bateau.x + dx) * ppm, y, rayon, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
