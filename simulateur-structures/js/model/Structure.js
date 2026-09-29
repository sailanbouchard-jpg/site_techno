// model/Structure.js
// ──────────────────
// Conteneur central : nœuds, poutres (macro), segments (sous-éléments),
// charges ponctuelles (poids posés), charges mobiles (véhicules). C'est le
// SEUL fichier qui modifie la TOPOLOGIE (créer/supprimer poutres, ancrer,
// scinder une poutre rompue). Aucune formule physique, aucun dessin ici.
//
// Modèle de données :
//   node    : { id, x, y, vx, vy, fixed, kind:"joint"|"inner", gridI, gridJ, restX, restY }
//   beam    : { id, materialId, sectionArea, gridA, gridB, jointAId, jointBId,
//               nodeIds:[...ordonnés...], segIds:[...], isRoad, isCable, broken }
//   segment : { id, beamId, nodeAId, nodeBId, restLength, stiffness }
//   load    : poids posé par l'utilisateur. Deux variantes :
//             { id, jointId, mass, placement }            (posé sur un POINT)
//             { id, beamId, fraction, mass, placement }   (posé sur une POUTRE,
//                fraction 0..1 le long de sa longueur de repos)
//             placement : "below" = suspendu sous le point, "above" = posé dessus.
//   vehicle : voir model/MobileLoad.js

import { createNode } from "./Node.js";
import { getMaterialById, getBeamTypeById, BEAM_TYPES } from "./materials.js";
import {
  gridToWorld, isInBounds, beamsOverlapOnPath, MIN_BEAM_LENGTH,
  MESH, BASE_ORIGIN_X, BASE_COLS, MESH_MIN_COLS, MESH_MAX_COLS,
  BASE_ORIGIN_Y, BASE_ROWS, MESH_MIN_ROWS, MESH_MAX_ROWS,
  applyMeshWidthResize, applyMeshHeightResize, getMeshWorld,
} from "./mesh.js";
import { buildBeamGeometry, computeAxialStiffness } from "./Beam.js";
import { createTerrainPart, isInsideTerrain } from "./terrain.js";
import { segmentCoupeBateau, pointDansBateau } from "./bateau.js";

let nextNumericId = 1;
function generateId(prefix) {
  const id = `${prefix}-${nextNumericId}`;
  nextNumericId += 1;
  return id;
}

export function createStructure() {
  // terrain : tableau de PARTIES de sol, chacune { points:[{i,j}...] } décrivant
  // le HAUT du relief (voir model/terrain.js). Vide = pas de sol (ciel seul).
  // world : LARGEUR de la grille mémorisée avec la structure (voir
  // resizeWorldWidth) — un plan neuf part des dimensions de base.
  return {
    nodes: [], beams: [], segments: [], loads: [], mobileLoads: [], terrain: [],
    // bateaux : décor STATIQUE posé sur l'eau, qui interdit de construire dans
    // son gabarit (voir model/bateau.js).
    bateaux: [],
    world: { originX: BASE_ORIGIN_X, cols: BASE_COLS, originY: BASE_ORIGIN_Y, rows: BASE_ROWS },
  };
}

// ── Index (accélération des recherches) ──
// Les recherches par id étaient des balayages linéaires O(n), appelés des
// milliers de fois PAR PAS physique → coût quadratique, principale cause du
// lag. On maintient donc des Map id→objet, l'adjacence nœud→segments et le
// compte de poutres par joint, (re)construits PARESSEUSEMENT et invalidés dès
// qu'on touche à la TOPOLOGIE (jamais pendant un pas, où elle est figée).
function buildIndex(structure) {
  const nodeById = new Map();
  for (const n of structure.nodes) nodeById.set(n.id, n);
  const beamById = new Map();
  for (const b of structure.beams) beamById.set(b.id, b);
  const segmentById = new Map();
  for (const s of structure.segments) segmentById.set(s.id, s);

  const segmentsByNode = new Map();
  const pushSeg = (nodeId, seg) => {
    let arr = segmentsByNode.get(nodeId);
    if (!arr) {
      arr = [];
      segmentsByNode.set(nodeId, arr);
    }
    arr.push(seg);
  };
  for (const s of structure.segments) {
    pushSeg(s.nodeAId, s);
    pushSeg(s.nodeBId, s);
  }

  const jointBeamCountById = new Map();
  const bump = (id) => {
    if (id != null) jointBeamCountById.set(id, (jointBeamCountById.get(id) || 0) + 1);
  };
  for (const b of structure.beams) {
    bump(b.jointAId);
    if (b.jointBId !== b.jointAId) bump(b.jointBId);
  }

  const loadByJointId = new Map();
  for (const l of structure.loads) if (l.jointId != null) loadByJointId.set(l.jointId, l);

  structure._index = { nodeById, beamById, segmentById, segmentsByNode, jointBeamCountById, loadByJointId };
  return structure._index;
}

// Garantit un index à jour (le reconstruit s'il a été invalidé). À appeler une
// fois en tête de pas physique pour que toutes les recherches du pas soient O(1).
export function ensureIndex(structure) {
  return structure._index || buildIndex(structure);
}

