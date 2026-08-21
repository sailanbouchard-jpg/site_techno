// state.js
// ────────
// État central (source unique de vérité) : la structure en cours, l'état de la
// simulation (mode, lecture/pause, temps), et l'état d'interface (outil actif,
// type de poutre courant, masse du poids courant, sélection, vue zoom/pan).
//
// Plus de "facteur de déformation" variable : la déformation est désormais
// RÉELLE dans le monde (amplifiée par des raideurs assouplies fixes, voir
// physics/config.js). Le rendu dessine les positions physiques telles quelles.

import { createStructure, invalidateIndex, addTerrainPart, adoptIds, removeElements } from "./model/Structure.js";
import { applyWorldToMesh } from "./model/mesh.js";
import { BEAM_TYPES } from "./model/materials.js";
import { DEFAULT_ZOOM_LEVEL } from "./render/styleConfig.js";
import { DEFAULT_WIND } from "./physics/wind.js";

export const TOOLS = {
  ADD_BEAM: "addBeam",
  TERRAIN: "terrain",
  ANCHOR: "anchor",
  ADD_WEIGHT: "addWeight",
  ADD_CAR: "addCar",
  ADD_TRUCK: "addTruck",
  DELETE: "delete",
  SELECT: "select",
  PAN: "pan",
};

export const MODES = { EDIT: "edit", SIMULATION: "simulation" };

// Masse par défaut d'un poids posé (kg). L'utilisateur peut l'ajuster ensuite
// dans l'inspecteur du point.
const DEFAULT_WEIGHT_MASS = 8000;

export const state = {
  structure: createStructure(),
  structureSnapshot: null,

  mode: MODES.EDIT,
  isRunning: false,
  simulationTime: 0,

  currentTool: TOOLS.ADD_BEAM,
  currentBeamTypeId: BEAM_TYPES[0].id,
  currentWeightMass: DEFAULT_WEIGHT_MASS,

  // Placement du poids posé : "below" = suspendu sous le point (par défaut),
  // "above" = posé SUR le point/la poutre (avec une petite marge). Réglable dans
  // la barre d'outils avant la pose, puis par poids dans l'inspecteur.
  currentWeightPlacement: "below",

  // Affichage des pourcentages de charge (taux de travail) sur les poutres en
  // simulation. Basculé par le bouton en haut à droite du canvas.
  showLoadPercents: true,

  // Tension de base (%) donnée aux CÂBLES au moment où on les pose (voir
  // model/Structure.js::addBeam). Même plage que l'inspecteur : > 0 = déjà tendu
  // au lancement, < 0 = mou. Réglable dans la barre d'outils (édition).
  currentCablePretension: 0,

  // Ralenti de la simulation : multiplicateur du temps réel appliqué à la boucle
  // (0,1 = ×10 plus lent pour voir le détail, 1 = temps réel). Ne change RIEN à
  // la physique (même pas de temps PHYSICS_DT) : on avance simplement moins de
  // pas par image. Réglable en direct, même pendant la simulation (voir main.js).
  simulationSpeed: 1,

  // Sélection courante : { type: "beam"|"node"|"vehicle"|null, id }
  selection: { type: null, id: null },

  // Sélection MULTIPLE (rectangle élastique de l'outil Sélectionner) : liste
  // d'éléments { type, id } + ensemble de clés "type:id" pour un test
  // d'appartenance O(1) au rendu. EXCLUSIVE avec la sélection simple ci-dessus.
  multiSelection: [],
  multiSelectionKeys: new Set(),

  // Rectangle de sélection EN COURS de tracé (px de base : {x0,y0,x1,y1}),
  // dessiné par le rendu. null hors tracé.
  selectionRect: null,

  // Premier point du maillage déjà cliqué pendant le tracé d'une poutre
  // ({ i, j } ou null) — pas un id de nœud, car le joint peut ne pas encore exister.
  pendingBeamFirstGrid: null,

  // Partie de SOL en cours de tracé (liste de points {i,j} du maillage). Validée
  // (déposée dans structure.terrain) par "Nouvelle colline" ou en quittant l'outil.
  pendingTerrain: [],

  // Annulation à UN coup : instantané de la structure pris juste AVANT une
  // suppression. Ctrl+Z le restaure, mais UNIQUEMENT juste après la suppression :
  // toute autre action (clic sur le canvas, lecture, chargement…) l'efface.
  undoSnapshot: null,

  // Vue (zoom + déplacement). cameraX/Y = point du monde affiché au centre.
  zoomLevel: DEFAULT_ZOOM_LEVEL,
  cameraX: 0,
  cameraY: 0,

  // ── Vent (option pédagogique) ──
  // Réglages du vent : activation, vitesse de base (signée), variances (rafales),
  // graine, et paramètres des particules. C'est un réglage GLOBAL de simulation
  // (comme le ralenti), pas une propriété de la structure. Voir physics/wind.js.
  wind: { ...DEFAULT_WIND },
  // État d'exécution du vent en simulation (domaine + champ + particules),
  // reconstruit à chaque lancement. Jamais sérialisé. Voir physics/windSim.js.
  windRuntime: null,
};

