// ui/structureEditor.js
// ──────────────────────
// Gère les clics/survol sur le canvas en mode édition. On ne crée plus de nœud
// libre : on CLIQUE DEUX POINTS DU MAILLAGE pour tracer une poutre (type choisi
// avant). Autres outils : ancrer un point, poser un poids, ajouter une
// voiture/un camion sur une poutre-route, sélectionner.
//
// DÉPLACER LA VUE : le CLIC DROIT glissé déplace la fenêtre (partout, en édition
// comme en simulation). Il n'y a plus de menu au clic droit ni d'outil « Déplacer ».
//
// Aucune formule physique, aucun dessin ici. Pendant la simulation, seul
// "Sélectionner" (clic gauche) reste actif, en plus du déplacement au clic droit.

import {
  state, MODES, TOOLS, setSelection, clearSelection, setTool,
  setMultiSelection, deleteMultiSelection,
  captureUndoBeforeDelete, restoreLastDeletion, clearUndo,
} from "../state.js";
import {
  addBeam, removeBeam, addLoad, addBeamLoad, removeLoad, findLoadByJointId,
  findNodeById, findBeamById, canAddBeam, clampBeamEnd, addMobileLoad, removeMobileLoad,
  findJointAtGrid, jointBeamCount,
  addAnchorPoint, removeAnchorPoint, removeJoint, toggleAnchor,
} from "../model/Structure.js";
import { syncToolbar } from "./toolbar.js";
import { worldToNearestGrid } from "../model/mesh.js";
import { getVehiclePresetById, instantiateVehicleParams } from "../model/vehiclePresets.js";
import {
  PIXELS_PER_METER, NODE_CLICK_RADIUS, ELEMENT_CLICK_TOLERANCE,
  WEIGHT_CLICK_TOLERANCE, VEHICLE_CLICK_TOLERANCE,
} from "../render/styleConfig.js";
import { worldToBasePixels, screenToWorld, screenToBasePixels } from "../render/displayTransform.js";
import { resolveVehicleDisplayPosition } from "../render/vehicleRenderer.js";
import { getLoadIconBox } from "../render/renderer.js";

