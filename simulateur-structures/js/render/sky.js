// render/sky.js
// ─────────────
// Fond de CIEL : un dégradé doux du haut vers l'horizon, plus quelques nuages
// simples. Dessiné en repère ÉCRAN (avant la transformation de vue) : le ciel
// est un décor, il ne zoome pas. Les nuages dérivent très légèrement avec la
// caméra (parallaxe douce) pour donner une impression de profondeur sans
// distraire. LECTURE SEULE, aucun calcul physique.

import {
  PIXELS_PER_METER,
  SKY_TOP_COLOR, SKY_HORIZON_COLOR, CLOUD_COLOR, CLOUD_SHADE_COLOR,
} from "./styleConfig.js";

// Nuages placés en fraction de l'écran (toujours bien répartis), de tailles
// variées pour éviter l'effet "motif répété" reconnaissable.
const CLOUDS = [
  { fx: 0.13, fy: 0.18, r: 26 },
  { fx: 0.40, fy: 0.11, r: 34 },
  { fx: 0.66, fy: 0.22, r: 22 },
  { fx: 0.87, fy: 0.14, r: 30 },
];

export function drawSky(ctx, canvas, view) {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, SKY_TOP_COLOR);
  g.addColorStop(1, SKY_HORIZON_COLOR);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Parallaxe très douce : les nuages suivent à peine la caméra.
  const ox = -view.cameraX * PIXELS_PER_METER * 0.05;
  const oy = -view.cameraY * PIXELS_PER_METER * 0.05;
  for (const c of CLOUDS) {
    drawCloud(ctx, c.fx * canvas.width + ox, c.fy * canvas.height + oy, c.r);
  }
}

function drawCloud(ctx, x, y, r) {
  ctx.save();
  // Légère ombre en dessous (même silhouette, décalée) pour du volume.
  ctx.fillStyle = CLOUD_SHADE_COLOR;
  blob(ctx, x, y + r * 0.16, r);
  // Corps du nuage, bords adoucis par une ombre portée blanche.
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = r * 0.5;
  ctx.fillStyle = CLOUD_COLOR;
  blob(ctx, x, y, r);
  ctx.restore();
}

// Quelques cercles qui se chevauchent, fondus en une seule forme (un seul fill).
function blob(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x - r * 1.05, y + r * 0.16, r * 0.6, 0, Math.PI * 2);
  ctx.arc(x - r * 0.35, y - r * 0.28, r * 0.78, 0, Math.PI * 2);
  ctx.arc(x + r * 0.45, y - r * 0.12, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 1.15, y + r * 0.18, r * 0.52, 0, Math.PI * 2);
  ctx.arc(x + r * 0.2, y + r * 0.28, r * 0.85, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}
