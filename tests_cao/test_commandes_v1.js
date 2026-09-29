import test from "node:test";
import assert from "node:assert/strict";

import { creerNoeud } from "../atelier-3d/noyau/noeud.js";
import { creerDocument, trouverNoeud, cheminVers, compterNoeuds } from "../atelier-3d/noyau/document.js";
import { nouvelObjet } from "../atelier-3d/noyau/fabrique_de_noeuds.js";
import { matriceDeTransformation, composer, appliquerAuPoint } from "../atelier-3d/noyau/transformations.js";
import { creerEtat, executer, annuler, refaire, peutAnnuler, peutRefaire } from "../atelier-3d/noyau/pile_annulation.js";
import { descripteurDeCommande, commandeLot, identifiantsCrees, identifiantsRestaures } from "../atelier-3d/noyau/commandes/registre_commandes.js";
import { commandeTransformerNoeud } from "../atelier-3d/noyau/commandes/commande_transformer_noeud.js";
import { commandeModifierProprietes } from "../atelier-3d/noyau/commandes/commande_modifier_proprietes.js";
import { commandeGrouper } from "../atelier-3d/noyau/commandes/commande_grouper.js";
import { commandeDegrouper } from "../atelier-3d/noyau/commandes/commande_degrouper.js";
import { commandeDupliquer } from "../atelier-3d/noyau/commandes/commande_dupliquer.js";
import { commandeRenommerDocument } from "../atelier-3d/noyau/commandes/commande_renommer_document.js";
import { commandeSupprimerNoeud } from "../atelier-3d/noyau/commandes/commande_supprimer_noeud.js";
import { commandeAjouterNoeud } from "../atelier-3d/noyau/commandes/commande_ajouter_noeud.js";

const T = (position, rotation = { x: 0, y: 0, z: 0 }, echelle = { x: 20, y: 20, z: 20 }) =>
  ({ position, rotation, echelle });

function scene() {
  const socle = nouvelObjet("pave", { id: "socle", transformation: T({ x: 0, y: 0, z: 0 }, undefined, { x: 40, y: 40, z: 10 }) });
  const etoile = nouvelObjet("etoile", { id: "etoile", transformation: T({ x: 12, y: -3, z: 10 }, { x: 0, y: 0, z: 30 }) });
  const percage = nouvelObjet("cylindre", { id: "percage", trou: true, transformation: T({ x: -8, y: 4, z: -1 }, { x: 90, y: 0, z: 0 }) });
  const loin = nouvelObjet("sphere", { id: "loin", transformation: T({ x: 80, y: 0, z: 0 }) });
  return creerDocument({ racine: creerNoeud({ id: "racine", type: "racine", enfants: [socle, etoile, percage, loin] }) });
}

/* Ou un objet se trouve vraiment, en composant les transformations de tous
   ses ancetres. C'est ce que l'eleve voit ; c'est ce qui ne doit pas bouger. */
function matriceMonde(document, id) {
  return cheminVers(document, id)
    .map((idAncetre) => matriceDeTransformation(trouverNoeud(document, idAncetre).transformation))
    .reduce((cumul, m) => composer(cumul, m));
}

function memePlaceDansLeMonde(avant, apres, id) {
  const [ma, mb] = [matriceMonde(avant, id), matriceMonde(apres, id)];
  for (const coin of [[0, 0, 0], [0.5, 0.5, 1], [-0.5, 0.5, 0.3]]) {
    const [p, q] = [appliquerAuPoint(ma, coin), appliquerAuPoint(mb, coin)];
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(p[i] - q[i]) < 1e-6, id + " a bouge : " + p + " -> " + q);
    }
  }
}

function allerRetour(document, commande) {
  const descripteur = descripteurDeCommande(commande.type);
  const apres = descripteur.appliquer(document, commande);
  assert.notDeepEqual(apres, document);
  assert.deepEqual(descripteur.annuler(apres, commande), document);
  assert.deepEqual(descripteur.appliquer(document, commande), apres, "refaire donne le meme resultat");
  return apres;
}

