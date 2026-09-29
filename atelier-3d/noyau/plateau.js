/*
 * noyau/plateau.js
 * ────────────────
 * Le plateau d'impression : quelles pièces y sont posées, et comment. Fonctions
 * pures, sans three.js : elles tournent sous Node comme dans le navigateur.
 *
 * document.impression : { imprimante, buse, plaque, materiau, reglages, ecarts,
 *                        pieces: [{ id, source, partie, x, y, rotation }] }
 *
 *   imprimante, buse, plaque, materiau, reglages  les cinq préréglages de
 *                       tranchage, dans l'ordre où on les choisit, et ecarts ce
 *                       qui en diffère (voir noyau/reglages_impression.js)
 *
 *   source    identifiant de l'objet de la conception (un objet affichable)
 *   partie    null ; ou le rang d'une pièce d'un objet paramétrique éclaté
 *             sur le plateau (le mâle et la femelle du Clip A, séparés)
 *   x, y      centre de la pièce vue de dessus, en millimètres du plateau :
 *             (0, 0) est le coin avant gauche, comme dans les trancheurs
 *   rotation  orientation de la pièce sur le plateau, en degrés (même
 *             convention que les nœuds : Rz·Ry·Rx). rotation.z est donc le
 *             tour autour de la verticale.
 *
 * La position sur le plateau est INDÉPENDANTE de la position d'assemblage :
 * coucher une pièce pour l'imprimer ne la déplace pas dans la conception.
 * La hauteur n'est pas enregistrée : une pièce repose toujours sur le
 * plateau, même après une modification de sa forme.
 *
 * L'échelle, elle, vient de la conception : c'est la taille de la pièce.
 */

import { objetsAffichables } from "./objets_affichables.js";
import { pretPourLeCalcul } from "./bibliotheque_d_objets.js";
import { composer, decomposer, matriceDeTransformation } from "./transformations.js";
import { nouvelIdentifiant } from "./noeud.js";
import {
  SOURCES, IMPRIMANTE_PAR_DEFAUT, BUSE_PAR_DEFAUT, PLAQUE_PAR_DEFAUT,
  MATERIAU_PAR_DEFAUT, REGLAGES_PAR_DEFAUT,
  choixCoherents, valeurEffective, ecartsNettoyes,
} from "./reglages_impression.js";

// ── Machines ────────────────────────────────────────────────────────────────

// La rétraction, la levée et l'essuyage sont des réglages (onglet Extrusion) :
// seule la part de rétraction faite pendant l'essuyage reste fixe, comme dans Bambu Studio.
export const PART_ESSUYAGE = 0.95;

export const MACHINES = Object.freeze([
  // preparation : chauffe, nivellement et purge avant la première couche, en secondes (estimation Bambu Studio).
  // modele : le code que l'imprimante attend dans le fichier (slice_info.config).
  // ventilateurs : P1S seul a le ventilateur auxiliaire et celui du caisson.
  Object.freeze({ id: "p1s", nom: "Bambu Lab P1S", modele: "C12", largeur: 256, profondeur: 256, hauteur: 256, preparation: 376, caisson: true }),
  Object.freeze({ id: "p1p", nom: "Bambu Lab P1P", modele: "C11", largeur: 256, profondeur: 256, hauteur: 256, preparation: 376, caisson: false }),
]);
// Le matériel par défaut, quand un préréglage d'imprimante ne dit rien.
export const MACHINE_PAR_DEFAUT = "p1s";

// Entre deux pièces rangées par « Disposer », et entre une pièce et le bord.
export const ECART_PAR_DEFAUT_MM = 6;
// Une pièce qui dépasse le plateau de moins que ça n'est pas signalée : c'est l'arrondi.
const TOLERANCE_MM = 0.01;
// Les places calculées (Disposer, place libre) sont arrondies au dixième : c'est ce qu'on lit dans l'inspecteur.
const auDixieme = (v) => Math.round(v * 10) / 10;

export const IMPRESSION_VIDE = Object.freeze({
  imprimante: IMPRIMANTE_PAR_DEFAUT, buse: BUSE_PAR_DEFAUT, plaque: PLAQUE_PAR_DEFAUT,
  materiau: MATERIAU_PAR_DEFAUT, reglages: REGLAGES_PAR_DEFAUT,
  ecarts: Object.freeze({}), pieces: Object.freeze([]),
});

