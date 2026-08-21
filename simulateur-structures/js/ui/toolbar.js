// ui/toolbar.js
// ─────────────
// Le HUD flottant : palette de matériaux (= placer une poutre), outils
// d'édition (Sol, Appui, Poids, Voiture, Camion, Choisir), tiroir bibliothèque,
// zoom, ralenti, lancement/pause/réinitialisation, et les bandeaux CONTEXTUELS
// (Sol / Poids / Câble) qui n'apparaissent qu'avec l'outil concerné.
// Met à jour state.js ; aucun dessin, aucune formule physique propre.
//
// Édition et simulation sont strictement séparées : les outils de construction
// (et la palette) sont désactivés hors édition ; « Réinitialiser » est l'unique
// retour à l'édition.

import { state, MODES, TOOLS, setTool, takeStructureSnapshot, resetToSnapshot, commitPendingTerrain } from "../state.js";
import { initMaterialPalette, refreshMaterialPalette, setMaterialPaletteEnabled } from "./materialPalette.js";
import { initWindPanel, refreshWindPanel } from "./windPanel.js";
import { clearTerrain, resizeWorldWidth } from "../model/Structure.js";
import { computeStructureTotalWeight } from "../physics/mass.js";
import { formatForce, formatMass } from "../units.js";
import { ZOOM_LEVEL_MIN, ZOOM_LEVEL_MAX } from "../render/styleConfig.js";
import { MESH, MESH_RESIZE_STEP } from "../model/mesh.js";
import { renderInspector } from "./inspector.js";

let toolButtons = [];
let playPauseButtonRef = null;

export function initToolbar({ onReset }) {
  toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      setTool(button.dataset.tool);
      highlightActiveTool();
    });
  }
  const palette = document.getElementById("material-palette");
  if (palette) initMaterialPalette(palette, { onChange: () => highlightActiveTool() });
  initLibraryDrawer();
  initTerrainBar();
  initGridWidthControls();
  initWeightInput();
  initWeightPlacementInput();
  initPercentToggle();
  initCablePretensionInput();
  initWindPanel();
  initZoomSlider();
  initSpeedSlider();
  initPlaybackButtons({ onReset });
  highlightActiveTool();
  refreshToolbarForMode();
}

function highlightActiveTool() {
  for (const b of toolButtons) b.classList.toggle("active", b.dataset.tool === state.currentTool);
  const canvas = document.getElementById("simulation-canvas");
  if (canvas) canvas.style.cursor = state.currentTool === TOOLS.PAN ? "grab" : "default";
  refreshMaterialPalette();
  refreshContextStrips();
}

// ── Tiroir bibliothèque (démonstrations + sauvegardes, à gauche) ──
function initLibraryDrawer() {
  const drawer = document.getElementById("library-drawer");
  const toggle = document.getElementById("library-toggle");
  const close = document.getElementById("library-close");
  if (!drawer || !toggle) return;
  const sync = () => toggle.classList.toggle("active", !drawer.hidden);
  toggle.addEventListener("click", () => { drawer.hidden = !drawer.hidden; sync(); });
  if (close) close.addEventListener("click", () => { drawer.hidden = true; sync(); });
}

// Resynchronise l'affichage de la barre d'outils sur l'outil courant. Utilisé
// quand l'outil change AILLEURS que par un clic sur la barre (ex. Échap → Sélection).
export function syncToolbar() {
  highlightActiveTool();
}

// ── Barre contextuelle de l'outil Sol ──
function initTerrainBar() {
  const newBtn = document.getElementById("terrain-new");
  const undoBtn = document.getElementById("terrain-undo");
  const clearBtn = document.getElementById("terrain-clear");
  if (newBtn) newBtn.addEventListener("click", () => { commitPendingTerrain(); });
  if (undoBtn) undoBtn.addEventListener("click", () => { state.pendingTerrain.pop(); });
  if (clearBtn) clearBtn.addEventListener("click", () => { state.pendingTerrain = []; clearTerrain(state.structure); });
}

