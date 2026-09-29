// render/displayTransform.js
// ──────────────────────────
// Transformation de VUE uniquement (zoom + déplacement). Les positions des
// nœuds sont les positions PHYSIQUES réelles (en mètres) : la déformation est
// réelle dans le monde (raideurs assouplies, voir physics/config.js), il n'y a
// pas d'amplification d'affichage à appliquer.
//
// "pixels de base" = mètres × PIXELS_PER_METER (zoom ×1, vue non déplacée).
// Toute la géométrie de vue travaille en pixels CSS ; la densité de l'écran
// (devicePixelRatio) n'intervient qu'au moment de dessiner, pour un rendu net
// sur les écrans à 125-150 %.

import { PIXELS_PER_METER } from "./styleConfig.js";

// Taille CSS de la zone de dessin et densité de l'écran, tenues à jour par
// main.js (fitCanvasToViewport) et lues par le rendu comme par la souris.
export const viewport = { width: 0, height: 0, pixelRatio: 1 };

export function worldToBasePixels(worldPos) {
  return { x: worldPos.x * PIXELS_PER_METER, y: worldPos.y * PIXELS_PER_METER };
}

export function getViewTranslation(view) {
  const baseCameraX = view.cameraX * PIXELS_PER_METER;
  const baseCameraY = view.cameraY * PIXELS_PER_METER;
  return {
    x: view.canvasWidth / 2 - view.zoomLevel * baseCameraX,
    y: view.canvasHeight / 2 - view.zoomLevel * baseCameraY,
  };
}

// Pixels de base → pixels écran (CSS), pour les annotations de taille constante.
export function basePixelsToScreen(p, view) {
  const t = getViewTranslation(view);
  return { x: t.x + p.x * view.zoomLevel, y: t.y + p.y * view.zoomLevel };
}

export function worldToScreen(worldPos, view) {
  return basePixelsToScreen(worldToBasePixels(worldPos), view);
}

export function screenToBasePixels(screenX, screenY, view) {
  const t = getViewTranslation(view);
  return { x: (screenX - t.x) / view.zoomLevel, y: (screenY - t.y) / view.zoomLevel };
}

export function screenToWorld(screenX, screenY, view) {
  const base = screenToBasePixels(screenX, screenY, view);
  return { x: base.x / PIXELS_PER_METER, y: base.y / PIXELS_PER_METER };
}
