// main.js
// ───────
// Point d'entrée : initialise une scène vide (maillage prêt), branche l'UI
// (menus, barres d'outils, éditeur, niveaux, barre d'état), et fait tourner la
// boucle d'animation (accumulateur de temps fixe + rendu).
// SEUL fichier qui appelle simulationEngine.step().

import { state, MODES } from "./state.js";
import { step } from "./physics/simulationEngine.js";
import { stepWindSim } from "./physics/windSim.js";
import { draw } from "./render/renderer.js";
import { initToolbar, updateTimeDisplay } from "./ui/toolbar.js";
import { updateWindDisplay } from "./ui/windPanel.js";
import { initStructureEditor } from "./ui/structureEditor.js";
import { initLevelHud, majObjectif, surVerdict } from "./ui/levelHud.js";
import { observerEssai } from "./model/essai.js";
import { appliquerModeInterface } from "./mode.js";
import { renderInspector, updateLiveInspector } from "./ui/inspector.js";
import { initMenus, rafraichirCommandes } from "./ui/menus.js";
import { initWheelZoom, fitView, clampView } from "./ui/viewControls.js";
import { majBarreEtat } from "./ui/statusBar.js";
import { initAide } from "./ui/aide.js";
import { pasDeTemps } from "./physics/solveur.js";
import { MAX_STEPS_PER_FRAME, PHYSICS_BUDGET_MS } from "./physics/config.js";
import { viewport } from "./render/displayTransform.js";

const canvas = document.getElementById("simulation-canvas");
const ctx = canvas.getContext("2d");

let timeAccumulator = 0;
let lastFrameTimestamp = null;

// Rythme de mise à jour des affichages DOM (afficheurs, barre d'état, état des
// commandes, inspecteur) : 10 Hz
// suffisent largement à l'œil, et chaque écriture DOM par image coûte cher sur
// machine faible (recalcul de style). Le canvas, lui, reste à pleine cadence.
const UI_REFRESH_PERIOD_MS = 100;
let lastUiRefreshTimestamp = -Infinity;
// Temps simulé au dernier rafraîchissement : sert à mesurer la CADENCE RÉELLE
// (secondes simulées par seconde d'horloge). Quand la scène dépasse ce que la
// machine peut calculer, le budget par image fait abandonner du retard : la
// simulation ralentit au lieu de geler. Autant le DIRE dans la barre d'état
// plutôt que de laisser croire à un bug (voir ui/statusBar.js).
let simTimeAtLastUiRefresh = 0;

// Le canvas remplit la zone de vue ; sa résolution interne suit sa taille CSS
// multipliée par la densité de l'écran (net à 125-150 %). Appelé à l'init et à
// chaque redimensionnement — la caméra vise un point MONDE, la vue reste donc
// centrée au même endroit, et le cache de fond se reconstruit tout seul.
function fitCanvasToViewport() {
  // Jamais 0 : tant que la mise en page n'est pas faite, on garde 1 px (un canvas
  // de taille nulle ferait échouer drawImage).
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  viewport.width = w;
  viewport.height = h;
  viewport.pixelRatio = dpr;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (bw > 0 && canvas.width !== bw) canvas.width = bw;
  if (bh > 0 && canvas.height !== bh) canvas.height = bh;
}

function resetTimeAccumulator() {
  timeAccumulator = 0;
}