// ── Bandeaux contextuels (au-dessus de la barre du bas) ──
// Un seul à la fois, selon l'outil actif : réglages du Sol, du Poids (masse,
// posé dessus) ou du Câble (tension initiale). Rien hors édition : l'écran
// reste dégagé pendant la simulation.
function refreshContextStrips() {
  const editing = state.mode === MODES.EDIT;
  const strips = {
    "terrain-bar": editing && state.currentTool === TOOLS.TERRAIN,
    "weight-bar": editing && state.currentTool === TOOLS.ADD_WEIGHT,
    "cable-bar": editing && state.currentTool === TOOLS.ADD_BEAM && state.currentBeamTypeId === "cable",
  };
  for (const [id, visible] of Object.entries(strips)) {
    const el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }
}

// ── Largeur de la grille (élargir / rétrécir des deux côtés) ──
// Chaque clic ajoute/retire MESH_RESIZE_STEP colonnes DE CHAQUE CÔTÉ : la grille
// grandit symétriquement (gauche + droite, hors du canvas visible) et les
// structures déjà posées gardent leur position (elles restent au centre).
function initGridWidthControls() {
  const widen = document.getElementById("grid-widen-button");
  const shrink = document.getElementById("grid-shrink-button");
  if (widen) widen.addEventListener("click", () => applyGridResize(MESH_RESIZE_STEP));
  if (shrink) shrink.addEventListener("click", () => applyGridResize(-MESH_RESIZE_STEP));
  refreshGridWidthControls();
}

function applyGridResize(deltaPerSide) {
  if (state.mode !== MODES.EDIT) return;
  resizeWorldWidth(state.structure, deltaPerSide);
  refreshGridWidthControls();
}

function refreshGridWidthControls() {
  const label = document.getElementById("grid-width-value");
  if (label) {
    const widthMeters = MESH.cols * MESH.spacing;
    label.textContent = `${Number.isInteger(widthMeters) ? widthMeters : widthMeters.toFixed(1)} m`;
  }
  const editable = state.mode === MODES.EDIT;
  const widen = document.getElementById("grid-widen-button");
  const shrink = document.getElementById("grid-shrink-button");
  if (widen) widen.disabled = !editable;
  if (shrink) shrink.disabled = !editable;
}

function initWeightInput() {
  const input = document.getElementById("weight-mass-input");
  if (!input) return;
  input.value = String(state.currentWeightMass);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v) && v > 0) state.currentWeightMass = v;
  });
}

// Case « Posé dessus » : choisit le placement du prochain poids posé.
function initWeightPlacementInput() {
  const input = document.getElementById("weight-placement-input");
  if (!input) return;
  input.checked = state.currentWeightPlacement === "above";
  input.addEventListener("change", () => {
    state.currentWeightPlacement = input.checked ? "above" : "below";
  });
}

// Bouton (haut-droite du canvas) d'affichage des pourcentages de charge. Reste
// "enfoncé" (classe active) tant que l'affichage est actif.
function initPercentToggle() {
  const btn = document.getElementById("toggle-percent-button");
  if (!btn) return;
  const sync = () => {
    btn.classList.toggle("active", state.showLoadPercents);
    btn.setAttribute("aria-pressed", String(state.showLoadPercents));
  };
  sync();
  btn.addEventListener("click", () => {
    state.showLoadPercents = !state.showLoadPercents;
    sync();
  });
}

// Tension de base donnée aux CÂBLES à la pose (%). Même plage que l'inspecteur
// d'une poutre câble : [-50, +10]. Ignorée pour les autres matériaux.
function initCablePretensionInput() {
  const input = document.getElementById("cable-pretension-input");
  if (!input) return;
  input.value = String(state.currentCablePretension);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) state.currentCablePretension = Math.max(-50, Math.min(10, v));
  });
}

