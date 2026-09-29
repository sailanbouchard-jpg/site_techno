// ui/viewControls.js
// ──────────────────
// Commandes de VUE : zoom (boutons, menu, clavier, molette) et cadrage de la
// zone de travail. Le zoom à la molette garde fixe le point du monde situé sous
// le pointeur, comme dans un logiciel de DAO. Ne touche qu'à state.zoomLevel /
// cameraX / cameraY.

import { state } from "../state.js";
import { MESH } from "../model/mesh.js";
import { viewport, screenToWorld } from "../render/displayTransform.js";
import {
  PIXELS_PER_METER, ZOOM_LEVEL_MIN, ZOOM_LEVEL_MAX, ZOOM_STEP, ZOOM_WHEEL_SENSITIVITY, FIT_VIEW_FILL,
  LEVEL_VIEW_FILL_WIDTH, LEVEL_VIEW_FILL_HEIGHT,
} from "../render/styleConfig.js";

function currentView() {
  return {
    zoomLevel: state.zoomLevel, cameraX: state.cameraX, cameraY: state.cameraY,
    canvasWidth: viewport.width, canvasHeight: viewport.height,
  };
}

// Ce qu'on s'autorise à voir AU-DELÀ de la grille, en haut et en bas : une
// fraction de sa hauteur. Un peu d'air de chaque côté évite que le maillage
// colle aux bords de l'écran, sans jamais perdre la scène dans du vide.
const MARGE_HORS_GRILLE = 0.1;

// Hauteur (m) réellement accessible au regard : la grille, plus sa marge des
// deux côtés.
function hauteurVisible() {
  return MESH.rows * MESH.spacing * (1 + 2 * MARGE_HORS_GRILLE);
}

// Zoom MINIMAL : celui où cette hauteur remplit tout juste la vue. On ne dézoome
// pas au-delà — voir plus loin au-dessus ou au-dessous ne montrerait que du
// vide, sans repère ni rien à y construire. Ce plancher suit donc la HAUTEUR de
// la grille (réglable, voir Structure.js::resizeWorldHeight) et la taille de la
// vue : agrandir la grille, c'est s'autoriser à dézoomer plus.
export function zoomMinimal() {
  const pourRemplir = viewport.height / (hauteurVisible() * PIXELS_PER_METER);
  return Math.min(ZOOM_LEVEL_MAX, Math.max(ZOOM_LEVEL_MIN, pourRemplir));
}

function clampZoom(z) {
  return Math.min(ZOOM_LEVEL_MAX, Math.max(zoomMinimal(), z));
}

// Ramène la vue dans la grille ET sa marge : zoom au-dessus du plancher, et
// centre vertical tel qu'on ne déborde ni en haut ni en bas. Appelée à chaque
// image (main.js) : c'est le seul endroit qui garantit l'invariant, quel que
// soit ce qui a bougé la caméra — molette, glissement, cadrage d'un niveau ou
// changement de taille de la vue.
export function clampView() {
  state.zoomLevel = clampZoom(state.zoomLevel);
  const demiHauteurM = viewport.height / (2 * state.zoomLevel * PIXELS_PER_METER);
  const marge = MESH.rows * MESH.spacing * MARGE_HORS_GRILLE;
  const plafond = MESH.originY - marge + demiHauteurM;
  const plancher = MESH.originY + MESH.rows * MESH.spacing + marge - demiHauteurM;
  // plancher < plafond quand la vue est plus haute que tout ce qui est visible
  // (zoom déjà au minimum, mais la grille est minuscule) : on centre, faute de mieux.
  state.cameraY = plancher < plafond
    ? (plafond + plancher) / 2
    : Math.min(plancher, Math.max(plafond, state.cameraY));
}

// Cadre la zone de travail : celle du niveau en cours (même part de l'écran
// pour tous les niveaux, donc un zoom propre à chacun), sinon toute la grille.
export function fitView() {
  const niveau = state.niveauCourant;
  // Un niveau peut IMPOSER son cadrage (zoom + centre, réglés par
  // l'administrateur) : il prime sur le calcul automatique.
  if (niveau && niveau.vue) return appliquerVue(niveau.vue);
  if (niveau && niveau.cadre) return fitBox(niveau.cadre);
  const widthM = MESH.cols * MESH.spacing;
  const heightM = MESH.rows * MESH.spacing;
  state.cameraX = MESH.originX + widthM / 2;
  state.cameraY = MESH.originY + heightM / 2;
  const fit = Math.min(
    (FIT_VIEW_FILL * viewport.width) / (widthM * PIXELS_PER_METER),
    viewport.height / (heightM * PIXELS_PER_METER),
  );
  state.zoomLevel = clampZoom(Math.round(fit * 10) / 10);
}

function appliquerVue(vue) {
  state.cameraX = vue.centreX;
  state.cameraY = vue.centreY;
  state.zoomLevel = clampZoom(vue.zoom);
}

// Centre la vue sur un rectangle monde { x0, x1, y0, y1 } (m) : sa largeur
// occupe LEVEL_VIEW_FILL_WIDTH de l'écran, sa hauteur doit tenir entièrement.
function fitBox(box) {
  state.cameraX = (box.x0 + box.x1) / 2;
  state.cameraY = (box.y0 + box.y1) / 2;
  const zoom = Math.min(
    (LEVEL_VIEW_FILL_WIDTH * viewport.width) / ((box.x1 - box.x0) * PIXELS_PER_METER),
    (LEVEL_VIEW_FILL_HEIGHT * viewport.height) / ((box.y1 - box.y0) * PIXELS_PER_METER),
  );
  state.zoomLevel = clampZoom(Math.round(zoom * 100) / 100);
}

// Zoome d'un facteur en gardant fixe le point écran (sx, sy) — par défaut le centre.
export function zoomAt(factor, sx = viewport.width / 2, sy = viewport.height / 2) {
  const before = screenToWorld(sx, sy, currentView());
  state.zoomLevel = clampZoom(state.zoomLevel * factor);
  const after = screenToWorld(sx, sy, currentView());
  state.cameraX += before.x - after.x;
  state.cameraY += before.y - after.y;
}

export function zoomIn() {
  zoomAt(ZOOM_STEP);
}

export function zoomOut() {
  zoomAt(1 / ZOOM_STEP);
}

export function canZoomIn() {
  return state.zoomLevel < ZOOM_LEVEL_MAX - 1e-6;
}

export function canZoomOut() {
  return state.zoomLevel > zoomMinimal() + 1e-6;
}

export function initWheelZoom(canvas) {
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * ZOOM_WHEEL_SENSITIVITY), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
}
