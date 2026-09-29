// render/annotations.js
// ─────────────────────
// Tout ce qui s'ajoute à la scène pour l'INTERFACE, pas pour la représenter :
// aperçu de pose avec sa cote, marqueur d'accrochage, sélection (halo, poignées,
// rectangle élastique) et étiquettes de taux de travail pendant l'essai.
//
// Sauf l'aperçu de la poutre (dessiné dans le monde, comme une vraie poutre),
// ces éléments sont tracés en pixels ÉCRAN : leur taille ne dépend pas du zoom.
// LECTURE SEULE.

import { findNodeById, canAddBeam, clampBeamEnd } from "../model/Structure.js";
import { getBeamTypeById } from "../model/materials.js";
import { gridToWorld } from "../model/mesh.js";
import { formesBateau } from "../model/bateau.js";
import { worldToBasePixels, worldToScreen, basePixelsToScreen } from "./displayTransform.js";
import { drawMember, drawnWidth, edgeWidth } from "./memberRenderer.js";
import { formatDecimal } from "../units.js";
import {
  ACCENT_COLOR, SELECTION_COLOR, SELECTION_HALO_ALPHA, SELECTION_HALO_EXTRA_PX, SELECTION_GRIP_PX, SELECTION_GRIP_BORDER,
  SELECTION_OUTLINE_DASH, SELECTION_RECT_FILL,
  SNAP_SIZE_PX, SNAP_FILL, PIXELS_PER_METER,
  ARRIVEE_MAT, ARRIVEE_CLAIR, ARRIVEE_SOMBRE, ARRIVEE_MAT_PX, ARRIVEE_DRAPEAU_PX,
  JOINT_MARKER_PX, JOINT_MARKER_FILL, JOINT_MARKER_BORDER, JOINT_MARKER_FIXED_FILL, JOINT_MARKER_FIXED_BORDER,
  PREVIEW_OK_COLOR, PREVIEW_BAD_COLOR, PREVIEW_ALPHA, PREVIEW_OVERFLOW_COLOR,
  DIMENSION_FONT, DIMENSION_BG, DIMENSION_BORDER, DIMENSION_TEXT, DIMENSION_OFFSET_PX,
  LABEL_BG, LABEL_CALM, LABEL_WARN, LABEL_DANGER, EFFORT_LABEL_MIN_UTIL,
} from "./styleConfig.js";

// Un élément est « sélectionné » s'il est LA sélection simple OU s'il fait partie
// de la sélection multiple (rectangle) — test O(1) via l'ensemble de clés.
export function isSelected(state, type, id) {
  if (state.selection.type === type && state.selection.id === id) return true;
  const keys = state.multiSelectionKeys;
  return keys !== undefined && keys.size > 0 && keys.has(`${type}:${id}`);
}

// ── Sélection ────────────────────────────────────────────────────────────────

