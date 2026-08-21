// render/renderer.js
// ──────────────────
// Dessine l'état courant. LECTURE SEULE, aucune formule de mouvement.
//
// Ordre du décor → premier plan : CIEL (+ nuages) → QUADRILLAGE (blueprint) →
// SOL (relief) → poutres → assemblages → poids → véhicules → étiquettes d'effort
// → aperçus (tracé en cours). Les poutres sont tracées comme une polyligne
// passant par leurs nœuds internes : leur COURBURE de flexion reste donc
// directement visible. La couleur d'une poutre = celle de son MATÉRIAU, qui vire
// au rouge d'alerte à l'approche de la rupture (voir choix de design).

import { MODES } from "../state.js";
import { findNodeById, findBeamById, canAddBeam, clampBeamEnd, beamSegmentAtFraction } from "../model/Structure.js";
import { getMaterialById } from "../model/materials.js";
import { gridToWorld } from "../model/mesh.js";
import { drawAnchorSymbol, clamp } from "./canvasUtils.js";
import { worldToBasePixels, getViewTranslation } from "./displayTransform.js";
import { getStaticLayers } from "./backgroundCache.js";
import { drawHoverMarker } from "./grid.js";
import { drawTerrainPreview } from "./terrainRenderer.js";
import { drawVehicle } from "./vehicleRenderer.js";
import { drawWindParticles } from "./windRenderer.js";
import {
  NODE_RADIUS, JOINT_CORE_COLOR, JOINT_RING_COLOR, FIXED_NODE_COLOR,
  BEAM_WIDTH_BASE_PX, BEAM_WIDTH_PX_PER_METER_THICKNESS, BEAM_WIDTH_MIN_PX, BEAM_WIDTH_MAX_PX,
  ELEMENT_SELECTED_WIDTH_BONUS_PX,
  BEAM_EDGE_EXTRA_PX, BEAM_HILIGHT_FRACTION, BEAM_HILIGHT_MIN_PX,
  OVERLOAD_COLOR, OVERLOAD_START_UTIL, BROKEN_BEAM_COLOR,
  CABLE_CORE_COLOR, CABLE_STRAND_COLOR, CABLE_WIDTH_PX, CABLE_STRAND_SPACING_PX, CABLE_STRAND_SLANT,
  ROAD_INDICATOR_COLOR, ROAD_INDICATOR_WIDTH_PX, ROAD_INDICATOR_DASH_PATTERN,
  WEIGHT_COLOR, WEIGHT_TEXT_COLOR, WEIGHT_ICON_WIDTH_PX, WEIGHT_ICON_HEIGHT_PX,
  WEIGHT_HANG_GAP_PX, WEIGHT_REST_MARGIN_PX,
  SELECTION_COLOR, SELECTION_RING_MARGIN, SELECTION_RING_WIDTH, SELECTION_OUTLINE_WIDTH, SELECTION_OUTLINE_DASH,
  SELECTION_RECT_FILL, SELECTION_RECT_DASH,
  EFFORT_LABEL_FONT, EFFORT_LABEL_BG, EFFORT_LABEL_OFFSET_PX, EFFORT_LABEL_MIN_UTIL, EFFORT_LABEL_DANGER_COLOR,
} from "./styleConfig.js";

