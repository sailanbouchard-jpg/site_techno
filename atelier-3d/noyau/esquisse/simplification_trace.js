/*
 * noyau/esquisse/simplification_trace.js
 * ──────────────────────────────────────
 * Le pinceau enregistre des centaines de points ; l'esquisse n'en garde que ce
 * qu'il faut pour suivre la main à « tolerance » près : des segments là où le
 * geste est droit, des arcs là où il tourne. Un tracé qu'on peut ensuite
 * corriger point par point, et non une poussière de points.
 */

import { bombeParTroisPoints, arcDepuisBombe, distance } from "./elements_esquisse.js";

// Un arc ne remplace qu'une vraie courbe : au moins ce nombre de segments.
const SEGMENTS_MINIMUM_POUR_UN_ARC = 3;
const BALAYAGE_MAXIMUM = Math.PI * 1.5;

function distanceALaDroite(p, a, b) {
  const longueur = distance(a, b);
  if (longueur === 0) return distance(p, a);
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / longueur;
}

/* Douglas-Peucker : les indices des points à garder. */
function indicesUtiles(points, tolerance) {
  const gardes = new Set([0, points.length - 1]);
  const pile = [[0, points.length - 1]];
  while (pile.length > 0) {
    const [debut, fin] = pile.pop();
    let pire = -1;
    let ecart = tolerance;
    for (let i = debut + 1; i < fin; i += 1) {
      const d = distanceALaDroite(points[i], points[debut], points[fin]);
      if (d > ecart) {
        ecart = d;
        pire = i;
      }
    }
    if (pire >= 0) {
      gardes.add(pire);
      pile.push([debut, pire], [pire, fin]);
    }
  }
  return [...gardes].sort((a, b) => a - b);
}

/* La bombe d'un arc qui suit les points bruts de debut à fin, ou null. */
function arcQuiSuit(points, debut, fin, tolerance) {
  const milieu = Math.floor((debut + fin) / 2);
  const bombe = bombeParTroisPoints(points[debut], points[milieu], points[fin]);
  if (bombe === null) return null;
  const { centre, rayon, balayage } = arcDepuisBombe(points[debut], points[fin], bombe);
  if (Math.abs(balayage) > BALAYAGE_MAXIMUM) return null;
  for (let i = debut; i <= fin; i += 1) {
    if (Math.abs(distance(points[i], centre) - rayon) > tolerance) return null;
  }
  return bombe;
}

function sansDoublons(points, ecart) {
  const propres = [];
  for (const p of points) {
    if (propres.length === 0 || distance(p, propres.at(-1)) > ecart) propres.push(p);
  }
  return propres;
}

/*
 * points : [[u, v], …] dans l'ordre du geste.
 * fermeture : distance en dessous de laquelle le dernier point rejoint le premier.
 * Rend { sommets: [{ point, bombe }], fermee }, prêt pour ajouterPolyligne.
 */
export function simplifierTrace(points, tolerance, fermeture = tolerance * 3) {
  let bruts = sansDoublons(points, tolerance / 4);
  if (bruts.length < 2) return { sommets: [], fermee: false };

  const fermee = bruts.length > 3 && distance(bruts[0], bruts.at(-1)) <= fermeture;
  if (fermee) bruts = [...bruts.slice(0, -1), bruts[0]];

  const cles = indicesUtiles(bruts, tolerance);
  const sommets = [];
  let i = 0;
  while (i < cles.length - 1) {
    // On allonge l'arc tant que les points bruts restent sur un même cercle.
    let fin = i;
    let bombe = null;
    for (let j = i + SEGMENTS_MINIMUM_POUR_UN_ARC; j < cles.length; j += 1) {
      const essai = arcQuiSuit(bruts, cles[i], cles[j], tolerance);
      if (essai === null) break;
      fin = j;
      bombe = essai;
    }
    if (bombe !== null) {
      sommets.push({ point: bruts[cles[i]], bombe });
      i = fin;
    } else {
      sommets.push({ point: bruts[cles[i]], bombe: 0 });
      i += 1;
    }
  }
  if (!fermee) sommets.push({ point: bruts[cles.at(-1)], bombe: 0 });
  if (sommets.length < 2) return { sommets: [], fermee: false };
  return { sommets, fermee };
}
