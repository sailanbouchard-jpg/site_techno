/*
 * noyau/esquisse/elements_esquisse.js
 * ───────────────────────────────────
 * Le contenu d'une esquisse et les gestes qui le modifient. Toutes les
 * fonctions sont pures : elles rendent un contenu neuf, jamais modifié.
 *
 * Contenu : { points: { "1": [u, v], … }, courbes: [ … ], contraintes: [ … ] },
 * en millimètres dans le plan de l'esquisse. Les contraintes sont décrites
 * dans contraintes_esquisse.js.
 *   { id, genre: "segment", a, b }
 *   { id, genre: "arc", a, b, m, c, bombe }  m : la poignée, au sommet de l'arc ;
 *                                          c : le centre, un point comme un autre
 *                                          (on le tire, on le cote, on le soude) ;
 *                                          bombe = tan(angle balayé / 4), positive
 *                                          dans le sens direct, recalculée d'après
 *                                          a, m et b quand ils bougent
 *   { id, genre: "cercle", centre, rayon }
 *   { id, genre: "spline", a, b, pts }      une courbe libre qui passe par a,
 *                                          les points pts dans l'ordre, puis b
 *   { id, genre: "spline", pts, ferme: true }  la même, refermée sur elle-même
 * Une courbe marquée « construction: true » est un trait d'aide : il guide le
 * dessin et se cote comme les autres, mais ne ferme aucun contour et ne donne
 * donc aucune matière.
 * a, b et centre sont des identifiants de points. Deux traits qui partagent
 * un point sont reliés : déplacer ce point déplace les deux bouts, et c'est
 * ce qui permet au logiciel de reconnaître un contour fermé.
 */

import { sansContraintesOrphelines, remplacerPointDansContraintes } from "./contraintes_esquisse.js";
import { bornerCoordonnee } from "../limites.js";

const EGALITE_MM = 1e-6;
// Une courbe libre se dessine en autant de petits segments entre deux points de passage.
const POINTS_PAR_TRAVEE = 16;
const TOUR = Math.PI * 2;

export const CONTENU_VIDE = Object.freeze({ points: Object.freeze({}), courbes: Object.freeze([]), contraintes: Object.freeze([]) });

export function contenuDe(parametres) {
  return avecPoignees({ points: parametres.points ?? {}, courbes: parametres.courbes ?? [], contraintes: parametres.contraintes ?? [] });
}

export const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function prochainId(cles) {
  let plusGrand = 0;
  for (const cle of cles) plusGrand = Math.max(plusGrand, Number(cle) || 0);
  return String(plusGrand + 1);
}

// ── Points ──────────────────────────────────────────────────────────────────

/* Les poignées des arcs : des points qui n'appartiennent qu'à leur arc. */
export function poigneesDArc(contenu) {
  return new Set(contenu.courbes.filter((c) => c.genre === "arc" && c.m !== undefined).map((c) => c.m));
}

function nouveauPoint(contenu, [u, v]) {
  const id = prochainId(Object.keys(contenu.points));
  return { contenu: { ...contenu, points: { ...contenu.points, [id]: borne([u, v]) } }, id };
}

/* Un tracé reste dans l'atelier : rien ne part à dix kilomètres de l'origine. */
const borne = ([u, v]) => [bornerCoordonnee(u), bornerCoordonnee(v)];

/* Les centres des arcs. */
export function centresDArc(contenu) {
  return new Set(contenu.courbes.filter((c) => c.genre === "arc" && c.c !== undefined).map((c) => c.c));
}

/* Vrai si les deux points appartiennent au même arc : les souder l'écraserait. */
export function memeArc(contenu, p, q) {
  return contenu.courbes.some((c) => c.genre === "arc" && [c.a, c.b, c.m, c.c].includes(p) && [c.a, c.b, c.m, c.c].includes(q));
}

/* Un point donné par son identifiant, ou par ses coordonnées. Dans ce cas on
   reprend le point qui se trouve déjà là plutôt que de créer un doublon — sauf
   une poignée d'arc, qu'aucun autre tracé ne partage. */
