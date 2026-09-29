/*
 * Esquisses, commandes et solides tires d'une esquisse, avec le vrai moteur.
 */

import test from "node:test";
import assert from "node:assert/strict";

import chargerManifold from "../atelier-3d/vendor/manifold-3.5.3/manifold.js";
import { creerDocument, trouverNoeud, insererNoeud } from "../atelier-3d/noyau/document.js";
import { nouvelObjet } from "../atelier-3d/noyau/fabrique_de_noeuds.js";
import { documentVersBrut, documentVersTexte, documentDepuisTexte } from "../atelier-3d/noyau/serialisation_document.js";
import { empreinteDeNoeud } from "../atelier-3d/noyau/empreinte_de_noeud.js";
import { creerEtat, executer, annuler, refaire } from "../atelier-3d/noyau/pile_annulation.js";
import { objetsAffichables, esquissesLibres } from "../atelier-3d/noyau/objets_affichables.js";
import { CONTENU_VIDE, ajouterPolyligne, ajouterCercle, ajouterSegment, contenuDe, placerPoint, deplacerPoint } from "../atelier-3d/noyau/esquisse/elements_esquisse.js";
import { solidesPossibles, repereDeLEsquisse, esquisseDe, estEsquisseLibre } from "../atelier-3d/noyau/esquisse/solides_d_esquisse.js";
import { appliquerAuPoint, matriceDeTransformation } from "../atelier-3d/noyau/transformations.js";
import { commandeAjouterNoeud } from "../atelier-3d/noyau/commandes/commande_ajouter_noeud.js";
import { commandeModifierEsquisse } from "../atelier-3d/noyau/commandes/commande_modifier_esquisse.js";
import { commandeConsommerEsquisse } from "../atelier-3d/noyau/commandes/commande_consommer_esquisse.js";
import { commandeTransformerNoeud } from "../atelier-3d/noyau/commandes/commande_transformer_noeud.js";
import { preparerAtelier, construireMaillage, bilanMemoire } from "../atelier-3d/geometrie/construction_du_solide.js";

const wasm = await chargerManifold();
wasm.setup();
const atelier = preparerAtelier(wasm);
const serialiser = (noeud) => documentVersBrut(creerDocument({ racine: noeud })).racine;
const construire = (noeud) => construireMaillage(atelier, serialiser(noeud)).maillage;

const presque = (a, b, message, tolerance = 1e-3) =>
  assert.ok(Math.abs(a - b) < tolerance, message + " : " + a + " au lieu de " + b);

function rectangle(u0, v0, u1, v1, contenu = CONTENU_VIDE) {
  return ajouterPolyligne(contenu, [{ point: [u0, v0] }, { point: [u1, v0] }, { point: [u1, v1] }, { point: [u0, v1] }], true).contenu;
}

function esquisse(plan, contenu) {
  return nouvelObjet("esquisse", { parametres: { plan, ...contenu } });
}

/* Le document avec l'esquisse, puis la commande qui la consomme, appliquée. */
function avecSolide(plan, contenu, nomDuType) {
  const e = esquisse(plan, contenu);
  const vide = creerDocument();
  const doc = insererNoeud(vide, vide.racine.id, e);
  const commande = commandeConsommerEsquisse.creer(doc, e.id, nomDuType);
  return { document: commandeConsommerEsquisse.appliquer(doc, commande), commande, esquisse: e };
}

function boiteMonde(noeud, maillage) {
  const m = matriceDeTransformation(noeud.transformation);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < maillage.positions.length; i += 3) {
    const p = appliquerAuPoint(m, [maillage.positions[i], maillage.positions[i + 1], maillage.positions[i + 2]]);
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  return { min, max };
}

test("une esquisse n'est pas un solide : ni affichee comme tel, ni exportee", () => {
  const e = esquisse("XY", rectangle(0, 0, 10, 10));
  const vide = creerDocument();
  const document = insererNoeud(vide, vide.racine.id, e);
  assert.equal(objetsAffichables(document).length, 0);
  assert.deepEqual(esquissesLibres(document).map((n) => n.id), [e.id]);
  assert.equal(estEsquisseLibre(document, e.id), true);
});

