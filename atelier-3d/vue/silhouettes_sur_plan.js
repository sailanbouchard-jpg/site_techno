/*
 * vue/silhouettes_sur_plan.js
 * ───────────────────────────
 * La silhouette des solides, projetée sur le plan de l'esquisse : c'est ce qui
 * permet de dessiner une forme qui tombe juste sur un boîtier importé.
 *
 * On garde les arêtes vives et les arêtes de contour vues depuis la normale du
 * plan, puis on les écrase sur le plan. Le résultat est une liste de segments
 * [u1, v1, u2, v2, …], mémorisée par maillage et par position : ouvrir une
 * esquisse à côté d'un gros STL ne coûte le calcul qu'une fois.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const COSINUS_ARETE_VIVE = Math.cos(THREE.MathUtils.degToRad(30));
const SEGMENTS_MAXIMUM = 60000;
const memoire = new Map();

function aretesVisibles(geometrie, matrice, normale) {
  const positions = geometrie.attributes.position;
  const indices = geometrie.index;
  if (indices === null) return [];
  const sommets = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) sommets.push(v.fromBufferAttribute(positions, i).applyMatrix4(matrice).clone());

  // Normale de chaque face, dans le monde.
  const faces = [];
  const [ab, ac] = [new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < indices.count; t += 3) {
    const [a, b, c] = [indices.getX(t), indices.getX(t + 1), indices.getX(t + 2)];
    ab.subVectors(sommets[b], sommets[a]);
    ac.subVectors(sommets[c], sommets[a]);
    faces.push({ sommets: [a, b, c], n: new THREE.Vector3().crossVectors(ab, ac).normalize() });
  }

  const aretes = new Map();
  faces.forEach((face, f) => {
    for (let k = 0; k < 3; k += 1) {
      const [p, q] = [face.sommets[k], face.sommets[(k + 1) % 3]];
      const cle = p < q ? p + "," + q : q + "," + p;
      if (!aretes.has(cle)) aretes.set(cle, { p, q, faces: [] });
      aretes.get(cle).faces.push(f);
    }
  });

  const gardees = [];
  for (const { p, q, faces: voisines } of aretes.values()) {
    let garder = voisines.length !== 2;
    if (!garder) {
      const [n1, n2] = voisines.map((f) => faces[f].n);
      const vive = n1.dot(n2) < COSINUS_ARETE_VIVE;
      const contour = Math.sign(n1.dot(normale)) !== Math.sign(n2.dot(normale));
      garder = vive || contour;
    }
    if (garder) gardees.push([sommets[p], sommets[q]]);
  }
  return gardees;
}

/*
 * maillages3d : les objets de la scène à projeter ; versLePlan : la matrice
 * monde → repère du plan (u, v, w).
 */
export function silhouettesSurPlan(maillages3d, versLePlan) {
  const normale = new THREE.Vector3(versLePlan.elements[2], versLePlan.elements[6], versLePlan.elements[10]).normalize();
  const segments = [];
  const p = new THREE.Vector3();
  for (const maillage3d of maillages3d) {
    maillage3d.updateWorldMatrix(true, false);
    const cle = maillage3d.geometry.uuid + "|" + maillage3d.matrixWorld.elements.join(",") + "|" + versLePlan.elements.join(",");
    if (!memoire.has(cle)) {
      const plats = [];
      for (const [a, b] of aretesVisibles(maillage3d.geometry, maillage3d.matrixWorld, normale)) {
        p.copy(a).applyMatrix4(versLePlan);
        const [u1, v1] = [p.x, p.y];
        p.copy(b).applyMatrix4(versLePlan);
        // Une arête vue de bout se réduit à un point : elle n'apporte rien.
        if (Math.hypot(p.x - u1, p.y - v1) > 1e-3) plats.push(u1, v1, p.x, p.y);
      }
      if (memoire.size > 50) memoire.clear();
      memoire.set(cle, plats);
    }
    for (const valeur of memoire.get(cle)) {
      if (segments.length >= SEGMENTS_MAXIMUM * 4) break;
      segments.push(valeur);
    }
  }
  return new Float32Array(segments);
}
