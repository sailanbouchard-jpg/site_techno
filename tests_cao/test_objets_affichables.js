import test from "node:test";
import assert from "node:assert/strict";

import { creerNoeud } from "../atelier-3d/noyau/noeud.js";
import { creerDocument } from "../atelier-3d/noyau/document.js";
import { objetsAffichables } from "../atelier-3d/noyau/objets_affichables.js";

const ids = (document) => objetsAffichables(document).map((noeud) => noeud.id);

function documentAvec(enfants) {
  return creerDocument({ racine: creerNoeud({ id: "racine", type: "racine", enfants }) });
}

test("chaque objet pose a la racine a son propre solide", () => {
  const doc = documentAvec([
    creerNoeud({ id: "a", type: "pave" }),
    creerNoeud({ id: "b", type: "cylindre" }),
  ]);
  assert.deepEqual(ids(doc), ["a", "b"]);
});

test("un groupe s'affiche lui-meme, ses enfants non : il les a fondus", () => {
  const groupe = creerNoeud({
    id: "g",
    type: "groupe",
    enfants: [creerNoeud({ id: "a", type: "pave" }), creerNoeud({ id: "b", type: "cylindre", trou: true })],
  });
  assert.deepEqual(ids(documentAvec([groupe, creerNoeud({ id: "c", type: "pave" })])), ["g", "c"]);
});

test("un conteneur, lui, laisse voir ses enfants un par un", () => {
  const sousRacine = creerNoeud({
    id: "conteneur",
    type: "racine",
    enfants: [creerNoeud({ id: "a", type: "pave" }), creerNoeud({ id: "b", type: "pave" })],
  });
  assert.deepEqual(ids(documentAvec([sousRacine])), ["a", "b"]);
});

test("un objet masque n'apparait ni a l'ecran ni dans le STL", () => {
  const doc = documentAvec([
    creerNoeud({ id: "a", type: "pave" }),
    creerNoeud({ id: "b", type: "pave", visible: false }),
  ]);
  assert.deepEqual(ids(doc), ["a"]);
});

test("masquer un conteneur masque tout ce qu'il contient", () => {
  const sousRacine = creerNoeud({
    id: "conteneur",
    type: "racine",
    visible: false,
    enfants: [creerNoeud({ id: "a", type: "pave" })],
  });
  assert.deepEqual(ids(documentAvec([sousRacine])), []);
});

test("un document vide n'affiche rien, sans erreur", () => {
  assert.deepEqual(ids(creerDocument()), []);
});