// À appeler après TOUTE modification de topologie (ajout/suppression de poutre,
// rupture, ancrage, charge) OU de propriété physique (matériau, section, masse
// d'un poids, liaison au sol). Jette aussi tous les caches qui en dépendent :
// tampon de forces, masses effectives (physics/mass.js), constantes de flexion
// (physics/bending.js) et poids total. Réveille aussi la structure si elle
// était en sommeil (l'équilibre gelé n'est plus valable).
export function invalidateIndex(structure) {
  structure._index = null;
  structure._forces = null;
  structure._massToken = null;
  structure._bendCache = null;
  structure._solveur = null; // pas de temps et masses d'inertie (physics/solveur.js)
  structure._totalWeight = null;
  structure._totalWeightToken = null;
  structure._asleep = false;
}

// ── Recherches (O(1) via l'index) ──
export function findNodeById(structure, id) {
  return ensureIndex(structure).nodeById.get(id) || null;
}
export function findBeamById(structure, id) {
  return ensureIndex(structure).beamById.get(id) || null;
}
export function findSegmentById(structure, id) {
  return ensureIndex(structure).segmentById.get(id) || null;
}
export function findJointAtGrid(structure, i, j) {
  // Recherche d'édition (clic), hors boucle physique : balayage simple suffisant.
  return structure.nodes.find((n) => n.kind === "joint" && n.gridI === i && n.gridJ === j) || null;
}
export function findLoadByJointId(structure, jointId) {
  return ensureIndex(structure).loadByJointId.get(jointId) || null;
}
// Segment d'une poutre situé à la fraction `t` (0..1) de sa LONGUEUR de repos
// totale, + la fraction locale 0..1 sur ce segment. Source unique pour le poids
// posé sur une poutre (force par règle du levier dans physics/loads.js ET
// position de dessin/clic) — même principe que la charge mobile.
export function beamSegmentAtFraction(structure, beam, t) {
  if (!beam || !beam.segIds || beam.segIds.length === 0) return null;
  const clamped = Math.max(0, Math.min(1, t));
  let total = 0;
  for (const segId of beam.segIds) {
    const seg = findSegmentById(structure, segId);
    if (seg) total += seg.restLength;
  }
  let target = clamped * total;
  const lastSegId = beam.segIds[beam.segIds.length - 1];
  for (const segId of beam.segIds) {
    const seg = findSegmentById(structure, segId);
    if (!seg) continue;
    if (target <= seg.restLength || segId === lastSegId) {
      const fraction = seg.restLength === 0 ? 0 : Math.max(0, Math.min(1, target / seg.restLength));
      return { nodeA: findNodeById(structure, seg.nodeAId), nodeB: findNodeById(structure, seg.nodeBId), fraction };
    }
    target -= seg.restLength;
  }
  return null;
}
// Renvoie le tableau PARTAGÉ de l'index (lecture seule — ne pas muter).
export function segmentsConnectedToNode(structure, nodeId) {
  return ensureIndex(structure).segmentsByNode.get(nodeId) || EMPTY_SEGMENTS;
}
const EMPTY_SEGMENTS = [];
// Combien de poutres (macro) partagent ce joint : ≥ 2 → c'est un assemblage,
// le pivot y résiste élastiquement (voir physics/bending.js).
export function jointBeamCount(structure, jointId) {
  return ensureIndex(structure).jointBeamCountById.get(jointId) || 0;
}

// ── Création de poutre ──
// Peut-on relier ces deux points du maillage ? Non si c'est le même point, s'il
// sort du maillage, si le type impose une longueur max dépassée, ou si une
// poutre occupe déjà le même chemin (colinéaire et recouvrant — voir
// mesh.js::beamsOverlapOnPath). `beamTypeId` est optionnel (absent = pas de
// contrôle de longueur max, ex. démos construites en code).
export function canAddBeam(structure, a, b, beamTypeId) {
  if (a.i === b.i && a.j === b.j) return { ok: false, reason: "même point" };
  if (!isInBounds(a.i, a.j) || !isInBounds(b.i, b.j)) return { ok: false, reason: "hors maillage" };
  // Longueur minimale 1 m (le maillage à 50 cm ne change PAS la portée minimale).
  const wa = gridToWorld(a.i, a.j), wb = gridToWorld(b.i, b.j);
  // On ne construit pas DANS la roche (un point sur le dessus ou sur une paroi
  // reste permis : une poutre peut s'appuyer contre le sol).
  if (isInsideTerrain(structure, wa.x, wa.y) || isInsideTerrain(structure, wb.x, wb.y)) {
    return { ok: false, reason: "extrémité dans le sol" };
  }
  const length = Math.hypot(wb.x - wa.x, wb.y - wa.y);
  if (length < MIN_BEAM_LENGTH - 1e-9) {
    return { ok: false, reason: "poutre trop courte (1 m minimum)" };
  }
  const beamType = beamTypeId ? getBeamTypeById(beamTypeId) : null;
  if (beamType && beamType.maxLength && length > beamType.maxLength + 1e-9) {
    return { ok: false, reason: `élément trop long (${beamType.maxLength} m max pour ce type)` };
  }
  for (const beam of structure.beams) {
    if (beamsOverlapOnPath(a, b, beam.gridA, beam.gridB)) {
      return { ok: false, reason: "une poutre occupe déjà ce chemin" };
    }
  }
  // Le gabarit des bateaux doit rester libre : c'est le tirant d'air du pont.
  if (segmentCoupeBateau(structure, wa.x, wa.y, wb.x, wb.y)) {
    return { ok: false, reason: "un bateau doit pouvoir passer ici" };
  }
  return { ok: true };
}

