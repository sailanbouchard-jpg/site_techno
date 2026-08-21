// render/backgroundCache.js
// ─────────────────────────
// DEUX COUCHES de décor mises en cache dans des canvas HORS ÉCRAN :
//   back  = ciel + nuages + quadrillage (derrière les particules de vent) ;
//   front = sol/relief (devant les particules — le terrain masque le vent qui
//           passerait « sous » lui, comme dans l'ordre de dessin d'origine).
//
// POURQUOI : ces couches étaient redessinées à CHAQUE image (dégradé du ciel
// recréé, nuages avec shadowBlur — coûteux —, centaines de lignes de grille,
// polygones de relief) alors qu'elles ne changent que lorsque la VUE bouge
// (zoom/déplacement/redimensionnement) ou que le RELIEF est modifié. On les
// rend une fois dans des canvas hors écran, puis chaque image se contente de
// deux drawImage (quasi gratuits). Pendant un déplacement de caméra, le cache
// se reconstruit à chaque image : coût identique à avant, jamais pire.
//
// Invalidation : taille du canvas, zoom, caméra, structure remplacée
// (chargement/réinitialisation) ou version du relief (structure._terrainVersion,
// incrémentée par model/Structure.js à chaque modification du sol).

import { drawSky } from "./sky.js";
import { drawGrid } from "./grid.js";
import { drawTerrain } from "./terrainRenderer.js";
import { getViewTranslation } from "./displayTransform.js";

let cache = null;

export function getStaticLayers(canvas, view, structure) {
  const terrainVersion = structure._terrainVersion || 0;
  if (
    cache &&
    cache.w === canvas.width && cache.h === canvas.height &&
    cache.zoom === view.zoomLevel &&
    cache.camX === view.cameraX && cache.camY === view.cameraY &&
    cache.structure === structure &&
    cache.terrainVersion === terrainVersion
  ) {
    return cache;
  }

  if (!cache || cache.w !== canvas.width || cache.h !== canvas.height) {
    const back = document.createElement("canvas");
    const front = document.createElement("canvas");
    back.width = front.width = canvas.width;
    back.height = front.height = canvas.height;
    cache = { back, front };
  }
  cache.w = canvas.width;
  cache.h = canvas.height;
  cache.zoom = view.zoomLevel;
  cache.camX = view.cameraX;
  cache.camY = view.cameraY;
  cache.structure = structure;
  cache.terrainVersion = terrainVersion;

  const t = getViewTranslation(view);

  // Couche ARRIÈRE : ciel (repère écran) + quadrillage (repère monde).
  const backCtx = cache.back.getContext("2d");
  backCtx.clearRect(0, 0, cache.w, cache.h);
  drawSky(backCtx, cache.back, view);
  backCtx.save();
  backCtx.translate(t.x, t.y);
  backCtx.scale(view.zoomLevel, view.zoomLevel);
  drawGrid(backCtx, view);
  backCtx.restore();

  // Couche AVANT : sol/relief (repère monde), fond transparent.
  const frontCtx = cache.front.getContext("2d");
  frontCtx.clearRect(0, 0, cache.w, cache.h);
  frontCtx.save();
  frontCtx.translate(t.x, t.y);
  frontCtx.scale(view.zoomLevel, view.zoomLevel);
  drawTerrain(frontCtx, structure);
  frontCtx.restore();

  return cache;
}
