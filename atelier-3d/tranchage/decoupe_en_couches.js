/*
 * tranchage/decoupe_en_couches.js
 * ───────────────────────────────
 * Couper un maillage par des plans horizontaux : à chaque hauteur, les
 * contours fermés de la section. Aucune dépendance : tourne dans l'ouvrier de
 * tranchage comme sous Node.
 *
 * Le maillage peut avoir ses sommets dédoublés (normales franches aux arêtes) :
 * les points de coupe sont recollés par leur position, arrondie au dix-millième
 * de millimètre. Cet arrondi n'est PAS une tolérance : deux points distants d'un
 * cent-millième de millimètre mais de part et d'autre d'une frontière de grille
 * reçoivent des clés différentes. Le chaînage regarde donc aussi les huit cases
 * voisines, et referme un contour dont les deux bouts se rejoignent à la
 * tolérance près — sans quoi un STL importé légèrement imparfait perdait des
 * îlots entiers, en silence.
 *
 * Ce qui ne se referme toujours pas est COMPTÉ et remonté à l'appelant : un
 * maillage troué se voit alors dans le diagnostic, au lieu de se traduire par de
 * la matière qui manque sans explication.
 *
 * Les contours sont orientés : le dehors d'une pièce tourne dans le sens
 * trigonométrique, un trou dans l'autre sens — la matière est à gauche du
 * sens de parcours. C'est ce que la normale sortante de chaque triangle impose.
 */

// Un plan qui passe exactement par un sommet crée des segments de longueur nulle :
// on décale la hauteur de coupe d'un rien.
const DECALAGE_DE_COUPE_MM = 1e-5;
const PRECISION_DE_RECOLLAGE = 1e4;
// Deux bouts distants de moins de ça sont le même point (un dix-millième de millimètre).
const TOLERANCE_MM = 1 / PRECISION_DE_RECOLLAGE;

const caseDePoint = (x, y) => [Math.round(x * PRECISION_DE_RECOLLAGE), Math.round(y * PRECISION_DE_RECOLLAGE)];
const cleDeCase = (ix, iy) => ix + "," + iy;

/*
 * positions : Float32Array (x, y, z par sommet), déjà placé sur le plateau
 * indices   : Uint32Array (3 par triangle)
 * hauteurs  : les hauteurs de coupe, croissantes
 * Rend { couches, ouverts } :
 *   couches  pour chaque hauteur, une liste de contours [[x, y], …] (sans répéter
 *            le premier point)
 *   ouverts  le nombre de contours qu'il a été impossible de refermer, toutes
 *            couches confondues
 */
export function decouperEnCouches(positions, indices, hauteurs) {
  const couches = hauteurs.map(() => []);
  if (hauteurs.length === 0) return { couches, ouverts: 0 };

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

  let ouverts = 0;
  for (let k = 0; k < hauteurs.length; k += 1) {
    const chaines = chainer(segmentsParCouche[k]);
    couches[k] = chaines.contours;
    ouverts += chaines.ouverts;
  }
  return { couches, ouverts };
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

/*
 * Des segments orientés [p0, q0, p1, q1, …] aux contours fermés.
 * Rend { contours, ouverts } : ce qui s'est refermé, et le nombre de morceaux
 * qui n'ont pas pu l'être (maillage troué) — ceux-là ne délimitent rien et sont
 * abandonnés, mais on sait les compter.
 */
function chainer(segments) {
  const nombre = segments.length / 2;
  // Les segments rangés par la case de leur point de départ.
  const depuis = new Map();
  for (let i = 0; i < segments.length; i += 2) {
    const [ix, iy] = caseDePoint(segments[i][0], segments[i][1]);
    const cle = cleDeCase(ix, iy);
    if (!depuis.has(cle)) depuis.set(cle, []);
    depuis.get(cle).push(i);
  }
  const utilise = new Uint8Array(nombre);
  /* Le segment libre qui part de ce point, cherché dans sa case et autour. */
  const partantDe = (point) => {
    const [ix, iy] = caseDePoint(point[0], point[1]);
    let meilleur;
    let mini = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const j of depuis.get(cleDeCase(ix + dx, iy + dy)) ?? []) {
          if (utilise[j / 2]) continue;
          const d = Math.hypot(segments[j][0] - point[0], segments[j][1] - point[1]);
          if (d <= TOLERANCE_MM && d < mini) {
            mini = d;
            meilleur = j;
          }
        }
      }
    }
    return meilleur;
  };

  const contours = [];
  let ouverts = 0;
  for (let i = 0; i < segments.length; i += 2) {
    if (utilise[i / 2]) continue;
    const debut = segments[i];
    const contour = [];
    let courant = i;
    let fin = debut;
    while (courant !== undefined) {
      utilise[courant / 2] = 1;
      contour.push(segments[courant]);
      fin = segments[courant + 1];
      if (Math.hypot(fin[0] - debut[0], fin[1] - debut[1]) <= TOLERANCE_MM) break;
      courant = partantDe(fin);
    }
    const ferme = Math.hypot(fin[0] - debut[0], fin[1] - debut[1]) <= TOLERANCE_MM;
    if (ferme && contour.length >= 3) contours.push(contour);
    else if (!ferme) ouverts += 1;
  }
  return { contours, ouverts };
}
