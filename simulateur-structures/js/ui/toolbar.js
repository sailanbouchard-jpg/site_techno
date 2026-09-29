// ui/toolbar.js
// ─────────────
// Les barres d'outils et la palette d'essai :
//   - outils (Sélection ; en atelier : Sol, Appui, Poids, Voiture, Camion) ;
//   - barre des éléments (materialPalette.js) et options de l'outil en cours ;
//   - bouton Lancer l'essai / Arrêter l'essai ;
//   - palette « Essai de charge » : pause, recommencer, vitesse, temps simulé.
// Enregistre les commandes correspondantes (menus.js) pour que menus, boutons et
// raccourcis partagent la même action. Met à jour state.js ; aucun dessin,
// aucune formule physique.
//
// Conception et essai sont strictement séparés : les outils de construction
// sont désactivés pendant l'essai, « Arrêter l'essai » est l'unique retour à la
// conception (la structure revient telle qu'elle a été dessinée).

import {
  state, MODES, TOOLS, setTool, takeStructureSnapshot, resetToSnapshot, commitPendingTerrain,
  clearSelection, restoreLastChange, supprimerSelection, selectionSupprimable,
} from "../state.js";
import { demarrerEssai, annulerEssai } from "../model/essai.js";
import { NATURES_SOL } from "../model/terrain.js";
import { TYPES_BATEAU } from "../model/bateau.js";
import { initMaterialPalette, refreshMaterialPalette, setMaterialPaletteEnabled } from "./materialPalette.js";
import { initWindPanel, refreshWindPanel } from "./windPanel.js";
import { clearTerrain, resizeWorldWidth, resizeWorldHeight } from "../model/Structure.js";
import { MESH, MESH_RESIZE_STEP } from "../model/mesh.js";
import { renderInspector } from "./inspector.js";
import { enregistrerCommande, rafraichirCommandes } from "./menus.js";
import { zoomIn, zoomOut, fitView, canZoomIn, canZoomOut } from "./viewControls.js";
import { formatDecimal } from "../units.js";
import { PROFILS_TAUX, profilTauxPar } from "../render/styleConfig.js";

const VITESSES = [2, 1, 0.5, 0.25, 0.1]; // choix proposés dans le menu Essai
const OUTILS_DE_POSE = new Set([
  TOOLS.ADD_BEAM, TOOLS.TERRAIN, TOOLS.ANCHOR, TOOLS.ARRIVEE, TOOLS.ADD_WEIGHT,
  TOOLS.ADD_CAR, TOOLS.ADD_VAN, TOOLS.ADD_TRUCK, TOOLS.ADD_BOAT,
]);

// Icônes SVG en ligne (couleur héritée du bouton, rien en dur).
const ICONE_LECTURE = `<svg class="icone" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>`;
const ICONE_ARRET = `<svg class="icone" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" fill="currentColor"/></svg>`;
const ICONE_PAUSE = `<svg class="icone" viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>`;

let toolButtons = [];
let onResetCallback = () => {};

export function initToolbar({ onReset }) {
  onResetCallback = onReset;
  toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
  for (const button of toolButtons) {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      setTool(button.dataset.tool);
      highlightActiveTool();
    });
  }
  initMaterialPalette(document.getElementById("material-palette"), { onChange: highlightActiveTool });
  initTerrainBar();
  initGridWidthControls();
  initWeightInput();
  initWeightPlacementInput();
  initCablePretensionInput();
  initNatureSolInput();
  initTypeBateauInput();
  initWindPanel();
  initSpeedSlider();
  initPaletteDrag();
  document.getElementById("play-pause-button").addEventListener("click", () => {
    if (state.mode === MODES.EDIT) lancerEssai();
    else arreterEssai();
  });
  enregistrerCommandes();
  highlightActiveTool();
  refreshToolbarForMode();
}

// ── Commandes ────────────────────────────────────────────────────────────────