function animationLoop(timestamp) {
  // Programmée d'emblée : une erreur ponctuelle dans une image n'arrête pas tout.
  requestAnimationFrame(animationLoop);
  if (lastFrameTimestamp === null) lastFrameTimestamp = timestamp;
  // Vitesse d'affichage : on injecte plus ou moins de temps réel dans
  // l'accumulateur (×0,1 → 10× plus lent, ×2 → deux fois plus rapide), donc plus
  // ou moins de pas physiques par image. Le PAS physique, lui, ne change pas :
  // la physique reste identique, seule la vitesse à laquelle on la regarde
  // change. En accéléré, si la machine ne suit pas, le budget par image (plus
  // bas) abandonne le retard : on obtient simplement moins que ×2, jamais une
  // physique dégradée.
  timeAccumulator += ((timestamp - lastFrameTimestamp) / 1000) * state.simulationSpeed;
  lastFrameTimestamp = timestamp;

  const simTimeBefore = state.simulationTime;
  const running = state.mode === MODES.SIMULATION && state.isRunning;
  if (running) {
    // BUDGET TEMPS RÉEL : on fait autant de pas que le CPU le permet dans
    // PHYSICS_BUDGET_MS (mesuré, pas estimé), plafonné par MAX_STEPS_PER_FRAME.
    // Budget dépassé → le retard restant est ABANDONNÉ : l'affichage reste
    // fluide et la simulation passe en léger ralenti gracieux au lieu de geler.
    // Le pas est relu à chaque tour : il appartient à la scène (physics/solveur.js)
    // et peut changer en cours d'essai, une rupture modifiant la topologie.
    const budgetStart = performance.now();
    let steps = 0;
    let dt = pasDeTemps(state.structure);
    while (timeAccumulator >= dt && steps < MAX_STEPS_PER_FRAME) {
      step(state.structure, dt, state.simulationTime, state.wind);
      state.simulationTime += dt;
      timeAccumulator -= dt;
      steps += 1;
      dt = pasDeTemps(state.structure);
      // performance.now() n'est interrogé que tous les 4 pas (il n'est pas gratuit).
      if ((steps & 3) === 0 && performance.now() - budgetStart >= PHYSICS_BUDGET_MS) break;
    }
    if (timeAccumulator >= dt) timeAccumulator = 0; // retard abandonné

    // Vent : avancé UNE fois par image avec le temps simulé écoulé (les particules
    // sont visuelles, découplées du pas physique fin). Le champ n'est reconstruit
    // que si la vitesse a notablement changé (voir windSim.js).
    stepWindSim(state, state.simulationTime - simTimeBefore);

    // Arbitrage du niveau en cours : le pont a-t-il cédé, le véhicule est-il
    // arrivé ? (ne fait rien hors niveau — voir model/essai.js)
    observerEssai();
  } else {
    timeAccumulator = 0; // en pause/édition : aucun retard à rattraper à la reprise
  }

  clampView(); // la grille remplit toujours la vue en hauteur (voir viewControls)
  draw(ctx, canvas, state);
  // Affichages DOM : rafraîchis à 10 Hz seulement (voir UI_REFRESH_PERIOD_MS).
  if (timestamp - lastUiRefreshTimestamp >= UI_REFRESH_PERIOD_MS) {
    const ecoule = (timestamp - lastUiRefreshTimestamp) / 1000;
    state.cadenceReelle = running && Number.isFinite(ecoule) && ecoule > 0
      ? (state.simulationTime - simTimeAtLastUiRefresh) / ecoule / state.simulationSpeed
      : 1;
    simTimeAtLastUiRefresh = state.simulationTime;
    lastUiRefreshTimestamp = timestamp;
    updateTimeDisplay();
    majObjectif();
    surVerdict();
    updateWindDisplay(); // vitesse de vent en direct (si vent actif)
    updateLiveInspector(); // allongement de la poutre sélectionnée, en direct
    majBarreEtat();
    rafraichirCommandes(); // boutons et entrées de menu grisés / enfoncés
  }
}

// La taille de la vue est suivie par un ResizeObserver : il signale aussi la
// première mise en page, moment où l'on cadre la zone de construction.
function observeViewport() {
  let framed = false;
  new ResizeObserver(() => {
    fitCanvasToViewport();
    if (!framed && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      fitView();
      framed = true;
    }
  }).observe(canvas);
  window.addEventListener("resize", fitCanvasToViewport); // changement de densité d'écran
}

function init() {
  appliquerModeInterface();
  fitCanvasToViewport();
  observeViewport();
  initMenus(); // avant l'éditeur : Échap referme d'abord un menu ouvert
  initToolbar({ onReset: resetTimeAccumulator });
  initStructureEditor(canvas, { onInspect: renderInspector });
  initWheelZoom(canvas);
  initAide();
  initLevelHud();
  renderInspector();
  requestAnimationFrame(animationLoop);
}

init();
