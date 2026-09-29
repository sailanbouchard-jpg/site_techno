/*
 * noyau/analyse_des_maillages.js
 * ──────────────────────────────
 * Ce qu'on mesure sur des pièces déjà calculées, à partir de leurs triangles
 * dans le repère du monde ({ positions, indices }) : volume, surface, centre
 * de gravité, et le jeu entre deux pièces. Du calcul pur.
 */

// Masses volumiques des matières d'impression courantes, en g/cm³.
export const MATIERES = Object.freeze([
  { valeur: "pla", etiquette: "PLA", densite: 1.24 },
  { valeur: "petg", etiquette: "PETG", densite: 1.27 },
  { valeur: "abs", etiquette: "ABS", densite: 1.04 },
  { valeur: "tpu", etiquette: "TPU", densite: 1.21 },
]);

const sommet = (m, i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
const moins = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vect = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* Volume (mm³), surface (mm²), centre de gravité et boîte d'un maillage fermé. */
export function proprietes(maillage) {
  let volume = 0;
  let surface = 0;
  const moment = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const { indices } = maillage;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [sommet(maillage, indices[t]), sommet(maillage, indices[t + 1]), sommet(maillage, indices[t + 2])];
    const v = scal(a, vect(b, c)) / 6;
    volume += v;
    for (let k = 0; k < 3; k += 1) moment[k] += v * (a[k] + b[k] + c[k]) / 4;
    const n = vect(moins(b, a), moins(c, a));
    surface += Math.hypot(n[0], n[1], n[2]) / 2;
  }
  for (let i = 0; i < maillage.positions.length / 3; i += 1) {
    const p = sommet(maillage, i);
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  const centre = Math.abs(volume) < 1e-9 ? [0, 0, 0] : moment.map((m) => m / volume);
  return { volume: Math.abs(volume), surface, centre, boite: { min, max } };
}

/* La distance d'un point à un triangle (point le plus proche, méthode d'Ericson). */
function distancePointTriangle(p, a, b, c) {
  const ab = moins(b, a);
  const ac = moins(c, a);
  const ap = moins(p, a);
  const d1 = scal(ab, ap);
  const d2 = scal(ac, ap);
  const proche = (q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  if (d1 <= 0 && d2 <= 0) return proche(a);
  const bp = moins(p, b);
  const d3 = scal(ab, bp);
  const d4 = scal(ac, bp);
  if (d3 >= 0 && d4 <= d3) return proche(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return proche([a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]);
  }
  const cp = moins(p, c);
  const d5 = scal(ab, cp);
  const d6 = scal(ac, cp);
  if (d6 >= 0 && d5 <= d6) return proche(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return proche([a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return proche([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return proche([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/* Les triangles d'un maillage rangés dans une grille de cases, pour ne
   chercher que ceux qui sont près d'un point. */
function grilleDes(maillage, cote) {
  const cases = new Map();
  const { indices } = maillage;
  for (let t = 0; t < indices.length; t += 3) {
    const pts = [sommet(maillage, indices[t]), sommet(maillage, indices[t + 1]), sommet(maillage, indices[t + 2])];
    const bas = [0, 1, 2].map((k) => Math.floor(Math.min(...pts.map((p) => p[k])) / cote));
    const haut = [0, 1, 2].map((k) => Math.floor(Math.max(...pts.map((p) => p[k])) / cote));
    for (let x = bas[0]; x <= haut[0]; x += 1) {
      for (let y = bas[1]; y <= haut[1]; y += 1) {
        for (let z = bas[2]; z <= haut[2]; z += 1) {
          const cle = x + "," + y + "," + z;
          if (!cases.has(cle)) cases.set(cle, []);
          cases.get(cle).push(pts);
        }
      }
    }
  }
  return cases;
}

/* La plus petite distance des sommets de a aux triangles de b, ou Infinity au-delà du plafond. */
function distanceDesSommets(a, grilleB, boiteB, cote, plafond) {
  let meilleure = Infinity;
  const portee = Math.ceil(plafond / cote);
  for (let i = 0; i < a.positions.length / 3; i += 1) {
    const p = sommet(a, i);
    // Loin de la boîte de b : inutile de chercher.
    if ([0, 1, 2].some((k) => p[k] < boiteB.min[k] - plafond || p[k] > boiteB.max[k] + plafond)) continue;
    const c = p.map((x) => Math.floor(x / cote));
    const vus = new Set();
    for (let dx = -portee; dx <= portee; dx += 1) {
      for (let dy = -portee; dy <= portee; dy += 1) {
        for (let dz = -portee; dz <= portee; dz += 1) {
          for (const tri of grilleB.get((c[0] + dx) + "," + (c[1] + dy) + "," + (c[2] + dz)) ?? []) {
            if (vus.has(tri)) continue;
            vus.add(tri);
            const d = distancePointTriangle(p, ...tri);
            if (d < meilleure) meilleure = d;
          }
        }
      }
    }
  }
  return meilleure <= plafond ? meilleure : Infinity;
}

/* Le jeu entre deux pièces qui ne se touchent pas : la plus petite distance
   entre elles, approchée par sommets et triangles. Infinity au-delà du
   plafond (mm), qui borne aussi le temps de calcul. */
export function jeuMinimal(a, b, plafond = 10) {
  const cote = Math.max(plafond / 2, 0.5);
  return Math.min(
    distanceDesSommets(a, grilleDes(b, cote), proprietes(b).boite, cote, plafond),
    distanceDesSommets(b, grilleDes(a, cote), proprietes(a).boite, cote, plafond),
  );
}