// Point d'arrivée EFFECTIF d'un tracé de poutre : si le point visé `b` est plus
// loin que la longueur max du type, on le RAMÈNE sur le maillage à (au plus)
// cette longueur, dans la direction a→b. C'est la brique de la POSE EN SÉRIE :
// chaque clic au-delà de la longueur max pose un élément de longueur max vers
// le point visé, et on repart de son extrémité (sans bouger la souris, cliquer
// plusieurs fois enchaîne les éléments). Renvoie `b` inchangé s'il est déjà
// assez proche, ou null si aucun point du maillage ne convient.
export function clampBeamEnd(a, b, beamTypeId) {
  const beamType = beamTypeId ? getBeamTypeById(beamTypeId) : null;
  const maxLength = beamType && beamType.maxLength ? beamType.maxLength : Infinity;
  const wa = gridToWorld(a.i, a.j), wb = gridToWorld(b.i, b.j);
  const dist = Math.hypot(wb.x - wa.x, wb.y - wa.y);
  if (dist <= maxLength + 1e-9) return b;

  // On redescend le long de a→b par petits pas (une demi-maille) depuis la
  // longueur max, et on prend le PREMIER point du maillage arrondi qui tient
  // dans la longueur max tout en restant une vraie poutre (≥ 1 m, ≠ départ).
  const stepT = MESH.spacing / (2 * dist);
  for (let t = maxLength / dist; t > 0; t -= stepT) {
    const gi = Math.round(a.i + t * (b.i - a.i));
    const gj = Math.round(a.j + t * (b.j - a.j));
    if (gi === a.i && gj === a.j) break;
    const w = gridToWorld(gi, gj);
    const len = Math.hypot(w.x - wa.x, w.y - wa.y);
    if (len <= maxLength + 1e-9 && len >= MIN_BEAM_LENGTH - 1e-9) return { i: gi, j: gj };
  }
  return null;
}

function ensureJoint(structure, grid) {
  const existing = findJointAtGrid(structure, grid.i, grid.j);
  if (existing) return existing;
  const world = gridToWorld(grid.i, grid.j);
  const node = createNode({ id: generateId("node"), x: world.x, y: world.y, kind: "joint", gridI: grid.i, gridJ: grid.j });
  structure.nodes.push(node);
  return node;
}

function addInnerNode(structure, x, y) {
  const node = createNode({ id: generateId("node"), x, y, kind: "inner" });
  structure.nodes.push(node);
  return node;
}

function addSegment(structure, beamId, nodeAId, nodeBId, restLength, stiffness) {
  const seg = { id: generateId("seg"), beamId, nodeAId, nodeBId, restLength, stiffness };
  structure.segments.push(seg);
  return seg;
}

// Crée une poutre entre deux points du maillage `a` et `b` (indices), du type
// donné. Réutilise les joints déjà présents, crée les nœuds internes de
// subdivision et les segments. Suppose canAddBeam() déjà vérifié.
// `cablePretension` (%) n'est appliqué QUE si le type est un câble : c'est la
// tension de base choisie dans la barre d'outils au moment de la pose.
export function addBeam(structure, a, b, beamTypeId, cablePretension = 0) {
  const beamType = getBeamTypeById(beamTypeId);
  const materialId = beamType.materialId;
  const sectionArea = beamType.thickness;
  // Les drapeaux dépendent STRICTEMENT du type : seule une poutre de type ROUTE
  // porte des charges mobiles ; seul le type CÂBLE travaille en traction seule.
  const isRoad = beamType.road === true;
  const isCable = beamType.cable === true;

  const jointA = ensureJoint(structure, a);
  const jointB = ensureJoint(structure, b);
  const geom = buildBeamGeometry(jointA.x, jointA.y, jointB.x, jointB.y, materialId, sectionArea);

  const nodeIds = [jointA.id];
  for (const pos of geom.innerPositions) {
    nodeIds.push(addInnerNode(structure, pos.x, pos.y).id);
  }
  nodeIds.push(jointB.id);

  const beamId = generateId("beam");
  const segIds = [];
  for (let k = 0; k < nodeIds.length - 1; k++) {
    segIds.push(addSegment(structure, beamId, nodeIds[k], nodeIds[k + 1], geom.segRestLength, geom.segStiffness).id);
  }

  const beam = {
    id: beamId,
    materialId,
    sectionArea,
    gridA: { i: a.i, j: a.j },
    gridB: { i: b.i, j: b.j },
    jointAId: jointA.id,
    jointBId: jointB.id,
    nodeIds,
    segIds,
    isRoad,
    isCable,
    // Tension de base d'un câble (%), réglable ensuite dans l'inspecteur. Donnée
    // ici par la valeur par défaut de la barre d'outils (ignorée hors câble).
    pretension: isCable ? cablePretension : 0,
    broken: false,
  };
  structure.beams.push(beam);
  invalidateIndex(structure);
  return beam;
}

// ── Déplacer un POINT (glisser-déposer en édition) ───────────────────────────
// On promène un joint sur le maillage : toutes les poutres qui s'y rattachent
// suivent et sont RECONSTRUITES à leur nouvelle longueur (nœuds internes et
// segments refaits, car leur nombre dépend de la longueur). Les identifiants de
// POUTRE ne changent pas : les véhicules et les poids posés dessus restent
// accrochés.
//
// Le déplacement est REFUSÉ (rien ne bouge) si une seule poutre y perdrait sa
// validité : trop longue pour son type, trop courte (1 m minimum), sortie du
// maillage, ou venant recouvrir une autre poutre.

// Le type catalogue d'une poutre, retrouvé par son couple matériau + section :
// c'est lui qui porte la longueur maximale.
function beamTypeOf(beam) {
  return BEAM_TYPES.find((t) => t.materialId === beam.materialId && t.thickness === beam.sectionArea) || null;
}

