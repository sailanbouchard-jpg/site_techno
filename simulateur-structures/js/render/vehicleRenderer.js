// render/vehicleRenderer.js
// ─────────────────────────
// Position et dessin d'une charge mobile (voiture, camion) le long de sa
// poutre-route. LECTURE SEULE (le mouvement est dans physics/vehicleMotion.js).
// Silhouette simple, d'une seule couleur, posée sur la route (suit sa pente,
// donc sa déformation).
//
// resolveVehicleDisplayPosition() est partagée avec ui/structureEditor.js
// (détection d'un clic sur un véhicule).

import { getCurrentRoadSegment } from "../physics/vehicleMotion.js";
import { worldToBasePixels } from "./displayTransform.js";
import {
  PIXELS_PER_METER,
  VEHICLE_CAR_COLOR, VEHICLE_TRUCK_COLOR,
  VEHICLE_CAR_LENGTH_M, VEHICLE_CAR_HEIGHT_M,
  VEHICLE_TRUCK_LENGTH_M, VEHICLE_TRUCK_HEIGHT_M,
  SELECTION_COLOR, SELECTION_OUTLINE_WIDTH, SELECTION_OUTLINE_DASH,
} from "./styleConfig.js";

export function resolveVehicleDisplayPosition(vehicle, structure) {
  if (vehicle.state === "fallenOff") return null;
  const seg = getCurrentRoadSegment(vehicle, structure);
  if (!seg.nodeA || !seg.nodeB) return null;

  const wx = seg.nodeA.x + (seg.nodeB.x - seg.nodeA.x) * seg.fraction;
  const wy = seg.nodeA.y + (seg.nodeB.y - seg.nodeA.y) * seg.fraction;
  // Tangente de la route, RAMENÉE vers la droite : si le segment est tracé de
  // droite à gauche, on inverse. L'angle est alors dans (−90°, +90°], donc le
  // véhicule est TOUJOURS dessiné au-dessus de la poutre et orienté vers la
  // droite, quel que soit le sens dans lequel la poutre a été construite.
  let dx = seg.nodeB.x - seg.nodeA.x;
  let dy = seg.nodeB.y - seg.nodeA.y;
  if (dx < 0) { dx = -dx; dy = -dy; }
  const angle = Math.atan2(dy, dx);
  const base = worldToBasePixels({ x: wx, y: wy });
  return { x: base.x, y: base.y, angle };
}

function appearance(vehicle) {
  // Dimensions réelles (m) → pixels de base : le véhicule suit l'échelle du monde.
  if (vehicle.presetId === "truck") {
    return {
      len: VEHICLE_TRUCK_LENGTH_M * PIXELS_PER_METER,
      h: VEHICLE_TRUCK_HEIGHT_M * PIXELS_PER_METER,
      color: VEHICLE_TRUCK_COLOR, truck: true,
    };
  }
  return {
    len: VEHICLE_CAR_LENGTH_M * PIXELS_PER_METER,
    h: VEHICLE_CAR_HEIGHT_M * PIXELS_PER_METER,
    color: VEHICLE_CAR_COLOR, truck: false,
  };
}

export function drawVehicle(ctx, vehicle, structure, selected) {
  const pos = resolveVehicleDisplayPosition(vehicle, structure);
  if (!pos) return;
  const a = appearance(vehicle);

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(pos.angle);
  ctx.translate(0, -a.h / 2 - 2); // pose le véhicule SUR la route

  ctx.fillStyle = a.color;
  if (a.truck) {
    // Camion : remorque + cabine.
    roundRect(ctx, -a.len / 2, -a.h, a.len * 0.66, a.h);          // remorque
    roundRect(ctx, a.len * 0.16, -a.h * 0.85, a.len * 0.34, a.h * 0.85); // cabine
  } else {
    // Voiture : caisse + toit arrondi.
    roundRect(ctx, -a.len / 2, -a.h * 0.6, a.len, a.h * 0.6);
    ctx.beginPath();
    ctx.moveTo(-a.len * 0.22, -a.h * 0.6);
    ctx.quadraticCurveTo(-a.len * 0.05, -a.h * 1.15, a.len * 0.12, -a.h * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  // Roues.
  ctx.fillStyle = "#1f1f1f";
  wheel(ctx, -a.len * 0.3, 0, a.h * 0.32);
  wheel(ctx, a.len * 0.3, 0, a.h * 0.32);

  if (selected) {
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.lineWidth = SELECTION_OUTLINE_WIDTH;
    ctx.setLineDash(SELECTION_OUTLINE_DASH);
    ctx.strokeRect(-a.len / 2 - 2, -a.h - 2, a.len + 4, a.h + 6);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h) {
  const r = Math.min(3, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function wheel(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