export function placerPoint(contenu, point) {
  if (typeof point === "string") {
    if (!(point in contenu.points)) throw new Error("Ce point de l'esquisse n'existe plus.");
    return { contenu, id: point };
  }
  const [u, v] = point;
  if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error("Ce point est hors de l'esquisse.");
  const poignees = poigneesDArc(contenu);
  for (const [id, p] of Object.entries(contenu.points)) {
    if (!poignees.has(id) && distance(p, point) < EGALITE_MM) return { contenu, id };
  }
  return nouveauPoint(contenu, point);
}

export function deplacerPoint(contenu, id, [u, v]) {
  if (!(id in contenu.points)) throw new Error("Ce point de l'esquisse n'existe plus.");
  return { ...contenu, points: { ...contenu.points, [id]: borne([u, v]) } };
}

export function courbesDuPoint(contenu, id) {
  return contenu.courbes.filter((c) => c.a === id || c.b === id || c.centre === id);
}

function sansPointsOrphelins(contenu) {
  const utilises = new Set();
  for (const c of contenu.courbes) {
    for (const id of [c.a, c.b, c.m, c.c, c.centre, ...(c.pts ?? [])]) if (id !== undefined) utilises.add(id);
  }
  const points = Object.fromEntries(Object.entries(contenu.points).filter(([id]) => utilises.has(id)));
  return sansContraintesOrphelines({ ...contenu, points });
}

/* Le point retiré est remplacé partout par le point gardé : c'est ce qui
   referme un contour quand on lâche un bout sur un autre. Un trait réduit à
   un point disparaît. Un centre soudé à un point de son propre arc est
   abandonné : l'arc en recevra un neuf à la lecture. */
export function fusionnerPoints(contenu, garde, retire) {
  if (garde === retire) return contenu;
  const remplacer = (id) => (id === retire ? garde : id);
  const courbes = contenu.courbes
    .map((c) => {
      if (c.genre === "cercle") return { ...c, centre: remplacer(c.centre) };
      if (c.genre === "spline" && c.ferme) return { ...c, pts: c.pts.map(remplacer) };
      const suivante = { ...c, a: remplacer(c.a), b: remplacer(c.b) };
      if (c.pts !== undefined) suivante.pts = c.pts.map(remplacer);
      if (c.m !== undefined) suivante.m = remplacer(c.m);
      if (c.c !== undefined) suivante.c = remplacer(c.c);
      if ([suivante.a, suivante.b, suivante.m].includes(suivante.c)) delete suivante.c;
      return suivante;
    })
    .filter((c) => c.genre === "cercle" || (c.genre === "spline" && c.ferme) || c.a !== c.b);
  return sansPointsOrphelins(remplacerPointDansContraintes({ ...contenu, courbes }, garde, retire));
}

// ── Courbes ─────────────────────────────────────────────────────────────────

function ajouterCourbe(contenu, courbe) {
  const id = prochainId(contenu.courbes.map((c) => c.id));
  return { contenu: { ...contenu, courbes: [...contenu.courbes, { id, ...courbe }] }, id };
}

/* Un arc de bombe nulle est un segment. Rend aussi les identifiants des deux
   bouts, pour qu'un tracé en plusieurs clics continue depuis le dernier.
   centre : le point à prendre comme centre, par son identifiant ou ses
   coordonnées (un arc découpé garde le sien) ; sinon le point déjà au centre,
   ou un point neuf. */
