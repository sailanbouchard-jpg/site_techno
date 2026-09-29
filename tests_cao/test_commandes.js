import test from "node:test";
import assert from "node:assert/strict";

import { creerNoeud } from "../atelier-3d/noyau/noeud.js";
import { creerDocument, trouverNoeud, compterNoeuds } from "../atelier-3d/noyau/document.js";
import {
  creerEtat, executer, annuler, refaire, peutAnnuler, peutRefaire,
} from "../atelier-3d/noyau/pile_annulation.js";
import { commandeAjouterNoeud } from "../atelier-3d/noyau/commandes/commande_ajouter_noeud.js";
import { commandeSupprimerNoeud } from "../atelier-3d/noyau/commandes/commande_supprimer_noeud.js";
import { commandeDeplacerNoeud } from "../atelier-3d/noyau/commandes/commande_deplacer_noeud.js";
import { commandeModifierParametre } from "../atelier-3d/noyau/commandes/commande_modifier_parametre.js";
import { commandeBasculerTrou } from "../atelier-3d/noyau/commandes/commande_basculer_trou.js";
import { commandeGrouper } from "../atelier-3d/noyau/commandes/commande_grouper.js";

const ORIGINE = { x: 0, y: 0, z: 0 };

function scene() {
  const a = creerNoeud({ id: "a", type: "pave", parametres: { longueur: 20, largeur: 20, hauteur: 10 } });
  const b = creerNoeud({ id: "b", type: "cylindre", parametres: { rayon: 5, hauteur: 30, facettes: 48 } });
  const c = creerNoeud({ id: "c", type: "pave", parametres: { longueur: 4, largeur: 4, hauteur: 4 } });
  return creerDocument({ racine: creerNoeud({ id: "racine", type: "racine", enfants: [a, b, c] }) });
}

const DESCRIPTEURS = {
  ajouter_noeud: commandeAjouterNoeud,
  supprimer_noeud: commandeSupprimerNoeud,
  deplacer_noeud: commandeDeplacerNoeud,
  modifier_parametre: commandeModifierParametre,
  basculer_trou: commandeBasculerTrou,
  grouper: commandeGrouper,
};

/* Le contrat commun a toutes les commandes : appliquer puis annuler doit rendre
   le document de depart, a l'identique. Verifie sur chacune, pas une fois. */
function verifierAllerRetour(document, commande) {
  const descripteur = DESCRIPTEURS[commande.type];
  const apres = descripteur.appliquer(document, commande);
  assert.notDeepEqual(apres, document, "la commande doit changer quelque chose");
  assert.deepEqual(descripteur.annuler(apres, commande), document);
  return apres;
}

test("ajouter : applique, annule, et refaire redonne le meme identifiant", () => {
  const doc = scene();
  const neuf = creerNoeud({ id: "neuf", type: "pave" });
  const commande = commandeAjouterNoeud.creer("racine", neuf, 1);

  const apres = verifierAllerRetour(doc, commande);
  assert.deepEqual(apres.racine.enfants.map((e) => e.id), ["a", "neuf", "b", "c"]);

  const refait = commandeAjouterNoeud.appliquer(commandeAjouterNoeud.annuler(apres, commande), commande);
  assert.deepEqual(refait, apres, "refaire ne doit pas engendrer un jumeau");
});

test("supprimer : l'objet revient a sa place, pas en fin de liste", () => {
  const doc = scene();
  const commande = commandeSupprimerNoeud.creer(doc, "b");
  const apres = verifierAllerRetour(doc, commande);
  assert.deepEqual(apres.racine.enfants.map((e) => e.id), ["a", "c"]);
});

test("deplacer, modifier un parametre, basculer un trou", () => {
  const doc = scene();
  verifierAllerRetour(doc, commandeDeplacerNoeud.creer("a", ORIGINE, { x: 12, y: -4, z: 0 }));
  verifierAllerRetour(doc, commandeModifierParametre.creer("b", "rayon", 5, 8));
  verifierAllerRetour(doc, commandeBasculerTrou.creer("c", false));

  const troue = commandeBasculerTrou.appliquer(doc, commandeBasculerTrou.creer("c", false));
  assert.equal(trouverNoeud(troue, "c").trou, true);
});

test("grouper : les enfants sont conserves, degrouper les rend dans l'ordre", () => {
  const doc = scene();
  const commande = commandeGrouper.creer(doc, ["a", "c"], "Assemblage");
  const apres = verifierAllerRetour(doc, commande);

  assert.deepEqual(apres.racine.enfants.map((e) => e.type), ["groupe", "cylindre"]);
  assert.deepEqual(apres.racine.enfants[0].enfants.map((e) => e.id), ["a", "c"]);
  assert.equal(compterNoeuds(apres), 4, "le groupe s'ajoute, les objets restent");
});