export function draw(ctx, canvas, state) {
  const view = {
    zoomLevel: state.zoomLevel, cameraX: state.cameraX, cameraY: state.cameraY,
    canvasWidth: canvas.width, canvasHeight: canvas.height,
  };

  // Décor : deux couches en CACHE hors écran (ciel+quadrillage, puis sol) —
  // voir backgroundCache.js. Les particules de vent, dynamiques, se dessinent
  // ENTRE les deux, comme dans l'ordre d'origine (le relief masque le vent).
  const layers = getStaticLayers(canvas, view, state.structure);
  ctx.drawImage(layers.back, 0, 0);

  const t = getViewTranslation(view);
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(view.zoomLevel, view.zoomLevel);
  drawWindParticles(ctx, state);
  ctx.restore();

  ctx.drawImage(layers.front, 0, 0);

  // Monde (zoom + déplacement appliqués).
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(view.zoomLevel, view.zoomLevel);

  // Les EFFORTS (couleur rouge d'alerte, % d'effort) ne sont calculés ET affichés
  // QU'EN SIMULATION. En édition : aucune info de charge, juste la couleur des
  // matériaux (l'utilisateur découvre le comportement au lancement du test).
  const simulating = state.mode === MODES.SIMULATION;

  for (const beam of state.structure.beams) drawBeam(ctx, state, beam, simulating);
  for (const node of state.structure.nodes) if (node.kind === "joint") drawJoint(ctx, state, node);
  for (const load of state.structure.loads) drawWeight(ctx, state, load);
  for (const vehicle of state.structure.mobileLoads) drawVehicle(ctx, vehicle, state.structure, isSel(state, "vehicle", vehicle.id));

  // Étiquettes de % d'effort : par-dessus le reste, en simulation, et seulement
  // si l'affichage des pourcentages est activé (bouton en haut à droite du canvas).
  if (simulating && state.showLoadPercents) {
    for (const beam of state.structure.beams) drawEffortLabel(ctx, state, beam);
  }

  // Aperçus de tracé en cours (sol, poutre) et marqueur d'accrochage.
  drawTerrainPreview(ctx, state.pendingTerrain);
  drawHoverMarker(ctx, state.hoverGrid, view);
  drawPreview(ctx, state);
  drawSelectionRect(ctx, state.selectionRect, view.zoomLevel);
  ctx.restore();
}

// Rectangle de SÉLECTION élastique en cours de tracé (px de base). Épaisseur et
// pointillés divisés par le zoom pour rester constants à l'écran.
function drawSelectionRect(ctx, rect, zoom) {
  if (!rect) return;
  const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
  ctx.save();
  ctx.fillStyle = SELECTION_RECT_FILL;
  ctx.fillRect(rect.x0, rect.y0, w, h);
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash(SELECTION_RECT_DASH.map((d) => d / zoom));
  ctx.strokeRect(rect.x0, rect.y0, w, h);
  ctx.restore();
}

function beamWidth(beam, selected) {
  const raw = BEAM_WIDTH_BASE_PX + beam.sectionArea * BEAM_WIDTH_PX_PER_METER_THICKNESS;
  return clamp(raw, BEAM_WIDTH_MIN_PX, BEAM_WIDTH_MAX_PX) + (selected ? ELEMENT_SELECTED_WIDTH_BONUS_PX : 0);
}

// Teinte de la poutre : couleur du matériau jusqu'à OVERLOAD_START_UTIL, puis
// fondu progressif vers le rouge d'alerte (rouge plein au taux de travail 1).
function overloadTint(base, util) {
  if (util <= OVERLOAD_START_UTIL) return base;
  const t = clamp((util - OVERLOAD_START_UTIL) / (1 - OVERLOAD_START_UTIL), 0, 1);
  return hexLerp(base, OVERLOAD_COLOR, t);
}

// Polyligne d'une poutre en pixels de base : calculée UNE fois par poutre et
// par image, puis réutilisée par toutes les passes de dessin (bord, corps,
// reflet, route, sélection) — avant, chaque passe la refaisait.
function beamPoints(structure, beam) {
  const pts = [];
  for (const id of beam.nodeIds) {
    const n = findNodeById(structure, id);
    if (n) pts.push(worldToBasePixels(n));
  }
  return pts;
}