export function ajouterArc(contenu, depart, arrivee, bombe = 0, centre = null) {
  const a = placerPoint(contenu, depart);
  const b = placerPoint(a.contenu, arrivee);
  if (a.id === b.id) return { contenu, ids: [a.id, a.id], idCourbe: null };

  const doublon = b.contenu.courbes.some((c) => c.genre === "segment" && Math.abs(bombe) < 1e-9
    && ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)));
  if (doublon) return { contenu: b.contenu, ids: [a.id, b.id], idCourbe: null };

  if (Math.abs(bombe) < 1e-9) {
    const ajout = ajouterCourbe(b.contenu, { genre: "segment", a: a.id, b: b.id });
    return { contenu: ajout.contenu, ids: [a.id, b.id], idCourbe: ajout.id };
  }
  // La poignée naît au sommet de l'arc : la tirer change sa courbure.
  const [pa, pb] = [b.contenu.points[a.id], b.contenu.points[b.id]];
  const poignee = nouveauPoint(b.contenu, sommetDeLArc(pa, pb, bombe));
  const leCentre = placerPoint(poignee.contenu, centre ?? arcDepuisBombe(pa, pb, bombe).centre);
  const ajout = ajouterCourbe(leCentre.contenu, { genre: "arc", a: a.id, b: b.id, m: poignee.id, c: leCentre.id, bombe });
  return { contenu: ajout.contenu, ids: [a.id, b.id], idCourbe: ajout.id };
}

export function ajouterSegment(contenu, depart, arrivee) {
  return ajouterArc(contenu, depart, arrivee, 0);
}

/* Une courbe libre par ces points (identifiants ou coordonnées), dans
   l'ordre. Refermée : elle revient au premier point. Deux points seulement
   font un segment. */
export function ajouterSpline(contenu, points, ferme = false) {
  let courant = contenu;
  const ids = [];
  for (const point of points) {
    // Les points de passage ne se soudent pas entre eux : deux clics au même endroit n'en font qu'un.
    const place = placerPoint(courant, point);
    courant = place.contenu;
    if (ids[ids.length - 1] !== place.id) ids.push(place.id);
  }
  if (ferme && ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
  if (ferme) {
    if (ids.length < 3) throw new Error("Une courbe fermée demande au moins trois points.");
    return ajouterCourbe(courant, { genre: "spline", pts: ids, ferme: true });
  }
  if (ids.length < 2) throw new Error("Une courbe demande au moins deux points.");
  if (ids.length === 2) {
    const segment = ajouterSegment(courant, ids[0], ids[1]);
    return { contenu: segment.contenu, id: segment.idCourbe };
  }
  return ajouterCourbe(courant, { genre: "spline", a: ids[0], b: ids[ids.length - 1], pts: ids.slice(1, -1) });
}

/* Les identifiants des points par lesquels passe une courbe libre, dans l'ordre. */
export const pointsDePassage = (courbe) => (courbe.ferme ? courbe.pts : [courbe.a, ...courbe.pts, courbe.b]);

/*
 * La courbe douce (Catmull-Rom centripète) qui passe par ces points, en
 * petits segments. Ouverte : du premier au dernier compris ; fermée : une
 * boucle sans répéter le premier point. Centripète : elle ne fait ni boucle
 * ni pointe entre des points serrés.
 */
export function pointsDeSpline(points, ferme) {
  const n = points.length;
  if (n < 2) return points.slice();
  const voisin = (i) => {
    if (ferme) return points[((i % n) + n) % n];
    if (i < 0) return [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]];
    if (i >= n) return [2 * points[n - 1][0] - points[n - 2][0], 2 * points[n - 1][1] - points[n - 2][1]];
    return points[i];
  };
  const resultat = [];
  const travees = ferme ? n : n - 1;
  for (let i = 0; i < travees; i += 1) {
    const [p0, p1, p2, p3] = [voisin(i - 1), voisin(i), voisin(i + 1), voisin(i + 2)];
    const pas = (a, b) => Math.max(Math.sqrt(distance(a, b)), 1e-6);
    const [t1, t2, t3] = [pas(p0, p1), pas(p0, p1) + pas(p1, p2), pas(p0, p1) + pas(p1, p2) + pas(p2, p3)];
    for (let k = 0; k < POINTS_PAR_TRAVEE; k += 1) {
      const t = t1 + (t2 - t1) * (k / POINTS_PAR_TRAVEE);
      const lerp = (a, b, ta, tb) => [0, 1].map((x) => (tb - t) / (tb - ta) * a[x] + (t - ta) / (tb - ta) * b[x]);
      const a1 = lerp(p0, p1, 0, t1);
      const a2 = lerp(p1, p2, t1, t2);
      const a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, 0, t2);
      const b2 = lerp(a2, a3, t1, t3);
      resultat.push(lerp(b1, b2, t1, t2));
    }
  }
  if (!ferme) resultat.push(points[n - 1]);
  return resultat;
}

