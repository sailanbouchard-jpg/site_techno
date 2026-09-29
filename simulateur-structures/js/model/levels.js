// model/levels.js
// ───────────────
// Les NIVEAUX, rangés par catégorie (tutoriel, moyen, difficile, impossible).
// Un niveau FIXE toutes les contraintes : le relief, les appuis déjà posés, les
// routes d'accès, les véhicules (masse et vitesse imposées) et les bateaux. Pas
// de vent. Le joueur n'a qu'à franchir le vide.
//
// Un niveau N'EST PAS DU CODE : c'est une FICHE de données — une scène dessinée
// par l'administrateur dans le simulateur, plus un nom, un énoncé, les matériaux
// ouverts, un objectif de masse et un cadrage. Le catalogue vit côté serveur
// (voir model/catalogue.js) ; celui d'ici est VIDE, à remplir depuis l'interface.
//
// Tout ce que la scène de l'énoncé contient est marqué `duNiveau` : le reste —
// ce que le joueur pose — compte comme PONT, et c'est cette masse-là qui est
// notée. Le joueur ne peut pas supprimer une pièce marquée `duNiveau`.
//
// Ce fichier ne CONSTRUIT donc aucun décor : il lit ce que la scène dit du
// niveau (portée, arrivée, cadrage) et tient la notation.

import { createStructure, exportStructure, noeudArrivee } from "./Structure.js";
import { boiteBateau } from "./bateau.js";
import { BEAM_TYPES, getBeamTypeById } from "./materials.js";
import { masseAffichee } from "./vehiclePresets.js";
import { computeBeamMass } from "../physics/mass.js";
import { formatDecimal } from "../units.js";
import { gridToWorld } from "./mesh.js";

// Cadre de repli quand un niveau n'a pas encore de route à cadrer (une fiche
// toute neuve) : la largeur de grille de départ, du ciel au fond du ravin.
const WORLD_X_MAX = 50;
const FOND_PAR_DEFAUT = 21;

// Marge (m) autour de la zone de travail d'un niveau quand la vue la cadre.
const MARGE_CADRE = 2;

// Hauteurs (m) montrées de part et d'autre du tablier par le cadrage AUTOMATIQUE.
// Il faut du ciel : c'est là qu'on bâtit un portique, une arche ou un pylône. Un
// cadrage trop serré donne l'impression d'être enterré dans le sol, et la moitié
// de l'écran ne sert alors à rien. L'administrateur peut de toute façon imposer
// son propre cadrage niveau par niveau (zoom + centre).
const CIEL_AU_DESSUS = 8;
const SOUS_LE_TABLIER = 7;

// Temps simulé (s) au-delà duquel un essai est perdu : le véhicule est bloqué.
// Large : même un long viaduc se traverse en une quinzaine de secondes.
export const DUREE_MAX_ESSAI = 40;

// Seuils d'étoiles PAR DÉFAUT, en multiples de l'OBJECTIF 3 ÉTOILES du niveau
// (une masse en kg, fixée par l'administrateur). Tenir l'objectif vaut 3
// étoiles ; au-delà de 2,1× le pont est validé mais ne rapporte plus rien.
// Ces facteurs ne servent QUE si la fiche ne donne pas ses propres seuils : un
// niveau peut fixer objectif2 et objectif1 en kilogrammes, un par un, quand la
// règle proportionnelle tombe mal (une 2 étoiles trop facile sur un grand pont,
// par exemple). Voir seuilsMasse.
export const SEUILS_ETOILES = [1, 1.4, 2.1];

// Le cadrage d'un niveau tient en trois nombres : le zoom de départ et le point
// du monde placé au centre de l'écran. Les trois doivent être là, sinon c'est le
// cadrage automatique qui s'applique.
function cadrageImpose(fiche) {
  const { zoom, centreX, centreY } = fiche;
  if (!Number.isFinite(zoom) || !Number.isFinite(centreX) || !Number.isFinite(centreY)) return null;
  return { zoom, centreX, centreY };
}

// La scène de l'énoncé, telle que l'administrateur l'a dessinée. Une fiche toute
// neuve n'en a pas encore : on démarre alors sur une scène vide.
function structureDepart(fiche) {
  return fiche.structure || exportStructure(createStructure());
}

// ── Ce que la scène dit du niveau ────────────────────────────────────────────
// Portée, arrivée et cadrage se LISENT dans la structure : l'administrateur ne
// les saisit nulle part, il dessine et tout suit.

