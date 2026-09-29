// state.js
// ────────
// État central (source unique de vérité) : la structure en cours, l'état de la
// simulation (mode, lecture/pause, temps), et l'état d'interface (outil actif,
// type de poutre courant, masse du poids courant, sélection, vue zoom/pan).
//
// Plus de "facteur de déformation" variable : la déformation est désormais
// RÉELLE dans le monde (amplifiée par des raideurs assouplies fixes, voir
// physics/config.js). Le rendu dessine les positions physiques telles quelles.

import {
  createStructure, invalidateIndex, addTerrainPart, adoptIds, removeElements,
  findBeamById, findNodeById, removeBeam, removeJoint, removeLoad, removeMobileLoad,
} from "./model/Structure.js";
import { MODE_DEV, estModeAdmin } from "./mode.js";
import { NATURE_SOL_DEFAUT } from "./model/terrain.js";
import { retirerBateau, bateauxDe } from "./model/bateau.js";
import { applyWorldToMesh } from "./model/mesh.js";
import { BEAM_TYPES } from "./model/materials.js";
import { DEFAULT_ZOOM_LEVEL } from "./render/styleConfig.js";
import { DEFAULT_WIND } from "./physics/wind.js";

export const TOOLS = {
  ADD_BEAM: "addBeam",
  TERRAIN: "terrain",
  ANCHOR: "anchor",
  ARRIVEE: "arrivee",
  ADD_WEIGHT: "addWeight",
  ADD_CAR: "addCar",
  ADD_VAN: "addVan",
  ADD_TRUCK: "addTruck",
  ADD_BOAT: "addBoat",
  DELETE: "delete",
  SELECT: "select",
  PAN: "pan",
};

export const MODES = { EDIT: "edit", SIMULATION: "simulation" };

// Masse par défaut d'un poids posé (kg). L'utilisateur peut l'ajuster ensuite
// dans l'inspecteur du point.
const DEFAULT_WEIGHT_MASS = 8000;

// Tension de base (%) donnée à un CÂBLE au moment de la pose. Légèrement tendu
// par défaut : un câble mou ne travaille pas tant que la structure n'a pas
// commencé à descendre, ce qui donne un à-coup au lancement. 2 % le mettent en
// charge tout de suite, sans le précontraindre sérieusement.
const DEFAULT_CABLE_PRETENSION = 2;

