// physics/vehicleMotion.js
// ────────────────────────
// Déplacement d'une charge mobile (voiture, camion) le long d'une CHAÎNE de
// poutres-routes connectées. Une charge avance TOUJOURS vers la droite du monde
// (x croissant). Quand elle atteint le bout d'une poutre :
//   - s'il existe une route connectée qui repart vers la droite, elle y passe
//     (sans perdre sa vitesse) ;
//   - si ce nœud porte le DRAPEAU D'ARRIVÉE, elle s'y arrête : elle est au but ;
//   - sinon (fin de route, ou poutre rompue après), il n'y a plus rien sous ses
//     roues : elle TOMBE. Une route qui s'arrête dans le vide n'est pas un
//     passage, et le niveau est perdu.
//
// `direction` (+1 = parcours A→B, -1 = B→A) est choisi pour que le mouvement
// soit toujours vers la droite, quel que soit le sens dans lequel la poutre a
// été tracée. `distanceAlongBeam` reste mesuré depuis le nœud A.
//
// getCurrentRoadSegment() rend le segment courant (ses deux nœuds + la fraction
// 0..1 dessus) : partagé par le poids (loads.js) et le dessin (vehicleRenderer.js).

import { findBeamById, findNodeById, findSegmentById, estArrivee } from "../model/Structure.js";
import { WATTS_PER_HORSEPOWER, MAX_VEHICLE_SPEED, ROLLING_RESISTANCE, GRAVITY_ACCELERATION } from "./config.js";

function beamTotalLength(beam, structure) {
  let total = 0;
  for (const segId of beam.segIds) {
    const seg = findSegmentById(structure, segId);
    if (seg) total += seg.restLength;
  }
  return total;
}

function endNode(structure, beam, which) {
  // which "A" = début de chaîne (nodeIds[0]), "B" = fin (nodeIds[last]).
  const id = which === "A" ? beam.nodeIds[0] : beam.nodeIds[beam.nodeIds.length - 1];
  return findNodeById(structure, id);
}

// Sens de parcours qui fait avancer vers la DROITE (x croissant) sur cette
// poutre : +1 = A→B, -1 = B→A.
function rightwardDirection(beam, structure) {
  const a = endNode(structure, beam, "A");
  const b = endNode(structure, beam, "B");
  if (!a || !b) return 1;
  return b.x >= a.x ? 1 : -1;
}

function ensurePlaced(vehicle, structure, beam) {
  if (vehicle.placed) {
    if (vehicle.direction === undefined) vehicle.direction = rightwardDirection(beam, structure);
    return;
  }
  vehicle.distanceAlongBeam = vehicle.startFraction * beamTotalLength(beam, structure);
  vehicle.direction = rightwardDirection(beam, structure);
  vehicle.placed = true;
}

export function getCurrentRoadSegment(vehicle, structure) {
  const beam = findBeamById(structure, vehicle.beamId);
  if (!beam) return {};
  ensurePlaced(vehicle, structure, beam);

  let remaining = vehicle.distanceAlongBeam;
  for (const segId of beam.segIds) {
    const seg = findSegmentById(structure, segId);
    if (!seg) continue;
    if (remaining <= seg.restLength || segId === beam.segIds[beam.segIds.length - 1]) {
      const fraction = seg.restLength === 0 ? 0 : Math.max(0, Math.min(1, remaining / seg.restLength));
      return { nodeA: findNodeById(structure, seg.nodeAId), nodeB: findNodeById(structure, seg.nodeBId), fraction };
    }
    remaining -= seg.restLength;
  }
  return {};
}

// Cherche une route connectée au nœud `sharedNodeId` qui PROLONGE vers la droite
// (son extrémité opposée est plus à droite que le nœud partagé). Renvoie null
// s'il n'y en a pas (fin de route, ou seul prolongement vers la gauche, ou
// poutre rompue derrière — un morceau rompu n'est plus une route).
function findNextRoadBeamRightward(structure, current, sharedNodeId) {
  const shared = findNodeById(structure, sharedNodeId);
  if (!shared) return null;
  let best = null;
  let bestX = shared.x;
  for (const b of structure.beams) {
    if (b === current || !b.isRoad) continue;
    let farId = null;
    if (b.jointAId === sharedNodeId) farId = b.jointBId;
    else if (b.jointBId === sharedNodeId) farId = b.jointAId;
    else continue;
    const far = findNodeById(structure, farId);
    if (!far) continue;
    if (far.x > bestX) {
      bestX = far.x;
      best = b;
    }
  }
  return best;
}

