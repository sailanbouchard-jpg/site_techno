/*
 * noyau/esquisse/solides_par_sections.js
 * ──────────────────────────────────────
 * Les solides qu'on ne fait pas en poussant un profil tout droit : on les
 * décrit par une suite de sections — chacune a les mêmes boucles, avec le même
 * nombre de points — et on relie chaque section à la suivante.
 *   - balayage : un profil qui suit un chemin ;
 *   - lissage : des profils différents, enchaînés d'une esquisse à l'autre ;
 *   - hélice : un profil qui tourne en montant (ressort, filetage).
 *
 * Tout est du calcul pur, sauf solideParSections qui confie le maillage au
 * moteur : les mêmes sections servent à estimer la boîte du solide avant tout
 * calcul, dans le fil principal.
 *
 * Une section : { boucles: [[[x, y, z], …], …], plan?: [[[u, v], …], …] }.
 * plan : les mêmes boucles à plat, dans leur esquisse ; seules la première et
 * la dernière section en ont besoin, pour fermer les bouts.
 */

import { analyserEsquisse, contoursPourUnion } from "./contours_esquisse.js";
import { appliquerAuPoint } from "../transformations.js";

const EGALITE_MM = 1e-6;
// Dans un coude, le profil s'élargit pour que les deux tronçons se rejoignent ;
// au-delà de ce facteur (coude très fermé), on le borne.
const ONGLET_MAX = 4;
// Un point où le contour tourne de plus de ~30° est un coin, qui sert d'ancre.
const SEUIL_DE_COIN = 1 / 3;
// Le poids, dans l'appariement, de relier un coin à un point sans angle (formes de taille 1).
const POIDS_DES_COINS = 4;
// Pour l'appariement, chaque boucle est recoupée en au moins autant de points sur son tour.
const POINTS_PAR_BOUCLE = 96;
// Pour aligner deux boucles de lissage, on les compare sur ce nombre de points.
const POINTS_DE_COMPARAISON = 64;
// Une torsion se découpe en pas de 5° au plus : le profil tourne sans facettes.
const DEGRES_PAR_PAS = 5;
// Au-delà de ~10° entre deux tronçons, un point du chemin est un coude franc.
const COS_COUDE = Math.cos(Math.PI / 18);
// Entre deux sections d'un lissage lissé, autant de sections intermédiaires.
const SUBDIVISIONS_DU_LISSAGE = 12;
// Une courbe guide est suivie pas à pas, en autant de points.
const POINTS_DU_GUIDE = 240;

// ── Vecteurs ────────────────────────────────────────────────────────────────

const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const moins = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const fois = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vect = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norme = (a) => Math.hypot(a[0], a[1], a[2]);
const unitaire = (a) => {
  const n = norme(a);
  return n < 1e-12 ? [0, 0, 0] : fois(a, 1 / n);
};

/* Tourne v autour de l'axe unitaire k, d'un angle en radians. */
function tourner(v, k, angle) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return plus(plus(fois(v, c), fois(vect(k, v), s)), fois(k, scal(k, v) * (1 - c)));
}

/* Aire signée d'une boucle plane : positive dans le sens direct. */
export function aire2d(boucle) {
  let somme = 0;
  for (let i = 0; i < boucle.length; i += 1) {
    const [a, b] = [boucle[i], boucle[(i + 1) % boucle.length]];
    somme += a[0] * b[1] - b[0] * a[1];
  }
  return somme / 2;
}

const versLeMonde = (matrice, boucles) => boucles.map((b) => b.map(([u, v]) => appliquerAuPoint(matrice, [u, v, 0])));

// ── Profils et chemins ──────────────────────────────────────────────────────

/* Les boucles d'un profil, orientées pour le remplissage : contours dans le
   sens direct, trous dans l'autre. atelier : le moteur les nettoie (points
   doublés, recouvrements) ; sans lui, on prend les tracés tels quels. */
export function bouclesDuProfil(fermes, atelier = null) {
  if (fermes.length === 0) return [];
  const orientees = contoursPourUnion(fermes);
  if (atelier === null) return orientees;
  return new atelier.CrossSection(orientees, "Positive").toPolygons();
}

function sansDoublons(points, ferme) {
  const propres = [];
  for (const p of points) {
    if (propres.length === 0 || norme(moins(p, propres[propres.length - 1])) > EGALITE_MM) propres.push(p);
  }
  if (ferme && propres.length > 1 && norme(moins(propres[0], propres[propres.length - 1])) < EGALITE_MM) propres.pop();
  return propres;
}

/* Le chemin d'un balayage : l'unique tracé de son esquisse, dans le monde.
   Rend { points, ferme }. */
export function cheminDeLEsquisse(contenu, matrice) {
  const { fermes, ouverts } = analyserEsquisse(contenu);
  const nombre = fermes.length + ouverts.length;
  if (nombre === 0) throw new Error("l'esquisse du chemin ne contient aucun tracé.");
  if (nombre > 1) {
    throw new Error("le chemin doit être un seul tracé continu ; son esquisse en contient " + nombre + ". Relier les morceaux ou passer les autres en traits d'aide.");
  }
  const ferme = fermes.length === 1;
  const plats = (ferme ? fermes[0] : ouverts[0]).map(([u, v]) => appliquerAuPoint(matrice, [u, v, 0]));
  const points = sansDoublons(plats, ferme);
  if (points.length < 2) throw new Error("le chemin est trop court.");
  return { points, ferme };
}

// ── Repères le long d'un chemin ─────────────────────────────────────────────

/*
 * Pour chaque point du chemin : { p, t, r, s, u, onglet }. t : la tangente ;
 * r et s complètent le repère, transportés d'un point à l'autre sans tourner
 * autour de t (méthode de la double réflexion) — le profil ne vrille pas tout
 * seul. u : la part du chemin parcourue, de 0 à 1. onglet : dans un coude,
 * l'axe selon lequel le profil s'étire pour que les deux tronçons se
 * rejoignent sans pincement, et de combien.
 */
