// render/memberRenderer.js
// ────────────────────────
// Dessin RÉALISTE des éléments de structure : poutres (bois, acier, béton,
// route, câble), goussets d'assemblage et appuis. Partagé par le
// rendu de la scène (renderer.js) et par les vignettes de la barre des éléments
// (ui/materialPalette.js) : la vignette montre exactement la poutre posée.
//
// Une poutre est une POLYLIGNE (ses nœuds internes suivent la flexion), tracée
// en plusieurs passes parallèles : cerne sombre, face du matériau, puis détails
// propres au matériau (ailes d'un profilé acier, fil du bois, grain du béton,
// enrobé de la route) sous un éclairage venu du haut — arête claire dessus,
// arête d'ombre dessous. Coordonnées en pixels de base. LECTURE SEULE.

import { worldToBasePixels } from "./displayTransform.js";
import { drawAnchorSymbol, clamp } from "./canvasUtils.js";
import { getConcreteTile } from "./textures.js";
import { groundSurfaceYAt } from "../model/terrain.js";
import {
  PIXELS_PER_METER,
  BEAM_WIDTH_BASE_PX, BEAM_WIDTH_PX_PER_METER_THICKNESS, BEAM_WIDTH_MIN_PX, BEAM_WIDTH_MAX_PX,
  MEMBER_EDGE_FRACTION, MEMBER_EDGE_MIN_PX, MEMBER_LOOKS, MEMBER_FALLBACK_LOOK,
  OVERLOAD_COLOR, OVERLOAD_START_UTIL, OVERLOAD_MAX_ALPHA, BROKEN_COLOR, BROKEN_ALPHA,
  CABLE_WIDTH_PX, CABLE_STRAND_SPACING_PX, CABLE_STRAND_SLANT, CABLE_STRAND_ALPHA,
  GUSSET_PLATE, GUSSET_EDGE, GUSSET_REACH_FACTOR, GUSSET_REACH_EXTRA_PX, GUSSET_MARGIN_PX,
  SUPPORT_MAX_HEIGHT_M, SUPPORT_PIER_WIDTH_M, SUPPORT_CAP_WIDTH_M, SUPPORT_CAP_HEIGHT_M,
  SUPPORT_BEARING_HEIGHT_M, SUPPORT_EMBED_M, SUPPORT_FOOTING_WIDTH_M, SUPPORT_FOOTING_HEIGHT_M,
  SUPPORT_CLAMP_WIDTH_M, SUPPORT_CLAMP_ABOVE_M, SUPPORT_EDGE, SUPPORT_SIDE_LIGHT, SUPPORT_SIDE_SHADE,
  BEARING_COLOR, BEARING_EDGE, ANCHOR_SYMBOL_COLOR,
} from "./styleConfig.js";

const ppm = PIXELS_PER_METER;
const TAU = Math.PI * 2;

// ── Largeurs ─────────────────────────────────────────────────────────────────

// Largeur à l'écran (pixels de base) d'une poutre d'épaisseur donnée : grandit
// avec l'épaisseur réelle, bornée pour rester lisible.
export function memberWidth(sectionArea) {
  return clamp(BEAM_WIDTH_BASE_PX + sectionArea * BEAM_WIDTH_PX_PER_METER_THICKNESS, BEAM_WIDTH_MIN_PX, BEAM_WIDTH_MAX_PX);
}

// `member` : une poutre, ou tout objet { materialId, sectionArea, isCable, id }.
export function drawnWidth(member) {
  return member.isCable ? CABLE_WIDTH_PX : memberWidth(member.sectionArea);
}

export function edgeWidth(width) {
  return Math.max(MEMBER_EDGE_MIN_PX, width * MEMBER_EDGE_FRACTION);
}

// ── Géométrie ────────────────────────────────────────────────────────────────

// Normale « vers le haut » en chaque sommet (même sens tout le long, choisi sur
// la corde) : sert à décaler les passes parallèles. Pour une poutre verticale,
// « le haut » est à gauche (lumière venue du haut à gauche).
export function upNormals(pts) {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const cl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cnx = (b.y - a.y) / cl;
  const cny = -(b.x - a.x) / cl;
  const sign = cny < -1e-6 || (Math.abs(cny) <= 1e-6 && cnx < 0) ? 1 : -1;
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const p0 = pts[Math.max(0, k - 1)];
    const p1 = pts[Math.min(pts.length - 1, k + 1)];
    const l = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
    out.push({ x: ((p1.y - p0.y) / l) * sign, y: (-(p1.x - p0.x) / l) * sign });
  }
  return out;
}

