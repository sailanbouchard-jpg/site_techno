/*
 * noyau/formes_de_calibration.js
 * ──────────────────────────────
 * Les maillages des éprouvettes de calibration, construits à la main.
 *
 * Elles ne viennent pas de la conception : ce sont des formes du logiciel, pas
 * des objets de l'élève. Elles n'ont donc ni nœud ni historique, juste des
 * triangles. Quatre briques :
 *
 *   boite      un pavé droit ;
 *   prisme     un contour plat, monté en hauteur ;
 *   tronc      deux contours de même nombre de points, reliés : cône, coin,
 *              fin penchée — tout ce qui change de section en montant ;
 *   relief     un ensemble de contours (extérieur et trous) extrudé dans une
 *              direction quelconque : c'est ce qui pose les chiffres en relief
 *              sur le flanc d'une tour.
 *
 * Les contours tournent dans le sens trigonométrique (matière à gauche), ce
 * que le découpage en couches attend. Une éprouvette n'est jamais creusée par
 * soustraction : un trou se fabrique en posant plusieurs pavés autour, car la
 * section est réunie par le trancheur.
 *
 * Le relief a besoin de vrais chapeaux, eux : ils sont coupés par tous les
 * plans de couche. D'où le triangulateur par oreilles, avec les trous reliés
 * au contour extérieur par un pont — sans quoi le creux d'un « 0 » se
 * remplirait.
 */

export function nouveauMaillage() {
  return { positions: [], indices: [] };
}

export function maillageFini(m) {
  return { positions: new Float32Array(m.positions), indices: new Uint32Array(m.indices) };
}

const centre = (contour) => [
  contour.reduce((s, p) => s + p[0], 0) / contour.length,
  contour.reduce((s, p) => s + p[1], 0) / contour.length,
];

export function aireSignee(contour) {
  let aire = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const q = contour[(i + 1) % contour.length];
    aire += contour[i][0] * q[1] - q[0] * contour[i][1];
  }
  return aire / 2;
}

function ajouterSommet(m, x, y, z) {
  m.positions.push(x, y, z);
  return m.positions.length / 3 - 1;
}

const triangle = (m, a, b, c) => m.indices.push(a, b, c);

// ── Prismes ─────────────────────────────────────────────────────────────────

/* Un contour monté de z0 à z1 : deux chapeaux et une jupe de côtés. */
export function ajouterPrisme(m, contour, z0, z1) {
  ajouterTronc(m, contour, contour, z0, z1);
}

/*
 * Deux contours de même nombre de points, du bas vers le haut. Les points se
 * correspondent un pour un : c'est à l'appelant de les donner dans le même ordre.
 */
export function ajouterTronc(m, bas, haut, z0, z1) {
  const n = bas.length;
  const sBas = bas.map((p) => ajouterSommet(m, p[0], p[1], z0));
  const sHaut = haut.map((p) => ajouterSommet(m, p[0], p[1], z1));

  // Côtés : le contour tournant à gauche, la normale du quadrilatère sort de la pièce.
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    triangle(m, sBas[i], sBas[j], sHaut[j]);
    triangle(m, sBas[i], sHaut[j], sHaut[i]);
  }

  // Chapeaux, en éventail depuis le centre : le bas regarde en bas, le haut en haut.
  const [cbx, cby] = centre(bas);
  const [chx, chy] = centre(haut);
  const cBas = ajouterSommet(m, cbx, cby, z0);
  const cHaut = ajouterSommet(m, chx, chy, z1);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    triangle(m, cBas, sBas[j], sBas[i]);
    triangle(m, cHaut, sHaut[i], sHaut[j]);
  }
}

