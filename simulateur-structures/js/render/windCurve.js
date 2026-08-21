// render/windCurve.js
// ───────────────────
// Dessine la COURBE de vent prévisualisée (les 30 premières secondes du signal
// w(t)) sur son propre petit canvas, dans l'éditeur de vent. L'échelle verticale
// s'adapte TOUTE SEULE aux valeurs min/max du signal (le vent peut être négatif,
// soit de droite à gauche : la ligne du zéro est alors visible au milieu).
// LECTURE SEULE — ne touche ni à l'état ni à la physique.

import { sampleWindCurve, WIND_PREVIEW_DURATION } from "../physics/wind.js";
import {
  WIND_CURVE_BG, WIND_CURVE_GRID, WIND_CURVE_ZERO, WIND_CURVE_AXIS_TEXT,
  WIND_CURVE_LINE, WIND_CURVE_FILL_POS, WIND_CURVE_FILL_NEG,
} from "./styleConfig.js";

const PAD_L = 34; // marge gauche (étiquettes m/s)
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 16; // marge basse (étiquettes temps)

export function drawWindCurvePreview(ctx, canvas, wind) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Fond arrondi.
  ctx.fillStyle = WIND_CURVE_BG;
  ctx.fillRect(0, 0, W, H);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  if (plotW <= 4 || plotH <= 4) return;

  const { ts, values, min, max, duration } = sampleWindCurve(wind, WIND_PREVIEW_DURATION, Math.max(60, Math.floor(plotW)));

  // Échelle verticale auto : on inclut TOUJOURS le zéro, avec une petite marge.
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (hi - lo < 1e-3) { hi = 1; lo = -1; } // vent quasi nul : échelle symbolique
  const span = hi - lo;
  lo -= span * 0.08;
  hi += span * 0.08;

  const xAt = (t) => PAD_L + (t / duration) * plotW;
  const yAt = (v) => PAD_T + (1 - (v - lo) / (hi - lo)) * plotH;

  // Grille verticale : tous les 5 s.
  ctx.strokeStyle = WIND_CURVE_GRID;
  ctx.lineWidth = 1;
  ctx.fillStyle = WIND_CURVE_AXIS_TEXT;
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let t = 0; t <= duration; t += 5) {
    const x = xAt(t);
    ctx.beginPath();
    ctx.moveTo(x, PAD_T);
    ctx.lineTo(x, PAD_T + plotH);
    ctx.stroke();
    ctx.fillText(`${t}s`, x, PAD_T + plotH + 3);
  }

  // Ligne du zéro (repère du sens du vent : au-dessus = vers la droite).
  const y0 = yAt(0);
  ctx.strokeStyle = WIND_CURVE_ZERO;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(PAD_L, y0);
  ctx.lineTo(PAD_L + plotW, y0);
  ctx.stroke();

  // Étiquettes m/s (max en haut, min en bas, 0 sur la ligne).
  ctx.fillStyle = WIND_CURVE_AXIS_TEXT;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`${max.toFixed(1)}`, PAD_L - 4, yAt(max));
  ctx.fillText(`${min.toFixed(1)}`, PAD_L - 4, yAt(min));
  ctx.fillText("0", PAD_L - 4, y0);

  // Remplissage sous la courbe, teinté selon le sens (positif / négatif).
  fillArea(ctx, ts, values, xAt, yAt, y0, true, WIND_CURVE_FILL_POS);
  fillArea(ctx, ts, values, xAt, yAt, y0, false, WIND_CURVE_FILL_NEG);

  // La courbe elle-même.
  ctx.strokeStyle = WIND_CURVE_LINE;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = xAt(ts[i]);
    const y = yAt(values[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Remplit l'aire entre la courbe et la ligne du zéro, uniquement du côté demandé
// (positif = au-dessus du zéro / vers la droite, négatif = en dessous).
function fillArea(ctx, ts, values, xAt, yAt, y0, positive, color) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(xAt(ts[0]), y0);
  for (let i = 0; i < values.length; i++) {
    const v = positive ? Math.max(0, values[i]) : Math.min(0, values[i]);
    ctx.lineTo(xAt(ts[i]), yAt(v));
  }
  ctx.lineTo(xAt(ts[ts.length - 1]), y0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}
