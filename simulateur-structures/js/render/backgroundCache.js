// render/backgroundCache.js
// ─────────────────────────
// DEUX COUCHES de décor mises en cache dans des canvas HORS ÉCRAN :
//   back  = ciel, nuages, relief lointain, rivière et — en mode Conception — la
//           grille (derrière les particules de vent) ;
//   front = sol des niveaux (devant les particules : le relief masque le vent
//           qui passerait « sous » lui).
//
// POURQUOI : ces couches ne changent que lorsque la VUE bouge (zoom, déplacement,
// redimensionnement), que le RELIEF est modifié ou que l'on passe de la
// conception à l'essai (la grille apparaît / disparaît). On les rend une fois,
// puis chaque image se contente de deux drawImage. Pendant un déplacement de la
// vue, le cache se reconstruit à chaque image : jamais plus cher qu'un rendu direct.
//
// Les canvas sont à la résolution RÉELLE de l'écran (pixelRatio) : le décor
// reste net sur un écran à 125-150 %.

import { MESH } from "../model/mesh.js";
import { drawEnvironment } from "./environment.js";
import { drawDesignGrid } from "./grid.js";
import { drawTerrain } from "./terrainRenderer.js";
import { drawBoats } from "./boatRenderer.js";
import { getViewTranslation } from "./displayTransform.js";

let cache = null;

export function getStaticLayers(view, structure, showGrid, pixelRatio) {
  const w = Math.max(1, Math.round(view.canvasWidth * pixelRatio)); // jamais de canvas vide
  const h = Math.max(1, Math.round(view.canvasHeight * pixelRatio));
  const terrainVersion = structure._terrainVersion || 0;
  if (
    cache &&
    cache.w === w && cache.h === h && cache.pixelRatio === pixelRatio &&
    cache.zoom === view.zoomLevel &&
    cache.camX === view.cameraX && cache.camY === view.cameraY &&
    cache.structure === structure &&
    cache.terrainVersion === terrainVersion &&
    cache.showGrid === showGrid &&
    cache.meshCols === MESH.cols && cache.meshOriginX === MESH.originX
  ) {
    return cache;
  }

  if (!cache || cache.w !== w || cache.h !== h) {
    const back = document.createElement("canvas");
    const front = document.createElement("canvas");
    back.width = front.width = w;
    back.height = front.height = h;
    cache = { back, front };
  }
  Object.assign(cache, {
    w, h, pixelRatio,
    zoom: view.zoomLevel, camX: view.cameraX, camY: view.cameraY,
    structure, terrainVersion, showGrid,
    meshCols: MESH.cols, meshOriginX: MESH.originX,
  });

  // Couche ARRIÈRE : tout en pixels écran (CSS), mis à l'échelle de l'écran.
  const backCtx = cache.back.getContext("2d");
  backCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  drawEnvironment(backCtx, view);
  if (showGrid) drawDesignGrid(backCtx, view);

  // Couche AVANT : sol en pixels de base (repère monde), fond transparent.
  const t = getViewTranslation(view);
  const frontCtx = cache.front.getContext("2d");
  frontCtx.setTransform(1, 0, 0, 1, 0, 0);
  frontCtx.clearRect(0, 0, w, h);
  const s = pixelRatio * view.zoomLevel;
  frontCtx.setTransform(s, 0, 0, s, pixelRatio * t.x, pixelRatio * t.y);
  drawTerrain(frontCtx, structure, view);
  drawBoats(frontCtx, structure); // décor statique, comme le sol

  return cache;
}
