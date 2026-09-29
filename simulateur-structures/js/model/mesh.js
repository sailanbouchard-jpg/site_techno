// model/mesh.js
// ─────────────
// Le MAILLAGE : une grille de points fixes (en mètres réels) sur lesquels on
// construit. On ne crée plus de nœud libre — on relie deux points du maillage
// par une poutre. Ce fichier ne connaît que la géométrie de la grille et la
// règle d'anti-chevauchement ; il ne sait rien de la physique ni du dessin.
//
// Un point du maillage est repéré par ses indices entiers (i, j) ; sa position
// monde est (origin + i·pas, origin + j·pas). Travailler en indices ENTIERS
// rend la détection de chevauchement exacte (pas d'imprécision flottante).

// Dimensions de DÉPART de la grille. On peut ensuite la redimensionner dans les
// deux sens (voir resizeWorldWidth / resizeWorldHeight dans Structure.js) ; dans
// les deux cas les positions MONDE déjà construites NE BOUGENT PAS :
//   LARGEUR : `cols` grandit des deux côtés et `originX` glisse vers les x
//     négatifs — les structures restent au centre ;
//   HAUTEUR : `rows` grandit par le HAUT seulement et `originY` glisse vers les
//     y négatifs. Le BAS du monde ne bouge donc jamais : le fond du ravin, l'eau
//     et les altitudes lues sur la règle verticale restent ce qu'ils étaient, et
//     ce qu'on gagne est du CIEL — la place d'un portique, d'une arche, d'un
//     pylône.
// BASE_* = valeurs par défaut (plan neuf, ou sauvegarde sans dimensions).
export const BASE_ORIGIN_X = 0;
export const BASE_COLS = 100;
export const BASE_ORIGIN_Y = 0;
export const BASE_ROWS = 48;

export const MESH = {
  originX: BASE_ORIGIN_X,
  originY: BASE_ORIGIN_Y,
  spacing: 0.5, // mètres entre deux points voisins (maillage 50 cm × 50 cm)
  cols: BASE_COLS, // i de 0 à cols inclus (→ 100 × 0,5 = 50 m de large)
  rows: BASE_ROWS, // j de 0 à rows inclus (→ 48 × 0,5 = 24 m de haut)
};

// Bornes et pas du redimensionnement de la LARGEUR (en colonnes / mailles).
// MESH_RESIZE_STEP = colonnes ajoutées ou retirées DE CHAQUE CÔTÉ à chaque clic
// (la grille grandit/rétrécit symétriquement) : 4 mailles = 2 m par côté.
export const MESH_MIN_COLS = 40; // 20 m au minimum
export const MESH_MAX_COLS = 600; // 300 m au maximum
export const MESH_RESIZE_STEP = 4;

// Mêmes bornes pour la HAUTEUR, en lignes. Le pas vaut ici 4 mailles ajoutées
// EN HAUT (et non de chaque côté) : 2 m de ciel par clic.
export const MESH_MIN_ROWS = 24; // 12 m au minimum
export const MESH_MAX_ROWS = 400; // 200 m au maximum

// Applique les dimensions mémorisées au maillage vivant. `world` vient d'une
// structure (structure.world) ; une valeur absente retombe sur la base — c'est
// ce qui fait qu'une sauvegarde d'avant le réglage de hauteur s'ouvre encore.
// `spacing` ne change jamais.
export function applyWorldToMesh(world) {
  const lire = (cle, defaut) => (world && typeof world[cle] === "number" ? world[cle] : defaut);
  MESH.originX = lire("originX", BASE_ORIGIN_X);
  MESH.cols = lire("cols", BASE_COLS);
  MESH.originY = lire("originY", BASE_ORIGIN_Y);
  MESH.rows = lire("rows", BASE_ROWS);
}

// Dimensions courantes du maillage, à mémoriser sur la structure.
export function getMeshWorld() {
  return { originX: MESH.originX, cols: MESH.cols, originY: MESH.originY, rows: MESH.rows };
}

