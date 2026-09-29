/*
 * noyau/face_du_maillage.js
 *
 * La face plane d'une pièce sous un point : les triangles du même plan, reliés
 * par leurs côtés au triangle touché, et les contours de cette région — le
 * bord extérieur et ceux des trous. Sert à « Extruder une face » : le contour
 * devient une esquisse posée sur la face.
 *
 * maillage : { positions, indices } dans le monde (voir objets_de_la_scene.maillageMonde).
 */

// Deux normales à moins de ~2,5° l'une de l'autre sont celles d'un même plan.
const COS_MEME_PLAN = 0.999;
// Un sommet à moins de ça du plan (en mm) en fait partie.
const ECART_AU_PLAN_MM = 0.01;
// Deux sommets à moins de ça (en mm) sont le même : le maillage affiché les double au bord des faces.
const SOUDURE_MM = 1e-4;
// Un sommet où le contour tourne de moins de ~0,5° est sur une droite : on le retire.
const SIN_ALIGNES = 0.01;

const moins = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vect = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norme = (a) => Math.hypot(a[0], a[1], a[2]);

/* Rend { normale, niveau, boucles, triangles } — boucles : les contours de la
   face, en points du monde, qui tournent dans le sens direct autour de la
   normale pour le bord extérieur ; triangles : la face elle-même, pour la
   peindre au survol. null si le point n'est sur aucune face plane. */
export function faceSous({ positions, indices }, point, normale) {
  const n = normale.map((c) => c / norme(normale));
  const sommet = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  const cle = (p) => p.map((c) => Math.round(c / SOUDURE_MM)).join(",");
  const niveau = scal(n, point);

  // Les triangles du plan, leurs sommets repérés par leur position.
  const triangles = [];
  for (let t = 0; t < indices.length / 3; t += 1) {
    const [a, b, c] = [0, 1, 2].map((k) => sommet(indices[3 * t + k]));
    const nt = vect(moins(b, a), moins(c, a));
    const l = norme(nt);
    if (l < 1e-12 || scal(nt, n) / l < COS_MEME_PLAN) continue;
    if ([a, b, c].some((p) => Math.abs(scal(n, p) - niveau) > ECART_AU_PLAN_MM)) continue;
    triangles.push({ points: [a, b, c], cles: [a, b, c].map(cle) });
  }
  if (triangles.length === 0) return null;

  // Le triangle touché : celui qui contient le point (le plus proche, par précaution).
  const ecartAuTriangle = ({ points: [a, b, c] }) => {
    let pire = 0;
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      // Distance signée du point au côté, vers l'intérieur du triangle.
      const interieur = vect(n, moins(q, p));
      pire = Math.min(pire, scal(moins(point, p), interieur) / (norme(interieur) || 1));
    }
    return -pire;
  };
  let depart = 0;
  triangles.forEach((t, k) => { if (ecartAuTriangle(t) < ecartAuTriangle(triangles[depart])) depart = k; });

  // La région : de proche en proche, par les côtés partagés.
  const cleDuCote = (u, v) => (u < v ? u + "|" + v : v + "|" + u);
  const parCote = new Map();
  triangles.forEach((t, k) => {
    for (let i = 0; i < 3; i += 1) {
      const c = cleDuCote(t.cles[i], t.cles[(i + 1) % 3]);
      if (!parCote.has(c)) parCote.set(c, []);
      parCote.get(c).push(k);
    }
  });
  const dansLaRegion = new Set([depart]);
  const aVoir = [depart];
  while (aVoir.length > 0) {
    const t = triangles[aVoir.pop()];
    for (let i = 0; i < 3; i += 1) {
      for (const voisin of parCote.get(cleDuCote(t.cles[i], t.cles[(i + 1) % 3]))) {
        if (!dansLaRegion.has(voisin)) {
          dansLaRegion.add(voisin);
          aVoir.push(voisin);
        }
      }
    }
  }

  // Le bord : les côtés qu'un seul triangle de la région utilise, dans son sens.
  const compte = new Map();
  for (const k of dansLaRegion) {
    const t = triangles[k];
    for (let i = 0; i < 3; i += 1) {
      const c = cleDuCote(t.cles[i], t.cles[(i + 1) % 3]);
      compte.set(c, (compte.get(c) ?? 0) + 1);
    }
  }
  const suivant = new Map();
  const point3D = new Map();
  for (const k of dansLaRegion) {
    const t = triangles[k];
    for (let i = 0; i < 3; i += 1) {
      const [u, v] = [t.cles[i], t.cles[(i + 1) % 3]];
      if (compte.get(cleDuCote(u, v)) !== 1) continue;
      suivant.set(u, v);
      point3D.set(u, t.points[i]);
    }
  }

  // Les boucles, en suivant les côtés du bord.
  const boucles = [];
  const vus = new Set();
  for (const debut of suivant.keys()) {
    if (vus.has(debut)) continue;
    const boucle = [];
    let courant = debut;
    while (courant !== undefined && !vus.has(courant)) {
      vus.add(courant);
      boucle.push(point3D.get(courant));
      courant = suivant.get(courant);
    }
    const propre = sansAlignes(boucle, n);
    if (propre.length >= 3) boucles.push(propre);
  }
  if (boucles.length === 0) return null;
  return { normale: n, niveau, boucles, triangles: [...dansLaRegion].map((k) => triangles[k].points) };
}

/* La boucle sans les sommets posés sur une droite. */
function sansAlignes(boucle, n) {
  const garde = boucle.filter((p, i) => {
    const a = boucle[(i - 1 + boucle.length) % boucle.length];
    const b = boucle[(i + 1) % boucle.length];
    const [u, v] = [moins(p, a), moins(b, p)];
    const lu = norme(u);
    const lv = norme(v);
    if (lu < SOUDURE_MM || lv < SOUDURE_MM) return false;
    return Math.abs(scal(vect(u, v), n)) / (lu * lv) > SIN_ALIGNES || scal(u, v) < 0;
  });
  return garde;
}
