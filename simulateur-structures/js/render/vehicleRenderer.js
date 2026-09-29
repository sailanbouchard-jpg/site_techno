// render/vehicleRenderer.js
// ─────────────────────────
// Position et dessin d'une charge mobile le long de sa poutre-route. LECTURE
// SEULE (le mouvement est dans physics/vehicleMotion.js).
//
// Trois silhouettes vues de profil, à l'échelle du monde : berline, fourgon
// (presetId "van") et camion porteur à caisse (presetId "truck"). Chaque véhicule
// est posé SUR la chaussée (le dessus de la poutre, pas son axe) et suit sa
// pente, donc sa déformation.
//
// resolveVehicleDisplayPosition() est partagée avec ui/structureEditor.js
// (détection d'un clic sur un véhicule).

import { getCurrentRoadSegment, positionChute } from "../physics/vehicleMotion.js";
import { findBeamById } from "../model/Structure.js";
import { worldToBasePixels } from "./displayTransform.js";
import { drawnWidth } from "./memberRenderer.js";
import {
  PIXELS_PER_METER,
  VEHICLE_CAR_LENGTH_M, VEHICLE_CAR_HEIGHT_M, VEHICLE_VAN_LENGTH_M, VEHICLE_VAN_HEIGHT_M,
  VEHICLE_TRUCK_LENGTH_M, VEHICLE_TRUCK_HEIGHT_M,
  CAR_PAINT, CAR_PAINT_LIGHT, CAR_PAINT_DARK, VAN_PAINT_LIGHT, VAN_PAINT, VAN_PAINT_DARK, VAN_PROTECTION_STRIP,
  TRUCK_CAB_PAINT, TRUCK_CAB_DARK, TRUCK_BOX_LIGHT, TRUCK_BOX, TRUCK_BOX_DARK, TRUCK_BOX_RIB, TRUCK_RAIL, TRUCK_TANK,
  VEHICLE_GLASS_TOP, VEHICLE_GLASS_BOTTOM, VEHICLE_TRIM, VEHICLE_LINE, VEHICLE_SHOULDER_LINE, VEHICLE_DOOR_RAIL,
  VEHICLE_TIRE, VEHICLE_RIM, VEHICLE_HUB, VEHICLE_HEADLIGHT, VEHICLE_TAILLIGHT, VEHICLE_SHADOW,
  SELECTION_COLOR, SELECTION_OUTLINE_DASH,
} from "./styleConfig.js";

const ppm = PIXELS_PER_METER;

export function resolveVehicleDisplayPosition(vehicle, structure) {
  if (vehicle.state === "fallenOff") return null;
  // En chute : plus de route sous les roues, on suit la parabole, museau piqué.
  const chute = positionChute(vehicle);
  if (chute) {
    const base = worldToBasePixels(chute);
    const angle = Math.atan2(vehicle.chuteVy, Math.max(vehicle.chuteVx, 0.1));
    return { x: base.x, y: base.y, angle: Math.min(angle, Math.PI / 2.2) };
  }
  const seg = getCurrentRoadSegment(vehicle, structure);
  if (!seg.nodeA || !seg.nodeB) return null;

  const wx = seg.nodeA.x + (seg.nodeB.x - seg.nodeA.x) * seg.fraction;
  const wy = seg.nodeA.y + (seg.nodeB.y - seg.nodeA.y) * seg.fraction;
  // Tangente de la route, RAMENÉE vers la droite : l'angle reste dans
  // (−90°, +90°], le véhicule est donc toujours au-dessus de la poutre et
  // tourné vers la droite, quel que soit le sens de tracé de la poutre.
  let dx = seg.nodeB.x - seg.nodeA.x;
  let dy = seg.nodeB.y - seg.nodeA.y;
  if (dx < 0) { dx = -dx; dy = -dy; }
  const angle = Math.atan2(dy, dx);
  const base = worldToBasePixels({ x: wx, y: wy });
  return { x: base.x, y: base.y, angle };
}

function vehicleKind(vehicle) {
  if (vehicle.presetId === "van") return "van";
  if (vehicle.presetId === "truck") return "truck";
  return "car";
}

const SIZES = {
  car: { length: VEHICLE_CAR_LENGTH_M, height: VEHICLE_CAR_HEIGHT_M },
  van: { length: VEHICLE_VAN_LENGTH_M, height: VEHICLE_VAN_HEIGHT_M },
  truck: { length: VEHICLE_TRUCK_LENGTH_M, height: VEHICLE_TRUCK_HEIGHT_M },
};

