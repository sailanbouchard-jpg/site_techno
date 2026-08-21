// physics/springForces.js
// ───────────────────────
// Force AXIALE (loi de Hooke) d'un sous-élément (segment) sur ses deux nœuds.
// Un segment ne résiste qu'à l'étirement/compression dans son axe — c'est la
// FLEXION (physics/bending.js) qui, en couplant les segments voisins, fait
// courber la poutre entière.
//
// Convention de signe de `magnitude` : positif en TRACTION, négatif en
// COMPRESSION (réutilisée par le rendu pour le code couleur et par la rupture).

export function computeSegmentForce(nodeA, nodeB, segment, isCable, pretension = 0) {
  const dx = nodeB.x - nodeA.x;
  const dy = nodeB.y - nodeA.y;
  const currentLength = Math.sqrt(dx * dx + dy * dy);
  if (currentLength === 0) {
    return { forceOnA: { fx: 0, fy: 0 }, forceOnB: { fx: 0, fy: 0 }, magnitude: 0, currentLength: 0 };
  }

  const ux = dx / currentLength;
  const uy = dy / currentLength;

  // TENSION DE BASE d'un câble : sa longueur de repos EFFECTIVE est raccourcie
  // (pretension > 0 → câble déjà tendu au lancement) ou allongée (< 0 → mou).
  // Sans effet sur les autres matériaux.
  const restLength = isCable && pretension ? segment.restLength * (1 - pretension / 100) : segment.restLength;
  const elongation = currentLength - restLength;

  // Un câble ne reprend que la traction : comprimé, il est "mou" (force nulle).
  const magnitude = isCable && elongation < 0 ? 0 : segment.stiffness * elongation;

  // Traction (magnitude > 0) : le segment tire B vers A et A vers B.
  const forceOnB = { fx: -magnitude * ux, fy: -magnitude * uy };
  const forceOnA = { fx: magnitude * ux, fy: magnitude * uy };
  return { forceOnA, forceOnB, magnitude, currentLength };
}
