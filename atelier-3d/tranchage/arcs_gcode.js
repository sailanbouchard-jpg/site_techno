/*
 * tranchage/arcs_gcode.js
 * ───────────────────────
 * Les suites de petits segments qui suivent un cercle sont rendues telles
 * quelles : un arc G2 (sens horaire) ou G3 (sens antihoraire).
 *
 * Pourquoi : une pièce ronde découpée finement donne des dizaines de milliers
 * de G1 minuscules. Le fichier gonfle, et surtout l'imprimante lit chaque ligne
 * séparément : elle ralentit dans les courbes et le mouvement devient saccadé.
 * Un arc est une seule instruction, que le firmware parcourt d'un trait.
 *
 * La méthode est celle des trancheurs courants : on prend les points trois par
 * trois, on calcule le cercle qui passe par le premier, le milieu et le
 * dernier, et on étend tant que tous les points restent à moins de la tolérance
 * de ce cercle. En dessous de quatre points, une droite est plus courte.
 */

// Un cercle plus grand que ça est une droite : son centre part à l'infini.
const RAYON_MAXIMAL_MM = 200;
// Il faut au moins ça de points pour qu'un arc soit plus court que les segments.
const POINTS_MINIMAUX = 4;

/* Le cercle passant par trois points : { centre, rayon }, ou null s'ils sont alignés. */
function cerclePar(a, b, c) {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const na = a[0] ** 2 + a[1] ** 2;
  const nb = b[0] ** 2 + b[1] ** 2;
  const nc = c[0] ** 2 + c[1] ** 2;
  const x = (na * (b[1] - c[1]) + nb * (c[1] - a[1]) + nc * (a[1] - b[1])) / d;
  const y = (na * (c[0] - b[0]) + nb * (a[0] - c[0]) + nc * (b[0] - a[0])) / d;
  const rayon = Math.hypot(a[0] - x, a[1] - y);
  return rayon > RAYON_MAXIMAL_MM ? null : { centre: [x, y], rayon };
}

/* Le sens de parcours autour du centre : +1 antihoraire (G3), −1 horaire (G2). */
function sensDuTour(points, centre) {
  let tour = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = Math.atan2(points[i - 1][1] - centre[1], points[i - 1][0] - centre[0]);
    const b = Math.atan2(points[i][1] - centre[1], points[i][0] - centre[0]);
    let ecart = b - a;
    while (ecart > Math.PI) ecart -= 2 * Math.PI;
    while (ecart < -Math.PI) ecart += 2 * Math.PI;
    tour += ecart;
  }
  return tour >= 0 ? 1 : -1;
}

/* La longueur parcourue sur l'arc, pour savoir combien de matière y pousser. */
function longueurDArc(points, centre, rayon) {
  let angle = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = Math.atan2(points[i - 1][1] - centre[1], points[i - 1][0] - centre[0]);
    const b = Math.atan2(points[i][1] - centre[1], points[i][0] - centre[0]);
    let ecart = b - a;
    while (ecart > Math.PI) ecart -= 2 * Math.PI;
    while (ecart < -Math.PI) ecart += 2 * Math.PI;
    angle += Math.abs(ecart);
  }
  return angle * rayon;
}

/*
 * Découpe un tracé en morceaux : des droites et des arcs.
 * Rend [{ arc: false, points }] ou [{ arc: true, points, centre, sens, longueur }],
 * les points de chaque morceau commençant par le dernier point du précédent.
 */
export function regrouperEnArcs(points, tolerance) {
  const morceaux = [];
  let debut = 0;
  while (debut < points.length - 1) {
    let meilleur = null;
    // On étend tant que le cercle passant par les trois points repères tient tout le monde.
    for (let fin = debut + POINTS_MINIMAUX - 1; fin < points.length; fin += 1) {
      const tranche = points.slice(debut, fin + 1);
      const cercle = cerclePar(tranche[0], tranche[Math.floor(tranche.length / 2)], tranche.at(-1));
      if (cercle === null) break;
      const surLeCercle = tranche.every((p) => Math.abs(Math.hypot(p[0] - cercle.centre[0], p[1] - cercle.centre[1]) - cercle.rayon) <= tolerance);
      // Les sommets d'un carré sont eux aussi sur un même cercle : ce qui distingue
      // un arc, c'est que la corde de chaque segment ne s'en écarte pas non plus.
      const cordesSerrees = tranche.every((p, i) => {
        if (i === 0) return true;
        const corde = Math.hypot(p[0] - tranche[i - 1][0], p[1] - tranche[i - 1][1]);
        const demi = Math.min(corde / 2, cercle.rayon);
        return cercle.rayon - Math.sqrt(cercle.rayon ** 2 - demi ** 2) <= tolerance;
      });
      if (!surLeCercle || !cordesSerrees) break;
      meilleur = { fin, cercle, points: tranche };
    }
    if (meilleur === null) {
      // Pas d'arc ici : une droite jusqu'au point suivant.
      const dernier = morceaux.at(-1);
      if (dernier !== undefined && !dernier.arc) dernier.points.push(points[debut + 1]);
      else morceaux.push({ arc: false, points: [points[debut], points[debut + 1]] });
      debut += 1;
      continue;
    }
    morceaux.push({
      arc: true,
      points: meilleur.points,
      centre: meilleur.cercle.centre,
      sens: sensDuTour(meilleur.points, meilleur.cercle.centre),
      longueur: longueurDArc(meilleur.points, meilleur.cercle.centre, meilleur.cercle.rayon),
    });
    debut = meilleur.fin;
  }
  return morceaux;
}