export function ajouterCercle(contenu, centre, rayon) {
  if (!(rayon > EGALITE_MM)) throw new Error("Un cercle doit avoir un rayon.");
  const c = placerPoint(contenu, centre);
  const ajout = ajouterCourbe(c.contenu, { genre: "cercle", centre: c.id, rayon });
  return { contenu: ajout.contenu, ids: [c.id], idCourbe: ajout.id };
}

/* sommets : [{ point, bombe? }] ; la bombe porte sur le trait qui part du sommet. */
export function ajouterPolyligne(contenu, sommets, fermee) {
  let courant = contenu;
  const ids = [];
  for (const sommet of sommets) {
    const place = placerPoint(courant, sommet.point);
    courant = place.contenu;
    ids.push(place.id);
  }
  const traits = fermee ? ids.length : ids.length - 1;
  for (let i = 0; i < traits; i += 1) {
    courant = ajouterArc(courant, ids[i], ids[(i + 1) % ids.length], sommets[i].bombe ?? 0).contenu;
  }
  return { contenu: courant, ids };
}

/* Trait plein ↔ trait de construction. Un seul aller-retour pour tout un choix. */
export function basculerConstruction(contenu, idsCourbes) {
  const vises = new Set(idsCourbes);
  const courbes = contenu.courbes.filter((c) => vises.has(c.id));
  if (courbes.length === 0) return contenu;
  const devenirAide = courbes.some((c) => c.construction !== true);
  return {
    ...contenu,
    courbes: contenu.courbes.map((c) => {
      if (!vises.has(c.id)) return c;
      const suivante = { ...c, construction: true };
      if (!devenirAide) delete suivante.construction;
      return suivante;
    }),
  };
}

/*
 * Le reflet des tracés choisis, de l'autre côté d'un miroir : un axe de
 * l'esquisse ("horizontal" ou "vertical"), ou un segment. Les originaux
 * restent — c'est la moitié qu'on vient de dessiner.
 */
export function refleterCourbes(contenu, idsCourbes, miroir) {
  const refleter = miroirDePoint(contenu, miroir);
  if (refleter === null) throw new Error("Choisir d'abord un axe de l'esquisse ou un segment comme miroir.");
  const vises = new Set(idsCourbes);
  const aRefleter = contenu.courbes.filter((c) => vises.has(c.id));
  if (aRefleter.length === 0) throw new Error("Choisir les tracés à refléter.");

  let resultat = contenu;
  const copies = new Map();     // ancien point → nouveau point
  const reflet = (id) => {
    if (!copies.has(id)) {
      const place = placerPoint(resultat, refleter(resultat.points[id]));
      resultat = place.contenu;
      copies.set(id, place.id);
    }
    return copies.get(id);
  };

  const nouvelles = [];
  for (const c of aRefleter) {
    const base = { ...c, id: undefined, construction: c.construction };
    if (c.genre === "cercle") {
      nouvelles.push({ ...base, centre: reflet(c.centre) });
    } else if (c.genre === "spline" && c.ferme) {
      nouvelles.push({ ...base, pts: c.pts.map(reflet) });
    } else {
      // Le miroir inverse le sens de rotation : la bombe change de signe.
      const copie = { ...base, a: reflet(c.a), b: reflet(c.b), bombe: c.bombe === undefined ? undefined : -c.bombe };
      if (c.m !== undefined) copie.m = reflet(c.m);
      if (c.c !== undefined) copie.c = reflet(c.c);
      if (c.pts !== undefined) copie.pts = c.pts.map(reflet);
      nouvelles.push(copie);
    }
  }
  for (const courbe of nouvelles) {
    const { id, construction, ...champs } = courbe;
    const ajout = ajouterCourbe(resultat, construction ? { ...champs, construction } : champs);
    resultat = ajout.contenu;
  }
  return resultat;
}