export function initStructureEditor(canvas, { onInspect }) {
  canvas.addEventListener("click", (event) => {
    // Le "click" qui conclut un tracé de RECTANGLE de sélection n'est pas un
    // clic : on l'avale (sinon il désélectionnerait ce qu'on vient de choisir).
    if (consumeRectSelectClick()) return;
    clearUndo(); // tout clic sur le canvas = "on bouge ailleurs" → l'annulation expire
    if (state.mode !== MODES.EDIT && state.currentTool !== TOOLS.SELECT) return;
    const world = screenToWorld(...coords(canvas, event), buildView(canvas));
    // screenToBasePixels renvoie {x, y} ; les fonctions de recherche ci-dessous
    // attendent un couple [x, y] (bx[0]/bx[1]) — on convertit donc ici.
    const bp = screenToBasePixels(...coords(canvas, event), buildView(canvas));
    const bx = [bp.x, bp.y];

    // Cliquer une POUTRE existante ouvre toujours ses propriétés, quel que soit
    // l'outil : si l'action principale de l'outil ne s'applique pas ici (pas de
    // point du maillage / pas de cible sous le curseur), on inspecte la poutre.
    switch (state.currentTool) {
      case TOOLS.ADD_BEAM:
        return snapGrid(world) ? handleAddBeam(world) : void tryInspectBeam(bx, onInspect);
      case TOOLS.TERRAIN:
        return snapGrid(world) ? handleTerrain(world) : void tryInspectBeam(bx, onInspect);
      case TOOLS.ANCHOR:
        return snapGrid(world) ? handleAnchor(world) : void tryInspectBeam(bx, onInspect);
      case TOOLS.ADD_WEIGHT:
        return handleAddWeight(bx, onInspect);
      case TOOLS.ADD_CAR:
        return findRoadBeamNear(bx) ? handleAddVehicle("car", bx) : void tryInspectBeam(bx, onInspect);
      case TOOLS.ADD_TRUCK:
        return findRoadBeamNear(bx) ? handleAddVehicle("truck", bx) : void tryInspectBeam(bx, onInspect);
      case TOOLS.DELETE: return handleDelete(bx);
      case TOOLS.SELECT: return handleSelect(bx, onInspect);
      default: return void tryInspectBeam(bx, onInspect);
    }
  });

  // Clic DROIT : sert désormais UNIQUEMENT à déplacer la vue (glisser). On
  // empêche donc le menu contextuel du navigateur d'apparaître. Le déplacement
  // lui-même est géré par initPanDragging (mousedown/mousemove sur bouton droit).
  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("mousemove", (event) => {
    const t = state.currentTool;
    const hovering = state.mode === MODES.EDIT && (t === TOOLS.ADD_BEAM || t === TOOLS.TERRAIN || t === TOOLS.ANCHOR);
    let hg = hovering ? snapGrid(screenToWorld(...coords(canvas, event), buildView(canvas))) : null;
    // En pose de poutre, l'aperçu montre l'accrochage sur un point existant proche.
    if (hg && t === TOOLS.ADD_BEAM) hg = snapToExistingJoint(hg);
    state.hoverGrid = hg;
  });
  canvas.addEventListener("mouseleave", () => { state.hoverGrid = null; });

  // Raccourcis clavier : Échap (voir ci-dessous) ; Suppr/Retour arrière →
  // supprimer l'élément sélectionné ; Ctrl/Cmd+Z → annuler la dernière suppression.
  document.addEventListener("keydown", (event) => {
    const tag = (event.target && event.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // ne pas gêner la saisie

    if (event.key === "Escape") {
      // En POSE de poutre, si une chaîne est en cours (un point de départ est en
      // attente), le 1er Échap ROMPT seulement la chaîne et RESTE en pose (on
      // garde le matériau, il faut re-cliquer un premier point). Un 2e Échap
      // (plus de point en attente) bascule alors en mode Sélection. Depuis tout
      // autre outil, Échap passe directement en Sélection.
      if (state.currentTool === TOOLS.ADD_BEAM && state.pendingBeamFirstGrid) {
        state.pendingBeamFirstGrid = null;
      } else {
        setTool(TOOLS.SELECT);
        syncToolbar();
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault(); // évite aussi la navigation "retour" du navigateur
      // Sélection MULTIPLE (rectangle) : tout supprimer d'un coup — un seul
      // instantané est pris, donc un seul Ctrl+Z restaure tout.
      if (state.mode === MODES.EDIT && state.multiSelection.length > 0) {
        deleteMultiSelection();
        onInspect();
        return;
      }
      if (state.mode === MODES.EDIT && state.selection.type) {
        deleteElement(state.selection.type, state.selection.id); // capture l'annulation
        onInspect();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      if (restoreLastDeletion()) onInspect();
      return;
    }
  });

  initPanDragging(canvas);
  initRectSelection(canvas, onInspect);
}

function buildView(canvas) {
  return { zoomLevel: state.zoomLevel, cameraX: state.cameraX, cameraY: state.cameraY, canvasWidth: canvas.width, canvasHeight: canvas.height };
}
function coords(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  return [(event.clientX - rect.left) * sx, (event.clientY - rect.top) * sy];
}

// Point du maillage le plus proche, seulement s'il est assez près (accrochage).
function snapGrid(world) {
  const g = worldToNearestGrid(world.x, world.y);
  return g.distance * PIXELS_PER_METER <= NODE_CLICK_RADIUS ? { i: g.i, j: g.j } : null;
}

// Si la maille visée est TROP PROCHE d'un point (joint) existant — à une maille
// de distance, soit 50 cm tout droit, soit √2·50 cm en diagonale (8 voisins) —
// on se pose PILE sur ce point existant. Empêche de créer des points trop
// rapprochés ; on accroche au plus proche s'il y en a plusieurs.
function snapToExistingJoint(grid) {
  let best = null;
  let bestD2 = Infinity;
  for (const n of state.structure.nodes) {
    if (n.kind !== "joint" || n.gridI == null || n.gridJ == null) continue;
    const di = n.gridI - grid.i;
    const dj = n.gridJ - grid.j;
    if (Math.abs(di) <= 1 && Math.abs(dj) <= 1) {
      const d2 = di * di + dj * dj;
      if (d2 < bestD2) { best = n; bestD2 = d2; }
    }
  }
  return best ? { i: best.gridI, j: best.gridJ } : grid;
}

// ── Tracer une poutre (2 points du maillage) ──
// Le point visé au-delà de la LONGUEUR MAX du type est ramené à cette longueur
// (clampBeamEnd) : cliquer plus loin pose donc un élément de longueur max dans
// la direction visée, et on repart de son extrémité — cliquer plusieurs fois
// SANS bouger la souris construit une SÉRIE d'éléments vers le point visé.
function handleAddBeam(world) {
  let grid = snapGrid(world);
  if (!grid) return;
  grid = snapToExistingJoint(grid); // trop près d'un point existant → on s'y pose

  if (!state.pendingBeamFirstGrid) {
    state.pendingBeamFirstGrid = grid;
    return;
  }
  const a = state.pendingBeamFirstGrid;
  if (a.i === grid.i && a.j === grid.j) {
    state.pendingBeamFirstGrid = null; // re-clic sur le départ : on arrête la chaîne
    return;
  }
  const end = clampBeamEnd(a, grid, state.currentBeamTypeId);
  if (!end) return; // aucun point du maillage ne convient (trop court après découpe)
  if (canAddBeam(state.structure, a, end, state.currentBeamTypeId).ok) {
    addBeam(state.structure, a, end, state.currentBeamTypeId, state.currentCablePretension);
    // Pose "à la suite" : on RESTE en pose en repartant du point d'arrivée, pour
    // enchaîner les poutres d'un clic. On sort par Échap ou en changeant d'outil.
    state.pendingBeamFirstGrid = end;
  }
  // Si interdit (chemin occupé), on garde le point de départ : l'utilisateur
  // vise un autre point d'arrivée (l'aperçu rouge l'a prévenu).
}

// ── Tracer le sol (points du maillage, validés en « collines ») ──
function handleTerrain(world) {
  const grid = snapGrid(world);
  if (!grid) return;
  const last = state.pendingTerrain[state.pendingTerrain.length - 1];
  if (last && last.i === grid.i && last.j === grid.j) return; // pas deux fois le même point
  state.pendingTerrain.push(grid);
}

// ── Poser / retirer un POINT ANCRÉ (appui) sur le maillage ──
// On ne (dés)ancre plus une poutre existante : on pose des points ancrés. Relier
// une poutre à un tel point l'ancre à son extrémité. Recliquer un point ancré
// ENCORE VIDE (sans poutre) le retire ; s'il porte déjà des poutres, on n'y
// touche pas (le retirer passe par le clic droit → Supprimer le point).
function handleAnchor(world) {
  const grid = snapGrid(world);
  if (!grid) return;
  const existing = findJointAtGrid(state.structure, grid.i, grid.j);
  if (!existing) {
    // Point vide du maillage : on pose un point ancré autonome.
    addAnchorPoint(state.structure, grid);
    return;
  }
  if (jointBeamCount(state.structure, existing.id) === 0) {
    // Point ancré autonome (sans poutre) : recliquer le retire.
    if (existing.fixed) removeAnchorPoint(state.structure, grid);
    return;
  }
  // EXTRÉMITÉ d'une ou plusieurs poutres : ancrer/désancrer ce point existant.
  // Ancré, il devient un appui pour TOUTE poutre qui y finit (type de liaison —
  // pivot ou encastrement — réglable ensuite dans l'inspecteur).
  toggleAnchor(state.structure, existing.id);
}

// Poser un poids : en PRIORITÉ sur un point proche (comme avant), sinon — c'est
// la nouveauté — n'importe où le long d'une poutre sous le curseur (charge fixe
// posée à une fraction quelconque, à la manière d'une charge mobile à l'arrêt).
function handleAddWeight(bx, onInspect) {
  const joint = findJointNear(bx);
  if (joint) {
    const load = addLoad(state.structure, joint.id, state.currentWeightMass, state.currentWeightPlacement);
    setSelection("load", load.id);
    onInspect();
    return;
  }
  const beam = findBeamNear(bx);
  if (beam) {
    const fraction = beamFractionNear(bx, beam);
    const load = addBeamLoad(state.structure, beam.id, fraction, state.currentWeightMass, state.currentWeightPlacement);
    setSelection("load", load.id);
    onInspect();
  }
}

// Fraction 0..1 le long d'une poutre correspondant au point cliqué (projection
// sur la corde point A → point B, suffisante car la poutre est droite au repos).
function beamFractionNear(bx, beam) {
  const a = findNodeById(state.structure, beam.jointAId);
  const b = findNodeById(state.structure, beam.jointBId);
  if (!a || !b) return 0.5;
  return projectFraction(bx, worldToBasePixels(a), worldToBasePixels(b));
}

function handleAddVehicle(presetId, bx) {
  const beam = findRoadBeamNear(bx);
  if (!beam) return;
  const a = findNodeById(state.structure, beam.jointAId);
  const b = findNodeById(state.structure, beam.jointBId);
  const startFraction = projectFraction(bx, worldToBasePixels(a), worldToBasePixels(b));
  const preset = getVehiclePresetById(presetId);
  const { mass, powerHp, referenceSpeed } = instantiateVehicleParams(preset);
  addMobileLoad(state.structure, {
    presetId, mass, powerHp, referenceSpeed, beamId: beam.id, startFraction,
  });
}

function handleDelete(bx) {
  const v = findVehicleNear(bx);
  if (v) { removeMobileLoad(state.structure, v.id); clearSelection(); return; }
  const load = findLoadNear(bx);
  if (load) { removeLoad(state.structure, load.id); clearSelection(); return; }
  const joint = findJointNear(bx);
  if (joint) {
    // Supprimer un point retire toutes les poutres qui s'y rattachent.
    for (const beam of state.structure.beams.filter((b) => b.jointAId === joint.id || b.jointBId === joint.id)) {
      removeBeam(state.structure, beam.id);
    }
    clearSelection();
    return;
  }
  const beam = findBeamNear(bx);
  if (beam) { removeBeam(state.structure, beam.id); clearSelection(); }
}

// Sélectionne + inspecte une poutre sous le curseur (sans changer d'outil).
// Renvoie true si une poutre a été trouvée.
function tryInspectBeam(bx, onInspect) {
  const beam = findBeamNear(bx);
  if (beam) { setSelection("beam", beam.id); onInspect(); return true; }
  return false;
}

function handleSelect(bx, onInspect) {
  const v = findVehicleNear(bx);
  if (v) { setSelection("vehicle", v.id); onInspect(); return; }
  const load = findLoadNear(bx);
  if (load) { setSelection("load", load.id); onInspect(); return; }
  const joint = findJointNear(bx);
  if (joint) { setSelection("node", joint.id); onInspect(); return; }
  const beam = findBeamNear(bx);
  if (beam) { setSelection("beam", beam.id); onInspect(); return; }
  clearSelection();
  onInspect();
}

function deleteElement(type, id) {
  captureUndoBeforeDelete(); // permet le Ctrl+Z juste après
  if (type === "vehicle") removeMobileLoad(state.structure, id);
  else if (type === "load") removeLoad(state.structure, id);
  else if (type === "beam") removeBeam(state.structure, id);
  else if (type === "node") removeJoint(state.structure, id); // poutres rattachées + le point (même ancré)
  clearSelection();
}

// ── Recherches (en "pixels de base") ──
function findJointNear(bx) {
  // Le PLUS PROCHE dans le rayon (maillage à 50 cm : des points sont voisins).
  let best = null;
  let bestD = NODE_CLICK_RADIUS;
  for (const n of state.structure.nodes) {
    if (n.kind !== "joint") continue;
    const p = worldToBasePixels(n);
    const d = Math.hypot(p.x - bx[0], p.y - bx[1]);
    if (d <= bestD) { best = n; bestD = d; }
  }
  return best;
}
function nearestBeam(bx, roadOnly) {
  for (const beam of state.structure.beams) {
    if (roadOnly && !beam.isRoad) continue;
    for (const segId of beam.segIds) {
      const seg = state.structure.segments.find((s) => s.id === segId);
      if (!seg) continue;
      const a = findNodeById(state.structure, seg.nodeAId), b = findNodeById(state.structure, seg.nodeBId);
      if (!a || !b) continue;
      const pa = worldToBasePixels(a), pb = worldToBasePixels(b);
      if (distSeg(bx[0], bx[1], pa.x, pa.y, pb.x, pb.y) <= ELEMENT_CLICK_TOLERANCE) return beam;
    }
  }
  return null;
}
const findBeamNear = (bx) => nearestBeam(bx, false);
const findRoadBeamNear = (bx) => nearestBeam(bx, true);

function findLoadNear(bx) {
  // On teste la boîte de l'icône (même géométrie que le dessin) : marche pour un
  // poids sur point comme sur poutre, suspendu ou posé dessus.
  for (const load of state.structure.loads) {
    const box = getLoadIconBox(state.structure, load);
    if (!box) continue;
    if (Math.abs(bx[0] - box.cx) <= box.w / 2 + 2 && Math.abs(bx[1] - box.cy) <= box.h / 2 + 2) return load;
  }
  return null;
}
function findVehicleNear(bx) {
  for (const v of state.structure.mobileLoads) {
    const pos = resolveVehicleDisplayPosition(v, state.structure);
    if (!pos) continue;
    if (Math.hypot(pos.x - bx[0], pos.y - bx[1]) <= VEHICLE_CLICK_TOLERANCE) return v;
  }
  return null;
}

function projectFraction(bx, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 === 0) return 0.5;
  return Math.max(0, Math.min(1, ((bx[0] - a.x) * dx + (bx[1] - a.y) * dy) / l2));
}
function distSeg(px, py, ax, ay, bx2, by) {
  const dx = bx2 - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ── Sélection RECTANGLE : clic GAUCHE maintenu dans le vide (outil Sélectionner) ──
// Cliquer-glisser dans le vide trace un rectangle élastique ; au relâchement,
// tous les éléments ENTIÈREMENT compris dedans sont sélectionnés — poutres,
// poids et véhicules, pas les points (ils suivent leurs poutres). La touche
// Suppr (ou le bouton de l'inspecteur) supprime alors tout d'un coup, en une
// opération annulable par Ctrl+Z. Fonctionne aussi en simulation (sélection
// seule : la suppression reste réservée au mode édition).

const RECT_DRAG_THRESHOLD_PX = 5; // en dessous : simple clic, pas de rectangle

// Horodatage de fin de tracé : le "click" du navigateur qui suit immédiatement
// le relâchement est avalé (sinon il désélectionnerait tout). Fenêtre courte :
// si aucun click ne suit (relâchement hors canvas), rien ne reste bloqué.
let rectSelectEndedAt = -Infinity;
function consumeRectSelectClick() {
  const recent = performance.now() - rectSelectEndedAt < 300;
  rectSelectEndedAt = -Infinity;
  return recent;
}

function initRectSelection(canvas, onInspect) {
  let startCanvas = null; // coords canvas du mousedown (null = pas de tracé en cours)
  let dragging = false;

  canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return; // clic GAUCHE seulement (le droit déplace la vue)
    if (state.currentTool !== TOOLS.SELECT) return; // les autres outils gardent leur clic
    const bp = screenToBasePixels(...coords(canvas, event), buildView(canvas));
    const bx = [bp.x, bp.y];
    // Un élément sous le curseur → clic normal (sélection simple), pas de rectangle.
    if (findVehicleNear(bx) || findLoadNear(bx) || findJointNear(bx) || findBeamNear(bx)) return;
    startCanvas = coords(canvas, event);
    dragging = false;
  });

  window.addEventListener("mousemove", (event) => {
    if (!startCanvas) return;
    const [x, y] = coords(canvas, event);
    if (!dragging && Math.hypot(x - startCanvas[0], y - startCanvas[1]) < RECT_DRAG_THRESHOLD_PX) return;
    dragging = true;
    const a = screenToBasePixels(startCanvas[0], startCanvas[1], buildView(canvas));
    const b = screenToBasePixels(x, y, buildView(canvas));
    state.selectionRect = {
      x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y),
    };
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button !== 0 || !startCanvas) return;
    if (dragging && state.selectionRect) {
      setMultiSelection(collectElementsInRect(state.selectionRect));
      onInspect();
      rectSelectEndedAt = performance.now(); // avale le "click" qui va suivre
    }
    startCanvas = null;
    dragging = false;
    state.selectionRect = null;
  });
}

