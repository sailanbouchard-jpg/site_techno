/*
 * noyau/esquisse/contours_esquisse.js
 * ───────────────────────────────────
 * Ce que le logiciel lit dans une esquisse : quels tracés se referment, lesquels
 * restent ouverts. L'élève n'a rien à déclarer — le contour fermé se remplit à
 * l'écran, et le bon bouton s'allume. Le verdict est dans le dessin.
 *
 * Un contour fermé : une boucle de traits, ou un cercle. Tout le reste est un
 * tracé ouvert. Les contours fermés s'additionnent ; celui qui est dessiné
 * dans un autre le perce.
 * Les contours rendus sont des polygones [[u, v], …], arcs et cercles
 * découpés en petits segments.
 */

import { arcDepuisBombe, distance, pointsDeSpline, pointsDePassage } from "./elements_esquisse.js";

const SEGMENTS_PAR_TOUR = 64;

// ── Découpage des courbes ───────────────────────────────────────────────────

/* Les points d'un arc de a vers b, a compris, b non compris. */
function pointsDArc(a, b, bombe) {
  if (Math.abs(bombe) < 1e-9) return [a];
  const { centre, rayon, debut, balayage } = arcDepuisBombe(a, b, bombe);
  const morceaux = Math.max(2, Math.ceil((Math.abs(balayage) / (Math.PI * 2)) * SEGMENTS_PAR_TOUR));
  const points = [];
  for (let i = 0; i < morceaux; i += 1) {
    const angle = debut + (balayage * i) / morceaux;
    points.push([centre[0] + rayon * Math.cos(angle), centre[1] + rayon * Math.sin(angle)]);
  }
  return points;
}

export function pointsDeCercle(centre, rayon) {
  const points = [];
  for (let i = 0; i < SEGMENTS_PAR_TOUR; i += 1) {
    const angle = (i * Math.PI * 2) / SEGMENTS_PAR_TOUR;
    points.push([centre[0] + rayon * Math.cos(angle), centre[1] + rayon * Math.sin(angle)]);
  }
  return points;
}

/* La polyligne d'une courbe seule : sert à la dessiner et à la viser. */
export function pointsDeCourbe(contenu, courbe) {
  if (courbe.genre === "cercle") {
    const cercle = pointsDeCercle(contenu.points[courbe.centre], courbe.rayon);
    return [...cercle, cercle[0]];
  }
  if (courbe.genre === "spline") {
    const points = pointsDeSpline(pointsDePassage(courbe).map((id) => contenu.points[id]), courbe.ferme === true);
    return courbe.ferme ? [...points, points[0]] : points;
  }
  const [a, b] = [contenu.points[courbe.a], contenu.points[courbe.b]];
  return [...pointsDArc(a, b, courbe.bombe ?? 0), b];
}

// ── Analyse ─────────────────────────────────────────────────────────────────

/* Les traits d'aide (construction) ne ferment aucun contour : ils guident le
   dessin, ils ne donnent pas de matière. */
function traitsDe(contenu) {
  return contenu.courbes
    .filter((c) => c.genre !== "cercle" && !(c.genre === "spline" && c.ferme) && c.construction !== true
      && c.a !== c.b && c.a in contenu.points && c.b in contenu.points)
    .map((c) => ({ a: c.a, b: c.b, bombe: c.bombe ?? 0, spline: c.genre === "spline" ? c : null }));
}

/* Parcourt un trait dans un sens ou dans l'autre : à l'envers, la bombe change de signe. */
function pointsDuTrait(contenu, trait, depuis) {
  const aLEndroit = trait.a === depuis;
  const [de, vers] = aLEndroit ? [trait.a, trait.b] : [trait.b, trait.a];
  if (trait.spline !== null) {
    const points = pointsDeCourbe(contenu, trait.spline);
    const sens = aLEndroit ? points : [...points].reverse();
    return { points: sens.slice(0, -1), arrivee: vers };
  }
  return {
    points: pointsDArc(contenu.points[de], contenu.points[vers], aLEndroit ? trait.bombe : -trait.bombe),
    arrivee: vers,
  };
}

/* pas : [{ trait, depuis }] bout à bout → la polyligne, dernier point compris. */
function polyligneDes(contenu, pas) {
  const points = [];
  let arrivee = pas[0].depuis;
  for (const { trait, depuis } of pas) {
    const morceau = pointsDuTrait(contenu, trait, depuis);
    points.push(...morceau.points);
    arrivee = morceau.arrivee;
  }
  points.push(contenu.points[arrivee]);
  return points;
}

