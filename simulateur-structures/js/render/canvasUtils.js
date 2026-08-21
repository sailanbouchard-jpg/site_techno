// render/canvasUtils.js
// ─────────────────────
// Rôle : petites fonctions utilitaires de dessin réutilisables (flèche,
// symbole d'ancrage, clamp numérique). Pure aide graphique : ne lit jamais
// l'état de l'application (state.js), ne fait aucun calcul physique.
//
// Ne doit PAS contenir : de formule physique, de lecture de state.js.
// Dépendances : render/styleConfig.js (tailles), API Canvas2D.

import {
  ANCHOR_SYMBOL_WIDTH,
  ANCHOR_SYMBOL_OFFSET_Y,
  ANCHOR_HATCH_COUNT,
  ANCHOR_HATCH_LENGTH,
  FORCE_ARROW_HEAD_LENGTH,
  FORCE_ARROW_LINE_WIDTH,
} from "./styleConfig.js";

// Dessine une flèche pleine de `(fromX, fromY)` vers `(toX, toY)`.
export function drawArrow(ctx, fromX, fromY, toX, toY, color) {
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = FORCE_ARROW_LINE_WIDTH;

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Pointe de la flèche : deux petits traits formant un "V" inversé, repliés
  // de part et d'autre de l'axe de la flèche.
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - FORCE_ARROW_HEAD_LENGTH * Math.cos(angle - Math.PI / 6),
    toY - FORCE_ARROW_HEAD_LENGTH * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - FORCE_ARROW_HEAD_LENGTH * Math.cos(angle + Math.PI / 6),
    toY - FORCE_ARROW_HEAD_LENGTH * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

// Dessine le symbole d'un appui sous un nœud fixe, centré en `(x, y)`. Deux
// symboles normalisés selon le type de liaison :
//   • ENCASTREMENT (clamped) : sol hachuré AU DROIT du nœud (la poutre entre dans
//     un « mur » rigide) → l'orientation est tenue.
//   • PIVOT LIBRE (par défaut) : un petit TRIANGLE (rotule) posé sur un sol
//     hachuré → la rotation est libre.
export function drawAnchorSymbol(ctx, x, y, color, clamped = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  if (clamped) {
    const y0 = y + ANCHOR_SYMBOL_OFFSET_Y;
    ctx.beginPath();
    ctx.moveTo(x - ANCHOR_SYMBOL_WIDTH / 2, y0);
    ctx.lineTo(x + ANCHOR_SYMBOL_WIDTH / 2, y0);
    ctx.stroke();
    hatchLine(ctx, x, y0);
    return;
  }

  // Pivot : triangle (apex au nœud) posé sur une ligne de sol hachurée.
  const half = ANCHOR_SYMBOL_WIDTH / 2;
  const baseY = y + ANCHOR_SYMBOL_OFFSET_Y + 3;
  ctx.beginPath();
  ctx.moveTo(x, y + 2);
  ctx.lineTo(x - half, baseY);
  ctx.lineTo(x + half, baseY);
  ctx.closePath();
  ctx.stroke();
  hatchLine(ctx, x, baseY);
}

// Ligne de sol horizontale + hachures diagonales sous elle, centrée en x.
function hatchLine(ctx, x, yLine) {
  ctx.beginPath();
  ctx.moveTo(x - ANCHOR_SYMBOL_WIDTH / 2, yLine);
  ctx.lineTo(x + ANCHOR_SYMBOL_WIDTH / 2, yLine);
  ctx.stroke();
  for (let i = 0; i < ANCHOR_HATCH_COUNT; i++) {
    const hatchX = x - ANCHOR_SYMBOL_WIDTH / 2 + (i * ANCHOR_SYMBOL_WIDTH) / (ANCHOR_HATCH_COUNT - 1);
    ctx.beginPath();
    ctx.moveTo(hatchX, yLine);
    ctx.lineTo(hatchX - ANCHOR_HATCH_LENGTH / 2, yLine + ANCHOR_HATCH_LENGTH);
    ctx.stroke();
  }
}

// Borne `value` entre `min` et `max` — utilisé pour que les largeurs de trait
// dérivées d'une grandeur réelle (ex. l'épaisseur d'une poutre) restent dans
// une plage lisible à l'écran, même pour des valeurs extrêmes.
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
