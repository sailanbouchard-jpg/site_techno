/*
 * noyau/esquisse/contraintes_esquisse.js
 * ──────────────────────────────────────
 * Les contraintes d'une esquisse : des cotes (une longueur, la distance d'un
 * point à un axe…) et des relations (horizontal, parallèle…). Elles sont
 * rangées dans le contenu, à côté des points et des tracés, et le solveur
 * déplace les points le moins possible pour les satisfaire toutes.
 *
 * Les axes de l'esquisse passent par son origine : l'axe horizontal (v = 0) et
 * l'axe vertical (u = 0). Dans une contrainte, b = null désigne l'origine, ou
 * l'axe qui convient à la cote.
 *
 * Contraintes : { id, genre, … }
 *   longueur        { courbe, valeur }          un segment
 *   diametre        { courbe, valeur }          un cercle
 *   rayon           { courbe, valeur }          un arc (par ses bouts et sa poignée)
 *   distance        { a, b, valeur }            deux points, en ligne droite
 *   distanceH       { a, b, valeur, sens }      écart horizontal ; b = null : depuis l'axe vertical
 *   distanceV       { a, b, valeur, sens }      écart vertical ; b = null : depuis l'axe horizontal
 *   distanceLigne   { a, courbe, valeur, sens } distance d'un point à la droite d'un segment,
 *                                               perpendiculairement
 *   horizontal      { courbe }                  vertical { courbe }
 *   surAxe          { a, axe: "horizontal" | "vertical" }
 *   origine         { a }                       fixe { a, u, v }
 *   reference       { a }                       le point sert de référence aux esquisses suivantes
 *                                               (aucune équation ; voir references_esquisse.js)
 *   surReference    { a, esquisse, point, u, v } sur la projection d'un point de référence d'une
 *                                               esquisse précédente ; (u, v) tenu à jour
 *   angle           { courbes: [s1, s2], valeur }  en degrés, entre deux segments
 *   parallele       { courbes: [c1, c2] }       perpendiculaire, egal : idem
 *   tangente        { courbes: [segment, rond] }   un segment qui effleure un cercle ou un arc
 *   concentrique    { courbes: [rond1, rond2] }    deux cercles ou arcs de même centre
 *
 * Toute contrainte peut porter « decalage : [du, dv] » : de combien son
 * étiquette a été écartée à la main de la place que le logiciel lui donne.
 *
 * sens vaut +1 ou −1 : il retient de quel côté du repère le point se trouvait
 * quand la cote a été posée ; la valeur affichée reste positive.
 *
 * Chaque arc porte une poignée, le point m : elle reste à égale distance de
 * ses deux bouts, donc au sommet de l'arc. Il porte aussi son centre, le point
 * c, à égale distance de a, b et m. Et il garde sa forme : la poignée reste
 * du côté de la corde où elle était, le centre aussi — un petit arc ne se
 * retourne pas en grand arc, ni un creux en bosse, quand une cote change.
 * Sa bombe enregistrée dit la forme voulue. Ces règles ne sont pas rangées
 * dans les contraintes : elles font partie de l'arc, on ne peut pas les retirer.
 *
 * Le solveur : Gauss-Newton à norme minimale. À chaque pas, parmi tous les
 * déplacements qui corrigent les écarts, on prend le plus petit — c'est ce
 * qui fait qu'une esquisse ne « saute » pas quand on change une cote. Un point
 * tenu à la souris pèse lourd : il bouge le moins possible.
 */

import { cote } from "../format_cotes.js";

const TOLERANCE_MM = 1e-9;
const TOLERANCE_CONFLIT_MM = 1e-3;
const ITERATIONS_MAX = 80;
const PAS_DE_DERIVATION = 1e-7;
const POIDS_TENU = 1e4;
// La poignée d'un arc cède avant les autres points : tirer un bout recourbe l'arc
// plutôt que de déplacer l'autre bout.
const SOUPLESSE_POIGNEE = 1000;
// Le centre d'un arc, quand il n'est soudé à rien, cède plus encore : tirer la
// poignée recourbe l'arc au lieu de buter sur le centre.
const SOUPLESSE_CENTRE = 1e5;
const AMORTISSEMENT = 1e-9;
// Une bombe à moins de ça de 1 : l'arc est presque un demi-cercle, grand ou petit indifféremment.
const ECART_DEMI_CERCLE = 0.05;
// En dessous, un segment est écrasé en point : une contrainte ne doit jamais faire ça en douce.
const LONGUEUR_ECRASEE_MM = 1e-3;

// ── Accès aux variables ─────────────────────────────────────────────────────

const coordonnees = (id) => ["p:" + id + ":0", "p:" + id + ":1"];
const cleRayon = (idCourbe) => "r:" + idCourbe;
const segment = (contenu, id) => contenu.courbes.find((c) => c.id === id && c.genre === "segment") ?? null;
const cercle = (contenu, id) => contenu.courbes.find((c) => c.id === id && c.genre === "cercle") ?? null;
const arc = (contenu, id) => contenu.courbes.find((c) => c.id === id && c.genre === "arc" && c.m in contenu.points) ?? null;
const existe = (contenu, idPoint) => idPoint in contenu.points;

function lire(contenu, cle) {
  const [genre, id, i] = cle.split(":");
  if (genre === "p") return contenu.points[id][Number(i)];
  return cercle(contenu, id).rayon;
}

const longueur = (x) => Math.hypot(x[2] - x[0], x[3] - x[1]);
const produitVectoriel = (x) => (x[2] - x[0]) * (x[7] - x[5]) - (x[3] - x[1]) * (x[6] - x[4]);
const produitScalaire = (x) => (x[2] - x[0]) * (x[6] - x[4]) + (x[3] - x[1]) * (x[7] - x[5]);
const normes = (x) => Math.max(Math.hypot(x[2] - x[0], x[3] - x[1]) * Math.hypot(x[6] - x[4], x[7] - x[5]), 1e-9);

/* Le rayon du cercle qui passe par trois points : x = [a, b, m] à plat. */
function rayonCirconscrit(x) {
  const [ax, ay, bx, by, mx, my] = x;
  const croise = (bx - ax) * (my - ay) - (by - ay) * (mx - ax);
  const produit = Math.hypot(bx - ax, by - ay) * Math.hypot(mx - ax, my - ay) * Math.hypot(mx - bx, my - by);
  return produit / Math.max(2 * Math.abs(croise), 1e-12);
}

/* La distance d'un point à la droite d'un segment, positive à sa gauche : x = [p, a, b] à plat. */
function distanceSignee(x) {
  const [px, py, ax, ay, bx, by] = x;
  return ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / Math.max(Math.hypot(bx - ax, by - ay), 1e-9);
}

