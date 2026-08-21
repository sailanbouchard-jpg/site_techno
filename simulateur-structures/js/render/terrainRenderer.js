// render/terrainRenderer.js
// ─────────────────────────
// Dessine le SOL (relief) : pour chaque partie, un corps de terre (dégradé +
// strates discrètes), une bande d'herbe le long du sommet, et un liseré sombre
// de contour pour bien le détacher. Plus la PARTIE EN COURS de tracé (aperçu
// avec ses sommets), pendant l'utilisation de l'outil Sol.
//
// Dessiné dans le contexte DÉJÀ transformé par la vue. Coordonnées en "pixels de
// base" (monde × PIXELS_PER_METER). LECTURE SEULE.

import { partTopWorld, TERRAIN_FILL_DEPTH } from "../model/terrain.js";
import { gridToWorld } from "../model/mesh.js";
import { worldToBasePixels } from "./displayTransform.js";
import {
  PIXELS_PER_METER,
  TERRAIN_SOIL_TOP, TERRAIN_SOIL_BOTTOM, TERRAIN_GRASS_COLOR, TERRAIN_GRASS_DARK,
  TERRAIN_GRASS_THICKNESS_M, TERRAIN_EDGE_COLOR, TERRAIN_STRATA_COLOR,
  GRID_HOVER_COLOR, GRID_HOVER_RING,
} from "./styleConfig.js";

const ppm = PIXELS_PER_METER;
const BOTTOM_PX = TERRAIN_FILL_DEPTH * ppm;

export function drawTerrain(ctx, structure) {
  const terrain = structure.terrain;
  if (!terrain) return;
  for (const part of terrain) drawPart(ctx, part);
}

function drawPart(ctx, part) {
  const topWorld = partTopWorld(part);
  if (topWorld.length < 2) return;
  const top = topWorld.map(worldToBasePixels);
  const grassPx = TERRAIN_GRASS_THICKNESS_M * ppm;

  // Silhouette pleine : sommet (G→D) puis descente jusqu'au bas hors écran.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (let k = 1; k < top.length; k++) ctx.lineTo(top[k].x, top[k].y);
  ctx.lineTo(top[top.length - 1].x, BOTTOM_PX);
  ctx.lineTo(top[0].x, BOTTOM_PX);
  ctx.closePath();

  // Terre : dégradé vertical du sommet vers la profondeur.
  const gy0 = Math.min(...top.map((p) => p.y));
  const grad = ctx.createLinearGradient(0, gy0, 0, gy0 + 14 * ppm);
  grad.addColorStop(0, TERRAIN_SOIL_TOP);
  grad.addColorStop(1, TERRAIN_SOIL_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fill();

  // Strates discrètes (suivent la forme du sommet, décalées en profondeur).
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = TERRAIN_STRATA_COLOR;
  ctx.lineWidth = 1.4;
  for (let s = 1; s <= 3; s++) {
    const dy = (1.6 + s * 2.1) * ppm;
    ctx.beginPath();
    for (let k = 0; k < top.length; k++) {
      const x = top[k].x;
      const y = top[k].y + dy + Math.sin(k * 1.3 + s) * 3;
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Bande d'herbe : ruban entre le sommet et une ligne décalée vers le bas.
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (let k = 1; k < top.length; k++) ctx.lineTo(top[k].x, top[k].y);
  for (let k = top.length - 1; k >= 0; k--) ctx.lineTo(top[k].x, top[k].y + grassPx);
  ctx.closePath();
  ctx.fillStyle = TERRAIN_GRASS_COLOR;
  ctx.fill();

  // Ombre sous l'herbe (séparation herbe / terre).
  ctx.beginPath();
  for (let k = 0; k < top.length; k++) {
    const x = top[k].x;
    const y = top[k].y + grassPx;
    k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = TERRAIN_GRASS_DARK;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Liseré sombre du contour (sommet + flancs verticaux).
  ctx.beginPath();
  ctx.moveTo(top[0].x, BOTTOM_PX);
  ctx.lineTo(top[0].x, top[0].y);
  for (let k = 1; k < top.length; k++) ctx.lineTo(top[k].x, top[k].y);
  ctx.lineTo(top[top.length - 1].x, BOTTOM_PX);
  ctx.strokeStyle = TERRAIN_EDGE_COLOR;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  ctx.restore();
}

// Aperçu de la partie de sol EN COURS de tracé (outil Sol) : ligne de sommet en
// pointillé + sommets cliqués, pour voir la colline avant de la valider.
export function drawTerrainPreview(ctx, pendingTerrain) {
  if (!pendingTerrain || pendingTerrain.length === 0) return;
  const pts = pendingTerrain.map((g) => worldToBasePixels(gridToWorld(g.i, g.j)));

  ctx.save();
  if (pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.strokeStyle = TERRAIN_GRASS_DARK;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = GRID_HOVER_COLOR;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = GRID_HOVER_RING;
    ctx.stroke();
  }
  ctx.restore();
}