// Trace la polyligne décalée de `offset` le long des normales.
function strokeAlong(ctx, pts, ns, offset, width, style, alpha) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.beginPath();
  for (let k = 0; k < pts.length; k++) {
    const x = ns ? pts[k].x + ns[k].x * offset : pts[k].x;
    const y = ns ? pts[k].y + ns[k].y * offset : pts[k].y;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function seedFrom(id) {
  let h = 7;
  for (const c of String(id)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h;
}

function rand(seed, k) {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const concretePatterns = new WeakMap();
function concretePattern(ctx) {
  let pattern = concretePatterns.get(ctx);
  if (!pattern) {
    pattern = ctx.createPattern(getConcreteTile(), "repeat");
    concretePatterns.set(ctx, pattern);
  }
  return pattern;
}

export function lookFor(materialId) {
  return MEMBER_LOOKS[materialId] || MEMBER_FALLBACK_LOOK;
}

// ── Poutres ──────────────────────────────────────────────────────────────────

// options : util (taux de travail → voile d'alerte), broken, alpha (aperçu).
export function drawMember(ctx, pts, member, options = {}) {
  if (pts.length < 2) return;
  const base = options.alpha === undefined ? 1 : options.alpha;
  const width = drawnWidth(member);
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  if (member.isCable) drawCableBody(ctx, pts, base);
  else drawSolidBody(ctx, pts, member, width, base);

  const util = options.util || 0;
  if (util > OVERLOAD_START_UTIL) {
    const t = Math.min(1, (util - OVERLOAD_START_UTIL) / (1 - OVERLOAD_START_UTIL));
    strokeAlong(ctx, pts, null, 0, width, OVERLOAD_COLOR, base * t * OVERLOAD_MAX_ALPHA);
  }
  if (options.broken) strokeAlong(ctx, pts, null, 0, width + 2 * edgeWidth(width), BROKEN_COLOR, base * BROKEN_ALPHA);
  ctx.restore();
}

function drawSolidBody(ctx, pts, member, w, base) {
  const look = lookFor(member.materialId);
  const ns = upNormals(pts);
  strokeAlong(ctx, pts, null, 0, w + 2 * edgeWidth(w), look.edge, base);
  strokeAlong(ctx, pts, null, 0, w, member.materialId === "concrete" ? concretePattern(ctx) : look.body, base);

  if (member.materialId === "steel") return steelDetails(ctx, pts, ns, w, look, base);
  if (member.materialId === "road") return roadDetails(ctx, pts, ns, w, look, base);
  lighting(ctx, pts, ns, w, look, base);
  if (member.materialId === "wood") woodGrain(ctx, pts, ns, w, look, base, seedFrom(member.id));
}

function lighting(ctx, pts, ns, w, look, base) {
  const band = Math.max(0.7, w * 0.16);
  strokeAlong(ctx, pts, ns, w / 2 - band / 2, band, look.light, base * 0.5);
  strokeAlong(ctx, pts, ns, -(w / 2 - band / 2), band, look.shadow, base * 0.6);
}

// Profilé en I vu de côté : les deux ailes, plus proches, captent la lumière ;
// l'aile haute jette une ombre fine sur l'âme.
function steelDetails(ctx, pts, ns, w, look, base) {
  if (w < 5.5) {
    strokeAlong(ctx, pts, ns, w * 0.2, w * 0.3, look.light, base * 0.5);
    return;
  }
  const tf = Math.max(1, w * 0.22);
  strokeAlong(ctx, pts, ns, w / 2 - tf / 2, tf, look.detail, base);
  strokeAlong(ctx, pts, ns, -(w / 2 - tf / 2), tf, look.detail, base * 0.8);
  strokeAlong(ctx, pts, ns, w / 2 - tf - 0.35, 0.7, look.shadow, base * 0.9);
  strokeAlong(ctx, pts, ns, w / 2 - 0.4, 0.8, look.light, base * 0.85);
  strokeAlong(ctx, pts, ns, -(w / 2 - 0.4), 0.8, look.shadow, base * 0.8);
}

// Fil du bois : quelques veines sombres interrompues, propres à chaque poutre.
function woodGrain(ctx, pts, ns, w, look, base, seed) {
  if (w < 5) return;
  const offsets = [-0.3, -0.05, 0.2];
  offsets.forEach((f, k) => {
    ctx.setLineDash([
      8 + 16 * rand(seed, k * 5), 2 + 4 * rand(seed, k * 5 + 1),
      3 + 10 * rand(seed, k * 5 + 2), 1.5 + 3 * rand(seed, k * 5 + 3),
    ]);
    ctx.lineDashOffset = 40 * rand(seed, k * 5 + 4);
    strokeAlong(ctx, pts, ns, w * f, Math.max(0.45, w * 0.055), look.detail, base * 0.45);
  });
  ctx.setLineDash([]);
}

// Tablier : dalle claire surmontée de sa couche d'enrobé sombre.
function roadDetails(ctx, pts, ns, w, look, base) {
  const asphalt = Math.max(1.2, w * 0.3);
  const band = Math.max(0.7, w * 0.14);
  strokeAlong(ctx, pts, ns, w / 2 - asphalt / 2, asphalt, look.asphalt, base);
  strokeAlong(ctx, pts, ns, w / 2 - asphalt - 0.5, 1, look.light, base * 0.55);
  strokeAlong(ctx, pts, ns, -(w / 2 - band / 2), band, look.shadow, base * 0.6);
}

// Câble toronné : âme sombre parcourue de courts torons clairs en biais.
function drawCableBody(ctx, pts, base) {
  const look = MEMBER_LOOKS.cable;
  ctx.lineCap = "round";
  strokeAlong(ctx, pts, null, 0, CABLE_WIDTH_PX + 0.8, look.edge, base);
  strokeAlong(ctx, pts, null, 0, CABLE_WIDTH_PX, look.body, base);

  ctx.globalAlpha = base * CABLE_STRAND_ALPHA;
  ctx.strokeStyle = look.light;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  const h = CABLE_WIDTH_PX * 0.45;
  let acc = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let tx = -uy + ux * CABLE_STRAND_SLANT;
    let ty = ux + uy * CABLE_STRAND_SLANT;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    for (let d = CABLE_STRAND_SPACING_PX - (acc % CABLE_STRAND_SPACING_PX); d < len; d += CABLE_STRAND_SPACING_PX) {
      const cx = a.x + ux * d;
      const cy = a.y + uy * d;
      ctx.moveTo(cx - tx * h, cy - ty * h);
      ctx.lineTo(cx + tx * h, cy + ty * h);
    }
    acc += len;
  }
  ctx.stroke();
}

// ── Goussets d'assemblage ────────────────────────────────────────────────────
// Tôle plate tendue entre les poutres qui se rejoignent, dessinée AVANT elles :
// on ne la voit que dans les angles entre les barres, comme sur un vrai
// treillis. Sa forme est l'enveloppe convexe de points pris sur chaque barre, à
// une distance proportionnelle à la plus grosse poutre du nœud.
// `arms` : [{ ux, uy, width }] — direction (unitaire) de chaque poutre depuis le
// nœud, et sa largeur. Rien à dessiner pour une extrémité libre ou pour des
// poutres simplement alignées (éclisse cachée derrière elles).
export function drawGussetPlate(ctx, x, y, arms) {
  if (arms.length < 2) return;
  const aligned = arms.every((a) => Math.abs(a.ux * arms[0].uy - a.uy * arms[0].ux) < 0.05);
  if (aligned) return;
  const widest = Math.max(...arms.map((a) => a.width));
  const reach = widest * GUSSET_REACH_FACTOR + GUSSET_REACH_EXTRA_PX;
  const pts = [];
  for (const a of arms) {
    const half = a.width / 2 + GUSSET_MARGIN_PX;
    const ex = x + a.ux * reach;
    const ey = y + a.uy * reach;
    pts.push({ x: ex - a.uy * half, y: ey + a.ux * half }, { x: ex + a.uy * half, y: ey - a.ux * half });
  }
  const hull = convexHull(pts);
  ctx.save();
  ctx.beginPath();
  hull.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = GUSSET_PLATE;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = GUSSET_EDGE;
  ctx.stroke();
  ctx.restore();
}

// Enveloppe convexe (algorithme de la chaîne monotone).
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// ── Appuis ───────────────────────────────────────────────────────────────────

// Surface du sol sous un appui (pixels de base), ou null si l'appui est dans le
// vide (trop loin du sol) : on dessine alors le symbole normalisé.
function groundUnder(structure, node) {
  const surface = groundSurfaceYAt(structure, node.x);
  if (!Number.isFinite(surface)) return null;
  const gap = surface - node.y;
  if (gap < -0.3 || gap > SUPPORT_MAX_HEIGHT_M) return null;
  return Math.max(surface, node.y) * ppm;
}

// Partie de l'appui dessinée SOUS les poutres : pile en béton (ou semelle posée
// au sol) et sabot d'acier pour un pivot ; symbole normalisé dans le vide.
export function drawSupportBase(ctx, structure, node) {
  const p = worldToBasePixels(node);
  const ground = groundUnder(structure, node);
  if (ground === null) {
    ctx.save();
    drawAnchorSymbol(ctx, p.x, p.y, ANCHOR_SYMBOL_COLOR, node.clamped === true);
    ctx.restore();
    return;
  }
  if (node.clamped) return; // massif d'encastrement : dessiné par-dessus les poutres

  const capH = SUPPORT_CAP_HEIGHT_M * ppm;
  let seat = p.y + SUPPORT_BEARING_HEIGHT_M * ppm;
  if (ground - seat > capH) {
    const pierW = SUPPORT_PIER_WIDTH_M * ppm;
    concreteBox(ctx, p.x - pierW / 2, seat + capH, pierW, ground + SUPPORT_EMBED_M * ppm - seat - capH);
    concreteBox(ctx, p.x - (SUPPORT_CAP_WIDTH_M * ppm) / 2, seat, SUPPORT_CAP_WIDTH_M * ppm, capH);
  } else {
    const footW = SUPPORT_FOOTING_WIDTH_M * ppm;
    const footH = SUPPORT_FOOTING_HEIGHT_M * ppm;
    seat = Math.max(p.y + 3, Math.min(seat, ground - footH * 0.45));
    concreteBox(ctx, p.x - footW / 2, seat, footW, footH);
  }
  bearingShoe(ctx, p.x, p.y, seat);
}

// Massif d'encastrement, dessiné APRÈS les poutres : l'extrémité de la poutre
// disparaît dans le béton.
export function drawClampBlock(ctx, structure, node) {
  if (!node.clamped) return;
  const ground = groundUnder(structure, node);
  if (ground === null) return;
  const p = worldToBasePixels(node);
  const w = SUPPORT_CLAMP_WIDTH_M * ppm;
  const top = p.y - SUPPORT_CLAMP_ABOVE_M * ppm;
  const bottom = Math.max(ground + SUPPORT_EMBED_M * ppm, p.y + SUPPORT_CLAMP_ABOVE_M * ppm);
  concreteBox(ctx, p.x - w / 2, top, w, bottom - top);
}

function concreteBox(ctx, x, y, w, h) {
  if (h <= 0 || w <= 0) return;
  ctx.save();
  ctx.fillStyle = concretePattern(ctx);
  ctx.fillRect(x, y, w, h);
  const side = Math.min(w * 0.18, 4);
  ctx.fillStyle = SUPPORT_SIDE_LIGHT;
  ctx.fillRect(x, y, side, h);
  ctx.fillStyle = SUPPORT_SIDE_SHADE;
  ctx.fillRect(x + w - side, y, side, h);
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = SUPPORT_EDGE;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

// Sabot d'appareil d'appui : trapèze d'acier du nœud jusqu'à l'assise.
function bearingShoe(ctx, x, yNode, ySeat) {
  const topHalf = 0.13 * ppm;
  const bottomHalf = 0.3 * ppm;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - topHalf, yNode);
  ctx.lineTo(x + topHalf, yNode);
  ctx.lineTo(x + bottomHalf, ySeat);
  ctx.lineTo(x - bottomHalf, ySeat);
  ctx.closePath();
  ctx.fillStyle = BEARING_COLOR;
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = BEARING_EDGE;
  ctx.stroke();
  ctx.fillStyle = BEARING_EDGE;
  ctx.fillRect(x - bottomHalf - 0.08 * ppm, ySeat - 0.06 * ppm, 2 * bottomHalf + 0.16 * ppm, 0.06 * ppm);
  ctx.restore();
}