/* Le centre du cercle qui passe par trois points : x = [a, b, m] à plat. */
function centreCirconscritDe(x) {
  const [ax, ay, bx, by, mx, my] = x;
  const d = 2 * (ax * (by - my) + bx * (my - ay) + mx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const [la, lb, lm] = [ax * ax + ay * ay, bx * bx + by * by, mx * mx + my * my];
  return [
    (la * (by - my) + lb * (my - ay) + lm * (ay - by)) / d,
    (la * (mx - bx) + lb * (ax - mx) + lm * (bx - ax)) / d,
  ];
}

/* Le centre et le rayon d'un rond — cercle ou arc — tels que le solveur les
   voit, avec les variables qui les font bouger. */
function rond(contenu, id) {
  const c = cercle(contenu, id);
  if (c !== null) {
    return {
      variables: [...coordonnees(c.centre), cleRayon(id)],
      centre: (x) => [x[0], x[1]],
      rayon: (x) => x[2],
    };
  }
  const a = arc(contenu, id);
  if (a === null) return null;
  if (a.c in contenu.points) {
    return {
      variables: [...coordonnees(a.c), ...coordonnees(a.a)],
      centre: (x) => [x[0], x[1]],
      rayon: (x) => Math.hypot(x[2] - x[0], x[3] - x[1]),
    };
  }
  return {
    variables: [...coordonnees(a.a), ...coordonnees(a.b), ...coordonnees(a.m)],
    centre: (x) => centreCirconscritDe(x) ?? [x[0], x[1]],
    rayon: (x) => rayonCirconscrit(x),
  };
}

/* Les variables d'un arc : ses deux bouts, puis sa poignée. */
const variablesDeLArc = (contenu, id) => {
  const s = arc(contenu, id);
  return [...coordonnees(s.a), ...coordonnees(s.b), ...coordonnees(s.m)];
};

/* Les variables d'un segment : ses deux bouts. */
const variablesDuSegment = (contenu, id) => {
  const s = segment(contenu, id);
  return [...coordonnees(s.a), ...coordonnees(s.b)];
};

/* Un point, et le point ou l'axe de référence (b = null : l'origine). La
   référence absente vaut 0 : on ajoute deux « variables » constantes. */
const variablesDuCouple = (c) => (c.b === null ? coordonnees(c.a) : [...coordonnees(c.a), ...coordonnees(c.b)]);
const ecartDuCouple = (c, x, i) => (c.b === null ? x[i] : x[i] - x[2 + i]);

/*
 * Pour chaque genre : valide(c, contenu), variables(c, contenu) → clés,
 * residus(c, x) → écarts à annuler (x : les valeurs des variables, dans l'ordre).
 */
const GENRES = {
  longueur: {
    valide: (c, contenu) => segment(contenu, c.courbe) !== null,
    variables: (c, contenu) => variablesDuSegment(contenu, c.courbe),
    residus: (c, x) => [longueur(x) - c.valeur],
  },
  diametre: {
    valide: (c, contenu) => cercle(contenu, c.courbe) !== null,
    variables: (c) => [cleRayon(c.courbe)],
    residus: (c, x) => [2 * x[0] - c.valeur],
  },
  // Par le centre quand l'arc en a un : le rayon par trois points plafonne à la
  // demi-corde, et le solveur s'y bloquait (un arc de 0,9 refusait 0,42).
  rayon: {
    valide: (c, contenu) => arc(contenu, c.courbe) !== null,
    variables: (c, contenu) => rond(contenu, c.courbe).variables,
    residus: (c, x, contenu) => [rond(contenu, c.courbe).rayon(x) - c.valeur],
  },
  // Implicite : la poignée d'un arc à égale distance de ses deux bouts.
  poigneeDArc: {
    valide: (c, contenu) => arc(contenu, c.courbe) !== null,
    variables: (c, contenu) => variablesDeLArc(contenu, c.courbe),
    residus: (_c, x) => [Math.hypot(x[4] - x[0], x[5] - x[1]) - Math.hypot(x[4] - x[2], x[5] - x[3])],
  },
  // Implicite : l'arc garde la forme que dit sa bombe. Nul tant que la poignée
  // et le centre restent du bon côté de la corde ; sinon, de combien ils ont passé.
  sensDArc: {
    valide: (c, contenu) => arc(contenu, c.courbe) !== null && Math.abs(arc(contenu, c.courbe).bombe ?? 0) > 1e-9,
    variables: (c, contenu) => {
      const s = arc(contenu, c.courbe);
      return [...variablesDeLArc(contenu, c.courbe), ...(existe(contenu, s.c) ? coordonnees(s.c) : [])];
    },
    residus(c, x, contenu) {
      const { bombe } = arc(contenu, c.courbe);
      const signe = Math.sign(bombe);
      const [ax, ay, bx, by] = x;
      const corde = Math.max(Math.hypot(bx - ax, by - ay), 1e-9);
      // Positif à gauche de a → b. Un arc de bombe positive bombe à droite.
      const cote = (px, py) => ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / corde;
      const residus = [Math.max(0, signe * cote(x[4], x[5]))];
      // Le centre : en face de la poignée pour un petit arc, de son côté pour un
      // grand. Près du demi-cercle, les deux se valent : pas de règle.
      if (x.length > 6 && Math.abs(Math.abs(bombe) - 1) > ECART_DEMI_CERCLE) {
        const grand = Math.abs(bombe) > 1;
        residus.push(Math.max(0, (grand ? signe : -signe) * cote(x[6], x[7])));
      }
      return residus;
    },
  },
  // Implicite : le centre d'un arc à égale distance de ses deux bouts et de sa poignée.
  centreDArc: {
    valide: (c, contenu) => arc(contenu, c.courbe) !== null && existe(contenu, arc(contenu, c.courbe).c),
    variables: (c, contenu) => [...variablesDeLArc(contenu, c.courbe), ...coordonnees(arc(contenu, c.courbe).c)],
    residus: (_c, x) => {
      const versLeCentre = (i) => Math.hypot(x[i] - x[6], x[i + 1] - x[7]);
      return [versLeCentre(0) - versLeCentre(4), versLeCentre(2) - versLeCentre(4)];
    },
  },
  distanceLigne: {
    valide: (c, contenu) => existe(contenu, c.a) && segment(contenu, c.courbe) !== null,
    variables: (c, contenu) => [...coordonnees(c.a), ...variablesDuSegment(contenu, c.courbe)],
    residus: (c, x) => [c.sens * distanceSignee(x) - c.valeur],
  },
  distance: {
    valide: (c, contenu) => existe(contenu, c.a) && (c.b === null || existe(contenu, c.b)),
    variables: variablesDuCouple,
    residus: (c, x) => [Math.hypot(ecartDuCouple(c, x, 0), ecartDuCouple(c, x, 1)) - c.valeur],
  },
  distanceH: {
    valide: (c, contenu) => existe(contenu, c.a) && (c.b === null || existe(contenu, c.b)),
    variables: variablesDuCouple,
    residus: (c, x) => [c.sens * ecartDuCouple(c, x, 0) - c.valeur],
  },
  distanceV: {
    valide: (c, contenu) => existe(contenu, c.a) && (c.b === null || existe(contenu, c.b)),
    variables: variablesDuCouple,
    residus: (c, x) => [c.sens * ecartDuCouple(c, x, 1) - c.valeur],
  },
  horizontal: {
    valide: (c, contenu) => segment(contenu, c.courbe) !== null,
    variables: (c, contenu) => variablesDuSegment(contenu, c.courbe),
    residus: (_c, x) => [x[3] - x[1]],
  },
  vertical: {
    valide: (c, contenu) => segment(contenu, c.courbe) !== null,
    variables: (c, contenu) => variablesDuSegment(contenu, c.courbe),
    residus: (_c, x) => [x[2] - x[0]],
  },
  surAxe: {
    valide: (c, contenu) => existe(contenu, c.a),
    variables: (c) => coordonnees(c.a),
    residus: (c, x) => [c.axe === "horizontal" ? x[1] : x[0]],
  },
  origine: {
    valide: (c, contenu) => existe(contenu, c.a),
    variables: (c) => coordonnees(c.a),
    residus: (_c, x) => [x[0], x[1]],
  },
  fixe: {
    valide: (c, contenu) => existe(contenu, c.a),
    variables: (c) => coordonnees(c.a),
    residus: (c, x) => [x[0] - c.u, x[1] - c.v],
  },
  // Un marquage, pas une équation : il suit le point (soudure, effacement) comme une contrainte.
  reference: {
    valide: (c, contenu) => existe(contenu, c.a),
    variables: () => [],
    residus: () => [],
  },
  surReference: {
    valide: (c, contenu) => existe(contenu, c.a),
    variables: (c) => coordonnees(c.a),
    residus: (c, x) => [x[0] - c.u, x[1] - c.v],
  },
  angle: {
    valide: (c, contenu) => c.courbes.every((id) => segment(contenu, id) !== null),
    variables: (c, contenu) => c.courbes.flatMap((id) => variablesDuSegment(contenu, id)),
    // Le sinus de l'écart à l'angle voulu : nul quand l'angle y est.
    residus: (c, x) => {
      const voulu = (c.valeur * Math.PI) / 180;
      return [(produitVectoriel(x) * Math.cos(voulu) - produitScalaire(x) * Math.sin(voulu)) / normes(x)];
    },
  },
  tangente: {
    valide: (c, contenu) => segment(contenu, c.courbes[0]) !== null && rond(contenu, c.courbes[1]) !== null,
    variables: (c, contenu) => [...variablesDuSegment(contenu, c.courbes[0]), ...rond(contenu, c.courbes[1]).variables],
    residus(c, x, contenu) {
      const forme = rond(contenu, c.courbes[1]);
      const reste = x.slice(4);
      const centre = forme.centre(reste);
      const rayon = forme.rayon(reste);
      // Distance du centre à la droite, moins le rayon : le segment effleure le rond.
      return [Math.abs(distanceSignee([centre[0], centre[1], x[0], x[1], x[2], x[3]])) - rayon];
    },
  },
  concentrique: {
    valide: (c, contenu) => c.courbes.every((id) => rond(contenu, id) !== null),
    variables: (c, contenu) => c.courbes.flatMap((id) => rond(contenu, id).variables),
    residus(c, x, contenu) {
      const premier = rond(contenu, c.courbes[0]);
      const second = rond(contenu, c.courbes[1]);
      const a = premier.centre(x.slice(0, premier.variables.length));
      const b = second.centre(x.slice(premier.variables.length));
      return [a[0] - b[0], a[1] - b[1]];
    },
  },
  // Les relations entre deux segments sont ramenées à des nombres sans unité
  // (sinus, cosinus) : un grand segment ne pèse pas plus qu'un petit.
  parallele: {
    valide: (c, contenu) => c.courbes.every((id) => segment(contenu, id) !== null),
    variables: (c, contenu) => c.courbes.flatMap((id) => variablesDuSegment(contenu, id)),
    residus: (_c, x) => [produitVectoriel(x) / normes(x)],
  },
  perpendiculaire: {
    valide: (c, contenu) => c.courbes.every((id) => segment(contenu, id) !== null),
    variables: (c, contenu) => c.courbes.flatMap((id) => variablesDuSegment(contenu, id)),
    residus: (_c, x) => [produitScalaire(x) / normes(x)],
  },
  egal: {
    valide: (c, contenu) => c.courbes.every((id) => segment(contenu, id) !== null),
    variables: (c, contenu) => c.courbes.flatMap((id) => variablesDuSegment(contenu, id)),
    residus: (_c, x) => [longueur(x) - longueur(x.slice(4))],
  },
};

export const GENRES_COTES = new Set(["longueur", "diametre", "rayon", "angle", "distance", "distanceH", "distanceV", "distanceLigne"]);
// Les cotes dont le signe dit de quel côté de sa référence se tient le point.
const COTES_ORIENTEES = new Set(["distanceH", "distanceV", "distanceLigne"]);

const contraintesDe = (contenu) => contenu.contraintes ?? [];
const valides = (contenu) => contraintesDe(contenu).filter((c) => GENRES[c.genre]?.valide(c, contenu));
const reglesDesArcs = (contenu) => contenu.courbes
  .filter((c) => arc(contenu, c.id) !== null)
  .flatMap((c) => [
    { id: null, genre: "poigneeDArc", courbe: c.id },
    { id: null, genre: "sensDArc", courbe: c.id },
    ...(existe(contenu, c.c) ? [{ id: null, genre: "centreDArc", courbe: c.id }] : []),
  ]);

/* Les centres d'arcs qui ne servent qu'à leur arc : aucun autre tracé ne les partage. */
function centresLibres(contenu) {
  const usages = new Map();
  for (const c of contenu.courbes) {
    for (const id of [c.a, c.b, c.m, c.c, c.centre]) if (id !== undefined) usages.set(id, (usages.get(id) ?? 0) + 1);
  }
  return new Set(contenu.courbes.filter((c) => c.genre === "arc" && usages.get(c.c) === 1).map((c) => c.c));
}

// ── Algèbre ─────────────────────────────────────────────────────────────────

/* Résout A·y = b (A carrée, dense) par élimination de Gauss avec pivot partiel. */
function resoudreSysteme(A, b) {
  const n = b.length;
  const m = A.map((ligne, i) => [...ligne, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let i = col + 1; i < n; i += 1) if (Math.abs(m[i][col]) > Math.abs(m[pivot][col])) pivot = i;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const p = m[col][col];
    if (Math.abs(p) < 1e-300) continue;
    for (let i = col + 1; i < n; i += 1) {
      const f = m[i][col] / p;
      if (f === 0) continue;
      for (let j = col; j <= n; j += 1) m[i][j] -= f * m[col][j];
    }
  }
  const y = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = m[i][n];
    for (let j = i + 1; j < n; j += 1) s -= m[i][j] * y[j];
    y[i] = Math.abs(m[i][i]) < 1e-300 ? 0 : s / m[i][i];
  }
  return y;
}