const NOMS_MODELE = { car: "voiture", van: "camionnette", truck: "camion" };

function vehiculesDe(structure) {
  return (structure.mobileLoads || []).map((vehicule) => {
    // La masse ANNONCÉE : c'est l'ordre de grandeur que les élèves doivent
    // retenir, pas la charge allégée que le solveur encaisse.
    const annoncee = masseAffichee(vehicule);
    const tonnes = annoncee / 1000;
    const poids = tonnes >= 1 ? `${formatDecimal(tonnes, tonnes % 1 ? 1 : 0)} t` : `${Math.round(annoncee)} kg`;
    return {
      masse: annoncee,
      vitesse: vehicule.referenceSpeed,
      nom: `${NOMS_MODELE[vehicule.presetId] || "véhicule"} ${poids}`,
    };
  });
}

// Emprises horizontales [x0, x1] des routes du niveau, fusionnées et triées.
function empriseRoutes(structure) {
  const joints = new Map((structure.nodes || []).map((node) => [node.id, node]));
  const morceaux = [];
  for (const beam of structure.beams || []) {
    if (!beam.isRoad) continue;
    const a = joints.get(beam.jointAId);
    const b = joints.get(beam.jointBId);
    if (a && b) morceaux.push([Math.min(a.restX, b.restX), Math.max(a.restX, b.restX)]);
  }
  morceaux.sort((u, v) => u[0] - v[0]);
  const fusion = [];
  for (const morceau of morceaux) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && morceau[0] <= dernier[1] + 1e-6) dernier[1] = Math.max(dernier[1], morceau[1]);
    else fusion.push([...morceau]);
  }
  return fusion;
}

// Le plus grand VIDE entre deux tronçons de route : c'est ce qu'il faut franchir.
function porteeDe(structure) {
  const emprises = empriseRoutes(structure);
  let portee = 0;
  for (let k = 0; k < emprises.length - 1; k++) {
    portee = Math.max(portee, emprises[k + 1][0] - emprises[k][1]);
  }
  return Math.round(portee * 10) / 10;
}

// Où les véhicules doivent parvenir. Le DRAPEAU planté par l'auteur du niveau
// fait foi ; sans drapeau, c'est le bout de la route la plus à droite.
function arriveeDe(structure) {
  const drapeau = noeudArrivee(structure);
  if (drapeau) return drapeau.restX;
  const emprises = empriseRoutes(structure);
  return emprises.length ? emprises[emprises.length - 1][1] : 0;
}

// Zone de travail cadrée à l'ouverture : la largeur vient des routes (pas du
// relief, qui court d'un bord à l'autre du monde), la hauteur laisse du ciel
// au-dessus et de quoi bâtir en dessous.
function cadreDe(structure) {
  const emprises = empriseRoutes(structure);
  const xs = emprises.flat();
  const ysHaut = [];
  const ysBas = [];
  for (const node of structure.nodes || []) {
    if (node.kind !== "joint") continue;
    if (xs.length === 0) xs.push(node.restX);
    ysHaut.push(node.restY);
    ysBas.push(node.restY);
  }
  for (const part of structure.terrain || []) {
    for (const point of part.points) ysBas.push(gridToWorld(point.i, point.j).y);
  }
  for (const bateau of structure.bateaux || []) {
    const boite = boiteBateau(bateau);
    ysHaut.push(boite.y0);
    ysBas.push(boite.y1);
  }
  if (xs.length === 0 || ysHaut.length === 0) {
    return { x0: 0, x1: WORLD_X_MAX, y0: 0, y1: FOND_PAR_DEFAUT + 2 };
  }
  const yHaut = Math.min(...ysHaut);
  const yBas = Math.max(...ysBas);
  return {
    x0: Math.min(...xs) - MARGE_CADRE,
    x1: Math.max(...xs) + MARGE_CADRE,
    y0: yHaut - CIEL_AU_DESSUS,
    y1: Math.max(yBas + 1, yHaut + SOUS_LE_TABLIER),
  };
}