test("transformer : position, rotation et dimensions d'un coup, et un seul geste annulable", () => {
  const doc = scene();
  const avant = trouverNoeud(doc, "etoile").transformation;
  const apres = T({ x: 1, y: 2, z: 3 }, { x: 0, y: 45, z: 0 }, { x: 50, y: 50, z: 2 });
  const resultat = allerRetour(doc, commandeTransformerNoeud.creer("etoile", avant, apres));
  assert.deepEqual(trouverNoeud(resultat, "etoile").transformation, apres);

  let etat = creerEtat(doc);
  for (let i = 1; i <= 30; i += 1) {
    const pas = { ...avant, position: { ...avant.position, z: avant.position.z + i } };
    etat = executer(etat, commandeTransformerNoeud.creer("etoile", avant, pas), 1000 + i * 10);
  }
  assert.equal(etat.passe.length, 1);
  assert.deepEqual(annuler(etat).document, doc);
});

test("modifier les proprietes : nom, couleur, visibilite, trou", () => {
  const doc = scene();
  const resultat = allerRetour(doc, commandeModifierProprietes.creer("socle",
    { nom: "", couleur: null, visible: true }, { nom: "Boîtier", couleur: "#e05a3a", visible: false }));
  const socle = trouverNoeud(resultat, "socle");
  assert.equal(socle.nom, "Boîtier");
  assert.equal(socle.couleur, "#e05a3a");
  assert.equal(socle.visible, false);
});

test("modifier les proprietes refuse ce qui n'est pas une propriete", () => {
  assert.throws(() => commandeModifierProprietes.creer("socle", { type: "pave" }, { type: "sphere" }), /ne se modifie pas/);
  assert.throws(() => commandeModifierProprietes.creer("socle", { nom: "" }, { couleur: "#fff" }), /mêmes clés/);
});

test("taper un nom lettre par lettre ne laisse qu'une annulation", () => {
  let etat = creerEtat(scene());
  let precedent = "";
  for (const [i, nom] of ["B", "Bo", "Boî", "Boît", "Boîte"].entries()) {
    etat = executer(etat, commandeModifierProprietes.creer("socle", { nom: precedent }, { nom }), 1000 + i * 100);
    precedent = nom;
  }
  assert.equal(etat.passe.length, 1);
  assert.equal(trouverNoeud(annuler(etat).document, "socle").nom, "");
});

test("GROUPER AVEC UN POINT D'APPUI : RIEN NE BOUGE DANS LE MONDE", () => {
  const doc = scene();
  const commande = commandeGrouper.creer(doc, ["percage", "socle", "etoile"], "Boîtier", { x: 2, y: -1, z: 0 });
  const groupe = allerRetour(doc, commande);

  const idGroupe = identifiantsCrees(commande)[0];
  assert.deepEqual(trouverNoeud(groupe, idGroupe).transformation.position, { x: 2, y: -1, z: 0 });
  assert.deepEqual(trouverNoeud(groupe, idGroupe).enfants.map((e) => e.id), ["socle", "etoile", "percage"],
    "les enfants gardent l'ordre de la construction, pas celui du clic");
  for (const id of ["socle", "etoile", "percage"]) memePlaceDansLeMonde(doc, groupe, id);
});

test("DEGROUPER UN GROUPE DEPLACE ET TOURNE REND DES OBJETS QUI N'ONT PAS BOUGE", () => {
  const doc = scene();
  const grouper = commandeGrouper.creer(doc, ["socle", "etoile", "percage"], "Boîtier", { x: 0, y: 0, z: 0 });
  let groupe = descripteurDeCommande("grouper").appliquer(doc, grouper);
  const idGroupe = identifiantsCrees(grouper)[0];

  // L'eleve deplace, tourne et agrandit le groupe (uniformement).
  const tg = trouverNoeud(groupe, idGroupe).transformation;
  groupe = commandeTransformerNoeud.appliquer(groupe, commandeTransformerNoeud.creer(idGroupe, tg,
    T({ x: 30, y: -10, z: 5 }, { x: 0, y: 20, z: 75 }, { x: 1.5, y: 1.5, z: 1.5 })));

  const commande = commandeDegrouper.creer(groupe, idGroupe);
  const libres = allerRetour(groupe, commande);
  assert.equal(trouverNoeud(libres, idGroupe), null);
  assert.deepEqual(libres.racine.enfants.map((e) => e.id), ["socle", "etoile", "percage", "loin"],
    "les enfants reprennent la place du groupe, dans l'ordre");
  for (const id of ["socle", "etoile", "percage"]) memePlaceDansLeMonde(groupe, libres, id);
  assert.equal(trouverNoeud(libres, "percage").trou, true);
});

