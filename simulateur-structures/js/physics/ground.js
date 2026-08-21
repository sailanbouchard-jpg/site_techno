// physics/ground.js
// ─────────────────
// CONTACT AVEC LE SOL (unilatéral). Après l'intégration d'un pas, un nœud libre
// qui s'est retrouvé SOUS la surface du sol est remonté pile dessus : un point
// ne peut donc jamais pénétrer le terrain. C'est une projection de position
// (façon contrainte), stable et peu coûteuse — pas une force.
//
// On ne traite que la pénétration VERTICALE (le cas d'un morceau qui tombe et
// se pose) : suffisant et robuste pour un jeu de pont. Le relief vient de
// model/terrain.js ; les réglages (rebond, frottement) de physics/config.js.

import { partTopWorld } from "../model/terrain.js";
import { GROUND_RESTITUTION, GROUND_TANGENTIAL_DAMPING, GROUND_COLLISION_INSET } from "./config.js";

// Surface du sol (y la plus haute) à l'abscisse x, à partir des sommets DÉJÀ
// triés de chaque partie (préparés une fois par pas pour ne pas re-trier par nœud).
//
// L'EMPRISE horizontale est rentrée de GROUND_COLLISION_INSET à chaque bord : un
// point pile sur l'arête d'une falaise (x = bord) tombe alors hors emprise, donc
// n'est PAS considéré dans le sol (plus de propulsion vers le haut). La hauteur,
// elle, reste interpolée sur la polyligne d'origine (pentes non déformées).
function surfaceYFromTops(tops, x) {
  let best = Infinity;
  for (const top of tops) {
    if (top.length < 2) continue;
    const lo = top[0].x + GROUND_COLLISION_INSET;
    const hi = top[top.length - 1].x - GROUND_COLLISION_INSET;
    if (lo >= hi) continue; // partie plus étroite que le double retrait : ignorée
    if (x < lo || x > hi) continue; // hors emprise (marge de bord comprise)
    for (let k = 0; k < top.length - 1; k++) {
      const a = top[k];
      const b = top[k + 1];
      if (x >= a.x && x <= b.x) {
        const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        const y = a.y + (b.y - a.y) * t;
        if (y < best) best = y;
        break;
      }
    }
  }
  return best;
}

export function applyGroundContact(structure) {
  const terrain = structure.terrain;
  if (!terrain || terrain.length === 0) return;

  // Sommets triés de chaque partie : préparés UNE fois pour tout le pas.
  const tops = terrain.map(partTopWorld);

  for (const node of structure.nodes) {
    if (node.fixed) continue;
    const surfaceY = surfaceYFromTops(tops, node.x);
    if (!Number.isFinite(surfaceY)) continue;
    if (node.y > surfaceY) {
      node.y = surfaceY;
      if (node.vy > 0) node.vy = -node.vy * GROUND_RESTITUTION;
      node.vx *= GROUND_TANGENTIAL_DAMPING;
    }
  }
}
