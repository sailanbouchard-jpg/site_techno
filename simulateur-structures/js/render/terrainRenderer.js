// render/terrainRenderer.js
// ─────────────────────────
// Dessine le SOL des niveaux comme une coupe de terrain claire et nette :
//   - roche calcaire à la texture discrète (tuile procédurale de textures.js) ;
//   - couches géologiques HORIZONTALES, les mêmes de part et d'autre d'une gorge
//     (la rivière les a entaillées, comme dans la réalité) ;
//   - ombre douce le long des parois de falaise, léger assombrissement en profondeur ;
//   - herbe en liseré vert sur les replats (les pentes raides restent en roche nue).
// Un sol qui touche le bord de la grille est prolongé au-delà (décor seulement) :
// la vue dézoomée ne montre pas un bloc coupé net.
//
// Dessiné dans le contexte DÉJÀ transformé par la vue, en "pixels de base"
// (monde × PIXELS_PER_METER). LECTURE SEULE.

import { partTopWorld, natureDe, TERRAIN_FILL_DEPTH } from "../model/terrain.js";
import { gridToWorld, MESH } from "../model/mesh.js";
import { worldToBasePixels, screenToWorld } from "./displayTransform.js";
import { getRockTile, fbm, hash1, valueNoise, smoothstep } from "./textures.js";
import {
  PIXELS_PER_METER, ACCENT_COLOR, SNAP_FILL, TRANSPARENT,
  STRATA_TINTS, STRATA_BAND_ALPHA, STRATA_LINE_COLOR,
  TERRAIN_DEPTH_SHADE, TERRAIN_DEPTH_SHADE_M, CLIFF_SHADE, CLIFF_SHADE_M, CLIFF_EDGE, CLIFF_ROUGHNESS_M,
  GRASS_TOP, GRASS_BOTTOM, GRASS_HIGHLIGHT, GRASS_EDGE, GRASS_THICKNESS_M, GRASS_MAX_SLOPE,
  TERRAIN_EXTENSION_M,
} from "./styleConfig.js";

const ppm = PIXELS_PER_METER;
const BOTTOM_PX = TERRAIN_FILL_DEPTH * ppm;
const CLIFF_JAG_STEP_M = 0.35; // pas des irrégularités de paroi
const CLIFF_JAG_DEPTH_M = 14; // hauteur de paroi irrégulière (au-delà : droite, hors vue)
const STRATA_SAMPLE_M = 1; // pas d'échantillonnage des couches
const STRATA_WOBBLE_M = 0.22;

// Couches géologiques : frontières horizontales (m) tirées une fois pour toutes.
// La couche k va de la frontière k à la frontière k+1.
const STRATA = buildStrata();

function buildStrata() {
  const bands = [];
  let y = -20;
  for (let k = 0; y < TERRAIN_FILL_DEPTH; k++) {
    const thickness = 0.6 + 2.4 * hash1(k, 401);
    bands.push({
      y0: y,
      y1: y + thickness,
      k,
      tint: STRATA_TINTS[Math.floor(hash1(k, 402) * STRATA_TINTS.length)],
      alpha: STRATA_BAND_ALPHA * (0.35 + 0.65 * hash1(k, 403)),
    });
    y += thickness;
  }
  return bands;
}

function boundaryY(y, k, x) {
  return y + STRATA_WOBBLE_M * (fbm(x / 7, k * 0.37, 3, 409) - 0.5);
}

export function drawTerrain(ctx, structure, view) {
  const terrain = structure.terrain;
  if (!terrain || terrain.length === 0) return;
  const pattern = ctx.createPattern(getRockTile(), "repeat");
  const a = screenToWorld(0, 0, view);
  const b = screenToWorld(view.canvasWidth, view.canvasHeight, view);
  const visible = { x0: a.x, x1: b.x, y0: a.y, y1: b.y };
  terrain.forEach((part, index) => drawPart(ctx, part, index, pattern, visible));
}

function drawPart(ctx, part, index, pattern, visible) {
  const world = partTopWorld(part);
  if (world.length < 2) return;

  const gridLeft = MESH.originX;
  const gridRight = MESH.originX + MESH.cols * MESH.spacing;
  const leftCliff = world[0].x > gridLeft + 1e-6;
  const rightCliff = world[world.length - 1].x < gridRight - 1e-6;
  if (!leftCliff) world.unshift({ x: gridLeft - TERRAIN_EXTENSION_M, y: world[0].y });
  if (!rightCliff) world.push({ x: gridRight + TERRAIN_EXTENSION_M, y: world[world.length - 1].y });
  const top = world.map(worldToBasePixels);

  const first = top[0];
  const last = top[top.length - 1];
  const rightSide = rightCliff ? cliffSide(last, -1, index * 2 + 1) : [];
  const leftSide = leftCliff ? cliffSide(first, 1, index * 2) : [];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let k = 1; k < top.length; k++) ctx.lineTo(top[k].x, top[k].y);
  for (const p of rightSide) ctx.lineTo(p.x, p.y);
  ctx.lineTo(last.x, BOTTOM_PX);
  ctx.lineTo(first.x, BOTTOM_PX);
  for (let k = leftSide.length - 1; k >= 0; k--) ctx.lineTo(leftSide[k].x, leftSide[k].y);
  ctx.closePath();
  ctx.fillStyle = pattern;
  ctx.fill();
  ctx.clip();

  const yTopPx = Math.min(...top.map((p) => p.y));
  drawStrata(ctx, first.x / ppm, last.x / ppm, yTopPx / ppm, visible);

  const xFrom = Math.max(first.x, visible.x0 * ppm - 50);
  const xTo = Math.min(last.x, visible.x1 * ppm + 50);
  const shade = ctx.createLinearGradient(0, yTopPx, 0, yTopPx + TERRAIN_DEPTH_SHADE_M * ppm);
  shade.addColorStop(0, TRANSPARENT);
  shade.addColorStop(1, TERRAIN_DEPTH_SHADE);
  ctx.fillStyle = shade;
  ctx.fillRect(xFrom, yTopPx, xTo - xFrom, BOTTOM_PX - yTopPx);

  // Ombre de paroi : un trait large sur le bord, coupé par le clip, ne laisse
  // voir que sa moitié intérieure.
  ctx.lineJoin = "round";
  for (const side of [rightSide, leftSide]) {
    if (side.length === 0) continue;
    strokePolyline(ctx, side, CLIFF_SHADE_M * 2 * ppm, CLIFF_SHADE);
    strokePolyline(ctx, side, 1.2, CLIFF_EDGE);
  }
  ctx.restore();

  if (natureDe(part) === "herbe") drawGrass(ctx, top);
}

