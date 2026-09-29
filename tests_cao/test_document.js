import test from "node:test";
import assert from "node:assert/strict";

import { creerNoeud } from "../atelier-3d/noyau/noeud.js";
import {
  creerDocument, insererNoeud, supprimerNoeud, remplacerNoeud, deplacerVersParent,
  trouverNoeud, trouverParent, indexDansParent, cheminVers, compterNoeuds, parcourir,
} from "../atelier-3d/noyau/document.js";

function documentDeTest() {
  const feuille = creerNoeud({ id: "feuille", type: "pave" });
  const branche = creerNoeud({ id: "branche", type: "groupe", enfants: [feuille] });
  const voisin  = creerNoeud({ id: "voisin",  type: "cylindre" });
  const racine  = creerNoeud({ id: "racine",  type: "racine", enfants: [branche, voisin] });
  return creerDocument({ racine });
}

test("un document neuf a une racine vide", () => {
  const doc = creerDocument();
  assert.equal(doc.format, "cao-college");
  assert.equal(doc.version, 1);
  assert.equal(compterNoeuds(doc), 0, "la racine ne compte pas comme un objet");
});

test("on retrouve un nœud, son parent et son rang", () => {
  const doc = documentDeTest();
  assert.equal(trouverNoeud(doc, "feuille").type, "pave");
  assert.equal(trouverNoeud(doc, "inexistant"), null);
  assert.equal(trouverParent(doc, "feuille").id, "branche");
  assert.equal(trouverParent(doc, "racine"), null);
  assert.equal(indexDansParent(doc, "voisin"), 1);
  assert.deepEqual(cheminVers(doc, "feuille"), ["racine", "branche", "feuille"]);
  assert.deepEqual(cheminVers(doc, "inexistant"), []);
  assert.equal(compterNoeuds(doc), 3);
});

test("le parcours donne parent et profondeur, dans l'ordre de l'arbre", () => {
  const doc = documentDeTest();
  const vu = [...parcourir(doc.racine)].map((e) => [e.noeud.id, e.parent?.id ?? null, e.profondeur]);
  assert.deepEqual(vu, [
    ["racine", null, 0],
    ["branche", "racine", 1],
    ["feuille", "branche", 2],
    ["voisin", "racine", 1],
  ]);
});

test("remplacer ne recopie que la branche touchée", () => {
  const doc = documentDeTest();
  const modifie = remplacerNoeud(doc, "feuille", creerNoeud({ id: "feuille", type: "pave", nom: "Socle" }));

  assert.equal(trouverNoeud(modifie, "feuille").nom, "Socle");
  assert.equal(trouverNoeud(doc, "feuille").nom, "", "le document d'origine est intact");

  // Le voisin n'a pas changé : la vue doit pouvoir sauter son sous-arbre.
  assert.equal(modifie.racine.enfants[1], doc.racine.enfants[1], "même référence");
  assert.notEqual(modifie.racine.enfants[0], doc.racine.enfants[0], "la branche touchée est neuve");
});

test("insérer respecte le rang demandé", () => {
  const doc = documentDeTest();
  const insere = insererNoeud(doc, "racine", creerNoeud({ id: "neuf", type: "pave" }), 1);
  assert.deepEqual(insere.racine.enfants.map((e) => e.id), ["branche", "neuf", "voisin"]);

  const ajoute = insererNoeud(doc, "racine", creerNoeud({ id: "fin", type: "pave" }));
  assert.deepEqual(ajoute.racine.enfants.map((e) => e.id), ["branche", "voisin", "fin"]);
});

test("supprimer retire le nœud et ses descendants", () => {
  const doc = supprimerNoeud(documentDeTest(), "branche");
  assert.equal(trouverNoeud(doc, "branche"), null);
  assert.equal(trouverNoeud(doc, "feuille"), null);
  assert.equal(compterNoeuds(doc), 1);
});

test("les opérations impossibles échouent avec un message, jamais en silence", () => {
  const doc = documentDeTest();
  assert.throws(() => remplacerNoeud(doc, "fantome", creerNoeud({ type: "pave" })), /fantome/);
  assert.throws(() => insererNoeud(doc, "fantome", creerNoeud({ type: "pave" })), /fantome/);
  assert.throws(() => supprimerNoeud(doc, "racine"), /racine/);
});

test("un objet ne peut pas être rangé dans son propre enfant", () => {
  const doc = documentDeTest();
  assert.throws(() => deplacerVersParent(doc, "branche", "feuille"), /propre parent/);

  const deplace = deplacerVersParent(doc, "voisin", "branche");
  assert.equal(trouverParent(deplace, "voisin").id, "branche");
  assert.equal(compterNoeuds(deplace), 3, "un déplacement ne perd ni ne duplique rien");
});
