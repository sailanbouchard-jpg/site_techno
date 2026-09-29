// render/renderer.js
// ──────────────────
// Dessine l'état courant. LECTURE SEULE, aucune formule de mouvement.
//
// Ordre, du fond vers l'avant :
//   décor en cache (ciel, relief lointain, rivière, grille de conception)
//   → particules de vent → sol des niveaux (en cache)
//   → appuis → goussets → poutres (les plus fines d'abord)
//   → massifs d'encastrement → poids → véhicules → aperçu de pose
//   → annotations à l'écran (sélection, repères des nœuds, taux de travail,
//     accrochage, cote, règles).
//
// Les poutres sont des polylignes passant par leurs nœuds internes : leur
// courbure de flexion reste visible. Leur couleur est celle de leur MATÉRIAU,
// voilée de rouge à l'approche de la rupture (en essai seulement).

import { MODES } from "../state.js";
import { findNodeById, findBeamById, beamSegmentAtFraction } from "../model/Structure.js";
import { worldToBasePixels, getViewTranslation, viewport } from "./displayTransform.js";
import { getStaticLayers } from "./backgroundCache.js";
import { drawTerrainPreview } from "./terrainRenderer.js";
import { bateauxDe } from "../model/bateau.js";
import { drawVehicle } from "./vehicleRenderer.js";
import { drawWindParticles } from "./windRenderer.js";
import {
  drawMember, drawGussetPlate, drawSupportBase, drawClampBlock, drawnWidth,
} from "./memberRenderer.js";
import {
  isSelected, drawSelectionHalo, drawNodeSelection, drawBoatSelection, drawArriveeFlag, drawSelectionOverlay,
  drawSnapMarker, drawBeamPreviewShape, drawBeamPreviewOverlay, drawEffortLabels, drawJointMarkers,
} from "./annotations.js";
import { drawRulers } from "./rulers.js";
import { getConcreteTile } from "./textures.js";
import { clamp } from "./canvasUtils.js";
import { formatMassShort } from "../units.js";
import {
  NODE_RADIUS, SELECTION_COLOR, SELECTION_OUTLINE_DASH,
  WEIGHT_BLOCK_WIDTH_PX, WEIGHT_BLOCK_HEIGHT_PX, WEIGHT_EYE_RADIUS_PX, WEIGHT_CABLE_COLOR,
  WEIGHT_LABEL_COLOR, WEIGHT_LABEL_FONT_FAMILY, WEIGHT_HANG_GAP_PX, WEIGHT_REST_MARGIN_PX,
  SUPPORT_EDGE, SUPPORT_SIDE_LIGHT, SUPPORT_SIDE_SHADE, profilTauxPar,
} from "./styleConfig.js";

export function draw(ctx, canvas, state) {
  const dpr = viewport.pixelRatio;
  const view = {
    zoomLevel: state.zoomLevel, cameraX: state.cameraX, cameraY: state.cameraY,
    canvasWidth: viewport.width, canvasHeight: viewport.height,
  };
  const editing = state.mode === MODES.EDIT;

  const layers = getStaticLayers(view, state.structure, editing, dpr);
  const t = getViewTranslation(view);
  const s = dpr * view.zoomLevel;
  const toWorld = () => ctx.setTransform(s, 0, 0, s, dpr * t.x, dpr * t.y);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layers.back, 0, 0);
  toWorld();
  drawWindParticles(ctx, state);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layers.front, 0, 0);

  toWorld();
  drawStructure(ctx, state, !editing, view.zoomLevel);
  drawTerrainPreview(ctx, state.pendingTerrain, view.zoomLevel);
  if (editing) drawBeamPreviewShape(ctx, state);

  // Annotations : pixels écran, taille indépendante du zoom.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSelectionOverlay(ctx, state, view);
  const profilTaux = profilTauxPar(state.profilTaux);
  if (!editing && profilTaux.font) drawEffortLabels(ctx, state, view, profilTaux);
  if (editing) {
    drawJointMarkers(ctx, state, view);
    drawSnapMarker(ctx, state.hoverGrid, view);
    drawBeamPreviewOverlay(ctx, state, view);
    drawRulers(ctx, view, state.pointer);
  }
}

// Polyligne d'une poutre en pixels de base.
function beamPoints(structure, beam) {
  const pts = [];
  for (const id of beam.nodeIds) {
    const n = findNodeById(structure, id);
    if (n) pts.push(worldToBasePixels(n));
  }
  return pts;
}