/* Le matériel visé : un seul préréglage couvre les deux P1, « Machine visée » les départage. */
export function machineDe(impression) {
  const modele = impression === null ? MACHINE_PAR_DEFAUT : valeurEffective(impression, "modele_machine");
  return MACHINES.find((m) => m.id === modele) ?? MACHINES.find((m) => m.id === MACHINE_PAR_DEFAUT);
}

export function impressionDe(document) {
  return document.impression ?? IMPRESSION_VIDE;
}

// ── Pièces ──────────────────────────────────────────────────────────────────

const ROTATION_NULLE = Object.freeze({ x: 0, y: 0, z: 0 });

const nombre = (v, defaut = 0) => (Number.isFinite(v) ? v : defaut);

export function creerPiece(champs) {
  const rotation = champs.rotation ?? ROTATION_NULLE;
  return Object.freeze({
    id: champs.id ?? nouvelIdentifiant(),
    source: champs.source,
    partie: Number.isInteger(champs.partie) ? champs.partie : null,
    x: nombre(champs.x),
    y: nombre(champs.y),
    rotation: Object.freeze({ x: nombre(rotation.x), y: nombre(rotation.y), z: nombre(rotation.z) }),
  });
}

export function avecPieces(impression, pieces) {
  return Object.freeze({ ...impression, pieces: Object.freeze(pieces.map(creerPiece)) });
}

/*
 * D'autres préréglages, ou d'autres écarts : les écarts égaux aux préréglages
 * disparaissent. Changer de buse peut rendre la plaque, le matériau et les
 * réglages d'impression caducs : choixCoherents les remplace par ceux de la
 * nouvelle buse.
 * modifications : { imprimante?, buse?, plaque?, materiau?, reglages?, ecarts? }
 */
export function avecReglages(impression, modifications) {
  const suivante = { ...impression, ...modifications, ...choixCoherents({ ...impression, ...modifications }) };
  return Object.freeze({ ...suivante, ecarts: Object.freeze(ecartsNettoyes(suivante, suivante.ecarts)) });
}

export function modifierPieces(impression, ids, modifier) {
  const choisies = new Set(ids);
  return avecPieces(impression, impression.pieces.map((p) => (choisies.has(p.id) ? creerPiece({ ...p, ...modifier(p) }) : p)));
}

/* Rien à enregistrer : le fichier du projet n'a pas de section impression. */
export function impressionEstVide(impression) {
  return impression === null || (impression.pieces.length === 0
    && SOURCES.every(({ id }) => impression[id] === IMPRESSION_VIDE[id])
    && Object.keys(impression.ecarts).length === 0);
}

/* Relecture d'un fichier : ce qui n'a pas la forme d'une pièce est laissé de côté. */
export function impressionDepuisBrut(brut) {
  if (brut === null || typeof brut !== "object") return null;
  const pieces = (Array.isArray(brut.pieces) ? brut.pieces : [])
    .filter((p) => p && typeof p.id === "string" && typeof p.source === "string");
  // Les fichiers d'avant les cinq préréglages n'avaient qu'une machine, un
  // traitement et un filament, dont plus aucun n'existe : choixCoherents les
  // remplace par les préréglages d'aujourd'hui.
  const choix = { imprimante: brut.imprimante, buse: brut.buse, plaque: brut.plaque, materiau: brut.materiau, reglages: brut.reglages };
  return avecPieces(avecReglages(IMPRESSION_VIDE, { ...choix, ecarts: brut.ecarts ?? {} }), pieces);
}

export function impressionVersBrut(impression) {
  return {
    ...Object.fromEntries(SOURCES.map(({ id }) => [id, impression[id]])),
    ecarts: { ...impression.ecarts },
    pieces: impression.pieces.map((p) => {
      const brut = { id: p.id, source: p.source, x: p.x, y: p.y };
      if (p.partie !== null) brut.partie = p.partie;
      if (p.rotation.x !== 0 || p.rotation.y !== 0 || p.rotation.z !== 0) brut.rotation = { ...p.rotation };
      return brut;
    }),
  };
}

// ── Ce que le plateau montre ────────────────────────────────────────────────

/* Les objets de la conception qui peuvent partir à l'impression : ceux qu'on
   voit, sauf les trous seuls, qui ne creusent rien. */
export function objetsImprimables(document) {
  return objetsAffichables(document).filter((noeud) => !noeud.trou);
}