/* Le rang d'une matrice dense (lignes × colonnes). */
function rang(matrice) {
  const m = matrice.map((ligne) => [...ligne]);
  const colonnes = m[0]?.length ?? 0;
  let r = 0;
  for (let col = 0; col < colonnes && r < m.length; col += 1) {
    let pivot = r;
    for (let i = r + 1; i < m.length; i += 1) if (Math.abs(m[i][col]) > Math.abs(m[pivot][col])) pivot = i;
    if (Math.abs(m[pivot][col]) < 1e-7) continue;
    [m[r], m[pivot]] = [m[pivot], m[r]];
    for (let i = r + 1; i < m.length; i += 1) {
      const f = m[i][col] / m[r][col];
      for (let j = col; j < colonnes; j += 1) m[i][j] -= f * m[r][j];
    }
    r += 1;
  }
  return r;
}

// ── Le système ──────────────────────────────────────────────────────────────

/* Les variables en jeu et, pour chaque contrainte, ses indices. */
function systeme(contenu) {
  const index = new Map();
  const valeurs = [];
  const lignes = [...valides(contenu), ...reglesDesArcs(contenu)].map((c) => ({
    c,
    contenu,
    indices: GENRES[c.genre].variables(c, contenu).map((cle) => {
      if (!index.has(cle)) {
        index.set(cle, valeurs.length);
        valeurs.push(lire(contenu, cle));
      }
      return index.get(cle);
    }),
  }));
  return { index, valeurs, lignes };
}

