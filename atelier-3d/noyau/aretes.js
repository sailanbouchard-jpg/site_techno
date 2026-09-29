/*
 * noyau/aretes.js
 * ───────────────
 * Chanfreins et congés sur les arêtes d'une pièce déjà en volume. Le moteur
 * travaille sur des maillages : il ne sait pas « arrondir une arête ». On lui
 * demande donc ce qu'il sait faire à coup sûr : soustraire un volume. Pour
 * chaque arête choisie, on fabrique l'outil qui l'enlève — un prisme à
 * section triangulaire (chanfrein) ou un coin creusé d'un quart de rond
 * (congé) — balayé le long de l'arête, droite ou courbe (le bord d'un
 * cylindre). Une soustraction ne casse jamais un solide : au pire, l'outil
 * mord un peu plus qu'on ne voulait.
 *
 * Une arête : { points: [[x, y, z], …], n1: [[…], …], n2: [[…], …], ferme }
 *   points  le long de l'arête, dans le repère de la pièce ;
 *   n1, n2  en chaque point, les normales (vers l'extérieur) des deux faces
 *           qui se rejoignent là ;
 *   ferme   l'arête fait le tour (le bord d'un disque).
 * Seules les arêtes saillantes se cassent ainsi : sur une arête rentrante,
 * un congé ajouterait de la matière.
 */

import { solideParSections } from "./esquisse/solides_par_sections.js";

// L'outil dépasse un peu des faces : pas de face commune avec la pièce.
const DEPASSEMENT_MM = 0.01;
// Un congé se dessine en autant de points sur son quart de rond.
const POINTS_DU_CONGE = 10;

const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const moins = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const fois = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vect = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unitaire = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n < 1e-12 ? [0, 0, 0] : fois(a, 1 / n);
};

/* La tangente de l'arête en chacun de ses points. */
function tangentes({ points, ferme }) {
  const n = points.length;
  return points.map((_, i) => {
    const avant = i > 0 || ferme ? unitaire(moins(points[i], points[(i - 1 + n) % n])) : null;
    const apres = i < n - 1 || ferme ? unitaire(moins(points[(i + 1) % n], points[i])) : null;
    if (avant === null) return apres;
    if (apres === null) return avant;
    return unitaire(plus(avant, apres));
  });
}

/* La section de l'outil en un point de l'arête, dans le plan perpendiculaire. */
function sectionDeLOutil(E, t, n1, n2, genre, taille) {
  // Dans chaque face, la direction qui s'éloigne de l'arête.
  let t1 = unitaire(vect(t, n1));
  if (scal(t1, n2) > 0) t1 = fois(t1, -1);
  let t2 = unitaire(vect(t, n2));
  if (scal(t2, n1) > 0) t2 = fois(t2, -1);
  const dehors = fois(unitaire(plus(n1, n2)), DEPASSEMENT_MM);
  if (genre === "chanfrein") {
    return [plus(E, dehors), plus(plus(E, fois(t1, taille)), fois(n1, DEPASSEMENT_MM)), plus(plus(E, fois(t2, taille)), fois(n2, DEPASSEMENT_MM))];
  }
  // Congé : un arc tangent aux deux faces, de rayon taille.
  const cosPhi = Math.max(-0.999, Math.min(0.999, scal(t1, t2)));
  const phi = Math.acos(cosPhi);
  const recul = taille / Math.tan(phi / 2);
  const T1 = plus(E, fois(t1, recul));
  const T2 = plus(E, fois(t2, recul));
  const C = plus(E, fois(unitaire(plus(t1, t2)), taille / Math.sin(phi / 2)));
  const [a1, a2] = [unitaire(moins(T1, C)), unitaire(moins(T2, C))];
  const arc = [];
  const ouverture = Math.acos(Math.max(-1, Math.min(1, scal(a1, a2))));
  const axe = unitaire(vect(a1, a2));
  for (let k = 0; k <= POINTS_DU_CONGE; k += 1) {
    const angle = ouverture * (k / POINTS_DU_CONGE);
    // a1 tourné d'angle autour de axe, dans le plan de l'arc.
    const v = plus(fois(a1, Math.cos(angle)), fois(vect(axe, a1), Math.sin(angle)));
    arc.push(plus(C, fois(v, taille)));
  }
  arc[0] = plus(arc[0], fois(n1, DEPASSEMENT_MM));
  arc[arc.length - 1] = plus(arc[arc.length - 1], fois(n2, DEPASSEMENT_MM));
  return [plus(E, dehors), ...arc];
}

/* L'outil qui casse une arête, en solide du moteur. */
export function outilDArete(atelier, arete, genre, taille) {
  const { points, n1, n2, ferme } = arete;
  if (points.length < 2) return null;
  const ts = tangentes(arete);
  const sections = points.map((P, i) => {
    let E = P;
    // Aux deux bouts d'une arête ouverte, l'outil dépasse un peu.
    if (!ferme && i === 0) E = moins(P, fois(ts[i], DEPASSEMENT_MM));
    if (!ferme && i === points.length - 1) E = plus(P, fois(ts[i], DEPASSEMENT_MM));
    return { boucles: [sectionDeLOutil(E, ts[i], unitaire(n1[i]), unitaire(n2[i]), genre, taille)] };
  });
  if (!ferme) {
    // Les bouchons : chaque section vue à plat, dans son propre plan.
    for (const k of [0, sections.length - 1]) {
      const origine = sections[k].boucles[0][0];
      const x = unitaire(moins(sections[k].boucles[0][1], origine));
      const y = unitaire(vect(ts[k], x));
      sections[k].plan = [sections[k].boucles[0].map((q) => [scal(moins(q, origine), x), scal(moins(q, origine), y)])];
    }
  }
  return solideParSections(atelier, sections, ferme);
}

/* La pièce, ses arêtes cassées. */
export function casserLesAretes(atelier, piece, aretes, genre, taille) {
  const outils = aretes.map((a) => outilDArete(atelier, a, genre, taille)).filter((o) => o !== null);
  if (outils.length === 0) return piece;
  return piece.subtract(outils.length === 1 ? outils[0] : atelier.Manifold.union(outils));
}