// Fait entrer le véhicule sur `beam` par le nœud `fromNodeId` (une extrémité),
// avec un report de distance `overflow` (ce qu'il a dépassé sur la poutre
// précédente). Il repart en s'éloignant du nœud d'entrée → toujours vers la
// droite, car findNextRoadBeamRightward a choisi une poutre qui part à droite.
function enterBeam(vehicle, structure, beam, fromNodeId, overflow) {
  const total = beamTotalLength(beam, structure);
  vehicle.beamId = beam.id;
  vehicle.placed = true;
  if (fromNodeId === beam.nodeIds[0]) {
    vehicle.direction = 1;
    vehicle.distanceAlongBeam = Math.min(overflow, total);
  } else {
    vehicle.direction = -1;
    vehicle.distanceAlongBeam = Math.max(total - overflow, 0);
  }
}

function handOffOrStop(vehicle, structure, beam, exitNodeId, overflow, total) {
  // Terminus : le drapeau d'arrivée arrête le véhicule, même s'il reste de la
  // route derrière. C'est le but du niveau, pas une étape.
  if (estArrivee(structure, exitNodeId)) {
    vehicle.distanceAlongBeam = vehicle.direction > 0 ? total : 0;
    vehicle.pathVelocity = 0;
    vehicle.state = "arrive";
    return;
  }
  const next = findNextRoadBeamRightward(structure, beam, exitNodeId);
  if (next) {
    enterBeam(vehicle, structure, next, exitNodeId, overflow);
    return;
  }
  commencerChute(vehicle, structure, exitNodeId, total);
}

// Plus de route : le véhicule bascule dans le vide. Il ne pèse plus sur rien
// (physics/loads.js ne charge que les véhicules « onRoad ») et suit une simple
// parabole : on n'a pas besoin de mieux, il ne reviendra pas.
function commencerChute(vehicle, structure, exitNodeId, total) {
  const bord = findNodeById(structure, exitNodeId);
  vehicle.distanceAlongBeam = vehicle.direction > 0 ? total : 0;
  vehicle.state = "chute";
  vehicle.chuteX = bord ? bord.x : 0;
  vehicle.chuteY = bord ? bord.y : 0;
  vehicle.chuteVx = Math.max(vehicle.pathVelocity, 0.5); // il part dans son élan
  vehicle.chuteVy = 0;
  vehicle.pathVelocity = 0;
}

// Chute libre, une image après l'autre.
function chuter(vehicle, dt) {
  vehicle.chuteVy += GRAVITY_ACCELERATION * dt;
  vehicle.chuteX += vehicle.chuteVx * dt;
  vehicle.chuteY += vehicle.chuteVy * dt;
}

// Position monde d'un véhicule en train de tomber, ou null s'il roule encore.
export function positionChute(vehicle) {
  return vehicle.state === "chute" ? { x: vehicle.chuteX, y: vehicle.chuteY } : null;
}

export function advanceMobileLoad(vehicle, structure, dt) {
  if (vehicle.state === "chute") return chuter(vehicle, dt);
  if (vehicle.state === "arrive") return; // au but : il ne bouge plus
  const beam = findBeamById(structure, vehicle.beamId);
  if (!beam) return; // poutre disparue (supprimée en édition) : rien à faire
  ensurePlaced(vehicle, structure, beam);

  // Vitesse le long du chemin (modèle traction moteur − résistance au roulement).
  const power = vehicle.powerHp * WATTS_PER_HORSEPOWER;
  const v = Math.max(vehicle.pathVelocity, 0.5); // évite la division par zéro
  const tractive = power / v;
  const rolling = ROLLING_RESISTANCE * vehicle.mass * GRAVITY_ACCELERATION;
  const accel = (tractive - rolling) / vehicle.mass;
  const target = Math.min(vehicle.referenceSpeed, MAX_VEHICLE_SPEED);
  vehicle.pathVelocity = Math.max(0, Math.min(target, vehicle.pathVelocity + accel * dt));

  const total = beamTotalLength(beam, structure);
  vehicle.distanceAlongBeam += vehicle.direction * vehicle.pathVelocity * dt;

  // Sorti par le bout droit (= dans le sens de marche) de la poutre ?
  if (vehicle.direction > 0 && vehicle.distanceAlongBeam >= total) {
    handOffOrStop(vehicle, structure, beam, beam.nodeIds[beam.nodeIds.length - 1], vehicle.distanceAlongBeam - total, total);
  } else if (vehicle.direction < 0 && vehicle.distanceAlongBeam <= 0) {
    handOffOrStop(vehicle, structure, beam, beam.nodeIds[0], -vehicle.distanceAlongBeam, total);
  }
}
