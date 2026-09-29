/*
 * outils/esquisse/accrochages.js
 * ──────────────────────────────
 * Où tombe vraiment le clic. Pas de solveur de contraintes : à la place, le
 * curseur se colle aux extrémités, aux centres, aux milieux, aux tangentes,
 * aux alignements avec les points existants, à la silhouette des solides et à
 * la grille. C'est ce qui permet de dessiner juste sans poser une seule cote.
 *
 * Tout est en millimètres dans le plan de l'esquisse ; rien ici ne connaît
 * l'écran, sinon la tolérance qu'on reçoit déjà convertie.
 */

import { pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { arcDepuisBombe, distance, poigneesDArc, centresDArc } from "../../noyau/esquisse/elements_esquisse.js";

// Du plus précis au plus vague : le premier trouvé l'emporte.
export const LIBELLES = {
  origine: "origine",
  reference: "point de référence",
  axe: "sur un axe",
  extremite: "extrémité",
  centre: "centre",
  milieu: "milieu",
  tangente: "tangente",
  silhouette: "silhouette",
  alignement: "alignement",
  grille: "grille",
  libre: "",
};

// L'origine attire de plus loin que le reste : c'est le point le plus utile
// d'une esquisse, et le rater décale tout le dessin.
const ATTIRANCE_ORIGINE = 2.2;
// Un point de référence attire un peu plus qu'un point ordinaire : c'est lui qu'on vise.
const ATTIRANCE_REFERENCE = 1.5;

/*
 * Ce à quoi on peut s'accrocher dans une esquisse, préparé une fois par geste.
 * silhouette : Float32Array de segments [u1, v1, u2, v2, …] projetés sur le plan.
 * references : les points de référence des esquisses précédentes, projetés ([u, v]).
 */
export function sourcesDAccrochage(contenu, silhouette = new Float32Array(0), references = []) {
  const centres = new Set([...contenu.courbes.filter((c) => c.genre === "cercle").map((c) => c.centre), ...centresDArc(contenu)]);
  const poignees = poigneesDArc(contenu);
  // Sur la poignée d'un arc, on s'accroche à sa position, pas au point lui-même :
  // aucun trait ne doit partir de la poignée.
  const points = Object.entries(contenu.points).map(([id, uv]) => (poignees.has(id)
    ? { id: null, uv, genre: "milieu" }
    : { id, uv, genre: centres.has(id) ? "centre" : "extremite" }));
  const milieux = [];
  const cercles = [];
  for (const courbe of contenu.courbes) {
    if (courbe.genre === "cercle") {
      cercles.push({ centre: contenu.points[courbe.centre], rayon: courbe.rayon });
      continue;
    }
    const trace = pointsDeCourbe(contenu, courbe);
    if (courbe.genre === "segment") {
      const [a, b] = [trace[0], trace.at(-1)];
      milieux.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    } else if (courbe.genre === "spline") {
      milieux.push(trace[Math.floor(trace.length / 2)]);
    } else {
      milieux.push(trace[Math.floor(trace.length / 2)]);
      const arc = arcDepuisBombe(contenu.points[courbe.a], contenu.points[courbe.b], courbe.bombe);
      cercles.push({ centre: arc.centre, rayon: arc.rayon });
      // Un arc sans point de centre (tracé à l'instant) : on s'accroche quand même à son centre.
      if (!(courbe.c in contenu.points)) points.push({ id: null, uv: arc.centre, genre: "centre" });
    }
  }
  const sommetsSilhouette = [];
  for (let i = 0; i < silhouette.length; i += 2) sommetsSilhouette.push([silhouette[i], silhouette[i + 1]]);
  return { points, milieux, cercles, silhouette, sommetsSilhouette, references };
}

function lePlusProche(uv, candidats, tolerance, position = (c) => c) {
  let meilleur = null;
  let ecart = tolerance;
  for (const candidat of candidats) {
    const d = distance(uv, position(candidat));
    if (d <= ecart) {
      ecart = d;
      meilleur = candidat;
    }
  }
  return meilleur;
}

/* Les deux points où une droite partie de p touche le cercle sans le couper. */
function pointsDeTangence(p, { centre, rayon }) {
  const d = distance(p, centre);
  if (d <= rayon + 1e-9) return [];
  const angle = Math.atan2(p[1] - centre[1], p[0] - centre[0]);
  const ecart = Math.acos(rayon / d);
  return [angle + ecart, angle - ecart].map((a) => [centre[0] + rayon * Math.cos(a), centre[1] + rayon * Math.sin(a)]);
}

function projeteSurSegment(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const longueur = dx * dx + dy * dy;
  const t = longueur === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / longueur));
  return [a[0] + t * dx, a[1] + t * dy];
}