// Une FICHE devient un niveau jouable. Aucun décor n'est construit ici : tout
// ce qui décrit le niveau se LIT dans sa scène.
function niveauDeFiche(fiche) {
  const depart = structureDepart(fiche);

  return {
    fiche, // la donnée d'origine : l'éditeur d'administration lit et réécrit ça
    id: fiche.id,
    label: fiche.label,
    enonce: fiche.enonce,
    depart, // la scène de l'énoncé (données pures, jamais modifiées)
    objectif3: Number.isFinite(fiche.objectif3) ? fiche.objectif3 : 0, // masse (kg) pour 3 étoiles
    // Seuils 2 et 1 étoile : en kg s'ils sont donnés, sinon calculés (voir
    // seuilsMasse). Une fiche d'avant ce réglage n'en porte pas, et garde donc
    // exactement le barème qu'elle avait.
    objectif2: Number.isFinite(fiche.objectif2) ? fiche.objectif2 : null,
    objectif1: Number.isFinite(fiche.objectif1) ? fiche.objectif1 : null,
    vehicules: vehiculesDe(depart),
    portee: porteeDe(depart),
    xArrivee: arriveeDe(depart),
    cadre: cadreDe(depart),
    // Cadrage IMPOSÉ par le niveau (réglé par l'administrateur) : quand il est
    // renseigné, il remplace le calcul automatique ci-dessus.
    vue: cadrageImpose(fiche),
    // Matériaux que le joueur a le droit de poser (ids de BEAM_TYPES), ou null
    // si le niveau ouvre tout le catalogue. C'est une CONTRAINTE d'énoncé :
    // « franchir ce vide, en bois seul » est un autre problème qu'en acier.
    materiaux: materiauxAutorisesDe(fiche),
  };
}

// Une liste vide ou absente vaut « tout est permis » : c'est ce qui fait qu'un
// niveau écrit avant cette contrainte reste jouable tel quel. Les ids inconnus
// sont écartés, pour qu'un matériau retiré du catalogue ne bloque pas un niveau.
function materiauxAutorisesDe(fiche) {
  const ids = (fiche.materiaux || []).filter((id) => getBeamTypeById(id));
  return ids.length > 0 && ids.length < BEAM_TYPES.length ? ids : null;
}

// ── Catalogue ────────────────────────────────────────────────────────────────
// Catalogue de DÉPART : les quatre catégories, et rien dedans. Les niveaux se
// créent depuis l'interface (session administrateur, cadre « Édition du niveau »)
// et vivent côté serveur — voir model/catalogue.js. Le simulateur ouvert sans
// serveur montre donc quatre catégories vides : c'est normal, il n'y a personne
// pour lui donner des niveaux.
export const CATALOGUE_DEFAUT = [
  { id: "tutoriel", label: "Tutoriel", niveaux: [] },
  { id: "moyen", label: "Moyen", niveaux: [] },
  { id: "difficile", label: "Difficile", niveaux: [] },
  { id: "impossible", label: "Impossible", niveaux: [] },
];

// Catégories RENOMMÉES depuis qu'un catalogue a pu être enregistré. Le serveur
// rend les fiches telles qu'elles ont été sauvées, identifiant et libellé
// compris : sans cette table, une catégorie renommée dans le code garderait son
// ancien nom à l'écran tant que l'administrateur n'a pas ré-enregistré. La
// correction se fait donc au CHARGEMENT, et le prochain enregistrement la fige.
const CATEGORIES_RENOMMEES = {
  facile: { id: "moyen", label: "Moyen" },
};

// Catalogue VIVANT : reconstruit chaque fois que l'administrateur enregistre ses
// modifications. Les importateurs lisent la liaison de module, qui suit.
export let LEVEL_CATEGORIES = construireCategories(CATALOGUE_DEFAUT);

function construireCategories(fiches) {
  return fiches.map((categorie) => {
    const renommee = CATEGORIES_RENOMMEES[categorie.id];
    return {
      id: renommee ? renommee.id : categorie.id,
      label: renommee ? renommee.label : categorie.label,
      levels: (categorie.niveaux || []).map((fiche) => niveauDeFiche(fiche)),
    };
  });
}

// Remplace le catalogue en service (celui du serveur, ou l'édition en cours).
export function appliquerCatalogue(fiches) {
  LEVEL_CATEGORIES = construireCategories(fiches);
}

// Les fiches du catalogue en service, prêtes à être enregistrées.
export function catalogueFiches() {
  return LEVEL_CATEGORIES.map((categorie) => ({
    id: categorie.id,
    label: categorie.label,
    niveaux: categorie.levels.map((niveau) => niveau.fiche),
  }));
}

export function tousLesNiveaux() {
  return LEVEL_CATEGORIES.flatMap((categorie) => categorie.levels);
}