const evaluer = (ligne, x) => GENRES[ligne.c.genre].residus(ligne.c, ligne.indices.map((i) => x[i]), ligne.contenu);

/* Les écarts et la jacobienne (lignes creuses : [[indice, dérivée], …]). */
function lineariser(lignes, x) {
  const residus = [];
  const jacobienne = [];
  for (const ligne of lignes) {
    const r0 = evaluer(ligne, x);
    const derivees = ligne.indices.map((i) => {
      const garde = x[i];
      x[i] = garde + PAS_DE_DERIVATION;
      const r1 = evaluer(ligne, x);
      x[i] = garde;
      return r1.map((valeur, k) => (valeur - r0[k]) / PAS_DE_DERIVATION);
    });
    r0.forEach((valeur, k) => {
      residus.push(valeur);
      const creuse = new Map();
      ligne.indices.forEach((i, j) => creuse.set(i, (creuse.get(i) ?? 0) + derivees[j][k]));
      jacobienne.push([...creuse]);
    });
  }
  return { residus, jacobienne };
}

const plusGrandEcart = (residus) => residus.reduce((m, r) => Math.max(m, Math.abs(r)), 0);

/* Un pas de norme minimale pondérée : dx = W⁻¹ Jᵀ (J W⁻¹ Jᵀ + λI)⁻¹ (−r). */
function pas(residus, jacobienne, inversePoids) {
  const n = residus.length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const ligneI = new Map(jacobienne[i]);
    for (let j = i; j < n; j += 1) {
      let somme = 0;
      for (const [k, valeur] of jacobienne[j]) {
        const autre = ligneI.get(k);
        if (autre !== undefined) somme += autre * valeur * inversePoids[k];
      }
      A[i][j] = somme;
      A[j][i] = somme;
    }
    A[i][i] += AMORTISSEMENT;
  }
  const y = resoudreSysteme(A, residus.map((r) => -r));
  const dx = new Array(inversePoids.length).fill(0);
  jacobienne.forEach((ligne, i) => {
    for (const [k, valeur] of ligne) dx[k] += inversePoids[k] * valeur * y[i];
  });
  return dx;
}

// Le bruit de calcul (−0, 29,9999999) ne doit ni s'afficher ni s'enregistrer :
// un millionième de millimètre, c'est bien en dessous de ce qu'une imprimante sait faire.
const propre = (valeur) => Math.round(valeur * 1e6) / 1e6 || 0;

function ecrire(contenu, index, x) {
  const points = { ...contenu.points };
  const rayons = new Map();
  for (const [cle, i] of index) {
    const [genre, id, k] = cle.split(":");
    if (genre === "p") {
      points[id] = [...points[id]];
      points[id][Number(k)] = propre(x[i]);
    } else {
      rayons.set(id, Math.max(propre(x[i]), LONGUEUR_ECRASEE_MM));
    }
  }
  const courbes = rayons.size === 0 ? contenu.courbes
    : contenu.courbes.map((c) => (rayons.has(c.id) ? { ...c, rayon: rayons.get(c.id) } : c));
  return { ...contenu, points, courbes };
}

/* Des traits qui avaient une longueur et n'en ont plus : la contrainte les a écrasés. */
function segmentsEcrases(avant, apres) {
  return apres.courbes.filter((c) => {
    if (c.genre !== "segment" && c.genre !== "arc") return false;
    const [a0, b0] = [avant.points[c.a], avant.points[c.b]];
    const [a1, b1] = [apres.points[c.a], apres.points[c.b]];
    if (!a0 || !b0) return false;
    return Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) > LONGUEUR_ECRASEE_MM
      && Math.hypot(b1[0] - a1[0], b1[1] - a1[1]) < LONGUEUR_ECRASEE_MM;
  }).length > 0;
}

/* Avant de calculer, la poignée et le centre libre de chaque arc reprennent la
   place que dit sa bombe : le solveur part d'un arc qui a déjà la bonne forme,
   même si l'un de ses bouts vient de sauter de l'autre côté. Sinon il pouvait
   retourner l'arc, ou l'écraser en un point pour se tirer d'affaire. */
