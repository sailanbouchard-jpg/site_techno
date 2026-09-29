/*
 * tranchage/parois_variables.js
 * ─────────────────────────────
 * Élargir une paroi là où il reste un filet de vide derrière elle.
 *
 * Les parois sont des décalages à largeur fixe. Dans une nervure de 0,9 mm ou
 * un coin aigu, la largeur ne tombe jamais juste : il reste un filet trop
 * étroit pour une ligne de plus. Aujourd'hui il est comblé par des lignes
 * fines (les interstices), ce qui laisse un cordon posé à côté d'un autre,
 * mal soudé. PrusaSlicer et OrcaSlicer font autrement (Arachne) : ils font
 * varier la largeur de la paroi elle-même pour occuper exactement la place.
 *
 * Ici, la version courte du même principe : chaque filet assez mince est
 * mesuré (épaisseur moyenne = 2 × aire ÷ périmètre), puis versé dans la paroi
 * voisine, qui est découpée en tronçons et élargie sur la longueur concernée.
 * Ce n'est pas Arachne — la largeur y varie point par point, ici par tronçon —
 * mais ça supprime le cordon séparé et la soudure manquante.
 */

// Les tronçons de paroi élargis : assez courts pour épouser le filet, assez
// longs pour que la buse ne change pas de débit tous les millimètres.
const LONGUEUR_DE_TRONCON_MM = 1.2;
// Une paroi n'est jamais élargie au-delà de ça, en part de sa largeur : une ligne
// trop large ne s'écrase pas correctement.
const ELARGISSEMENT_MAXIMAL = 1.8;

const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/* Mesures d'un filet : son aire, son périmètre, sa boîte, son épaisseur moyenne. */
function mesurer(polygone) {
  let aire = 0;
  let perimetre = 0;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < polygone.length; i += 1) {
    const p = polygone[i];
    const q = polygone[(i + 1) % polygone.length];
    aire += p[0] * q[1] - q[0] * p[1];
    perimetre += distance(p, q);
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  aire = Math.abs(aire) / 2;
  return { aire, perimetre, boite: [x0, y0, x1, y1], epaisseur: perimetre > 0 ? (2 * aire) / perimetre : 0 };
}

/* La distance d'un point au bord d'un polygone. */
function distanceAuBord(point, polygone) {
  let mini = Infinity;
  for (let i = 0; i < polygone.length; i += 1) {
    const a = polygone[i];
    const b = polygone[(i + 1) % polygone.length];
    const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
    const longueur = vx * vx + vy * vy;
    const t = longueur < 1e-12 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / longueur));
    mini = Math.min(mini, distance(point, [a[0] + vx * t, a[1] + vy * t]));
  }
  return mini;
}

/* Un tracé découpé en tronçons d'au plus « pas » millimètres. */
function tronconner(points, pas) {
  const troncons = [];
  let courant = [points[0]];
  let longueur = 0;
  for (let i = 1; i < points.length; i += 1) {
    courant.push(points[i]);
    longueur += distance(points[i - 1], points[i]);
    if (longueur >= pas && i < points.length - 1) {
      troncons.push(courant);
      courant = [points[i]];
      longueur = 0;
    }
  }
  if (courant.length > 1) troncons.push(courant);
  else if (troncons.length > 0) troncons.at(-1).push(...courant.slice(1));
  return troncons;
}

/*
 * chemins   : les parois d'une couche, [{ type, largeur, points, ferme, … }]
 * filets    : les polygones des interstices ([[x, y], …])
 * espacement: l'espacement des lignes (ce qu'une ligne couvre vraiment)
 * Rend { chemins, filetsRestants } : les parois, certaines découpées en
 * tronçons plus larges, et les filets qui n'ont pas trouvé preneur.
 */
export function verserLesFiletsDansLesParois(chemins, filets, espacement) {
  const mesures = filets.map(mesurer);
  const pris = new Set();
  const sortie = [];

  for (const chemin of chemins) {
    // Une paroi fermée est ouverte pour être découpée : elle repasse par son départ.
    const points = chemin.ferme ? [...chemin.points, chemin.points[0]] : chemin.points;
    if (points.length < 2) { sortie.push(chemin); continue; }

    const troncons = tronconner(points, LONGUEUR_DE_TRONCON_MM);
    const largeurs = troncons.map((troncon) => {
      const milieu = troncon[Math.floor(troncon.length / 2)];
      let ajout = 0;
      mesures.forEach((mesure, i) => {
        // Un filet plus épais qu'une ligne se remplit à part : il n'est pas versé ici.
        if (mesure.epaisseur <= 0 || mesure.epaisseur > espacement) return;
        const [bx0, by0, bx1, by1] = mesure.boite;
        const marge = chemin.largeur;
        if (milieu[0] < bx0 - marge || milieu[0] > bx1 + marge || milieu[1] < by0 - marge || milieu[1] > by1 + marge) return;
        if (distanceAuBord(milieu, filets[i]) > chemin.largeur / 2 + mesure.epaisseur) return;
        ajout = Math.max(ajout, mesure.epaisseur);
        pris.add(i);
      });
      return Math.min(chemin.largeur + ajout, chemin.largeur * ELARGISSEMENT_MAXIMAL);
    });

    if (largeurs.every((l) => l === chemin.largeur)) { sortie.push(chemin); continue; }

    // Les tronçons voisins de même largeur sont recollés : moins de changements de débit.
    let courant = null;
    troncons.forEach((troncon, i) => {
      if (courant !== null && Math.abs(courant.largeur - largeurs[i]) < 1e-6) {
        courant.points.push(...troncon.slice(1));
        return;
      }
      courant = { ...chemin, ferme: false, largeur: largeurs[i], points: [...troncon] };
      sortie.push(courant);
    });
  }

  return { chemins: sortie, filetsRestants: filets.filter((_f, i) => !pris.has(i)) };
}