function drawStructure(ctx, state, simulating, zoom) {
  const structure = state.structure;

  // Polylignes (calculées une fois par image) et, pour chaque nœud, la
  // direction et la largeur des poutres qui en partent (forme du gousset).
  const polylines = new Map();
  const arms = new Map();
  const addArm = (jointId, from, to, width) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    if (jointId == null || len < 1e-6) return;
    if (!arms.has(jointId)) arms.set(jointId, []);
    arms.get(jointId).push({ ux: (to.x - from.x) / len, uy: (to.y - from.y) / len, width });
  };
  for (const beam of structure.beams) {
    const pts = beamPoints(structure, beam);
    polylines.set(beam.id, pts);
    if (pts.length < 2) continue;
    const w = drawnWidth(beam);
    addArm(beam.jointAId, pts[0], pts[1], w);
    addArm(beam.jointBId, pts[pts.length - 1], pts[pts.length - 2], w);
  }

  for (const node of structure.nodes) {
    if (node.fixed && node.kind === "joint") drawSupportBase(ctx, structure, node);
  }
  for (const [jointId, list] of arms) {
    const node = findNodeById(structure, jointId);
    if (node) {
      const p = worldToBasePixels(node);
      drawGussetPlate(ctx, p.x, p.y, list);
    }
  }
  // Les plus fines d'abord : aux nœuds, les membrures épaisses (tablier)
  // recouvrent proprement l'extrémité des diagonales.
  const ordered = [...structure.beams].sort((a, b) => drawnWidth(a) - drawnWidth(b));
  for (const beam of ordered) {
    const pts = polylines.get(beam.id);
    if (pts.length < 2) continue;
    if (isSelected(state, "beam", beam.id)) drawSelectionHalo(ctx, pts, beam, zoom);
    drawMember(ctx, pts, beam, {
      util: simulating && beam._effort ? beam._effort.util : 0,
      broken: simulating && beam.broken,
    });
  }
  for (const node of structure.nodes) {
    if (node.kind !== "joint") continue;
    if (node.fixed) drawClampBlock(ctx, structure, node);
    if (isSelected(state, "node", node.id)) {
      const p = worldToBasePixels(node);
      drawNodeSelection(ctx, p.x, p.y, zoom);
    }
  }
  // Le drapeau d'arrivée, planté sur son point : il fait partie de l'énoncé, il
  // se voit donc toujours, pas seulement en conception.
  const arrivee = structure.nodes.find((node) => node.arrivee);
  if (arrivee) {
    const p = worldToBasePixels(arrivee);
    drawArriveeFlag(ctx, p.x, p.y, zoom);
  }
  for (const load of structure.loads) drawWeight(ctx, state, load);
  for (const vehicle of structure.mobileLoads) {
    drawVehicle(ctx, vehicle, structure, isSelected(state, "vehicle", vehicle.id));
  }
  // Les bateaux eux-mêmes appartiennent au décor statique (backgroundCache) ;
  // seul leur halo de sélection se dessine ici, avec le reste de l'interface.
  for (const bateau of bateauxDe(structure)) {
    if (isSelected(state, "bateau", bateau.id)) drawBoatSelection(ctx, bateau, zoom);
  }
}

// ── Poids posés (atelier) ────────────────────────────────────────────────────

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

// Boîte du bloc de lest (px de base) : sert au dessin ET à la détection de clic
// (ui/structureEditor.js). `topY` = haut du bloc. Renvoie null si non affichable.
export function getLoadIconBox(structure, load) {
  const anchor = resolveLoadAnchorPixels(structure, load);
  if (!anchor) return null;
  const scale = clamp(Math.sqrt(load.mass / 8000), 0.6, 2.2);
  const w = WEIGHT_BLOCK_WIDTH_PX * scale;
  const h = WEIGHT_BLOCK_HEIGHT_PX * scale;
  const eye = WEIGHT_EYE_RADIUS_PX * scale;
  const above = load.placement === "above";
  const topY = above
    ? anchor.y - NODE_RADIUS - WEIGHT_REST_MARGIN_PX - h
    : anchor.y + NODE_RADIUS + WEIGHT_HANG_GAP_PX + 2 * eye;
  return { anchor, topY, w, h, eye, cx: anchor.x, cy: topY + h / 2 };
}

// Bloc de lest en béton, suspendu par une élingue sous son point, ou posé
// dessus ; sa masse est inscrite sur la face.
function drawWeight(ctx, state, load) {
  const box = getLoadIconBox(state.structure, load);
  if (!box) return;
  const { anchor, topY, w, h, eye, cx } = box;
  const x = cx - w / 2;

  ctx.save();
  ctx.strokeStyle = WEIGHT_CABLE_COLOR;
  ctx.lineWidth = Math.max(0.8, eye * 0.45);
  if (load.placement !== "above") {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(cx, topY - 2 * eye);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, topY - eye, eye, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = ctx.createPattern(getConcreteTile(), "repeat");
  ctx.fillRect(x, topY, w, h);
  const side = Math.min(w * 0.15, 4);
  ctx.fillStyle = SUPPORT_SIDE_LIGHT;
  ctx.fillRect(x, topY, side, h);
  ctx.fillStyle = SUPPORT_SIDE_SHADE;
  ctx.fillRect(x + w - side, topY, side, h);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = SUPPORT_EDGE;
  ctx.strokeRect(x, topY, w, h);

  ctx.fillStyle = WEIGHT_LABEL_COLOR;
  ctx.font = `600 ${Math.round(h * 0.36)}px ${WEIGHT_LABEL_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(formatMassShort(load.mass), cx, topY + h / 2 + 0.5);

  if (isSelected(state, "load", load.id)) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.2;
    ctx.setLineDash(SELECTION_OUTLINE_DASH);
    ctx.strokeRect(x - 2.5, topY - 2 * eye - 2.5, w + 5, h + 2 * eye + 5);
  }
  ctx.restore();
}