export const state = {
  structure: createStructure(),
  structureSnapshot: null,

  // Niveau en cours (objet de model/levels.js) ou null en carte libre (dev).
  niveauCourant: null,
  // Verdict de l'essai en cours — voir model/essai.js, qui le remplit.
  essai: { statut: "aucun", raison: "", masse: 0, etoiles: 0 },

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
  // simulation : identifiant d'un profil de render/styleConfig.js::PROFILS_TAUX
  // (« gros », « petit », « aucun »). Le bouton de la barre d'outils passe de
  // l'un à l'autre en boucle.
  profilTaux: "petit",

  // Tension de base (%) donnée aux CÂBLES au moment où on les pose (voir
  // model/Structure.js::addBeam). Même plage que l'inspecteur : > 0 = déjà tendu
  // au lancement, < 0 = mou. Réglable dans la barre d'outils (édition).
  currentCablePretension: DEFAULT_CABLE_PRETENSION,

  // Nature du sol donnée aux parties dessinées avec l'outil Sol (voir
  // model/terrain.js), et type du prochain bateau posé (model/bateau.js).
  // Réglages d'édition, pas des propriétés du niveau.
  currentNatureSol: NATURE_SOL_DEFAUT,
  currentTypeBateau: "voile",

  // Matériaux que le NIVEAU en cours autorise : liste d'ids de BEAM_TYPES, ou
  // null quand tout le catalogue est ouvert. C'est une contrainte d'énoncé
  // (« ce pont, en bois seul »), réglée niveau par niveau par l'administrateur
  // et appliquée au chargement du niveau. Voir typesPoutreProposes().
  materiauxAutorises: null,

  // Ralenti de la simulation : multiplicateur du temps réel appliqué à la boucle
  // (0,1 = ×10 plus lent pour voir le détail, 1 = temps réel). Ne change RIEN à
  // la physique (même pas de temps) : on avance simplement moins de pas par
  // image. Réglable en direct, même pendant la simulation (voir main.js).
  simulationSpeed: 1,

  // Cadence RÉELLE mesurée : secondes simulées par seconde d'horloge, à ralenti
  // déduit (1 = temps réel tenu). Elle tombe sous 1 quand la scène demande plus
  // de calcul que la machine n'en fournit dans le budget par image : la
  // simulation ralentit au lieu de geler. Affichée dans la barre d'état pour que
  // ce ralentissement se lise, au lieu de passer pour un blocage.
  cadenceReelle: 1,

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

  // Position MONDE (m) du pointeur au-dessus du canvas, null hors du canvas :
  // lue par la barre d'état (coordonnées) et par les règles graduées.
  pointer: null,

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

// ── Annulation à un coup de la dernière modification (Ctrl+Z) ──
// Suppression OU déplacement d'un point : on prend un instantané juste avant.
export function captureUndo() {
  invalidateIndex(state.structure); // ne pas cloner l'index (Map de réfs)
  state.undoSnapshot = structuredClone(state.structure);
}
export function restoreLastChange() {
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
// Les pièces de l'ÉNONCÉ d'un niveau (routes d'accès, appuis, véhicules) sont
// intouchables pour le JOUEUR : il ne peut ni les effacer ni les déplacer, il
// n'agit que sur ce qu'il a posé. En mode dev, rien n'est protégé — c'est là
// qu'on fabrique les niveaux.
export function estModifiable(item) {
  if (MODE_DEV || estModeAdmin()) return true;
  // Un bateau est le GABARIT de l'énoncé : le joueur le contourne, il ne le
  // pousse pas. Seul l'atelier et l'administrateur y touchent.
  if (item.type === "vehicle" || item.type === "bateau") return false;
  const piece = item.type === "beam"
    ? findBeamById(state.structure, item.id)
    : item.type === "node" ? findNodeById(state.structure, item.id)
      : item.type === "load" ? state.structure.loads.find((l) => l.id === item.id) : null;
  return !(piece && piece.duNiveau);
}

// Supprime les éléments SUPPRIMABLES de la sélection multiple, en UNE opération
// annulable : un seul instantané est pris → un seul Ctrl+Z restaure tout.
export function deleteMultiSelection() {
  const aRetirer = state.multiSelection.filter(estModifiable);
  if (aRetirer.length === 0) return false;
  captureUndo();
  removeElements(state.structure, aRetirer);
  clearSelection();
  return true;
}
// Supprime la sélection courante (simple ou multiple), en UNE opération
// annulable par Ctrl+Z. Les pièces de l'énoncé restent intouchables pour le
// joueur (voir estModifiable). Renvoie true si quelque chose a été supprimé.
export function supprimerSelection() {
  if (state.mode !== MODES.EDIT) return false;
  if (state.multiSelection.length > 0) return deleteMultiSelection();
  const { type, id } = state.selection;
  if (!type || !estModifiable({ type, id })) return false;
  captureUndo();
  if (type === "bateau") retirerBateau(state.structure, id);
  else if (type === "vehicle") removeMobileLoad(state.structure, id);
  else if (type === "load") removeLoad(state.structure, id);
  else if (type === "beam") removeBeam(state.structure, id);
  else if (type === "node") removeJoint(state.structure, id); // poutres rattachées + le point
  clearSelection();
  return true;
}

// Vrai si la commande « Supprimer » a quelque chose à faire.
export function selectionSupprimable() {
  if (state.mode !== MODES.EDIT) return false;
  if (state.multiSelection.length > 0) return state.multiSelection.some(estModifiable);
  return state.selection.type !== null && estModifiable(state.selection);
}

// Valide la partie de sol en cours (si elle a au moins 2 points) et la vide.
// Appelée en quittant l'outil Sol et avant de lancer la simulation.
export function commitPendingTerrain() {
  if (state.pendingTerrain.length >= 2) {
    addTerrainPart(state.structure, state.pendingTerrain, state.currentNatureSol);
  }
  state.pendingTerrain = [];
}

// ── Matériaux autorisés par le niveau ────────────────────────────────────────
// La restriction ne vaut que pour le JOUEUR : le dev et l'administrateur gardent
// tout le catalogue, sinon ils ne pourraient plus dessiner l'énoncé (sa route,
// ses éléments de base) d'un niveau qui interdit ce matériau au joueur.
export function typePoutreAutorise(beamTypeId) {
  if (MODE_DEV || estModeAdmin()) return true;
  return !state.materiauxAutorises || state.materiauxAutorises.includes(beamTypeId);
}

// Les types de poutres à PROPOSER à la construction, dans l'ordre du catalogue.
export function typesPoutreProposes() {
  return BEAM_TYPES.filter((type) => typePoutreAutorise(type.id));
}

// Applique la restriction d'un niveau (null ou liste vide = tout est permis). Si
// le type courant vient d'être interdit, on retombe sur le premier permis : la
// barre des éléments ne doit jamais rester sur un matériau qu'on ne peut plus poser.
export function appliquerMateriauxAutorises(ids) {
  state.materiauxAutorises = ids && ids.length ? [...ids] : null;
  if (!typePoutreAutorise(state.currentBeamTypeId)) {
    const [premier] = typesPoutreProposes();
    if (premier) state.currentBeamTypeId = premier.id;
  }
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
