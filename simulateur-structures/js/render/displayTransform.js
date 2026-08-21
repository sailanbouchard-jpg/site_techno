// render/displayTransform.js
// ──────────────────────────
// Transformation de VUE uniquement (zoom + déplacement). Les positions des
// nœuds sont les positions PHYSIQUES réelles (en mètres) : la déformation est
// désormais réelle dans le monde (raideurs assouplies, voir physics/config.js),
// il n'y a plus d'amplification d'affichage à appliquer.
//
// "pixels de base" = mètres × PIXELS_PER_METER (zoom ×1, vue non déplacée). Le
// zoom/déplacement est appliqué par renderer.js via ctx.translate+scale ; les
// clics souris repassent par la transformation INVERSE (screenTo*).

import { PIXELS_PER_METER } from "./styleConfig.js";

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

export function screenToBasePixels(screenX, screenY, view) {
  const t = getViewTranslation(view);
  return { x: (screenX - t.x) / view.zoomLevel, y: (screenY - t.y) / view.zoomLevel };
}

export function screenToWorld(screenX, screenY, view) {
  const base = screenToBasePixels(screenX, screenY, view);
  return { x: base.x / PIXELS_PER_METER, y: base.y / PIXELS_PER_METER };
}
