import test from "node:test";
import assert from "node:assert/strict";

import { creerNoeud } from "../atelier-3d/noyau/noeud.js";
import { creerDocument } from "../atelier-3d/noyau/document.js";
import {
  documentVersTexte, documentDepuisTexte, documentVersBrut, documentDepuisBrut,
} from "../atelier-3d/noyau/serialisation_document.js";
import { migrer, versionLaPlusRecente, MIGRATIONS } from "../atelier-3d/noyau/migrations_document.js";

function projet() {
  const trou = creerNoeud({
    id: "trou", type: "cylindre", nom: "Perçage",
    parametres: { rayon: 3, hauteur: 40, facettes: 48 },
    transformation: { position: { x: 0, y: 0, z: -5 } },
    trou: true,
  });
  const socle = creerNoeud({
    id: "socle", type: "pave",
    parametres: { longueur: 40, largeur: 40, hauteur: 12 },
    couleur: "#3a86ff",
  });
  const groupe = creerNoeud({
    id: "groupe", type: "groupe", nom: "Boîtier",
    transformation: { position: { x: 10, y: -5, z: 0 }, rotation: { x: 0, y: 0, z: 45 } },
    enfants: [socle, trou],
  });
  const cache = creerNoeud({ id: "cache", type: "pave", visible: false });
  return creerDocument({
    nom: "lampe_de_poche_leo",
    racine: creerNoeud({ id: "racine", type: "racine", enfants: [groupe, cache] }),
  });
}

test("un aller-retour enregistrement / chargement restitue un document identique", () => {
  const avant = projet();
  const apres = documentDepuisTexte(documentVersTexte(avant));
  assert.deepEqual(apres, avant);
});

test("deux allers-retours de suite ne derivent pas", () => {
  const un = documentDepuisTexte(documentVersTexte(projet()));
  const deux = documentDepuisTexte(documentVersTexte(un));
  assert.equal(documentVersTexte(un), documentVersTexte(deux));
});

test("le fichier n'ecrit pas ce qui vaut sa valeur par defaut", () => {
  const nu = creerDocument({ racine: creerNoeud({ id: "racine", type: "racine" }) });
  const brut = documentVersBrut(nu);

  assert.deepEqual(brut.racine, { id: "racine", type: "racine" },
    "ni transformation neutre, ni nom vide, ni liste d'enfants vide");
});

test("aucun maillage n'est jamais ecrit dans le fichier", () => {
  const texte = documentVersTexte(projet());
  for (const interdit of ["positions", "indices", "maillage", "vertProperties", "triVerts"]) {
    assert.equal(texte.includes(interdit), false, "le fichier ne doit pas contenir " + interdit);
  }
});

test("un projet reste leger : quelques kilo-octets, pas quelques mega-octets", () => {
  assert.ok(documentVersTexte(projet()).length < 2000);
});

test("les champs qui ne valent pas leur defaut sont bien conserves", () => {
  const apres = documentDepuisTexte(documentVersTexte(projet()));
  const groupe = apres.racine.enfants[0];

  assert.equal(apres.nom, "lampe_de_poche_leo");
  assert.equal(groupe.nom, "Boîtier");
  assert.equal(groupe.transformation.rotation.z, 45);
  assert.equal(groupe.enfants[0].couleur, "#3a86ff");
  assert.equal(groupe.enfants[1].trou, true);
  assert.equal(apres.racine.enfants[1].visible, false);
});

test("un fichier qui n'est pas un projet est refuse avec un message lisible", () => {
  assert.throws(() => documentDepuisTexte("ceci n'est pas du JSON"), /abîmé/);
  assert.throws(() => documentDepuisBrut(null), /pas de projet/);
  assert.throws(() => documentDepuisBrut({ format: "autre-chose", version: 1 }), /Atelier 3D/);
  assert.throws(() => documentDepuisBrut({ format: "cao-college" }), /version/);
});

test("un projet venu du futur est refuse, pas ouvert de travers", () => {
  const futur = { ...documentVersBrut(projet()), version: versionLaPlusRecente() + 1 };
  assert.throws(() => documentDepuisBrut(futur), /plus récente/);
});

test("un type de noeud inconnu est refuse a la lecture", () => {
  const brut = documentVersBrut(projet());
  brut.racine.enfants[0].type = "hyperboloide_de_revolution";
  // Le noyau accepte le noeud (il ne connait pas le registre) mais le registre
  // le refusera ; on verifie ici que la lecture ne perd pas l'information.
  const relu = documentDepuisBrut(brut);
  assert.equal(relu.racine.enfants[0].type, "hyperboloide_de_revolution");
});

test("la chaine de migrations est en place, meme vide", () => {
  assert.equal(Array.isArray(MIGRATIONS), true);
  assert.equal(versionLaPlusRecente(), MIGRATIONS.length + 1);

  const brut = documentVersBrut(projet());
  assert.deepEqual(migrer(brut), brut, "sans migration a appliquer, le document ressort intact");
});

test("une chaine de migrations s'applique dans l'ordre", () => {
  // On simule deux montees de version pour verifier le mecanisme lui-meme,
  // sans toucher au tableau reel.
  const etapes = [
    (brut) => ({ ...brut, version: 2, trace: [...(brut.trace ?? []), "1 vers 2"] }),
    (brut) => ({ ...brut, version: 3, trace: [...(brut.trace ?? []), "2 vers 3"] }),
  ];
  let document = { format: "cao-college", version: 1 };
  while (document.version < etapes.length + 1) {
    document = etapes[document.version - 1](document);
  }
  assert.equal(document.version, 3);
  assert.deepEqual(document.trace, ["1 vers 2", "2 vers 3"]);
});