/*
 * Rend { fermes, ouverts } : des polygones fermés (dernier point différent du
 * premier) et des polylignes ouvertes.
 *
 * Deux formes qui se touchent par un sommet (un L fait de deux rectangles)
 * partagent un point où se croisent quatre traits : on en tire quand même
 * deux boucles. On retire d'abord les branches pendantes (tracés ouverts),
 * puis on découpe ce qui reste en boucles simples.
 */
export function analyserEsquisse(contenu) {
  const traits = traitsDe(contenu);
  const voisins = new Map();
  traits.forEach((trait, i) => {
    for (const id of [trait.a, trait.b]) {
      if (!voisins.has(id)) voisins.set(id, []);
      voisins.get(id).push(i);
    }
  });
  const libres = new Set(traits.keys());
  const libresEn = (id) => voisins.get(id).filter((t) => libres.has(t));
  const autreBout = (t, id) => (traits[t].a === id ? traits[t].b : traits[t].a);
  const fermes = [];
  const ouverts = [];

  // Les branches pendantes, depuis leur bout libre jusqu'à une bifurcation.
  let encore = true;
  while (encore) {
    encore = false;
    for (const id of voisins.keys()) {
      if (libresEn(id).length !== 1) continue;
      const pas = [];
      let point = id;
      do {
        const t = libresEn(point)[0];
        libres.delete(t);
        pas.push({ trait: traits[t], depuis: point });
        point = autreBout(t, point);
      } while (libresEn(point).length === 1);
      ouverts.push(polyligneDes(contenu, pas));
      encore = true;
    }
  }

  // Le reste en boucles : on marche, et chaque retour sur un point déjà vu referme une boucle.
  for (const depart of voisins.keys()) {
    while (libresEn(depart).length > 0) {
      const chemin = [depart];
      const pas = [];
      let courant = depart;
      for (;;) {
        const t = libresEn(courant).find((x) => !pas.some((p) => p.t === x));
        if (t === undefined) {
          // Cul-de-sac (un point où se croisent trois traits) : ce morceau reste ouvert.
          for (const p of pas) libres.delete(p.t);
          if (pas.length > 0) ouverts.push(polyligneDes(contenu, pas));
          break;
        }
        const suivant = autreBout(t, courant);
        pas.push({ t, trait: traits[t], depuis: courant });
        const retour = chemin.indexOf(suivant);
        if (retour < 0) {
          chemin.push(suivant);
          courant = suivant;
          continue;
        }
        const boucle = pas.splice(retour);
        chemin.splice(retour + 1);
        for (const p of boucle) libres.delete(p.t);
        const polygone = polyligneDes(contenu, boucle);
        polygone.pop();   // le dernier point est le premier
        if (polygone.length >= 3) fermes.push(polygone);
        courant = suivant;
        if (pas.length === 0) break;
      }
    }
  }

  for (const cercle of contenu.courbes.filter((c) => c.genre === "cercle" && c.construction !== true && c.centre in contenu.points)) {
    fermes.push(pointsDeCercle(contenu.points[cercle.centre], cercle.rayon));
  }
  // Une courbe libre refermée est un contour à elle seule, comme un cercle.
  for (const boucle of contenu.courbes.filter((c) => c.genre === "spline" && c.ferme && c.construction !== true && c.pts.every((id) => id in contenu.points))) {
    fermes.push(pointsDeCourbe(contenu, boucle).slice(0, -1));
  }
  return { fermes, ouverts };
}

/* Les points où un tracé s'arrête sans rejoindre un autre : c'est là qu'un
   contour reste ouvert. On les montre en rouge. */
export function boutsLibres(contenu) {
  const degres = new Map();
  for (const trait of traitsDe(contenu)) {
    for (const id of [trait.a, trait.b]) degres.set(id, (degres.get(id) ?? 0) + 1);
  }
  return [...degres].filter(([, degre]) => degre === 1).map(([id]) => contenu.points[id]);
}

export function bilanEsquisse(contenu) {
  const { fermes, ouverts } = analyserEsquisse(contenu);
  return { vide: contenu.courbes.length === 0, fermee: fermes.length > 0, ouverte: ouverts.length > 0 };
}

// ── Régions remplies ────────────────────────────────────────────────────────