export function drawVehicle(ctx, vehicle, structure, selected) {
  const pos = resolveVehicleDisplayPosition(vehicle, structure);
  if (!pos) return;
  const kind = vehicleKind(vehicle);
  const L = SIZES[kind].length * ppm;
  const H = SIZES[kind].height * ppm;
  const beam = findBeamById(structure, vehicle.beamId);
  const deckTop = beam ? drawnWidth(beam) / 2 : 0;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(pos.angle);
  ctx.translate(0, -deckTop); // y = 0 : surface de la chaussée

  ctx.fillStyle = VEHICLE_SHADOW;
  ctx.beginPath();
  ctx.ellipse(0, -0.4, L * 0.47, Math.max(1, H * 0.045), 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === "truck") drawTruck(ctx, L, H);
  else if (kind === "van") drawVan(ctx, L, H);
  else drawCar(ctx, L, H);

  if (selected) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = 1.2;
    ctx.setLineDash(SELECTION_OUTLINE_DASH);
    ctx.strokeRect(-L / 2 - 3, -H - 3, L + 6, H + 5);
  }
  ctx.restore();
}

// ── Outils de tracé en coordonnées relatives (fractions de L et H) ───────────

function pathFrom(ctx, L, H, points) {
  ctx.beginPath();
  points.forEach(([fx, fy], k) => (k === 0 ? ctx.moveTo(fx * L, fy * H) : ctx.lineTo(fx * L, fy * H)));
  ctx.closePath();
}

function fillPolygon(ctx, L, H, points, style) {
  pathFrom(ctx, L, H, points);
  ctx.fillStyle = style;
  ctx.fill();
}

function rect(ctx, L, H, fx0, fy0, fx1, fy1, style) {
  ctx.fillStyle = style;
  ctx.fillRect(fx0 * L, fy0 * H, (fx1 - fx0) * L, (fy1 - fy0) * H);
}

function line(ctx, L, H, points, style = VEHICLE_LINE, width = 0.6) {
  ctx.beginPath();
  points.forEach(([fx, fy], k) => (k === 0 ? ctx.moveTo(fx * L, fy * H) : ctx.lineTo(fx * L, fy * H)));
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.stroke();
}

