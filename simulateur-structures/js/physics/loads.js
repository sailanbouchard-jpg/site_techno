// physics/loads.js
// ────────────────
// Forces extérieures (hors ressorts axiaux et angulaires) : la GRAVITÉ
// (progressive au lancement) sur la masse propre de chaque nœud, le poids des
// CHARGES POSÉES par l'utilisateur, et le poids des CHARGES MOBILES.
//
// Un poids posé est appliqué comme une FORCE (mass × g), pas comme une inertie
// (voir physics/mass.js) : c'est ce qui permet à la structure de "sentir" une
// surcharge et de rompre. Tous suivent la même rampe de gravité au lancement.
//
// Convention d'axes Canvas2D : Y augmente vers le BAS, la gravité est en +Y.

import { GRAVITY_ACCELERATION, GRAVITY_RAMP_DURATION } from "./config.js";
import { preparerMasses } from "./mass.js";
import { findLoadByJointId, findBeamById, beamSegmentAtFraction } from "../model/Structure.js";
import { getCurrentRoadSegment } from "./vehicleMotion.js";

// Facteur [0..1] de montée en douceur de la gravité (dérivée nulle aux bouts).
export function getGravityRampFactor(currentTime) {
  if (currentTime >= GRAVITY_RAMP_DURATION) return 1;
  const s = currentTime / GRAVITY_RAMP_DURATION;
  return 3 * s * s - 2 * s * s * s;
}

export function getExternalForce(structure, node, time) {
  const f = { fx: 0, fy: 0 };
  preparerMasses(structure);
  addExternalForce(f, structure, node, time);
  return f;
}

// Variante SANS allocation : ajoute la force externe directement dans `f`
// (réutilisé tel quel à chaque pas par le moteur, voir simulationEngine).
export function addExternalForce(f, structure, node, time) {
  const ramp = getGravityRampFactor(time);
  // Poids propre (masse des poutres connectées). node._masse est la VRAIE masse,
  // préparée en tête de pas (mass.js) : jamais la masse d'inertie gonflée du
  // solveur, sinon la structure porterait plus lourd qu'elle ne pèse.
  f.fy += node._masse * GRAVITY_ACCELERATION * ramp;
  // Poids posé éventuel sur ce nœud (force, pas inertie).
  if (node.kind === "joint") {
    const load = findLoadByJointId(structure, node.id);
    if (load) f.fy += load.mass * GRAVITY_ACCELERATION * ramp;
  }
}

// Ajoute le poids de chaque poids posé SUR UNE POUTRE (load.beamId) aux deux
// nœuds du segment où il se trouve, au prorata de sa position (règle du levier).
// Les poids posés sur un POINT sont traités dans addExternalForce ci-dessus.
export function addStaticBeamLoadWeights(forces, structure, time) {
  const ramp = getGravityRampFactor(time);
  for (const load of structure.loads) {
    if (load.beamId == null) continue;
    const beam = findBeamById(structure, load.beamId);
    if (!beam) continue;
    const seg = beamSegmentAtFraction(structure, beam, load.fraction);
    if (!seg || !seg.nodeA || !seg.nodeB) continue;
    const weight = load.mass * GRAVITY_ACCELERATION * ramp;
    addWeight(forces, seg.nodeA, weight * (1 - seg.fraction));
    addWeight(forces, seg.nodeB, weight * seg.fraction);
  }
}

// Ajoute le poids de chaque véhicule "onRoad" aux deux nœuds de son segment
// courant, au prorata de sa position (règle du levier).
export function addMobileLoadWeights(forces, structure, time) {
  const ramp = getGravityRampFactor(time);
  for (const vehicle of structure.mobileLoads) {
    if (vehicle.state !== "onRoad") continue;
    const seg = getCurrentRoadSegment(vehicle, structure);
    if (!seg.nodeA || !seg.nodeB) continue;
    const weight = vehicle.mass * GRAVITY_ACCELERATION * ramp;
    addWeight(forces, seg.nodeA, weight * (1 - seg.fraction));
    addWeight(forces, seg.nodeB, weight * seg.fraction);
  }
}

function addWeight(forces, node, fy) {
  if (node.fixed) return;
  const f = forces.get(node.id);
  if (f) f.fy += fy;
}
