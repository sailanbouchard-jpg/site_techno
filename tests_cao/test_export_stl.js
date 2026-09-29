import test from "node:test";
import assert from "node:assert/strict";

import { stlBinaire, lireStlBinaire } from "../atelier-3d/geometrie/export_stl.js";

/* Un pave de 20 x 10 x 4 mm, centre en X et Y, base a Z = 0 : la convention de
   construction du projet. Douze triangles, ecrits a la main pour que le test ne
   depende ni de Manifold ni du navigateur. */
function paveDeTest() {
  const [dx, dy, dz] = [10, 5, 4];
  const sommets = [
    [-dx, -dy, 0], [dx, -dy, 0], [dx, dy, 0], [-dx, dy, 0],
    [-dx, -dy, dz], [dx, -dy, dz], [dx, dy, dz], [-dx, dy, dz],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2],   // dessous
    [4, 5, 6], [4, 6, 7],   // dessus
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7],
  ];
  return {
    positions: new Float32Array(sommets.flat()),
    indices: new Uint32Array(faces.flat()),
  };
}

test("le fichier a la taille exacte qu'annonce le format binaire", () => {
  const tampon = stlBinaire([paveDeTest()]);
  assert.equal(tampon.byteLength, 80 + 4 + 12 * 50);
  assert.equal(lireStlBinaire(tampon).nombreDeTriangles, 12);
});

test("l'en-tete ne commence pas par « solid », qui ferait croire a un STL texte", () => {
  const entete = lireStlBinaire(stlBinaire([paveDeTest()], "lampe")).entete;
  assert.equal(entete.startsWith("solid"), false);
  assert.ok(entete.includes("lampe"));
});

test("un nom accentue ne produit pas d'octets hors ASCII dans l'en-tete", () => {
  const tampon = stlBinaire([paveDeTest()], "boîtier élève");
  const octets = new Uint8Array(tampon, 0, 80);
  assert.ok(octets.every((octet) => octet < 128));
});

test("LES MILLIMETRES ET L'AXE Z SORTENT INTACTS — verification de la convention", () => {
  const { min, max } = lireStlBinaire(stlBinaire([paveDeTest()]));
  assert.deepEqual(min, [-10, -5, 0]);
  assert.deepEqual(max, [10, 5, 4]);
  assert.equal(min[2], 0, "la base de l'objet doit rester posee sur Z = 0");
});

test("la transformation facultative place le maillage dans le repere du document", () => {
  // Rotation de 90 degres autour de Z, puis translation de 100 mm en X.
  const matrice = [
    0, -1, 0, 100,
    1, 0, 0, 0,
    0, 0, 1, 0,
  ];
  const { min, max } = lireStlBinaire(stlBinaire([{ ...paveDeTest(), transformation: matrice }]));

  // Le pave de 20 x 10 devient 10 x 20, decale de 100 mm.
  assert.deepEqual(min.map(Math.round), [95, -10, 0]);
  assert.deepEqual(max.map(Math.round), [105, 10, 4]);
});

test("plusieurs maillages se concatenent dans un seul fichier", () => {
  const seul = lireStlBinaire(stlBinaire([paveDeTest()]));
  const deux = lireStlBinaire(stlBinaire([paveDeTest(), paveDeTest()]));
  assert.equal(deux.nombreDeTriangles, seul.nombreDeTriangles * 2);
});

test("les normales sortent unitaires et orientees vers l'exterieur", () => {
  const tampon = stlBinaire([paveDeTest()]);
  const vue = new DataView(tampon);

  for (let t = 0; t < 12; t += 1) {
    const base = 80 + 4 + t * 50;
    const n = [0, 1, 2].map((axe) => vue.getFloat32(base + axe * 4, true));
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5, "normale unitaire");
  }

  // Premier triangle : la face du dessous, sa normale pointe vers le bas.
  const premiere = [0, 1, 2].map((axe) => vue.getFloat32(80 + 4 + axe * 4, true));
  assert.equal(Math.round(premiere[2]), -1);
});

test("un maillage vide produit un fichier valide de zero triangle", () => {
  const tampon = stlBinaire([{ positions: new Float32Array(0), indices: new Uint32Array(0) }]);
  assert.equal(tampon.byteLength, 84);
  assert.equal(lireStlBinaire(tampon).nombreDeTriangles, 0);
});
