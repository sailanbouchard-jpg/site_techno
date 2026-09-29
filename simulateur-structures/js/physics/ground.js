// physics/ground.js
// ─────────────────
// CONTACT AVEC LE SOL (unilatéral). Après l'intégration d'un pas, un nœud libre
// entré dans la roche en est ressorti par la face la PLUS PROCHE : le dessus du
// relief (un morceau qui tombe et se pose) ou une paroi de falaise (le pied
// d'une béquille appuyée contre le flanc d'un ravin). C'est une projection de
// position (façon contrainte), stable et peu coûteuse — pas une force.
//
// Ressortir par la face la plus proche est essentiel : un nœud qui s'enfonce de
// quelques centimètres dans une paroi en ressort de quelques centimètres, au
// lieu d'être remonté de plusieurs mètres jusqu'au dessus du plateau (ce saut
// faisait « exploser » les ponts appuyés contre les falaises).
//
// Au contact, la vitesse qui entre dans la roche est annulée et l'autre est
// freinée (frottement) : un nœud pressé contre le sol y reste. La géométrie du
// relief vient de model/terrain.js ; les réglages de physics/config.js.

import { terrainParts, penetration } from "../model/terrain.js";
import { GROUND_RESTITUTION, GROUND_TANGENTIAL_DAMPING } from "./config.js";

export function applyGroundContact(structure) {
  if (!structure.terrain || structure.terrain.length === 0) return;
  const parts = terrainParts(structure); // préparées UNE fois pour tout le pas

  for (const node of structure.nodes) {
    if (node.fixed) continue;
    for (const part of parts) {
      const p = penetration(part, node.x, node.y);
      if (!p) continue;
      if (p.depth <= p.toLeftWall && p.depth <= p.toRightWall) {
        // Sortie par le dessus.
        node.y = p.surface;
        if (node.vy > 0) node.vy = -node.vy * GROUND_RESTITUTION;
        node.vx *= GROUND_TANGENTIAL_DAMPING;
      } else if (p.toLeftWall < p.toRightWall) {
        // Sortie par la paroi gauche (le sol est à droite de x0).
        node.x = part.x0;
        if (node.vx > 0) node.vx = -node.vx * GROUND_RESTITUTION;
        node.vy *= GROUND_TANGENTIAL_DAMPING;
      } else {
        // Sortie par la paroi droite (le sol est à gauche de x1).
        node.x = part.x1;
        if (node.vx < 0) node.vx = -node.vx * GROUND_RESTITUTION;
        node.vy *= GROUND_TANGENTIAL_DAMPING;
      }
    }
  }
}