export function rectangle(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function cercle(cx, cy, rayon, cotes = 48) {
  return Array.from({ length: cotes }, (_v, i) => {
    const a = (2 * Math.PI * i) / cotes;
    return [cx + rayon * Math.cos(a), cy + rayon * Math.sin(a)];
  });
}

export function ajouterBoite(m, x0, y0, z0, x1, y1, z1) {
  ajouterPrisme(m, rectangle(x0, y0, x1, y1), z0, z1);
}

/* Un contour déplacé : les fins penchées se décrivent ainsi. */
export const decale = (contour, dx, dy) => contour.map(([x, y]) => [x + dx, y + dy]);

/* Un contour tourné autour de l'origine, angle en degrés. */
export function tourne(contour, degres) {
  const a = (degres * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return contour.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

// ── Triangulation d'un contour à trous ──────────────────────────────────────

const PRESQUE_NUL = 1e-12;

const croix = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const memePoint = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

function dansLeTriangle(a, b, c, p) {
  const d1 = croix(a, b, p);
  const d2 = croix(b, c, p);
  const d3 = croix(c, a, p);
  return !((d1 < -PRESQUE_NUL || d2 < -PRESQUE_NUL || d3 < -PRESQUE_NUL)
    && (d1 > PRESQUE_NUL || d2 > PRESQUE_NUL || d3 > PRESQUE_NUL));
}

/*
 * Relie un trou au contour qui l'entoure par un pont : le contour devient
 * simple (un seul tour, sans trou), au prix de deux points dédoublés. C'est la
 * méthode classique : partir du point du trou le plus à droite, aller vers la
 * droite, et rejoindre le sommet du contour le plus proche qui soit visible.
 */
function relierLeTrou(exterieur, trou) {
  let depart = 0;
  for (let i = 1; i < trou.length; i += 1) if (trou[i][0] > trou[depart][0]) depart = i;
  const p = trou[depart];

  let choisi = -1;
  let distance = Infinity;
  for (let i = 0; i < exterieur.length; i += 1) {
    const s = exterieur[i];
    if (s[0] < p[0]) continue;
    const d = (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2;
    if (d >= distance) continue;
    // Le pont ne doit traverser aucun côté du contour extérieur.
    const traverse = exterieur.some((a, j) => {
      const b = exterieur[(j + 1) % exterieur.length];
      if (a === s || b === s) return false;
      const d1 = croix(p, s, a);
      const d2 = croix(p, s, b);
      const d3 = croix(a, b, p);
      const d4 = croix(a, b, s);
      return ((d1 > PRESQUE_NUL) !== (d2 > PRESQUE_NUL)) && ((d3 > PRESQUE_NUL) !== (d4 > PRESQUE_NUL));
    });
    if (traverse) continue;
    choisi = i;
    distance = d;
  }
  if (choisi < 0) return exterieur;

  const tourDuTrou = [...trou.slice(depart), ...trou.slice(0, depart), trou[depart]];
  return [...exterieur.slice(0, choisi + 1), ...tourDuTrou, exterieur[choisi], ...exterieur.slice(choisi + 1)];
}

/* Le point est-il dans le contour (règle pair-impair) ? */
function dansLeContour(point, contour) {
  let dedans = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i, i += 1) {
    const [xi, yi] = contour[i];
    const [xj, yj] = contour[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/*
 * Range des contours en faces : chaque face est un contour extérieur suivi de
 * ses trous. Un contour contenu dans un nombre impair d'autres est un trou ;
 * les autres sont des dehors. Le « i » a deux dehors, le « 8 » deux trous.
 */
export function grouperEnFaces(contours) {
  const propres = contours.filter((c) => c.length >= 3 && Math.abs(aireSignee(c)) > 1e-9);
  const profondeurs = propres.map((c) => propres.filter((autre) => autre !== c && dansLeContour(c[0], autre)).length);
  const faces = propres.filter((_c, i) => profondeurs[i] % 2 === 0).map((dehors) => [dehors]);
  propres.forEach((c, i) => {
    if (profondeurs[i] % 2 === 0) return;
    // Le trou revient au plus petit dehors qui le contient.
    let choisie = null;
    for (const face of faces) {
      if (!dansLeContour(c[0], face[0])) continue;
      if (choisie === null || Math.abs(aireSignee(face[0])) < Math.abs(aireSignee(choisie[0]))) choisie = face;
    }
    if (choisie !== null) choisie.push(c);
  });
  return faces;
}

/*
 * contours : un contour extérieur et ses trous, dans n'importe quel sens.
 * Rend { points, triangles } — les triangles tournant dans le sens trigonométrique.
 */
export function trianguler(contours) {
  const propres = contours.filter((c) => c.length >= 3 && Math.abs(aireSignee(c)) > 1e-9);
  if (propres.length === 0) return { points: [], triangles: [] };

  // Le plus grand est le dehors ; les autres sont ses trous, pris dans l'autre sens.
  const trie = [...propres].sort((a, b) => Math.abs(aireSignee(b)) - Math.abs(aireSignee(a)));
  const dehors = aireSignee(trie[0]) > 0 ? trie[0] : [...trie[0]].reverse();
  const trous = trie.slice(1).map((c) => (aireSignee(c) < 0 ? c : [...c].reverse()));
  // Les trous les plus à droite d'abord : leur pont ne coupe pas les suivants.
  trous.sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])));

  let tour = dehors;
  for (const trou of trous) tour = relierLeTrou(tour, trou);

  // Découpe par les oreilles : un sommet convexe dont le triangle ne contient
  // aucun autre sommet est un triangle du résultat, et il est retiré du tour.
  const points = tour;
  const restants = points.map((_p, i) => i);
  const triangles = [];
  let securite = restants.length * restants.length;
  while (restants.length > 3 && securite > 0) {
    securite -= 1;
    let coupee = false;
    for (let k = 0; k < restants.length; k += 1) {
      const [ia, ib, ic] = [restants[(k - 1 + restants.length) % restants.length], restants[k], restants[(k + 1) % restants.length]];
      const [a, b, c] = [points[ia], points[ib], points[ic]];
      if (croix(a, b, c) <= PRESQUE_NUL) continue;
      // Le pont vers un trou dédouble deux points : les écarter par leur POSITION,
      // pas par leur rang, sinon leur jumeau bloquerait toutes les oreilles.
      const occupee = restants.some((i) => {
        if (i === ia || i === ib || i === ic) return false;
        const p = points[i];
        if (memePoint(p, a) || memePoint(p, b) || memePoint(p, c)) return false;
        return dansLeTriangle(a, b, c, p);
      });
      if (occupee) continue;
      triangles.push([ia, ib, ic]);
      restants.splice(k, 1);
      coupee = true;
      break;
    }
    if (!coupee) break;   // contour dégénéré : on s'arrête sur ce qui est fait
  }
  if (restants.length === 3) triangles.push([restants[0], restants[1], restants[2]]);
  return { points, triangles };
}

/*
 * Un ensemble de contours extrudé d'une épaisseur, posé où l'on veut.
 * pose(u, v, w) → [x, y, z] : u et v sont les axes du dessin, w l'épaisseur.
 * Le repère doit être direct, sinon les normales sortiraient à l'envers.
 */
export function ajouterRelief(m, contours, epaisseur, pose) {
  for (const face of grouperEnFaces(contours)) ajouterUneFace(m, face, epaisseur, pose);
}

function ajouterUneFace(m, contours, epaisseur, pose) {
  const { points, triangles } = trianguler(contours);
  if (triangles.length === 0) return;
  const dessous = points.map(([u, v]) => ajouterSommet(m, ...pose(u, v, 0)));
  const dessus = points.map(([u, v]) => ajouterSommet(m, ...pose(u, v, epaisseur)));
  for (const [a, b, c] of triangles) {
    triangle(m, dessus[a], dessus[b], dessus[c]);
    triangle(m, dessous[a], dessous[c], dessous[b]);
  }
  // Les bords : chaque côté du tour, une fois. Un côté parcouru dans les deux
  // sens est un pont vers un trou, il est intérieur et n'a pas de paroi.
  const compte = new Map();
  const cle = (a, b) => (a < b ? a + ":" + b : b + ":" + a);
  for (const [a, b, c] of triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) compte.set(cle(p, q), (compte.get(cle(p, q)) ?? 0) + 1);
  }
  for (const [a, b, c] of triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (compte.get(cle(p, q)) !== 1) continue;
      triangle(m, dessous[p], dessous[q], dessus[q]);
      triangle(m, dessous[p], dessus[q], dessus[p]);
    }
  }
}