function verticalGradient(ctx, H, stops) {
  const g = ctx.createLinearGradient(0, -H, 0, 0);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

function glass(ctx, L, H, points) {
  const ys = points.map((p) => p[1] * H);
  const g = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  g.addColorStop(0, VEHICLE_GLASS_TOP);
  g.addColorStop(1, VEHICLE_GLASS_BOTTOM);
  fillPolygon(ctx, L, H, points, g);
}

// Bas de caisse avec les passages de roue : de l'avant vers l'arrière, en
// contournant chaque roue par un arc (centres en fractions de L, rayon en px).
function sillWithArches(ctx, L, H, sillY, frontX, rearX, wheels, r) {
  const ys = sillY * H;
  const ra = r * 1.2;
  const dy = ys + r;
  const dx = Math.sqrt(Math.max(0, ra * ra - dy * dy));
  const theta = Math.atan2(dy, dx);
  ctx.lineTo(frontX * L, ys);
  for (const fx of wheels) {
    const cx = fx * L;
    ctx.lineTo(cx + dx, ys);
    ctx.arc(cx, -r, ra, theta, Math.PI - theta, true);
  }
  ctx.lineTo(rearX * L, ys);
}

function wheel(ctx, x, r) {
  ctx.beginPath();
  ctx.arc(x, -r, r, 0, Math.PI * 2);
  ctx.fillStyle = VEHICLE_TIRE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, -r, r * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = VEHICLE_RIM;
  ctx.fill();
  ctx.lineWidth = Math.max(0.4, r * 0.1);
  ctx.strokeStyle = VEHICLE_LINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, -r, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = VEHICLE_HUB;
  ctx.fill();
}

// ── Berline ──────────────────────────────────────────────────────────────────
function drawCar(ctx, L, H) {
  const r = 0.28 * H;
  const wheels = [0.3, -0.31];

  ctx.beginPath();
  ctx.moveTo(-0.49 * L, -0.2 * H);
  ctx.lineTo(-0.5 * L, -0.25 * H);
  ctx.lineTo(-0.5 * L, -0.47 * H);
  ctx.quadraticCurveTo(-0.49 * L, -0.58 * H, -0.42 * L, -0.6 * H);
  ctx.lineTo(-0.29 * L, -0.63 * H);
  ctx.quadraticCurveTo(-0.22 * L, -0.9 * H, -0.14 * L, -0.95 * H);
  ctx.quadraticCurveTo(0.0 * L, -1.0 * H, 0.1 * L, -0.96 * H);
  ctx.quadraticCurveTo(0.17 * L, -0.85 * H, 0.27 * L, -0.65 * H);
  ctx.quadraticCurveTo(0.42 * L, -0.61 * H, 0.47 * L, -0.56 * H);
  ctx.quadraticCurveTo(0.505 * L, -0.5 * H, 0.5 * L, -0.4 * H);
  ctx.lineTo(0.5 * L, -0.25 * H);
  sillWithArches(ctx, L, H, -0.2, 0.48, -0.49, wheels, r);
  ctx.closePath();
  ctx.fillStyle = verticalGradient(ctx, H, [[0, CAR_PAINT_LIGHT], [0.45, CAR_PAINT], [1, CAR_PAINT_DARK]]);
  ctx.fill();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = VEHICLE_LINE;
  ctx.stroke();

  glass(ctx, L, H, [[-0.265, -0.66], [-0.15, -0.9], [0.085, -0.915], [0.245, -0.665]]);
  rect(ctx, L, H, -0.045, -0.91, -0.015, -0.655, VEHICLE_TRIM); // montant central
  line(ctx, L, H, [[-0.47, -0.52], [0.46, -0.54]], VEHICLE_SHOULDER_LINE, 0.7); // ligne d'épaule
  line(ctx, L, H, [[-0.03, -0.64], [-0.03, -0.24]]);
  line(ctx, L, H, [[0.21, -0.63], [0.2, -0.27]]);
  line(ctx, L, H, [[-0.27, -0.63], [-0.25, -0.27]]);
  rect(ctx, L, H, 0.05, -0.56, 0.1, -0.53, VEHICLE_LINE); // poignées
  rect(ctx, L, H, -0.2, -0.56, -0.15, -0.53, VEHICLE_LINE);
  rect(ctx, L, H, 0.235, -0.7, 0.27, -0.64, VEHICLE_TRIM); // rétroviseur
  fillPolygon(ctx, L, H, [[0.43, -0.575], [0.49, -0.535], [0.495, -0.47], [0.44, -0.5]], VEHICLE_HEADLIGHT);
  rect(ctx, L, H, -0.5, -0.53, -0.47, -0.44, VEHICLE_TAILLIGHT);
  rect(ctx, L, H, 0.43, -0.29, 0.5, -0.24, VEHICLE_TRIM); // bouclier bas
  rect(ctx, L, H, -0.5, -0.29, -0.44, -0.24, VEHICLE_TRIM);

  for (const fx of wheels) wheel(ctx, fx * L, r);
}

// ── Fourgon ──────────────────────────────────────────────────────────────────
function drawVan(ctx, L, H) {
  const r = 0.21 * H;
  const wheels = [0.31, -0.31];

  ctx.beginPath();
  ctx.moveTo(-0.49 * L, -0.18 * H);
  ctx.lineTo(-0.5 * L, -0.22 * H);
  ctx.lineTo(-0.5 * L, -0.95 * H);
  ctx.quadraticCurveTo(-0.5 * L, -1.0 * H, -0.47 * L, -1.0 * H);
  ctx.lineTo(0.2 * L, -1.0 * H);
  ctx.quadraticCurveTo(0.28 * L, -0.99 * H, 0.31 * L, -0.92 * H);
  ctx.lineTo(0.4 * L, -0.6 * H);
  ctx.quadraticCurveTo(0.47 * L, -0.56 * H, 0.495 * L, -0.5 * H);
  ctx.lineTo(0.5 * L, -0.22 * H);
  sillWithArches(ctx, L, H, -0.18, 0.48, -0.49, wheels, r);
  ctx.closePath();
  ctx.fillStyle = verticalGradient(ctx, H, [[0, VAN_PAINT_LIGHT], [0.55, VAN_PAINT], [1, VAN_PAINT_DARK]]);
  ctx.fill();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = VEHICLE_LINE;
  ctx.stroke();

  glass(ctx, L, H, [[0.12, -0.91], [0.295, -0.91], [0.385, -0.63], [0.12, -0.63]]);
  line(ctx, L, H, [[0.105, -0.93], [0.105, -0.22]]); // porte avant
  line(ctx, L, H, [[-0.14, -0.93], [-0.14, -0.22]]); // porte latérale coulissante
  line(ctx, L, H, [[-0.46, -0.62], [0.1, -0.62]], VEHICLE_DOOR_RAIL, 0.8); // rail de porte
  line(ctx, L, H, [[-0.47, -0.97], [-0.47, -0.22]]);
  rect(ctx, L, H, -0.5, -0.37, 0.5, -0.33, VAN_PROTECTION_STRIP); // baguette de protection
  rect(ctx, L, H, 0.04, -0.57, 0.08, -0.54, VEHICLE_LINE);
  rect(ctx, L, H, 0.37, -0.68, 0.405, -0.6, VEHICLE_TRIM); // rétroviseur
  rect(ctx, L, H, 0.44, -0.53, 0.49, -0.46, VEHICLE_HEADLIGHT);
  rect(ctx, L, H, -0.5, -0.62, -0.485, -0.42, VEHICLE_TAILLIGHT);
  rect(ctx, L, H, 0.44, -0.3, 0.5, -0.2, VEHICLE_TRIM);
  rect(ctx, L, H, -0.5, -0.3, -0.45, -0.2, VEHICLE_TRIM);

  for (const fx of wheels) wheel(ctx, fx * L, r);
}

// ── Camion porteur à caisse ──────────────────────────────────────────────────
function drawTruck(ctx, L, H) {
  const r = 0.22 * H;
  const front = 0.34;
  const rear = -0.28;

  rect(ctx, L, H, -0.46, -0.31, 0.44, -0.23, VEHICLE_TRIM); // châssis

  // Caisse
  const boxGradient = verticalGradient(ctx, H, [[0, TRUCK_BOX_LIGHT], [0.6, TRUCK_BOX], [1, TRUCK_BOX_DARK]]);
  rect(ctx, L, H, -0.5, -1.0, 0.14, -0.33, boxGradient);
  ctx.beginPath();
  for (let fx = -0.43; fx < 0.12; fx += 0.07) {
    ctx.moveTo(fx * L, -0.97 * H);
    ctx.lineTo(fx * L, -0.36 * H);
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = TRUCK_BOX_RIB;
  ctx.stroke();
  rect(ctx, L, H, -0.5, -1.0, 0.14, -0.965, TRUCK_BOX_DARK); // lisse haute
  rect(ctx, L, H, -0.5, -0.37, 0.14, -0.33, TRUCK_RAIL); // longeron bas
  line(ctx, L, H, [[-0.5, -1.0], [0.14, -1.0], [0.14, -0.33], [-0.5, -0.33], [-0.5, -1.0]]);
  line(ctx, L, H, [[-0.475, -0.97], [-0.475, -0.37]]); // porte arrière
  rect(ctx, L, H, -0.5, -0.4, -0.488, -0.34, VEHICLE_TAILLIGHT);

  // Cabine
  ctx.beginPath();
  ctx.moveTo(0.16 * L, -0.26 * H);
  ctx.lineTo(0.16 * L, -0.84 * H);
  ctx.lineTo(0.38 * L, -0.84 * H);
  ctx.quadraticCurveTo(0.42 * L, -0.84 * H, 0.43 * L, -0.8 * H);
  ctx.lineTo(0.475 * L, -0.6 * H);
  ctx.lineTo(0.5 * L, -0.54 * H);
  ctx.lineTo(0.5 * L, -0.26 * H);
  sillWithArches(ctx, L, H, -0.26, 0.5, 0.16, [front], r);
  ctx.closePath();
  ctx.fillStyle = verticalGradient(ctx, H, [[0, TRUCK_CAB_PAINT], [0.7, TRUCK_CAB_PAINT], [1, TRUCK_CAB_DARK]]);
  ctx.fill();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = VEHICLE_LINE;
  ctx.stroke();

  glass(ctx, L, H, [[0.215, -0.79], [0.395, -0.79], [0.45, -0.6], [0.215, -0.6]]);
  line(ctx, L, H, [[0.2, -0.82], [0.2, -0.3]]);
  line(ctx, L, H, [[0.2, -0.3], [0.33, -0.3]]);
  rect(ctx, L, H, 0.24, -0.31, 0.32, -0.27, VEHICLE_TRIM); // marchepied
  rect(ctx, L, H, 0.3, -0.56, 0.34, -0.535, VEHICLE_LINE); // poignée
  rect(ctx, L, H, 0.455, -0.8, 0.475, -0.64, VEHICLE_TRIM); // rétroviseur
  rect(ctx, L, H, 0.485, -0.47, 0.5, -0.39, VEHICLE_HEADLIGHT);
  rect(ctx, L, H, 0.44, -0.31, 0.505, -0.23, VEHICLE_TRIM); // pare-chocs

  // Réservoir entre les essieux
  rect(ctx, L, H, -0.03, -0.38, 0.11, -0.27, TRUCK_TANK);
  line(ctx, L, H, [[-0.03, -0.38], [0.11, -0.38], [0.11, -0.27], [-0.03, -0.27], [-0.03, -0.38]]);

  wheel(ctx, front * L, r);
  wheel(ctx, rear * L, r);
}
