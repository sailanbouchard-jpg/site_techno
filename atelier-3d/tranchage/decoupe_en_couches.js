/*
 * tranchage/decoupe_en_couches.js
 * ───────────────────────────────
 * Couper un maillage par des plans horizontaux : à chaque hauteur, les
 * contours fermés de la section. Aucune dépendance : tourne dans l'ouvrier de
 * tranchage comme sous Node.
 *
 * Le maillage peut avoir ses sommets dédoublés (normales franches aux arêtes) :
 * les points de coupe sont recollés par leur position, arrondie au dix-millième
 * de millimètre.
 *
 * Les contours sont orientés : le dehors d'une pièce tourne dans le sens
 * trigonométrique, un trou dans l'autre sens — la matière est à gauche du
 * sens de parcours. C'est ce que la normale sortante de chaque triangle impose.
 */

// Un plan qui passe exactement par un sommet crée des segments de longueur nulle :
// on décale la hauteur de coupe d'un rien.
const DECALAGE_DE_COUPE_MM = 1e-5;
const PRECISION_DE_RECOLLAGE = 1e4;

const cleDePoint = (x, y) => Math.round(x * PRECISION_DE_RECOLLAGE) + "," + Math.round(y * PRECISION_DE_RECOLLAGE);

/*
 * positions : Float32Array (x, y, z par sommet), déjà placé sur le plateau
 * indices   : Uint32Array (3 par triangle)
 * hauteurs  : les hauteurs de coupe, croissantes
 * Rend, pour chaque hauteur, une liste de contours [[x, y], …] (sans répéter le premier point).
 */
export function decouperEnCouches(positions, indices, hauteurs) {
  const couches = hauteurs.map(() => []);
  if (hauteurs.length === 0) return couches;

  // Chaque triangle ne concerne que les couches entre son point bas et son point haut.
  const segmentsParCouche = hauteurs.map(() => []);
  const premiere = hauteurs[0];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const za = positions[a + 2];
    const zb = positions[b + 2];
    const zc = positions[c + 2];
    const zMin = Math.min(za, zb, zc);
    const zMax = Math.max(za, zb, zc);
    if (zMax < premiere) continue;

    // Normale du triangle (sa projection horizontale oriente le segment).
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = zb - za;
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = zc - za;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;

    let k = premierIndexAuDessus(hauteurs, zMin);
    for (; k < hauteurs.length && hauteurs[k] <= zMax; k += 1) {
      const z = hauteurs[k] + DECALAGE_DE_COUPE_MM;
      const points = [];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const [bas, haut] = positions[p + 2] <= positions[q + 2] ? [p, q] : [q, p];
        const zBas = positions[bas + 2];
        const zHaut = positions[haut + 2];
        if (zBas > z || zHaut <= z) continue;
        const f = (z - zBas) / (zHaut - zBas);
        points.push([
          positions[bas] + f * (positions[haut] - positions[bas]),
          positions[bas + 1] + f * (positions[haut + 1] - positions[bas + 1]),
        ]);
      }
      if (points.length !== 2) continue;
      let [p, q] = points;
      // La matière à gauche : la normale sortante pointe à droite du segment.
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      if (dy * nx - dx * ny < 0) [p, q] = [q, p];
      segmentsParCouche[k].push(p, q);
    }
  }

  for (let k = 0; k < hauteurs.length; k += 1) couches[k] = chainer(segmentsParCouche[k]);
  return couches;
}

function premierIndexAuDessus(hauteurs, z) {
  let [bas, haut] = [0, hauteurs.length];
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (hauteurs[milieu] < z) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}

/* Des segments orientés [p0, q0, p1, q1, …] aux contours fermés. Un bout qui
   ne se referme pas (maillage troué) est abandonné : il ne délimite rien. */
function chainer(segments) {
  const depuis = new Map();   // clé du point de départ → indices des segments
  for (let i = 0; i < segments.length; i += 2) {
    const cle = cleDePoint(segments[i][0], segments[i][1]);
    if (!depuis.has(cle)) depuis.set(cle, []);
    depuis.get(cle).push(i);
  }
  const utilise = new Uint8Array(segments.length / 2);
  const contours = [];
  for (let i = 0; i < segments.length; i += 2) {
    if (utilise[i / 2]) continue;
    const debut = cleDePoint(segments[i][0], segments[i][1]);
    const contour = [];
    let courant = i;
    let ferme = false;
    while (courant !== undefined) {
      utilise[courant / 2] = 1;
      contour.push(segments[courant]);
      const fin = segments[courant + 1];
      const cleFin = cleDePoint(fin[0], fin[1]);
      if (cleFin === debut) {
        ferme = true;
        break;
      }
      courant = (depuis.get(cleFin) ?? []).find((j) => !utilise[j / 2]);
    }
    if (ferme && contour.length >= 3) contours.push(contour);
  }
  return contours;
}