test("degrouper un groupe-trou rend des trous, un groupe masque rend des objets masques", () => {
  const doc = scene();
  const grouper = commandeGrouper.creer(doc, ["socle", "etoile"]);
  const idGroupe = identifiantsCrees(grouper)[0];
  let groupe = descripteurDeCommande("grouper").appliquer(doc, grouper);
  groupe = commandeModifierProprietes.appliquer(groupe, commandeModifierProprietes.creer(idGroupe,
    { trou: false, visible: true }, { trou: true, visible: false }));

  const libres = commandeDegrouper.appliquer(groupe, commandeDegrouper.creer(groupe, idGroupe));
  for (const id of ["socle", "etoile"]) {
    assert.equal(trouverNoeud(libres, id).trou, true);
    assert.equal(trouverNoeud(libres, id).visible, false);
  }
});

test("degrouper refuse un groupe etire dans un seul sens qui contient des objets tournes", () => {
  const doc = scene();
  const grouper = commandeGrouper.creer(doc, ["socle", "etoile"], "Boîtier");
  const idGroupe = identifiantsCrees(grouper)[0];
  let groupe = descripteurDeCommande("grouper").appliquer(doc, grouper);
  const tg = trouverNoeud(groupe, idGroupe).transformation;
  groupe = commandeTransformerNoeud.appliquer(groupe, commandeTransformerNoeud.creer(idGroupe, tg,
    { ...tg, echelle: { x: 3, y: 1, z: 1 } }));

  assert.throws(() => commandeDegrouper.creer(groupe, idGroupe), /Boîtier.*proportions égales/);
});

test("dupliquer : de nouveaux identifiants, rangés après les originaux, decales", () => {
  const doc = scene();
  const commande = commandeDupliquer.creer(doc, ["socle", "percage"], { x: 5, y: 5, z: 0 });
  const resultat = allerRetour(doc, commande);

  const [copieSocle, copiePercage] = ["socle", "percage"]
    .map((id) => identifiantsCrees(commande).find((c) => trouverNoeud(resultat, c).type === trouverNoeud(doc, id).type));
  assert.deepEqual(resultat.racine.enfants.map((e) => e.id),
    ["socle", copieSocle, "etoile", "percage", copiePercage, "loin"]);
  assert.equal(trouverNoeud(resultat, copiePercage).trou, true, "la copie d'un trou est un trou");
  assert.equal(trouverNoeud(resultat, copieSocle).transformation.position.x, 5);
  assert.equal(compterNoeuds(resultat), compterNoeuds(doc) + 2);
});

test("dupliquer un groupe copie aussi ses enfants, avec des identifiants neufs", () => {
  const doc = scene();
  const grouper = commandeGrouper.creer(doc, ["socle", "etoile"]);
  const idGroupe = identifiantsCrees(grouper)[0];
  const groupe = descripteurDeCommande("grouper").appliquer(doc, grouper);

  const commande = commandeDupliquer.creer(groupe, [idGroupe]);
  const resultat = commandeDupliquer.appliquer(groupe, commande);
  const copie = trouverNoeud(resultat, identifiantsCrees(commande)[0]);
  assert.equal(copie.enfants.length, 2);
  for (const enfant of copie.enfants) {
    assert.ok(!["socle", "etoile"].includes(enfant.id), "identifiant neuf");
  }
});

test("renommer le projet s'annule et se fusionne", () => {
  let etat = creerEtat(scene());
  etat = executer(etat, commandeRenommerDocument.creer(etat.document.nom, "Lampe"), 1000);
  etat = executer(etat, commandeRenommerDocument.creer("Lampe", "Lampe de Léo "), 1200);
  assert.equal(etat.document.nom, "Lampe de Léo");
  assert.equal(etat.passe.length, 1);
  assert.equal(annuler(etat).document.nom, "Projet sans nom");
  assert.throws(() => commandeRenommerDocument.creer("a", "   "), /nom/);
});

test("un lot s'applique dans l'ordre et s'annule a rebours, en une seule entree", () => {
  const doc = scene();
  const lot = commandeLot.creer([
    commandeSupprimerNoeud.creer(doc, "etoile"),
    commandeSupprimerNoeud.creer(doc, "loin"),
  ], "Supprimer");
  const resultat = allerRetour(doc, lot);
  assert.deepEqual(resultat.racine.enfants.map((e) => e.id), ["socle", "percage"]);

  let etat = executer(creerEtat(doc), lot, 0);
  assert.equal(etat.passe.length, 1);
  etat = annuler(etat);
  assert.deepEqual(etat.document, doc);
});

