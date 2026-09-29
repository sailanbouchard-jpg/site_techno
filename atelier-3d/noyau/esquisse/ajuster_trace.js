/*
 * noyau/esquisse/ajuster_trace.js
 * ───────────────────────────────
 * Ajuster : effacer le morceau de trait qu'on montre, jusqu'aux croisements
 * voisins — et non le trait entier. C'est ce qui permet de tracer large puis
 * de nettoyer, au lieu d'effacer et de recommencer.
 *
 * Les croisements sont cherchés sur les tracés découpés en petits segments :
 * la même fonction sert pour un segment, un arc ou un cercle, sans cas
 * particulier. Un trait sans croisement s'efface en entier.
 */

import { pointsDeCourbe } from "./contours_esquisse.js";
import { ajouterArc, ajouterSpline, supprimerCourbes, distance, bombeParTroisPoints } from "./elements_esquisse.js";

// Un morceau de courbe libre gardé repasse par autant de points, pris sur l'original.
const POINTS_DU_MORCEAU = 5;

// Deux croisements plus proches que ça sont le même : un coin où trois traits se rejoignent.
const PROCHES_MM = 1e-4;

/* Le paramètre (0 à 1) du croisement de [a, b] avec [c, d], ou null. */
function croisement(a, b, c, d) {
  const [rx, ry] = [b[0] - a[0], b[1] - a[1]];
  const [sx, sy] = [d[0] - c[0], d[1] - c[1]];
  const denominateur = rx * sy - ry * sx;
  if (Math.abs(denominateur) < 1e-12) return null;      // parallèles
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / denominateur;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / denominateur;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/* Les paramètres, le long du tracé découpé, où d'autres tracés le coupent. */
function coupures(contenu, courbe, morceaux) {
  const valeurs = [];
  const total = morceaux.length - 1;
  for (const autre of contenu.courbes) {
    if (autre.id === courbe.id) continue;
    const points = pointsDeCourbe(contenu, autre);
    for (let i = 0; i < total; i += 1) {
      for (let j = 0; j < points.length - 1; j += 1) {
        const t = croisement(morceaux[i], morceaux[i + 1], points[j], points[j + 1]);
        if (t !== null) valeurs.push((i + t) / total);
      }
    }
  }
  return valeurs.sort((a, b) => a - b);
}

/* Le point du tracé au paramètre t (0 à 1), sur son découpage. */
function pointAu(morceaux, t) {
  const total = morceaux.length - 1;
  if (t >= 1) return morceaux[total];
  const place = Math.max(0, t * total);
  const i = Math.floor(place);
  const reste = place - i;
  return [
    morceaux[i][0] + (morceaux[i + 1][0] - morceaux[i][0]) * reste,
    morceaux[i][1] + (morceaux[i + 1][1] - morceaux[i][1]) * reste,
  ];
}

/* Le paramètre du point du tracé le plus proche de uv : on projette sur
   chaque morceau, sinon un segment droit (deux points) ne donnerait que 0 ou 1. */
function parametreLePlusProche(morceaux, uv) {
  const total = morceaux.length - 1;
  let meilleur = 0;
  let ecart = Infinity;
  for (let i = 0; i < total; i += 1) {
    const [a, b] = [morceaux[i], morceaux[i + 1]];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const carre = dx * dx + dy * dy;
    const t = carre < 1e-12 ? 0 : Math.max(0, Math.min(1, ((uv[0] - a[0]) * dx + (uv[1] - a[1]) * dy) / carre));
    const d = distance([a[0] + t * dx, a[1] + t * dy], uv);
    if (d < ecart) {
      ecart = d;
      meilleur = (i + t) / total;
    }
  }
  return meilleur;
}

/*
 * Retire du tracé « idCourbe » le morceau qui passe par uv, entre les deux
 * croisements qui l'encadrent. Les morceaux gardés reprennent la courbure de
 * l'original : la moitié d'un cercle reste un demi-cercle. Rend un nouveau
 * contenu.
 */
export function ajusterAuCroisement(contenu, idCourbe, uv) {
  const courbe = contenu.courbes.find((c) => c.id === idCourbe);
  if (courbe === undefined) return contenu;

  const morceaux = pointsDeCourbe(contenu, courbe);
  const ferme = courbe.genre === "cercle" || (courbe.genre === "spline" && courbe.ferme === true);
  const trouvees = coupures(contenu, courbe, morceaux);
  // Les bouts comptent comme des limites : un segment coupé une fois garde une moitié.
  const limites = [...(ferme ? [] : [0]), ...trouvees, ...(ferme ? [] : [1])];
  if (limites.length < 2) return supprimerCourbes(contenu, [idCourbe]);

  const t = parametreLePlusProche(morceaux, uv);
  let debut = limites[0];
  let fin = limites[limites.length - 1];
  for (let i = 0; i < limites.length - 1; i += 1) {
    if (t >= limites[i] - 1e-9 && t <= limites[i + 1] + 1e-9) {
      [debut, fin] = [limites[i], limites[i + 1]];
      break;
    }
  }
  // Un cercle coupé une seule fois : le morceau montré fait tout le tour.
  if (ferme && trouvees.length < 2) return supprimerCourbes(contenu, [idCourbe]);

  // Les morceaux sont tracés avant de retirer l'original : ils reprennent ses
  // points, son centre compris, et les cotes qui les tiennent.
  let resultat = contenu;
  const droit = courbe.genre === "segment";
  const centre = courbe.genre === "cercle" ? courbe.centre : courbe.c ?? null;
  const garder = (t1, t2) => {
    if (t2 - t1 < PROCHES_MM) return;
    const [p1, p2] = [pointAu(morceaux, t1), pointAu(morceaux, t2)];
    if (distance(p1, p2) < PROCHES_MM) return;
    if (courbe.genre === "spline") {
      const passages = Array.from({ length: POINTS_DU_MORCEAU }, (_, k) => pointAu(morceaux, t1 + (t2 - t1) * (k / (POINTS_DU_MORCEAU - 1))));
      resultat = ajouterSpline(resultat, passages).contenu;
      return;
    }
    // Le morceau gardé repasse par le milieu de l'original : il garde sa courbure.
    const bombe = droit ? 0 : (bombeParTroisPoints(p1, pointAu(morceaux, (t1 + t2) / 2), p2) ?? 0);
    resultat = ajouterArc(resultat, p1, p2, bombe, droit ? null : centre).contenu;
  };
  if (ferme) {
    // Le reste du cercle : de la coupure de fin à celle de début, en faisant le tour.
    const autres = limites.filter((v) => v !== debut && v !== fin);
    garder(fin, autres.length > 0 ? Math.max(...autres) : 1);
    garder(autres.length > 0 ? Math.min(...autres) : 0, debut);
  } else {
    garder(0, debut);
    garder(fin, 1);
  }
  return supprimerCourbes(resultat, [idCourbe]);
}