// Élargit (delta>0) ou rétrécit (delta<0) la grille de `deltaPerSide` colonnes
// DE CHAQUE CÔTÉ. `originX` glisse pour CONSERVER les positions monde existantes
// (on étend vers les x négatifs à gauche). Ne touche PAS aux structures : c'est
// à l'appelant de décaler leurs indices de +deltaPerSide (voir Structure.js).
export function applyMeshWidthResize(deltaPerSide) {
  MESH.cols += 2 * deltaPerSide;
  MESH.originX -= deltaPerSide * MESH.spacing;
}

// Monte (delta>0) ou abaisse (delta<0) le PLAFOND de la grille de `delta` lignes.
// `originY` glisse d'autant : le bas du monde reste où il est, et les positions
// monde existantes aussi. Les indices j de la structure, eux, se décalent de
// +delta (voir Structure.js::resizeWorldHeight).
export function applyMeshHeightResize(delta) {
  MESH.rows += delta;
  MESH.originY -= delta * MESH.spacing;
}

// Longueur MINIMALE d'une poutre (m). Le maillage est à 50 cm, mais on interdit
// les poutres de moins de 1 m : la longueur minimale ne change donc pas (on peut
// juste placer les extrémités plus finement). Vérifié dans Structure.canAddBeam.
export const MIN_BEAM_LENGTH = 1;

export function gridToWorld(i, j) {
  return { x: MESH.originX + i * MESH.spacing, y: MESH.originY + j * MESH.spacing };
}

export function isInBounds(i, j) {
  return i >= 0 && i <= MESH.cols && j >= 0 && j <= MESH.rows;
}

// Point du maillage le plus proche d'une position monde, avec la distance (m)
// à ce point — l'éditeur s'en sert pour n'accrocher que si le clic est assez
// proche d'un point.
export function worldToNearestGrid(x, y) {
  let i = Math.round((x - MESH.originX) / MESH.spacing);
  let j = Math.round((y - MESH.originY) / MESH.spacing);
  i = Math.max(0, Math.min(MESH.cols, i));
  j = Math.max(0, Math.min(MESH.rows, j));
  const world = gridToWorld(i, j);
  const distance = Math.hypot(world.x - x, world.y - y);
  return { i, j, x: world.x, y: world.y, distance };
}

// Tous les points du maillage (pour le dessin de la grille de points).
export function listMeshPoints() {
  const points = [];
  for (let j = 0; j <= MESH.rows; j++) {
    for (let i = 0; i <= MESH.cols; i++) {
      points.push({ i, j, ...gridToWorld(i, j) });
    }
  }
  return points;
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

// Vrai si les deux poutres (en indices de maillage) sont COLINÉAIRES ET se
// recouvrent sur une longueur non nulle — c'est le cas interdit : on ne peut
// pas poser une poutre là où une autre occupe déjà le même chemin. Se croiser
// en un point (sans être colinéaires), ou se toucher juste par une extrémité,
// reste autorisé.
export function beamsOverlapOnPath(a1, a2, b1, b2) {
  const dax = a2.i - a1.i;
  const day = a2.j - a1.j;

  // Parallèles ? (sinon elles peuvent se croiser, mais pas se recouvrir)
  if (cross(dax, day, b2.i - b1.i, b2.j - b1.j) !== 0) return false;
  // b1 sur la droite de a ? (sinon droites parallèles distinctes)
  if (cross(dax, day, b1.i - a1.i, b1.j - a1.j) !== 0) return false;

  // Colinéaires : on projette les 4 points sur la direction de a (paramètre
  // scalaire t = (p - a1)·d) et on regarde si les intervalles se recouvrent.
  const t = (px, py) => px * dax + py * day;
  const ta1 = t(a1.i - a1.i, a1.j - a1.j); // = 0
  const ta2 = t(a2.i - a1.i, a2.j - a1.j);
  const tb1 = t(b1.i - a1.i, b1.j - a1.j);
  const tb2 = t(b2.i - a1.i, b2.j - a1.j);

  const aMin = Math.min(ta1, ta2);
  const aMax = Math.max(ta1, ta2);
  const bMin = Math.min(tb1, tb2);
  const bMax = Math.max(tb1, tb2);

  const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
  return overlap > 0; // > 0 (pas >= 0) : se toucher par une extrémité est permis
}