/* Les pièces qu'un objet paramétrique peut donner séparément sur le plateau :
   ses pièces pleines, s'il en a plusieurs et aucun trou (un trou creuse
   l'ensemble : séparer les pièces changerait leur forme). */
export function partiesSeparables(noeudCalcule) {
  if (noeudCalcule.type !== "objet_parametrique") return [];
  const pieces = noeudCalcule.enfants.filter((e) => e.visible);
  if (pieces.length < 2 || pieces.some((e) => e.trou)) return [];
  return pieces.map((e) => noeudCalcule.enfants.indexOf(e));
}

/*
 * Les pièces du plateau dont l'objet existe encore dans la conception, avec ce
 * qu'il faut pour les montrer :
 *   { piece, source, noeud (prêt pour le calcul, sans sa transformation), echelle }
 * Un objet supprimé, masqué ou devenu trou disparaît du plateau ; il y revient
 * si on annule, à la même place.
 */
export function piecesPresentes(document) {
  const imprimables = new Map(objetsImprimables(document).map((n) => [n.id, n]));
  const resultat = [];
  for (const piece of impressionDe(document).pieces) {
    const source = imprimables.get(piece.source);
    if (source === undefined) continue;
    const calcule = pretPourLeCalcul(document, source);
    if (piece.partie === null) {
      resultat.push({ piece, source, noeud: calcule, echelle: source.transformation.echelle });
      continue;
    }
    if (!partiesSeparables(calcule).includes(piece.partie)) continue;
    const enfant = calcule.enfants[piece.partie];
    resultat.push({ piece, source, noeud: enfant, echelle: enfant.transformation.echelle });
  }
  return resultat;
}

/* Les objets imprimables qui n'ont encore aucune pièce sur le plateau. */
export function objetsHorsPlateau(document) {
  const places = new Set(impressionDe(document).pieces.map((p) => p.source));
  return objetsImprimables(document).filter((n) => !places.has(n.id));
}

// ── Orientation ─────────────────────────────────────────────────────────────

const rotationSeule = (rotation) => matriceDeTransformation({
  position: { x: 0, y: 0, z: 0 }, rotation, echelle: { x: 1, y: 1, z: 1 },
});

/* L'orientation qu'a la pièce dans l'assemblage : c'est celle qu'elle prend
   en arrivant sur le plateau, pour qu'on la reconnaisse. */
export function rotationDAssemblage(source, partie, noeudCalcule) {
  if (partie === null) return source.transformation.rotation;
  const enfant = noeudCalcule.enfants[partie];
  return decomposer(composer(rotationSeule(source.transformation.rotation), rotationSeule(enfant.transformation.rotation))).rotation;
}

/*
 * La rotation qui pose la face de normale n (dans le repère du plateau) à plat
 * sur le plateau : n est amené sur -Z par le plus court chemin (Rodrigues).
 */
export function rotationPourPoserAPlat(rotation, [nx, ny, nz]) {
  const longueur = Math.hypot(nx, ny, nz) || 1;
  const [ax, ay, az] = [nx / longueur, ny / longueur, nz / longueur];
  // Axe = n × (0, 0, -1), cosinus = n · (0, 0, -1).
  let [kx, ky, kz] = [-ay, ax, 0];
  const cos = -az;
  const sin = Math.hypot(kx, ky);
  if (sin < 1e-9) {
    if (cos > 0) return rotation;                       // déjà à plat
    [kx, ky, kz] = [1, 0, 0];                            // face vers le haut : un demi-tour
  } else {
    [kx, ky, kz] = [kx / sin, ky / sin, kz / sin];
  }
  const s = sin < 1e-9 ? 0 : sin;
  const c = sin < 1e-9 ? -1 : cos;
  const t = 1 - c;
  const alignement = [
    t * kx * kx + c, t * kx * ky - s * kz, t * kx * kz + s * ky, 0,
    t * kx * ky + s * kz, t * ky * ky + c, t * ky * kz - s * kx, 0,
    t * kx * kz - s * ky, t * ky * kz + s * kx, t * kz * kz + c, 0,
  ];
  return decomposer(composer(alignement, rotationSeule(rotation))).rotation;
}

// ── Emprise ─────────────────────────────────────────────────────────────────

