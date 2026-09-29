/*
 * Ces tests font tourner LE MEME moteur Manifold que le navigateur, mais sous
 * Node : c'est ce qui permet de verifier qu'un STL sort etanche sans ouvrir un
 * onglet.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import chargerManifold from "../atelier-3d/vendor/manifold-3.5.3/manifold.js";
import { creerNoeud } from "../atelier-3d/noyau/noeud.js";
import { creerDocument } from "../atelier-3d/noyau/document.js";
import { nouvelObjet } from "../atelier-3d/noyau/fabrique_de_noeuds.js";
import { formesCreables } from "../atelier-3d/noyau/registre_types_de_noeuds.js";
import { documentVersBrut } from "../atelier-3d/noyau/serialisation_document.js";
import { preparerAtelier, construireMaillage, bilanMemoire } from "../atelier-3d/geometrie/construction_du_solide.js";
import { lireStl } from "../atelier-3d/geometrie/lecture_stl.js";
import { cleDeFichier } from "../atelier-3d/geometrie/cle_de_fichier.js";
import { stlBinaire, lireStlBinaire, matriceDeTransformation } from "../atelier-3d/geometrie/export_stl.js";

const wasm = await chargerManifold();
wasm.setup();
const atelier = preparerAtelier(wasm);

const fichiers = new Map();
const ressources = { maillageImporte: (cle) => fichiers.get(cle) ?? null };

const serialiser = (noeud) => documentVersBrut(creerDocument({ racine: noeud })).racine;
const construire = (noeud) => construireMaillage(atelier, serialiser(noeud), ressources).maillage;

const T = (position, echelle, rotation = { x: 0, y: 0, z: 0 }) => ({ position, echelle, rotation });

/* Etanche = chaque arete partagee par exactement deux triangles. C'est le
   critere d'un trancheur : un STL qui echoue ici s'imprime n'importe comment. */
function aretesOuvertes({ indices }) {
  const compte = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const [x, y] = [indices[t + a], indices[t + b]];
      const cle = x < y ? x + "_" + y : y + "_" + x;
      compte.set(cle, (compte.get(cle) ?? 0) + 1);
    }
  }
  return [...compte.values()].filter((n) => n !== 2).length;
}

const arrondir = (tableau) => tableau.map((v) => Math.round(v * 1000) / 1000);

test("CHAQUE FORME DE LA BOITE SORT ETANCHE ET TIENT DANS LE CUBE UNITE", () => {
  const formes = formesCreables();
  assert.ok(formes.length >= 11, "primitives et bibliotheque : " + formes.map((f) => f.nom));

  for (const type of formes) {
    const maillage = construire(nouvelObjet(type.nom));
    assert.equal(maillage.etanche, true, type.nom + " etanche");
    assert.equal(aretesOuvertes(maillage), 0, type.nom + " sans arete ouverte");
    assert.ok(maillage.triangles > 0, type.nom + " a des triangles");
    assert.deepEqual(arrondir(maillage.boite.min), [-0.5, -0.5, 0], type.nom + " min");
    assert.deepEqual(arrondir(maillage.boite.max), [0.5, 0.5, 1], type.nom + " max");
  }
});

test("les parametres changent vraiment la forme", () => {
  const pointue = construire(nouvelObjet("cone"));
  const tronquee = construire(nouvelObjet("cone", { parametres: { sommet: 60 } }));
  assert.notEqual(pointue.triangles, tronquee.triangles);

  const cinq = construire(nouvelObjet("etoile"));
  const huit = construire(nouvelObjet("etoile", { parametres: { branches: 8 } }));
  assert.ok(huit.triangles > cinq.triangles);

  const pleine = construire(nouvelObjet("engrenage", { parametres: { alesage: 0 } }));
  const percee = construire(nouvelObjet("engrenage"));
  assert.ok(percee.triangles > pleine.triangles, "le trou central ajoute des faces");
});

