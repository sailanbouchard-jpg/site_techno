// model/bateau.js
// ───────────────
// Les BATEAUX posés sur l'eau. Ils sont complètement STATIQUES : ils ne flottent
// pas, ne bougent pas, ne pèsent rien. Leur seul rôle est de matérialiser le
// GABARIT à laisser libre sous le pont — on ne peut ni poser un point dans un
// bateau, ni faire passer une poutre au travers. En poser plusieurs de tailles
// différentes dessine un gabarit de passage aussi compliqué qu'on veut.
//
// Vu de FACE (on regarde la proue) : une coque de 5 m de large, un peu immergée,
// surmontée d'une timonerie et, selon le modèle, d'une ou deux voiles carrées
// superposées. La silhouette est décrite par de VRAIS polygones qui suivent la
// courbe de la carène et le ventre des voiles — pas par un rectangle englobant —
// pour que le gabarit soit juste.
//
// Ce fichier ne contient ni dessin (-> render/boatRenderer.js) ni gestion de
// clics (-> ui/structureEditor.js) : seulement la géométrie et les tests.

import { WATER_LEVEL_M } from "../render/styleConfig.js";

export const LARGEUR_BATEAU = 5; // m, imposé : tous les bateaux ont la même largeur

// Hauteur (m) du point le plus haut AU-DESSUS de la flottaison. C'est ce qui
// distingue les trois modèles, et donc le tirant d'air qu'ils exigent.
export const TYPES_BATEAU = [
  { id: "moteur", label: "Bateau à moteur", hauteur: 2.5 },
  { id: "voile", label: "Voilier", hauteur: 6 },
  { id: "double-voile", label: "Voilier à deux voiles", hauteur: 8.5 },
];

export function typeBateau(id) {
  return TYPES_BATEAU.find((type) => type.id === id) || TYPES_BATEAU[0];
}

// ── Géométrie ─────────────────────────────────────────────────────────
// Les trois modèles ne diffèrent que par ce qui monte au-dessus du pont :
//   moteur       → rien (une timonerie, pas de mât) ;
//   voile        → un mât et UNE voile carrée ;
//   double-voile → un mât et DEUX voiles, l'une au-dessus de l'autre.
// C'est la voile qui fait le gabarit : large et haute, elle oblige à dégager
// bien plus qu'un mât nu.

const DEMI_LARGEUR = LARGEUR_BATEAU / 2;
const TIRANT_EAU = 0.9; // profondeur de la coque sous la flottaison
const FRANC_BORD = 1.0; // hauteur du pont au-dessus de la flottaison
const EVASEMENT = 1.06; // le pont déborde un peu de la largeur à la flottaison
const POINTS_COQUE = 16; // échantillons de la courbe de carène
const DEMI_MAT = 0.12;
const DEBORD_VERGUE = 0.18; // la vergue dépasse un peu de la voile qu'elle porte
const DEMI_VERGUE = 0.09; // demi-épaisseur de la vergue
const VENTRE = 0.28; // creux du bord inférieur d'une voile, gonflée par le vent
const POINTS_VENTRE = 8; // échantillons de cette courbe

// Les voiles d'un modèle, en hauteurs AU-DESSUS de la flottaison :
// { bas, haut, demiBas, demiHaut }. Aucune ne dépasse les 5 m de large du bateau.
const VOILURE = {
  moteur: [],
  voile: [{ bas: 2.5, haut: 5.6, demiBas: 2.2, demiHaut: 1.8 }],
  "double-voile": [
    { bas: 2.4, haut: 4.8, demiBas: 2.2, demiHaut: 1.9 },
    { bas: 5.5, haut: 8, demiBas: 1.85, demiHaut: 1.55 },
  ],
};