function initZoomSlider() {
  const slider = document.getElementById("zoom-slider");
  const label = document.getElementById("zoom-value");
  if (!slider || !label) return;
  slider.min = String(ZOOM_LEVEL_MIN);
  slider.max = String(ZOOM_LEVEL_MAX);
  slider.value = String(state.zoomLevel);
  label.textContent = `×${state.zoomLevel.toFixed(1)}`;
  slider.addEventListener("input", () => {
    state.zoomLevel = parseFloat(slider.value);
    label.textContent = `×${state.zoomLevel.toFixed(1)}`;
  });
}

// Ralenti de la simulation (×0,1 à ×1). Réglable DANS LES DEUX MODES (comme le
// zoom) : on veut pouvoir ajuster le ralenti en direct pendant qu'on regarde.
function initSpeedSlider() {
  const slider = document.getElementById("speed-slider");
  const label = document.getElementById("speed-value");
  if (!slider || !label) return;
  slider.value = String(state.simulationSpeed);
  label.textContent = `×${state.simulationSpeed.toFixed(1)}`;
  slider.addEventListener("input", () => {
    state.simulationSpeed = parseFloat(slider.value);
    label.textContent = `×${state.simulationSpeed.toFixed(1)}`;
  });
}

// Icônes du bouton lecture (le libellé change avec le mode). SVG en ligne :
// pas de dépendance, même style que les icônes de index.html.
const PLAY_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="7 4 20 12 7 20" fill="currentColor" stroke="none"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4.4" height="16" rx="1" fill="currentColor"/><rect x="13.6" y="4" width="4.4" height="16" rx="1" fill="currentColor"/></svg>`;

function setPlayButton(icon, label) {
  if (playPauseButtonRef) playPauseButtonRef.innerHTML = `${icon}<span>${label}</span>`;
}

function initPlaybackButtons({ onReset }) {
  playPauseButtonRef = document.getElementById("play-pause-button");
  const resetButton = document.getElementById("reset-button");

  playPauseButtonRef.addEventListener("click", () => {
    if (state.mode === MODES.EDIT) {
      commitPendingTerrain(); // fige la colline en cours avant l'instantané
      takeStructureSnapshot();
      state.mode = MODES.SIMULATION;
      state.isRunning = true;
      setTool(TOOLS.SELECT);
      highlightActiveTool();
    } else {
      state.isRunning = !state.isRunning;
    }
    refreshAfterModeChange();
  });

  resetButton.addEventListener("click", () => {
    resetToSnapshot();
    onReset();
    highlightActiveTool();
    refreshAfterModeChange();
  });
}

export function refreshAfterModeChange() {
  refreshToolbarForMode();
  renderInspector();
}

function refreshToolbarForMode() {
  const editable = state.mode === MODES.EDIT;
  for (const b of toolButtons) {
    if (b.dataset.tool !== TOOLS.SELECT && b.dataset.tool !== TOOLS.PAN) b.disabled = !editable;
  }
  setMaterialPaletteEnabled(editable);
  const weightInput = document.getElementById("weight-mass-input");
  if (weightInput) weightInput.disabled = !editable;
  const weightPlacement = document.getElementById("weight-placement-input");
  if (weightPlacement) weightPlacement.disabled = !editable;
  const cableInput = document.getElementById("cable-pretension-input");
  if (cableInput) cableInput.disabled = !editable;
  if (playPauseButtonRef) {
    if (editable) setPlayButton(PLAY_ICON, "Tester");
    else if (state.isRunning) setPlayButton(PAUSE_ICON, "Pause");
    else setPlayButton(PLAY_ICON, "Reprendre");
  }
  refreshMaterialPalette();
  refreshContextStrips();
  refreshGridWidthControls(); // largeur de grille : label + activation selon le mode
  refreshWindPanel();
}

export function updateTimeDisplay() {
  const d = document.getElementById("time-display");
  if (d) d.textContent = `t = ${state.simulationTime.toFixed(2)} s`;
}

export function updateStructureWeightDisplay() {
  const d = document.getElementById("structure-weight-display");
  if (d) {
    const w = computeStructureTotalWeight(state.structure);
    d.textContent = `Poids : ${formatForce(w)} (${formatMass(w / 9.81)})`;
  }
}
