/*
 * noyau/esquisse/decalage_esquisse.js
 * ───────────────────────────────────
 * Décaler un contour : tracer, à distance constante d'un contour (ou d'un
 * tracé ouvert), une copie parallèle — la paroi d'une boîte, un jeu autour
 * d'une pièce, une rainure. Les segments restent des segments, les arcs
 * deviennent des arcs de même centre, les cercles des cercles concentriques ;
 * une courbe libre est décalée point par point.
 *
 * Aux angles, les deux éléments décalés sont prolongés jusqu'à se couper ;
 * quand ils ne se coupent pas (un arc décalé vers l'extérieur d'un angle),
 * un arc centré sur l'angle les raccorde.
 *
 * Distance signée : positive à gauche du sens de parcours de la chaîne.
 */

import { arcDepuisBombe, distance, ajouterSegment, ajouterArc, ajouterCercle, ajouterSpline, pointsDePassage, pointsDeSpline } from "./elements_esquisse.js";

const EGALITE_MM = 1e-6;
const TOUR = Math.PI * 2;

const traceable = (c) => c.construction !== true;

/* Les tracés qui touchent un point (hors traits d'aide et chaînes fermées à elles seules). */
function voisins(contenu, id) {
  return contenu.courbes.filter((c) => traceable(c) && c.genre !== "cercle" && !(c.genre === "spline" && c.ferme) && (c.a === id || c.b === id));
}

/*
 * La chaîne à laquelle appartient un tracé : les tracés qu'on rencontre en le
 * prolongeant par ses deux bouts, tant qu'un bout ne rejoint qu'un seul autre
 * tracé. Rend { elements: [{ courbe, depuis, vers }], ferme }, ou pour un
 * cercle / une courbe fermée { seul: courbe }.
 */
export function chaineDe(contenu, idCourbe) {
  const courbe = contenu.courbes.find((c) => c.id === idCourbe);
  if (courbe === undefined) return null;
  if (courbe.genre === "cercle" || (courbe.genre === "spline" && courbe.ferme)) return { seul: courbe, ferme: true };
  const elements = [{ courbe, depuis: courbe.a, vers: courbe.b }];
  const vus = new Set([courbe.id]);
  const prolonger = (versLAvant) => {
    for (;;) {
      const bout = versLAvant ? elements[elements.length - 1].vers : elements[0].depuis;
      const autres = voisins(contenu, bout).filter((c) => !vus.has(c.id));
      if (autres.length !== 1 || voisins(contenu, bout).length !== 2) return;
      const c = autres[0];
      vus.add(c.id);
      const autreBout = c.a === bout ? c.b : c.a;
      if (versLAvant) elements.push({ courbe: c, depuis: bout, vers: autreBout });
      else elements.unshift({ courbe: c, depuis: autreBout, vers: bout });
    }
  };
  prolonger(true);
  prolonger(false);
  const ferme = elements.length > 1 && elements[elements.length - 1].vers === elements[0].depuis;
  return { elements, ferme };
}

// ── Géométrie des éléments décalés ──────────────────────────────────────────

const gauche = ([dx, dy]) => {
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
};

/* Un élément parcouru de P vers Q, décalé de d : { genre: "droite", P, Q }
   ou { genre: "arc", C, R, sens (+1 : sens direct), P, Q }, ou une courbe libre
   { genre: "libre", passages }. Lève une erreur si un arc s'écrase. */
function decalerElement(contenu, { courbe, depuis, vers }, d) {
  const P = contenu.points[depuis];
  const Q = contenu.points[vers];
  if (courbe.genre === "spline") {
    const ids = pointsDePassage(courbe);
    const ordre = courbe.a === depuis ? ids : [...ids].reverse();
    const passages = ordre.map((id) => contenu.points[id]);
    // Chaque point de passage part selon la normale de la courbe à cet endroit.
    const decales = passages.map((p, i) => {
      const avant = passages[Math.max(0, i - 1)];
      const apres = passages[Math.min(passages.length - 1, i + 1)];
      const n = gauche([apres[0] - avant[0], apres[1] - avant[1]]);
      return [p[0] + n[0] * d, p[1] + n[1] * d];
    });
    return { genre: "libre", passages: decales, P: decales[0], Q: decales[decales.length - 1] };
  }
  const bombe = courbe.genre === "arc" ? (courbe.a === depuis ? courbe.bombe : -courbe.bombe) : 0;
  if (Math.abs(bombe) < 1e-9) {
    const n = gauche([Q[0] - P[0], Q[1] - P[1]]);
    return { genre: "droite", P: [P[0] + n[0] * d, P[1] + n[1] * d], Q: [Q[0] + n[0] * d, Q[1] + n[1] * d] };
  }
  const { centre: C, rayon: R } = arcDepuisBombe(P, Q, bombe);
  const sens = Math.sign(bombe);
  // À gauche d'un arc parcouru dans le sens direct, c'est vers son centre.
  const R2 = R - sens * d;
  if (R2 <= EGALITE_MM) throw new Error("Décalage trop grand : un arc de rayon " + (Math.round(R * 100) / 100).toLocaleString("fr-FR") + " mm s'écraserait.");
  const sur = (X) => [C[0] + (X[0] - C[0]) * R2 / R, C[1] + (X[1] - C[1]) * R2 / R];
  return { genre: "arc", C, R: R2, sens, P: sur(P), Q: sur(Q) };
}