test("deux lots de deplacements des memes objets fusionnent en un geste", () => {
  const doc = scene();
  const deplacer = (id, dz) => {
    const t = trouverNoeud(doc, id).transformation;
    return commandeTransformerNoeud.creer(id, t, { ...t, position: { ...t.position, z: t.position.z + dz } });
  };
  let etat = creerEtat(doc);
  etat = executer(etat, commandeLot.creer([deplacer("socle", 1), deplacer("loin", 1)]), 1000);
  etat = executer(etat, commandeLot.creer([deplacer("socle", 2), deplacer("loin", 2)]), 1100);
  assert.equal(etat.passe.length, 1);
  assert.equal(trouverNoeud(etat.document, "loin").transformation.position.z, 2);
  assert.deepEqual(annuler(etat).document, doc);
});

test("un lot vide est refuse", () => {
  assert.throws(() => commandeLot.creer([]), /vide/);
});

test("LES COMMANDES DE V1, CINQUANTE FOIS ANNULEES ET REFAITES, RESTITUENT LE DOCUMENT", () => {
  const depart = scene();
  let etat = creerEtat(depart);
  let t = 0;
  const jouer = (commande) => { t += 10000; etat = executer(etat, commande, t); return commande; };

  jouer(commandeAjouterNoeud.creer("racine", nouvelObjet("tore", { id: "tore" })));
  jouer(commandeTransformerNoeud.creer("etoile", trouverNoeud(etat.document, "etoile").transformation,
    T({ x: 0, y: 0, z: 10 }, { x: 0, y: 90, z: 0 })));
  jouer(commandeModifierProprietes.creer("socle", { couleur: null }, { couleur: "#0a6cb8" }));
  const grouper = jouer(commandeGrouper.creer(etat.document, ["socle", "etoile", "percage"], "Boîtier", { x: 1, y: 1, z: 0 }));
  const idGroupe = identifiantsCrees(grouper)[0];
  const dupliquer = jouer(commandeDupliquer.creer(etat.document, [idGroupe, "tore"], { x: 50, y: 0, z: 0 }));
  jouer(commandeDegrouper.creer(etat.document, idGroupe));
  jouer(commandeLot.creer(identifiantsCrees(dupliquer).map((id) => commandeSupprimerNoeud.creer(etat.document, id))));
  jouer(commandeRenommerDocument.creer(etat.document.nom, "Lampe de poche"));

  const arrivee = etat.document;
  assert.equal(etat.passe.length, 8);

  for (let tour = 0; tour < 50; tour += 1) {
    while (peutAnnuler(etat)) etat = annuler(etat);
    assert.deepEqual(etat.document, depart, "tour " + tour);
    while (peutRefaire(etat)) etat = refaire(etat);
    assert.deepEqual(etat.document, arrivee, "tour " + tour);
  }

  // Et la pile survit a un aller-retour JSON : rien d'inserialisable dedans.
  for (const entree of etat.passe) {
    assert.deepEqual(JSON.parse(JSON.stringify(entree.commande)), JSON.parse(JSON.stringify(entree.commande)));
  }
});

test("chaque commande dit ce qu'elle cree et ce que son annulation rend, pour la selection", () => {
  const doc = scene();
  const grouper = commandeGrouper.creer(doc, ["socle", "etoile"]);
  assert.deepEqual(identifiantsRestaures(grouper), ["socle", "etoile"]);

  const groupe = descripteurDeCommande("grouper").appliquer(doc, grouper);
  const degrouper = commandeDegrouper.creer(groupe, identifiantsCrees(grouper)[0]);
  assert.deepEqual(identifiantsCrees(degrouper), ["socle", "etoile"]);
  assert.deepEqual(identifiantsRestaures(degrouper), identifiantsCrees(grouper));

  const lot = commandeLot.creer([commandeSupprimerNoeud.creer(doc, "loin"), commandeSupprimerNoeud.creer(doc, "percage")]);
  assert.deepEqual(identifiantsRestaures(lot), ["loin", "percage"]);
  assert.deepEqual(identifiantsCrees(commandeTransformerNoeud.creer("socle", {}, {})), []);
});
