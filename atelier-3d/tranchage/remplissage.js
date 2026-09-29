/*
 * tranchage/remplissage.js
 * ────────────────────────
 * Les motifs qui remplissent une zone : des lignes parallèles (rectiligne,
 * grille, dessus et dessous) et le gyroïde. Aucune dépendance : les zones
 * arrivent en polygones (contours extérieurs et trous, règle pair-impair).
 *
 * Les lignes parallèles sont tracées par balayage : chaque droite coupe les
 * bords de la zone, on garde un intervalle sur deux. Le gyroïde est la vraie
 * section de la surface sin x cos y + sin y cos z + sin z cos x = 0 à la
 * hauteur de la couche : d'une couche à l'autre, ses vagues tournent, et
 * l'ensemble forme une structure aussi solide dans tous les sens.
 */

const DEGRE = Math.PI / 180;
// Pas d'échantillonnage du gyroïde, en radians de sa période.
const PAS_DU_GYROIDE = Math.PI / 12;
// Un bout de ligne plus court que ça n'est pas déposé : la buse n'aurait pas le temps de s'amorcer.
const LONGUEUR_MINIMALE_MM = 0.3;

/*
 * Lignes parallèles espacées de « espacement », orientées selon « angle » (degrés).
 * decalage : la position de la première ligne (pour ne pas retomber sur les
 * mêmes lignes d'une couche à l'autre, ou pour une grille).
 * Rend des polylignes de deux points, en zigzag : une ligne sur deux est parcourue à l'envers.
 */
export function hachures(polygones, espacement, angle, decalage = 0) {
  const [c, s] = [Math.cos(angle * DEGRE), Math.sin(angle * DEGRE)];
  // Dans le repère tourné, les lignes sont horizontales.
  const tournes = polygones.map((poly) => poly.map(([x, y]) => [x * c + y * s, -x * s + y * c]));
  let [minY, maxY] = [Infinity, -Infinity];
  for (const poly of tournes) {
    for (const [, y] of poly) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const lignes = [];
  let rang = 0;
  for (let y = Math.ceil((minY - decalage) / espacement) * espacement + decalage; y < maxY; y += espacement) {
    const xs = [];
    for (const poly of tournes) {
      for (let i = 0; i < poly.length; i += 1) {
        const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
        if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
          xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
        }
      }
    }
    xs.sort((a, b) => a - b);
    const intervalles = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] >= LONGUEUR_MINIMALE_MM) intervalles.push([xs[i], xs[i + 1]]);
    }
    if (rang % 2 === 1) intervalles.reverse();
    for (const [x0, x1] of intervalles) {
      const [a, b] = rang % 2 === 0 ? [x0, x1] : [x1, x0];
      lignes.push([[a * c - y * s, a * s + y * c], [b * c - y * s, b * s + y * c]]);
    }
    rang += 1;
  }
  return lignes;
}

/*
 * Le gyroïde à la hauteur z, découpé à la zone. Ses lignes sont en moyenne
 * espacées de « espacement ».
 */
export function gyroide(polygones, espacement, z) {
  const k = Math.PI / espacement;
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const poly of polygones) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const [sinZ, cosZ] = [Math.sin(z * k), Math.cos(z * k)];
  const u0 = Math.floor(minX * k / PAS_DU_GYROIDE) * PAS_DU_GYROIDE;
  const nMin = Math.floor(minY * k / (2 * Math.PI)) - 1;
  const nMax = Math.ceil(maxY * k / (2 * Math.PI)) + 1;

  // sin u cos v + cos z sin v = −sin z cos u, résolu en v : deux branches par période.
  const polylignes = [];
  for (let n = nMin; n <= nMax; n += 1) {
    for (const signe of [1, -1]) {
      let courante = [];
      let phiAvant = null;
      for (let u = u0; u <= maxX * k + PAS_DU_GYROIDE; u += PAS_DU_GYROIDE) {
        const a = Math.sin(u);
        const r = Math.hypot(a, cosZ);
        const rapport = r < 1e-9 ? 2 : (-sinZ * Math.cos(u)) / r;
        const phi = Math.atan2(cosZ, a);
        const sautDePhase = phiAvant !== null && Math.abs(phi - phiAvant) > Math.PI;
        phiAvant = phi;
        if (Math.abs(rapport) > 1 || sautDePhase) {
          if (courante.length > 1) polylignes.push(courante);
          courante = [];
          if (Math.abs(rapport) > 1) continue;
        }
        const v = phi + signe * Math.acos(rapport) + 2 * Math.PI * n;
        courante.push([u / k, v / k]);
      }
      if (courante.length > 1) polylignes.push(courante);
    }
  }
  return decouperPolylignes(polylignes, polygones);
}

