/*
 * tranchage/axe_median.js
 * ───────────────────────
 * Un filet de matière trop étroit pour une paroi entière, réduit à sa LIGNE
 * CENTRALE, avec la largeur qu'il faut en chaque point.
 *
 * Le problème : les parois sont des décalages à largeur fixe. Dans une nervure
 * de 0,4 mm, un coin aigu, ou entre deux parois qui ne se touchent pas, la
 * largeur ne tombe jamais juste. Hacher ces filets EN TRAVERS donne un peigne
 * de segments de quelques dixièmes de millimètre, dont la plupart sont trop
 * courts pour être déposés : la nervure sort en zigzag, ou disparaît. Il faut
 * au contraire un seul cordon, posé AU MILIEU du filet et dans sa longueur.
 *
 * C'est l'axe médian (Slic3r le fait depuis toujours, Arachne le généralise à
 * toute la pièce). Ici, la version courte : un filet n'est pas une forme
 * quelconque, c'est une BANDE — deux longs côtés et deux bouts. D'où un
 * squelette direct, sans diagramme de Voronoï et sans dépendance :
 *   1. on coupe le contour en deux chaînes, une par long côté ;
 *   2. on avance le long d'une chaîne et, à chaque pas, on cherche le point le
 *      plus proche sur l'autre : le milieu des deux est sur l'axe, et leur
 *      distance est la largeur à y déposer ;
 *   3. les pas voisins de même largeur sont recollés en tronçons, pour que la
 *      buse ne change pas de débit tous les dixièmes de millimètre.
 *
 * Reste à trouver OÙ couper. Le réflexe — « aux deux sommets les plus pointus »
 * — ne marche pas : dans un filet rectangulaire tous les coins font le même
 * angle, et l'on coupe alors les deux bouts du même long côté, ce qui laisse la
 * moitié du filet de côté. On procède donc à l'envers : chaque coupe envisagée
 * associe un sommet à son ANTIPODE (le sommet à mi-périmètre, car les deux
 * côtés d'une bande ont forcément la même longueur), et on garde la coupe dont
 * la bande est la plus étroite partout. C'est la définition même d'une bande,
 * vérifiée au lieu d'être devinée.
 *
 * Une bande peut aussi être fermée en anneau (le filet laissé entre une paroi
 * ronde et sa voisine) : elle arrive alors en deux contours, l'extérieur et son
 * trou, et c'est l'un qui cherche son plus proche sur l'autre. Au-delà d'un
 * trou, la forme n'est plus une bande (filets qui se rejoignent en Y) : la
 * fonction se récuse, et l'appelant retombe sur son remplissage ordinaire.
 *
 * Aucune dépendance : des polygones entrent, des cordons sortent.
 */

// Deux points plus proches que ça sont le même point.
const EPSILON = 1e-7;
// Au-delà de cette épaisseur moyenne (en part de la largeur maximale), ce n'est
// plus un filet mais une vraie surface : elle se remplit en hachures.
const EPAISSEUR_MAXIMALE = 1.6;
// Une largeur mesurée au-delà de ça (en part de la largeur maximale) veut dire
// que l'appariement a sauté d'un côté à l'autre : le cordon est coupé là.
const LARGEUR_DE_RUPTURE = 2.5;
// Les largeurs sont arrondies à ce pas avant d'être regroupées en tronçons.
const PAS_DES_LARGEURS_MM = 0.02;
// Un tronçon plus court que ça rejoint son voisin : un changement de débit tous
// les millimètres laisse un bourrelet à chaque fois.
const LONGUEUR_MINIMALE_DE_TRONCON_MM = 1;
// Ce qu'on s'autorise pour chercher la bonne coupe. Les trois bornes tiennent le
// coût : une couche peut avoir des dizaines de filets, et un texte en relief des
// centaines. Essayer plus de coupes ne change rien au résultat sur un vrai filet.
const COUPES_ESSAYEES = 10;
const MESURES_PAR_COUPE = 6;
const COTE_ECHANTILLONNE = 32;

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/* Le contour débarrassé de ses points doublés. */
function nettoyer(contour) {
  const propre = [];
  for (const point of contour) {
    if (propre.length === 0 || distance(propre.at(-1), point) > EPSILON) propre.push(point);
  }
  while (propre.length > 1 && distance(propre[0], propre.at(-1)) <= EPSILON) propre.pop();
  return propre;
}

