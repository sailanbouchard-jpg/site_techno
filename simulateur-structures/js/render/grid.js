// render/grid.js
// ──────────────
// Le QUADRILLAGE de construction (façon papier millimétré / blueprint), à TROIS
// niveaux : très fines lignes à chaque maille (50 cm), lignes moyennes tous les
// 1 m, lignes épaisses tous les 5 m, plus un cadre autour de la zone. Met aussi
// en évidence le point survolé (où le prochain clic va s'accrocher).
//
// Dessiné dans le contexte DÉJÀ transformé par la vue : on divise les épaisseurs
// par le zoom pour qu'elles restent constantes à l'écran. LECTURE SEULE.

import { MESH, gridToWorld } from "../model/mesh.js";
import { worldToBasePixels } from "./displayTransform.js";
import {
  PIXELS_PER_METER,
  GRID_MAJOR_EVERY, GRID_MEDIUM_EVERY,
  GRID_FINE_COLOR, GRID_MEDIUM_COLOR, GRID_MAJOR_COLOR,
  GRID_FINE_WIDTH, GRID_MEDIUM_WIDTH, GRID_MAJOR_WIDTH, GRID_FRAME_COLOR,
  GRID_HOVER_COLOR, GRID_HOVER_RING, GRID_HOVER_RADIUS,
} from "./styleConfig.js";

const ppm = PIXELS_PER_METER;

export function drawGrid(ctx, view) {
  const zoom = view.zoomLevel || 1;
  const sp = MESH.spacing * ppm; // espacement d'une maille, en px de base
  const x1 = MESH.cols * sp;
  const y1 = MESH.rows * sp;

  // Du plus fin au plus fort (3 passes pour grouper les traits par style).
  strokeLines(ctx, sp, x1, y1, GRID_FINE_WIDTH / zoom, GRID_FINE_COLOR,
    (k) => k % GRID_MEDIUM_EVERY !== 0); // 50 cm : ni 1 m ni 5 m
  strokeLines(ctx, sp, x1, y1, GRID_MEDIUM_WIDTH / zoom, GRID_MEDIUM_COLOR,
    (k) => k % GRID_MEDIUM_EVERY === 0 && k % GRID_MAJOR_EVERY !== 0); // 1 m
  strokeLines(ctx, sp, x1, y1, GRID_MAJOR_WIDTH / zoom, GRID_MAJOR_COLOR,
    (k) => k % GRID_MAJOR_EVERY === 0); // 5 m

  // Cadre du plan de travail.
  ctx.save();
  ctx.lineWidth = GRID_MAJOR_WIDTH / zoom;
  ctx.strokeStyle = GRID_FRAME_COLOR;
  ctx.strokeRect(0, 0, x1, y1);
  ctx.restore();
}

function strokeLines(ctx, sp, x1, y1, width, color, keep) {
  ctx.save();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= MESH.cols; i++) {
    if (!keep(i)) continue;
    const x = i * sp;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, y1);
  }
  for (let j = 0; j <= MESH.rows; j++) {
    if (!keep(j)) continue;
    const y = j * sp;
    ctx.moveTo(0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Marqueur du point du maillage survolé (outils Poutre / Sol / Ancrer) : un petit
// disque cerclé qui montre où l'accrochage va se faire.
export function drawHoverMarker(ctx, hoverGrid, view) {
  if (!hoverGrid) return;
  const zoom = view.zoomLevel || 1;
  const p = worldToBasePixels(gridToWorld(hoverGrid.i, hoverGrid.j));
  const r = GRID_HOVER_RADIUS / zoom;

  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = GRID_HOVER_COLOR;
  ctx.fill();
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = GRID_HOVER_RING;
  ctx.stroke();
  ctx.restore();
}