export function beamsAtJoint(structure, jointId) {
  return structure.beams.filter((b) => b.jointAId === jointId || b.jointBId === jointId);
}

// Le joint peut-il aller sur `grid` ? Renvoie { ok } ou { ok:false, reason }.
export function canMoveJoint(structure, jointId, grid) {
  const node = findNodeById(structure, jointId);
  if (!node || node.kind !== "joint") return { ok: false, reason: "pas un point" };
  if (!isInBounds(grid.i, grid.j)) return { ok: false, reason: "hors maillage" };
  if (grid.i === node.gridI && grid.j === node.gridJ) return { ok: true };

  const occupant = findJointAtGrid(structure, grid.i, grid.j);
  if (occupant) return { ok: false, reason: "un point occupe déjà cette place" };

  const cible = gridToWorld(grid.i, grid.j);
  if (isInsideTerrain(structure, cible.x, cible.y)) return { ok: false, reason: "dans le sol" };
  if (pointDansBateau(structure, cible.x, cible.y)) {
    return { ok: false, reason: "un bateau occupe cette place" };
  }
  const attachees = beamsAtJoint(structure, jointId);

  for (const beam of attachees) {
    const autreId = beam.jointAId === jointId ? beam.jointBId : beam.jointAId;
    const autre = findNodeById(structure, autreId);
    if (!autre) continue;
    const longueur = Math.hypot(autre.restX - cible.x, autre.restY - cible.y);
    if (longueur < MIN_BEAM_LENGTH - 1e-9) return { ok: false, reason: "poutre trop courte" };
    const type = beamTypeOf(beam);
    if (type && type.maxLength && longueur > type.maxLength + 1e-9) {
      return { ok: false, reason: "poutre trop longue" };
    }
  }

  // Chevauchement : chaque poutre déplacée est testée contre toutes les autres
  // (les poutres qui bougent ensemble partagent ce point, elles ne peuvent pas
  // se recouvrir sans être déjà colinéaires — le test les couvre quand même).
  const bouge = new Set(attachees.map((b) => b.id));
  for (const beam of attachees) {
    const a = beam.jointAId === jointId ? grid : beam.gridA;
    const b = beam.jointBId === jointId ? grid : beam.gridB;
    for (const autre of structure.beams) {
      if (autre.id === beam.id) continue;
      const oa = bouge.has(autre.id) && autre.jointAId === jointId ? grid : autre.gridA;
      const ob = bouge.has(autre.id) && autre.jointBId === jointId ? grid : autre.gridB;
      if (beamsOverlapOnPath(a, b, oa, ob)) return { ok: false, reason: "deux poutres se recouvriraient" };
    }
    const wa = gridToWorld(a.i, a.j);
    const wb = gridToWorld(b.i, b.j);
    if (segmentCoupeBateau(structure, wa.x, wa.y, wb.x, wb.y)) {
      return { ok: false, reason: "une poutre traverserait un bateau" };
    }
  }
  return { ok: true };
}

// Refait les nœuds internes et les segments d'une poutre à partir de la
// position de ses deux joints. Garde l'id de la poutre et ceux de ses joints.
function rebuildBeam(structure, beam) {
  const jointA = findNodeById(structure, beam.jointAId);
  const jointB = findNodeById(structure, beam.jointBId);
  if (!jointA || !jointB) return;

  // Les anciens nœuds internes et segments disparaissent (les poids accrochés à
  // la POUTRE survivent : ils la repèrent par beamId + fraction, pas par nœud).
  const internes = new Set(beam.nodeIds.slice(1, -1));
  structure.nodes = structure.nodes.filter((n) => !internes.has(n.id));
  const anciens = new Set(beam.segIds);
  structure.segments = structure.segments.filter((seg) => !anciens.has(seg.id));

  const geom = buildBeamGeometry(jointA.restX, jointA.restY, jointB.restX, jointB.restY,
                                 beam.materialId, beam.sectionArea);
  const nodeIds = [jointA.id];
  for (const pos of geom.innerPositions) nodeIds.push(addInnerNode(structure, pos.x, pos.y).id);
  nodeIds.push(jointB.id);

  const segIds = [];
  for (let k = 0; k < nodeIds.length - 1; k++) {
    segIds.push(addSegment(structure, beam.id, nodeIds[k], nodeIds[k + 1],
                           geom.segRestLength, geom.segStiffness).id);
  }
  beam.nodeIds = nodeIds;
  beam.segIds = segIds;
}

// Déplace le joint et reconstruit ses poutres. Renvoie false si c'était refusé.
export function moveJoint(structure, jointId, grid) {
  if (!canMoveJoint(structure, jointId, grid).ok) return false;
  const node = findNodeById(structure, jointId);
  if (grid.i === node.gridI && grid.j === node.gridJ) return true;

  const cible = gridToWorld(grid.i, grid.j);
  node.gridI = grid.i;
  node.gridJ = grid.j;
  node.x = node.restX = cible.x;
  node.y = node.restY = cible.y;
  node.vx = 0;
  node.vy = 0;

  for (const beam of beamsAtJoint(structure, jointId)) {
    if (beam.jointAId === jointId) beam.gridA = { i: grid.i, j: grid.j };
    if (beam.jointBId === jointId) beam.gridB = { i: grid.i, j: grid.j };
    rebuildBeam(structure, beam);
  }
  invalidateIndex(structure);
  return true;
}