function drawBeam(ctx, state, beam, simulating) {
  const selected = isSel(state, "beam", beam.id);
  // En simulation : taux de travail lu dans le CACHE rempli par le scan
  // d'efforts du moteur (beam._effort) — plus aucun recalcul par image.
  // En édition : aucune contrainte calculée (util = 0 → couleur du matériau pure).
  const util = simulating && beam._effort ? beam._effort.util : 0;
  const broken = simulating && beam.broken;

  const pts = beamPoints(state.structure, beam);
  if (pts.length < 2) return;

  // Câble : rendu dédié (fil toronné), pas de contour/reflet de barre.
  if (beam.isCable) { drawCable(ctx, state, beam, pts, selected, util, broken); return; }

  const material = getMaterialById(beam.materialId);
  const width = beamWidth(beam, selected);
  const base = material ? material.color : "#9aa0a6";
  const fill = broken ? BROKEN_BEAM_COLOR : overloadTint(base, util);
  const edge = broken ? "#3a1410" : material ? material.colorEdge : "#5b5f63";

  // 1) bord sombre (contour + ombre) — 2) couleur du matériau — 3) reflet central.
  strokeBeamPath(ctx, pts, width + BEAM_EDGE_EXTRA_PX, edge, 1);
  strokeBeamPath(ctx, pts, width, fill, 1);
  if (!broken && util < 0.85) {
    const hw = Math.max(BEAM_HILIGHT_MIN_PX, width * BEAM_HILIGHT_FRACTION);
    strokeBeamPath(ctx, pts, hw, material ? material.colorHi : "#ffffff", 0.5);
  }

  if (beam.isRoad) drawRoadMarking(ctx, pts);
  if (selected) drawBeamSelection(ctx, pts);
}

// Câble en fil d'acier TORONNÉ : un cœur sombre suivant la polyligne (donc la
// vrille quand il flambe), parcouru de courts torons diagonaux réguliers.
function drawCable(ctx, state, beam, pts, selected, util, broken) {
  const core = broken ? BROKEN_BEAM_COLOR : overloadTint(CABLE_CORE_COLOR, util);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = core;
  ctx.lineWidth = CABLE_WIDTH_PX;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.stroke();

  // Torons : petits traits diagonaux, espacés régulièrement le long du câble.
  ctx.strokeStyle = CABLE_STRAND_COLOR;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  const h = CABLE_WIDTH_PX * 0.95;
  let acc = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    let tx = -uy + ux * CABLE_STRAND_SLANT;
    let ty = ux + uy * CABLE_STRAND_SLANT;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let d = CABLE_STRAND_SPACING_PX - (acc % CABLE_STRAND_SPACING_PX);
    while (d < len) {
      const cx = a.x + ux * d, cy = a.y + uy * d;
      ctx.moveTo(cx - tx * h, cy - ty * h);
      ctx.lineTo(cx + tx * h, cy + ty * h);
      d += CABLE_STRAND_SPACING_PX;
    }
    acc += len;
  }
  ctx.stroke();
  ctx.restore();

  if (selected) drawBeamSelection(ctx, pts);
}

// Trace une polyligne déjà calculée (beamPoints) avec une largeur, une couleur
// et une opacité données.
function strokeBeamPath(ctx, pts, width, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.stroke();
  ctx.restore();
}

// Étiquette du % d'effort (taux de travail) au MILIEU d'une poutre CHARGÉE, en
// couleur graduée (calme → orange → rouge). N'apparaît qu'au-delà d'un seuil.
// Le taux est lu dans le CACHE du scan d'efforts (beam._effort).
function drawEffortLabel(ctx, state, beam) {
  const util = beam._effort ? beam._effort.util : 0;
  if (util < EFFORT_LABEL_MIN_UTIL) return;

  const midNode = findNodeById(state.structure, beam.nodeIds[Math.floor(beam.nodeIds.length / 2)]);
  if (!midNode) return;
  const p = worldToBasePixels(midNode);

  const text = `${Math.min(999, Math.round(util * 100))}%`;
  const color = util >= 1 ? EFFORT_LABEL_DANGER_COLOR
    : util >= 0.85 ? OVERLOAD_COLOR
    : util >= 0.5 ? "#c9871f"
    : "#6b7480";

  ctx.save();
  ctx.font = EFFORT_LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const w = ctx.measureText(text).width;
  const x = p.x;
  const y = p.y - EFFORT_LABEL_OFFSET_PX;

  ctx.fillStyle = EFFORT_LABEL_BG;
  fillRoundRect(ctx, x - w / 2 - 3, y - 10, w + 6, 12, 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function polyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.stroke();
}

function drawRoadMarking(ctx, pts) {
  ctx.save();
  ctx.strokeStyle = ROAD_INDICATOR_COLOR;
  ctx.lineWidth = ROAD_INDICATOR_WIDTH_PX;
  ctx.setLineDash(ROAD_INDICATOR_DASH_PATTERN);
  ctx.lineCap = "round";
  polyline(ctx, pts);
  ctx.restore();
}

function drawBeamSelection(ctx, pts) {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = SELECTION_OUTLINE_WIDTH;
  ctx.setLineDash(SELECTION_OUTLINE_DASH);
  polyline(ctx, pts);
  ctx.restore();
}

// Assemblage : un petit RIVET (contour sombre + cœur clair). Un nœud ancré est
// dessiné plus sombre et surmonté du symbole d'appui (hachures).
function drawJoint(ctx, state, node) {
  const p = worldToBasePixels(node);

  ctx.beginPath();
  ctx.arc(p.x, p.y, NODE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = node.fixed ? FIXED_NODE_COLOR : JOINT_RING_COLOR;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, p.y, NODE_RADIUS * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = node.fixed ? "#aeb6c0" : JOINT_CORE_COLOR;
  ctx.fill();

  if (node.fixed) drawAnchorSymbol(ctx, p.x, p.y, FIXED_NODE_COLOR, node.clamped === true);

  if (isSel(state, "node", node.id)) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, NODE_RADIUS + SELECTION_RING_MARGIN, 0, Math.PI * 2);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = SELECTION_RING_WIDTH;
    ctx.stroke();
  }
}

