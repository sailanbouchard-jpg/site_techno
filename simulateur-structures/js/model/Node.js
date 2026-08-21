// model/Node.js
// ─────────────
// Fabrique d'un nœud (point matériel). Décrit uniquement la FORME des données.
// Le calcul de mouvement vit dans physics/ (qui lit/écrit x, y, vx, vy).
//
// Deux familles de nœuds :
//  - "joint" : un assemblage, posé sur un point du maillage (gridI/gridJ), où
//    une ou plusieurs poutres se rejoignent ; peut être ancré (fixed).
//  - "inner" : un nœud INTERNE de subdivision, au milieu d'une poutre, qui sert
//    à la faire fléchir/flamber (voir model/Beam.js). Jamais ancré, jamais
//    cliquable directement.
//
// restX/restY = position "au repos" (telle que construite). Sert au
// "Réinitialiser" et de référence pour l'imperfection de flambement.
//
// clamped : type de liaison au sol d'un point ANCRÉ (fixed = true). false = PIVOT
// LIBRE (rotation libre, aucun moment) ; true = ENCASTREMENT (l'orientation des
// poutres est tenue → un moment est transmis, comportement de console). Sans effet
// sur un nœud non ancré. Voir physics/bending.js.

export function createNode({ id, x, y, fixed = false, kind = "joint", gridI = null, gridJ = null, clamped = false }) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    fixed,
    clamped,
    kind,
    gridI,
    gridJ,
    restX: x,
    restY: y,
  };
}