// ── Suppression ──
function removeNodeById(structure, nodeId) {
  structure.nodes = structure.nodes.filter((n) => n.id !== nodeId);
  structure.loads = structure.loads.filter((l) => l.jointId !== nodeId);
}

export function removeBeam(structure, beamId) {
  const beam = findBeamById(structure, beamId);
  if (!beam) return;

  // Segments + nœuds internes de cette poutre disparaissent avec elle.
  const innerIds = beam.nodeIds.filter((id) => id !== beam.jointAId && id !== beam.jointBId);
  structure.segments = structure.segments.filter((s) => s.beamId !== beamId);
  structure.beams = structure.beams.filter((b) => b.id !== beamId);
  for (const id of innerIds) removeNodeById(structure, id);
  // La topologie a changé : l'index doit refléter le retrait AVANT le calcul
  // de jointBeamCount ci-dessous (sinon il compterait encore la poutre retirée).
  invalidateIndex(structure);

  // Charges mobiles qui roulaient sur cette poutre : supprimées.
  structure.mobileLoads = structure.mobileLoads.filter((v) => v.beamId !== beamId);
  // Poids posés SUR cette poutre : supprimés avec elle (les poids sur points,
  // eux, partent avec leur point dans removeNodeById).
  structure.loads = structure.loads.filter((l) => l.beamId !== beamId);

  // Joints devenus orphelins (plus aucune poutre) : retirés — SAUF les points
  // ANCRÉS, qui sont des appuis posés volontairement et PERSISTENT même sans
  // poutre (on les retire explicitement via l'outil Ancrer ou le clic droit).
  for (const jointId of [beam.jointAId, beam.jointBId]) {
    if (jointBeamCount(structure, jointId) === 0) {
      const joint = findNodeById(structure, jointId);
      if (joint && !joint.fixed) removeNodeById(structure, jointId);
    }
  }
  invalidateIndex(structure);
}

// ── Ancrage / charges ponctuelles ──
export function toggleAnchor(structure, jointId) {
  const node = findNodeById(structure, jointId);
  if (!node || node.kind !== "joint") return;
  node.fixed = !node.fixed;
  if (node.fixed) {
    node.vx = 0;
    node.vy = 0;
  }
  invalidateIndex(structure);
}

// ── Point d'ARRIVÉE ──────────────────────────────────────────────────────────
// Le drapeau que tous les véhicules doivent atteindre pour valider le niveau.
// C'est un NŒUD de route, pas une abscisse : le joueur peut faire passer sa
// route où il veut, l'arrivée reste là où l'auteur du niveau l'a plantée.
// Un seul par niveau — en poser un nouveau déplace l'ancien.

export function noeudArrivee(structure) {
  return structure.nodes.find((node) => node.arrivee) || null;
}

export function estArrivee(structure, nodeId) {
  const node = findNodeById(structure, nodeId);
  return Boolean(node && node.arrivee);
}

// Vrai si ce nœud tient au moins une poutre de ROUTE : ailleurs, une arrivée
// n'aurait aucun sens, aucun véhicule ne pourrait y parvenir.
export function estNoeudDeRoute(structure, jointId) {
  return structure.beams.some((beam) => beam.isRoad && (beam.jointAId === jointId || beam.jointBId === jointId));
}

// Pose l'arrivée sur ce nœud, ou la retire si elle y était déjà.
export function basculerArrivee(structure, jointId) {
  const node = findNodeById(structure, jointId);
  if (!node || node.kind !== "joint") return false;
  const etait = Boolean(node.arrivee);
  for (const autre of structure.nodes) delete autre.arrivee;
  if (!etait) node.arrivee = true;
  return !etait;
}

// ── Points ANCRÉS (appuis) posés directement sur le maillage ──────────────────
// Nouveau modèle : on ne (dés)ancre plus un point de poutre existant. On POSE
// des points ancrés ; relier une poutre à un tel point l'ancre à son extrémité
// (ensureJoint réutilise le joint fixe déjà présent).

// Pose un point ancré (joint fixe autonome) sur un point libre du maillage.
// S'il y a déjà un joint là (avec ou sans poutres), on n'y touche pas.
export function addAnchorPoint(structure, grid) {
  if (findJointAtGrid(structure, grid.i, grid.j)) return null;
  const world = gridToWorld(grid.i, grid.j);
  if (pointDansBateau(structure, world.x, world.y)) return null;
  const node = createNode({ id: generateId("node"), x: world.x, y: world.y, fixed: true, kind: "joint", gridI: grid.i, gridJ: grid.j });
  structure.nodes.push(node);
  invalidateIndex(structure);
  return node;
}

// Retire un point ancré AUTONOME (fixe, sans aucune poutre). Sans effet s'il
// porte des poutres (le retirer alors passe par removeJoint / clic droit).
export function removeAnchorPoint(structure, grid) {
  const node = findJointAtGrid(structure, grid.i, grid.j);
  if (!node || !node.fixed) return false;
  if (jointBeamCount(structure, node.id) > 0) return false;
  removeNodeById(structure, node.id);
  invalidateIndex(structure);
  return true;
}

// Supprime un LOT d'éléments { type: "beam"|"load"|"vehicle"|"node", id } en une
// passe (sélection multiple). L'ordre gère les dépendances : véhicules et poids
// d'abord (ils peuvent disparaître avec leur poutre), puis poutres, puis points.
// Chaque retrait individuel est TOLÉRANT à un élément déjà disparu (supprimé
// par ricochet d'un retrait précédent).
export function removeElements(structure, items) {
  for (const it of items) if (it.type === "vehicle") removeMobileLoad(structure, it.id);
  for (const it of items) if (it.type === "load") removeLoad(structure, it.id);
  for (const it of items) if (it.type === "beam") removeBeam(structure, it.id);
  for (const it of items) if (it.type === "node") removeJoint(structure, it.id);
}