/* Les points communs de deux éléments décalés (droites prolongées, cercles entiers). */
function intersections(e1, e2) {
  const droite = (e) => ({ A: e.P, u: [e.Q[0] - e.P[0], e.Q[1] - e.P[1]] });
  if (e1.genre === "droite" && e2.genre === "droite") {
    const [a, b] = [droite(e1), droite(e2)];
    const det = a.u[0] * b.u[1] - a.u[1] * b.u[0];
    if (Math.abs(det) < 1e-12) return [];
    const t = ((b.A[0] - a.A[0]) * b.u[1] - (b.A[1] - a.A[1]) * b.u[0]) / det;
    return [[a.A[0] + a.u[0] * t, a.A[1] + a.u[1] * t]];
  }
  if (e1.genre === "arc" && e2.genre === "arc") {
    const dd = distance(e1.C, e2.C);
    if (dd < EGALITE_MM || dd > e1.R + e2.R || dd < Math.abs(e1.R - e2.R)) return [];
    const a = (e1.R * e1.R - e2.R * e2.R + dd * dd) / (2 * dd);
    const h = Math.sqrt(Math.max(0, e1.R * e1.R - a * a));
    const u = [(e2.C[0] - e1.C[0]) / dd, (e2.C[1] - e1.C[1]) / dd];
    const M = [e1.C[0] + u[0] * a, e1.C[1] + u[1] * a];
    return [[M[0] - u[1] * h, M[1] + u[0] * h], [M[0] + u[1] * h, M[1] - u[0] * h]];
  }
  const [ligne, rond] = e1.genre === "droite" ? [e1, e2] : [e2, e1];
  const { A, u } = droite(ligne);
  const f = [A[0] - rond.C[0], A[1] - rond.C[1]];
  const a = u[0] * u[0] + u[1] * u[1];
  const b = 2 * (f[0] * u[0] + f[1] * u[1]);
  const c = f[0] * f[0] + f[1] * f[1] - rond.R * rond.R;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return [];
  return [-1, 1].map((s) => (-b + s * Math.sqrt(disc)) / (2 * a)).map((t) => [A[0] + u[0] * t, A[1] + u[1] * t]);
}

/*
 * Les éléments décalés de toute une chaîne, raccordés aux angles. Rend
 * [{ genre, P, Q, … }] : droites, arcs, courbes libres, et les arcs de
 * raccord ajoutés là où deux éléments ne se coupent pas.
 */
export function chaineDecalee(contenu, chaine, d) {
  if (chaine.seul !== undefined) {
    const c = chaine.seul;
    if (c.genre === "cercle") {
      // Le cercle parcouru dans le sens direct : sa gauche est son intérieur.
      const R = c.rayon - d;
      if (R <= EGALITE_MM) throw new Error("Décalage trop grand pour ce cercle.");
      return [{ genre: "cercle", C: contenu.points[c.centre], R, idCentre: c.centre }];
    }
    const passages = c.pts.map((id) => contenu.points[id]);
    const n = passages.length;
    return [{
      genre: "libre", ferme: true,
      passages: passages.map((p, i) => {
        const g = gauche([passages[(i + 1) % n][0] - passages[(i - 1 + n) % n][0], passages[(i + 1) % n][1] - passages[(i - 1 + n) % n][1]]);
        return [p[0] + g[0] * d, p[1] + g[1] * d];
      }),
    }];
  }
  const elements = chaine.elements.map((e) => decalerElement(contenu, e, d));
  const resultat = [];
  const n = elements.length;
  const joints = chaine.ferme ? n : n - 1;
  for (let i = 0; i < n; i += 1) resultat.push({ ...elements[i] });
  const raccords = [];
  for (let k = 0; k < joints; k += 1) {
    const [e1, e2] = [resultat[k], resultat[(k + 1) % n]];
    if (distance(e1.Q, e2.P) < EGALITE_MM) continue;   // tangents : rien à faire
    const coin = contenu.points[chaine.elements[k].vers];
    const candidats = e1.genre === "libre" || e2.genre === "libre" ? [] : intersections(e1, e2);
    const proche = candidats.sort((x, y) => distance(x, coin) - distance(y, coin))[0];
    if (proche !== undefined && distance(proche, coin) < Math.abs(d) * 4 + 1e-6) {
      e1.Q = proche;
      e2.P = proche;
    } else {
      // Pas de point commun : un arc centré sur l'angle les relie.
      // Le petit arc, celui qui fait le tour de l'angle par l'extérieur.
      const croise = (e1.Q[0] - coin[0]) * (e2.P[1] - coin[1]) - (e1.Q[1] - coin[1]) * (e2.P[0] - coin[0]);
      raccords.push({ apres: k, element: { genre: "arc", C: coin, R: Math.abs(d), sens: croise >= 0 ? 1 : -1, P: e1.Q, Q: e2.P } });
    }
  }
  // Les raccords s'insèrent après leur élément, en partant de la fin pour garder les rangs.
  for (const { apres, element } of raccords.reverse()) resultat.splice(apres + 1, 0, element);
  return resultat;
}

