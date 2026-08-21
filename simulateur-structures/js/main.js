// main.js
// ───────
// Point d'entrée : initialise une scène vide (maillage prêt), branche l'UI, et
// fait tourner la boucle d'animation (accumulateur de temps fixe + rendu).
// SEUL fichier qui appelle simulationEngine.step().

import { state, MODES } from "./state.js";
import { step } from "./physics/simulationEngine.js";
import { stepWindSim } from "./physics/windSim.js";
import { draw } from "./render/renderer.js";
import { initToolbar, updateTimeDisplay, updateStructureWeightDisplay } from "./ui/toolbar.js";
import { updateWindDisplay } from "./ui/windPanel.js";
import { initStructureEditor } from "./ui/structureEditor.js";
import { initTestCasePanel } from "./ui/testCasePanel.js";
import { renderInspector, updateLiveInspector } from "./ui/inspector.js";
import { PHYSICS_DT, MAX_STEPS_PER_FRAME, PHYSICS_BUDGET_MS } from "./physics/config.js";
import { PIXELS_PER_METER, ZOOM_LEVEL_MIN, ZOOM_LEVEL_MAX } from "./render/styleConfig.js";
import { MESH } from "./model/mesh.js";

const canvas = document.getElementById("simulation-canvas");
const ctx = canvas.getContext("2d");

let timeAccumulator = 0;
let lastFrameTimestamp = null;

// Rythme de mise à jour des affichages DOM (temps, poids, inspecteur) : 10 Hz
// suffisent largement à l'œil, et chaque écriture DOM par image coûte cher sur
// machine faible (recalcul de style). Le canvas, lui, reste à pleine cadence.
const UI_REFRESH_PERIOD_MS = 100;
let lastUiRefreshTimestamp = -Infinity;

// Le canvas occupe TOUT l'écran (l'interface flotte dessus) : sa résolution
// interne suit sa taille CSS. Appelé à l'init et à chaque redimensionnement de
// la fenêtre — la caméra vise un point MONDE, la vue reste donc centrée au même
// endroit, et le cache de fond se reconstruit tout seul (backgroundCache.js).
function fitCanvasToViewport() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w > 0 && canvas.width !== w) canvas.width = w;
  if (h > 0 && canvas.height !== h) canvas.height = h;
}

// Vue de départ : centrée sur le MILIEU de la grille, avec un zoom qui la fait
// tenir confortablement dans la fenêtre (≈ 80 % de la largeur), borné aux
// limites de zoom. L'utilisateur reste libre de zoomer/déplacer ensuite.
function frameGridInView() {
  const gridWidthM = MESH.cols * MESH.spacing;
  const gridHeightM = MESH.rows * MESH.spacing;
  state.cameraX = MESH.originX + gridWidthM / 2;
  state.cameraY = MESH.originY + gridHeightM / 2;
  const fitZoom = (0.8 * canvas.width) / (gridWidthM * PIXELS_PER_METER);
  state.zoomLevel = Math.min(ZOOM_LEVEL_MAX, Math.max(ZOOM_LEVEL_MIN, Math.round(fitZoom * 10) / 10));
}

function resetTimeAccumulator() {
  timeAccumulator = 0;
}

function animationLoop(timestamp) {
  if (lastFrameTimestamp === null) lastFrameTimestamp = timestamp;
  // Ralenti : on injecte MOINS de temps réel dans l'accumulateur (×0,1 → 10× plus
  // lent), donc moins de pas physiques par image. Le pas PHYSICS_DT, lui, ne
  // change pas : la physique reste identique, seule sa vitesse d'affichage baisse.
  timeAccumulator += ((timestamp - lastFrameTimestamp) / 1000) * state.simulationSpeed;
  lastFrameTimestamp = timestamp;

  const simTimeBefore = state.simulationTime;
  const running = state.mode === MODES.SIMULATION && state.isRunning;
  if (running) {
    // BUDGET TEMPS RÉEL : on fait autant de pas que le CPU le permet dans
    // PHYSICS_BUDGET_MS (mesuré, pas estimé), plafonné par MAX_STEPS_PER_FRAME.
    // Budget dépassé → le retard restant est ABANDONNÉ : l'affichage reste
    // fluide et la simulation passe en léger ralenti gracieux au lieu de geler.
    const budgetStart = performance.now();
    let steps = 0;
    while (timeAccumulator >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME) {
      step(state.structure, PHYSICS_DT, state.simulationTime, state.wind);
      state.simulationTime += PHYSICS_DT;
      timeAccumulator -= PHYSICS_DT;
      steps += 1;
      // performance.now() n'est interrogé que tous les 4 pas (il n'est pas gratuit).
      if ((steps & 3) === 0 && performance.now() - budgetStart >= PHYSICS_BUDGET_MS) break;
    }
    if (timeAccumulator >= PHYSICS_DT) timeAccumulator = 0; // retard abandonné

    // Vent : avancé UNE fois par image avec le temps simulé écoulé (les particules
    // sont visuelles, découplées du pas physique fin). Le champ n'est reconstruit
    // que si la vitesse a notablement changé (voir windSim.js).
    stepWindSim(state, state.simulationTime - simTimeBefore);
  } else {
    timeAccumulator = 0; // en pause/édition : aucun retard à rattraper à la reprise
  }

  draw(ctx, canvas, state);
  // Affichages DOM : rafraîchis à 10 Hz seulement (voir UI_REFRESH_PERIOD_MS).
  if (timestamp - lastUiRefreshTimestamp >= UI_REFRESH_PERIOD_MS) {
    lastUiRefreshTimestamp = timestamp;
    updateTimeDisplay();
    updateStructureWeightDisplay();
    updateWindDisplay(); // vitesse de vent en direct (si vent actif)
    updateLiveInspector(); // allongement de la poutre sélectionnée, en direct
  }
  requestAnimationFrame(animationLoop);
}

function init() {
  fitCanvasToViewport();
  frameGridInView();
  window.addEventListener("resize", fitCanvasToViewport);
  initToolbar({ onReset: resetTimeAccumulator });
  initStructureEditor(canvas, { onInspect: renderInspector });
  initTestCasePanel();
  renderInspector();
  requestAnimationFrame(animationLoop);
}

init();
