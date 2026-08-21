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

import { findBeamById, findSegmentById, ensureIndex } from "../model/Structure.js";
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
// matériau × longueur). Elle était recalculée DEUX fois par pas et par nœud,
// chacune en O(segments) → on la calcule une seule fois par état de topologie
// et on la met en cache (clé : l'identité de l'index courant, voir
// Structure.js). Le cache est jeté en même temps que l'index (invalidateIndex).
function buildMassCache(structure) {
  const cache = new Map();
  for (const node of structure.nodes) cache.set(node.id, 0);
  for (const segment of structure.segments) {
    const half = segmentOwnMass(structure, segment) / 2;
    if (cache.has(segment.nodeAId)) cache.set(segment.nodeAId, cache.get(segment.nodeAId) + half);
    if (cache.has(segment.nodeBId)) cache.set(segment.nodeBId, cache.get(segment.nodeBId) + half);
  }
  for (const [id, m] of cache) cache.set(id, Math.max(m, MIN_NODE_MASS));
  structure._massByNode = cache;
  structure._massToken = structure._index;
  return cache;
}

export function computeNodeEffectiveMass(structure, node) {
  let cache = structure._massByNode;
  if (!cache || structure._massToken !== structure._index) cache = buildMassCache(structure);
  const m = cache.get(node.id);
  return m === undefined ? MIN_NODE_MASS : m;
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