export function pointDansPolygone([x, y], polygone) {
  let dedans = false;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i, i += 1) {
    const [xi, yi] = polygone[i];
    const [xj, yj] = polygone[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function aire(polygone) {
  let somme = 0;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i, i += 1) {
    somme += polygone[j][0] * polygone[i][1] - polygone[i][0] * polygone[j][1];
  }
  return somme / 2;
}

const SUR_LE_BORD_MM = 1e-6;

/* interieur est entièrement dans exterieur : aucun de ses sommets n'en sort,
   et au moins un est franchement dedans (deux formes identiques ne se
   contiennent pas l'une l'autre). */
function contient(exterieur, interieur) {
  const bord = [...exterieur, exterieur[0]];
  let dedans = false;
  for (const point of interieur) {
    if (distanceAuTrace(point, bord) < SUR_LE_BORD_MM) continue;
    if (!pointDansPolygone(point, exterieur)) return false;
    dedans = true;
  }
  return dedans;
}

/* Combien de contours contiennent chacun : pair, c'est de la matière ; impair, un trou. */
function profondeurs(fermes) {
  return fermes.map((polygone, i) => fermes.filter((autre, j) => j !== i && contient(autre, polygone)).length);
}

/*
 * Les contours orientés pour une union : la matière tourne dans le sens
 * direct, les trous dans l'autre. Avec la règle « positive » du moteur, deux
 * formes qui se chevauchent s'additionnent (un L fait de deux rectangles),
 * et une forme dessinée dans une autre la perce. C'est ce qu'attend un élève
 * qui empile des formes.
 */
export function contoursPourUnion(fermes) {
  const profondeur = profondeurs(fermes);
  return fermes.map((polygone, i) => {
    const direct = aire(polygone) > 0;
    const matiere = profondeur[i] % 2 === 0;
    return direct === matiere ? polygone : [...polygone].reverse();
  });
}

export const REGLE_DE_REMPLISSAGE = "Positive";

/* Le point est-il dans la matière ? Même règle que le moteur : enroulement positif. */
export function dansLeProfil([x, y], orientes) {
  let enroulement = 0;
  for (const polygone of orientes) {
    for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i, i += 1) {
      const [xi, yi] = polygone[i];
      const [xj, yj] = polygone[j];
      const cote = (xi - xj) * (y - yj) - (x - xj) * (yi - yj);
      if (yj <= y && yi > y && cote > 0) enroulement += 1;
      if (yj > y && yi <= y && cote < 0) enroulement -= 1;
    }
  }
  return enroulement > 0;
}

/*
 * Pour l'affichage des aplats : chaque contour de matière avec les trous
 * qu'il contient directement. Deux aplats qui se chevauchent sont dessinés
 * sans se foncer (voir vue/calque_esquisses.js).
 */
export function regionsPleines(fermes) {
  const profondeur = profondeurs(fermes);
  const regions = [];
  fermes.forEach((polygone, i) => {
    if (profondeur[i] % 2 !== 0) return;
    const trous = fermes.filter((trou, j) => profondeur[j] === profondeur[i] + 1 && contient(polygone, trou));
    regions.push({ contour: polygone, trous });
  });
  return regions;
}

// ── Viser ───────────────────────────────────────────────────────────────────

function distanceAuSegment(p, a, b) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const longueur = dx * dx + dy * dy;
  const t = longueur === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / longueur));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

export function distanceAuTrace(p, polyligne) {
  let minimum = Infinity;
  for (let i = 1; i < polyligne.length; i += 1) {
    minimum = Math.min(minimum, distanceAuSegment(p, polyligne[i - 1], polyligne[i]));
  }
  return minimum;
}

/* La courbe la plus proche de p à moins de tolerance, ou null. */
export function courbeSous(contenu, p, tolerance) {
  let meilleure = null;
  let ecart = tolerance;
  for (const courbe of contenu.courbes) {
    const d = distanceAuTrace(p, pointsDeCourbe(contenu, courbe));
    if (d <= ecart) {
      ecart = d;
      meilleure = courbe.id;
    }
  }
  return meilleure;
}

export function pointSous(contenu, p, tolerance, exclus = null) {
  let meilleur = null;
  let ecart = tolerance;
  for (const [id, q] of Object.entries(contenu.points)) {
    const d = distance(p, q);
    if (id !== exclus && d <= ecart) {
      ecart = d;
      meilleur = id;
    }
  }
  return meilleur;
}

/* Le rectangle qui contient tous les tracés, ou null pour une esquisse vide. */
export function boiteDeLEsquisse(contenu) {
  const points = contenu.courbes.flatMap((c) => pointsDeCourbe(contenu, c));
  if (points.length === 0) return null;
  const us = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  return { min: [Math.min(...us), Math.min(...vs)], max: [Math.max(...us), Math.max(...vs)] };
}