// ── Annulation à un coup d'une suppression (Ctrl+Z) ──
export function captureUndoBeforeDelete() {
  invalidateIndex(state.structure); // ne pas cloner l'index (Map de réfs)
  state.undoSnapshot = structuredClone(state.structure);
}
export function restoreLastDeletion() {
  if (!state.undoSnapshot) return false;
  state.structure = state.undoSnapshot;
  state.undoSnapshot = null;
  invalidateIndex(state.structure);
  applyWorldToMesh(state.structure.world); // rétablir la largeur de grille de l'instantané
  clearSelection();
  state.pendingBeamFirstGrid = null;
  return true;
}
export function clearUndo() {
  state.undoSnapshot = null;
}

export function setSelection(type, id) {
  state.selection = { type, id };
  state.multiSelection = [];
  state.multiSelectionKeys = new Set();
}
export function clearSelection() {
  state.selection = { type: null, id: null };
  state.multiSelection = [];
  state.multiSelectionKeys = new Set();
}
// Sélection MULTIPLE : 0 élément → tout désélectionner ; 1 seul → sélection
// simple (inspecteur complet) ; ≥ 2 → multi (l'inspecteur propose la
// suppression groupée).
export function setMultiSelection(items) {
  if (!items || items.length === 0) return clearSelection();
  if (items.length === 1) return setSelection(items[0].type, items[0].id);
  state.selection = { type: null, id: null };
  state.multiSelection = items;
  state.multiSelectionKeys = new Set(items.map((it) => `${it.type}:${it.id}`));
}
// Supprime TOUS les éléments de la sélection multiple, en UNE opération
// annulable : un seul instantané est pris → un seul Ctrl+Z restaure tout.
export function deleteMultiSelection() {
  if (state.multiSelection.length === 0) return false;
  captureUndoBeforeDelete();
  removeElements(state.structure, state.multiSelection);
  clearSelection();
  return true;
}
// Valide la partie de sol en cours (si elle a au moins 2 points) et la vide.
// Appelée en quittant l'outil Sol et avant de lancer la simulation.
export function commitPendingTerrain() {
  if (state.pendingTerrain.length >= 2) {
    addTerrainPart(state.structure, state.pendingTerrain);
  }
  state.pendingTerrain = [];
}

export function setTool(tool) {
  // Quitter l'outil Sol fige la colline en cours pour ne pas la perdre.
  if (state.currentTool === TOOLS.TERRAIN && tool !== TOOLS.TERRAIN) commitPendingTerrain();
  state.currentTool = tool;
  state.pendingBeamFirstGrid = null;
}

// Remet TOUS les nœuds à leur position d'origine (telle que construite) et à
// vitesse nulle. L'édition montre TOUJOURS l'état non déformé : une sauvegarde
// prise sur une structure déformée (pendant/après un test) revient ainsi à sa
// forme de conception au chargement.
function resetNodesToRest(structure) {
  for (const node of structure.nodes) {
    node.x = node.restX;
    node.y = node.restY;
    node.vx = 0;
    node.vy = 0;
  }
}

function restoreFrom(sourceStructure) {
  state.structure = structuredClone(sourceStructure);
  // Le clone peut traîner des caches d'index sérialisés (depuis localStorage)
  // ou clonés : on les jette pour repartir d'un index propre.
  invalidateIndex(state.structure);
  // Rétablit la LARGEUR de grille mémorisée avec la structure (ancienne
  // sauvegarde sans `world` → dimensions de base) : les indices de maillage
  // n'ont de sens qu'avec l'origine qui va avec.
  applyWorldToMesh(state.structure.world);
  resetNodesToRest(state.structure); // édition = toujours l'état d'origine
  state.simulationTime = 0;
  state.isRunning = false;
  state.mode = MODES.EDIT;
  clearSelection();
  state.pendingBeamFirstGrid = null;
  state.pendingTerrain = [];
  state.undoSnapshot = null;
  state.windRuntime = null; // le vent repart d'un état neuf au chargement/reset
}

// Charge une structure (cas de test ou sauvegarde) : remplace la structure
// courante et prend un instantané pour "Réinitialiser".
export function loadStructure(structure) {
  // Recale le compteur d'ids au-delà de ceux de la structure chargée AVANT toute
  // édition : une sauvegarde rouverte après un rechargement de page ne doit pas
  // entrer en collision d'ids avec les nouvelles poutres (sinon « ça bugge »).
  adoptIds(structure);
  restoreFrom(structure);
  state.structureSnapshot = structuredClone(structure);
}

// Instantané "tel que conçu", pris juste avant de lancer la simulation. On
// repart toujours de l'état NON déformé : la simulation (et le "Réinitialiser")
// démarrent d'une géométrie propre.
export function takeStructureSnapshot() {
  state.undoSnapshot = null;
  state.windRuntime = null; // vent reconstruit au lancement de la simulation
  resetNodesToRest(state.structure);
  // Caches d'exécution remis à zéro : les efforts affichés (beam._effort) datent
  // du test précédent et ne doivent pas colorer les premières images du nouveau
  // test ; l'index et ses caches dérivés ne doivent pas partir dans le clone.
  invalidateIndex(state.structure);
  for (const beam of state.structure.beams) {
    beam._effort = null;
    beam.overTime = 0;
  }
  state.structureSnapshot = structuredClone(state.structure);
}

export function resetToSnapshot() {
  if (!state.structureSnapshot) {
    state.simulationTime = 0;
    state.isRunning = false;
    state.mode = MODES.EDIT;
    clearSelection();
    state.pendingBeamFirstGrid = null;
    state.pendingTerrain = [];
    return;
  }
  restoreFrom(state.structureSnapshot);
}
