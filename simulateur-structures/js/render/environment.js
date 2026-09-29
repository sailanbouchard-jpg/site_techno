// render/environment.js
// ─────────────────────
// Le DÉCOR derrière la structure, du plus lointain au plus proche :
//   1. le ciel : dégradé atmosphérique (zénith bleu → horizon voilé) et une
//      couche de nuages procédurale (textures.js) ;
//   2. trois plans de relief lointain (montagnes, collines, versants boisés),
//      de plus en plus sombres et nets : c'est la perspective atmosphérique. Ils
//      défilent et grossissent moins vite que le premier plan (parallaxe) ;
//   3. la rivière au fond de la gorge, à une altitude fixe du monde.
// Le sol des niveaux est dessiné devant, par terrainRenderer.js.
//
// Tout est tracé en pixels ÉCRAN (CSS) : c'est un décor, il ne lit rien de la
// structure et ne fait aucun calcul physique.

import { MESH } from "../model/mesh.js";
import { getViewTranslation } from "./displayTransform.js";
import {
  getCloudLayer, CLOUD_TEXTURE_WIDTH, CLOUD_TEXTURE_HEIGHT, ridgeProfile, valueNoise, hash1,
} from "./textures.js";
import {
  PIXELS_PER_METER, TRANSPARENT,
  SKY_ZENITH, SKY_UPPER, SKY_LOWER, SKY_HAZE, CLOUD_PARALLAX,
  BACKDROP_LAYERS,
  WATER_LEVEL_M, WATER_SURFACE, WATER_MID, WATER_DEEP, WATER_GRADIENT_DEPTH_M,
  WATER_REFLECTION, WATER_REFLECTION_ALPHA, WATER_REFLECTION_DEPTH_M, WATER_LINE, WATER_STREAK,
} from "./styleConfig.js";

const ppm = PIXELS_PER_METER;
const RIDGE_SAMPLE_PX = 3; // pas d'échantillonnage des crêtes à l'écran
const CLOUD_MIN_WIDTH_PX = 1200; // largeur de référence de la couche de nuages
const CLOUD_OVERSCAN = 1.35; // marge pour la parallaxe
const WATER_STREAK_CELL_M = 0.8;
const WATER_STREAK_ROWS = 10;

export function drawEnvironment(ctx, view) {
  const far = layerFrame(view, BACKDROP_LAYERS[0].depth);
  const horizonY = far.toY(BACKDROP_LAYERS[0].horizon);
  drawSky(ctx, view, horizonY);
  drawClouds(ctx, view, horizonY);
  for (const layer of BACKDROP_LAYERS) drawBackdropLayer(ctx, view, layer);
  drawWater(ctx, view);
}

// Point visé par la vue de départ (centre de la grille) : à cette position de
// caméra, chaque plan est à sa place « de référence ».
function referenceCenter() {
  return {
    x: MESH.originX + (MESH.cols * MESH.spacing) / 2,
    y: MESH.originY + (MESH.rows * MESH.spacing) / 2,
  };
}

// Placement écran d'un plan de profondeur `depth` (0 = figé, 1 = premier plan) :
// il ne suit qu'une part du déplacement et du zoom de la vue.
function layerFrame(view, depth) {
  const ref = referenceCenter();
  const scale = ppm * Math.pow(view.zoomLevel, depth);
  const camX = ref.x + (view.cameraX - ref.x) * depth;
  const camY = ref.y + (view.cameraY - ref.y) * depth;
  const cx = view.canvasWidth / 2;
  const cy = view.canvasHeight / 2;
  return {
    toY: (v) => cy + (v - camY) * scale,
    fromX: (x) => camX + (x - cx) / scale,
  };
}

function drawSky(ctx, view, horizonY) {
  const w = view.canvasWidth;
  const h = view.canvasHeight;
  ctx.fillStyle = SKY_HAZE;
  ctx.fillRect(0, 0, w, h);
  if (horizonY <= 0) return;
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, SKY_ZENITH);
  g.addColorStop(0.42, SKY_UPPER);
  g.addColorStop(0.8, SKY_LOWER);
  g.addColorStop(1, SKY_HAZE);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, Math.min(h, horizonY));
}

