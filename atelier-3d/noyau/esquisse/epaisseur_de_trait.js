/*
 * noyau/esquisse/epaisseur_de_trait.js
 * ────────────────────────────────────
 * « Épaissir » : un trait devient un muret. On le découpe en petits
 * rectangles, un par segment, et on bouche les coins — des disques pour un
 * trait centré, des triangles pour un trait décalé d'un côté. Le moteur fait
 * ensuite l'union de tous ces morceaux.
 *
 * Tous les polygones rendus tournent dans le sens direct : avec la règle de
 * remplissage « positive », leur superposition est une union.
 */

const COTES_D_UN_DISQUE = 16;

function aireSignee(polygone) {
  let somme = 0;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i, i += 1) {
    somme += polygone[j][0] * polygone[i][1] - polygone[i][0] * polygone[j][1];
  }
  return somme / 2;
}

function sensDirect(polygone) {
  const aire = aireSignee(polygone);
  if (Math.abs(aire) < 1e-9) return null;
  return aire > 0 ? polygone : [...polygone].reverse();
}

function normaleGauche(a, b) {
  const longueur = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [-(b[1] - a[1]) / longueur, (b[0] - a[0]) / longueur];
}

function disque([cx, cy], rayon) {
  const points = [];
  for (let i = 0; i < COTES_D_UN_DISQUE; i += 1) {
    const angle = (i * Math.PI * 2) / COTES_D_UN_DISQUE;
    points.push([cx + rayon * Math.cos(angle), cy + rayon * Math.sin(angle)]);
  }
  return points;
}

/* De combien le trait déborde de chaque côté de la ligne tracée. */
function bords(largeur, cote) {
  if (cote === "gauche") return [0, largeur];
  if (cote === "droite") return [-largeur, 0];
  return [-largeur / 2, largeur / 2];
}

/*
 * traces : [{ points: [[u, v], …], fermee }]
 * cote : "centre" | "gauche" | "droite", vu en suivant le sens du tracé.
 * Rend une liste de polygones à unir.
 */
export function polygonesDEpaisseur(traces, largeur, cote = "centre") {
  const [dedans, dehors] = bords(largeur, cote);
  const morceaux = [];

  for (const { points, fermee } of traces) {
    const sommets = fermee ? [...points, points[0]] : points;
    const normales = [];
    for (let i = 1; i < sommets.length; i += 1) {
      const [a, b] = [sommets[i - 1], sommets[i]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
      const n = normaleGauche(a, b);
      normales.push({ point: a, n });
      morceaux.push([
        [a[0] + n[0] * dedans, a[1] + n[1] * dedans],
        [b[0] + n[0] * dedans, b[1] + n[1] * dedans],
        [b[0] + n[0] * dehors, b[1] + n[1] * dehors],
        [a[0] + n[0] * dehors, a[1] + n[1] * dehors],
      ]);
    }
    if (normales.length === 0) continue;

    if (cote === "centre") {
      // Des disques à chaque sommet : les coins et les bouts sont arrondis,
      // comme le trait d'un feutre.
      for (const sommet of sommets) morceaux.push(disque(sommet, largeur / 2));
      continue;
    }
    // Décalé d'un côté : un triangle bouche l'ouverture entre deux rectangles.
    const cotes = fermee ? normales.length : normales.length - 1;
    for (let i = 0; i < cotes; i += 1) {
      const suivante = normales[(i + 1) % normales.length];
      const coin = suivante.point;
      const avant = normales[i].n;
      const k = cote === "gauche" ? dehors : dedans;
      morceaux.push([coin, [coin[0] + avant[0] * k, coin[1] + avant[1] * k], [coin[0] + suivante.n[0] * k, coin[1] + suivante.n[1] * k]]);
    }
  }
  return morceaux.map(sensDirect).filter((polygone) => polygone !== null);
}