// Halo d'accent SOUS une poutre sélectionnée (dans le monde, avant la poutre).
export function drawSelectionHalo(ctx, pts, beam, zoom) {
  const w = drawnWidth(beam);
  ctx.save();
  ctx.globalAlpha = SELECTION_HALO_ALPHA;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = w + 2 * edgeWidth(w) + SELECTION_HALO_EXTRA_PX / zoom;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

// Carré d'accent autour d'un nœud sélectionné (dans le monde), taille constante
// à l'écran — la poignée d'un logiciel de DAO.
export function drawNodeSelection(ctx, x, y, zoom) {
  const half = 6 / zoom;
  ctx.save();
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.strokeRect(x - half, y - half, 2 * half, 2 * half);
  ctx.restore();
}

// Poignées carrées aux extrémités des poutres sélectionnées, puis rectangle
// élastique en cours de tracé (écran).
export function drawSelectionOverlay(ctx, state, view) {
  const structure = state.structure;
  const half = SELECTION_GRIP_PX / 2;
  ctx.save();
  ctx.lineWidth = 1;
  for (const beam of structure.beams) {
    if (!isSelected(state, "beam", beam.id)) continue;
    for (const id of [beam.nodeIds[0], beam.nodeIds[beam.nodeIds.length - 1]]) {
      const n = findNodeById(structure, id);
      if (!n) continue;
      const s = worldToScreen(n, view);
      const x = Math.round(s.x - half) + 0.5;
      const y = Math.round(s.y - half) + 0.5;
      ctx.fillStyle = SELECTION_COLOR;
      ctx.fillRect(x, y, SELECTION_GRIP_PX, SELECTION_GRIP_PX);
      ctx.strokeStyle = SELECTION_GRIP_BORDER;
      ctx.strokeRect(x, y, SELECTION_GRIP_PX, SELECTION_GRIP_PX);
    }
  }
  const rect = state.selectionRect;
  if (rect) {
    const a = basePixelsToScreen({ x: rect.x0, y: rect.y0 }, view);
    const b = basePixelsToScreen({ x: rect.x1, y: rect.y1 }, view);
    ctx.fillStyle = SELECTION_RECT_FILL;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.setLineDash(SELECTION_OUTLINE_DASH);
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
  }
  ctx.restore();
}

// Silhouette d'un bateau sélectionné, cerclée d'accent. On reprend EXACTEMENT
// les polygones du gabarit : le halo montre donc ce qui est réellement interdit.
export function drawBoatSelection(ctx, bateau, zoom) {
  ctx.save();
  ctx.strokeStyle = SELECTION_COLOR;
  ctx.lineWidth = 2 / zoom;
  ctx.lineJoin = "round";
  for (const forme of formesBateau(bateau)) {
    ctx.beginPath();
    forme.points.forEach((p, k) => {
      const x = p.x * PIXELS_PER_METER;
      const y = p.y * PIXELS_PER_METER;
      return k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// Le DRAPEAU d'arrivée, planté sur son point de route : un mât et un damier,
// de taille constante à l'écran comme les autres repères d'interface.
export function drawArriveeFlag(ctx, x, y, zoom) {
  const h = ARRIVEE_MAT_PX / zoom;
  const l = ARRIVEE_DRAPEAU_PX / zoom;
  const c = l / 3; // côté d'une case du damier
  ctx.save();
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = ARRIVEE_MAT;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();

  ctx.fillStyle = ARRIVEE_CLAIR;
  ctx.fillRect(x, y - h, l, 2 * c);
  ctx.fillStyle = ARRIVEE_SOMBRE;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(x + i * c, y - h + j * c, c, c);
    }
  }
  ctx.strokeStyle = ARRIVEE_SOMBRE;
  ctx.strokeRect(x, y - h, l, 2 * c);
  ctx.restore();
}

// ── Repères des nœuds (conception) ───────────────────────────────────────────
// Un petit carré à chaque nœud — là où une poutre peut s'accrocher. Creux pour
// un nœud libre, plein pour un appui.
export function drawJointMarkers(ctx, state, view) {
  const half = JOINT_MARKER_PX / 2;
  ctx.save();
  ctx.lineWidth = 1;
  for (const node of state.structure.nodes) {
    if (node.kind !== "joint") continue;
    const s = worldToScreen(node, view);
    const x = Math.round(s.x - half) + 0.5;
    const y = Math.round(s.y - half) + 0.5;
    ctx.fillStyle = node.fixed ? JOINT_MARKER_FIXED_FILL : JOINT_MARKER_FILL;
    ctx.fillRect(x, y, JOINT_MARKER_PX, JOINT_MARKER_PX);
    ctx.strokeStyle = node.fixed ? JOINT_MARKER_FIXED_BORDER : JOINT_MARKER_BORDER;
    ctx.strokeRect(x, y, JOINT_MARKER_PX, JOINT_MARKER_PX);
  }
  ctx.restore();
}

// ── Accrochage ───────────────────────────────────────────────────────────────

// Point du maillage visé : carré d'accent façon logiciel de DAO, avec quatre
// amorces de réticule.
export function drawSnapMarker(ctx, hoverGrid, view) {
  if (!hoverGrid) return;
  const s = worldToScreen(gridToWorld(hoverGrid.i, hoverGrid.j), view);
  const h = SNAP_SIZE_PX / 2;
  const x = Math.round(s.x) + 0.5;
  const y = Math.round(s.y) + 0.5;
  ctx.save();
  ctx.fillStyle = SNAP_FILL;
  ctx.fillRect(x - h, y - h, 2 * h, 2 * h);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.strokeRect(x - h, y - h, 2 * h, 2 * h);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - h - 5, y); ctx.lineTo(x - h - 1, y);
  ctx.moveTo(x + h + 1, y); ctx.lineTo(x + h + 5, y);
  ctx.moveTo(x, y - h - 5); ctx.lineTo(x, y - h - 1);
  ctx.moveTo(x, y + h + 1); ctx.lineTo(x, y + h + 5);
  ctx.stroke();
  ctx.restore();
}

// ── Aperçu de pose ───────────────────────────────────────────────────────────
// Du premier point cliqué vers le point visé, ramené à la longueur max du type
// (même règle qu'à la pose, voir Structure.js::clampBeamEnd).

function previewGeometry(state) {
  if (!state.pendingBeamFirstGrid || !state.hoverGrid) return null;
  const a = state.pendingBeamFirstGrid;
  const b = state.hoverGrid;
  const end = clampBeamEnd(a, b, state.currentBeamTypeId) || b;
  const type = getBeamTypeById(state.currentBeamTypeId);
  if (!type) return null;
  return {
    a, b, end, type,
    ok: canAddBeam(state.structure, a, end, state.currentBeamTypeId).ok,
    wa: gridToWorld(a.i, a.j),
    we: gridToWorld(end.i, end.j),
    wb: gridToWorld(b.i, b.j),
  };
}

// La poutre elle-même, translucide, avec son vrai aspect (dans le monde).
export function drawBeamPreviewShape(ctx, state) {
  const g = previewGeometry(state);
  if (!g || (g.end.i === g.a.i && g.end.j === g.a.j)) return;
  const member = { materialId: g.type.materialId, sectionArea: g.type.thickness, isCable: !!g.type.cable, id: "apercu" };
  const pts = [worldToBasePixels(g.wa), worldToBasePixels(g.we)];
  drawMember(ctx, pts, member, { alpha: PREVIEW_ALPHA });
  if (!g.ok) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = PREVIEW_BAD_COLOR;
    ctx.lineWidth = drawnWidth(member);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
    ctx.restore();
  }
}

// Reste du chemin visé (au-delà de la longueur max), point de départ et cote (écran).
export function drawBeamPreviewOverlay(ctx, state, view) {
  const g = previewGeometry(state);
  if (!g) return;
  const sa = worldToScreen(g.wa, view);
  const se = worldToScreen(g.we, view);
  ctx.save();
  if (g.end !== g.b) {
    const sb = worldToScreen(g.wb, view);
    ctx.strokeStyle = PREVIEW_OVERFLOW_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(se.x, se.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const color = g.ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(sa.x) - 3, Math.round(sa.y) - 3, 6, 6);

  const length = Math.hypot(g.we.x - g.wa.x, g.we.y - g.wa.y);
  if (length > 0) {
    // Cote posée au milieu, décalée vers le haut perpendiculairement à la poutre.
    let nx = se.y - sa.y;
    let ny = -(se.x - sa.x);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) { nx = -nx; ny = -ny; }
    const cx = (sa.x + se.x) / 2 + nx * DIMENSION_OFFSET_PX;
    const cy = (sa.y + se.y) / 2 + ny * DIMENSION_OFFSET_PX;
    const text = `${formatDecimal(length, 2)} m`;
    ctx.font = DIMENSION_FONT;
    const w = Math.ceil(ctx.measureText(text).width) + 10;
    const h = 17;
    const x = Math.round(cx - w / 2) + 0.5;
    const y = Math.round(cy - h / 2) + 0.5;
    ctx.fillStyle = DIMENSION_BG;
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = g.ok ? DIMENSION_BORDER : PREVIEW_BAD_COLOR;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = g.ok ? DIMENSION_TEXT : PREVIEW_BAD_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, Math.round(cx), y + h / 2);
  }
  ctx.restore();
}