function enregistrerCommandes() {
  const enConception = () => state.mode === MODES.EDIT;
  const enEssai = () => state.mode === MODES.SIMULATION;

  enregistrerCommande("lancer-essai", lancerEssai, { actif: enConception });
  enregistrerCommande("arreter-essai", arreterEssai, { actif: enEssai });
  enregistrerCommande("recommencer-essai", recommencerEssai, { actif: enEssai });
  enregistrerCommande("pause-essai", basculerPause, {
    actif: enEssai,
    libelle: () => (enEssai() && !state.isRunning ? "Reprendre" : "Pause"),
  });
  enregistrerCommande("basculer-essai", () => (enConception() ? lancerEssai() : basculerPause()));
  for (const vitesse of VITESSES) {
    enregistrerCommande(`vitesse-${vitesse}`, () => reglerVitesse(vitesse), {
      coche: () => Math.abs(state.simulationSpeed - vitesse) < 1e-6,
    });
  }

  // Un clic passe au profil suivant, en boucle : gros → petit → masqué → gros.
  enregistrerCommande("taux-travail", profilTauxSuivant, {
    coche: () => profilTauxPar(state.profilTaux).font !== undefined,
    libelle: () => profilTauxPar(state.profilTaux).libelle,
  });
  enregistrerCommande("zoom-avant", zoomIn, { actif: canZoomIn });
  enregistrerCommande("zoom-arriere", zoomOut, { actif: canZoomOut });
  enregistrerCommande("vue-ensemble", fitView);

  enregistrerCommande("annuler", () => { if (restoreLastChange()) renderInspector(); }, {
    actif: () => enConception() && state.undoSnapshot !== null,
  });
  enregistrerCommande("supprimer", () => { if (supprimerSelection()) renderInspector(); }, {
    actif: selectionSupprimable,
  });
  enregistrerCommande("deselectionner", () => { clearSelection(); renderInspector(); }, {
    actif: () => state.selection.type !== null || state.multiSelection.length > 0,
  });
}

// ── Essai ────────────────────────────────────────────────────────────────────

function lancerEssai() {
  if (state.mode !== MODES.EDIT) return;
  commitPendingTerrain(); // fige la colline en cours avant l'instantané
  takeStructureSnapshot();
  state.mode = MODES.SIMULATION;
  state.isRunning = true;
  demarrerEssai();
  setTool(TOOLS.SELECT);
  highlightActiveTool();
  refreshAfterModeChange();
}

// Retour à la conception : la structure revient telle qu'elle a été dessinée.
export function arreterEssai() {
  resetToSnapshot();
  annulerEssai();
  onResetCallback();
  highlightActiveTool();
  refreshAfterModeChange();
}

function recommencerEssai() {
  arreterEssai();
  lancerEssai();
}

function basculerPause() {
  if (state.mode !== MODES.SIMULATION) return;
  state.isRunning = !state.isRunning;
  refreshToolbarForMode();
}

function reglerVitesse(vitesse) {
  state.simulationSpeed = vitesse;
  const slider = document.getElementById("speed-slider");
  slider.value = String(vitesse);
  document.getElementById("speed-value").textContent = formatVitesse(vitesse);
}

// Profil d'affichage des taux de travail suivant, en boucle (voir styleConfig).
function profilTauxSuivant() {
  const rang = PROFILS_TAUX.findIndex((profil) => profil.id === state.profilTaux);
  state.profilTaux = PROFILS_TAUX[(rang + 1) % PROFILS_TAUX.length].id;
}

function formatVitesse(v) {
  const arrondi = Math.round(v * 100) / 100;
  return `×${String(arrondi).replace(".", ",")}`;
}

// ── Outils ───────────────────────────────────────────────────────────────────

function highlightActiveTool() {
  for (const b of toolButtons) b.classList.toggle("active", b.dataset.tool === state.currentTool);
  // Le curseur de la vue suit l'outil (réticule pour poser, flèche sinon) : voir style.css.
  const canvas = document.getElementById("simulation-canvas");
  const pose = state.mode === MODES.EDIT && OUTILS_DE_POSE.has(state.currentTool);
  canvas.classList.toggle("curseur-pose", pose);
  refreshMaterialPalette();
  refreshContextStrips();
}