test("grouper refuse les cas qu'il ne sait pas traiter proprement", () => {
  const doc = scene();
  assert.throws(() => commandeGrouper.creer(doc, ["a"]), /au moins deux/);

  const groupe = commandeGrouper.appliquer(doc, commandeGrouper.creer(doc, ["a", "c"]));
  assert.throws(() => commandeGrouper.creer(groupe, ["a", "b"]), /niveau/);
  assert.throws(() => commandeGrouper.creer(groupe, ["b", "inexistant"]), /n'existe plus/);
});

test("un glisser de souris ne laisse qu'une seule entree d'annulation", () => {
  let etat = creerEtat(scene());
  const depart = etat.document;

  // Deux cents images de glisser, comme une vraie souris.
  for (let i = 1; i <= 200; i += 1) {
    etat = executer(etat, commandeDeplacerNoeud.creer("a", ORIGINE, { x: i * 0.1, y: 0, z: 0 }), 1000 + i);
  }

  assert.equal(etat.passe.length, 1);
  assert.equal(trouverNoeud(etat.document, "a").transformation.position.x, 20);
  assert.deepEqual(annuler(etat).document, depart, "annuler revient au debut du geste");
});

test("deux gestes separes dans le temps restent deux annulations", () => {
  let etat = creerEtat(scene());
  etat = executer(etat, commandeDeplacerNoeud.creer("a", ORIGINE, { x: 5, y: 0, z: 0 }), 1000);
  etat = executer(etat, commandeDeplacerNoeud.creer("a", { x: 5, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }), 3000);
  assert.equal(etat.passe.length, 2);

  // Et deux objets differents ne fusionnent jamais, meme a la meme seconde.
  let autre = creerEtat(scene());
  autre = executer(autre, commandeDeplacerNoeud.creer("a", ORIGINE, { x: 1, y: 0, z: 0 }), 1000);
  autre = executer(autre, commandeDeplacerNoeud.creer("b", ORIGINE, { x: 1, y: 0, z: 0 }), 1010);
  assert.equal(autre.passe.length, 2);
});

test("annuler puis refaire cinquante fois restitue exactement le document initial", () => {
  const depart = scene();
  let etat = creerEtat(depart);

  etat = executer(etat, commandeAjouterNoeud.creer("racine", creerNoeud({ id: "d", type: "pave" })), 0);
  etat = executer(etat, commandeDeplacerNoeud.creer("a", ORIGINE, { x: 10, y: 0, z: 0 }), 10000);
  etat = executer(etat, commandeModifierParametre.creer("b", "rayon", 5, 12), 20000);
  etat = executer(etat, commandeBasculerTrou.creer("c", false), 30000);
  etat = executer(etat, commandeGrouper.creer(etat.document, ["a", "c"]), 40000);

  const construit = etat.document;
  assert.equal(etat.passe.length, 5);

  for (let tour = 0; tour < 50; tour += 1) {
    while (peutAnnuler(etat)) etat = annuler(etat);
    assert.deepEqual(etat.document, depart, "tour " + tour + " : retour au depart");
    while (peutRefaire(etat)) etat = refaire(etat);
    assert.deepEqual(etat.document, construit, "tour " + tour + " : retour a l'arrivee");
  }
});

test("une action neuve efface ce qui avait ete annule", () => {
  let etat = creerEtat(scene());
  etat = executer(etat, commandeDeplacerNoeud.creer("a", ORIGINE, { x: 5, y: 0, z: 0 }), 0);
  etat = annuler(etat);
  assert.equal(peutRefaire(etat), true);

  etat = executer(etat, commandeBasculerTrou.creer("c", false), 10000);
  assert.equal(peutRefaire(etat), false);
});

test("annuler ou refaire dans le vide ne casse rien", () => {
  const etat = creerEtat(scene());
  assert.equal(annuler(etat), etat);
  assert.equal(refaire(etat), etat);
});

test("les commandes restent serialisables : la pile survit a un aller-retour JSON", () => {
  let etat = creerEtat(scene());
  etat = executer(etat, commandeAjouterNoeud.creer("racine", creerNoeud({ id: "d", type: "pave" })), 0);
  etat = executer(etat, commandeGrouper.creer(etat.document, ["a", "c"]), 10000);

  for (const entree of etat.passe) {
    assert.deepEqual(JSON.parse(JSON.stringify(entree.commande)), entree.commande);
  }
});