function arcsReplaces(contenu, tenus) {
  const libres = centresLibres(contenu);
  const points = { ...contenu.points };
  let change = false;
  for (const s of contenu.courbes) {
    if (s.genre !== "arc" || !(s.m in points) || !(Math.abs(s.bombe ?? 0) > 1e-9)) continue;
    const [a, b] = [points[s.a], points[s.b]];
    const corde = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (corde < LONGUEUR_ECRASEE_MM) continue;
    const t = s.bombe;
    const gauche = [-(b[1] - a[1]) / corde, (b[0] - a[0]) / corde];
    const recul = (corde * (1 - t * t)) / (4 * t);
    const centre = [(a[0] + b[0]) / 2 + gauche[0] * recul, (a[1] + b[1]) / 2 + gauche[1] * recul];
    // Le sommet : à mi-corde, décalé de la flèche vers la droite pour une bombe positive.
    const fleche = (corde * t) / 2;
    const sommet = [(a[0] + b[0]) / 2 - gauche[0] * fleche, (a[1] + b[1]) / 2 - gauche[1] * fleche];
    if (!tenus.includes(s.m)) {
      points[s.m] = sommet;
      change = true;
    }
    if (s.c in points && libres.has(s.c) && !tenus.includes(s.c)) {
      points[s.c] = centre;
      change = true;
    }
  }
  return change ? { ...contenu, points } : contenu;
}

/* Vrai si un arc nettement petit ou grand est devenu un demi-cercle : son
   centre s'est arrêté sur la corde. */
function arcsAplatis(avant, apres) {
  return avant.courbes.some((s) => {
    if (s.genre !== "arc" || !(s.c in apres.points) || Math.abs(Math.abs(s.bombe ?? 0) - 1) < 4 * ECART_DEMI_CERCLE) return false;
    const [a, b, o] = [apres.points[s.a], apres.points[s.b], apres.points[s.c]];
    const corde = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cote = ((b[0] - a[0]) * (o[1] - a[1]) - (b[1] - a[1]) * (o[0] - a[0])) / Math.max(corde, 1e-9);
    return corde > LONGUEUR_ECRASEE_MM && Math.abs(cote) < 1e-3 * corde;
  });
}

/* Gauss-Newton depuis x, avec ces poids ; rend les valeurs trouvées. */
function converger(lignes, x, inversePoids) {
  let { residus, jacobienne } = lineariser(lignes, x);
  for (let iteration = 0; iteration < ITERATIONS_MAX && plusGrandEcart(residus) > TOLERANCE_MM; iteration += 1) {
    const dx = pas(residus, jacobienne, inversePoids);
    // Un pas trop long peut faire pire : on le raccourcit jusqu'à ce qu'il aide.
    const ecartAvant = plusGrandEcart(residus);
    let facteur = 1;
    let essai;
    for (let tentative = 0; tentative < 8; tentative += 1) {
      essai = x.map((valeur, i) => valeur + facteur * dx[i]);
      const lin = lineariser(lignes, essai);
      if (plusGrandEcart(lin.residus) < ecartAvant || tentative === 7) {
        ({ residus, jacobienne } = lin);
        break;
      }
      facteur /= 2;
    }
    x = essai;
  }
  return x;
}

/*
 * Rend { contenu, ok, enConflit } : le contenu aux points déplacés, et les
 * contraintes restées fausses. tenus : les points que la souris tient.
 */
export function resoudre(donne, tenus = []) {
  const contenu = arcsReplaces(donne, tenus);
  const { index, valeurs, lignes } = systeme(contenu);
  if (lignes.length === 0) return { contenu, ok: true, enConflit: [] };

  const tenusSet = new Set(tenus);
  const poignees = new Set(contenu.courbes.filter((c) => c.genre === "arc" && c.m !== undefined).map((c) => c.m));
  const centres = centresLibres(contenu);
  const poidsDe = (souples) => [...index.keys()].map((cle) => {
    const [genre, id] = cle.split(":");
    if (genre !== "p") return 1;
    if (tenusSet.has(id)) return 1 / POIDS_TENU;
    if (!souples) return 1;
    if (centres.has(id)) return SOUPLESSE_CENTRE;
    return poignees.has(id) ? SOUPLESSE_POIGNEE : 1;
  });
  // D'abord avec les poignées et les centres souples, pour que le dessin bouge
  // comme on l'attend. S'ils butent (un arc qu'on rétrécit sous sa corde doit
  // rapprocher ses bouts), on recommence à poids égaux.
  // Un arc qui finit en demi-cercle alors qu'il était nettement petit ou grand
  // a buté sur sa règle de forme : c'est un échec aussi.
  const defauts = (valeursTrouvees) => plusGrandEcart(lineariser(lignes, valeursTrouvees).residus)
    + (arcsAplatis(contenu, ecrire(contenu, index, valeursTrouvees)) ? 1 : 0);
  let x = converger(lignes, [...valeurs], poidsDe(true));
  if (defauts(x) > TOLERANCE_CONFLIT_MM) {
    const autre = converger(lignes, [...valeurs], poidsDe(false));
    if (defauts(autre) < defauts(x)) x = autre;
  }

  const fausses = lignes.filter((ligne) => evaluer(ligne, x).some((r) => Math.abs(r) > TOLERANCE_CONFLIT_MM));
  const apres = ecrire(contenu, index, x);
  const ok = fausses.length === 0 && !segmentsEcrases(contenu, apres);
  return { contenu: apres, ok, enConflit: fausses.map((ligne) => ligne.c.id).filter((id) => id !== null) };
}

/* Les contraintes que le dessin, tel qu'il est, ne respecte pas : une
   esquisse enregistrée ainsi a un problème (contradiction, référence qui a
   bougé sans que le dessin puisse suivre). */
export function contraintesFausses(contenu) {
  const { valeurs, lignes } = systeme(contenu);
  return lignes
    .filter((ligne) => evaluer(ligne, valeurs).some((r) => Math.abs(r) > TOLERANCE_CONFLIT_MM))
    .map((ligne) => ligne.c.id)
    .filter((id) => id !== null);
}

/* Les degrés de liberté qui restent : chaque point en a deux, chaque cercle
   un de plus (son rayon), et chaque contrainte indépendante en retire. */
export function degresDeLiberte(contenu) {
  const cercles = contenu.courbes.filter((c) => c.genre === "cercle").length;
  const total = Object.keys(contenu.points).length * 2 + cercles;
  const { valeurs, lignes } = systeme(contenu);
  if (lignes.length === 0) return total;
  const { jacobienne } = lineariser(lignes, [...valeurs]);
  const dense = jacobienne.map((ligne) => {
    const rangee = new Array(valeurs.length).fill(0);
    for (const [k, valeur] of ligne) rangee[k] = valeur;
    return rangee;
  });
  return total - rang(dense);
}

/*
 * Les contraintes qui n'imposent rien de plus que celles d'avant : un point
 * sur l'origine, un autre sur l'axe X, et le segment qui les joint déclaré
 * horizontal — le troisième est déjà vrai. Le solveur s'en accommode, mais
 * l'élève croit tenir le dessin par trois liens quand deux suffisent, et en
 * retirer un ne libère rien. On les lit dans l'ordre de pose : c'est la plus
 * récente du groupe qui est désignée.
 *
 * Chaque ligne de la jacobienne est projetée sur celles déjà retenues ; ce
 * qui reste de trop petit n'apporte aucune direction nouvelle.
 */