/* Pair-impair : le point est-il dans la zone (dans un contour, pas dans un trou) ? */
// Les boîtes des polygones d'une zone, retenues tant que la zone existe : une
// même zone est interrogée des milliers de fois par couche (les paliers de
// surplomb testent chaque segment de chaque paroi).
const boitesConnues = new WeakMap();

function boitesDe(polygones) {
  let boites = boitesConnues.get(polygones);
  if (boites !== undefined) return boites;
  boites = polygones.map((poly) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of poly) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  });
  boitesConnues.set(polygones, boites);
  return boites;
}

export function dansLaZone(x, y, polygones) {
  const boites = boitesDe(polygones);
  let dedans = false;
  for (let k = 0; k < polygones.length; k += 1) {
    const [x0, y0, x1, y1] = boites[k];
    // Le rayon part vers la droite : un polygone entièrement à gauche ne le
    // coupe jamais, un polygone entièrement à droite le coupe un nombre pair
    // de fois. Ni l'un ni l'autre ne change la parité.
    if (y < y0 || y > y1 || x1 < x || x0 > x) continue;
    const poly = polygones[k];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

// Côté d'une case de la grille des bords, en millimètres : assez grand pour que
// peu de cases soient visitées, assez petit pour qu'une case tienne peu de bords.
const CASE_MM = 4;

/*
 * Les bords de la zone, rangés dans une grille : un segment ne se compare
 * qu'aux bords des cases qu'il traverse. Sans cette grille, chaque segment de
 * remplissage était comparé à tous les bords de la couche — sur une pièce large,
 * ou dès qu'un texte en relief ajoute des centaines de points, c'est ce qui
 * faisait durer un tranchage plusieurs minutes.
 */
function grilleDesBords(polygones) {
  const cases = new Map();
  const ranger = (arete) => {
    const [, , , , eMinX, eMaxX, eMinY, eMaxY] = arete;
    for (let cx = Math.floor(eMinX / CASE_MM); cx <= Math.floor(eMaxX / CASE_MM); cx += 1) {
      for (let cy = Math.floor(eMinY / CASE_MM); cy <= Math.floor(eMaxY / CASE_MM); cy += 1) {
        const cle = cx + ":" + cy;
        if (!cases.has(cle)) cases.set(cle, []);
        cases.get(cle).push(arete);
      }
    }
  };
  for (const poly of polygones) {
    for (let i = 0; i < poly.length; i += 1) {
      const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
      ranger([p[0], p[1], q[0], q[1], Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1])]);
    }
  }
  return cases;
}

/* Les morceaux de polylignes qui sont dans la zone. */
export function decouperPolylignes(polylignes, polygones) {
  const cases = grilleDesBords(polygones);
  const vues = new Set();
  /* Les bords à comparer à un segment : ceux des cases qu'il traverse. */
  const bordsAutour = (sMinX, sMaxX, sMinY, sMaxY) => {
    const proches = [];
    vues.clear();
    for (let cx = Math.floor(sMinX / CASE_MM); cx <= Math.floor(sMaxX / CASE_MM); cx += 1) {
      for (let cy = Math.floor(sMinY / CASE_MM); cy <= Math.floor(sMaxY / CASE_MM); cy += 1) {
        for (const arete of cases.get(cx + ":" + cy) ?? []) {
          if (vues.has(arete)) continue;
          vues.add(arete);
          proches.push(arete);
        }
      }
    }
    return proches;
  };
  const resultat = [];
  for (const ligne of polylignes) {
    let courante = [];
    const fermer = () => {
      if (courante.length > 1 && longueur(courante) >= LONGUEUR_MINIMALE_MM) resultat.push(courante);
      courante = [];
    };
    for (let i = 0; i + 1 < ligne.length; i += 1) {
      const [ax, ay] = ligne[i];
      const [bx, by] = ligne[i + 1];
      // Où le segment traverse les bords de la zone.
      const coupes = [0, 1];
      const [sMinX, sMaxX, sMinY, sMaxY] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)];
      for (const [px, py, qx, qy, eMinX, eMaxX, eMinY, eMaxY] of bordsAutour(sMinX, sMaxX, sMinY, sMaxY)) {
        if (eMaxX < sMinX || eMinX > sMaxX || eMaxY < sMinY || eMinY > sMaxY) continue;
        const [dx, dy, ex, ey] = [bx - ax, by - ay, qx - px, qy - py];
        const denominateur = dx * ey - dy * ex;
        if (Math.abs(denominateur) < 1e-12) continue;
        const t = ((px - ax) * ey - (py - ay) * ex) / denominateur;
        const w = ((px - ax) * dy - (py - ay) * dx) / denominateur;
        if (t > 0 && t < 1 && w >= 0 && w <= 1) coupes.push(t);
      }
      coupes.sort((m, n) => m - n);
      for (let c = 0; c + 1 < coupes.length; c += 1) {
        const [t0, t1] = [coupes[c], coupes[c + 1]];
        const milieu = (t0 + t1) / 2;
        const dedans = dansLaZone(ax + (bx - ax) * milieu, ay + (by - ay) * milieu, polygones);
        const p0 = [ax + (bx - ax) * t0, ay + (by - ay) * t0];
        const p1 = [ax + (bx - ax) * t1, ay + (by - ay) * t1];
        if (!dedans) {
          fermer();
          continue;
        }
        if (courante.length === 0) courante.push(p0);
        courante.push(p1);
      }
    }
    fermer();
  }
  return resultat;
}