test("les boutons s'allument selon le dessin", () => {
  assert.deepEqual(solidesPossibles({ ...CONTENU_VIDE }), { extrusion: false, epaississement: false, revolution: false });
  const ouvert = ajouterSegment(CONTENU_VIDE, [0, 0], [10, 0]).contenu;
  assert.deepEqual(solidesPossibles(ouvert), { extrusion: false, epaississement: true, revolution: false });
  assert.deepEqual(solidesPossibles(rectangle(0, 0, 5, 5)), { extrusion: true, epaississement: true, revolution: true });
});

test("extruder sur le sol : le solide tombe exactement sous le dessin", () => {
  const { document, commande } = avecSolide("XY", rectangle(10, 20, 40, 30), "extrusion");
  const solide = trouverNoeud(document, commande.solide.id);
  assert.deepEqual(solide.transformation.position, { x: 25, y: 25, z: 0 }, "tenu par le centre de son dessous");
  const maillage = construire(solide);
  assert.equal(maillage.etanche, true);
  const { min, max } = boiteMonde(solide, maillage);
  [[min, [10, 20, 0]], [max, [40, 30, 10]]].forEach(([vu, attendu]) => vu.forEach((x, i) => presque(x, attendu[i], "boite " + i)));
  assert.equal(objetsAffichables(document).length, 1);
  assert.equal(esquissesLibres(document).length, 0);
});

test("extruder sur le plan de face monte vers la camera de face, soit vers -Y", () => {
  const { document, commande } = avecSolide("XZ", rectangle(0, 0, 20, 10), "extrusion");
  const solide = trouverNoeud(document, commande.solide.id);
  const { min, max } = boiteMonde(solide, construire(solide));
  [[min, [0, -10, 0]], [max, [20, 0, 10]]].forEach(([vu, attendu]) => vu.forEach((x, i) => presque(x, attendu[i], "boite " + i)));
});

test("un trou dessine dans un contour creuse l'extrusion", () => {
  const contenu = ajouterCercle(rectangle(-10, -10, 10, 10), [0, 0], 4).contenu;
  const { document, commande } = avecSolide("XY", contenu, "extrusion");
  const maillage = construire(trouverNoeud(document, commande.solide.id));
  assert.equal(maillage.etanche, true);
  const plein = avecSolide("XY", rectangle(-10, -10, 10, 10), "extrusion");
  assert.equal(construire(trouverNoeud(plein.document, plein.commande.solide.id)).triangles, 12);
  assert.ok(maillage.triangles > 12, "le trou ajoute ses parois");
});

test("epaissir un trait ouvert donne un muret etanche", () => {
  const trace = ajouterPolyligne(CONTENU_VIDE, [{ point: [0, 0] }, { point: [20, 0] }, { point: [20, 15] }, { point: [35, 30] }], false).contenu;
  for (const cote of ["centre", "gauche", "droite"]) {
    const { document, commande } = avecSolide("XY", trace, "epaississement");
    const solide = trouverNoeud(document, commande.solide.id);
    const maillage = construire({ ...solide, parametres: { ...solide.parametres, cote } });
    assert.equal(maillage.etanche, true, cote);
    presque(maillage.boite.max[2] - maillage.boite.min[2], 10, "hauteur " + cote);
  }
});

test("une revolution autour de l'axe vertical du plan de face tourne autour de Z", () => {
  const { document, commande } = avecSolide("XZ", rectangle(5, 0, 8, 20), "revolution");
  const solide = trouverNoeud(document, commande.solide.id);
  const maillage = construire(solide);
  assert.equal(maillage.etanche, true);
  const { min, max } = boiteMonde(solide, maillage);
  [[min, [-8, -8, 0]], [max, [8, 8, 20]]].forEach(([vu, attendu]) => vu.forEach((x, i) => presque(x, attendu[i], "boite " + i, 0.05)));
  // Dessiné de l'autre côté de l'axe : même résultat, retourné.
  const miroir = avecSolide("XZ", rectangle(-8, 0, -5, 20), "revolution");
  assert.equal(construire(trouverNoeud(miroir.document, miroir.commande.solide.id)).etanche, true);
});