const RESTE_MINIMAL = 1e-5;

function rangeesIndependantes(base, lignesCreuses, taille) {
  let ajoutees = 0;
  for (const creuse of lignesCreuses) {
    const v = new Array(taille).fill(0);
    for (const [k, valeur] of creuse) v[k] += valeur;
    let norme = Math.hypot(...v);
    if (norme < 1e-12) continue;
    for (let i = 0; i < taille; i += 1) v[i] /= norme;
    for (const u of base) {
      let produit = 0;
      for (let i = 0; i < taille; i += 1) produit += u[i] * v[i];
      if (produit !== 0) for (let i = 0; i < taille; i += 1) v[i] -= produit * u[i];
    }
    norme = Math.hypot(...v);
    if (norme < RESTE_MINIMAL) continue;
    for (let i = 0; i < taille; i += 1) v[i] /= norme;
    base.push(v);
    ajoutees += 1;
  }
  return ajoutees;
}

export function contraintesRedondantes(contenu) {
  const { valeurs, lignes } = systeme(contenu);
  if (lignes.length === 0) return [];
  // Les règles des arcs d'abord : elles font partie du tracé, pas des choix de l'élève.
  const ordonnees = [...lignes.filter((l) => l.c.id === null), ...lignes.filter((l) => l.c.id !== null)];
  const base = [];
  const redondantes = [];
  for (const ligne of ordonnees) {
    const { jacobienne } = lineariser([ligne], [...valeurs]);
    const ajoutees = rangeesIndependantes(base, jacobienne, valeurs.length);
    if (ligne.c.id !== null && ajoutees < jacobienne.length) redondantes.push(ligne.c.id);
  }
  return redondantes;
}

/* Vrai si cette contrainte, posée en plus, n'imposerait rien de neuf. */
export function seraitRedondante(contenu, contrainte) {
  const essai = { ...contenu, contraintes: [...contraintesDe(contenu), { ...contrainte, id: "essai" }] };
  if (!GENRES[contrainte.genre]?.valide(contrainte, essai)) return false;
  return contraintesRedondantes(essai).includes("essai");
}

// ── Modifier les contraintes ────────────────────────────────────────────────

function prochainId(contraintes) {
  let plusGrand = 0;
  for (const c of contraintes) plusGrand = Math.max(plusGrand, Number(c.id) || 0);
  return String(plusGrand + 1);
}

/* Ce qui désigne les éléments d'une contrainte : deux contraintes de même
   genre sur les mêmes éléments sont un doublon. */
function signature(c) {
  const courbes = c.courbes ? [...c.courbes].sort().join(",") : c.courbe ?? "";
  return [c.genre, c.a ?? "", c.b ?? "", c.axe ?? "", courbes, c.esquisse ?? "", c.point ?? ""].join("|");
}

const existeDeja = (contenu, contrainte) => contraintesDe(contenu).some((c) => signature(c) === signature(contrainte));

export function ajouterContrainte(contenu, contrainte) {
  const contraintes = contraintesDe(contenu);
  if (existeDeja(contenu, contrainte)) {
    throw new Error("Cette contrainte existe déjà.");
  }
  const id = prochainId(contraintes);
  return { contenu: { ...contenu, contraintes: [...contraintes, { ...contrainte, id }] }, id };
}

/*
 * Ce que le tracé dit de lui-même, posé d'office : un point tracé (ou glissé)
 * sur l'origine y est fixé, sur un axe il y reste, un segment tracé à
 * l'horizontale ou à la verticale le reste. Seulement pour ce qui vient d'être
 * tracé ou déplacé : une contrainte retirée à la main ne revient pas d'elle-même.
 */
/* tenus : les points que la souris vient de poser ou de glisser. Les autres
   ont pu bouger sous l'effet des contraintes : leur place n'est pas un choix. */
export function avecContraintesAutomatiques(avant, apres, tenus = []) {
  let resultat = apres;
  // Une contrainte que les autres imposent déjà n'est pas posée : le dessin
  // resterait tenu deux fois au même endroit.
  const poser = (contrainte) => {
    if (existeDeja(resultat, contrainte) || seraitRedondante(resultat, contrainte)) return;
    resultat = ajouterContrainte(resultat, contrainte).contenu;
  };
  const poignees = new Set(apres.courbes.map((c) => c.m).filter((m) => m !== undefined));
  for (const [id, [u, v]] of Object.entries(apres.points)) {
    // Un point neuf, ou un point qu'on vient de glisser : là où il tombe, c'est
    // voulu — l'étiquette « sur X » s'affichait au moment du clic.
    const ancien = avant.points[id];
    const deplace = ancien !== undefined && tenus.includes(id) && Math.hypot(ancien[0] - u, ancien[1] - v) > 1e-9;
    if ((ancien !== undefined && !deplace) || poignees.has(id)) continue;
    const surU = Math.abs(v) < 1e-6;   // sur l'axe horizontal
    const surV = Math.abs(u) < 1e-6;   // sur l'axe vertical
    if (surU && surV) poser({ genre: "origine", a: id });
    else if (surU) poser({ genre: "surAxe", a: id, axe: "horizontal" });
    else if (surV) poser({ genre: "surAxe", a: id, axe: "vertical" });
  }
  const anciennes = new Set(avant.courbes.map((c) => c.id));
  for (const c of apres.courbes) {
    if (c.genre !== "segment" || anciennes.has(c.id)) continue;
    const [a, b] = [apres.points[c.a], apres.points[c.b]];
    if (Math.abs(b[1] - a[1]) < 1e-6) poser({ genre: "horizontal", courbe: c.id });
    else if (Math.abs(b[0] - a[0]) < 1e-6) poser({ genre: "vertical", courbe: c.id });
  }
  return resultat;
}

/* De combien l'étiquette d'une contrainte a été écartée à la main, en
   millimètres dans le plan de l'esquisse. [0, 0] la remet à sa place. */
export function changerDecalage(contenu, id, decalage) {
  const nul = Math.hypot(decalage[0], decalage[1]) < 1e-9;
  return {
    ...contenu,
    contraintes: contraintesDe(contenu).map((c) => {
      if (c.id !== id) return c;
      const suivante = { ...c, decalage: [decalage[0], decalage[1]] };
      if (nul) delete suivante.decalage;
      return suivante;
    }),
  };
}

export function supprimerContrainte(contenu, id) {
  return { ...contenu, contraintes: contraintesDe(contenu).filter((c) => c.id !== id) };
}

/* Une nouvelle valeur de cote. Pour un écart horizontal ou vertical, une
   valeur négative fait passer le point de l'autre côté de sa référence. */