function longueur(polyligne) {
  let l = 0;
  for (let i = 0; i + 1 < polyligne.length; i += 1) {
    l += Math.hypot(polyligne[i + 1][0] - polyligne[i][0], polyligne[i + 1][1] - polyligne[i][1]);
  }
  return l;
}

/*
 * Relier les lignes voisines en une seule trajectoire, comme les trancheurs
 * courants : au bout d'une ligne, la buse file vers le bout le plus proche
 * d'une ligne restante sans lever, si ce raccord est court (moins de
 * « distanceMax ») et reste dans la zone. Sinon, c'est un déplacement.
 * Moins de déplacements : moins d'arrêts, de rétractions et de fils.
 *
 * Les bouts sont rangés dans une grille de « distanceMax » de côté : un
 * raccord possible est forcément dans l'une des neuf cases autour du bout
 * courant. Sans elle, chaque ligne était comparée à toutes les autres, et une
 * grande surface pleine — quelques centaines de lignes par couche — prenait
 * des minutes à elle seule.
 */
export function relier(polylignes, polygones, distanceMax) {
  const lignes = polylignes.map((p) => p.slice());
  const vivantes = new Uint8Array(lignes.length).fill(1);
  const taille = Math.max(distanceMax, 0.1);
  const cases = new Map();
  const cle = (x, y) => Math.floor(x / taille) + ":" + Math.floor(y / taille);
  lignes.forEach((p, i) => {
    for (const bout of [p[0], p.at(-1)]) {
      const k = cle(bout[0], bout[1]);
      if (!cases.has(k)) cases.set(k, []);
      cases.get(k).push(i);
    }
  });
  // Une ligne consommée reste dans la grille : elle est simplement ignorée.
  const autour = (x, y) => {
    const [cx, cy] = [Math.floor(x / taille), Math.floor(y / taille)];
    const vues = new Set();
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const i of cases.get(cx + dx + ":" + (cy + dy)) ?? []) vues.add(i);
      }
    }
    return vues;
  };

  const resultat = [];
  for (let depart = 0; depart < lignes.length; depart += 1) {
    if (vivantes[depart] === 0) continue;
    vivantes[depart] = 0;
    let courante = lignes[depart];
    for (;;) {
      const bout = courante.at(-1);
      let meilleure = -1;
      let inverser = false;
      let distance = Infinity;
      for (const i of autour(bout[0], bout[1])) {
        if (vivantes[i] === 0) continue;
        const p = lignes[i];
        const dDebut = Math.hypot(p[0][0] - bout[0], p[0][1] - bout[1]);
        const dFin = Math.hypot(p.at(-1)[0] - bout[0], p.at(-1)[1] - bout[1]);
        if (dDebut < distance) [meilleure, inverser, distance] = [i, false, dDebut];
        if (dFin < distance) [meilleure, inverser, distance] = [i, true, dFin];
      }
      if (meilleure < 0 || distance > distanceMax) break;
      const suivante = inverser ? lignes[meilleure].slice().reverse() : lignes[meilleure];
      // Le raccord doit rester entier dans la zone : sinon il couperait une paroi.
      const raccord = decouperPolylignes([[bout, suivante[0]]], polygones);
      const entier = raccord.length === 1 && Math.hypot(raccord[0][0][0] - bout[0], raccord[0][0][1] - bout[1]) < 1e-3
        && Math.hypot(raccord[0].at(-1)[0] - suivante[0][0], raccord[0].at(-1)[1] - suivante[0][1]) < 1e-3;
      if (!entier && distance > LONGUEUR_MINIMALE_MM) break;
      vivantes[meilleure] = 0;
      courante = courante.concat(suivante);
    }
    resultat.push(courante);
  }
  return resultat;
}