export function reperesDuChemin({ points, ferme }) {
  const n = points.length;
  const nombreDeTroncons = ferme ? n : n - 1;
  const troncons = [];
  for (let i = 0; i < nombreDeTroncons; i += 1) troncons.push(moins(points[(i + 1) % n], points[i]));
  const directions = troncons.map(unitaire);
  const cumul = [0];
  for (const t of troncons) cumul.push(cumul[cumul.length - 1] + norme(t));
  const total = cumul[cumul.length - 1] || 1;

  const tangentes = points.map((_, i) => {
    const entree = ferme ? directions[(i - 1 + n) % n] : directions[i - 1];
    const sortie = directions[i];
    if (entree === undefined) return sortie;
    if (sortie === undefined) return entree;
    const moyenne = unitaire(plus(entree, sortie));
    return norme(moyenne) < 0.5 ? sortie : moyenne;
  });
  const onglets = points.map((_, i) => {
    const entree = ferme ? directions[(i - 1 + n) % n] : directions[i - 1];
    const sortie = directions[i];
    if (entree === undefined || sortie === undefined) return null;
    const axe = unitaire(moins(sortie, entree));
    if (norme(axe) < 0.5) return null;
    const cosDemi = Math.max(scal(tangentes[i], sortie), 1 / ONGLET_MAX);
    return { axe, facteur: 1 / cosDemi };
  });

  // Le premier r : le haut du monde vu en travers du chemin (ou l'axe X pour
  // un départ vertical) — un profil placé au départ garde son haut en haut.
  const t0 = tangentes[0];
  const appui = Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const rs = [unitaire(moins(appui, fois(t0, scal(appui, t0))))];
  const transporter = (r, t, depuis, vers, tVers) => {
    const v1 = moins(vers, depuis);
    const c1 = scal(v1, v1);
    if (c1 < 1e-18) return r;
    const rL = moins(r, fois(v1, (2 / c1) * scal(v1, r)));
    const tL = moins(t, fois(v1, (2 / c1) * scal(v1, t)));
    const v2 = moins(tVers, tL);
    const c2 = scal(v2, v2);
    return c2 < 1e-18 ? rL : moins(rL, fois(v2, (2 / c2) * scal(v2, rL)));
  };
  for (let i = 0; i < n - 1; i += 1) rs.push(transporter(rs[i], tangentes[i], points[i], points[i + 1], tangentes[i + 1]));

  // Chemin fermé : revenu au départ, le repère a tourné d'un angle ; on le
  // rattrape peu à peu tout le long, pour que la fin rejoigne le début.
  if (ferme) {
    const retour = transporter(rs[n - 1], tangentes[n - 1], points[n - 1], points[0], t0);
    const ecart = Math.atan2(scal(t0, vect(rs[0], retour)), scal(rs[0], retour));
    for (let i = 1; i < n; i += 1) rs[i] = tourner(rs[i], tangentes[i], -ecart * (cumul[i] / total));
  }

  return points.map((p, i) => {
    const t = tangentes[i];
    const r = unitaire(moins(rs[i], fois(t, scal(rs[i], t))));
    return { p, t, r, s: vect(t, r), u: cumul[i] / total, onglet: onglets[i] };
  });
}

// ── Balayage ────────────────────────────────────────────────────────────────

/* Des points ajoutés le long des tronçons, pour qu'il y en ait au moins
   nombre en tout : une torsion sur un chemin droit a besoin d'étapes. Près
   d'un coude vif (à moins de marge), on n'en ajoute pas : la section y
   déborderait du plan de l'onglet et le tube se replierait. */
function densifier({ points, ferme }, nombre, marge = 0) {
  const n = points.length;
  const troncons = ferme ? n : n - 1;
  const longueurs = [];
  for (let i = 0; i < troncons; i += 1) longueurs.push(norme(moins(points[(i + 1) % n], points[i])));
  const total = longueurs.reduce((a, b) => a + b, 0) || 1;
  const direction = (i) => unitaire(moins(points[(i + 1) % n], points[i]));
  const coude = (i) => {
    // Le point i est-il un coude franc (plus de ~10°) ?
    if (!ferme && (i === 0 || i === n - 1)) return false;
    return scal(direction((i - 1 + n) % n), direction(i % n)) < COS_COUDE;
  };
  const denses = [];
  for (let i = 0; i < troncons; i += 1) {
    const [a, b] = [points[i], points[(i + 1) % n]];
    const parts = Math.max(1, Math.ceil(nombre * longueurs[i] / total));
    const [margeA, margeB] = [coude(i) ? marge : 0, coude((i + 1) % n) ? marge : 0];
    denses.push(a);
    for (let k = 1; k < parts; k += 1) {
      const d = longueurs[i] * k / parts;
      if (d > margeA && longueurs[i] - d > margeB) denses.push(plus(a, fois(moins(b, a), k / parts)));
    }
  }
  if (!ferme) denses.push(points[n - 1]);
  return { points: denses, ferme };
}

/*
 * Le profil (ses boucles à plat et le plan de son esquisse) suit le chemin.
 * options : {
 *   placement: "depart"  le centre du profil est posé au départ du chemin, en
 *                        travers, son haut vers le haut : on peut le dessiner
 *                        n'importe où, sur n'importe quel plan ;
 *              "dessine" il reste où il a été dessiné, et garde ensuite la même
 *                        position par rapport au chemin ;
 *   orientation: "suivre" | "parallele", torsion (degrés, sur tout le chemin),
 *   echelleFin (%, la taille du profil à l'arrivée) }.
 * Sur un chemin fermé, la torsion n'est gardée que par tours entiers et
 * l'échelle reste à 100 %. Un profil trop grand pour un coude trop serré se
 * replierait sur lui-même : c'est refusé, avec l'endroit.
 */