// Supprime un point (joint) et TOUTES ses poutres — y compris un point ancré.
export function removeJoint(structure, jointId) {
  const node = findNodeById(structure, jointId);
  if (!node) return;
  for (const beam of structure.beams.filter((b) => b.jointAId === jointId || b.jointBId === jointId)) {
    removeBeam(structure, beam.id);
  }
  // removeBeam ne retire pas un point ancré orphelin : on force ici.
  if (findNodeById(structure, jointId)) {
    removeNodeById(structure, jointId);
    invalidateIndex(structure);
  }
}

export function addLoad(structure, jointId, mass, placement = "below") {
  const existing = findLoadByJointId(structure, jointId);
  if (existing) {
    existing.mass = mass;
    existing.placement = placement;
    return existing;
  }
  const load = { id: generateId("load"), jointId, mass, placement };
  structure.loads.push(load);
  invalidateIndex(structure);
  return load;
}

// Poids posé sur une POUTRE à la fraction `fraction` (0..1 le long de la poutre).
// Contrairement au poids sur point, on autorise PLUSIEURS poids sur une même
// poutre (chacun a sa fraction).
export function addBeamLoad(structure, beamId, fraction, mass, placement = "below") {
  const load = { id: generateId("load"), beamId, fraction: Math.max(0, Math.min(1, fraction)), mass, placement };
  structure.loads.push(load);
  invalidateIndex(structure);
  return load;
}

export function removeLoad(structure, loadId) {
  structure.loads = structure.loads.filter((l) => l.id !== loadId);
  invalidateIndex(structure);
}

// ── Charges mobiles (véhicules) ──
export function addMobileLoad(structure, { presetId, mass, masseAffichee, powerHp, referenceSpeed, beamId, startFraction = 0.5 }) {
  const vehicle = {
    id: generateId("vehicle"),
    presetId,
    mass, // ce que la structure encaisse
    masseAffichee: masseAffichee || mass, // ce qu'on annonce (voir vehiclePresets.js)
    powerHp,
    referenceSpeed,
    beamId,
    distanceAlongBeam: 0, // recalculé au lancement depuis startFraction
    startFraction,
    direction: 1, // recalculé au placement pour aller vers la droite (voir vehicleMotion)
    pathVelocity: 0,
    state: "onRoad",
  };
  structure.mobileLoads.push(vehicle);
  return vehicle;
}

export function removeMobileLoad(structure, vehicleId) {
  structure.mobileLoads = structure.mobileLoads.filter((v) => v.id !== vehicleId);
}

// ── Sol (terrain) ──
// Le sol n'entre pas dans l'index des recherches (il n'a ni id ni voisinage) :
// ces fonctions ne touchent donc qu'au tableau structure.terrain.
export function addTerrainPart(structure, points, nature) {
  if (!structure.terrain) structure.terrain = [];
  if (!points || points.length < 2) return null;
  const part = createTerrainPart(points, nature);
  structure.terrain.push(part);
  bumpTerrainVersion(structure);
  return part;
}

export function removeTerrainPartAt(structure, index) {
  if (!structure.terrain) return;
  structure.terrain.splice(index, 1);
  bumpTerrainVersion(structure);
}

export function clearTerrain(structure) {
  structure.terrain = [];
  bumpTerrainVersion(structure);
}

// Compteur de version du relief : le rendu met le SOL en cache dans un canvas
// hors écran (render/backgroundCache.js) et ne le redessine que si cette
// version (ou la vue) a changé.
// Le décor statique (sol, bateaux) a changé : le cache d'arrière-plan doit se
// redessiner (voir render/backgroundCache.js).
export function bumpTerrainVersion(structure) {
  structure._terrainVersion = (structure._terrainVersion || 0) + 1;
}

// ── Largeur du MONDE (redimensionnement de la grille) ─────────────────────────
// Élargit/rétrécit la grille SYMÉTRIQUEMENT de `deltaPerSide` colonnes de chaque
// côté (gauche ET droite). Les positions MONDE des éléments existants sont
// CONSERVÉES (les structures restent au centre) : on ne change QUE leurs indices
// de maillage, et l'origine de la grille glisse d'autant vers les x négatifs —
// « comme si on allait dans les x négatifs » à gauche. Pour un rétrécissement
// (deltaPerSide < 0), on vérifie d'abord qu'aucun élément n'occupe les colonnes
// retirées. Renvoie true si le redimensionnement a été appliqué.
export function resizeWorldWidth(structure, deltaPerSide) {
  if (!deltaPerSide) return false;
  const newCols = MESH.cols + 2 * deltaPerSide;
  if (newCols < MESH_MIN_COLS || newCols > MESH_MAX_COLS) return false;

  if (deltaPerSide < 0) {
    const cut = -deltaPerSide; // colonnes retirées de chaque côté
    if (!gridIndicesWithin(structure, cut, MESH.cols - cut)) return false;
  }

  applyMeshWidthResize(deltaPerSide);
  shiftStructureGridI(structure, deltaPerSide);
  structure.world = getMeshWorld();
  return true;
}

