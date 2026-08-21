// render/windRenderer.js
// ──────────────────────
// Dessine les PARTICULES de vent (leurs traînées) dans le repère MONDE, entre le
// quadrillage et le sol : le vent passe donc derrière le relief et les poutres.
// LECTURE SEULE. La traînée de chaque particule est un tableau plat
// [x, y, t, x, y, t, …] (mètres, temps simulé) rempli par windParticles.js.

import { MODES } from "../state.js";
import {
  PIXELS_PER_METER,
  WIND_PARTICLE_COLOR, WIND_PARTICLE_WIDTH_PX,
  WIND_TRAIL_ALPHA, WIND_HEAD_ALPHA, WIND_HEAD_RADIUS_PX,
} from "./styleConfig.js";

export function drawWindParticles(ctx, state) {
  if (state.mode !== MODES.SIMULATION) return;
  if (!state.wind || !state.wind.enabled) return;
  const rt = state.windRuntime;
  // rt.particles est l'ÉTAT des particules (objet { particles:[...], ... }) :
  // le tableau des particules est rt.particles.particles.
  const ps = rt && rt.particles;
  if (!ps || !ps.particles || ps.particles.length === 0) return;

  const zoom = state.zoomLevel || 1;
  const P = PIXELS_PER_METER;
  const width = WIND_PARTICLE_WIDTH_PX / zoom; // largeur ~constante à l'écran
  const headR = WIND_HEAD_RADIUS_PX / zoom;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = WIND_PARTICLE_COLOR;
  ctx.lineWidth = width;

  // Corps des traînées : une passe à alpha doux (le gros du fil), une passe sur
  // le tiers RÉCENT à alpha plus fort (donne le sens et la « tête » du fil).
  for (const p of ps.particles) {
    const tr = p.trail;
    if (tr.length < 6) continue; // moins de 2 points : rien à tracer

    const n = tr.length / 3; // nombre de points
    const recentStart = Math.max(0, Math.floor(n * 0.66));

    ctx.globalAlpha = WIND_TRAIL_ALPHA;
    ctx.beginPath();
    ctx.moveTo(tr[0] * P, tr[1] * P);
    for (let k = 1; k < n; k++) ctx.lineTo(tr[k * 3] * P, tr[k * 3 + 1] * P);
    ctx.stroke();

    ctx.globalAlpha = WIND_HEAD_ALPHA;
    ctx.beginPath();
    ctx.moveTo(tr[recentStart * 3] * P, tr[recentStart * 3 + 1] * P);
    for (let k = recentStart + 1; k < n; k++) ctx.lineTo(tr[k * 3] * P, tr[k * 3 + 1] * P);
    ctx.stroke();

    // Petite tête lumineuse à la position courante (dernier point).
    const hx = tr[(n - 1) * 3] * P;
    const hy = tr[(n - 1) * 3 + 1] * P;
    ctx.beginPath();
    ctx.arc(hx, hy, headR, 0, Math.PI * 2);
    ctx.fillStyle = WIND_PARTICLE_COLOR;
    ctx.fill();
  }

  ctx.restore();
}
