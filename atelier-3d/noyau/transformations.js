/*
 * noyau/transformations.js
 * ────────────────────────
 * Le calcul des transformations, sans three.js : le noyau doit tourner sous
 * Node. On en a besoin pour grouper et dégrouper sans que les objets sautent,
 * et pour les poignées de rotation.
 *
 * Conventions, les mêmes partout dans le logiciel :
 *   - millimètres, degrés, axe Z vertical ;
 *   - échelle, puis rotation autour de X, puis Y, puis Z, puis translation ;
 *   - une matrice est un tableau de 12 nombres en ligne majeure : les trois
 *     premières lignes d'une 4×4, la dernière valant toujours (0, 0, 0, 1).
 */

const RADIANS = Math.PI / 180;

// En dessous, deux nombres sont égaux : c'est l'arrondi des flottants, pas une
// intention de l'élève.
const TOLERANCE = 1e-9;

// ── Matrices ────────────────────────────────────────────────────────────────

/* R = Rz · Ry · Rx : la rotation autour de X est appliquée la première. */
function matriceDeRotation(rotation) {
  const [cx, sx] = [Math.cos(rotation.x * RADIANS), Math.sin(rotation.x * RADIANS)];
  const [cy, sy] = [Math.cos(rotation.y * RADIANS), Math.sin(rotation.y * RADIANS)];
  const [cz, sz] = [Math.cos(rotation.z * RADIANS), Math.sin(rotation.z * RADIANS)];
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

export function matriceDeTransformation({ position, rotation, echelle }) {
  const r = matriceDeRotation(rotation);
  return [
    r[0] * echelle.x, r[1] * echelle.y, r[2] * echelle.z, position.x,
    r[3] * echelle.x, r[4] * echelle.y, r[5] * echelle.z, position.y,
    r[6] * echelle.x, r[7] * echelle.y, r[8] * echelle.z, position.z,
  ];
}

/* a · b : appliquer b d'abord, puis a. */
export function composer(a, b) {
  const m = new Array(12);
  for (let ligne = 0; ligne < 3; ligne += 1) {
    const [a0, a1, a2, a3] = [a[ligne * 4], a[ligne * 4 + 1], a[ligne * 4 + 2], a[ligne * 4 + 3]];
    m[ligne * 4] = a0 * b[0] + a1 * b[4] + a2 * b[8];
    m[ligne * 4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9];
    m[ligne * 4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10];
    m[ligne * 4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3;
  }
  return m;
}

export function appliquerAuPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[1] * y + m[2] * z + m[3],
    m[4] * x + m[5] * y + m[6] * z + m[7],
    m[8] * x + m[9] * y + m[10] * z + m[11],
  ];
}

/* Inverse d'une matrice de transformation. Rend null si elle est dégénérée —
   une échelle nulle, par exemple : il n'y a alors rien à inverser. */
export function inverser(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < TOLERANCE) return null;

  const k = 1 / determinant;
  const r = [
    (e * i - f * h) * k, (c * h - b * i) * k, (b * f - c * e) * k,
    (f * g - d * i) * k, (a * i - c * g) * k, (c * d - a * f) * k,
    (d * h - e * g) * k, (b * g - a * h) * k, (a * e - b * d) * k,
  ];
  const [tx, ty, tz] = [m[3], m[7], m[11]];
  return [
    r[0], r[1], r[2], -(r[0] * tx + r[1] * ty + r[2] * tz),
    r[3], r[4], r[5], -(r[3] * tx + r[4] * ty + r[5] * tz),
    r[6], r[7], r[8], -(r[6] * tx + r[7] * ty + r[8] * tz),
  ];
}

// ── Décomposition ───────────────────────────────────────────────────────────

const colonne = (m, j) => [m[j], m[4 + j], m[8 + j]];
const produitScalaire = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const longueur = (u) => Math.sqrt(produitScalaire(u, u));

/* Un nombre à l'affichage propre : 29.999999999 est un 30 que l'élève a tapé. */
function arrondi(valeur) {
  const propre = Math.round(valeur * 1e6) / 1e6;
  return Object.is(propre, -0) ? 0 : propre;
}

/*
 * Retrouve position, rotation et échelle à partir d'une matrice. Rend null si
 * la matrice contient un cisaillement : c'est ce qui arrive quand on étire un
 * groupe dans un seul sens alors qu'il contient des objets tournés. Aucune
 * combinaison position / rotation / échelle ne décrit alors l'objet, et
 * l'arrondir déformerait la pièce de l'élève sans le lui dire.
 */
