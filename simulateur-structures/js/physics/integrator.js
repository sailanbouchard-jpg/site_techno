// physics/integrator.js
// ─────────────────────
// Avance position et vitesse d'UN nœud libre d'un pas `dt`, par intégration
// semi-implicite (Euler-Cromer) : on met à jour la vitesse d'abord, puis la
// position avec cette nouvelle vitesse. Plus stable qu'Euler explicite pour
// des systèmes à ressorts.
//
// Amortissement par pas (relaxation quasi-statique) + plafond de vitesse de
// sécurité (garde-fou anti-divergence, jamais atteint en usage normal).
//
// Dépendances : physics/config.js.

import { MAX_NODE_SPEED } from "./config.js";

// `damping` : facteur d'amortissement de ce pas (le moteur passe un amortissement
// FORT pendant la stabilisation initiale, NORMAL ensuite — voir config.js).
export function integrateNode(node, netForce, mass, dt, damping) {
  node.vx = (node.vx + (netForce.fx / mass) * dt) * damping;
  node.vy = (node.vy + (netForce.fy / mass) * dt) * damping;

  const speed = Math.hypot(node.vx, node.vy);
  if (speed > MAX_NODE_SPEED) {
    const k = MAX_NODE_SPEED / speed;
    node.vx *= k;
    node.vy *= k;
  }

  node.x += node.vx * dt;
  node.y += node.vy * dt;
}
