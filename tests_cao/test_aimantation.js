import test from "node:test";
import assert from "node:assert/strict";

import { aimanter, arrondirAuPas, deplacerBoite, trouverPlaceLibre } from "../atelier-3d/outils/aimantation.js";

const boite = (x0, y0, x1, y1, z1 = 10) => ({ min: [x0, y0, 0], max: [x1, y1, z1] });

test("loin de tout, rien ne s'aimante", () => {
  const r = aimanter(boite(100, 100, 110, 110), [boite(-50, -50, -40, -40)], 1);
  assert.deepEqual([r.dx, r.dy, r.guides.length], [0, 0, 0]);
});

test("un bord proche vient se coller au bord du voisin", () => {
  const voisin = boite(0, 0, 20, 20);
  const mobile = boite(20.6, 50, 30.6, 60);
  const r = aimanter(mobile, [voisin], 1);
  assert.ok(Math.abs(r.dx - -0.6) < 1e-9, "le bord gauche rejoint le bord droit du voisin");
  assert.equal(r.guides[0].axe, "x");
  assert.equal(r.guides[0].valeur, 20);
});

test("les centres s'alignent", () => {
  const voisin = boite(0, 0, 20, 20);          // centre y = 10
  const mobile = boite(40, 5.4, 50, 15.4);     // centre y = 10,4
  const r = aimanter(mobile, [voisin], 1);
  assert.ok(Math.abs(r.dy - -0.4) < 1e-9);
});

test("chaque axe s'aimante de son cote, sur le plus proche des candidats", () => {
  const a = boite(0, 0, 10, 10);
  const b = boite(30, 30, 40, 40);
  const mobile = boite(9.5, 29.2, 19.5, 39.2);
  const r = aimanter(mobile, [a, b], 1);
  assert.ok(Math.abs(r.dx - 0.5) < 1e-9, "x : le bord gauche du mobile sur le bord droit de a");
  assert.ok(Math.abs(r.dy - 0.8) < 1e-9, "y : le bas du mobile sur le bas de b");
  assert.equal(r.guides.length, 2);
});

test("les axes du monde attirent aussi", () => {
  const r = aimanter(boite(-5.3, 10, 4.7, 20), [], 1);
  assert.ok(Math.abs(r.dx - 0.3) < 1e-9, "le centre x rejoint l'axe Y du monde");
});

test("le trait d'aide va d'un objet a l'autre", () => {
  const voisin = boite(0, 0, 20, 20);
  const mobile = boite(20.2, 50, 30.2, 60);
  const [guide] = aimanter(mobile, [voisin], 1).guides;
  assert.deepEqual(guide.de, [20, 0, 0]);
  assert.deepEqual(guide.a, [20, 60, 0]);
});

test("arrondir au pas efface l'ecume des flottants", () => {
  assert.equal(arrondirAuPas(0.1 + 0.2, 0.1), 0.3);
  assert.equal(arrondirAuPas(12.49, 1), 12);
  assert.equal(arrondirAuPas(-7.5, 5), -5);
});

test("deplacer une boite ne la deforme pas", () => {
  assert.deepEqual(deplacerBoite(boite(0, 0, 1, 2, 3), 1, 1, 1), { min: [1, 1, 1], max: [2, 3, 4] });
});

test("une forme neuve trouve une place libre au lieu de naitre dans la precedente", () => {
  const cube = boite(-10, -10, 10, 10);
  const [x, y] = trouverPlaceLibre([0, 0], [30, 30], [cube]);
  const neuve = boite(x - 15, y - 15, x + 15, y + 15);
  const chevauche = neuve.min[0] < cube.max[0] && neuve.max[0] > cube.min[0]
    && neuve.min[1] < cube.max[1] && neuve.max[1] > cube.min[1];
  assert.equal(chevauche, false);
  assert.ok(Math.hypot(x, y) < 60, "la place reste pres du centre vise");
});

test("sur un sol vide, la forme se pose au point vise", () => {
  assert.deepEqual(trouverPlaceLibre([12, -4], [20, 20], []), [12, -4]);
});