/* La fonction qui reflète un point, ou null si le miroir n'existe pas. */
function miroirDePoint(contenu, miroir) {
  if (miroir.genre === "axe") {
    return miroir.axe === "horizontal" ? ([u, v]) => [u, -v] : ([u, v]) => [-u, v];
  }
  const s = contenu.courbes.find((c) => c.id === miroir.id && c.genre === "segment");
  if (s === undefined) return null;
  const [a, b] = [contenu.points[s.a], contenu.points[s.b]];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const carre = dx * dx + dy * dy;
  if (carre < 1e-12) return null;
  return ([u, v]) => {
    // Réflexion par rapport à la droite (a, b).
    const [px, py] = [u - a[0], v - a[1]];
    const facteur = 2 * (px * dx + py * dy) / carre;
    return [a[0] + facteur * dx - px, a[1] + facteur * dy - py];
  };
}

export function supprimerCourbes(contenu, idsCourbes) {
  const retirees = new Set(idsCourbes);
  return sansPointsOrphelins({ ...contenu, courbes: contenu.courbes.filter((c) => !retirees.has(c.id)) });
}

export function changerRayon(contenu, idCourbe, rayon) {
  if (!(rayon > EGALITE_MM)) throw new Error("Un cercle doit avoir un rayon.");
  return { ...contenu, courbes: contenu.courbes.map((c) => (c.id === idCourbe ? { ...c, rayon } : c)) };
}

// ── Arcs ────────────────────────────────────────────────────────────────────

/* Centre, rayon, angle de départ et angle balayé (signé) d'un arc donné par
   ses deux bouts et sa bombe. */
export function arcDepuisBombe(a, b, bombe) {
  const corde = distance(a, b);
  const rayon = (corde * (1 + bombe * bombe)) / (4 * Math.abs(bombe));
  const gauche = [-(b[1] - a[1]) / corde, (b[0] - a[0]) / corde];
  const recul = (corde * (1 - bombe * bombe)) / (4 * bombe);
  const centre = [(a[0] + b[0]) / 2 + gauche[0] * recul, (a[1] + b[1]) / 2 + gauche[1] * recul];
  return {
    centre,
    rayon,
    debut: Math.atan2(a[1] - centre[1], a[0] - centre[0]),
    balayage: 4 * Math.atan(bombe),
  };
}

/* Le point au milieu de l'arc, à égale distance de ses deux bouts. */
export function sommetDeLArc(a, b, bombe) {
  const { centre, rayon, debut, balayage } = arcDepuisBombe(a, b, bombe);
  const angle = debut + balayage / 2;
  return [centre[0] + rayon * Math.cos(angle), centre[1] + rayon * Math.sin(angle)];
}

/* Les arcs tracés avant les poignées, ou avant les centres, les reçoivent à la lecture. */
function avecPoignees(contenu) {
  let resultat = contenu;
  for (const c of contenu.courbes) {
    if (c.genre !== "arc" || Math.abs(c.bombe) < 1e-9) continue;
    const [a, b] = [contenu.points[c.a], contenu.points[c.b]];
    if (a === undefined || b === undefined) continue;
    const ajouts = {};
    if (c.m === undefined) {
      const poignee = nouveauPoint(resultat, sommetDeLArc(a, b, c.bombe));
      resultat = poignee.contenu;
      ajouts.m = poignee.id;
    }
    if (c.c === undefined || !(c.c in contenu.points)) {
      const centre = nouveauPoint(resultat, arcDepuisBombe(a, b, c.bombe).centre);
      resultat = centre.contenu;
      ajouts.c = centre.id;
    }
    if (Object.keys(ajouts).length > 0) {
      resultat = { ...resultat, courbes: resultat.courbes.map((k) => (k.id === c.id ? { ...k, ...ajouts } : k)) };
    }
  }
  return resultat;
}

