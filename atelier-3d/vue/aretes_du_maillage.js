/*
 * vue/aretes_du_maillage.js
 * ─────────────────────────
 * Les arêtes vives d'un maillage affiché, rassemblées en chaînes : une arête
 * droite faite de plusieurs petits segments, ou le bord rond d'un cylindre,
 * deviennent chacune une seule arête qu'on choisit d'un clic. Calculé une
 * fois par géométrie.
 *
 * Une chaîne : { points, n1, n2, ferme, saillante }, dans le repère de l'objet
 * (voir noyau/aretes.js).
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

// Deux faces qui font plus de 20° entre elles se rejoignent par une arête vive.
const COS_ARETE = Math.cos(THREE.MathUtils.degToRad(20));
// Une chaîne se poursuit tant que sa direction et ses faces tournent de moins de ça.
const COS_CONTINUITE = Math.cos(THREE.MathUtils.degToRad(35));
const COS_MEME_FACE = Math.cos(THREE.MathUtils.degToRad(25));

const connues = new WeakMap();

const moins = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitaire = (a) => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return n < 1e-12 ? [0, 0, 0] : [a[0] / n, a[1] / n, a[2] / n];
};
const moyenne = (a, b) => unitaire([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);

export function chainesDAretes(geometrie) {
  if (connues.has(geometrie)) return connues.get(geometrie);
  const positions = geometrie.getAttribute("position");
  const index = geometrie.index;
  if (positions === undefined || index === null) return [];

  // Les sommets repérés par leur position : les normales franches dédoublent les points.
  const parCle = new Map();
  const points = [];
  const sommet = (i) => {
    const p = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    const cle = p.map((c) => c.toFixed(4)).join(",");
    if (!parCle.has(cle)) {
      parCle.set(cle, points.length);
      points.push(p);
    }
    return parCle.get(cle);
  };
  const triangles = [];
  for (let t = 0; t < index.count / 3; t += 1) {
    const ids = [sommet(index.getX(t * 3)), sommet(index.getX(t * 3 + 1)), sommet(index.getX(t * 3 + 2))];
    const [a, b, c] = ids.map((i) => points[i]);
    const e1 = moins(b, a);
    const e2 = moins(c, a);
    const n = unitaire([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
    triangles.push({ ids, n });
  }

  // Chaque côté, avec ses (normalement deux) triangles.
  const cotes = new Map();
  triangles.forEach((tri, t) => {
    for (let k = 0; k < 3; k += 1) {
      const [u, v] = [tri.ids[k], tri.ids[(k + 1) % 3]];
      if (u === v) continue;
      const cle = u < v ? u + "|" + v : v + "|" + u;
      if (!cotes.has(cle)) cotes.set(cle, { u: Math.min(u, v), v: Math.max(u, v), tris: [] });
      cotes.get(cle).tris.push(t);
    }
  });

  // Les arêtes vives : deux faces franchement inclinées l'une par rapport à l'autre.
  const vives = [];
  for (const cote of cotes.values()) {
    if (cote.tris.length !== 2) continue;
    const [A, B] = cote.tris.map((t) => triangles[t]);
    if (scal(A.n, B.n) > COS_ARETE) continue;
    const autre = B.ids.find((i) => i !== cote.u && i !== cote.v);
    const saillante = scal(moins(points[autre], points[cote.u]), A.n) < 0;
    vives.push({ u: cote.u, v: cote.v, n1: A.n, n2: B.n, saillante, vue: false });
  }
  const parSommet = new Map();
  vives.forEach((a, k) => {
    for (const s of [a.u, a.v]) {
      if (!parSommet.has(s)) parSommet.set(s, []);
      parSommet.get(s).push(k);
    }
  });

  // Les chaînes : de proche en proche, tant que l'arête continue dans le même sens, entre les mêmes faces.
  const chaines = [];
  for (let depart = 0; depart < vives.length; depart += 1) {
    if (vives[depart].vue) continue;
    vives[depart].vue = true;
    const d = vives[depart];
    // Chaque maillon : { de, a, n1, n2 } orienté dans le sens de la marche.
    const maillons = [{ de: d.u, a: d.v, n1: d.n1, n2: d.n2, saillante: d.saillante }];
    const prolonger = (versLAvant) => {
      for (;;) {
        const bout = versLAvant ? maillons[maillons.length - 1] : maillons[0];
        const pivot = versLAvant ? bout.a : bout.de;
        const direction = versLAvant ? unitaire(moins(points[bout.a], points[bout.de])) : unitaire(moins(points[bout.de], points[bout.a]));
        let suivant = null;
        for (const k of parSommet.get(pivot) ?? []) {
          const c = vives[k];
          if (c.vue) continue;
          const loin = c.u === pivot ? c.v : c.u;
          const sens = unitaire(moins(points[loin], points[pivot]));
          if (scal(sens, direction) < COS_CONTINUITE) continue;
          // Les faces de part et d'autre doivent correspondre à celles du maillon.
          let [n1, n2] = [c.n1, c.n2];
          if (scal(n1, bout.n1) < scal(n2, bout.n1)) [n1, n2] = [n2, n1];
          if (scal(n1, bout.n1) < COS_MEME_FACE || scal(n2, bout.n2) < COS_MEME_FACE) continue;
          suivant = { k, maillon: versLAvant ? { de: pivot, a: loin, n1, n2, saillante: c.saillante } : { de: loin, a: pivot, n1, n2, saillante: c.saillante } };
          break;
        }
        if (suivant === null) return;
        vives[suivant.k].vue = true;
        if (versLAvant) maillons.push(suivant.maillon);
        else maillons.unshift(suivant.maillon);
      }
    };
    prolonger(true);
    prolonger(false);

    const ferme = maillons.length > 2 && maillons[maillons.length - 1].a === maillons[0].de;
    const ids = maillons.map((m) => m.de);
    if (!ferme) ids.push(maillons[maillons.length - 1].a);
    // En chaque point, les normales moyennes des maillons qui l'entourent.
    const n = maillons.length;
    const normales = ids.map((_, i) => {
      const avant = i > 0 ? maillons[i - 1] : ferme ? maillons[n - 1] : null;
      const apres = i < n ? maillons[i] : ferme ? maillons[0] : null;
      if (avant === null) return [apres.n1, apres.n2];
      if (apres === null) return [avant.n1, avant.n2];
      return [moyenne(avant.n1, apres.n1), moyenne(avant.n2, apres.n2)];
    });
    chaines.push({
      points: ids.map((i) => points[i]),
      n1: normales.map((m) => m[0]),
      n2: normales.map((m) => m[1]),
      ferme,
      saillante: maillons.every((m) => m.saillante),
    });
  }
  connues.set(geometrie, chaines);
  return chaines;
}
