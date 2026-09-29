// model/terrain.js
// ────────────────
// Le SOL (relief). On le construit comme une donnée de la structure, à la façon
// des poutres : on clique des points du MAILLAGE pour dessiner le HAUT du
// relief ; tout ce qui est EN DESSOUS de cette ligne est plein (solide). Le sol
// peut être fait de PLUSIEURS PARTIES indépendantes (deux falaises avec un vide
// au milieu, par exemple) — chacune est une polyligne de sommets.
//
// Ce fichier ne connaît que la GÉOMÉTRIE du relief (où est la surface, quel
// polygone remplir). Le contact physique vit dans physics/ground.js, le dessin
// dans render/terrainRenderer.js.
//
// Convention d'axes (comme tout le projet) : Y croît vers le BAS. « Plus haut »
// = y plus petit. La surface d'une partie est donc le y MINIMAL atteignable.

import { gridToWorld, MESH } from "./mesh.js";

// Profondeur (m) jusqu'où une partie de sol est dessinée sous son sommet :
// assez bas pour couvrir le bas de l'écran à tout zoom/déplacement courant.
export const TERRAIN_FILL_DEPTH = MESH.rows * MESH.spacing + 120;

// Deux natures de sol, au choix par partie. Elles ne changent QUE le dessin :
// la roche porte de la même façon dans les deux cas.
export const NATURES_SOL = [
  { id: "herbe", label: "Roche et herbe" },
  { id: "pierre", label: "Roche nue" },
];

export const NATURE_SOL_DEFAUT = "herbe";

export function createTerrainPart(points = [], nature = NATURE_SOL_DEFAUT) {
  return { points: points.map((p) => ({ i: p.i, j: p.j })), nature };
}

// Une partie enregistrée avant l'apparition des natures n'en porte pas : c'est
// de l'herbe, comme tout le relief d'alors.
export function natureDe(part) {
  return part.nature === "pierre" ? "pierre" : NATURE_SOL_DEFAUT;
}

// Sommets d'une partie, convertis en coordonnées MONDE et triés de gauche à
// droite (x croissant) : ordre nécessaire pour interpoler la surface et fermer
// le polygone proprement, quel que soit l'ordre où l'utilisateur a cliqué.
export function partTopWorld(part) {
  return part.points
    .map((p) => gridToWorld(p.i, p.j))
    .sort((a, b) => a.x - b.x);
}

// Altitude (y monde) du sommet d'UNE partie à l'abscisse x, ou null si cette
// partie ne couvre pas x (x hors de son emprise gauche↔droite).
export function partSurfaceYAt(part, x) {
  const top = partTopWorld(part);
  if (top.length < 2) return null;
  if (x < top[0].x || x > top[top.length - 1].x) return null;
  for (let k = 0; k < top.length - 1; k++) {
    const a = top[k];
    const b = top[k + 1];
    if (x >= a.x && x <= b.x) {
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
  }
  return null;
}

// Surface du sol à l'abscisse x, TOUTES parties confondues : on prend la plus
// HAUTE (y minimal), car l'union des parties est solide sous le plus haut de
// leurs sommets. +Infinity s'il n'y a aucun sol ici (un nœud peut y tomber).
export function groundSurfaceYAt(structure, x) {
  const terrain = structure.terrain;
  if (!terrain || terrain.length === 0) return Infinity;
  let best = Infinity;
  for (const part of terrain) {
    const y = partSurfaceYAt(part, x);
    if (y !== null && y < best) best = y;
  }
  return best;
}

// Vrai si la structure porte au moins une partie de sol exploitable (≥ 2 points).
export function hasTerrain(structure) {
  return Array.isArray(structure.terrain) && structure.terrain.some((p) => p.points.length >= 2);
}

// ── Solide : le dedans de la roche ──────────────────────────────────────────
// Une partie est pleine sous son sommet, entre deux PAROIS verticales à ses
// extrémités. Une partie qui touche le bord de la grille n'a pas de paroi de ce
// côté : le sol s'y prolonge à plat, comme à l'écran (render/terrainRenderer.js).

const EPS = 1e-6;

// Parties prêtes pour les tests de contact : sommets triés, emprise, parois.
export function terrainParts(structure) {
  const parts = [];
  if (!structure.terrain) return parts;
  const gridLeft = MESH.originX;
  const gridRight = MESH.originX + MESH.cols * MESH.spacing;
  for (const part of structure.terrain) {
    const top = partTopWorld(part);
    if (top.length < 2) continue;
    const x0 = top[0].x;
    const x1 = top[top.length - 1].x;
    parts.push({ top, x0, x1, leftWall: x0 > gridLeft + EPS, rightWall: x1 < gridRight - EPS });
  }
  return parts;
}

// Altitude (y) du sommet d'une partie préparée ; au-delà d'une extrémité sans
// paroi, le sol continue à plat.
function surfaceOnPart(part, x) {
  const top = part.top;
  if (x <= top[0].x) return top[0].y;
  for (let k = 0; k < top.length - 1; k++) {
    const a = top[k];
    const b = top[k + 1];
    if (x <= b.x) return b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return top[top.length - 1].y;
}

// Un point est-il DANS la roche de cette partie ? null sinon (un point pile sur
// le dessus ou sur une paroi est dehors). Sinon : la surface au-dessus de lui,
// sa profondeur sous cette surface et sa distance à chaque paroi.
export function penetration(part, x, y) {
  if (part.leftWall && x <= part.x0 + EPS) return null;
  if (part.rightWall && x >= part.x1 - EPS) return null;
  const surface = surfaceOnPart(part, x);
  const depth = y - surface;
  if (depth <= EPS) return null;
  return {
    surface,
    depth,
    toLeftWall: part.leftWall ? x - part.x0 : Infinity,
    toRightWall: part.rightWall ? part.x1 - x : Infinity,
  };
}

// Vrai si le point (m) est à l'intérieur du sol : on n'y construit pas.
export function isInsideTerrain(structure, x, y) {
  return terrainParts(structure).some((part) => penetration(part, x, y) !== null);
}