// Point d'ANCRAGE (px de base) d'un poids : le point sur lequel il est posé,
// que ce soit un point (jointId) ou une position le long d'une poutre
// (beamId + fraction). Renvoie null si la cible n'existe plus.
export function resolveLoadAnchorPixels(structure, load) {
  if (load.jointId != null) {
    const node = findNodeById(structure, load.jointId);
    return node ? worldToBasePixels(node) : null;
  }
  if (load.beamId != null) {
    const beam = findBeamById(structure, load.beamId);
    if (!beam) return null;
    const seg = beamSegmentAtFraction(structure, beam, load.fraction);
    if (!seg || !seg.nodeA || !seg.nodeB) return null;
    const wx = seg.nodeA.x + (seg.nodeB.x - seg.nodeA.x) * seg.fraction;
    const wy = seg.nodeA.y + (seg.nodeB.y - seg.nodeA.y) * seg.fraction;
    return worldToBasePixels({ x: wx, y: wy });
  }
  return null;
}

// Boîte de l'icône d'un poids (centre + demi-dimensions, en px de base) : sert
// à la fois au dessin et à la détection de clic (ui/structureEditor.js).
// `topY` = haut de l'icône (haut de l'anneau). Renvoie null si pas affichable.
export function getLoadIconBox(structure, load) {
  const anchor = resolveLoadAnchorPixels(structure, load);
  if (!anchor) return null;
  const scale = clamp(Math.sqrt(load.mass / 8000), 0.6, 2.2);
  const w = WEIGHT_ICON_WIDTH_PX * scale;
  const h = WEIGHT_ICON_HEIGHT_PX * scale;
  const above = load.placement === "above";
  const topY = above
    ? anchor.y - WEIGHT_REST_MARGIN_PX - h // posé SUR le point (au-dessus)
    : anchor.y + NODE_RADIUS + WEIGHT_HANG_GAP_PX; // suspendu sous le point
  return { anchor, topY, w, h, cx: anchor.x, cy: topY + h / 2 };
}