/* Enveloppe convexe de points 2D (chaîne monotone d'Andrew), sens trigonométrique. */
function enveloppeConvexe(points) {
  const tries = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (tries.length < 3) return tries;
  const produit = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas = [];
  for (const p of tries) {
    while (bas.length >= 2 && produit(bas.at(-2), bas.at(-1), p) <= 0) bas.pop();
    bas.push(p);
  }
  const haut = [];
  for (const p of tries.reverse()) {
    while (haut.length >= 2 && produit(haut.at(-2), haut.at(-1), p) <= 0) haut.pop();
    haut.push(p);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

/*
 * La forme d'une pièce tournée comme sur le plateau, avant de la placer :
 *   boite    { min, max } dans le repère de la pièce tournée
 *   contour  enveloppe convexe de sa vue de dessus, centrée sur le centre de la boîte
 * positions : Float32Array du maillage, construit à l'origine.
 * Les sommets sont arrondis au dixième de millimètre pour l'enveloppe : des
 * milliers de sommets presque confondus ne changent rien au contour.
 */
export function formeTournee(positions, rotation, echelle) {
  const m = matriceDeTransformation({ position: { x: 0, y: 0, z: 0 }, rotation, echelle });
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const vus = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    const p = [
      m[0] * x + m[1] * y + m[2] * z,
      m[4] * x + m[5] * y + m[6] * z,
      m[8] * x + m[9] * y + m[10] * z,
    ];
    for (let a = 0; a < 3; a += 1) {
      if (p[a] < min[a]) min[a] = p[a];
      if (p[a] > max[a]) max[a] = p[a];
    }
    const cle = Math.round(p[0] * 10) + "," + Math.round(p[1] * 10);
    if (!vus.has(cle)) vus.set(cle, [p[0], p[1]]);
  }
  if (min[0] === Infinity) return null;
  const [cx, cy] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const contour = enveloppeConvexe([...vus.values()]).map(([x, y]) => [x - cx, y - cy]);
  return { boite: { min, max }, contour };
}

/* La transformation de la pièce dans la vue : sa rotation, son échelle, et la
   translation qui met le centre de sa boîte en (x, y) et son dessous à z = 0.
   Le plateau est centré sur l'origine du monde. */
export function transformationSurLePlateau(piece, echelle, forme, machine) {
  const { min, max } = forme.boite;
  return {
    position: {
      x: piece.x - machine.largeur / 2 - (min[0] + max[0]) / 2,
      y: piece.y - machine.profondeur / 2 - (min[1] + max[1]) / 2,
      z: -min[2],
    },
    rotation: piece.rotation,
    echelle,
  };
}

/* La boîte de la pièce posée, en millimètres du plateau. */
export function boiteSurLePlateau(piece, forme) {
  const { min, max } = forme.boite;
  const [demiX, demiY] = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2];
  return { min: [piece.x - demiX, piece.y - demiY, 0], max: [piece.x + demiX, piece.y + demiY, max[2] - min[2]] };
}

// ── Contrôles ───────────────────────────────────────────────────────────────

export function horsDuVolume(boite, machine) {
  return boite.min[0] < -TOLERANCE_MM || boite.min[1] < -TOLERANCE_MM
    || boite.max[0] > machine.largeur + TOLERANCE_MM || boite.max[1] > machine.profondeur + TOLERANCE_MM
    || boite.max[2] > machine.hauteur + TOLERANCE_MM;
}

/* Deux polygones convexes se chevauchent-ils ? (théorème de l'axe séparateur) */
function convexesSeChevauchent(a, b) {
  for (const polygone of [a, b]) {
    for (let i = 0; i < polygone.length; i += 1) {
      const [p, q] = [polygone[i], polygone[(i + 1) % polygone.length]];
      const axe = [q[1] - p[1], p[0] - q[0]];
      const projeter = (liste) => liste.map(([x, y]) => x * axe[0] + y * axe[1]);
      const [pa, pb] = [projeter(a), projeter(b)];
      // Un simple contact ne compte pas : deux pièces jointives s'impriment.
      const jeu = 1e-3 * Math.hypot(...axe);
      if (Math.max(...pa) <= Math.min(...pb) + jeu || Math.max(...pb) <= Math.min(...pa) + jeu) return false;
    }
  }
  return true;
}

/*
 * Les pièces à signaler. placees : [{ id, piece, forme }] (forme null tant que
 * le maillage n'est pas calculé : la pièce n'est pas encore contrôlée).
 * Rend { hors: Set d'ids, chevauchements: [[id, id]] }.
 */