function drawClouds(ctx, view, horizonY) {
  const w = view.canvasWidth;
  const cloudWidth = Math.max(w, CLOUD_MIN_WIDTH_PX) * CLOUD_OVERSCAN;
  const scale = cloudWidth / CLOUD_TEXTURE_WIDTH;
  const cloudHeight = CLOUD_TEXTURE_HEIGHT * scale;
  const bottom = horizonY - 0.04 * view.canvasHeight;
  const slack = (cloudWidth - w) / 2;
  const drift = (view.cameraX - referenceCenter().x) * ppm * CLOUD_PARALLAX;
  const x = -slack - Math.max(-slack, Math.min(slack, drift));
  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(getCloudLayer(), x, bottom - cloudHeight, cloudWidth, cloudHeight);
  ctx.restore();
}

// Un plan de relief : sa crête (bruit de crête + frange d'arbres), rempli jusqu'en
// bas de l'écran avec un dégradé vers la brume de vallée.
function drawBackdropLayer(ctx, view, layer) {
  const w = view.canvasWidth;
  const h = view.canvasHeight;
  const f = layerFrame(view, layer.depth);
  ctx.beginPath();
  ctx.moveTo(-RIDGE_SAMPLE_PX, h + 1);
  for (let x = -RIDGE_SAMPLE_PX; x <= w + RIDGE_SAMPLE_PX; x += RIDGE_SAMPLE_PX) {
    const u = f.fromX(x);
    let v = layer.horizon - layer.height * ridgeProfile(u / layer.period, layer.seed);
    if (layer.canopy) v -= layer.canopy * valueNoise(u / 0.55, 0.5, layer.seed + 5);
    ctx.lineTo(x, f.toY(v));
  }
  ctx.lineTo(w + RIDGE_SAMPLE_PX, h + 1);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, f.toY(layer.horizon - layer.height), 0, f.toY(layer.horizon + 1));
  g.addColorStop(0, layer.top);
  g.addColorStop(1, layer.base);
  ctx.fillStyle = g;
  ctx.fill();
}

// Rivière : surface qui reflète le ciel voilé, eau plus sombre en profondeur,
// reflet des versants juste sous la ligne d'eau et fines stries de lumière.
// Les stries sont ancrées dans le MONDE (elles suivent la vue quand on la déplace).
function drawWater(ctx, view) {
  const w = view.canvasWidth;
  const h = view.canvasHeight;
  const z = view.zoomLevel;
  const t = getViewTranslation(view);
  const y0 = Math.round(t.y + WATER_LEVEL_M * ppm * z);
  if (y0 >= h) return;
  const mPx = ppm * z; // pixels écran par mètre

  const g = ctx.createLinearGradient(0, y0, 0, y0 + WATER_GRADIENT_DEPTH_M * mPx);
  g.addColorStop(0, WATER_SURFACE);
  g.addColorStop(0.16, WATER_MID);
  g.addColorStop(1, WATER_DEEP);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, h - y0);

  ctx.save();
  const r = ctx.createLinearGradient(0, y0, 0, y0 + WATER_REFLECTION_DEPTH_M * mPx);
  r.addColorStop(0, WATER_REFLECTION);
  r.addColorStop(1, TRANSPARENT);
  ctx.globalAlpha = WATER_REFLECTION_ALPHA;
  ctx.fillStyle = r;
  ctx.fillRect(0, y0, w, WATER_REFLECTION_DEPTH_M * mPx);

  // Stries : rangées de plus en plus espacées vers le bas (la surface se
  // rapproche de l'observateur), plus marquées près de la ligne d'eau.
  ctx.fillStyle = WATER_STREAK;
  const xMin = (0 - t.x) / mPx;
  const xMax = (w - t.x) / mPx;
  const cellMin = Math.floor(xMin / WATER_STREAK_CELL_M) - 3;
  const cellMax = Math.ceil(xMax / WATER_STREAK_CELL_M);
  for (let row = 0; row < WATER_STREAK_ROWS; row++) {
    const depth = 0.14 + row * 0.3 + row * row * 0.035;
    const y = Math.round(y0 + depth * mPx);
    if (y >= h) break;
    ctx.globalAlpha = 0.17 * (1 - row / (WATER_STREAK_ROWS + 2));
    for (let cell = cellMin; cell <= cellMax; cell++) {
      if (hash1(cell, row * 7 + 1) > 0.38) continue;
      const x = (cell + hash1(cell, row * 7 + 2)) * WATER_STREAK_CELL_M;
      const len = (0.25 + 1.5 * hash1(cell, row * 7 + 3)) * (1 + row * 0.12);
      ctx.fillRect(Math.round(t.x + x * mPx), y, Math.max(1, len * mPx), 1);
    }
  }
  ctx.restore();

  ctx.fillStyle = WATER_LINE;
  ctx.fillRect(0, y0, w, 1);
}
