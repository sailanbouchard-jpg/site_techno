// render/textures.js
// ──────────────────
// Bruits et TEXTURES PROCÉDURALES du décor, calculés une seule fois au premier
// besoin puis gardés en mémoire : roche du relief, béton, couche de nuages,
// profils de crêtes. Aucune image n'est chargée : tout sort d'un bruit de valeur
// lissé (value noise) sommé sur plusieurs octaves (fBm).
//
// Les tuiles de ROCHE et de BÉTON se répètent sans couture (bruit périodique) :
// elles servent de motif (createPattern) pour le sol, les poutres en béton et les
// piles d'appui. Aucun état de l'application n'est lu ici.

import {
  ROCK_LIGHT, ROCK_DARK, CONCRETE_LIGHT, CONCRETE_DARK,
  CLOUD_LIT, CLOUD_SHADE, CLOUD_OPACITY,
} from "./styleConfig.js";

// ── Bruit ────────────────────────────────────────────────────────────────────

function hash(ix, iy, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Valeur pseudo-aléatoire stable dans [0, 1[ pour un entier (et une graine) :
// sert à placer des détails déterministes (brins d'herbe, stries sur l'eau).
export function hash1(i, seed = 0) {
  return hash(i, 0x5bd1e995, seed);
}

function wrap(i, period) {
  if (!period) return i;
  const m = i % period;
  return m < 0 ? m + period : m;
}

// Bruit de valeur lissé en (x, y). Périodique si px / py (en cellules) sont donnés.
export function valueNoise(x, y, seed, px = 0, py = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const xa = wrap(x0, px);
  const xb = wrap(x0 + 1, px);
  const ya = wrap(y0, py);
  const yb = wrap(y0 + 1, py);
  const a = hash(xa, ya, seed);
  const b = hash(xb, ya, seed);
  const c = hash(xa, yb, seed);
  const d = hash(xb, yb, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Somme d'octaves (chaque octave : fréquence ×2, amplitude ÷2), normalisée dans [0, 1].
export function fbm(x, y, octaves, seed, px = 0, py = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f, y * f, seed + o * 1013, px * f, py * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// Profil de crête dans [0, 1] : mélange d'un bruit doux et d'un bruit « à arêtes »
// (1 − |2n − 1|), qui donne des sommets plus vifs, comme de vraies montagnes.
export function ridgeProfile(u, seed) {
  const n = fbm(u, 0.37, 5, seed);
  const ridged = 1 - Math.abs(2 * n - 1);
  return 0.6 * n + 0.4 * ridged;
}

export function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ── Tuile de roche ───────────────────────────────────────────────────────────
// Calcaire clair : grandes taches douces, litage horizontal fin, grain léger.
// Contraste volontairement faible : une matière, pas une surface sale.

const ROCK_TILE_SIZE = 256;
let rockTile = null;

export function getRockTile() {
  if (!rockTile) rockTile = buildRockTile();
  return rockTile;
}

function buildRockTile() {
  const n = ROCK_TILE_SIZE;
  const [dr, dg, db] = hexToRgb(ROCK_DARK);
  const [lr, lg, lb] = hexToRgb(ROCK_LIGHT);
  return paintTile(n, (x, y) => {
    const u = x / n;
    const v = y / n;
    const mottle = fbm(u * 3, v * 3, 4, 11, 3, 3);
    const bedding = fbm(u * 2, v * 20, 3, 29, 2, 20);
    const grain = valueNoise(u * 80, v * 80, 47, 80, 80);
    const t = Math.max(0, Math.min(1, (0.55 * mottle + 0.3 * bedding + 0.15 * grain - 0.25) * 2.1));
    return [dr + (lr - dr) * t, dg + (lg - dg) * t, db + (lb - db) * t];
  });
}

// ── Tuile de béton ───────────────────────────────────────────────────────────
// Gris clair légèrement nuagé, grain serré, rares bulles d'air (pores sombres).

const CONCRETE_TILE_SIZE = 128;
let concreteTile = null;

export function getConcreteTile() {
  if (!concreteTile) concreteTile = buildConcreteTile();
  return concreteTile;
}

function buildConcreteTile() {
  const n = CONCRETE_TILE_SIZE;
  const [dr, dg, db] = hexToRgb(CONCRETE_DARK);
  const [lr, lg, lb] = hexToRgb(CONCRETE_LIGHT);
  return paintTile(n, (x, y) => {
    const u = x / n;
    const v = y / n;
    let t = 0.55
      + 0.5 * (fbm(u * 5, v * 5, 3, 5, 5, 5) - 0.5)
      + 0.3 * (valueNoise(u * 48, v * 48, 9, 48, 48) - 0.5)
      + 0.22 * (hash(x, y, 13) - 0.5);
    if (hash(x, y, 17) > 0.992) t -= 0.35; // pores
    t = Math.max(0, Math.min(1, t));
    return [dr + (lr - dr) * t, dg + (lg - dg) * t, db + (lb - db) * t];
  });
}

// Remplit une tuile carrée n×n pixel par pixel (couleur renvoyée par `shade`).
function paintTile(n, shade) {
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(n, n);
  const data = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [r, g, b] = shade(x, y);
      const k = (y * n + x) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ── Couche de nuages ─────────────────────────────────────────────────────────
// Bancs de nuages plats et effilochés (bruit étiré en largeur et déformé),
// éclairés par le haut : le dessous d'un nuage est plus gris que son sommet.
// Ciel dégagé tout en haut, voile qui s'amincit vers l'horizon.

export const CLOUD_TEXTURE_WIDTH = 640;
export const CLOUD_TEXTURE_HEIGHT = 120;
let cloudLayer = null;

export function getCloudLayer() {
  if (!cloudLayer) cloudLayer = buildCloudLayer();
  return cloudLayer;
}

function buildCloudLayer() {
  const w = CLOUD_TEXTURE_WIDTH;
  const h = CLOUD_TEXTURE_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const lit = hexToRgb(CLOUD_LIT);
  const shade = hexToRgb(CLOUD_SHADE);

  for (let y = 0; y < h; y++) {
    const t = y / h; // 0 = haut du ciel, 1 = vers l'horizon
    const band = Math.sin(Math.PI * Math.min(1, t * 1.1));
    const threshold = 0.6 - 0.09 * band;
    const fade = smoothstep(0, 0.2, t) * (1 - smoothstep(0.72, 1, t));
    for (let x = 0; x < w; x++) {
      const nx = x / 120;
      const ny = y / 30;
      const wx = nx + 0.9 * (fbm(nx * 0.45, ny * 0.45, 3, 101) - 0.5);
      const wy = ny + 0.5 * (fbm(nx * 0.45 + 7.3, ny * 0.45 + 2.1, 3, 131) - 0.5);
      const density = fbm(wx, wy, 5, 157);
      const cover = smoothstep(threshold, threshold + 0.14, density) * fade;
      const k = (y * w + x) * 4;
      if (cover <= 0.004) {
        data[k + 3] = 0;
        continue;
      }
      // Densité plus forte juste AU-DESSUS : on est sous le nuage → ombre.
      const above = fbm(wx, wy - 0.2, 5, 157);
      const light = Math.max(0, Math.min(1, 0.7 + (density - above) * 3 - (density - threshold) * 0.8));
      data[k] = shade[0] + (lit[0] - shade[0]) * light;
      data[k + 1] = shade[1] + (lit[1] - shade[1]) * light;
      data[k + 2] = shade[2] + (lit[2] - shade[2]) * light;
      data[k + 3] = 255 * cover * CLOUD_OPACITY;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
