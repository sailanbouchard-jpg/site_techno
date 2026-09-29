/*
 * v0/application_v0.js
 * ───────────────────
 * Le câblage, et lui seul. Il relie le noyau (qui ne sait rien du navigateur),
 * la géométrie (qui ne sait rien de l'écran) et la vue (qui ne sait rien du
 * document). Aucune règle métier ici : si une décision doit être prise sur le
 * contenu d'un projet, elle appartient à une commande, pas à ce fichier.
 *
 * Jalon V0 : l'interface est jetable, les mesures ne le sont pas.
 */

import { creerDocument, trouverNoeud, compterNoeuds } from "../noyau/document.js";
import { empreinteDeNoeud } from "../noyau/empreinte_de_noeud.js";
import { objetsAffichables } from "../noyau/objets_affichables.js";
import { creerEtat, executer, annuler, refaire, peutAnnuler, peutRefaire } from "../noyau/pile_annulation.js";
import { documentVersBrut } from "../noyau/serialisation_document.js";
import { commandeAjouterNoeud } from "../noyau/commandes/commande_ajouter_noeud.js";
import { commandeSupprimerNoeud } from "../noyau/commandes/commande_supprimer_noeud.js";
import { commandeBasculerTrou } from "../noyau/commandes/commande_basculer_trou.js";
import { commandeGrouper } from "../noyau/commandes/commande_grouper.js";
import { demarrerOuvrier } from "../geometrie/client_ouvrier.js";
import { creerCacheDeMaillages } from "../geometrie/cache_de_maillages.js";
import { stlBinaire, morceauAExporter } from "../geometrie/export_stl.js";
import { creerScene } from "../vue/scene_trois_d.js";
import {
  annoncer, messageDEtat, dessinerArbre, dessinerBarreDEtat, majBoutons, majBoutonsAnnulation,
  couleursDeLaVue, telecharger,
} from "./panneaux_v0.js";
import {
  creerRapport, poidsDuChargement, mesurerChargementAFroid, requetesExterieures, enKilooctets,
} from "./mesures/rapport_performance.js";
import { lignesDeMesures, dessinerMesures, rapportEnTexte } from "./mesures/panneau_mesures.js";
import { documentDEssai, documentLourd, nouveauNoeud } from "./scenes_d_essai.js";

const element = (id) => document.getElementById(id);

// ── État ────────────────────────────────────────────────────────────────────

let etat = creerEtat(documentDEssai());
let selection = null;
let moteurPret = false;
let instantMoteurPret = 0;

// Ce que V0 rapporte, en plus de ce que le cache et la vue savent déjà.
const releve = {
  ressourcesDeLOuvrier: [],
  dureeDemarrageMoteur: 0,
  premierCalculMs: 0,
  froid: null,
};

const scene = creerScene({ canvas: element("vue-3d"), couleurs: couleursDeLaVue() });
const ouvrier = demarrerOuvrier();
const cache = creerCacheDeMaillages(ouvrier);
const rapport = creerRapport();

function serialiser(noeud) {
  return documentVersBrut(creerDocument({ racine: noeud })).racine;
}

// ── Mise à jour de la vue et des panneaux ───────────────────────────────────

let rafraichissementDemande = false;

/* Plusieurs changements dans la même tâche ne coûtent qu'une mise à jour. */
function rafraichir() {
  if (rafraichissementDemande) return;
  rafraichissementDemande = true;
  queueMicrotask(() => {
    rafraichissementDemande = false;
    mettreAJour();
  });
}

function surMaillageRecu() {
  // Le premier calcul paie la mise en route du moteur : on le relève à part,
  // sinon la moyenne mentirait sur ce que coûtent vraiment les suivants.
  if (releve.premierCalculMs === 0) {
    releve.premierCalculMs = performance.now() - instantMoteurPret;
    queueMicrotask(() => scene.controleur.cadrer(scene.boiteDeLaScene()));
  }
  rafraichir();
}