// Resynchronise l'affichage sur l'outil courant quand il change AILLEURS que
// par un clic sur la barre (ex. Échap → Sélection).
export function syncToolbar() {
  highlightActiveTool();
}

// ── Options de l'outil en cours (droite de la barre des éléments) ──
function refreshContextStrips() {
  const editing = state.mode === MODES.EDIT;
  const strips = {
    "terrain-bar": editing && state.currentTool === TOOLS.TERRAIN,
    "weight-bar": editing && state.currentTool === TOOLS.ADD_WEIGHT,
    "cable-bar": editing && state.currentTool === TOOLS.ADD_BEAM && state.currentBeamTypeId === "cable",
    "boat-bar": editing && state.currentTool === TOOLS.ADD_BOAT,
  };
  for (const [id, visible] of Object.entries(strips)) {
    const el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }
}

function initTerrainBar() {
  document.getElementById("terrain-new").addEventListener("click", () => commitPendingTerrain());
  document.getElementById("terrain-undo").addEventListener("click", () => { state.pendingTerrain.pop(); });
  document.getElementById("terrain-clear").addEventListener("click", () => {
    state.pendingTerrain = [];
    clearTerrain(state.structure);
  });
}

// ── Largeur de la grille (atelier) ──
// Chaque clic ajoute/retire MESH_RESIZE_STEP colonnes DE CHAQUE CÔTÉ : les
// structures déjà posées gardent leur position.
function initGridWidthControls() {
  document.getElementById("grid-widen-button").addEventListener("click", () => applyGridResize(MESH_RESIZE_STEP));
  document.getElementById("grid-shrink-button").addEventListener("click", () => applyGridResize(-MESH_RESIZE_STEP));
  document.getElementById("grid-raise-button").addEventListener("click", () => applyGridHeight(MESH_RESIZE_STEP));
  document.getElementById("grid-lower-button").addEventListener("click", () => applyGridHeight(-MESH_RESIZE_STEP));
  refreshGridWidthControls();
}

function applyGridResize(deltaPerSide) {
  if (state.mode !== MODES.EDIT) return;
  resizeWorldWidth(state.structure, deltaPerSide);
  refreshGridWidthControls();
}

// Le plafond monte ou descend ; le bas du monde, lui, ne bouge jamais.
function applyGridHeight(delta) {
  if (state.mode !== MODES.EDIT) return;
  resizeWorldHeight(state.structure, delta);
  refreshGridWidthControls();
}

function refreshGridWidthControls() {
  ecrireMetres("grid-width-value", MESH.cols * MESH.spacing);
  ecrireMetres("grid-height-value", MESH.rows * MESH.spacing);
  const editable = state.mode === MODES.EDIT;
  for (const id of ["grid-widen-button", "grid-shrink-button", "grid-raise-button", "grid-lower-button"]) {
    document.getElementById(id).disabled = !editable;
  }
}

function ecrireMetres(id, metres) {
  document.getElementById(id).textContent =
    `${Number.isInteger(metres) ? metres : formatDecimal(metres, 1)} m`;
}

function initWeightInput() {
  const input = document.getElementById("weight-mass-input");
  input.value = String(state.currentWeightMass);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v) && v > 0) state.currentWeightMass = v;
  });
}

function initWeightPlacementInput() {
  const input = document.getElementById("weight-placement-input");
  input.checked = state.currentWeightPlacement === "above";
  input.addEventListener("change", () => {
    state.currentWeightPlacement = input.checked ? "above" : "below";
  });
}

// Tension de base donnée aux CÂBLES à la pose (%), plage [-50, +10] comme
// dans l'inspecteur. Ignorée pour les autres matériaux.
function initCablePretensionInput() {
  const input = document.getElementById("cable-pretension-input");
  input.value = String(state.currentCablePretension);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) state.currentCablePretension = Math.max(-50, Math.min(10, v));
  });
}