// ── Taux de travail (essai) ──────────────────────────────────────────────────
// Étiquette posée au milieu de chaque poutre chargée, couleur graduée
// (calme → orange → rouge). Le taux vient du cache du moteur (beam._effort).
// `profil` vient de styleConfig::PROFILS_TAUX — l'appelant a déjà écarté le
// profil « aucun », qui n'a pas de géométrie.
export function drawEffortLabels(ctx, state, view, profil) {
  const structure = state.structure;
  ctx.save();
  ctx.font = profil.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;
  for (const beam of structure.beams) {
    const util = beam._effort ? beam._effort.util : 0;
    if (util < EFFORT_LABEL_MIN_UTIL) continue;
    const mid = findNodeById(structure, beam.nodeIds[Math.floor(beam.nodeIds.length / 2)]);
    if (!mid) continue;
    const s = worldToScreen(mid, view);
    const text = `${Math.min(999, Math.round(util * 100))} %`;
    const color = util >= 0.85 ? LABEL_DANGER : util >= 0.5 ? LABEL_WARN : LABEL_CALM;
    const w = Math.ceil(ctx.measureText(text).width) + profil.marge;
    const x = Math.round(s.x - w / 2) + 0.5;
    const y = Math.round(s.y - profil.hauteur / 2) + 0.5;
    ctx.fillStyle = LABEL_BG;
    ctx.fillRect(x, y, w, profil.hauteur);
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, profil.hauteur);
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(s.x), y + profil.hauteur / 2);
  }
  ctx.restore();
}
