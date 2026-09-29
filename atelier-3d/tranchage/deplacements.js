/*
 * tranchage/deplacements.js
 * ─────────────────────────
 * Par où la buse passe quand elle ne dépose rien.
 *
 * Sans précaution, elle va au but en ligne droite : elle traverse les parois,
 * raye la face visible, et laisse un fil au-dessus des trous. Les trancheurs
 * courants font deux choses, reprises ici :
 *   - tant que le trajet reste dans la matière déjà posée, ils ne rétractent
 *     pas : la buse « peigne » l'intérieur de la pièce ;
 *   - sinon ils contournent, en longeant le bord de la couche.
 *
 * Le contour de la couche vient du trancheur : ce sont les polygones de la
 * section, rentrés d'une demi-paroi. Les trous y sont des contours en sens
 * inverse, et la règle pair-impair dit ce qui est dedans.
 *
 * Le contournement passe par les sommets du contour, rentrés vers l'intérieur,
 * reliés entre eux quand ils se voient : c'est le plus court chemin dans ce
 * graphe (Dijkstra). Au-delà d'un certain nombre de sommets, on renonce et on
 * rétracte : mieux vaut un fil qu'un tranchage qui s'éternise.
 */

// Au-delà, le graphe de visibilité coûterait plus cher que le fil qu'il évite.
const SOMMETS_MAX = 120;
// Les contours sont d'abord simplifiés à ce près : un cercle finement découpé
// n'a pas besoin de ses 200 sommets pour qu'on sache le contourner.
const TOLERANCE_MM = 0.3;
// Les sommets de contournement sont rentrés d'autant vers l'intérieur de la matière.
const RENTREE_MM = 0.2;
// Deux points plus proches que ça sont le même point.
const EPSILON = 1e-6;

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/* Le point est-il dans la matière (règle pair-impair sur tous les contours) ? */
function dedans(point, contours) {
  let dedansCompte = false;
  for (const polygone of contours) {
    for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i, i += 1) {
      const [xi, yi] = polygone[i];
      const [xj, yj] = polygone[j];
      if ((yi > point[1]) !== (yj > point[1])
        && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) dedansCompte = !dedansCompte;
    }
  }
  return dedansCompte;
}

const cote = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/* Deux segments se croisent-ils vraiment (un simple contact ne compte pas) ? */
function seCroisent(a, b, c, d) {
  const d1 = cote(c, d, a);
  const d2 = cote(c, d, b);
  const d3 = cote(a, b, c);
  const d4 = cote(a, b, d);
  return ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON))
    && ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON));
}

/*
 * contours : les polygones de la couche ([[x, y], …]), trous compris.
 * Rend { libre(a, b), contourner(a, b) } :
 *   libre        le trajet droit reste-t-il dans la matière ?
 *   contourner   les points intermédiaires pour y rester, ou null s'il faut
 *                sortir (la buse rétracte alors et passe par-dessus).
 */
/* Douglas-Peucker sur un contour fermé : on garde la forme, pas le détail. */
function simplifierLeContour(polygone) {
  if (polygone.length <= 8) return polygone;
  const garder = new Uint8Array(polygone.length);
  garder[0] = 1;
  const pile = [[0, polygone.length]];
  while (pile.length > 0) {
    const [a, b] = pile.pop();
    const [ax, ay] = polygone[a];
    const [bx, by] = polygone[b % polygone.length];
    const longueur = Math.hypot(bx - ax, by - ay);
    let pire = -1;
    let ecart = TOLERANCE_MM;
    for (let i = a + 1; i < b; i += 1) {
      const [x, y] = polygone[i];
      const d = longueur < 1e-9 ? Math.hypot(x - ax, y - ay)
        : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / longueur;
      if (d > ecart) { ecart = d; pire = i; }
    }
    if (pire < 0) continue;
    garder[pire] = 1;
    pile.push([a, pire], [pire, b]);
  }
  const simple = polygone.filter((_p, i) => garder[i] === 1);
  return simple.length >= 3 ? simple : polygone;
}