export function sectionsDuBalayage(boucles2D, matriceProfil, chemin, options) {
  if (boucles2D.length === 0) throw new Error("le profil n'a aucun contour fermé.");
  const suit = options.orientation !== "parallele";
  const echelle = chemin.ferme ? 1 : (options.echelleFin ?? 100) / 100;
  const torsion = chemin.ferme ? 360 * Math.round((options.torsion ?? 0) / 360) : (options.torsion ?? 0);
  // La plus grande distance du profil à son centre : la marge à garder près des coudes.
  const tous = boucles2D.flat();
  const [cu, cv] = [0, 1].map((k) => (Math.min(...tous.map((q) => q[k])) + Math.max(...tous.map((q) => q[k]))) / 2);
  const rayonDuProfil = Math.max(...tous.map(([u, v]) => Math.hypot(u - cu, v - cv)));
  const stations = reperesDuChemin(torsion === 0 ? chemin : densifier(chemin, Math.ceil(Math.abs(torsion) / DEGRES_PAR_PAS), rayonDuProfil));
  const depart = stations[0];
  let locaux;
  if (options.placement === "dessine") {
    locaux = versLeMonde(matriceProfil, boucles2D).map((b) => b.map((X) => {
      const d = moins(X, depart.p);
      return [scal(d, depart.t), scal(d, depart.r), scal(d, depart.s)];
    }));
  } else {
    // Vu depuis l'arrière du départ : le haut du profil (v) vers r, sa droite (u) vers s.
    locaux = boucles2D.map((b) => b.map(([u, v]) => [0, v - cv, u - cu]));
  }

  const sections = stations.map((station) => {
    const repere = suit ? station : depart;
    const k = 1 + (echelle - 1) * station.u;
    const angle = (torsion * Math.PI / 180) * station.u;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    return {
      boucles: locaux.map((b) => b.map(([lt, lr, ls]) => {
        const a = k * (lr * c - ls * s);
        const q = k * (lr * s + ls * c);
        let X = plus(station.p, plus(fois(repere.t, lt), plus(fois(repere.r, a), fois(repere.s, q))));
        if (suit && station.onglet !== null) {
          const d = moins(X, station.p);
          X = plus(X, fois(station.onglet.axe, (station.onglet.facteur - 1) * scal(d, station.onglet.axe)));
        }
        return X;
      })),
    };
  });
  if (suit) verifierLesPlis(sections, stations, chemin.ferme);
  sections[0].plan = boucles2D;
  sections[sections.length - 1].plan = boucles2D;
  return sections;
}

/* Deux sections voisines ne doivent pas se croiser : chaque point de la
   suivante est devant le plan de la précédente, et inversement. Sinon le
   tube se replie (coude plus serré que le profil n'est large). */
function verifierLesPlis(sections, stations, ferme) {
  const taille = norme(moins(...Object.values(boiteDesSections(sections)))) || 1;
  const marge = -1e-4 * taille;
  const paires = ferme ? sections.length : sections.length - 1;
  for (let i = 0; i < paires; i += 1) {
    const j = (i + 1) % sections.length;
    const [a, b] = [stations[i], stations[j]];
    const avance = (X, st) => scal(moins(X, st.p), st.t);
    const replie = sections[j].boucles.flat().some((X) => avance(X, a) < marge)
      || sections[i].boucles.flat().some((X) => avance(X, b) > -marge);
    if (replie) {
      const [x, y, z] = a.p.map((c) => Math.round(c * 10) / 10);
      throw new Error("le profil se replie sur lui-même près du point (" + [x, y, z].join(" ; ").replace(/\./g, ",")
        + ") : le chemin y tourne plus serré que le profil n'est large. Élargir le coude (arrondi plus grand) ou réduire le profil.");
    }
  }
}

// ── Lissage ─────────────────────────────────────────────────────────────────

/* Une boucle plane parcourue à vitesse constante : point(t), t de 0 à 1, et
   les paramètres de ses sommets. */