/* Après un déplacement de points : chaque arc repasse par ses bouts et sa poignée. */
export function recalerLesArcs(contenu) {
  let change = false;
  const courbes = contenu.courbes.map((c) => {
    if (c.genre !== "arc" || !(c.m in contenu.points)) return c;
    const bombe = bombeParTroisPoints(contenu.points[c.a], contenu.points[c.m], contenu.points[c.b]);
    // Trois points alignés un instant, pendant un glisser : l'arc garde sa forme.
    if (bombe === null || bombe === c.bombe) return c;
    change = true;
    return { ...c, bombe };
  });
  return change ? { ...contenu, courbes } : contenu;
}

/* On a tiré le centre : ses arcs tournent autour de lui dans le même sens
   qu'avant, et leur poignée revient au sommet. C'est ce qui permet de faire
   passer un arc de petit à grand volontairement. */
export function recalerAutourDuCentre(contenu, idCentre) {
  let resultat = contenu;
  for (const c of contenu.courbes) {
    if (c.genre !== "arc" || c.c !== idCentre || !(c.m in contenu.points)) continue;
    const [a, b, o] = [contenu.points[c.a], contenu.points[c.b], contenu.points[idCentre]];
    if (distance(a, o) < EGALITE_MM || distance(b, o) < EGALITE_MM) continue;
    const modulo = (x) => ((x % TOUR) + TOUR) % TOUR;
    const direct = modulo(Math.atan2(b[1] - o[1], b[0] - o[0]) - Math.atan2(a[1] - o[1], a[0] - o[0]));
    let balayage = c.bombe >= 0 ? direct : direct - TOUR;
    balayage = Math.max(-TOUR + 0.01, Math.min(TOUR - 0.01, balayage));
    if (Math.abs(balayage) < 0.01) continue;
    const bombe = Math.tan(balayage / 4);
    resultat = deplacerPoint(resultat, c.m, sommetDeLArc(a, b, bombe));
    resultat = { ...resultat, courbes: resultat.courbes.map((k) => (k.id === c.id ? { ...k, bombe } : k)) };
  }
  return resultat;
}

/* La bombe de l'arc qui part de a, passe par p et finit en b ; null si les
   trois points sont alignés (c'est alors un segment). */
export function bombeParTroisPoints(a, p, b) {
  const [bx, by] = [b[0] - a[0], b[1] - a[1]];
  const [px, py] = [p[0] - a[0], p[1] - a[1]];
  const croise = bx * py - by * px;
  if (Math.abs(croise) < 1e-9 * (bx * bx + by * by) || distance(a, b) < EGALITE_MM) return null;

  // Centre du cercle circonscrit, dans le repère centré sur a.
  const d = 2 * croise;
  const [l1, l2] = [bx * bx + by * by, px * px + py * py];
  const centre = [a[0] + (py * l1 - by * l2) / d, a[1] + (bx * l2 - px * l1) / d];
  const angle = (q) => Math.atan2(q[1] - centre[1], q[0] - centre[0]);
  const modulo = (x) => ((x % TOUR) + TOUR) % TOUR;

  const versB = modulo(angle(b) - angle(a));
  const versP = modulo(angle(p) - angle(a));
  let balayage = versP < versB ? versB : versB - TOUR;
  // Un arc qui fait presque le tour a une bombe infinie : on le borne.
  balayage = Math.max(-TOUR + 0.01, Math.min(TOUR - 0.01, balayage));
  return Math.tan(balayage / 4);
}

// ── Arrondir un angle ───────────────────────────────────────────────────────

const unitaire = (p, q) => {
  const l = distance(p, q);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
};

/*
 * Remplace le coin entre deux traits droits par un arc tangent aux deux. Pas
 * de congé sur les solides : c'est ici, dans l'esquisse, que se font les
 * arrondis. Lève une erreur lisible quand c'est impossible.
 */