export function creerNavigation(contoursBruts) {
  const contours = contoursBruts.map(simplifierLeContour);
  const aretes = [];
  for (const polygone of contours) {
    for (let i = 0; i < polygone.length; i += 1) {
      aretes.push([polygone[i], polygone[(i + 1) % polygone.length]]);
    }
  }

  const coupe = (a, b) => aretes.some(([c, d]) => seCroisent(a, b, c, d));
  const libre = (a, b) => {
    if (aretes.length === 0) return false;
    if (coupe(a, b)) return false;
    // Ne pas longer l'extérieur : le milieu doit être dans la matière.
    return dedans([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], contours);
  };

  // Les sommets du contour, rentrés vers l'intérieur : la buse ne frôle pas la paroi.
  const sommets = [];
  for (const polygone of contours) {
    const n = polygone.length;
    for (let i = 0; i < n; i += 1) {
      const p = polygone[i];
      const a = polygone[(i - 1 + n) % n];
      const b = polygone[(i + 1) % n];
      const [ux, uy] = [p[0] - a[0], p[1] - a[1]];
      const [vx, vy] = [b[0] - p[0], b[1] - p[1]];
      const nu = Math.hypot(ux, uy) || 1;
      const nv = Math.hypot(vx, vy) || 1;
      // La bissectrice des deux normales rentrantes.
      const bx = -uy / nu - vy / nv;
      const by = ux / nu + vx / nv;
      const nb = Math.hypot(bx, by);
      const rentre = nb < EPSILON ? p : [p[0] + (bx / nb) * RENTREE_MM, p[1] + (by / nb) * RENTREE_MM];
      sommets.push(dedans(rentre, contours) ? rentre : p);
    }
  }

  // Les sommets qui se voient deux à deux : calculé une fois pour la couche,
  // puis réutilisé par tous ses déplacements (seuls le départ et l'arrivée changent).
  let visibles = null;
  const preparerLeGraphe = () => {
    if (visibles !== null) return visibles;
    visibles = sommets.map(() => []);
    for (let i = 0; i < sommets.length; i += 1) {
      for (let j = i + 1; j < sommets.length; j += 1) {
        if (!libre(sommets[i], sommets[j])) continue;
        const d = distance(sommets[i], sommets[j]);
        visibles[i].push([j, d]);
        visibles[j].push([i, d]);
      }
    }
    return visibles;
  };

  return {
    libre,

    contourner(depart, arrivee) {
      if (libre(depart, arrivee)) return [];
      if (sommets.length === 0 || sommets.length > SOMMETS_MAX) return null;
      if (!dedans(depart, contours) || !dedans(arrivee, contours)) return null;
      const graphe = preparerLeGraphe();

      // Dijkstra sur les sommets qui se voient, départ et arrivée compris.
      const points = [depart, ...sommets, arrivee];
      const dernier = points.length - 1;
      const cout = new Float64Array(points.length).fill(Infinity);
      const venantDe = new Int32Array(points.length).fill(-1);
      const vus = new Uint8Array(points.length);
      cout[0] = 0;
      for (;;) {
        let courant = -1;
        for (let i = 0; i < points.length; i += 1) {
          if (!vus[i] && cout[i] < (courant < 0 ? Infinity : cout[courant])) courant = i;
        }
        if (courant < 0) return null;
        if (courant === dernier) break;
        vus[courant] = 1;
        // Entre deux sommets du contour, la visibilité est déjà connue ; le départ
        // et l'arrivée, eux, se testent à la volée.
        const interieur = courant > 0 && courant < dernier;
        const voisins = interieur
          // Les sommets visibles, plus les deux bouts du trajet, qu'il faut tester.
          ? [...graphe[courant - 1].map(([j, d]) => [j + 1, d]),
            [0, distance(points[courant], depart)], [dernier, distance(points[courant], arrivee)]]
          : points.map((_p, i) => [i, distance(points[courant], points[i])]);
        for (const [i, d] of voisins) {
          if (vus[i] || i === courant || cout[courant] + d >= cout[i]) continue;
          // La visibilité n'est déjà connue qu'entre deux sommets du contour.
          if ((!interieur || i === 0 || i === dernier) && !libre(points[courant], points[i])) continue;
          cout[i] = cout[courant] + d;
          venantDe[i] = courant;
        }
      }

      const chemin = [];
      for (let i = dernier; i > 0; i = venantDe[i]) chemin.unshift(points[i]);
      chemin.pop();      // l'arrivée est ajoutée par l'appelant
      return chemin;
    },
  };
}