// Nature du sol dessiné et type du prochain bateau : deux listes remplies à
// partir des catalogues du modèle, pour n'avoir aucune option en double.
function initNatureSolInput() {
  remplirListe("terrain-nature-input", NATURES_SOL, state.currentNatureSol,
    (valeur) => { state.currentNatureSol = valeur; });
}

function initTypeBateauInput() {
  remplirListe("boat-type-input", TYPES_BATEAU, state.currentTypeBateau,
    (valeur) => { state.currentTypeBateau = valeur; });
}

function remplirListe(id, catalogue, valeur, surChangement) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = "";
  for (const entree of catalogue) {
    const option = document.createElement("option");
    option.value = entree.id;
    option.textContent = entree.label;
    select.appendChild(option);
  }
  select.value = valeur;
  select.addEventListener("change", () => surChangement(select.value));
}

// ── Palette « Essai de charge » ──

// Vitesse de la simulation (×0,1 à ×2), réglable en direct pendant l'essai.
function initSpeedSlider() {
  const slider = document.getElementById("speed-slider");
  slider.value = String(state.simulationSpeed);
  document.getElementById("speed-value").textContent = formatVitesse(state.simulationSpeed);
  slider.addEventListener("input", () => {
    state.simulationSpeed = parseFloat(slider.value);
    document.getElementById("speed-value").textContent = formatVitesse(state.simulationSpeed);
  });
}

// La palette se déplace par sa barre de titre, sans jamais sortir de la vue.
function initPaletteDrag() {
  const palette = document.getElementById("palette-essai");
  const poignee = palette.querySelector("[data-poignee]");
  const vue = document.getElementById("vue");
  let depart = null;
  poignee.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    depart = { x: event.clientX, y: event.clientY, left: palette.offsetLeft, top: palette.offsetTop };
  });
  window.addEventListener("mousemove", (event) => {
    if (!depart) return;
    const maxLeft = vue.clientWidth - palette.offsetWidth;
    const maxTop = vue.clientHeight - palette.offsetHeight;
    palette.style.left = `${Math.max(0, Math.min(maxLeft, depart.left + event.clientX - depart.x))}px`;
    palette.style.top = `${Math.max(0, Math.min(maxTop, depart.top + event.clientY - depart.y))}px`;
  });
  window.addEventListener("mouseup", () => { depart = null; });
}

export function updateTimeDisplay() {
  document.getElementById("time-display").textContent = `${formatDecimal(state.simulationTime, 2)} s`;
}

// ── Changement de mode ──

export function refreshAfterModeChange() {
  refreshToolbarForMode();
  renderInspector();
}

function refreshToolbarForMode() {
  const editable = state.mode === MODES.EDIT;
  for (const b of toolButtons) {
    if (b.dataset.tool !== TOOLS.SELECT) b.disabled = !editable;
  }
  setMaterialPaletteEnabled(editable);
  // Rafraîchies ici aussi : un changement de niveau peut avoir fermé des
  // matériaux, et il apporte ses propres dimensions de grille.
  refreshMaterialPalette();
  refreshGridWidthControls();
  document.getElementById("weight-mass-input").disabled = !editable;
  document.getElementById("weight-placement-input").disabled = !editable;
  document.getElementById("cable-pretension-input").disabled = !editable;

  const lancer = document.getElementById("play-pause-button");
  lancer.classList.toggle("en-essai", !editable);
  lancer.innerHTML = editable ? `${ICONE_LECTURE}<span>Lancer l'essai</span>` : `${ICONE_ARRET}<span>Arrêter l'essai</span>`;
  lancer.title = editable ? "Lancer l'essai de charge (Espace)" : "Arrêter l'essai et revenir à la conception";

  document.getElementById("palette-essai").hidden = editable;
  const pause = document.getElementById("essai-pause");
  pause.innerHTML = state.isRunning ? ICONE_PAUSE : ICONE_LECTURE;
  pause.title = state.isRunning ? "Pause (Espace)" : "Reprendre (Espace)";

  highlightActiveTool();
  refreshGridWidthControls();
  refreshWindPanel();
  rafraichirCommandes();
}