export function decomposer(m) {
  const [c0, c1, c2] = [colonne(m, 0), colonne(m, 1), colonne(m, 2)];
  let [sx, sy, sz] = [longueur(c0), longueur(c1), longueur(c2)];
  if (sx < TOLERANCE || sy < TOLERANCE || sz < TOLERANCE) return null;

  const tolerance = 1e-6;
  if (Math.abs(produitScalaire(c0, c1)) > tolerance * sx * sy) return null;
  if (Math.abs(produitScalaire(c0, c2)) > tolerance * sx * sz) return null;
  if (Math.abs(produitScalaire(c1, c2)) > tolerance * sy * sz) return null;

  // Une symétrie (déterminant négatif) se range dans l'échelle en X.
  const vectoriel = [
    c0[1] * c1[2] - c0[2] * c1[1],
    c0[2] * c1[0] - c0[0] * c1[2],
    c0[0] * c1[1] - c0[1] * c1[0],
  ];
  if (produitScalaire(vectoriel, c2) < 0) sx = -sx;

  const r = [
    c0[0] / sx, c1[0] / sy, c2[0] / sz,
    c0[1] / sx, c1[1] / sy, c2[1] / sz,
    c0[2] / sx, c1[2] / sy, c2[2] / sz,
  ];

  // R = Rz·Ry·Rx : r[6] = -sin(y). Près de ±90° en Y, X et Z se confondent
  // (blocage de cardan) : on met tout sur Z, ce qui garde la bonne orientation.
  const sinY = Math.max(-1, Math.min(1, -r[6]));
  const y = Math.asin(sinY);
  let x;
  let z;
  if (Math.abs(sinY) < 1 - 1e-9) {
    x = Math.atan2(r[7], r[8]);
    z = Math.atan2(r[3], r[0]);
  } else {
    x = 0;
    z = Math.atan2(-r[1], r[4]);
  }

  return {
    position: { x: arrondi(m[3]), y: arrondi(m[7]), z: arrondi(m[11]) },
    rotation: { x: arrondi(x / RADIANS), y: arrondi(y / RADIANS), z: arrondi(z / RADIANS) },
    echelle: { x: arrondi(sx), y: arrondi(sy), z: arrondi(sz) },
  };
}

// ── Opérations dont les outils ont besoin ───────────────────────────────────

const rotationPure = (rotation) => matriceDeTransformation({
  position: { x: 0, y: 0, z: 0 }, rotation, echelle: { x: 1, y: 1, z: 1 },
});

/* La direction, dans le monde, de l'axe X, Y ou Z de l'objet tel qu'il est
   tourné. C'est autour d'elle que tournent les anneaux. */
export function axeDeLObjet(rotation, axe) {
  return colonne(rotationPure(rotation), { x: 0, y: 1, z: 2 }[axe]);
}

/* Rotation autour d'un axe DE L'OBJET, ajoutée à sa rotation actuelle : le
   tour s'applique avant la rotation existante, dans le repère de la pièce.
   Tourner « autour de son X » garde le même sens quelle que soit la façon
   dont la pièce est déjà couchée. La position ne bouge pas. */
export function tournerAutourDUnAxe(transformation, axe, degres) {
  const tour = { x: 0, y: 0, z: 0 };
  tour[axe] = degres;
  const { rotation } = decomposer(composer(rotationPure(transformation.rotation), rotationPure(tour)));
  return { ...transformation, rotation };
}

const IDENTITE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const DEMI_TOUR_X = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0];

/*
 * La rotation la plus courte qui amène l'axe Z sur une normale de surface. La
 * plus courte : une surface presque horizontale ne fait pas pivoter la pièce
 * sur elle-même.
 */
function matriceVersNormale([nx, ny, nz]) {
  const norme = Math.hypot(nx, ny, nz);
  if (norme < TOLERANCE) return IDENTITE;
  const [ux, uy, uz] = [nx / norme, ny / norme, nz / norme];

  // Axe = Z × n, angle = acos(Z · n) — formule de Rodrigues.
  const cosinus = uz;
  if (cosinus > 1 - 1e-12) return IDENTITE;
  if (cosinus < -1 + 1e-12) return DEMI_TOUR_X;

  const [ax, ay] = [-uy, ux];
  const sinus = Math.hypot(ax, ay);
  const [kx, ky] = [ax / sinus, ay / sinus];
  const v = 1 - cosinus;

  return [
    cosinus + kx * kx * v, kx * ky * v, ky * sinus, 0,
    kx * ky * v, cosinus + ky * ky * v, -kx * sinus, 0,
    -ky * sinus, kx * sinus, cosinus, 0,
  ];
}

/* La même, en degrés. */
export function rotationVersNormale(normale) {
  return decomposer(matriceVersNormale(normale)).rotation;
}

/*
 * Les anneaux font tourner un objet autour du centre de sa boîte, pas autour
 * de son pied : sinon une pièce qu'on bascule s'enfoncerait dans le sol.
 * centre : [x, y, z] en millimètres, dans le repère du monde.
 */
export function tournerAutourDUnPoint(transformation, axe, degres, [cx, cy, cz]) {
  const tournee = tournerAutourDUnAxe(transformation, axe, degres);
  // Le même tour vu depuis le monde, R' · R⁻¹, emmène la position autour du centre.
  const avant = rotationPure(transformation.rotation);
  const dansLeMonde = composer(rotationPure(tournee.rotation), inverser(avant));
  const { x, y, z } = transformation.position;
  const [dx, dy, dz] = appliquerAuPoint(dansLeMonde, [x - cx, y - cy, z - cz]);
  return {
    ...tournee,
    position: { x: arrondi(cx + dx), y: arrondi(cy + dy), z: arrondi(cz + dz) },
  };
}

/*
 * Reposer une pièce sur une surface SANS lui faire perdre l'angle que l'élève
 * lui a donné. On ne recalcule pas son orientation à partir de rien : on lui
 * applique le changement de repère entre la surface sur laquelle elle reposait
 * et la nouvelle. Une pièce inclinée de 30° reste inclinée de 30°, mais par
 * rapport à sa nouvelle surface ; reposée sur une surface tournée du même
 * côté, elle ne bouge pas du tout.
 *
 * appui : { x, y, z }, la normale retenue dans la transformation ;
 * normale : [x, y, z], celle de la surface touchée.
 */
export function reposerSurNormale(rotation, appui, normale) {
  const quittantLAppui = inverser(matriceVersNormale([appui.x, appui.y, appui.z]));
  const changementDeRepere = composer(matriceVersNormale(normale), quittantLAppui);
  return decomposer(composer(changementDeRepere, rotationPure(rotation))).rotation;
}