// Paroi de falaise irrégulière, du coin supérieur vers le bas. Les creux vont
// toujours VERS L'INTÉRIEUR du sol : la roche ne dépasse jamais le bord physique.
function cliffSide(corner, inward, seed) {
  const pts = [];
  for (let d = 0; d <= CLIFF_JAG_DEPTH_M + 1e-6; d += CLIFF_JAG_STEP_M) {
    const n = valueNoise(d / 0.55, 0.5, 900 + seed) * smoothstep(0, 0.6, d);
    pts.push({ x: corner.x + inward * CLIFF_ROUGHNESS_M * ppm * n, y: corner.y + d * ppm });
  }
  return pts;
}

function drawStrata(ctx, xLeft, xRight, yTop, visible) {
  const x0 = Math.max(xLeft, visible.x0) - STRATA_SAMPLE_M;
  const x1 = Math.min(xRight, visible.x1) + STRATA_SAMPLE_M;
  if (x1 <= x0) return;
  ctx.save();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = STRATA_LINE_COLOR;
  for (const band of STRATA) {
    if (band.y1 < yTop - STRATA_WOBBLE_M || band.y0 > visible.y1 + 1) continue;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1e-6; x += STRATA_SAMPLE_M) ctx.lineTo(x * ppm, boundaryY(band.y0, band.k, x) * ppm);
    for (let x = x1; x >= x0 - 1e-6; x -= STRATA_SAMPLE_M) ctx.lineTo(x * ppm, boundaryY(band.y1, band.k + 1, x) * ppm);
    ctx.closePath();
    ctx.globalAlpha = band.alpha;
    ctx.fillStyle = band.tint;
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1e-6; x += STRATA_SAMPLE_M) ctx.lineTo(x * ppm, boundaryY(band.y0, band.k, x) * ppm);
    ctx.stroke();
  }
  ctx.restore();
}

// Herbe : un liseré vert net SOUS la surface des replats (rien ne dépasse du
// sol), plus clair en haut, souligné d'un filet plus sombre.
function drawGrass(ctx, top) {
  const runs = [];
  let run = null;
  for (let k = 0; k < top.length - 1; k++) {
    const a = top[k];
    const b = top[k + 1];
    const gentle = b.x - a.x > 1e-6 && Math.abs((b.y - a.y) / (b.x - a.x)) <= GRASS_MAX_SLOPE;
    if (!gentle) { run = null; continue; }
    if (!run) { run = [a]; runs.push(run); }
    run.push(b);
  }
  if (runs.length === 0) return;

  const t = GRASS_THICKNESS_M * ppm;
  const shifted = (pts, dy) => pts.map((p) => ({ x: p.x, y: p.y + dy }));
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  for (const r of runs) {
    strokePolyline(ctx, shifted(r, t / 2), t, GRASS_BOTTOM);
    strokePolyline(ctx, shifted(r, t * 0.24), t * 0.48, GRASS_TOP);
    strokePolyline(ctx, shifted(r, 0.4), 0.8, GRASS_HIGHLIGHT);
    strokePolyline(ctx, shifted(r, t), 0.8, GRASS_EDGE);
  }
  ctx.restore();
}

function strokePolyline(ctx, pts, width, color) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// Aperçu de la partie de sol EN COURS de tracé (outil Sol, mode dev) : ligne de
// sommet en tirets d'accent + sommets cliqués. Tailles constantes à l'écran.
export function drawTerrainPreview(ctx, pendingTerrain, zoom) {
  if (!pendingTerrain || pendingTerrain.length === 0) return;
  const pts = pendingTerrain.map((g) => worldToBasePixels(gridToWorld(g.i, g.j)));
  ctx.save();
  if (pts.length >= 2) {
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    strokePolyline(ctx, pts, 1.6 / zoom, ACCENT_COLOR);
    ctx.setLineDash([]);
  }
  const s = 7 / zoom;
  for (const p of pts) {
    ctx.fillStyle = SNAP_FILL;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    ctx.lineWidth = 1.4 / zoom;
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.restore();
}
