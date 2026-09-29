import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { lireStl } from "../atelier-3d/geometrie/lecture_stl.js";
import { cleDeFichier, FORMAT_CLE } from "../atelier-3d/geometrie/cle_de_fichier.js";
import { stlBinaire } from "../atelier-3d/geometrie/export_stl.js";

const STYLO = readFileSync(new URL("../contenu/medias/stl/stylo_bic.stl", import.meta.url));
const tampon = (buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

/* Un tetraedre, ecrit a la main en STL texte. */
const TETRAEDRE_TEXTE = `solid tetra
facet normal 0 0 -1
  outer loop
    vertex 0 0 0
    vertex 0 1 0
    vertex 1 0 0
  endloop
endfacet
facet normal 0 -1 0
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 0 1
  endloop
endfacet
facet normal -1 0 0
  outer loop
    vertex 0 0 0
    vertex 0 0 1
    vertex 0 1 0
  endloop
endfacet
facet normal 1 1 1
  outer loop
    vertex 1 0 0
    vertex 0 1 0
    vertex 0 0 1
  endloop
endfacet
endsolid tetra
`;

test("un STL texte se lit et ses sommets sont soudes", () => {
  const lu = lireStl(new TextEncoder().encode(TETRAEDRE_TEXTE).buffer);
  assert.equal(lu.triangles, 4);
  assert.equal(lu.positions.length / 3, 4, "12 coins, 4 sommets distincts");
  assert.deepEqual(lu.boite.min, [0, 0, 0]);
  assert.deepEqual(lu.boite.max, [1, 1, 1]);
});

test("un STL binaire se lit, meme si son en-tete commence par « solid »", () => {
  const binaire = stlBinaire([{
    positions: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 3, 1, 2, 1, 3]),
  }]);
  new Uint8Array(binaire).set(new TextEncoder().encode("solid piege"), 0);

  const lu = lireStl(binaire);
  assert.equal(lu.triangles, 4);
  assert.equal(lu.positions.length / 3, 4);
});

test("le stylo du site se lit : seuls ses triangles plats sont ecartes", () => {
  const octets = tampon(STYLO);
  const vue = new DataView(octets);
  const annonces = vue.getUint32(80, true);

  // Comptage independant des triangles plats, directement dans les octets.
  let plats = 0;
  for (let t = 0; t < annonces; t += 1) {
    const coin = (c) => [0, 1, 2].map((a) => vue.getFloat32(84 + t * 50 + 12 + c * 12 + a * 4, true)).join();
    const [a, b, c] = [coin(0), coin(1), coin(2)];
    if (a === b || b === c || a === c) plats += 1;
  }

  const lu = lireStl(octets);
  assert.ok(plats > 0, "le fichier contient bien des triangles plats");
  assert.equal(lu.triangles, annonces - plats);
  assert.ok(lu.positions.length / 3 < lu.triangles, "des sommets ont ete soudes");
});

test("les triangles plats sont ecartes", () => {
  const binaire = stlBinaire([{
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 0, 1]),
  }]);
  assert.equal(lireStl(binaire).triangles, 1);
});

test("les fichiers illisibles sont refuses avec un message en francais", () => {
  const encoder = (texte) => new TextEncoder().encode(texte).buffer;
  assert.throws(() => lireStl(encoder("bonjour, je ne suis pas un STL")), /pas un STL/);
  assert.throws(() => lireStl(encoder("solid vide\nendsolid vide\n")), /pas un STL|aucun triangle/);
  assert.throws(() => lireStl(encoder("solid x\nfacet\nouter loop\nvertex 1 2 abc\nendloop\nendfacet\n")), /abîmé|pas un STL/);
  assert.throws(() => lireStl(new ArrayBuffer(10)), /pas un STL/);
});

test("la cle d'un fichier depend de son contenu, pas de son nom", () => {
  const a = cleDeFichier(tampon(STYLO));
  const b = cleDeFichier(tampon(Buffer.from(STYLO)));
  assert.equal(a, b);
  assert.match(a, FORMAT_CLE);

  // Un seul octet de difference, meme le dernier, change la cle.
  const modifie = Buffer.from(STYLO);
  modifie[modifie.length - 1] ^= 1;
  assert.notEqual(cleDeFichier(tampon(modifie)), a);
});

test("des fichiers voisins ont des cles tres differentes", () => {
  const cles = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const octets = new Uint8Array(8);
    new DataView(octets.buffer).setUint32(0, i, true);
    cles.add(cleDeFichier(octets.buffer));
  }
  assert.equal(cles.size, 2000);
});