test("DANS UN GROUPE, L'ECHELLE DONNE LA TAILLE REELLE EN MILLIMETRES", () => {
  const groupe = creerNoeud({
    type: "groupe",
    enfants: [
      nouvelObjet("pave", { transformation: T({ x: 0, y: 0, z: 0 }, { x: 40, y: 30, z: 10 }) }),
      nouvelObjet("cylindre", { trou: true, transformation: T({ x: 0, y: 0, z: -5 }, { x: 12, y: 12, z: 30 }) }),
    ],
  });

  const maillage = construire(groupe);
  assert.equal(maillage.etanche, true);
  assert.equal(aretesOuvertes(maillage), 0);
  assert.deepEqual(arrondir(maillage.boite.min), [-20, -15, 0]);
  assert.deepEqual(arrondir(maillage.boite.max), [20, 15, 10]);

  // Le STL exporte contient bien ce solide-la, au millimetre.
  const relu = lireStlBinaire(stlBinaire([maillage], "essai"));
  assert.equal(relu.nombreDeTriangles, maillage.triangles);
  assert.deepEqual(arrondir(relu.min), [-20, -15, 0]);
});

test("un groupe qui ne contient que des trous ne produit rien, sans planter", () => {
  const maillage = construire(creerNoeud({ type: "groupe", enfants: [nouvelObjet("cylindre", { trou: true })] }));
  assert.equal(maillage.triangles, 0);
});

test("un enfant masque est retire du calcul", () => {
  const long = T({ x: 0, y: 0, z: 0 }, { x: 40, y: 10, z: 10 });
  const avec = construire(creerNoeud({ type: "groupe", enfants: [nouvelObjet("pave"), nouvelObjet("pave", { transformation: long })] }));
  const sans = construire(creerNoeud({ type: "groupe", enfants: [nouvelObjet("pave"), nouvelObjet("pave", { transformation: long, visible: false })] }));
  assert.equal(Math.round(avec.boite.max[0]), 20);
  assert.equal(Math.round(sans.boite.max[0]), 10);
});

test("LA ROTATION DE L'EXPORT EST D'ACCORD AVEC CELLE DE LA GEOMETRIE", () => {
  const transformation = T({ x: 7, y: -3, z: 0 }, { x: 30, y: 10, z: 5 }, { x: 20, y: -10, z: 35 });

  const parManifold = construire(creerNoeud({ type: "groupe", enfants: [nouvelObjet("pave", { transformation })] }));
  const unite = construire(nouvelObjet("pave"));
  const parLExport = lireStlBinaire(stlBinaire([{ ...unite, transformation: matriceDeTransformation(transformation) }]));

  for (let axe = 0; axe < 3; axe += 1) {
    assert.ok(Math.abs(parManifold.boite.min[axe] - parLExport.min[axe]) < 0.01, "min " + axe);
    assert.ok(Math.abs(parManifold.boite.max[axe] - parLExport.max[axe]) < 0.01, "max " + axe);
  }
});

test("TOUTE LA MEMOIRE WEBASSEMBLY EST RENDUE APRES CHAQUE CALCUL", () => {
  const avant = bilanMemoire();
  const groupe = creerNoeud({
    type: "groupe",
    enfants: [nouvelObjet("tore"), nouvelObjet("etoile", { trou: true }), nouvelObjet("pyramide")],
  });
  for (let i = 0; i < 20; i += 1) construire(groupe);
  const apres = bilanMemoire();

  const crees = apres.crees - avant.crees;
  // Par calcul : au moins 3 formes, 3 normalisations (2 operations chacune),
  // 3 placements (3 operations chacun), une union, une difference.
  assert.ok(crees >= 20 * 20, "les resultats des methodes d'instance sont suivis : " + crees);
  assert.equal(apres.liberes - avant.liberes, crees, "tout ce qui a ete cree a ete libere");
  assert.equal(apres.enCours, 0);
});

test("la memoire est rendue meme quand le calcul echoue", () => {
  assert.throws(() => construire(creerNoeud({ type: "soucoupe" })), /inconnu/);
  assert.equal(bilanMemoire().enCours, 0);
});

// ── Import ─────────────────────────────────────────────────────────────────

const STYLO = readFileSync(new URL("../contenu/medias/stl/stylo_bic.stl", import.meta.url));
const octetsDuStylo = () => STYLO.buffer.slice(STYLO.byteOffset, STYLO.byteOffset + STYLO.byteLength);