// ── Hauteur du MONDE ─────────────────────────────────────────────────────────
// Monte (delta>0) ou abaisse (delta<0) le PLAFOND de la grille de `delta` lignes.
// Le BAS du monde ne bouge pas : le fond du ravin, l'eau et les altitudes lues
// sur la règle restent les mêmes, et ce qu'on gagne est du CIEL. Les positions
// MONDE des éléments existants sont conservées — seuls leurs indices j glissent.
// Abaisser le plafond est refusé si quelque chose occupe les lignes retirées.
export function resizeWorldHeight(structure, delta) {
  if (!delta) return false;
  const newRows = MESH.rows + delta;
  if (newRows < MESH_MIN_ROWS || newRows > MESH_MAX_ROWS) return false;
  // Abaisser : on retire `-delta` lignes EN HAUT, donc tout doit être au-dessous.
  if (delta < 0 && !gridJWithin(structure, -delta)) return false;

  applyMeshHeightResize(delta);
  shiftStructureGridJ(structure, delta);
  structure.world = getMeshWorld();
  return true;
}

// Vrai si TOUS les indices de ligne (j) de la structure (points et sol) sont au
// moins à `minJ` — garde-fou avant d'abaisser le plafond.
function gridJWithin(structure, minJ) {
  for (const n of structure.nodes) {
    if (n.gridJ != null && n.gridJ < minJ) return false;
  }
  if (structure.terrain) {
    for (const part of structure.terrain) {
      for (const p of part.points) if (p.j < minJ) return false;
    }
  }
  return true;
}

// Décale de `dj` lignes tous les indices de maillage (j) de la structure. Les
// positions MONDE restent inchangées. Voir resizeWorldHeight.
export function shiftStructureGridJ(structure, dj) {
  if (!dj) return;
  for (const n of structure.nodes) if (n.gridJ != null) n.gridJ += dj;
  for (const b of structure.beams) {
    if (b.gridA) b.gridA.j += dj;
    if (b.gridB) b.gridB.j += dj;
  }
  if (structure.terrain) {
    for (const part of structure.terrain) {
      for (const p of part.points) p.j += dj;
    }
  }
  invalidateIndex(structure);
  bumpTerrainVersion(structure); // le décor (grille + sol) est à redessiner
}

// Vrai si TOUS les indices de colonne (i) de la structure (points et sol)
// tiennent dans [minI, maxI] — garde-fou avant un rétrécissement.
function gridIndicesWithin(structure, minI, maxI) {
  for (const n of structure.nodes) {
    if (n.gridI != null && (n.gridI < minI || n.gridI > maxI)) return false;
  }
  if (structure.terrain) {
    for (const part of structure.terrain) {
      for (const p of part.points) if (p.i < minI || p.i > maxI) return false;
    }
  }
  return true;
}

// Décale de `di` colonnes tous les indices de maillage (i) de la structure
// (points, extrémités de poutres, sommets de sol). Les positions MONDE (x/restX,
// et pour le sol la conversion via gridToWorld avec origine décalée) restent
// inchangées. Voir resizeWorldWidth.
export function shiftStructureGridI(structure, di) {
  if (!di) return;
  for (const n of structure.nodes) if (n.gridI != null) n.gridI += di;
  for (const b of structure.beams) {
    if (b.gridA) b.gridA.i += di;
    if (b.gridB) b.gridB.i += di;
  }
  if (structure.terrain) {
    for (const part of structure.terrain) {
      for (const p of part.points) p.i += di;
    }
  }
  invalidateIndex(structure);
  bumpTerrainVersion(structure); // force la reconstruction du cache décor (grille + sol)
}

// ── Rupture : scinder une poutre à un nœud interne ──
// La poutre se casse au nœud interne d'indice `breakIndex` (1..len-2) : on
// duplique ce nœud (les deux morceaux peuvent dès lors s'écarter), on répartit
// les nœuds en deux chaînes, et on reconstruit une poutre par chaîne. Les
// joints d'extrémité gardent leur identité (les morceaux restent accrochés à
// la structure par leurs bouts). Les joints, eux, ne se brisent jamais.
export function splitBeam(structure, beamId, breakIndex) {
  const beam = findBeamById(structure, beamId);
  if (!beam) return;
  const ids = beam.nodeIds;
  if (breakIndex < 1 || breakIndex > ids.length - 2) return;

  const breakNode = findNodeById(structure, ids[breakIndex]);
  const duplicate = addInnerNode(structure, breakNode.x, breakNode.y);
  duplicate.vx = breakNode.vx;
  duplicate.vy = breakNode.vy;

  const firstChain = ids.slice(0, breakIndex + 1); // ... -> breakNode
  const secondChain = [duplicate.id, ...ids.slice(breakIndex + 1)]; // duplicate -> ...

  // Distance (le long de la poutre, depuis le nœud A) jusqu'au point de rupture :
  // sert à savoir sur LEQUEL des deux morceaux se trouve une charge mobile.
  // Calculée AVANT de retirer les segments d'origine.
  let breakDistance = 0;
  for (let k = 0; k < breakIndex; k++) {
    const sg = findSegmentById(structure, beam.segIds[k]);
    if (sg) breakDistance += sg.restLength;
  }

  // On retire l'ancienne poutre (segments compris) puis on en recrée deux.
  structure.segments = structure.segments.filter((s) => s.beamId !== beamId);
  structure.beams = structure.beams.filter((b) => b.id !== beamId);
  // Le nœud dupliqué et la nouvelle topologie doivent être visibles des
  // findNodeById de rebuildBeamFromChain : on rafraîchit l'index ici.
  invalidateIndex(structure);

  const firstBeam = rebuildBeamFromChain(structure, beam, firstChain, true);
  const secondBeam = rebuildBeamFromChain(structure, beam, secondChain, true);

  // Une charge mobile sur la poutre rompue NE disparaît PAS : elle reste sur le
  // morceau où elle se trouvait et continue d'avancer (elle s'arrêtera au bout
  // du morceau s'il n'y a plus de route ensuite, voir vehicleMotion.js).
  for (const v of structure.mobileLoads) {
    if (v.beamId !== beamId) continue;
    if (v.distanceAlongBeam <= breakDistance && firstBeam) {
      v.beamId = firstBeam.id; // distance inchangée (même origine, nœud A)
    } else if (secondBeam) {
      v.beamId = secondBeam.id;
      v.distanceAlongBeam = Math.max(0, v.distanceAlongBeam - breakDistance);
    }
    v.placed = true; // déjà positionnée ; on garde direction et vitesse
  }
  invalidateIndex(structure);
}