export function controlerLePlateau(placees, machine) {
  const hors = new Set();
  const chevauchements = [];
  const connues = placees.filter((p) => p.forme !== null).map((p) => ({
    ...p,
    boite: boiteSurLePlateau(p.piece, p.forme),
    contour: p.forme.contour.map(([x, y]) => [x + p.piece.x, y + p.piece.y]),
  }));
  for (const p of connues) {
    if (horsDuVolume(p.boite, machine)) hors.add(p.id);
  }
  for (let i = 0; i < connues.length; i += 1) {
    for (let j = i + 1; j < connues.length; j += 1) {
      const [a, b] = [connues[i], connues[j]];
      const separees = a.boite.max[0] <= b.boite.min[0] || b.boite.max[0] <= a.boite.min[0]
        || a.boite.max[1] <= b.boite.min[1] || b.boite.max[1] <= a.boite.min[1];
      if (!separees && convexesSeChevauchent(a.contour, b.contour)) chevauchements.push([a.id, b.id]);
    }
  }
  return { hors, chevauchements };
}

// ── Placement ───────────────────────────────────────────────────────────────

/*
 * « Disposer » : les pièces rangées en rangées, de la plus profonde à la moins
 * profonde, depuis le coin avant gauche. Simple et prévisible ; pas une
 * imbrication optimale. Ce qui ne tient pas continue au-delà du plateau, et
 * sera signalé.
 * pieces : [{ id, largeur, profondeur }] ; rend Map id → { x, y }.
 */
export function disposer(pieces, machine, ecart = ECART_PAR_DEFAUT_MM) {
  const triees = [...pieces].sort((a, b) => b.profondeur - a.profondeur || b.largeur - a.largeur);
  const places = new Map();
  let [x, y, rangee] = [ecart, ecart, 0];
  for (const p of triees) {
    if (x > ecart && x + p.largeur > machine.largeur - ecart) {
      x = ecart;
      y += rangee + ecart;
      rangee = 0;
    }
    places.set(p.id, { x: x + p.largeur / 2, y: y + p.profondeur / 2 });
    x += p.largeur + ecart;
    rangee = Math.max(rangee, p.profondeur);
  }
  // Le lot est recentré sur le plateau : c'est là que le plateau chauffe le mieux.
  if (places.size > 0) {
    const liste = triees.map((p) => ({ ...p, ...places.get(p.id) }));
    const minX = Math.min(...liste.map((p) => p.x - p.largeur / 2));
    const maxX = Math.max(...liste.map((p) => p.x + p.largeur / 2));
    const minY = Math.min(...liste.map((p) => p.y - p.profondeur / 2));
    const maxY = Math.max(...liste.map((p) => p.y + p.profondeur / 2));
    const [dx, dy] = [Math.max(0, (machine.largeur - (maxX - minX)) / 2) - minX, Math.max(0, (machine.profondeur - (maxY - minY)) / 2) - minY];
    for (const [id, place] of places) places.set(id, { x: auDixieme(place.x + dx), y: auDixieme(place.y + dy) });
  }
  return places;
}

/*
 * Une place libre pour une pièce de largeur × profondeur : la plus proche du
 * centre du plateau qui ne touche aucune des boîtes déjà posées (écart compris).
 * Rend { x, y } ; le centre si le plateau est plein (la pièce sera signalée).
 */
export function placeLibre(largeur, profondeur, boites, machine, ecart = ECART_PAR_DEFAUT_MM) {
  const [cx, cy] = [machine.largeur / 2, machine.profondeur / 2];
  const pas = 4;
  const candidats = [];
  for (let x = largeur / 2; x <= machine.largeur - largeur / 2; x += pas) {
    for (let y = profondeur / 2; y <= machine.profondeur - profondeur / 2; y += pas) candidats.push([x, y]);
  }
  candidats.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
  const libre = ([x, y]) => boites.every((b) => x + largeur / 2 + ecart <= b.min[0] || x - largeur / 2 - ecart >= b.max[0]
    || y + profondeur / 2 + ecart <= b.min[1] || y - profondeur / 2 - ecart >= b.max[1]);
  const trouve = candidats.find(libre);
  return trouve === undefined ? { x: cx, y: cy } : { x: auDixieme(trouve[0]), y: auDixieme(trouve[1]) };
}