// Poids posé : icône « kg » (trapèze + anneau + texte), suspendue SOUS le point
// (avec un lien) ou posée DESSUS (avec une petite marge). Taille ∝ masse.
function drawWeight(ctx, state, load) {
  const box = getLoadIconBox(state.structure, load);
  if (!box) return;
  const { anchor, topY, w, h, cx } = box;
  const above = load.placement === "above";

  // Lien de suspension (seulement quand le poids pend sous le point).
  if (!above) {
    ctx.save();
    ctx.strokeStyle = WEIGHT_COLOR;
    ctx.lineWidth = Math.max(1.5, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(cx, topY);
    ctx.stroke();
    ctx.restore();
  }

  drawKgWeightIcon(ctx, cx, topY, w, h);

  if (isSel(state, "load", load.id)) {
    ctx.save();
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = SELECTION_OUTLINE_WIDTH;
    ctx.setLineDash(SELECTION_OUTLINE_DASH);
    ctx.strokeRect(cx - w / 2 - 2, topY - 2, w + 4, h + 4);
    ctx.restore();
  }
}

// Dessine l'icône poids « kg » dans la boîte (cx centré, haut = topY, w×h) :
// un corps trapézoïdal, une poignée en anneau au-dessus, et « kg » en blanc.
function drawKgWeightIcon(ctx, cx, topY, w, h, color = WEIGHT_COLOR) {
  const bodyTopY = topY + h * 0.30;
  const bodyBotY = topY + h;
  const halfTop = w * 0.34;
  const halfBot = w * 0.50;
  const ringCy = topY + h * 0.17;
  const ringR = h * 0.15;

  ctx.save();
  // Anneau (poignée) : un cercle ÉPAIS tracé → le trou laisse voir le fond.
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, h * 0.075);
  ctx.beginPath();
  ctx.arc(cx, ringCy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // Corps trapézoïdal (plus large en bas).
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - halfTop, bodyTopY);
  ctx.lineTo(cx + halfTop, bodyTopY);
  ctx.lineTo(cx + halfBot, bodyBotY);
  ctx.lineTo(cx - halfBot, bodyBotY);
  ctx.closePath();
  ctx.fill();

  // Texte « kg » en blanc, centré sur le corps.
  ctx.fillStyle = WEIGHT_TEXT_COLOR;
  ctx.font = `bold ${Math.round(h * 0.34)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("kg", cx, (bodyTopY + bodyBotY) / 2 + h * 0.04);
  ctx.restore();
}

// Aperçu élastique : du premier point cliqué vers le point survolé. Vert si
// autorisé, rouge si une poutre occupe déjà ce chemin. Le point visé au-delà de
// la longueur max du type est RAMENÉ à cette longueur (même règle qu'à la pose,
// voir Structure.js::clampBeamEnd) : le tronçon posable est plein, le reste du
// chemin visé apparaît en pointillé très léger, et la longueur s'affiche.
function drawPreview(ctx, state) {
  if (!state.pendingBeamFirstGrid || !state.hoverGrid) return;
  const a = state.pendingBeamFirstGrid, b = state.hoverGrid;
  const end = clampBeamEnd(a, b, state.currentBeamTypeId) || b;
  const pa = worldToBasePixels(gridToWorld(a.i, a.j));
  const pe = worldToBasePixels(gridToWorld(end.i, end.j));
  const ok = canAddBeam(state.structure, a, end, state.currentBeamTypeId).ok;
  const color = ok ? "#2f8f4f" : "#d64545";

  ctx.save();
  // Reste du chemin visé (au-delà de la longueur max) : trace discrète.
  if (end !== b) {
    const pb = worldToBasePixels(gridToWorld(b.i, b.j));
    ctx.strokeStyle = "rgba(31, 41, 51, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(pe.x, pe.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 5]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pe.x, pe.y);
  ctx.stroke();

  // Longueur du tronçon en cours, affichée au milieu (repère pédagogique).
  const wa = gridToWorld(a.i, a.j), we = gridToWorld(end.i, end.j);
  const len = Math.hypot(we.x - wa.x, we.y - wa.y);
  if (len > 0) {
    const mx = (pa.x + pe.x) / 2, my = (pa.y + pe.y) / 2;
    const label = `${len.toFixed(1).replace(".", ",")} m`;
    ctx.setLineDash([]);
    ctx.font = "600 12px system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(24, 32, 40, 0.82)";
    const bx = mx - tw / 2 - 6, by = my - 22;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, tw + 12, 18, 5);
    else ctx.rect(bx, by, tw + 12, 18);
    ctx.fill();
    ctx.fillStyle = "#f2f5f8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, by + 9);
  }
  ctx.restore();
}

function hexLerp(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

// Un élément est "sélectionné" s'il est LA sélection simple OU s'il fait partie
// de la sélection MULTIPLE (rectangle) — test O(1) via l'ensemble de clés.
function isSel(state, type, id) {
  if (state.selection.type === type && state.selection.id === id) return true;
  const keys = state.multiSelectionKeys;
  return keys !== undefined && keys.size > 0 && keys.has(`${type}:${id}`);
}
