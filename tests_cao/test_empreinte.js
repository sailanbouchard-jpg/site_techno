import test from "node:test";
import assert from "node:assert/strict";

import { creerNoeud, avecPosition, avecParametres, avecChamps, avecTransformation } from "../atelier-3d/noyau/noeud.js";
import { empreinteDeNoeud } from "../atelier-3d/noyau/empreinte_de_noeud.js";

const pave = (p) => creerNoeud({ type: "pave", parametres: p });

test("deux formes identiques partagent une empreinte, donc un seul maillage", () => {
  const a = pave({ longueur: 20, largeur: 20, hauteur: 10 });
  const b = pave({ longueur: 20, largeur: 20, hauteur: 10 });
  assert.equal(empreinteDeNoeud(a), empreinteDeNoeud(b));
  assert.notEqual(a.id, b.id, "des identifiants différents, quand même");
});

test("l'ordre d'écriture des paramètres ne change pas l'empreinte", () => {
  assert.equal(
    empreinteDeNoeud(pave({ longueur: 20, largeur: 20, hauteur: 10 })),
    empreinteDeNoeud(pave({ hauteur: 10, largeur: 20, longueur: 20 })),
  );
});

test("changer une dimension change l'empreinte", () => {
  const a = pave({ longueur: 20, largeur: 20, hauteur: 10 });
  assert.notEqual(empreinteDeNoeud(a), empreinteDeNoeud(avecParametres(a, { hauteur: 11 })));
});

test("DÉPLACER UN OBJET NE CHANGE PAS SON EMPREINTE — c'est tout l'intérêt", () => {
  const a = pave({ longueur: 20, largeur: 20, hauteur: 10 });
  const deplace = avecPosition(a, { x: 137, y: -42, z: 8 });
  assert.equal(empreinteDeNoeud(a), empreinteDeNoeud(deplace));
});

test("LE REDIMENSIONNER NON PLUS : les dimensions sont l'échelle, appliquée à l'affichage", () => {
  const a = creerNoeud({ type: "cylindre", parametres: { facettes: 48 } });
  const etire = avecTransformation(a, { echelle: { x: 80, y: 12, z: 3 }, rotation: { x: 0, y: 90, z: 0 } });
  assert.equal(empreinteDeNoeud(a), empreinteDeNoeud(etire));
});

test("ni le nom, ni la couleur, ni l'identifiant n'entrent dans l'empreinte", () => {
  const a = pave({ longueur: 20, largeur: 20, hauteur: 10 });
  assert.equal(empreinteDeNoeud(a), empreinteDeNoeud(avecChamps(a, { nom: "Socle" })));
  assert.equal(empreinteDeNoeud(a), empreinteDeNoeud(avecChamps(a, { couleur: "#ff0000" })));
  assert.equal(empreinteDeNoeud(a), empreinteDeNoeud(creerNoeud({ ...a, id: "autre" })));
});

test("déplacer un enfant DANS un groupe change l'empreinte du groupe", () => {
  const enfant = pave({ longueur: 4, largeur: 4, hauteur: 4 });
  const groupe = creerNoeud({ type: "groupe", enfants: [enfant] });
  const bouge  = creerNoeud({ type: "groupe", enfants: [avecPosition(enfant, { x: 3, y: 0, z: 0 })] });

  assert.notEqual(empreinteDeNoeud(groupe), empreinteDeNoeud(bouge),
    "la position de l'enfant décide d'où il perce : le groupe doit se recalculer");

  // Mais déplacer le groupe entier, lui, ne recalcule toujours rien.
  assert.equal(empreinteDeNoeud(groupe), empreinteDeNoeud(avecPosition(groupe, { x: 50, y: 0, z: 0 })));
});

test("marquer un enfant « trou » ou le masquer change l'empreinte du groupe", () => {
  const enfant = pave({ longueur: 4, largeur: 4, hauteur: 4 });
  const groupe = creerNoeud({ type: "groupe", enfants: [enfant] });

  const avecTrou = creerNoeud({ type: "groupe", enfants: [avecChamps(enfant, { trou: true })] });
  const masque   = creerNoeud({ type: "groupe", enfants: [avecChamps(enfant, { visible: false })] });

  assert.notEqual(empreinteDeNoeud(groupe), empreinteDeNoeud(avecTrou));
  assert.notEqual(empreinteDeNoeud(groupe), empreinteDeNoeud(masque));
  assert.notEqual(empreinteDeNoeud(avecTrou), empreinteDeNoeud(masque));
});

test("l'ordre des enfants compte : union puis différence n'est pas commutatif", () => {
  const x = pave({ longueur: 4, largeur: 4, hauteur: 4 });
  const y = pave({ longueur: 6, largeur: 6, hauteur: 6 });
  assert.notEqual(
    empreinteDeNoeud(creerNoeud({ type: "groupe", enfants: [x, y] })),
    empreinteDeNoeud(creerNoeud({ type: "groupe", enfants: [y, x] })),
  );
});

test("une empreinte est une chaîne courte, utilisable comme clé de cache", () => {
  const empreinte = empreinteDeNoeud(pave({ longueur: 20, largeur: 20, hauteur: 10 }));
  assert.equal(typeof empreinte, "string");
  assert.ok(empreinte.length > 0 && empreinte.length <= 8);
});