function mettreAJour() {
  const objets = objetsAffichables(etat.document);

  const aAfficher = objets.map((noeud) => {
    const maillage = cache.maillageConnu(noeud);

    // Calcul paresseux : on ne demande que ce qui manque à l'affichage.
    if (maillage === null && moteurPret && !cache.calculEnCours(noeud)) {
      cache.obtenirMaillage(noeud, serialiser(noeud))
        .then(surMaillageRecu)
        .catch((erreur) => annoncer(erreur.message, true));
    }

    return {
      id: noeud.id,
      maillage,
      empreinteDuMaillage: empreinteDeNoeud(noeud),
      transformation: noeud.transformation,
      couleur: noeud.couleur,
      trou: noeud.trou,
      enAttente: maillage === null || cache.calculEnCours(noeud),
    };
  });

  // Un message « en cours » doit disparaître de lui-même : l'élève ne doit pas
  // rester devant une phrase qui ne correspond plus à rien.
  if (moteurPret && messageDEtat().endsWith("en cours…") && !aAfficher.some((o) => o.enAttente)) {
    annoncer("Calcul terminé en " + cache.statistiques().dernierCalculMs.toFixed(0) + " ms.");
  }

  scene.synchroniser(aAfficher, selection);

  const maillages = aAfficher.map((objet) => objet.maillage).filter((maillage) => maillage !== null);
  dessinerArbre(etat.document, selection);
  dessinerBarreDEtat(etat.document, selection, maillages,
    selection === null ? null : scene.tailleDeLObjet(selection));
  majBoutons(etat.document, selection);
  majBoutonsAnnulation(peutAnnuler(etat), peutRefaire(etat));
  rafraichirMesures();
}

function rafraichirMesures() {
  const lignes = lignesDeMesures(releve, cache.statistiques(), {
    triangles: scene.nombreDeTriangles(),
    appelsDeDessin: scene.informationsDuRendu().appelsDeDessin,
  }, rapport.images());
  dessinerMesures(lignes);
  return lignes;
}

// ── Actions ─────────────────────────────────────────────────────────────────

function lancer(commande) {
  etat = executer(etat, commande);
  rafraichir();
}

/* Toute erreur d'une action arrive dans la barre d'état, jamais dans une
   alerte, et jamais nulle part. */
function action(fonction) {
  return (...args) => {
    try {
      const resultat = fonction(...args);
      if (resultat instanceof Promise) resultat.catch((erreur) => annoncer(erreur.message, true));
    } catch (erreur) {
      annoncer(erreur.message, true);
    }
  };
}

function ajouter(type) {
  const rang = compterNoeuds(etat.document);
  const noeud = nouveauNoeud(type, { x: (rang * 25) % 100 - 25, y: 35 + Math.floor(rang / 4) * 25, z: 0 });
  lancer(commandeAjouterNoeud.creer(etat.document.racine.id, noeud));
  selection = noeud.id;
}

function exporterStl() {
  // Un trou seul n'est pas de la matière : il ne creuse qu'une fois groupé.
  const morceaux = objetsAffichables(etat.document)
    .filter((noeud) => !noeud.trou && cache.maillageConnu(noeud) !== null)
    .map((noeud) => morceauAExporter(cache.maillageConnu(noeud), noeud.transformation));

  if (morceaux.length === 0) {
    annoncer("Rien à exporter : aucun objet n'est encore calculé.", true);
    return;
  }

  telecharger(stlBinaire(morceaux, etat.document.nom), etat.document.nom + ".stl", "model/stl");
  const triangles = morceaux.reduce((total, morceau) => total + morceau.indices.length / 3, 0);
  annoncer("STL exporté : " + morceaux.length + " objet(s), " + triangles + " triangles.");
}

async function mesurerAFroid(bouton) {
  bouton.disabled = true;
  annoncer("Retéléchargement de tous les fichiers, cache ignoré…");
  try {
    releve.froid = await mesurerChargementAFroid(poidsDuChargement(releve.ressourcesDeLOuvrier).ressources);
    annoncer("Chargement à froid : " + enKilooctets(releve.froid.reseau) +
      " en " + releve.froid.dureeMs.toFixed(0) + " ms.");
  } finally {
    bouton.disabled = false;
    rafraichirMesures();
  }
}

// ── Branchements ────────────────────────────────────────────────────────────