function importer(octets, nom) {
  const cle = cleDeFichier(octets);
  const lu = lireStl(octets);
  fichiers.set(cle, lu);
  const taille = [0, 1, 2].map((axe) => lu.boite.max[axe] - lu.boite.min[axe]);
  return nouvelObjet("importe", {
    parametres: { fichier: cle, nomDuFichier: nom, triangles: lu.triangles },
    transformation: { echelle: { x: taille[0], y: taille[1], z: taille[2] } },
  });
}

/* Un fichier STL fermé, écrit par notre propre export à partir d'un tore de
   40 mm : c'est le cas d'un élève qui réimporte une pièce faite ici. */
function stlDUnTore() {
  const tore = construire(nouvelObjet("tore"));
  const reel = matriceDeTransformation(T({ x: 3, y: 4, z: 5 }, { x: 40, y: 40, z: 10 }));
  return stlBinaire([{ ...tore, transformation: reel }], "tore");
}

test("un STL ferme s'importe, se soude, sort etanche et garde sa taille", () => {
  const objet = importer(stlDUnTore(), "tore.stl");
  const e = objet.transformation.echelle;
  assert.deepEqual(arrondir([e.x, e.y, e.z]), [40, 40, 10], "l'echelle vaut la taille reelle");

  const maillage = construire(objet);
  assert.equal(maillage.etanche, true);
  assert.equal(aretesOuvertes(maillage), 0);
  assert.deepEqual(arrondir(maillage.boite.min), [-0.5, -0.5, 0], "ramene au cube unite");
});

test("un objet importe se groupe et se perce comme une primitive", () => {
  const objet = importer(stlDUnTore(), "tore.stl");
  const groupe = creerNoeud({
    type: "groupe",
    enfants: [
      objet,
      nouvelObjet("pave", { trou: true, transformation: T({ x: 20, y: 0, z: -1 }, { x: 10, y: 10, z: 12 }) }),
    ],
  });
  const maillage = construire(groupe);
  assert.equal(maillage.etanche, true);
  assert.equal(aretesOuvertes(maillage), 0);
  assert.ok(Math.round(maillage.boite.max[0]) < 20, "l'anneau est coupe du cote X positif");
});

test("LE STYLO DU SITE EST UN VRAI FICHIER TROUE : il s'affiche, voyant rouge, sans planter", () => {
  // stylo_bic.stl est fait de 4 morceaux ouverts : 168 aretes n'ont qu'un seul
  // triangle. C'est exactement le genre de fichier qu'un eleve telechargera.
  const stylo = importer(octetsDuStylo(), "stylo_bic.stl");
  const maillage = construire(stylo);
  assert.equal(maillage.etanche, false);
  assert.ok(maillage.triangles > 1000);
  assert.deepEqual(arrondir(maillage.boite.min), [-0.5, -0.5, 0]);

  assert.throws(
    () => construire(creerNoeud({ type: "groupe", enfants: [stylo, nouvelObjet("pave")] })),
    /stylo_bic\.stl.*n'est pas étanche/,
  );
  assert.equal(bilanMemoire().enCours, 0);
});

test("un STL troue s'affiche quand meme, voyant rouge, mais refuse d'etre groupe", () => {
  // Un pave dont on a retire un triangle : il fuit.
  const pave = construire(nouvelObjet("pave"));
  const troue = stlBinaire([{ positions: pave.positions, indices: pave.indices.slice(3) }], "troue");
  const objet = importer(troue, "troue.stl");

  const seul = construire(objet);
  assert.equal(seul.etanche, false);
  assert.ok(seul.triangles > 0);

  assert.throws(
    () => construire(creerNoeud({ type: "groupe", enfants: [objet, nouvelObjet("pave")] })),
    /n'est pas étanche/,
  );
  assert.equal(bilanMemoire().enCours, 0);
});

test("un fichier absent donne un message qui dit quoi faire", () => {
  const orphelin = nouvelObjet("importe", { parametres: { fichier: "0".repeat(40), nomDuFichier: "perdu.stl" } });
  assert.throws(() => construire(orphelin), /perdu\.stl.*Réimporte/);
});