function rebuildBeamFromChain(structure, oldBeam, chainNodeIds, broken) {
  if (chainNodeIds.length < 2) return null;
  const beamId = generateId("beam");
  const segIds = [];
  for (let k = 0; k < chainNodeIds.length - 1; k++) {
    const a = findNodeById(structure, chainNodeIds[k]);
    const b = findNodeById(structure, chainNodeIds[k + 1]);
    const restLength = Math.hypot(b.restX - a.restX, b.restY - a.restY) || 0.0001;
    const stiffness = computeAxialStiffness(oldBeam.materialId, oldBeam.sectionArea, restLength);
    segIds.push(addSegment(structure, beamId, a.id, b.id, restLength, stiffness).id);
  }
  const aNode = findNodeById(structure, chainNodeIds[0]);
  const bNode = findNodeById(structure, chainNodeIds[chainNodeIds.length - 1]);
  const beam = {
    id: beamId,
    materialId: oldBeam.materialId,
    sectionArea: oldBeam.sectionArea,
    gridA: aNode.kind === "joint" ? { i: aNode.gridI, j: aNode.gridJ } : null,
    gridB: bNode.kind === "joint" ? { i: bNode.gridI, j: bNode.gridJ } : null,
    jointAId: aNode.kind === "joint" ? aNode.id : null,
    jointBId: bNode.kind === "joint" ? bNode.id : null,
    nodeIds: [...chainNodeIds],
    segIds,
    isRoad: false, // un morceau rompu ne porte plus de route
    isCable: oldBeam.isCable,
    broken,
  };
  structure.beams.push(beam);
  return beam;
}

// ── Sérialisation propre / chargement (sauvegardes serveur) ───────────────────
// exportStructure : copie SÉRIALISABLE et PROPRE de la structure, à envoyer au
// serveur. On ne garde que l'état de CONCEPTION :
//  - on jette les caches internes (index, forces, masses) — des Map de
//    références qui n'ont aucun sens hors de la session courante ;
//  - on remet chaque nœud à sa position d'origine (restX/restY) et à vitesse
//    nulle : une structure sauvegardée pendant/après un test ne doit pas revenir
//    DÉFORMÉE au chargement (c'était une cause des « sauvegardes qui buggaient ») ;
//  - on remet broken=false et on neutralise l'état transitoire des véhicules.
export function exportStructure(structure) {
  invalidateIndex(structure); // ne jamais embarquer l'index (Map de réfs)
  const copy = structuredClone(structure);
  delete copy._index;
  delete copy._forces;
  delete copy._massToken;
  delete copy._bendCache;
  delete copy._solveur;
  delete copy._totalWeight;
  delete copy._totalWeightToken;
  delete copy._anyOverload;
  for (const node of copy.nodes) {
    node.x = node.restX;
    node.y = node.restY;
    node.vx = 0;
    node.vy = 0;
    delete node._masse; // recalculées au chargement (physics/mass.js)
    delete node._masseInertie;
  }
  for (const beam of copy.beams) {
    beam.broken = false;
    delete beam._effort; // caches d'exécution (efforts affichés, surcharge)
    delete beam.overTime;
  }
  for (const segment of copy.segments) delete segment._tension;
  for (const vehicle of copy.mobileLoads || []) {
    vehicle.distanceAlongBeam = 0;
    vehicle.pathVelocity = 0;
    vehicle.direction = 1;
    vehicle.state = "onRoad";
    delete vehicle.placed;
  }
  return copy;
}

// adoptIds : après avoir CHARGÉ une structure (sauvegarde venue du serveur, donc
// avec des ids générés lors d'une AUTRE session), recale le compteur d'ids
// au-delà du plus grand id présent. Sans ça, après un rechargement de page le
// compteur repart de 1 : la 1re poutre ajoutée réutiliserait « node-1 »,
// « beam-1 »… déjà pris → deux objets au même id, l'index en écrase un, et la
// structure « bugge ». À appeler une fois, juste avant de charger.
export function adoptIds(structure) {
  let max = 0;
  const scan = (id) => {
    const m = /-(\d+)$/.exec(id || "");
    if (m) {
      const value = parseInt(m[1], 10);
      if (value > max) max = value;
    }
  };
  for (const node of structure.nodes) scan(node.id);
  for (const beam of structure.beams) scan(beam.id);
  for (const segment of structure.segments) scan(segment.id);
  for (const load of structure.loads) scan(load.id);
  for (const vehicle of structure.mobileLoads || []) scan(vehicle.id);
  if (max >= nextNumericId) nextNumericId = max + 1;
}
// fin Structure.js
