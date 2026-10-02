/*
 * tranchage/couture.js
 * ────────────────────
 * La couture : le point où chaque tour de paroi commence et finit. La buse y
 * laisse un petit défaut (un bourrelet, un creux). Où le mettre :
 *   alignée     d'une couche à l'autre au même endroit : une seule ligne
 *               verticale, logée dans un coin rentrant quand il y en a un ;
 *   proche      dans un coin marqué près de la couture d'avant, quitte à
 *               sauter d'un coin à l'autre ;
 *   arriere     sur le point le plus au fond de la machine (Y maximal) ;
 *   aleatoire   n'importe où : pas de ligne, mais des points dispersés.
 *
 * Les parois intérieures commencent au plus près de la couture extérieure :
 * les défauts s'empilent au même endroit au lieu de se disperser.
 */

// Un coin compte à partir de ce virage (radians) ; un cercle n'a pas de coin.
const VIRAGE_MINIMAL = 20 * Math.PI / 180;
// « Au plus près » accepte d'aller jusqu'à ce nombre de largeurs de ligne pour trouver un coin.
const ATTRAIT_DES_COINS = 6;

const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

/* Le sens du contour : positif pour un tour extérieur, négatif pour un trou. */
function sens(points) {
  let a = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [p, q] = [points[i], points[(i + 1) % points.length]];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.sign(a) || 1;
}

/*
 * La note de coin de chaque sommet : l'angle du virage, compté plein pour un
 * coin rentrant (la couture s'y cache) et à moitié pour un coin saillant.
 */
function notesDeCoin(points) {
  const n = points.length;
  const s = sens(points);
  return points.map((p, i) => {
    const a = points[(i - 1 + n) % n];
    const b = points[(i + 1) % n];
    const [ux, uy, vx, vy] = [p[0] - a[0], p[1] - a[1], b[0] - p[0], b[1] - p[1]];
    const virage = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (Math.abs(virage) < VIRAGE_MINIMAL) return 0;
    const rentrant = virage * s < 0;
    return Math.abs(virage) * (rentrant ? 1 : 0.5);
  });
}

function plusProche(points, cible) {
  let meilleur = 0;
  points.forEach((p, i) => {
    if (distance(p, cible) < distance(points[meilleur], cible)) meilleur = i;
  });
  return meilleur;
}

function auFond(points) {
  let meilleur = 0;
  points.forEach((p, i) => {
    if (p[1] > points[meilleur][1] + 1e-6) meilleur = i;
  });
  return meilleur;
}

/* Le rang du sommet où commencer une boucle extérieure. */
function choisir(points, strategie, precedentes, couche, rangDeBoucle, largeur) {
  const n = points.length;
  if (strategie === "arriere") return auFond(points);
  if (strategie === "aleatoire") return Math.abs((couche * 7919 + rangDeBoucle * 104729) % n);
  const notes = notesDeCoin(points);
  const cible = precedentes.length === 0 ? null
    : precedentes.reduce((m, p) => (distance(p, points[0]) < distance(m, points[0]) ? p : m), precedentes[0]);
  if (cible === null) {
    // Première couche : le coin le plus marqué, ou le fond s'il n'y en a pas.
    const meilleur = notes.indexOf(Math.max(...notes));
    return notes[meilleur] > 0 ? meilleur : auFond(points);
  }
  if (strategie === "alignee") return plusProche(points, cible);
  let meilleur = 0;
  let noteMin = Infinity;
  points.forEach((p, i) => {
    const note = distance(p, cible) - ATTRAIT_DES_COINS * largeur * notes[i];
    if (note < noteMin) [meilleur, noteMin] = [i, note];
  });
  return meilleur;
}

const tourner = (points, depart) => [...points.slice(depart), ...points.slice(0, depart)];

/*
 * parRang : les boucles de parois, rang par rang (0 = extérieure).
 * precedentes : les coutures extérieures de la couche d'en dessous, [[x, y]].
 * Rend { parRang (boucles tournées pour commencer à leur couture), coutures: [[x, y]] }.
 */
export function placerLesCoutures(parRang, strategie, precedentes, couche, largeur) {
  if (parRang.length === 0) return { parRang, coutures: [] };
  const coutures = [];
  const exterieures = parRang[0].map((chemin, i) => {
    const depart = choisir(chemin.points, strategie, precedentes, couche, i, largeur);
    coutures.push(chemin.points[depart]);
    return { ...chemin, points: tourner(chemin.points, depart) };
  });
  const interieures = parRang.slice(1).map((rang) => rang.map((chemin) => {
    // Une paroi intérieure coupée par une surface du dessus n'est plus une boucle :
    // elle a déjà un début et une fin imposés, il n'y a rien à faire tourner.
    if (coutures.length === 0 || chemin.ferme !== true) return chemin;
    const premier = chemin.points[0];
    const cible = coutures.reduce((m, p) => (distance(p, premier) < distance(m, premier) ? p : m), coutures[0]);
    return { ...chemin, points: tourner(chemin.points, plusProche(chemin.points, cible)) };
  }));
  return { parRang: [exterieures, ...interieures], coutures };
}
