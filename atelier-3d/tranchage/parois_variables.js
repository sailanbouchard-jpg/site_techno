/*
 * tranchage/parois_variables.js
 * ─────────────────────────────
 * Élargir une paroi là où il reste un filet de vide derrière elle.
 *
 * Les parois sont des décalages à largeur fixe. Dans une nervure de 0,9 mm ou
 * un coin aigu, la largeur ne tombe jamais juste : il reste un filet trop
 * étroit pour une ligne de plus. PrusaSlicer et OrcaSlicer font varier la
 * largeur de la paroi elle-même pour occuper exactement la place (Arachne).
 *
 * Ici, la version courte du même principe : chaque filet assez mince est mesuré
 * (épaisseur moyenne = 2 × aire ÷ périmètre), puis versé dans la paroi voisine,
 * qui est découpée en tronçons et élargie sur la longueur concernée. Ce n'est
 * pas Arachne — la largeur y varie point par point, ici par tronçon — mais ça
 * supprime le cordon séparé et la soudure manquante. Les filets trop épais pour
 * être versés gardent leur propre cordon, posé sur leur axe médian
 * (tranchage/axe_median.js).
 *
 * Deux règles qui comptent, et qui ne sautent pas aux yeux :
 *
 *   un filet n'a qu'UN propriétaire. Un filet coincé entre deux parois est à
 *   portée des deux : si chacune l'absorbe, la matière est poussée deux fois et
 *   la pièce gonfle là où elle était censée être juste comblée. Le propriétaire
 *   est donc choisi d'abord, pour toutes les parois à la fois, puis appliqué.
 *
 *   les largeurs sont LISSÉES d'un tronçon au suivant. Passer de 0,42 à 0,75 mm
 *   en 1,2 mm de tracé, c'est +80 % de débit d'un coup : l'extrudeur ne suit pas
 *   et laisse un bourrelet. Une moyenne glissante en fait une rampe.
 */

// Les tronçons de paroi élargis : assez courts pour épouser le filet, assez
// longs pour que la buse ne change pas de débit tous les millimètres.
const LONGUEUR_DE_TRONCON_MM = 1.2;
// Une paroi n'est jamais élargie au-delà de ça, en part de sa largeur : une ligne
// trop large ne s'écrase pas correctement.
const ELARGISSEMENT_MAXIMAL = 1.8;
// Les largeurs sont arrondies à ce pas : sans quoi deux tronçons voisins
// différeraient d'un millième de millimètre et ne seraient jamais recollés.
const PAS_DES_LARGEURS_MM = 0.02;
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
  return {
    aire, perimetre, boite: [x0, y0, x1, y1],
    epaisseur: perimetre > 0 ? (2 * aire) / perimetre : 0,
  };
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

/* Une moyenne glissante sur trois valeurs, pour que le débit monte en rampe. */
function lisser(largeurs) {
  if (largeurs.length < 3) return largeurs;
  return largeurs.map((l, i) => {
    const avant = largeurs[i - 1] ?? l;
    const apres = largeurs[i + 1] ?? l;
    return Math.round(((avant + l + apres) / 3) / PAS_DES_LARGEURS_MM) * PAS_DES_LARGEURS_MM;
  });
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
  // Les filets assez minces pour être versés ; les autres garderont leur cordon.
  const versables = mesures.map((m) => m.epaisseur > 0 && m.epaisseur <= espacement);

  // Chaque paroi découpée une fois pour toutes, avec le milieu de chaque tronçon.
  const parois = chemins.map((chemin) => {
    // Une paroi fermée est ouverte pour être découpée : elle repasse par son départ.
    const points = chemin.ferme ? [...chemin.points, chemin.points[0]] : chemin.points;
    if (points.length < 2) return { chemin, troncons: null, milieux: null };
    const troncons = tronconner(points, LONGUEUR_DE_TRONCON_MM);
    return { chemin, troncons, milieux: troncons.map((t) => t[Math.floor(t.length / 2)]) };
  });

  /* La distance du milieu d'un tronçon au bord d'un filet, ou Infinity s'il en est loin. */
  const ecart = (milieu, i, marge) => {
    const [bx0, by0, bx1, by1] = mesures[i].boite;
    if (milieu[0] < bx0 - marge || milieu[0] > bx1 + marge
      || milieu[1] < by0 - marge || milieu[1] > by1 + marge) return Infinity;
    return distanceAuBord(milieu, filets[i]);
  };
  /* Jusqu'où une paroi peut aller chercher un filet. */
  const portee = (chemin, i) => chemin.largeur / 2 + mesures[i].epaisseur;

  // ── Qui prend quoi ──
  // Un filet est attribué à la paroi qui passe le plus près de lui, et à elle
  // seule. Sans ce choix préalable, deux parois voisines l'absorberaient toutes
  // les deux et pousseraient deux fois la même matière.
  const proprietaire = new Int32Array(filets.length).fill(-1);
  filets.forEach((_filet, i) => {
    if (!versables[i]) return;
    let meilleur = -1;
    let mini = Infinity;
    parois.forEach((paroi, j) => {
      if (paroi.milieux === null) return;
      const marge = paroi.chemin.largeur;
      for (const milieu of paroi.milieux) {
        const d = ecart(milieu, i, marge);
        if (d < mini && d <= portee(paroi.chemin, i)) {
          mini = d;
          meilleur = j;
        }
      }
    });
    proprietaire[i] = meilleur;
  });

  const pris = new Set();
  const sortie = [];
  parois.forEach((paroi, j) => {
    const { chemin, troncons, milieux } = paroi;
    const aMoi = [];
    filets.forEach((_f, i) => {
      if (proprietaire[i] === j) aMoi.push(i);
    });
    if (troncons === null || aMoi.length === 0) {
      sortie.push(chemin);
      return;
    }

    const marge = chemin.largeur;
    const brutes = milieux.map((milieu) => {
      let ajout = 0;
      for (const i of aMoi) {
        if (ecart(milieu, i, marge) > portee(chemin, i)) continue;
        ajout = Math.max(ajout, mesures[i].epaisseur);
        pris.add(i);
      }
      return Math.min(chemin.largeur + ajout, chemin.largeur * ELARGISSEMENT_MAXIMAL);
    });
    const largeurs = lisser(brutes);

    if (largeurs.every((l) => Math.abs(l - chemin.largeur) < 1e-6)) {
      sortie.push(chemin);
      return;
    }
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
  });

  return { chemins: sortie, filetsRestants: filets.filter((_f, i) => !pris.has(i)) };
}