export function arrondirAngle(contenu, idPoint, rayon) {
  const courbes = courbesDuPoint(contenu, idPoint);
  if (courbes.length !== 2 || courbes.some((c) => c.genre !== "segment")) {
    throw new Error("Arrondi impossible : cliquer un coin où se rejoignent exactement deux segments droits.");
  }
  if (!(rayon > 0)) throw new Error("Le rayon de l'arrondi doit être positif.");

  const p = contenu.points[idPoint];
  const [idA, idB] = courbes.map((c) => (c.a === idPoint ? c.b : c.a));
  const [qa, qb] = [contenu.points[idA], contenu.points[idB]];
  const [da, db] = [unitaire(p, qa), unitaire(p, qb)];
  const angle = Math.acos(Math.max(-1, Math.min(1, da[0] * db[0] + da[1] * db[1])));
  if (angle < 0.02 || angle > Math.PI - 0.02) {
    throw new Error("Ces deux traits sont alignés : il n'y a pas d'angle à arrondir.");
  }

  const recul = rayon / Math.tan(angle / 2);
  const place = Math.min(distance(p, qa), distance(p, qb));
  if (recul > place - EGALITE_MM) {
    const maximum = Math.floor(place * Math.tan(angle / 2) * 10) / 10;
    throw new Error("Rayon trop grand pour ces traits : " + maximum.toLocaleString("fr-FR") + " mm au plus.");
  }

  const ta = [p[0] + da[0] * recul, p[1] + da[1] * recul];
  const tb = [p[0] + db[0] * recul, p[1] + db[1] * recul];
  // On arrive en ta en allant vers le coin (−da), on repart de tb selon db :
  // le signe du virage donne le sens de l'arc.
  const virage = -(da[0] * db[1] - da[1] * db[0]);
  const bombe = Math.sign(virage) * Math.tan((Math.PI - angle) / 4);

  let resultat = supprimerCourbes(contenu, courbes.map((c) => c.id));
  resultat = ajouterSegment(resultat, idA in resultat.points ? idA : qa, ta).contenu;
  resultat = ajouterSegment(resultat, tb, idB in resultat.points ? idB : qb).contenu;
  return ajouterArc(resultat, ta, tb, bombe).contenu;
}

// ── Chanfreiner un angle ────────────────────────────────────────────────────

/*
 * Remplace le coin entre deux traits droits par un pan coupé : un segment
 * qui part à distance du coin sur chaque trait (distance2 : sur le second,
 * pour un chanfrein dissymétrique ; par défaut la même). Lève une erreur
 * lisible quand c'est impossible.
 */
export function chanfreinerAngle(contenu, idPoint, distance1, distance2 = distance1) {
  const courbes = courbesDuPoint(contenu, idPoint);
  if (courbes.length !== 2 || courbes.some((c) => c.genre !== "segment")) {
    throw new Error("Chanfrein impossible : cliquer un coin où se rejoignent exactement deux segments droits.");
  }
  if (!(distance1 > 0) || !(distance2 > 0)) throw new Error("La taille du chanfrein doit être positive.");
  const p = contenu.points[idPoint];
  const [idA, idB] = courbes.map((c) => (c.a === idPoint ? c.b : c.a));
  const [qa, qb] = [contenu.points[idA], contenu.points[idB]];
  const [da, db] = [unitaire(p, qa), unitaire(p, qb)];
  if (Math.abs(da[0] * db[1] - da[1] * db[0]) < 0.02 && da[0] * db[0] + da[1] * db[1] < 0) {
    throw new Error("Ces deux traits sont alignés : il n'y a pas d'angle à chanfreiner.");
  }
  const [la, lb] = [distance(p, qa), distance(p, qb)];
  if (distance1 > la - EGALITE_MM || distance2 > lb - EGALITE_MM) {
    const maximum = Math.floor(Math.min(la, lb) * 10) / 10;
    throw new Error("Chanfrein trop grand pour ces traits : " + maximum.toLocaleString("fr-FR") + " mm au plus.");
  }
  const ta = [p[0] + da[0] * distance1, p[1] + da[1] * distance1];
  const tb = [p[0] + db[0] * distance2, p[1] + db[1] * distance2];
  let resultat = supprimerCourbes(contenu, courbes.map((c) => c.id));
  resultat = ajouterSegment(resultat, idA in resultat.points ? idA : qa, ta).contenu;
  resultat = ajouterSegment(resultat, tb, idB in resultat.points ? idB : qb).contenu;
  return ajouterSegment(resultat, ta, tb).contenu;
}