// Tous les éléments ENTIÈREMENT compris dans le rectangle (px de base).
function collectElementsInRect(r) {
  const items = [];
  const inside = (x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

  // Poutres : TOUS leurs nœuds (extrémités + internes, donc la poutre déformée
  // aussi) doivent être dans le rectangle.
  for (const beam of state.structure.beams) {
    let all = beam.nodeIds.length > 0;
    for (const id of beam.nodeIds) {
      const n = findNodeById(state.structure, id);
      if (!n) { all = false; break; }
      const p = worldToBasePixels(n);
      if (!inside(p.x, p.y)) { all = false; break; }
    }
    if (all) items.push({ type: "beam", id: beam.id });
  }

  // Poids : leur icône entière (même boîte que le dessin et la détection de clic).
  for (const load of state.structure.loads) {
    const box = getLoadIconBox(state.structure, load);
    if (!box) continue;
    if (inside(box.cx - box.w / 2, box.topY) && inside(box.cx + box.w / 2, box.topY + box.h)) {
      items.push({ type: "load", id: load.id });
    }
  }

  // Véhicules : leur position ± une demi-boîte (même tolérance que le clic).
  for (const v of state.structure.mobileLoads) {
    const pos = resolveVehicleDisplayPosition(v, state.structure);
    if (!pos) continue;
    const half = VEHICLE_CLICK_TOLERANCE;
    if (inside(pos.x - half, pos.y - half) && inside(pos.x + half, pos.y + half)) {
      items.push({ type: "vehicle", id: v.id });
    }
  }
  return items;
}

// ── Déplacement de la vue : CLIC DROIT glissé ──
// Fonctionne partout sur le canvas, quel que soit l'outil, en édition comme en
// simulation. Le menu contextuel du navigateur est neutralisé (voir plus haut).
function initPanDragging(canvas) {
  let panning = false, lx = 0, ly = 0;
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 2) return; // bouton DROIT uniquement
    e.preventDefault();
    panning = true; [lx, ly] = coords(canvas, e); canvas.style.cursor = "grabbing";
  });
  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    const [x, y] = coords(canvas, e);
    const scale = PIXELS_PER_METER * state.zoomLevel;
    state.cameraX -= (x - lx) / scale; state.cameraY -= (y - ly) / scale;
    lx = x; ly = y;
  });
  window.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false; canvas.style.cursor = "default";
  });
}