function parcours(boucle) {
  const n = boucle.length;
  const cumul = [0];
  for (let i = 0; i < n; i += 1) {
    const [a, b] = [boucle[i], boucle[(i + 1) % n]];
    cumul.push(cumul[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cumul[n] || 1;
  const params = cumul.slice(0, n).map((c) => c / total);
  return {
    params,
    point(t) {
      const cible = (((t % 1) + 1) % 1) * total;
      let i = 0;
      while (i < n - 1 && cumul[i + 1] < cible) i += 1;
      const longueur = cumul[i + 1] - cumul[i];
      const f = longueur < 1e-12 ? 0 : (cible - cumul[i]) / longueur;
      const [a, b] = [boucle[i], boucle[(i + 1) % n]];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    },
  };
}

const centreDe = (points) => fois(points.reduce((s, p) => plus(s, p), [0, 0, 0]), 1 / points.length);
const centrer = (points) => {
  const c = centreDe(points);
  return points.map((p) => moins(p, c));
};

/* Les boucles d'une section rangées comme celles de la précédente : un
   contour avec un contour, un trou avec le trou le plus proche. */
function apparier(precedente, suivante, numero) {
  if (precedente.length !== suivante.length) {
    throw new Error("chaque esquisse d'un lissage doit avoir autant de contours et de trous : la section " + numero
      + " en a " + suivante.length + ", la précédente " + precedente.length + ".");
  }
  const centreA = centreDe(precedente.map((b) => b.centre));
  const centreB = centreDe(suivante.map((b) => b.centre));
  const libres = new Set(suivante.keys());
  return precedente.map((a) => {
    let meilleure = null;
    let ecart = Infinity;
    for (const j of libres) {
      const b = suivante[j];
      if (Math.sign(b.aire) !== Math.sign(a.aire)) continue;
      const d = norme(moins(moins(b.centre, centreB), moins(a.centre, centreA)));
      if (d < ecart) {
        ecart = d;
        meilleure = j;
      }
    }
    if (meilleure === null) {
      throw new Error("les esquisses d'un lissage doivent avoir la même forme de contours : autant de trous dans chacune (section " + numero + ").");
    }
    libres.delete(meilleure);
    return suivante[meilleure];
  });
}

/* Une forme ramenée à son centre et à sa taille : on compare des formes, pas des positions ni des tailles. */
function normaliser(points) {
  const centres = centrer(points);
  const taille = Math.sqrt(centres.reduce((acc, q) => acc + scal(q, q), 0) / Math.max(centres.length, 1)) || 1;
  return centres.map((q) => fois(q, 1 / taille));
}

const enMonde = (boucle, matrice) => boucle.map(([u, v]) => appliquerAuPoint(matrice, [u, v, 0]));

/* La boucle dans le sens choisi (depart : où la parcourir en premier, de 0 à 1). */
function orienter(plat, { inverse, depart }) {
  return { boucle: inverse ? [...plat].reverse() : plat, depart };
}

/* La même boucle, qui commence au point de paramètre t (ajouté s'il tombe au milieu d'un côté). */
function commencerA(boucle, t) {
  const n = boucle.length;
  const cumul = [0];
  for (let i = 0; i < n; i += 1) {
    const [a, b] = [boucle[i], boucle[(i + 1) % n]];
    cumul.push(cumul[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const cible = ((((t % 1) + 1) % 1)) * cumul[n];
  let i = 0;
  while (i < n - 1 && cumul[i + 1] <= cible) i += 1;
  const l = cumul[i + 1] - cumul[i];
  const f = l < 1e-12 ? 0 : (cible - cumul[i]) / l;
  const [a, b] = [boucle[i], boucle[(i + 1) % n]];
  const P = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  const suite = [];
  for (let k = 1; k <= n; k += 1) suite.push(boucle[(i + k) % n]);
  // Le point de départ, puis le tour complet ; s'il est sur un sommet, pas de doublon.
  const proche = (q) => Math.hypot(q[0] - P[0], q[1] - P[1]) < 1e-9;
  const reste = suite.filter((q, k) => !(proche(q) && (k === 0 || k === suite.length - 1)));
  return [P, ...reste];
}

/* La boucle, ses longs côtés recoupés : l'appariement a besoin de points où s'accrocher le long d'un côté droit. */
function redecouper(boucle) {
  const n = boucle.length;
  let perimetre = 0;
  for (let i = 0; i < n; i += 1) perimetre += Math.hypot(boucle[(i + 1) % n][0] - boucle[i][0], boucle[(i + 1) % n][1] - boucle[i][1]);
  const pas = perimetre / POINTS_PAR_BOUCLE;
  const resultat = [];
  for (let i = 0; i < n; i += 1) {
    const [a, b] = [boucle[i], boucle[(i + 1) % n]];
    resultat.push(a);
    const morceaux = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / pas);
    for (let k = 1; k < morceaux; k += 1) resultat.push([a[0] + (b[0] - a[0]) * k / morceaux, a[1] + (b[1] - a[1]) * k / morceaux]);
  }
  return resultat;
}

/* En chaque point d'une boucle, combien elle tourne : 0 sur une partie droite
   ou douce, 1 dans un angle droit (au plus). Les points répétés sont sautés. */
function vivacites(points) {
  const n = points.length;
  const voisin = (i, sens) => {
    for (let k = 1; k < n; k += 1) {
      const q = points[(i + sens * k + n * k) % n];
      if (norme(moins(q, points[i])) > 1e-9) return q;
    }
    return points[i];
  };
  return points.map((p, i) => {
    const [u, v] = [unitaire(moins(p, voisin(i, -1))), unitaire(moins(voisin(i, 1), p))];
    const angle = Math.acos(Math.max(-1, Math.min(1, scal(u, v))));
    return Math.min(1, angle / (Math.PI / 2));
  });
}

/*
 * L'appariement dynamique de deux boucles qui commencent ensemble (A[0] avec
 * B[0]) : le chemin qui les parcourt toutes les deux, pas à pas, en avançant
 * sur l'une, sur l'autre ou sur les deux, et qui rapproche le plus les points
 * reliés. Un coin peut ainsi se relier à tout un arrondi, un côté à un arc.
 * Rend les paires [i, j], du début à la fin des deux boucles.
 */
function apparierDynamiquement(A, B) {
  const [n, m] = [A.length, B.length];
  // Relier un coin à un coin est préféré : sans ça, deux formes de proportions
  // différentes (un carré, un rectangle) ne mettraient pas leurs angles face à face.
  const [vifA, vifB] = [vivacites(A), vivacites(B)];
  const cout = (i, j) => {
    const d = moins(A[i], B[j]);
    const v = vifA[i] - vifB[j];
    return scal(d, d) + POIDS_DES_COINS * v * v;
  };
  const D = new Float64Array(n * m);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      let meilleur;
      if (i === 0 && j === 0) meilleur = 0;
      else {
        meilleur = Infinity;
        if (i > 0) meilleur = Math.min(meilleur, D[(i - 1) * m + j]);
        if (j > 0) meilleur = Math.min(meilleur, D[i * m + j - 1]);
        if (i > 0 && j > 0) meilleur = Math.min(meilleur, D[(i - 1) * m + j - 1]);
      }
      D[i * m + j] = meilleur + cout(i, j);
    }
  }
  const chemin = [[n - 1, m - 1]];
  let [i, j] = [n - 1, m - 1];
  while (i > 0 || j > 0) {
    const candidats = [];
    if (i > 0 && j > 0) candidats.push([i - 1, j - 1]);
    if (i > 0) candidats.push([i - 1, j]);
    if (j > 0) candidats.push([i, j - 1]);
    [i, j] = candidats.reduce((x, y) => (D[y[0] * m + y[1]] < D[x[0] * m + x[1]] ? y : x));
    chemin.push([i, j]);
  }
  return { chemin: chemin.reverse(), cout, vifA, vifB };
}

/* Les longueurs cumulées d'une suite fermée de points : cumul[k] du point 0 au point k, cumul[n] le tour. */
function longueurs(points) {
  const cumul = [0];
  for (let k = 0; k < points.length; k += 1) {
    const [a, b] = [points[k], points[(k + 1) % points.length]];
    cumul.push(cumul[k] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return cumul;
}

/* Sur une suite fermée, du rang debut au rang fin (fin > debut, au plus le
   tour complet) : l'indice fractionnaire du point à la fraction f de la longueur. */
function versIndice(cumul, debut, fin, f) {
  const cible = cumul[debut] + f * (cumul[fin] - cumul[debut]);
  for (let k = debut; k < fin; k += 1) {
    if (cible <= cumul[k + 1] + 1e-12 || k === fin - 1) {
      const l = cumul[k + 1] - cumul[k];
      return k + (l < 1e-12 ? 0 : Math.max(0, Math.min(1, (cible - cumul[k]) / l)));
    }
  }
  return debut;
}

/* Les fractions (0 à 1) des sommets d'un tronçon, du rang debut au rang fin exclu. */
function fractionsDuTroncon(cumul, debut, fin) {
  const longueur = cumul[fin] - cumul[debut];
  const fractions = [];
  for (let k = debut; k < fin; k += 1) fractions.push(longueur < 1e-12 ? (k - debut) / (fin - debut) : (cumul[k] - cumul[debut]) / longueur);
  return fractions;
}

/* Le point d'une suite fermée à un indice fractionnaire. */
function aLIndice(points, x) {
  const n = points.length;
  const k = Math.floor(x);
  const f = x - k;
  const [a, b] = [points[((k % n) + n) % n], points[(((k + 1) % n) + n) % n]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/*
 * Une nouvelle section accrochée aux précédentes. L'appariement dynamique
 * désigne des ancres : chaque coin, d'un côté ou de l'autre, retient le point
 * d'en face qui lui correspond le mieux. Entre deux ancres, les deux contours
 * sont parcourus à proportion de leur longueur : pas d'éventail, et un coin
 * tombe sur un coin quand il y en a un. suites : les sections précédentes, déjà
 * mises en correspondance (même nombre de points) ; rend toutes les suites,
 * la nouvelle comprise.
 */
function accrocher(suitesDonnees, matricePrecedente, nouvelleDonnee, matriceNouvelle) {
  // Le départ commun : un coin de la section précédente s'il y en a, et le point
  // de la nouvelle qui lui ressemble le plus (proche, et coin aussi si possible).
  const tourner = (suite, k) => [...suite.slice(k), ...suite.slice(0, k)];
  const vifsPrecedents = vivacites(normaliser(enMonde(suitesDonnees[suitesDonnees.length - 1], matricePrecedente)));
  const coin = vifsPrecedents.reduce((m, v, k) => (v > vifsPrecedents[m] + 1e-9 ? k : m), 0);
  const suites = suitesDonnees.map((suite) => tourner(suite, vifsPrecedents[coin] >= SEUIL_DE_COIN ? coin : 0));
  const derniere = suites[suites.length - 1];
  const A = normaliser(enMonde(derniere, matricePrecedente));
  const B0 = normaliser(enMonde(nouvelleDonnee, matriceNouvelle));
  const vifsB0 = vivacites(B0);
  const vif0 = vivacites(A)[0];
  const depart = B0.reduce((m, q, k) => {
    const cout = (x) => scal(moins(A[0], B0[x]), moins(A[0], B0[x])) + POIDS_DES_COINS * (vif0 - vifsB0[x]) ** 2;
    return cout(k) < cout(m) ? k : m;
  }, 0);
  const nouvelle = tourner(nouvelleDonnee, depart);
  const B = normaliser(enMonde(nouvelle, matriceNouvelle));
  const { chemin, cout, vifA, vifB } = apparierDynamiquement(A, B);
  // Pour chaque coin, la paire la moins chère du chemin qui le touche.
  const meilleures = new Map();
  for (const [i, j] of chemin) {
    for (const [cle, vif] of [["a" + i, vifA[i]], ["b" + j, vifB[j]]]) {
      if (vif < SEUIL_DE_COIN) continue;
      const c = cout(i, j);
      if (!meilleures.has(cle) || c < meilleures.get(cle).c) meilleures.set(cle, { i, j, c });
    }
  }
  const candidates = [{ i: 0, j: 0, c: -1 }, ...meilleures.values()].sort((x, y) => x.i - y.i || x.j - y.j);
  // Les ancres doivent avancer ensemble sur les deux contours.
  const ancres = [];
  for (const a of candidates) {
    const precedente = ancres[ancres.length - 1];
    if (precedente === undefined) ancres.push(a);
    else if (a.i > precedente.i && a.j > precedente.j) ancres.push(a);
    else if (a.i === precedente.i || a.j === precedente.j) {
      if (a.c < precedente.c && ancres.length > 1) ancres[ancres.length - 1] = a;
    }
  }
  const [cumulA, cumulB] = [longueurs(derniere), longueurs(nouvelle)];
  const [nA, nB] = [derniere.length, nouvelle.length];
  const sortie = suites.map(() => []);
  const nouvelleSortie = [];
  ancres.forEach((ancre, k) => {
    const suivante = ancres[k + 1] ?? { i: nA, j: nB };
    const fractions = [...fractionsDuTroncon(cumulA, ancre.i, suivante.i), ...fractionsDuTroncon(cumulB, ancre.j, suivante.j)].sort((x, y) => x - y)
      .filter((f, r, liste) => r === 0 || f - liste[r - 1] > 1e-7);
    for (const f of fractions) {
      const x = versIndice(cumulA, ancre.i, suivante.i, f);
      suites.forEach((suite, s) => sortie[s].push(aLIndice(suite, x)));
      nouvelleSortie.push(aLIndice(nouvelle, versIndice(cumulB, ancre.j, suivante.j, f)));
    }
  });
  return [...sortie, nouvelleSortie];
}



/* À vitesse constante : on compare les deux boucles sur des points
   régulièrement répartis, pour chaque point de départ possible. */
function meilleurDepart(precedente, reglagePrecedent, boucle, inverse) {
  const echantillons = (plat, matrice, reglage) => {
    const { boucle: b, depart } = orienter(plat, reglage);
    const p = parcours(b);
    return normaliser(Array.from({ length: POINTS_DE_COMPARAISON }, (_, j) => appliquerAuPoint(matrice, [...p.point(j / POINTS_DE_COMPARAISON + depart), 0])));
  };
  const reference = echantillons(precedente.plat, precedente.matrice, reglagePrecedent);
  let meilleur = { cout: Infinity, depart: 0 };
  for (let d = 0; d < POINTS_DE_COMPARAISON; d += 1) {
    const essai = echantillons(boucle.plat, boucle.matrice, { inverse, depart: d / POINTS_DE_COMPARAISON });
    const cout = essai.reduce((somme, q, j) => somme + scal(moins(q, reference[j]), moins(q, reference[j])), 0);
    if (cout < meilleur.cout) meilleur = { cout, depart: d / POINTS_DE_COMPARAISON };
  }
  return meilleur;
}

/*
 * Des profils dessinés dans plusieurs esquisses, enchaînés dans l'ordre.
 * sources : [{ boucles2D, matrice }]. raccord : "lisse" (une courbe douce
 * passe par toutes les sections) ou "droit" (des faces planes de l'une à la
 * suivante). Les boucles de chaque section sont alignées sur la précédente :
 * même sens de parcours, même point de départ, pour que la surface ne vrille pas.
 * options : { guide: chemin (voir cheminDeLEsquisse) que la surface suit,
 * boucle: la dernière section rejoint la première (anneau, sans bouchons) }.
 */
export function sectionsDuLissage(sources, raccord, options = {}) {
  if (sources.length < 2) throw new Error("un lissage demande au moins deux esquisses.");
  sources.forEach((source, i) => {
    if (source.boucles2D.length === 0) throw new Error("la section " + (i + 1) + " n'a aucun contour fermé.");
  });
  const decrire = ({ boucles2D, matrice }) => boucles2D.map((plat) => ({
    plat, matrice, aire: aire2d(plat), centre: centreDe(versLeMonde(matrice, [plat])[0]),
  }));

  // Les pistes : une boucle par section, appariées de proche en proche.
  const sections = [decrire(sources[0])];
  for (let i = 1; i < sources.length; i += 1) sections.push(apparier(sections[i - 1], decrire(sources[i]), i + 1));

  // Le sens et le point de départ de chaque boucle, sur ceux de la précédente.
  const principale = sections[0].reduce((m, b, j) => (Math.abs(b.aire) > Math.abs(sections[0][m].aire) ? j : m), 0);
  const reglages = sections.map((boucles) => boucles.map(() => ({ inverse: false, depart: 0 })));
  for (let i = 1; i < sections.length; i += 1) {
    // Le sens se décide sur le contour principal, et vaut pour toute la section.
    const essayer = (j, inverse) => meilleurDepart(sections[i - 1][j], reglages[i - 1][j], sections[i][j], inverse);
    const droit = essayer(principale, false);
    const retourne = essayer(principale, true);
    const inverse = retourne.cout < droit.cout;
    sections[i].forEach((_, j) => {
      const choix = j === principale ? (inverse ? retourne : droit) : essayer(j, inverse);
      reglages[i][j] = { inverse, depart: choix.depart };
    });
  }

  // Puis, piste par piste, l'appariement dynamique de proche en proche : chaque
  // section s'accroche à la précédente, et les précédentes suivent (un point
  // qui « attend » est répété).
  const plates = sections.map((boucles) => boucles.map(() => null));
  sections[0].forEach((_, j) => {
    const decoupees = sections.map((boucles, i) => {
      const { boucle, depart } = orienter(boucles[j].plat, reglages[i][j]);
      return redecouper(commencerA(boucle, depart));
    });
    let suites = [decoupees[0]];
    for (let i = 1; i < sections.length; i += 1) {
      suites = accrocher(suites, sections[i - 1][j].matrice, decoupees[i], sections[i][j].matrice);
    }
    suites.forEach((suite, i) => { plates[i][j] = suite; });
  });
  const posees = plates.map((boucles, i) => versLeMonde(sections[i][0].matrice, boucles));

  const lisse = raccord === "lisse" && posees.length > 2;
  let resultat;
  if (options.guide) resultat = leLongDuGuide(posees, options.guide, lisse);
  else if (options.boucle) resultat = lisse ? interpoler(posees, true) : posees.map((boucles) => ({ boucles }));
  else resultat = lisse ? interpoler(posees, false) : posees.map((boucles) => ({ boucles }));
  resultat[0].plan = plates[0];
  resultat[resultat.length - 1].plan = plates[plates.length - 1];
  return resultat;
}

/* Catmull-Rom entre b et c, t de 0 à 1 (a et e : les voisins). */
function courbe(a, b, c, e, t) {
  const [t2, t3] = [t * t, t * t * t];
  return [0, 1, 2].map((x) => 0.5 * (2 * b[x] + (c[x] - a[x]) * t
    + (2 * a[x] - 5 * b[x] + 4 * c[x] - e[x]) * t2 + (3 * b[x] - a[x] - 3 * c[x] + e[x]) * t3));
}

/* Les sections voisines de i, prolongées en ligne droite au-delà des bouts
   (ou reprises depuis l'autre bout, pour un lissage bouclé). */
function voisine(posees, i, periodique) {
  const m = posees.length;
  if (periodique) return posees[((i % m) + m) % m];
  if (i >= 0 && i < m) return posees[i];
  const [a, b] = i < 0 ? [posees[0], posees[1]] : [posees[m - 1], posees[m - 2]];
  return a.map((boucle, j) => boucle.map((p, k) => moins(fois(p, 2), b[j][k])));
}

/* Une courbe douce (Catmull-Rom) passe par les points correspondants de
   toutes les sections ; on ajoute des sections entre elles. Bouclé, la
   dernière rejoint la première. */
function interpoler(posees, periodique) {
  const m = posees.length;
  const resultat = [];
  const travees = periodique ? m : m - 1;
  for (let i = 0; i < travees; i += 1) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((d) => voisine(posees, i + d, periodique));
    for (let d = 0; d < SUBDIVISIONS_DU_LISSAGE; d += 1) {
      const t = d / SUBDIVISIONS_DU_LISSAGE;
      resultat.push({ boucles: p1.map((boucle, j) => boucle.map((_, k) => courbe(p0[j][k], p1[j][k], p2[j][k], p3[j][k], t))) });
    }
  }
  if (!periodique) resultat.push({ boucles: posees[m - 1] });
  return resultat;
}

/*
 * Le lissage suit une courbe guide (une dorsale) : chaque section est décrite
 * dans le repère de la courbe là où elle la croise, et c'est dans ce repère
 * qu'on passe d'une section à l'autre. La courbe porte ainsi la forme : un
 * goulot qui se courbe, une corne, un bec.
 */
function leLongDuGuide(posees, guide, lisse) {
  let stations = reperesDuChemin(densifier(guide, POINTS_DU_GUIDE));
  const centres = posees.map((boucles) => centreDe(boucles.flat()));
  const indices = () => centres.map((c) => stations.reduce((m, st, j) => (norme(moins(st.p, c)) < norme(moins(stations[m].p, c)) ? j : m), 0));
  let rangs = indices();
  // La courbe tracée dans l'autre sens : on la retourne.
  if (rangs[0] > rangs[rangs.length - 1]) {
    stations = reperesDuChemin(densifier({ points: [...guide.points].reverse(), ferme: guide.ferme }, POINTS_DU_GUIDE));
    rangs = indices();
  }
  for (let k = 1; k < rangs.length; k += 1) {
    if (rangs[k] <= rangs[k - 1]) {
      throw new Error("la courbe guide doit passer près de chaque section, dans l'ordre : la section " + (k + 1)
        + " se trouve avant la précédente le long de la courbe.");
    }
  }
  const locales = posees.map((boucles, k) => {
    const st = stations[rangs[k]];
    return boucles.map((b) => b.map((X) => {
      const d = moins(X, st.p);
      return [scal(d, st.t), scal(d, st.r), scal(d, st.s)];
    }));
  });
  const resultat = [];
  for (let k = 0; k < rangs.length - 1; k += 1) {
    const derniere = k === rangs.length - 2;
    const [a, b, c, e] = [-1, 0, 1, 2].map((d) => voisine(locales, k + d, false));
    for (let j = rangs[k]; j < rangs[k + 1] + (derniere ? 1 : 0); j += 1) {
      const t = (j - rangs[k]) / (rangs[k + 1] - rangs[k]);
      const st = stations[j];
      resultat.push({
        boucles: b.map((boucle, n) => boucle.map((_, i) => {
          const l = lisse ? courbe(a[n][i], b[n][i], c[n][i], e[n][i], t) : plus(fois(b[n][i], 1 - t), fois(c[n][i], t));
          return plus(st.p, plus(fois(st.t, l[0]), plus(fois(st.r, l[1]), fois(st.s, l[2]))));
        })),
      });
    }
  }
  return resultat;
}

// ── Hélice ──────────────────────────────────────────────────────────────────

/*
 * Un profil qui tourne autour d'un axe de son esquisse en avançant le long
 * de lui : ressort, filetage, vis sans fin. Dans le repère du plan, comme la
 * révolution. options : { axe: "vertical" | "horizontal", angle (degrés, plus
 * d'un tour possible), pas (mm par tour), facettes (par tour), sensHelice:
 * "droite" | "gauche" }.
 */
export function sectionsDeLHelice(boucles2D, { axe, angle, pas, facettes, sensHelice }) {
  if (boucles2D.length === 0) throw new Error("le profil n'a aucun contour fermé.");
  // Le profil lu avec l'axe de rotation en ordonnée ; de l'autre côté de l'axe, on le retourne.
  const horizontal = axe === "horizontal";
  let lus = horizontal ? boucles2D.map((b) => b.map(([u, v]) => [v, u])) : boucles2D;
  const xs = lus.flat().map(([x]) => x);
  if (Math.min(...xs) < -EGALITE_MM && Math.max(...xs) > EGALITE_MM) {
    throw new Error("le profil traverse l'axe de rotation : le dessiner d'un seul côté.");
  }
  const retourne = Math.max(...xs) <= EGALITE_MM;
  if (retourne) lus = lus.map((b) => b.map(([x, y]) => [-x, y]));
  const ys = lus.flat().map(([, y]) => y);
  const hauteur = Math.max(...ys) - Math.min(...ys);
  if (angle > 360 && pas < hauteur - EGALITE_MM) {
    throw new Error("le pas (" + pas.toLocaleString("fr-FR") + " mm) est plus petit que la hauteur du profil ("
      + (Math.round(hauteur * 100) / 100).toLocaleString("fr-FR") + " mm) : les spires se chevaucheraient.");
  }
  const nombre = Math.max(8, Math.ceil(facettes * angle / 360));
  const sections = [];
  for (let k = 0; k <= nombre; k += 1) {
    const theta = (sensHelice === "gauche" ? -1 : 1) * (angle * Math.PI / 180) * (k / nombre);
    const monte = pas * (angle / 360) * (k / nombre);
    const [c, s] = [Math.cos(theta), Math.sin(theta)];
    sections.push({
      boucles: lus.map((b) => b.map(([x, y]) => {
        const local = [x * c, y + monte, x * s];
        // Retour au repère du plan : l'axe de rotation redevient celui choisi.
        return horizontal ? [local[1], local[0], local[2]] : local;
      })),
    });
  }
  // Les bouchons n'ont besoin que d'une image à plat des boucles, dans le même ordre.
  sections[0].plan = lus;
  sections[sections.length - 1].plan = lus;
  return sections;
}

// ── Du tuyau de sections au solide ──────────────────────────────────────────

/* La boîte { min, max } de toutes les sections : ce qu'occupera le solide. */
export function boiteDesSections(sections) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { boucles } of sections) {
    for (const p of boucles.flat()) {
      for (let i = 0; i < 3; i += 1) {
        min[i] = Math.min(min[i], p[i]);
        max[i] = Math.max(max[i], p[i]);
      }
    }
  }
  return { min, max };
}

/*
 * Relie chaque section à la suivante (et la dernière à la première si ferme),
 * ferme les deux bouts sinon, et rend le solide du moteur. Les faces sont
 * orientées vers l'extérieur d'après le signe du volume : peu importe dans
 * quel sens on a parcouru les sections.
 *
 * Une section peut répéter un point (le coin d'un lissage relié à tout un
 * arrondi) : les points confondus sont fusionnés et les triangles devenus
 * plats retirés, ce qui laisse un éventail propre autour du coin.
 */
export function solideParSections(atelier, sections, ferme) {
  const nombre = sections.length;
  const tailles = sections[0].boucles.map((b) => b.length);
  const debuts = [];
  let parSection = 0;
  for (const t of tailles) {
    debuts.push(parSection);
    parSection += t;
  }
  const positions = [];
  sections.forEach((section) => {
    for (const boucle of section.boucles) for (const p of boucle) positions.push(p);
  });

  // Chaque sommet renvoie au premier sommet de même position.
  const parCle = new Map();
  const canonique = positions.map((p, i) => {
    const cle = p.map((c) => Math.round(c * 1e6)).join(",");
    if (!parCle.has(cle)) parCle.set(cle, i);
    return parCle.get(cle);
  });

  const triangles = [];
  const ajouter = (a, b, c) => {
    const [x, y, z] = [canonique[a], canonique[b], canonique[c]];
    if (x !== y && y !== z && x !== z) triangles.push(x, y, z);
  };
  const indice = (k, j, i) => k * parSection + debuts[j] + (i % tailles[j]);
  const liaisons = ferme ? nombre : nombre - 1;
  for (let k = 0; k < liaisons; k += 1) {
    const suivante = (k + 1) % nombre;
    tailles.forEach((taille, j) => {
      for (let i = 0; i < taille; i += 1) {
        const [a, b, c, d] = [indice(k, j, i), indice(k, j, i + 1), indice(suivante, j, i + 1), indice(suivante, j, i)];
        ajouter(a, b, c);
        ajouter(a, c, d);
      }
    });
  }

  // Les bouts : le moteur découpe le profil à plat en triangles. Les faces des
  // côtés longent chaque boucle dans son sens au départ ; le bouchon de départ
  // tourne à l'envers de la boucle, celui d'arrivée dans son sens. Les points
  // répétés sont retirés avant la découpe.
  const boucher = (plan, k, auDepart) => {
    const principale = plan.reduce((m, b, j) => (Math.abs(aire2d(b)) > Math.abs(aire2d(plan[m])) ? j : m), 0);
    const direct = aire2d(plan[principale]) > 0;
    const entree = [];
    const origine = [];      // pour chaque point donné au moteur : son indice dans la section
    plan.forEach((boucle, j) => {
      const rangs = boucle.map((_, i) => i);
      const ordre = direct ? rangs : [...rangs].reverse();
      const propre = [];
      for (const i of ordre) {
        const q = boucle[i];
        const dernier = propre[propre.length - 1];
        if (dernier === undefined || Math.hypot(q[0] - boucle[dernier][0], q[1] - boucle[dernier][1]) > 1e-9) propre.push(i);
      }
      if (propre.length > 1 && Math.hypot(boucle[propre[0]][0] - boucle[propre[propre.length - 1]][0], boucle[propre[0]][1] - boucle[propre[propre.length - 1]][1]) < 1e-9) propre.pop();
      entree.push(propre.map((i) => boucle[i]));
      for (const i of propre) origine.push(k * parSection + debuts[j] + i);
    });
    // Le moteur rend des triangles dans le sens direct du plan.
    const retourner = auDepart ? direct : !direct;
    for (const [a, b, c] of atelier.triangulate(entree)) {
      if (retourner) ajouter(origine[a], origine[c], origine[b]);
      else ajouter(origine[a], origine[b], origine[c]);
    }
  };
  if (!ferme) {
    boucher(sections[0].plan, 0, true);
    boucher(sections[nombre - 1].plan, nombre - 1, false);
  }

  // Seuls les sommets utilisés partent au moteur.
  const nouveaux = new Map();
  const sommets = [];
  const reindexes = triangles.map((i) => {
    if (!nouveaux.has(i)) {
      nouveaux.set(i, sommets.length / 3);
      sommets.push(...positions[i]);
    }
    return nouveaux.get(i);
  });

  let volume = 0;
  for (let t = 0; t < reindexes.length; t += 3) {
    const [a, b, c] = [reindexes[t], reindexes[t + 1], reindexes[t + 2]].map((i) => [sommets[i * 3], sommets[i * 3 + 1], sommets[i * 3 + 2]]);
    volume += scal(a, vect(b, c));
  }
  if (volume < 0) {
    for (let t = 0; t < reindexes.length; t += 3) [reindexes[t + 1], reindexes[t + 2]] = [reindexes[t + 2], reindexes[t + 1]];
  }

  const maillage = new atelier.Mesh({ numProp: 3, vertProperties: new Float32Array(sommets), triVerts: new Uint32Array(reindexes) });
  maillage.merge();
  try {
    return new atelier.Manifold(maillage);
  } catch {
    throw new Error("la surface obtenue ne ferme pas un volume : le profil se replie sur lui-même le long du trajet. Élargir les courbes du chemin ou réduire le profil.");
  }
}