test("une revolution autour de l'axe horizontal du sol tourne autour de X", () => {
  const { document, commande } = avecSolide("XY", rectangle(0, 3, 30, 6), "revolution");
  const solide = trouverNoeud(document, commande.solide.id);
  const reglee = { ...solide, parametres: { ...solide.parametres, axe: "horizontal" } };
  const { min, max } = boiteMonde(reglee, construire(reglee));
  presque(max[0] - min[0], 30, "longueur le long de X", 0.05);
  presque(max[1] - min[1], 12, "diametre en Y", 0.05);
  presque(max[2] - min[2], 12, "diametre en Z", 0.05);
});

test("un contour ouvert ne s'extrude pas, avec un message qui dit quoi faire", () => {
  const e = esquisse("XY", ajouterSegment(CONTENU_VIDE, [0, 0], [10, 0]).contenu);
  const vide = creerDocument();
  const document = insererNoeud(vide, vide.racine.id, e);
  assert.throws(() => commandeConsommerEsquisse.creer(document, e.id, "extrusion"), /Épaissir/);
  assert.equal(commandeConsommerEsquisse.creer(document, e.id, "epaississement").solide.enfants[0].id, e.id);
});

test("consommer puis annuler rend l'esquisse a sa place, et l'aller-retour du fichier est exact", () => {
  const e = esquisse("YZ", rectangle(0, 0, 10, 10));
  const cube = nouvelObjet("pave");
  let etat = creerEtat(creerDocument());
  etat = executer(etat, commandeAjouterNoeud.creer(etat.document.racine.id, cube));
  etat = executer(etat, commandeAjouterNoeud.creer(etat.document.racine.id, e));
  const initial = etat.document;
  const commande = commandeConsommerEsquisse.creer(etat.document, e.id, "extrusion");
  etat = executer(etat, commande);
  assert.equal(esquisseDe(etat.document, commande.solide.id).id, e.id);
  assert.equal(estEsquisseLibre(etat.document, e.id), false);
  assert.throws(() => commandeConsommerEsquisse.creer(etat.document, e.id, "extrusion"), /sert déjà/);

  const texte = documentVersTexte(etat.document);
  assert.equal(documentVersTexte(documentDepuisTexte(texte)), texte);
  assert.deepEqual(documentDepuisTexte(texte), etat.document);

  for (let i = 0; i < 50; i += 1) etat = refaire(annuler(etat));
  etat = annuler(etat);
  assert.deepEqual(etat.document, initial);
});

test("modifier l'esquisse change l'empreinte du solide ; le deplacer, non", () => {
  const { document, commande } = avecSolide("XY", rectangle(0, 0, 10, 10), "extrusion");
  const solide = trouverNoeud(document, commande.solide.id);
  const empreinte = empreinteDeNoeud(solide);
  const e = solide.enfants[0];
  const contenu = contenuDe(e.parametres);
  const deplace = deplacerPoint(contenu, placerPoint(contenu, [10, 10]).id, [14, 12]);
  const modif = commandeModifierEsquisse.creer(e.id, contenu, deplace);
  const apres = commandeModifierEsquisse.appliquer(document, modif);
  assert.notEqual(empreinteDeNoeud(trouverNoeud(apres, solide.id)), empreinte);
  assert.deepEqual(commandeModifierEsquisse.annuler(apres, modif), document);

  const t = solide.transformation;
  const bouge = commandeTransformerNoeud.appliquer(document,
    commandeTransformerNoeud.creer(solide.id, t, { ...t, position: { x: 50, y: 0, z: 3 }, rotation: { x: 0, y: 0, z: 90 } }));
  assert.equal(empreinteDeNoeud(trouverNoeud(bouge, solide.id)), empreinte);

  // Rouverte, l'esquisse apparaît sur le solide déplacé : son coin (0, 0) suit.
  const repere = repereDeLEsquisse(bouge, e.id);
  const coin = appliquerAuPoint(repere, [0, 0, 0]);
  const attendu = appliquerAuPoint(matriceDeTransformation(trouverNoeud(bouge, solide.id).transformation), [-5, -5, 0]);
  coin.forEach((x, i) => presque(x, attendu[i], "coin " + i));
});

test("toute la memoire du moteur est rendue apres ces constructions", () => {
  const bilan = bilanMemoire();
  assert.equal(bilan.enCours, 0);
  assert.equal(bilan.crees, bilan.liberes);
});
