// render/grid.js
// ──────────────
// La GRILLE DE CONCEPTION, visible en mode Conception seulement (l'essai se
// regarde sur la scène nue) : un voile léger sur la zone constructible, puis des
// lignes à trois niveaux — 50 cm (seulement si l'on est assez près pour les
// distinguer), 1 m, 5 m — et le cadre de la zone.
//
// Tracée en pixels ÉCRAN, calée sur les pixels : des traits d'un pixel nets à
// tous les zooms. LECTURE SEULE.

import { MESH } from "../model/mesh.js";
import { getViewTranslation } from "./displayTransform.js";
import {
  PIXELS_PER_METER,
  GRID_VEIL, GRID_LINE_RGB, GRID_FINE_ALPHA, GRID_MEDIUM_ALPHA, GRID_MAJOR_ALPHA, GRID_FRAME_ALPHA,
  GRID_MAJOR_EVERY, GRID_MEDIUM_EVERY, GRID_FINE_MIN_PX,
} from "./styleConfig.js";

export function drawDesignGrid(ctx, view) {
  const mPx = PIXELS_PER_METER * view.zoomLevel;
  const t = getViewTranslation(view);
  const sp = MESH.spacing * mPx;
  const x0 = t.x + MESH.originX * mPx;
  const y0 = t.y + MESH.originY * mPx;
  const x1 = x0 + MESH.cols * sp;
  const y1 = y0 + MESH.rows * sp;
  const clip = {
    x0: Math.max(0, x0), x1: Math.min(view.canvasWidth, x1),
    y0: Math.max(0, y0), y1: Math.min(view.canvasHeight, y1),
  };
  if (clip.x1 <= clip.x0 || clip.y1 <= clip.y0) return;

  ctx.fillStyle = GRID_VEIL;
  ctx.fillRect(clip.x0, clip.y0, clip.x1 - clip.x0, clip.y1 - clip.y0);

  const isMajor = (k) => k % GRID_MAJOR_EVERY === 0;
  const isMedium = (k) => k % GRID_MEDIUM_EVERY === 0 && !isMajor(k);
  const isFine = (k) => k % GRID_MEDIUM_EVERY !== 0;
  ctx.save();
  ctx.lineWidth = 1;
  if (sp >= GRID_FINE_MIN_PX) strokeLines(ctx, x0, y0, sp, clip, isFine, GRID_FINE_ALPHA);
  strokeLines(ctx, x0, y0, sp, clip, isMedium, GRID_MEDIUM_ALPHA);
  strokeLines(ctx, x0, y0, sp, clip, isMajor, GRID_MAJOR_ALPHA);
  ctx.strokeStyle = `rgba(${GRID_LINE_RGB}, ${GRID_FRAME_ALPHA})`;
  ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
  ctx.restore();
}

function strokeLines(ctx, x0, y0, sp, clip, keep, alpha) {
  ctx.beginPath();
  const iStart = Math.max(0, Math.ceil((clip.x0 - x0) / sp));
  const iEnd = Math.min(MESH.cols, Math.floor((clip.x1 - x0) / sp));
  for (let i = iStart; i <= iEnd; i++) {
    if (!keep(i)) continue;
    const x = Math.round(x0 + i * sp) + 0.5;
    ctx.moveTo(x, clip.y0);
    ctx.lineTo(x, clip.y1);
  }
  const jStart = Math.max(0, Math.ceil((clip.y0 - y0) / sp));
  const jEnd = Math.min(MESH.rows, Math.floor((clip.y1 - y0) / sp));
  for (let j = jStart; j <= jEnd; j++) {
    if (!keep(j)) continue;
    const y = Math.round(y0 + j * sp) + 0.5;
    ctx.moveTo(clip.x0, y);
    ctx.lineTo(clip.x1, y);
  }
  ctx.strokeStyle = `rgba(${GRID_LINE_RGB}, ${alpha})`;
  ctx.stroke();
}