function surLaSilhouette(uv, segments, tolerance) {
  let meilleur = null;
  let ecart = tolerance;
  for (let i = 0; i < segments.length; i += 4) {
    const q = projeteSurSegment(uv, [segments[i], segments[i + 1]], [segments[i + 2], segments[i + 3]]);
    const d = distance(uv, q);
    if (d <= ecart) {
      ecart = d;
      meilleur = q;
    }
  }
  return meilleur;
}

const arrondir = (valeur, pas) => (pas > 0 ? Math.round(valeur / pas) * pas : valeur);

/*
 * options : { tolerance (mm), pasGrille (mm, 0 = sans), depuis ([u, v] du
 * point précédent, pour les tangentes et les alignements), exclus (id d'un
 * point à ignorer : celui qu'on déplace) }
 * Rend { uv, genre, idPoint, guides: [[de, a], …] }.
 */
export function accrocher(uv, sources, options) {
  const { tolerance, pasGrille = 0, depuis = null, exclus = null } = options;
  const points = sources.points.filter((p) => p.id === null || p.id !== exclus);

  // L'origine d'abord, et de plus loin : un tracé qui part de l'origine se
  // contraint tout seul, encore faut-il pouvoir l'attraper.
  if (Math.hypot(uv[0], uv[1]) <= tolerance * ATTIRANCE_ORIGINE) {
    const pose = points.find((p) => Math.hypot(p.uv[0], p.uv[1]) < 1e-9);
    return { uv: [0, 0], genre: "origine", idPoint: pose?.id ?? null, guides: [] };
  }

  // Un point de référence d'une autre esquisse : le point posé là le suivra.
  const reference = lePlusProche(uv, sources.references ?? [], tolerance * ATTIRANCE_REFERENCE);
  if (reference !== null) {
    const pose = points.find((p) => p.id !== null && distance(p.uv, reference) < 1e-9);
    return { uv: reference, genre: "reference", idPoint: pose?.id ?? null, guides: [] };
  }

  const point = lePlusProche(uv, points, tolerance, (p) => p.uv);
  if (point !== null) return { uv: point.uv, genre: point.genre, idPoint: point.id, guides: [] };

  const milieu = lePlusProche(uv, sources.milieux, tolerance);
  if (milieu !== null) return { uv: milieu, genre: "milieu", idPoint: null, guides: [] };

  if (depuis !== null) {
    const tangentes = sources.cercles.flatMap((cercle) => pointsDeTangence(depuis, cercle));
    const tangente = lePlusProche(uv, tangentes, tolerance);
    if (tangente !== null) return { uv: tangente, genre: "tangente", idPoint: null, guides: [] };
  }

  const sommet = lePlusProche(uv, sources.sommetsSilhouette, tolerance);
  if (sommet !== null) return { uv: sommet, genre: "silhouette", idPoint: null, guides: [] };

  // Alignements : la même abscisse ou la même ordonnée qu'un point existant.
  const reperes = depuis === null ? points.map((p) => p.uv) : [...points.map((p) => p.uv), depuis];
  let [u, v] = uv;
  const guides = [];
  const alignerSur = (axe) => {
    let meilleur = null;
    for (const r of reperes) {
      if (Math.abs(r[axe] - uv[axe]) <= tolerance && (meilleur === null || Math.abs(r[axe] - uv[axe]) < Math.abs(meilleur[axe] - uv[axe]))) {
        meilleur = r;
      }
    }
    return meilleur;
  };
  const verticale = alignerSur(0);
  const horizontale = alignerSur(1);
  if (verticale !== null) u = verticale[0];
  if (horizontale !== null) v = horizontale[1];

  // Sur un axe de l'esquisse : la coordonnée qui s'en approche y tombe pile.
  if (Math.abs(uv[1]) <= tolerance) return { uv: [arrondir(uv[0], pasGrille), 0], genre: "axe", idPoint: null, guides: [] };
  if (Math.abs(uv[0]) <= tolerance) return { uv: [0, arrondir(uv[1], pasGrille)], genre: "axe", idPoint: null, guides: [] };

  if (verticale === null && horizontale === null) {
    const surBord = surLaSilhouette(uv, sources.silhouette, tolerance);
    if (surBord !== null) return { uv: surBord, genre: "silhouette", idPoint: null, guides: [] };
  }

  if (verticale === null) u = arrondir(u, pasGrille);
  if (horizontale === null) v = arrondir(v, pasGrille);
  if (verticale !== null) guides.push([verticale, [u, v]]);
  if (horizontale !== null) guides.push([horizontale, [u, v]]);

  const genre = guides.length > 0 ? "alignement" : pasGrille > 0 ? "grille" : "libre";
  return { uv: [u, v], genre, idPoint: null, guides };
}
