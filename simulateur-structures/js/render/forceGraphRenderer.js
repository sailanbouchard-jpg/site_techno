// render/forceGraphRenderer.js
// ────────────────────────────
// Rôle : dessiner, dans un petit canvas dédié, la courbe F(t) d'UNE force —
// utilisé par l'éditeur de forces pour visualiser le sinus qu'on est en train
// de régler. LECTURE SEULE : ce fichier ne modifie jamais la force, il se
// contente d'échantillonner evaluateForce() (model/Force.js) pour savoir quoi
// tracer.
//
// Échelle commune à tous les graphiques du projet (cohérence demandée) :
// - échelle verticale = `scale` (px par unité de force), le MÊME nombre que
//   celui utilisé pour la longueur des flèches sur le canvas principal.
// - échelle horizontale = `timeWindowSeconds`, la durée affichée sur toute la
//   largeur du graphique.
// Les deux viennent des sliders globaux de l'éditeur de forces (state.js).
//
// Ne doit PAS contenir : de formule physique (la formule du sinus reste dans
// model/Force.js), de gestion d'événements.
// Dépendances : model/Force.js (evaluateForce), render/styleConfig.js.

import { evaluateForce } from "../model/Force.js";
import {
  FORCE_GRAPH_BACKGROUND,
  FORCE_GRAPH_ZERO_LINE_COLOR,
  FORCE_GRAPH_CURVE_LINE_WIDTH,
  FORCE_GRAPH_SAMPLE_STEP_PX,
} from "./styleConfig.js";

export function drawForceGraph(canvas, force, scale, timeWindowSeconds) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const centerY = height / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = FORCE_GRAPH_BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  // Ligne de référence F = 0, pour juger visuellement du signe de la force.
  ctx.strokeStyle = FORCE_GRAPH_ZERO_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();

  // Échantillonnage de F(t) sur toute la largeur du graphique, converti en
  // pixels avec la même échelle que les flèches du canvas principal — c'est
  // ce qui rend tous les graphiques du projet comparables entre eux.
  ctx.strokeStyle = force.color;
  ctx.lineWidth = FORCE_GRAPH_CURVE_LINE_WIDTH;
  ctx.beginPath();
  for (let px = 0; px <= width; px += FORCE_GRAPH_SAMPLE_STEP_PX) {
    const t = (px / width) * timeWindowSeconds;
    const value = evaluateForce(force, t);
    const y = centerY - value * scale;
    if (px === 0) {
      ctx.moveTo(px, y);
    } else {
      ctx.lineTo(px, y);
    }
  }
  ctx.stroke();
}