export function niveauParId(id) {
  return tousLesNiveaux().find((niveau) => niveau.id === id) || null;
}

// Le niveau suivant dans l'ordre du catalogue, ou null si c'était le dernier.
export function niveauSuivant(level) {
  const tous = tousLesNiveaux();
  return tous[tous.indexOf(level) + 1] || null;
}

// ── Construction ─────────────────────────────────────────────────────────────

// Marque tout ce que l'ÉNONCÉ a posé : ces pièces ne sont ni supprimables par le
// joueur, ni comptées dans la masse du pont.
function marquerDuNiveau(structure) {
  for (const beam of structure.beams) beam.duNiveau = true;
  for (const node of structure.nodes) node.duNiveau = true;
  for (const load of structure.loads || []) load.duNiveau = true;
}

export function buildLevel(level) {
  const structure = structuredClone(level.depart);
  marquerDuNiveau(structure);
  return structure;
}

// ── Empreinte de l'énoncé ────────────────────────────────────────────────────
// Un élève garde SON pont d'un niveau à l'autre séance (voir model/progression).
// Mais l'administrateur peut retoucher le niveau entre-temps : rouvrir le pont
// sur un énoncé qui a bougé donnerait une scène incohérente (une route déplacée,
// un appui disparu). On enregistre donc, avec le pont, une empreinte de l'énoncé
// sur lequel il a été bâti ; si elle ne correspond plus, le pont n'est pas
// rechargé et l'élève repart d'une base neuve.
//
// L'empreinte ne retient que ce qui compte pour la géométrie du jeu : position
// et matériau des pièces de l'énoncé, appuis, véhicules. Les identifiants et
// l'ORDRE n'y entrent pas — additionner les empreintes de chaque pièce rend le
// total insensible au rangement, qui change sans que le niveau change.
function empreinte(texte) {
  let h = 5381;
  for (let k = 0; k < texte.length; k++) h = ((h * 33) ^ texte.charCodeAt(k)) >>> 0;
  return h;
}

export function signatureEnonce(level) {
  const scene = level.depart || {};
  let total = 0;
  const ajouter = (texte) => { total = (total + empreinte(texte)) >>> 0; };
  for (const beam of scene.beams || []) {
    ajouter(`p${beam.gridA.i},${beam.gridA.j},${beam.gridB.i},${beam.gridB.j},${beam.materialId}`);
  }
  for (const node of scene.nodes || []) {
    if (node.fixed) ajouter(`a${Math.round(node.restX * 100)},${Math.round(node.restY * 100)}`);
    if (node.arrivee) ajouter(`f${Math.round(node.restX * 100)}`);
  }
  for (const v of scene.mobileLoads || []) ajouter(`v${v.presetId},${Math.round(v.mass)}`);
  for (const b of scene.bateaux || []) ajouter(`b${b.type},${Math.round(b.x * 100)}`);
  // Les matériaux autorisés en font partie : rouvrir un pont d'acier sur un
  // niveau devenu « bois seulement » donnerait une scène que l'élève ne pourrait
  // ni reproduire ni prolonger.
  for (const id of level.materiaux || []) ajouter(`m${id}`);
  return `${(scene.beams || []).length}-${total.toString(36)}`;
}

// ── Notation ─────────────────────────────────────────────────────────────────

// Masse (kg) du PONT : uniquement ce qui a été ajouté par-dessus l'énoncé.
export function massePont(structure) {
  let total = 0;
  for (const beam of structure.beams) {
    if (!beam.duNiveau) total += computeBeamMass(structure, beam);
  }
  return total;
}

// Masses (kg) à ne pas dépasser pour 3, 2 et 1 étoile. Chaque seuil vient du
// niveau s'il le fixe, sinon du facteur par défaut appliqué à l'objectif.
export function seuilsMasse(level) {
  const [f3, f2, f1] = SEUILS_ETOILES;
  const impose = (valeur, facteur) => (Number.isFinite(valeur) ? valeur : facteur * level.objectif3);
  return [f3 * level.objectif3, impose(level.objectif2, f2), impose(level.objectif1, f1)];
}

export function etoilesPour(level, masse) {
  const seuils = seuilsMasse(level);
  if (masse <= seuils[0]) return 3;
  if (masse <= seuils[1]) return 2;
  if (masse <= seuils[2]) return 1;
  return 0;
}
