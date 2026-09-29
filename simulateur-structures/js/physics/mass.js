// physics/mass.js
// ───────────────
// Masse "effective" d'un nœud = sa part de la masse des poutres connectées
// (matériau × section × longueur, répartie moitié-moitié sur les deux nœuds de
// chaque segment). Sert à la fois d'INERTIE pour l'intégration ET de poids
// PROPRE (× g) dans loads.js.
//
// IMPORTANT : un poids POSÉ par l'utilisateur n'est PAS ajouté ici. Il est
// appliqué comme une FORCE dans loads.js (mass × g), pas comme une inertie —
// sinon l'accélération vaudrait g quelle que soit la charge (F=m·a → a=g) et la
// structure ne "sentirait" jamais une surcharge, donc ne romprait jamais.
//
// DEUX MASSES, depuis le solveur adaptatif. Ce fichier calcule la masse VRAIE,
// posée sur node._masse : c'est elle qui fait le POIDS (loads.js) et l'inertie
// par défaut. En scène lourde, physics/solveur.js pose à côté une masse
// d'INERTIE gonflée (node._masseInertie) sur les quelques nœuds les plus raides,
// pour allonger le pas de temps sans toucher ni au poids ni à l'équilibre.

import { findNodeById, findBeamById, findSegmentById, ensureIndex } from "../model/Structure.js";
import { getMaterialById } from "../model/materials.js";
import { MIN_NODE_MASS, GRAVITY_ACCELERATION } from "./config.js";

function segmentOwnMass(structure, segment) {
  const beam = findBeamById(structure, segment.beamId);
  if (!beam) return 0;
  const material = getMaterialById(beam.materialId);
  if (!material) return 0;
  return material.density * beam.sectionArea * segment.restLength;
}

// Masse propre d'UNE poutre (kg) = densité × section × longueur totale (somme de
// ses segments). Pour l'affichage du poids de la poutre dans l'inspecteur.
export function computeBeamMass(structure, beam) {
  let mass = 0;
  for (const segId of beam.segIds) {
    const seg = findSegmentById(structure, segId);
    if (seg) mass += segmentOwnMass(structure, seg);
  }
  return mass;
}

// La masse effective ne dépend QUE de la topologie (segments connectés ×
// matériau × longueur) : on la calcule une seule fois par état de topologie et
// on la POSE SUR LE NŒUD (node._masse). Une propriété d'objet se lit sans
// détour, là où la Map d'avant coûtait une recherche par nœud ET PAR PAS — deux
// fois, même (poids puis intégration), soit ~1,6 million de recherches par
// seconde simulée sur une grosse scène. Le cache est jeté en même temps que
// l'index (invalidateIndex), via le jeton ci-dessous.
export function preparerMasses(structure) {
  const token = ensureIndex(structure);
  if (structure._massToken === token) return;
  for (const node of structure.nodes) node._masse = 0;
  for (const segment of structure.segments) {
    const half = segmentOwnMass(structure, segment) / 2;
    const a = findNodeById(structure, segment.nodeAId);
    const b = findNodeById(structure, segment.nodeBId);
    if (a) a._masse += half;
    if (b) b._masse += half;
  }
  for (const node of structure.nodes) {
    if (node._masse < MIN_NODE_MASS) node._masse = MIN_NODE_MASS;
    node._masseInertie = node._masse; // le solveur la gonflera peut-être
  }
  structure._massToken = token;
}

export function computeNodeEffectiveMass(structure, node) {
  preparerMasses(structure);
  return node._masse;
}

// Poids total (N) de la structure : poutres + poids posés. Pour l'affichage.
// Mis en CACHE par état de topologie (il était recalculé en O(segments) à
// chaque image par la barre d'outils) ; jeté par invalidateIndex.
export function computeStructureTotalWeight(structure) {
  const token = ensureIndex(structure);
  if (structure._totalWeight != null && structure._totalWeightToken === token) {
    return structure._totalWeight;
  }
  let mass = 0;
  for (const segment of structure.segments) mass += segmentOwnMass(structure, segment);
  for (const load of structure.loads) mass += load.mass;
  const weight = mass * GRAVITY_ACCELERATION;
  structure._totalWeight = weight;
  structure._totalWeightToken = token;
  return weight;
}