// Toutes les pièces d'un bateau : { role, points } où points est un polygone
// monde { x, y } (y vers le bas). Le rôle sert au dessin ; la géométrie, elle,
// est exactement celle du gabarit — ce qu'on voit est ce qui est interdit.
export function formesBateau(bateau) {
  const type = typeBateau(bateau.type);
  const x = bateau.x;
  const yEau = WATER_LEVEL_M;
  const yPont = yEau - FRANC_BORD;
  const demiPont = DEMI_LARGEUR * EVASEMENT;

  const coque = [{ x: x - demiPont, y: yPont }];
  for (let k = 0; k <= POINTS_COQUE; k++) {
    const t = -1 + (2 * k) / POINTS_COQUE; // -1 (bâbord) → +1 (tribord)
    coque.push({ x: x + DEMI_LARGEUR * t, y: yEau + TIRANT_EAU * Math.sqrt(Math.max(0, 1 - t * t)) });
  }
  coque.push({ x: x + demiPont, y: yPont });

  return [{ role: "coque", points: coque }, ...superstructure(type, x, yPont, yEau)];
}

function superstructure(type, x, yPont, yEau) {
  const sommet = yEau - type.hauteur;
  const voiles = VOILURE[type.id] || [];

  // Sans voile : une timonerie qui monte jusqu'au sommet annoncé.
  if (voiles.length === 0) {
    return [{ role: "cabine", points: rectangleEvase(x, yPont, sommet, 1.7, 1.3) }];
  }

  const pieces = [
    { role: "cabine", points: rectangleEvase(x, yPont, yPont - 0.9, 1.5, 1.25) },
    { role: "mat", points: mat(x, yPont, sommet) },
  ];
  for (const v of voiles) {
    pieces.push({ role: "vergue", points: vergue(x, yEau - v.haut, v.demiHaut + DEBORD_VERGUE) });
    pieces.push({ role: "voile", points: voile(x, yEau, v) });
  }
  return pieces;
}

function rectangleEvase(x, yBas, yHaut, demiBas, demiHaut) {
  return [
    { x: x - demiBas, y: yBas },
    { x: x + demiBas, y: yBas },
    { x: x + demiHaut, y: yHaut },
    { x: x - demiHaut, y: yHaut },
  ];
}

function mat(x, yPont, sommet) {
  return [
    { x: x - DEMI_MAT, y: yPont },
    { x: x + DEMI_MAT, y: yPont },
    { x: x + DEMI_MAT * 0.6, y: sommet },
    { x: x - DEMI_MAT * 0.6, y: sommet },
  ];
}

function vergue(x, y, demi) {
  return [
    { x: x - demi, y: y - DEMI_VERGUE },
    { x: x + demi, y: y - DEMI_VERGUE },
    { x: x + demi, y: y + DEMI_VERGUE },
    { x: x - demi, y: y + DEMI_VERGUE },
  ];
}

// Une voile carrée vue de FACE : suspendue à sa vergue (bord supérieur droit),
// légèrement évasée vers le bas, et le bord inférieur creusé par le vent. Le
// gabarit suit ce ventre : on ne peut pas passer une poutre dans le creux.
function voile(x, yEau, { bas, haut, demiBas, demiHaut }) {
  const yHaut = yEau - haut;
  const yBas = yEau - bas;
  const points = [
    { x: x - demiHaut, y: yHaut },
    { x: x + demiHaut, y: yHaut },
    { x: x + demiBas, y: yBas },
  ];
  for (let k = POINTS_VENTRE - 1; k >= 1; k--) {
    const t = -1 + (2 * k) / POINTS_VENTRE; // tribord → bâbord
    points.push({ x: x + demiBas * t, y: yBas + VENTRE * Math.cos((t * Math.PI) / 2) });
  }
  points.push({ x: x - demiBas, y: yBas });
  return points;
}

// Boîte englobante d'un bateau : sert au tri rapide avant les tests exacts, et
// au cadrage. { x0, x1, y0, y1 } en mètres.
export function boiteBateau(bateau) {
  const type = typeBateau(bateau.type);
  return {
    x0: bateau.x - DEMI_LARGEUR * EVASEMENT,
    x1: bateau.x + DEMI_LARGEUR * EVASEMENT,
    y0: WATER_LEVEL_M - type.hauteur,
    y1: WATER_LEVEL_M + TIRANT_EAU,
  };
}