/*
 * Une plaque montée de z0 à z1, percée : le premier contour est le dehors, les
 * suivants sont ses trous. C'est le seul moyen d'avoir un trou rond — ailleurs,
 * un trou se fabrique en posant des pavés autour.
 */
export function ajouterPlaqueTrouee(m, contours, z0, z1) {
  ajouterRelief(m, contours, z1 - z0, (u, v, w) => [u, v, z0 + w]);
}

// ── Texte en relief ─────────────────────────────────────────────────────────

/*
 * Pose un texte en relief sur un flanc de la pièce.
 * police  : ce que lirePolice rend, ou null — sans police, rien n'est écrit ;
 * pose    : (u, v, w) → [x, y, z] ; u va vers la droite du texte, v vers le haut,
 *           w vers l'extérieur de la face.
 * Rend la largeur du texte, pour aligner ce qui suit.
 */
export function ajouterTexte(m, police, texte, taille, relief, pose) {
  if (police === null || texte === "") return 0;
  const echelle = taille / police.hauteurDeCapitale;
  let curseur = 0;
  const glyphes = [];
  for (const lettre of texte) {
    const glyphe = police.contoursDe(lettre);
    if (glyphe === null) continue;
    glyphes.push({ glyphe, depart: curseur });
    curseur += glyphe.avance * echelle;
  }
  const largeur = curseur;
  for (const { glyphe, depart } of glyphes) {
    const contours = glyphe.contours.map((c) => c.map(([x, y]) => [depart - largeur / 2 + x * echelle, y * echelle]));
    if (contours.length > 0) ajouterRelief(m, contours, relief, pose);

  }
  return largeur;
}

/* La boîte englobante d'un maillage en construction, pour poser la pièce et la mesurer. */
export function boiteDe(m) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      min[a] = Math.min(min[a], m.positions[i + a]);
      max[a] = Math.max(max[a], m.positions[i + a]);
    }
  }
  return { min, max };
}
