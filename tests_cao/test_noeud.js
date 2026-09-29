import test from "node:test";
import assert from "node:assert/strict";

import {
  creerNoeud, avecChamps, avecParametres, avecTransformation, avecPosition, avecEnfants,
  TRANSFORMATION_NEUTRE, nouvelIdentifiant, nomAffiche,
} from "../atelier-3d/noyau/noeud.js";

test("un nœud reçoit des valeurs par défaut sensées", () => {
  const noeud = creerNoeud({ type: "pave" });
  assert.equal(noeud.type, "pave");
  assert.equal(noeud.nom, "");
  assert.equal(noeud.couleur, null);
  assert.equal(noeud.trou, false);
  assert.equal(noeud.visible, true);
  assert.deepEqual(noeud.enfants, []);
  assert.deepEqual(noeud.transformation, TRANSFORMATION_NEUTRE);
  assert.ok(noeud.id.length > 0);
});

test("un nœud sans type est refusé, pas corrigé en silence", () => {
  assert.throws(() => creerNoeud({}), /type/);
  assert.throws(() => creerNoeud({ type: "" }), /type/);
});

test("les identifiants ne se répètent pas", () => {
  const vus = new Set();
  for (let i = 0; i < 2000; i += 1) vus.add(nouvelIdentifiant());
  assert.equal(vus.size, 2000);
});

test("un nœud est gelé : personne ne peut le modifier en place", () => {
  const noeud = creerNoeud({ type: "pave", parametres: { hauteur: 10 } });
  assert.throws(() => { noeud.nom = "triche"; }, TypeError);
  assert.throws(() => { noeud.parametres.hauteur = 99; }, TypeError);
  assert.throws(() => { noeud.transformation.position.x = 5; }, TypeError);
});

test("les fonctions de dérivation ne touchent pas l'original", () => {
  const avant = creerNoeud({ type: "cylindre", parametres: { rayon: 10, hauteur: 20 } });

  const apres = avecParametres(avant, { rayon: 15 });
  assert.equal(avant.parametres.rayon, 10);
  assert.equal(apres.parametres.rayon, 15);
  assert.equal(apres.parametres.hauteur, 20, "les autres paramètres sont conservés");
  assert.equal(apres.id, avant.id, "dériver ne change pas l'identité de l'objet");

  const deplace = avecPosition(avant, { x: 5, y: 0, z: 0 });
  assert.equal(avant.transformation.position.x, 0);
  assert.equal(deplace.transformation.position.x, 5);

  const tourne = avecTransformation(avant, { rotation: { x: 0, y: 0, z: 90 } });
  assert.equal(tourne.transformation.rotation.z, 90);
  assert.equal(tourne.transformation.position.x, 0, "les autres champs sont conservés");

  const parent = avecEnfants(avant, [creerNoeud({ type: "pave" })]);
  assert.equal(avant.enfants.length, 0);
  assert.equal(parent.enfants.length, 1);

  const renomme = avecChamps(avant, { nom: "Moyeu" });
  assert.equal(avant.nom, "");
  assert.equal(renomme.nom, "Moyeu");
});

test("une coordonnée absurde retombe sur la valeur neutre au lieu de polluer le document", () => {
  const noeud = creerNoeud({ type: "pave", transformation: { position: { x: NaN, y: 3 } } });
  assert.equal(noeud.transformation.position.x, 0);
  assert.equal(noeud.transformation.position.y, 3);
  assert.equal(noeud.transformation.position.z, 0);
});

test("le nom affiché retombe sur l'étiquette du type", () => {
  assert.equal(nomAffiche(creerNoeud({ type: "pave" }), "Pavé"), "Pavé");
  assert.equal(nomAffiche(creerNoeud({ type: "pave", nom: "Socle" }), "Pavé"), "Socle");
});