// ── Pose et retrait ──────────────────────────────────────────────────────────

export function bateauxDe(structure) {
  return structure.bateaux || [];
}

export function ajouterBateau(structure, x, typeId) {
  if (!structure.bateaux) structure.bateaux = [];
  const bateau = { id: `bateau-${structure.bateaux.length + 1}-${Date.now().toString(36)}`, x, type: typeBateau(typeId).id };
  structure.bateaux.push(bateau);
  return bateau;
}

export function retirerBateau(structure, id) {
  structure.bateaux = bateauxDe(structure).filter((bateau) => bateau.id !== id);
}

// Le bateau sous le point monde (x, y), ou null : sert à l'attraper d'un clic
// pour le retirer ou le promener. On vise ici la BOÎTE englobante, pas la
// silhouette exacte : un mât fait 24 cm de large, personne ne le cliquerait. La
// silhouette précise, elle, ne sert qu'au gabarit (pointDansBateau plus bas).
const MARGE_PRISE_M = 0.3;

export function bateauSous(structure, x, y) {
  for (const bateau of bateauxDe(structure)) {
    const boite = boiteBateau(bateau);
    if (x >= boite.x0 - MARGE_PRISE_M && x <= boite.x1 + MARGE_PRISE_M
      && y >= boite.y0 - MARGE_PRISE_M && y <= boite.y1 + MARGE_PRISE_M) return bateau;
  }
  return null;
}

// ── Gabarit : ce qu'un bateau interdit ───────────────────────────────────────

export function pointDansBateau(structure, x, y) {
  return bateauxDe(structure).some((bateau) => {
    const boite = boiteBateau(bateau);
    if (x < boite.x0 || x > boite.x1 || y < boite.y0 || y > boite.y1) return false;
    return formesBateau(bateau).some((forme) => pointDansPolygone(x, y, forme.points));
  });
}

// Vrai si le segment (a → b) entre dans un bateau, ne serait-ce qu'en le
// frôlant : c'est ce qui interdit de faire passer une poutre au travers.
export function segmentCoupeBateau(structure, ax, ay, bx, by) {
  return bateauxDe(structure).some((bateau) => {
    const boite = boiteBateau(bateau);
    // Tri rapide : si le segment ne touche pas la boîte englobante, inutile
    // d'essayer les polygones.
    if (Math.max(ax, bx) < boite.x0 || Math.min(ax, bx) > boite.x1) return false;
    if (Math.max(ay, by) < boite.y0 || Math.min(ay, by) > boite.y1) return false;
    return formesBateau(bateau).some((forme) => segmentCoupePolygone(ax, ay, bx, by, forme.points));
  });
}

// ── Géométrie élémentaire ────────────────────────────────────────────────────

// Lancer de rayon horizontal (règle pair/impair).
function pointDansPolygone(x, y, polygone) {
  let dedans = false;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
    const a = polygone[i];
    const b = polygone[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      dedans = !dedans;
    }
  }
  return dedans;
}

function segmentCoupePolygone(ax, ay, bx, by, polygone) {
  if (pointDansPolygone(ax, ay, polygone) || pointDansPolygone(bx, by, polygone)) return true;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
    if (segmentsSeCroisent(ax, ay, bx, by, polygone[j].x, polygone[j].y, polygone[i].x, polygone[i].y)) {
      return true;
    }
  }
  return false;
}

function orientation(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segmentsSeCroisent(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = orientation(cx, cy, dx, dy, ax, ay);
  const d2 = orientation(cx, cy, dx, dy, bx, by);
  const d3 = orientation(ax, ay, bx, by, cx, cy);
  const d4 = orientation(ax, ay, bx, by, dx, dy);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
