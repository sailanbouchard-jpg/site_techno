// render/rulers.js
// ────────────────
// Règles graduées en mètres le long des bords HAUT et GAUCHE de la vue, comme
// dans un logiciel de DAO (mode Conception seulement). Le pas des graduations
// s'adapte au zoom ; un repère d'accent suit le pointeur.
//
// Axe vertical : hauteur au-dessus du bas de la grille (on lit « en montant »),
// même convention que les coordonnées de la barre d'état. Pixels ÉCRAN, LECTURE SEULE.

import { MESH } from "../model/mesh.js";
import { getViewTranslation } from "./displayTransform.js";
import { formatDecimal } from "../units.js";
import {
  PIXELS_PER_METER, ACCENT_COLOR,
  RULER_SIZE_PX, RULER_BG_TOP, RULER_BG_BOTTOM, RULER_BORDER, RULER_TICK, RULER_TEXT, RULER_FONT,
  RULER_MIN_LABEL_SPACING_PX,
} from "./styleConfig.js";

// Couples (graduation chiffrée, graduation fine) en mètres, du plus fin au plus large.
const STEPS = [[1, 0.5], [2, 0.5], [5, 1], [10, 2], [20, 5], [50, 10], [100, 20]];

// Hauteur (m) affichée pour une ordonnée monde y (Y vers le bas).
export function heightAbove(y) {
  return MESH.originY + MESH.rows * MESH.spacing - y;
}

function formatMeters(v) {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : formatDecimal(r, 1);
}

export function drawRulers(ctx, view, pointer) {
  const w = view.canvasWidth;
  const h = view.canvasHeight;
  const s = RULER_SIZE_PX;
  const mPx = PIXELS_PER_METER * view.zoomLevel;
  const t = getViewTranslation(view);
  const [major, minor] = STEPS.find(([m]) => m * mPx >= RULER_MIN_LABEL_SPACING_PX) || STEPS[STEPS.length - 1];

  ctx.save();
  const gTop = ctx.createLinearGradient(0, 0, 0, s);
  gTop.addColorStop(0, RULER_BG_TOP);
  gTop.addColorStop(1, RULER_BG_BOTTOM);
  ctx.fillStyle = gTop;
  ctx.fillRect(0, 0, w, s);
  const gLeft = ctx.createLinearGradient(0, 0, s, 0);
  gLeft.addColorStop(0, RULER_BG_TOP);
  gLeft.addColorStop(1, RULER_BG_BOTTOM);
  ctx.fillStyle = gLeft;
  ctx.fillRect(0, s, s, h - s);

  ctx.font = RULER_FONT;
  ctx.fillStyle = RULER_TEXT;
  ctx.strokeStyle = RULER_TICK;
  ctx.lineWidth = 1;

  // Règle horizontale : abscisses monde.
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.beginPath();
  const xMin = (s - t.x) / mPx;
  const xMax = (w - t.x) / mPx;
  for (let k = Math.ceil(xMin / minor); k * minor <= xMax; k++) {
    const x = k * minor;
    const px = Math.round(t.x + x * mPx) + 0.5;
    const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    const len = isMajor ? s * 0.5 : s * 0.25;
    ctx.moveTo(px, s - len);
    ctx.lineTo(px, s);
    if (isMajor) ctx.fillText(formatMeters(x), px + 2.5, 2);
  }
  ctx.stroke();

  // Règle verticale : hauteurs, étiquettes tournées d'un quart de tour.
  ctx.beginPath();
  const hMax = heightAbove((s - t.y) / mPx);
  const hMin = heightAbove((h - t.y) / mPx);
  for (let k = Math.ceil(hMin / minor); k * minor <= hMax; k++) {
    const v = k * minor;
    const py = Math.round(t.y + (MESH.originY + MESH.rows * MESH.spacing - v) * mPx) + 0.5;
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const len = isMajor ? s * 0.5 : s * 0.25;
    ctx.moveTo(s - len, py);
    ctx.lineTo(s, py);
    if (isMajor) {
      ctx.save();
      ctx.translate(2, py - 2.5);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(formatMeters(v), 0, 0);
      ctx.restore();
    }
  }
  ctx.stroke();

  // Repère du pointeur.
  if (pointer) {
    ctx.strokeStyle = ACCENT_COLOR;
    ctx.beginPath();
    const px = Math.round(t.x + pointer.x * mPx) + 0.5;
    const py = Math.round(t.y + pointer.y * mPx) + 0.5;
    if (px > s) { ctx.moveTo(px, 0); ctx.lineTo(px, s); }
    if (py > s) { ctx.moveTo(0, py); ctx.lineTo(s, py); }
    ctx.stroke();
  }

  // Filets de bordure et coin.
  ctx.fillStyle = RULER_BG_BOTTOM;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = RULER_BORDER;
  ctx.beginPath();
  ctx.moveTo(0, s - 0.5); ctx.lineTo(w, s - 0.5);
  ctx.moveTo(s - 0.5, 0); ctx.lineTo(s - 0.5, h);
  ctx.stroke();
  ctx.restore();
}