/* La bombe de l'arc de centre C qui va de P à Q dans le sens donné. */
function bombeAutour(C, P, Q, sens) {
  const angle = (X) => Math.atan2(X[1] - C[1], X[0] - C[0]);
  const direct = (((angle(Q) - angle(P)) % TOUR) + TOUR) % TOUR;
  const balayage = sens > 0 ? direct : direct - TOUR;
  return Math.tan(balayage / 4);
}

/* Les polylignes d'un décalage, pour l'aperçu. */
export function apercuDuDecalage(elements) {
  return elements.map((e) => {
    if (e.genre === "cercle") {
      const pts = [];
      for (let i = 0; i <= 64; i += 1) pts.push([e.C[0] + e.R * Math.cos(i * TOUR / 64), e.C[1] + e.R * Math.sin(i * TOUR / 64)]);
      return pts;
    }
    if (e.genre === "libre") {
      const pts = pointsDeSpline(e.passages, e.ferme === true);
      return e.ferme ? [...pts, pts[0]] : pts;
    }
    if (e.genre === "droite") return [e.P, e.Q];
    const bombe = bombeAutour(e.C, e.P, e.Q, e.sens);
    const { centre, rayon, debut, balayage } = arcDepuisBombe(e.P, e.Q, bombe);
    const pts = [];
    for (let i = 0; i <= 24; i += 1) pts.push([centre[0] + rayon * Math.cos(debut + balayage * i / 24), centre[1] + rayon * Math.sin(debut + balayage * i / 24)]);
    return pts;
  });
}

/* Ajoute les éléments décalés à l'esquisse, reliés bout à bout. */
export function appliquerLeDecalage(contenu, elements) {
  let resultat = contenu;
  for (const e of elements) {
    if (e.genre === "cercle") {
      resultat = ajouterCercle(resultat, e.idCentre in resultat.points ? e.idCentre : e.C, e.R).contenu;
    } else if (e.genre === "libre") {
      resultat = ajouterSpline(resultat, e.passages, e.ferme === true).contenu;
    } else if (e.genre === "droite") {
      if (distance(e.P, e.Q) > EGALITE_MM) resultat = ajouterSegment(resultat, e.P, e.Q).contenu;
    } else if (distance(e.P, e.Q) > EGALITE_MM) {
      resultat = ajouterArc(resultat, e.P, e.Q, bombeAutour(e.C, e.P, e.Q, e.sens)).contenu;
    }
  }
  return resultat;
}

/* De quel côté de la chaîne est ce point : +1 à gauche du sens de parcours, -1 à droite. */
export function coteDe(contenu, chaine, uv, polylignes) {
  if (chaine.seul !== undefined && chaine.seul.genre === "cercle") {
    return distance(uv, contenu.points[chaine.seul.centre]) < chaine.seul.rayon ? 1 : -1;
  }
  // Le segment de tracé le plus proche, et le côté par le produit vectoriel.
  let meilleur = { d: Infinity, signe: 1 };
  for (const pts of polylignes) {
    for (let i = 1; i < pts.length; i += 1) {
      const [a, b] = [pts[i - 1], pts[i]];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((uv[0] - a[0]) * dx + (uv[1] - a[1]) * dy) / l2));
      const d = Math.hypot(uv[0] - a[0] - t * dx, uv[1] - a[1] - t * dy);
      if (d < meilleur.d) meilleur = { d, signe: dx * (uv[1] - a[1]) - dy * (uv[0] - a[0]) >= 0 ? 1 : -1 };
    }
  }
  return meilleur.signe;
}

