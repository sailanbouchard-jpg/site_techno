// model/Beam.js
// ─────────────
// Une POUTRE relie deux points du maillage (deux nœuds "joint"). Pour pouvoir
// FLÉCHIR et FLAMBER le long de sa longueur, elle est découpée en plusieurs
// SOUS-ÉLÉMENTS (segments) reliés par des nœuds INTERNES — invisibles à
// l'utilisateur, qui ne voit qu'une poutre. Plus il y a de sous-éléments, plus
// la courbure est fine, mais plus c'est coûteux : on borne le nombre.
//
// Ce fichier ne fait que de la GÉOMÉTRIE pure (où placer les nœuds internes,
// quelle raideur). La création effective des enregistrements nœuds/segments
// dans la structure est orchestrée par model/Structure.js::addBeam.

import { getMaterialById } from "./materials.js";
import {
  AXIAL_STIFFNESS_DIVISOR,
  SEGMENT_TARGET_LENGTH,
  MIN_SEGMENTS_PER_BEAM,
  MAX_SEGMENTS_PER_BEAM,
  BUCKLING_IMPERFECTION,
} from "../physics/config.js";

// Nombre de sous-éléments : ~ un par SEGMENT_TARGET_LENGTH mètres, borné.
export function subdivisionCount(length) {
  const n = Math.round(length / SEGMENT_TARGET_LENGTH);
  return Math.max(MIN_SEGMENTS_PER_BEAM, Math.min(MAX_SEGMENTS_PER_BEAM, n));
}

// Raideur axiale d'un sous-élément (ressort de Hooke équivalent), ASSOUPLIE par
// AXIAL_STIFFNESS_DIVISOR pour rendre la déformation visible et stabiliser
// l'intégration (voir physics/config.js).
export function computeAxialStiffness(materialId, sectionArea, restLength) {
  const material = getMaterialById(materialId);
  if (!material || restLength === 0) return 0;
  return (material.youngModulus * sectionArea) / restLength / AXIAL_STIFFNESS_DIVISOR;
}

// Géométrie de subdivision d'une poutre droite de A à B : positions des nœuds
// internes (avec une minuscule imperfection latérale en demi-sinus pour donner
// une direction de flambement définie), longueur de repos d'un segment, et sa
// raideur axiale.
export function buildBeamGeometry(ax, ay, bx, by, materialId, sectionArea) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const count = subdivisionCount(length);

  const segRestLength = length / count;
  const segStiffness = computeAxialStiffness(materialId, sectionArea, segRestLength);

  // Normale unitaire à la poutre (sens de l'imperfection).
  const nx = length === 0 ? 0 : -dy / length;
  const ny = length === 0 ? 0 : dx / length;
  const amplitude = BUCKLING_IMPERFECTION * length;

  const innerPositions = [];
  for (let k = 1; k < count; k++) {
    const f = k / count;
    const bump = amplitude * Math.sin(Math.PI * f);
    innerPositions.push({
      x: ax + dx * f + nx * bump,
      y: ay + dy * f + ny * bump,
    });
  }

  return { count, segRestLength, segStiffness, innerPositions };
}