/* formule : le calcul sur les variables qui pilote la cote, ou null pour une
   valeur tapée — qui retire alors la formule d'avant. */
export function changerValeur(contenu, id, valeur, formule = null) {
  if (!Number.isFinite(valeur)) throw new Error("Cette valeur n'est pas un nombre.");
  return {
    ...contenu,
    contraintes: contraintesDe(contenu).map((contrainte) => {
      if (contrainte.id !== id) return contrainte;
      const { formule: _ancienne, ...c } = contrainte;
      if (formule !== null) c.formule = formule;
      if (COTES_ORIENTEES.has(c.genre)) {
        return { ...c, valeur: Math.abs(valeur), sens: valeur < 0 ? -c.sens : c.sens };
      }
      if (c.genre === "angle") {
        if (!(valeur > 0) || valeur >= 180) throw new Error("Un angle se donne entre 0 et 180 degrés.");
        return { ...c, valeur };
      }
      if (!(valeur > 0)) throw new Error("Une longueur doit être positive.");
      return { ...c, valeur };
    }),
  };
}

/* Retire les contraintes dont un élément a disparu (un tracé effacé). */
export function sansContraintesOrphelines(contenu) {
  const contraintes = contraintesDe(contenu);
  if (contraintes.length === 0) return contenu;
  const gardees = contraintes.filter((c) => GENRES[c.genre]?.valide(c, contenu));
  return gardees.length === contraintes.length ? contenu : { ...contenu, contraintes: gardees };
}

/* Un point soudé à un autre : ses contraintes passent au point gardé. */
export function remplacerPointDansContraintes(contenu, garde, retire) {
  const contraintes = contraintesDe(contenu);
  if (contraintes.length === 0) return contenu;
  const remplacer = (id) => (id === retire ? garde : id);
  return {
    ...contenu,
    contraintes: contraintes.map((c) => ({ ...c, ...(c.a !== undefined ? { a: remplacer(c.a) } : {}), ...(c.b ? { b: remplacer(c.b) } : {}) })),
  };
}

// ── Mesurer, pour poser une cote à sa valeur actuelle ──────────────────────

/* La contrainte d'une cote, à la valeur que le dessin a déjà. */
export function coteActuelle(contenu, contrainte) {
  const p = (id) => (id === null ? [0, 0] : contenu.points[id]);
  const { genre } = contrainte;
  if (genre === "longueur") {
    const s = segment(contenu, contrainte.courbe);
    const [a, b] = [contenu.points[s.a], contenu.points[s.b]];
    return { ...contrainte, valeur: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  }
  if (genre === "diametre") return { ...contrainte, valeur: 2 * cercle(contenu, contrainte.courbe).rayon };
  if (genre === "rayon") {
    const s = arc(contenu, contrainte.courbe);
    return { ...contrainte, valeur: rayonCirconscrit([...contenu.points[s.a], ...contenu.points[s.b], ...contenu.points[s.m]]) };
  }
  if (genre === "angle") {
    const [s1, s2] = contrainte.courbes.map((id) => segment(contenu, id));
    const direction = (s) => [contenu.points[s.b][0] - contenu.points[s.a][0], contenu.points[s.b][1] - contenu.points[s.a][1]];
    const [u, v] = [direction(s1), direction(s2)];
    const angle = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI;
    return { ...contrainte, valeur: Math.round(angle * 10) / 10 };
  }
  if (genre === "distanceLigne") {
    const s = segment(contenu, contrainte.courbe);
    const d = distanceSignee([...contenu.points[contrainte.a], ...contenu.points[s.a], ...contenu.points[s.b]]);
    return { ...contrainte, valeur: Math.abs(d), sens: d < 0 ? -1 : 1 };
  }
  const [a, b] = [p(contrainte.a), p(contrainte.b)];
  if (genre === "distance") return { ...contrainte, valeur: Math.hypot(a[0] - b[0], a[1] - b[1]) };
  const i = genre === "distanceH" ? 0 : 1;
  const ecart = a[i] - b[i];
  return { ...contrainte, valeur: Math.abs(ecart), sens: ecart < 0 ? -1 : 1 };
}

// ── Ce que la vue dessine ──────────────────────────────────────────────────

const SYMBOLES = {
  horizontal: "H", vertical: "V", parallele: "∥", perpendiculaire: "⊥", egal: "=", origine: "sur l'origine", fixe: "Fixe",
  tangente: "T", concentrique: "◎", surReference: "sur la référence",
};

export const NOMS_DES_CONTRAINTES = {
  longueur: "Longueur", diametre: "Diamètre", rayon: "Rayon", distance: "Distance", distanceH: "Distance horizontale",
  distanceV: "Distance verticale", distanceLigne: "Distance au segment", angle: "Angle",
  tangente: "Tangent", concentrique: "Même centre", horizontal: "Horizontal", vertical: "Vertical", surAxe: "Sur un axe",
  origine: "Sur l'origine", fixe: "Fixé", reference: "Point de référence", surReference: "Sur un point de référence", parallele: "Parallèle", perpendiculaire: "Perpendiculaire", egal: "Égal",
};

const milieu = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const decale = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d];