const brancher = (id, fonction) => element(id).addEventListener("click", action(fonction));

brancher("bouton-pave", () => ajouter("pave"));
brancher("bouton-cylindre", () => ajouter("cylindre"));
brancher("bouton-exporter", exporterStl);
brancher("bouton-annuler", () => { etat = annuler(etat); rafraichir(); });
brancher("bouton-refaire", () => { etat = refaire(etat); rafraichir(); });

brancher("bouton-supprimer", () => {
  const commande = commandeSupprimerNoeud.creer(etat.document, selection);
  selection = null;
  lancer(commande);
});

element("case-trou").addEventListener("change", action(() => {
  lancer(commandeBasculerTrou.creer(selection, trouverNoeud(etat.document, selection).trou));
}));

brancher("bouton-grouper", () => {
  const ids = etat.document.racine.enfants.map((enfant) => enfant.id);
  lancer(commandeGrouper.creer(etat.document, ids, "Assemblage"));
  annoncer("Calcul du groupe en cours…");
});

brancher("bouton-scene-lourde", () => {
  etat = creerEtat(documentLourd());
  selection = null;
  annoncer("Scène lourde chargée : " + compterNoeuds(etat.document) + " objets.");
  rafraichir();
});

brancher("bouton-chargement-froid", (evenement) => mesurerAFroid(evenement.currentTarget));

brancher("bouton-copier-rapport", () => navigator.clipboard.writeText(rapportEnTexte(rafraichirMesures()))
  .then(() => annoncer("Rapport copié dans le presse-papiers."))
  .catch(() => annoncer("Copie impossible : sélectionne le tableau à la main.", true)));

brancher("bouton-cadrer", () => scene.controleur.cadrer(scene.boiteDeLaScene()));
for (const bouton of document.querySelectorAll("[data-vue]")) {
  bouton.addEventListener("click", () => scene.controleur.placerSurVue(bouton.dataset.vue));
}

element("arbre").addEventListener("click", (evenement) => {
  const ligne = evenement.target.closest("li");
  if (ligne === null) return;
  selection = ligne.dataset.id;
  rafraichir();
});

// Un clic sans glisser désigne ; un clic à la fin d'une rotation de caméra, non.
let departDuClic = null;
const canvas = element("vue-3d");
canvas.addEventListener("pointerdown", (e) => { departDuClic = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointerup", (evenement) => {
  if (departDuClic === null) return;
  const bouge = Math.hypot(evenement.clientX - departDuClic.x, evenement.clientY - departDuClic.y);
  departDuClic = null;
  if (bouge > 4) return;
  selection = scene.objetSous(evenement.clientX, evenement.clientY)?.id ?? null;
  rafraichir();
});

globalThis.addEventListener("resize", () => scene.redimensionner());

// ── Démarrage ───────────────────────────────────────────────────────────────

/* V0 rend en continu pour pouvoir mesurer les images par seconde. Le vrai
   logiciel rendra à la demande : une vue immobile ne doit pas faire chauffer
   un portable de collège. */
function boucle(maintenant) {
  scene.rendre();
  rapport.compterUneImage(maintenant);
  requestAnimationFrame(boucle);
}

scene.redimensionner();
scene.controleur.placerSurVue("iso");
requestAnimationFrame(boucle);
rafraichir();

// Les mesures bougent même quand le document ne bouge pas.
setInterval(rafraichirMesures, 1000);

globalThis.addEventListener("load", () => {
  const externes = requetesExterieures();
  if (externes.length > 0) {
    annoncer("Attention : " + externes.length + " requête(s) vers l'extérieur — " + externes[0], true);
  }
});

ouvrier.pret
  .then((message) => {
    moteurPret = true;
    instantMoteurPret = performance.now();
    releve.dureeDemarrageMoteur = message.dureeChargementMs;
    releve.ressourcesDeLOuvrier = message.ressources ?? [];
    annoncer("Prêt. Moteur de géométrie démarré en " + releve.dureeDemarrageMoteur.toFixed(0) + " ms.");
    rafraichir();
  })
  .catch((erreur) => {
    annoncer("Le moteur de géométrie n'a pas démarré : " + erreur.message, true);
  });