function aireSignee(contour) {
  let a = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const [p, q] = [contour[i], contour[(i + 1) % contour.length]];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const longueurDuTour = (contour) => contour.reduce(
  (s, p, i) => s + distance(p, contour[(i + 1) % contour.length]), 0,
);

/*
 * Combien chaque sommet « pointe » : l'angle dont le contour tourne en y
 * passant, de 0 (tout droit) à π (rebrousse chemin). Sert seulement à choisir
 * quelles coupes essayer en premier — le bout d'une bande rebrousse chemin.
 */
function pointes(contour) {
  const n = contour.length;
  return contour.map((p, i) => {
    const a = contour[(i - 1 + n) % n];
    const b = contour[(i + 1) % n];
    const [ux, uy] = [p[0] - a[0], p[1] - a[1]];
    const [vx, vy] = [b[0] - p[0], b[1] - p[1]];
    const norme = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (norme < EPSILON) return 0;
    return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  });
}

/* Le point le plus proche de « cible » sur une polyligne, et sa distance. */
function plusProcheSur(polyligne, cible) {
  let meilleur = polyligne[0];
  let mini = Infinity;
  for (let i = 0; i + 1 < polyligne.length; i += 1) {
    const a = polyligne[i];
    const b = polyligne[i + 1];
    const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
    const carre = vx * vx + vy * vy;
    const t = carre < EPSILON ? 0
      : Math.max(0, Math.min(1, ((cible[0] - a[0]) * vx + (cible[1] - a[1]) * vy) / carre));
    const point = [a[0] + vx * t, a[1] + vy * t];
    const d = distance(cible, point);
    if (d < mini) {
      mini = d;
      meilleur = point;
    }
  }
  return { point: meilleur, distance: mini };
}

const longueurDuTrace = (points) => points.reduce(
  (s, p, i) => (i === 0 ? 0 : s + distance(p, points[i - 1])), 0,
);

/* Une polyligne rééchantillonnée tous les « pas » millimètres, bouts compris. */
function jalonner(polyligne, pas) {
  const jalons = [polyligne[0]];
  let reste = pas;
  for (let i = 0; i + 1 < polyligne.length; i += 1) {
    const a = polyligne[i];
    const b = polyligne[i + 1];
    const l = distance(a, b);
    if (l < EPSILON) continue;
    let depart = 0;
    while (reste <= l - depart) {
      depart += reste;
      const t = depart / l;
      jalons.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      reste = pas;
    }
    reste -= l - depart;
  }
  const dernier = polyligne.at(-1);
  if (distance(jalons.at(-1), dernier) > EPSILON) jalons.push(dernier);
  return jalons;
}

/* La polyligne raccourcie de « marge » millimètres à chaque bout. */
function rogner(polyligne, marge) {
  const totale = longueurDuTrace(polyligne);
  if (!(marge > 0) || totale <= 3 * marge) return polyligne;
  const garde = [];
  let parcouru = 0;
  for (let i = 0; i + 1 < polyligne.length; i += 1) {
    const a = polyligne[i];
    const b = polyligne[i + 1];
    const l = distance(a, b);
    if (l < EPSILON) continue;
    const point = (d) => {
      const t = (d - parcouru) / l;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const debut = Math.max(marge, parcouru);
    const fin = Math.min(totale - marge, parcouru + l);
    if (fin > debut) {
      if (garde.length === 0) garde.push(point(debut));
      garde.push(point(fin));
    }
    parcouru += l;
  }
  return garde.length >= 2 ? garde : polyligne;
}

/* La chaîne de sommets de « depuis » à « jusqua », dans le sens donné. */
function chaine(contour, depuis, jusqua, sens) {
  const n = contour.length;
  const points = [contour[depuis]];
  let i = depuis;
  for (let garde = 0; garde < n; garde += 1) {
    i = (i + sens + n) % n;
    points.push(contour[i]);
    if (i === jusqua) break;
  }
  return points;
}

/* Une polyligne ramenée à au plus « maximum » points, bouts compris. */
function alleger(polyligne, maximum) {
  if (polyligne.length <= maximum) return polyligne;
  const pas = (polyligne.length - 1) / (maximum - 1);
  const legere = [];
  for (let i = 0; i < maximum; i += 1) legere.push(polyligne[Math.round(i * pas)]);
  return legere;
}

/*
 * Le contour coupé en ses deux longs côtés, ou null si ce n'est pas une bande.
 * Chaque coupe essayée associe un sommet à son antipode (à mi-périmètre) ; on
 * garde celle dont la largeur mesurée reste partout la plus petite.
 */
function decouperEnBande(contour, largeurMax) {
  const n = contour.length;
  if (n < 3) return null;
  const longueurs = contour.map((p, i) => distance(p, contour[(i + 1) % n]));
  const tour = longueurs.reduce((s, l) => s + l, 0);
  if (tour < EPSILON) return null;

  // L'antipode de chaque sommet : celui qui est le plus près de la mi-périphérie.
  const antipode = (depart) => {
    let parcouru = 0;
    let meilleur = depart;
    let ecart = Infinity;
    for (let j = 1; j < n; j += 1) {
      parcouru += longueurs[(depart + j - 1) % n];
      const e = Math.abs(parcouru - tour / 2);
      if (e < ecart) {
        ecart = e;
        meilleur = (depart + j) % n;
      }
    }
    return meilleur;
  };

  // Les coupes à essayer : les sommets les plus pointus d'abord (le bout d'une
  // bande rebrousse chemin), complétés d'un échantillon régulier pour que des
  // coins tous identiques ne concentrent pas les essais au même endroit.
  const notes = pointes(contour);
  const parPointe = [...contour.keys()].sort((a, b) => notes[b] - notes[a]);
  const candidats = new Set(parPointe.slice(0, Math.ceil(COUPES_ESSAYEES / 2)));
  const pas = Math.max(1, Math.floor(n / Math.ceil(COUPES_ESSAYEES / 2)));
  for (let i = 0; i < n && candidats.size < COUPES_ESSAYEES; i += pas) candidats.add(i);

  let meilleure = null;
  for (const i of candidats) {
    const j = antipode(i);
    if (j === i) continue;
    const a = chaine(contour, i, j, 1);
    const b = chaine(contour, i, j, -1);
    if (a.length < 2 || b.length < 2) continue;
    const mesure = alleger(b, COTE_ECHANTILLONNE);
    const longueurA = longueurDuTrace(a);
    let pire = 0;
    const mesures = jalonner(a, Math.max(longueurA / MESURES_PAR_COUPE, 1e-3));
    for (const point of mesures) pire = Math.max(pire, plusProcheSur(mesure, point).distance);
    const desequilibre = Math.abs(longueurA - longueurDuTrace(b));
    if (meilleure === null || pire < meilleure.pire - EPSILON
      || (pire < meilleure.pire + EPSILON && desequilibre < meilleure.desequilibre)) {
      meilleure = { pire, desequilibre, a, b };
    }
  }
  if (meilleure === null || meilleure.pire > largeurMax * LARGEUR_DE_RUPTURE) return null;
  return [meilleure.a, meilleure.b];
}

/*
 * Les cordons d'une suite de jalons : chaque jalon porte son milieu et sa
 * largeur ; les jalons voisins de largeur voisine font un tronçon. Un jalon
 * trop étroit (rien à déposer) ou trop large (appariement perdu) coupe le cordon.
 */
function cordonner(jalons, largeurMin, largeurMax, ferme) {
  const rupture = largeurMax * LARGEUR_DE_RUPTURE;
  const arrondir = (l) => Math.min(largeurMax,
    Math.round(Math.min(l, largeurMax) / PAS_DES_LARGEURS_MM) * PAS_DES_LARGEURS_MM);

  const suites = [];
  let courante = null;
  for (const { milieu, largeur } of jalons) {
    if (largeur < largeurMin || largeur > rupture) {
      courante = null;
      continue;
    }
    if (courante === null) {
      courante = [];
      suites.push(courante);
    }
    courante.push({ milieu, largeur: arrondir(largeur) });
  }

  // Une bande fermée dont aucun jalon n'a été coupé se referme sur elle-même.
  const boucle = ferme && suites.length === 1 && suites[0].length === jalons.length;
  const cordons = [];
  for (const suite of suites) {
    if (suite.length < 2) continue;
    // Les tronçons : des suites de jalons de même largeur arrondie.
    const troncons = [];
    for (const jalon of suite) {
      const dernier = troncons.at(-1);
      if (dernier !== undefined && Math.abs(dernier.largeur - jalon.largeur) < EPSILON) {
        dernier.points.push(jalon.milieu);
        continue;
      }
      troncons.push({ largeur: jalon.largeur, points: [jalon.milieu] });
    }
    // Un tronçon trop court est absorbé par son voisin, à la plus grande des
    // deux largeurs : mieux vaut un peu trop de matière qu'un trou.
    for (let i = 0; i < troncons.length && troncons.length > 1; i += 1) {
      const t = troncons[i];
      if (longueurDuTrace(t.points) >= LONGUEUR_MINIMALE_DE_TRONCON_MM) continue;
      const suivant = troncons[i + 1];
      const voisin = suivant ?? troncons[i - 1];
      voisin.largeur = Math.max(voisin.largeur, t.largeur);
      if (suivant !== undefined) voisin.points.unshift(...t.points);
      else voisin.points.push(...t.points);
      troncons.splice(i, 1);
      i -= 1;
    }
    // Chaque tronçon reprend le premier point du suivant : pas de trou entre eux.
    troncons.forEach((t, i) => {
      const suivant = troncons[i + 1];
      const points = suivant === undefined ? t.points : [...t.points, suivant.points[0]];
      if (points.length >= 2 && longueurDuTrace(points) >= largeurMin) {
        cordons.push({ largeur: t.largeur, points, ferme: false });
      }
    });
  }
  if (boucle && cordons.length === 1 && cordons[0].points.length > 2) {
    cordons[0].ferme = true;
    cordons[0].points.pop();
  }
  return cordons;
}

/*
 * contours : les polygones d'UNE zone connexe, extérieur et trous mêlés
 *            (l'orientation dit lesquels : aire positive pour l'extérieur).
 * options  : { pas, largeurMin, largeurMax }
 *            pas        l'écart entre deux mesures le long du filet
 *            largeurMin en deçà, la buse ne sait pas déposer : on n'y va pas
 *            largeurMax la largeur d'une ligne ordinaire, jamais dépassée
 * Rend [{ largeur, points, ferme }], ou [] si la zone n'est pas un filet —
 * à l'appelant de la remplir autrement.
 */
export function cordonsDuFilet(contours, options) {
  const { pas, largeurMin, largeurMax } = options;
  const propres = contours.map(nettoyer).filter((c) => c.length >= 3);
  if (propres.length === 0 || propres.length > 2) return [];

  const exterieurs = propres.filter((c) => aireSignee(c) > 0);
  const trous = propres.filter((c) => aireSignee(c) < 0);
  if (exterieurs.length !== 1 || exterieurs.length + trous.length !== propres.length) return [];
  const exterieur = exterieurs[0];

  // Une vraie surface se remplit en hachures : l'axe médian n'est bon que pour
  // ce qui est mince partout. L'épaisseur moyenne vaut 2 × aire ÷ périmètre.
  const aire = aireSignee(exterieur) - trous.reduce((s, t) => s + Math.abs(aireSignee(t)), 0);
  const tour = longueurDuTour(exterieur) + trous.reduce((s, t) => s + longueurDuTour(t), 0);
  if (!(aire > 0) || tour < EPSILON) return [];
  if ((2 * aire) / tour > largeurMax * EPAISSEUR_MAXIMALE) return [];

  // Les deux côtés à apparier, et si le résultat se referme.
  let cote = null;
  let autre = null;
  let ferme = false;
  if (trous.length === 1) {
    // Une bande en anneau : l'extérieur cherche son plus proche sur le trou.
    cote = [...exterieur, exterieur[0]];
    autre = [...trous[0], trous[0][0]];
    ferme = true;
  } else {
    const cotes = decouperEnBande(exterieur, largeurMax);
    if (cotes === null) return [];
    // Les deux chaînes PARTAGENT leurs extrémités, aux deux bouts de la bande.
    // Sans les rogner, le point le plus proche d'un bout serait ce bout lui-même
    // ou son voisin immédiat : le milieu calculé sortirait de l'axe pour venir se
    // coller au bord. On s'arrête donc une largeur de ligne avant chaque pointe,
    // où de toute façon le filet est trop mince pour recevoir un cordon entier.
    cote = rogner(cotes[0], largeurMax);
    autre = rogner(cotes[1], largeurMax);
  }

  const jalons = jalonner(cote, Math.max(pas, 1e-3)).map((point) => {
    const { point: face, distance: d } = plusProcheSur(autre, point);
    return { milieu: [(point[0] + face[0]) / 2, (point[1] + face[1]) / 2], largeur: d };
  });
  if (jalons.length < 2) return [];
  return cordonner(jalons, largeurMin, largeurMax, ferme);
}