/* Le centre du cercle qui passe par trois points, ou null s'ils sont alignés. */
function centreCirconscrit(a, b, m) {
  const d = 2 * (a[0] * (b[1] - m[1]) + b[0] * (m[1] - a[1]) + m[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-12) return null;
  const [la, lb, lm] = [a, b, m].map((p) => p[0] * p[0] + p[1] * p[1]);
  return [
    (la * (b[1] - m[1]) + lb * (m[1] - a[1]) + lm * (a[1] - b[1])) / d,
    (la * (m[0] - b[0]) + lb * (a[0] - m[0]) + lm * (b[0] - a[0])) / d,
  ];
}

/* La normale à gauche d'un segment, unitaire. */
function normale(a, b) {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
}

/*
 * Les traits de cote et les étiquettes, dans le plan (u, v). ecart : le recul
 * des lignes de cote, en millimètres (quelques pixels à l'écran).
 * nomsDesAxes : { horizontal: "X", vertical: "Z" }, pour écrire « sur X ».
 * Rend { traits: [{ points, conflit }], etiquettes: [{ id, uv, texte, cote, nom, conflit }] }.
 */
export function dessinDesContraintes(contenu, ecart, nomsDesAxes, enConflit = []) {
  const conflits = new Set(enConflit);
  const traits = [];
  const etiquettes = [];
  const p = (id) => (id === null ? [0, 0] : contenu.points[id]);

  for (const c of valides(contenu)) {
    if (c.genre === "reference") continue;
    const conflit = conflits.has(c.id);
    const ecarte = c.decalage ?? [0, 0];
    // La place que le logiciel donne à l'étiquette, plus ce que l'élève a ajouté en la glissant.
    const etiquette = (base, texte, cote) => etiquettes.push({
      id: c.id, uv: [base[0] + ecarte[0], base[1] + ecarte[1]], base, texte, cote,
      nom: NOMS_DES_CONTRAINTES[c.genre], conflit, genre: c.genre,
    });
    const trait = (...points) => traits.push({ points, conflit });

    if (c.genre === "longueur" || c.genre === "distance") {
      const [a, b] = c.genre === "longueur"
        ? (() => { const s = segment(contenu, c.courbe); return [p(s.a), p(s.b)]; })()
        : [p(c.a), p(c.b)];
      const n = normale(a, b);
      // La ligne de cote suit l'étiquette : la glisser l'éloigne du tracé.
      const recul = ecart + ecarte[0] * n[0] + ecarte[1] * n[1];
      const [a2, b2] = [decale(a, n, recul), decale(b, n, recul)];
      trait(a, decale(a, n, recul * 1.15));
      trait(b, decale(b, n, recul * 1.15));
      trait(a2, b2);
      const long = [b[0] - a[0], b[1] - a[1]];
      const glissement = (ecarte[0] * long[0] + ecarte[1] * long[1]) / Math.max(long[0] * long[0] + long[1] * long[1], 1e-9);
      const centre = milieu(a2, b2);
      etiquettes.push({
        id: c.id, uv: [centre[0] + long[0] * glissement, centre[1] + long[1] * glissement], base: milieu(a, b),
        texte: cote(c.valeur), cote: true, nom: NOMS_DES_CONTRAINTES[c.genre], conflit, genre: c.genre,
      });
    } else if (c.genre === "distanceH" || c.genre === "distanceV") {
      const a = p(c.a);
      const ref = p(c.b);
      const h = c.genre === "distanceH";
      // La ligne de cote court le long de la direction mesurée, à la hauteur de l'étiquette.
      const niveau = h ? a[1] + ecarte[1] : a[0] + ecarte[0];
      const [depart, arrivee] = h ? [[ref[0], niveau], [a[0], niveau]] : [[niveau, ref[1]], [niveau, a[1]]];
      trait(depart, arrivee);
      trait(arrivee, a);
      if (c.b !== null) trait(depart, ref);
      const centre = milieu(depart, arrivee);
      etiquettes.push({
        id: c.id, uv: h ? [centre[0] + ecarte[0], centre[1]] : [centre[0], centre[1] + ecarte[1]],
        base: milieu(h ? [ref[0], a[1]] : [a[0], ref[1]], a),
        texte: cote(c.valeur), cote: true, nom: NOMS_DES_CONTRAINTES[c.genre], conflit, genre: c.genre,
      });
    } else if (c.genre === "rayon") {
      const s = arc(contenu, c.courbe);
      const m = p(s.m);
      const centre = centreCirconscrit(p(s.a), p(s.b), m);
      if (centre !== null) trait(centre, m);
      etiquette(centre === null ? m : milieu(centre, m), "R" + cote(c.valeur), true);
    } else if (c.genre === "distanceLigne") {
      // Du point au pied de la perpendiculaire, prolongé jusqu'au segment s'il tombe à côté.
      const s = segment(contenu, c.courbe);
      const [a, b, point] = [p(s.a), p(s.b), p(c.a)];
      const [du, dv] = [b[0] - a[0], b[1] - a[1]];
      const t = ((point[0] - a[0]) * du + (point[1] - a[1]) * dv) / Math.max(du * du + dv * dv, 1e-12);
      const pied = [a[0] + t * du, a[1] + t * dv];
      trait(point, pied);
      if (t < 0) trait(pied, a);
      if (t > 1) trait(pied, b);
      etiquette(milieu(point, pied), cote(c.valeur), true);
    } else if (c.genre === "diametre") {
      const cc = cercle(contenu, c.courbe);
      const centre = p(cc.centre);
      const d = [Math.SQRT1_2 * cc.rayon, Math.SQRT1_2 * cc.rayon];
      trait([centre[0] - d[0], centre[1] - d[1]], [centre[0] + d[0], centre[1] + d[1]]);
      etiquette([centre[0] + d[0], centre[1] + d[1]], "Ø" + cote(c.valeur), true);
    } else if (c.genre === "angle") {
      const [s1, s2] = c.courbes.map((id) => segment(contenu, id));
      const [m1, m2] = [milieu(p(s1.a), p(s1.b)), milieu(p(s2.a), p(s2.b))];
      etiquette(milieu(m1, m2), cote(c.valeur) + "°", true);
    } else if (c.genre === "horizontal" || c.genre === "vertical") {
      const s = segment(contenu, c.courbe);
      const [a, b] = [p(s.a), p(s.b)];
      etiquette(decale(milieu(a, b), normale(a, b), -ecart), SYMBOLES[c.genre], false);
    } else if (c.genre === "parallele" || c.genre === "perpendiculaire" || c.genre === "egal"
      || c.genre === "tangente" || c.genre === "concentrique") {
      for (const id of c.courbes) {
        const s = segment(contenu, id) ?? cercle(contenu, id) ?? arc(contenu, id);
        if (s === null) continue;
        const ancre = s.genre === "cercle" ? [p(s.centre)[0] + s.rayon, p(s.centre)[1]]
          : decale(milieu(p(s.a), p(s.b)), normale(p(s.a), p(s.b)), -ecart);
        etiquette(ancre, SYMBOLES[c.genre], false);
      }
    } else if (c.genre === "surAxe") {
      const a = p(c.a);
      etiquette([a[0] + ecart, a[1] + ecart], "sur " + nomsDesAxes[c.axe], false);
    } else {
      const a = p(c.a);
      etiquette([a[0] + ecart, a[1] + ecart], SYMBOLES[c.genre], false);
    }
  }

  return { traits, etiquettes: ecarterLesEtiquettes(etiquettes, ecart) };
}

/* Deux étiquettes au même endroit sont illisibles : celles qui se recouvrent
   montent d'un cran. Seules les non déplacées bougent — une étiquette posée à
   la main reste où l'élève l'a mise. */
function ecarterLesEtiquettes(etiquettes, ecart) {
  const posees = [];
  const hauteur = ecart * 1.6;
  const largeur = ecart * 2.4;
  return etiquettes.map((e) => {
    let uv = e.uv;
    for (let essai = 0; essai < 6; essai += 1) {
      const gene = posees.some((autre) => Math.abs(autre[0] - uv[0]) < largeur && Math.abs(autre[1] - uv[1]) < hauteur);
      if (!gene) break;
      uv = [uv[0], uv[1] + hauteur];
    }
    posees.push(uv);
    return { ...e, uv };
  });
}
