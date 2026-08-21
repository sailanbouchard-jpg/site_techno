// model/demos.js
// ──────────────
// Quelques structures de DÉMONSTRATION prêtes à charger (même forme que les
// sauvegardes : { id, label, structure }). Construites avec les fonctions de
// Structure.js, donc toujours cohérentes avec le modèle courant.
//
// Les coordonnées ci-dessous sont en MÈTRES ; P(mx,my) les convertit en indices
// de maille (le maillage est à 50 cm → 2 mailles par mètre). Les démos gardent
// ainsi exactement la même taille physique quel que soit le pas du maillage.

import { createStructure, addBeam, toggleAnchor, addLoad, addTerrainPart } from "./Structure.js";
import { MESH } from "./mesh.js";

const G = Math.round(1 / MESH.spacing); // mailles par mètre (= 2 à 50 cm)
const P = (mx, my) => ({ i: Math.round(mx * G), j: Math.round(my * G) }); // mètres → maille

// ── Banc d'essai des matériaux ────────────────────────────────────────────
// Remplit le maillage (40 × 24 m) de tests COMPARATIFS rangés par bandes, pour
// CONSTATER les personnalités (gauche→droite = Bois, Acier, Béton). Lancer la
// simulation et observer flèches, ruptures et flambements.
function span(s, ax, aj, bx, bj, type) {
  return addBeam(s, P(ax, aj), P(bx, bj), type);
}
function supported(s, ax, bx, j, type, loadKg) {
  // Poutre sur 2 appuis avec un joint AU CENTRE (pour y poser une charge).
  const mid = Math.round((ax + bx) / 2);
  const left = span(s, ax, j, mid, j, type);
  const right = span(s, mid, j, bx, j, type);
  toggleAnchor(s, left.jointAId);
  toggleAnchor(s, right.jointBId);
  if (loadKg) addLoad(s, left.jointBId, loadKg); // joint central partagé
}
function cantileverTest(s, ax, bx, j, type) {
  const b = span(s, ax, j, bx, j, type);
  toggleAnchor(s, b.jointAId); // encastré à gauche → fléchit/casse sous son poids
}
function columnTest(s, i, type, loadKg) {
  const baseJ = 22, topJ = 15;
  const b = span(s, i, baseJ, i, topJ, type);
  toggleAnchor(s, b.jointAId); // pied ancré
  addLoad(s, b.jointBId, loadKg); // charge en tête → flambe ou tient
}
function materialsTestBench() {
  const s = createStructure();

  // Bande 1 — porte-à-faux (auto-poids), 7 m, encastrés à gauche.
  cantileverTest(s, 1, 8, 2, "wood-large");
  cantileverTest(s, 15, 22, 2, "steel-large");
  cantileverTest(s, 29, 36, 2, "concrete-large");

  // Bande 2 — poutre sur 2 appuis (8 m) + charge centrale 4 t.
  supported(s, 1, 9, 7, "wood-large", 4000);
  supported(s, 15, 23, 7, "steel-large", 4000);
  supported(s, 29, 37, 7, "concrete-large", 4000);

  // Bande 3 — grande portée 18 m sous le seul poids propre (bois vs acier).
  supported(s, 1, 19, 12, "wood-large", 0);
  supported(s, 21, 39, 12, "steel-large", 0);

  // Bande basse — colonnes (7 m) sous 6 t : élancement et compression.
  columnTest(s, 5, "steel-thin", 6000);   // élancé → flambe
  columnTest(s, 14, "steel-large", 6000);  // trapu → tient
  columnTest(s, 23, "wood-large", 6000);   // tient (léger)
  columnTest(s, 32, "concrete-large", 6000); // tient (béton = roi en compression)

  return s;
}

function cantilever() {
  const s = createStructure();
  const b = addBeam(s, P(2, 5), P(8, 5), "wood-large");
  toggleAnchor(s, b.jointAId); // base encastrée → fléchit sous son poids
  return s;
}

function column() {
  const s = createStructure();
  const b = addBeam(s, P(10, 11), P(10, 5), "steel-thin");
  toggleAnchor(s, b.jointAId);     // pied ancré
  addLoad(s, b.jointBId, 30000);   // 30 t en tête → flambe
  return s;
}

function beamBridge() {
  const s = createStructure();
  // Tablier (route) entre deux appuis ancrés ; un camion le fera fléchir.
  const deck = addBeam(s, P(3, 7), P(15, 7), "road");
  toggleAnchor(s, deck.jointAId);
  toggleAnchor(s, deck.jointBId);
  return s;
}

// ── Paysage : un ravin (deux falaises + un vide) franchi par un treillis ──────
// Montre le rendu complet : ciel, relief en deux parties, et un pont en treillis
// Warren (tablier route, diagonales bois) ancré aux deux falaises. Un camion peut
// le traverser ; en simulation, la structure travaille et peut céder.
function landscape() {
  const s = createStructure();

  // Relief : massif gauche, vide central (la portée), massif droit. On dessine
  // le HAUT du relief ; tout ce qui est dessous est plein (voir model/terrain).
  addTerrainPart(s, [P(0, 16), P(3, 14), P(6, 13), P(9, 12), P(12, 12)]);
  addTerrainPart(s, [P(28, 12), P(31, 12), P(34, 13), P(37, 14), P(40, 16)]);

  const top = (mx) => P(mx, 12); // membrure haute = tablier, au niveau des falaises
  const bot = (mx) => P(mx, 15); // membrure basse, suspendue dans le vide

  // Tablier-route reliant les deux falaises (portée de 16 m).
  const topX = [12, 16, 20, 24, 28];
  const deck = [];
  for (let k = 0; k < topX.length - 1; k++) {
    deck.push(addBeam(s, top(topX[k]), top(topX[k + 1]), "road"));
  }

  // Membrure inférieure (acier).
  const botX = [14, 18, 22, 26];
  for (let k = 0; k < botX.length - 1; k++) addBeam(s, bot(botX[k]), bot(botX[k + 1]), "steel-large");

  // Diagonales en zig-zag (bois) — treillis de Warren, efficace et coloré.
  const web = [[12, 14], [14, 16], [16, 18], [18, 20], [20, 22], [22, 24], [24, 26], [26, 28]];
  for (let k = 0; k < web.length; k++) {
    const a = k % 2 === 0 ? top(web[k][0]) : bot(web[k][0]);
    const b = k % 2 === 0 ? bot(web[k][1]) : top(web[k][1]);
    addBeam(s, a, b, "wood-large");
  }

  // Ancrages aux deux falaises.
  toggleAnchor(s, deck[0].jointAId);
  toggleAnchor(s, deck[deck.length - 1].jointBId);
  return s;
}

export function buildDemos() {
  return [
    { id: "demo-landscape", label: "★ Paysage (pont sur ravin)", structure: landscape() },
    { id: "demo-materials", label: "★ Banc d'essai matériaux", structure: materialsTestBench() },
    { id: "demo-cantilever", label: "Porte-à-faux (flexion)", structure: cantilever() },
    { id: "demo-column", label: "Colonne (flambement)", structure: column() },
    { id: "demo-bridge", label: "Pont poutre (route)", structure: beamBridge() },
  ];
}
