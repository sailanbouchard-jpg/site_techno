/*
 * noyau/noeud.js
 * ──────────────
 * Le nœud : la seule brique du document. Il n'importe que les bornes de
 * l'atelier, qui n'importent rien elles-mêmes : ce fichier s'exécute tel quel
 * sous Node comme dans le navigateur.
 *
 * Toutes les fonctions retournent un NOUVEAU nœud gelé ; aucune ne modifie
 * celui qu'elle reçoit. C'est ce qui rend l'annulation gratuite, et surtout ce
 * qui permet à la vue de comparer par identité (===) : un sous-arbre dont la
 * référence n'a pas bougé n'a pas changé, on ne le retouche pas.
 */

import { bornerCoordonnee, bornerTaille } from "./limites.js";

// ── Identifiants ────────────────────────────────────────────────────────────

// crypto.randomUUID() n'existe qu'en contexte sécurisé. Le site est servi en
// http sur le réseau du collège : on ne peut pas s'en servir.
let _compteurIdentifiants = 0;

export function nouvelIdentifiant() {
  _compteurIdentifiants += 1;
  const hasard = Math.floor(Math.random() * 0x1000000).toString(36);
  return `n${_compteurIdentifiants.toString(36)}_${hasard}`;
}

// ── Transformation ──────────────────────────────────────────────────────────

/*
 * Millimètres, degrés, axe Z vertical, Z = 0 au sol. Les rotations
 * s'appliquent dans l'ordre X, puis Y, puis Z, autour de l'origine du nœud.
 *
 * L'échelle reste à 1 pour les primitives : leurs dimensions sont des
 * paramètres, pas une déformation. Elle ne sert qu'aux maillages importés,
 * qui n'ont aucun paramètre à régler.
 *
 * L'appui est la normale de la surface sur laquelle la pièce a été posée. Il
 * ne change rien à l'affichage : il sert à la reposer ailleurs sans lui faire
 * perdre l'angle que l'élève lui a donné. Par défaut, elle est posée à plat.
 */
export const TRANSFORMATION_NEUTRE = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  echelle:  Object.freeze({ x: 1, y: 1, z: 1 }),
  appui:    Object.freeze({ x: 0, y: 0, z: 1 }),
});

function figerVecteur(source, defaut, corriger = (v) => v) {
  if (!source) return defaut;
  return Object.freeze({
    x: Number.isFinite(source.x) ? corriger(source.x) : defaut.x,
    y: Number.isFinite(source.y) ? corriger(source.y) : defaut.y,
    z: Number.isFinite(source.z) ? corriger(source.z) : defaut.z,
  });
}

/* Le seul passage obligé pour placer une pièce : c'est ici que les bornes de
   l'atelier s'appliquent, quelle que soit la commande qui écrit. */
export function creerTransformation(champs) {
  if (!champs) return TRANSFORMATION_NEUTRE;
  return Object.freeze({
    position: figerVecteur(champs.position, TRANSFORMATION_NEUTRE.position, bornerCoordonnee),
    rotation: figerVecteur(champs.rotation, TRANSFORMATION_NEUTRE.rotation),
    echelle:  figerVecteur(champs.echelle,  TRANSFORMATION_NEUTRE.echelle, bornerTaille),
    appui:    figerVecteur(champs.appui,    TRANSFORMATION_NEUTRE.appui),
  });
}

// ── Création ────────────────────────────────────────────────────────────────

/*
 * Champs d'un nœud :
 *   id              engendré, sauf au chargement d'un fichier et dans les tests
 *   type            clé dans le registre de types (obligatoire)
 *   nom             "" signifie « prends l'étiquette de ton type ». Évite de
 *                   recopier « Cylindre » dans chaque nœud et de figer le
 *                   libellé dans les fichiers des élèves
 *   parametres      propres au type, décrits par le registre
 *   transformation  position / rotation / échelle, et la surface d'appui
 *   couleur         null = couleur par défaut du type
 *   finition        null = mat ; "brillant", "metal", "translucide" (noyau/finitions.js)
 *   formules        champ → calcul sur les variables du projet (noyau/variables.js)
 *   trou            l'objet creuse au lieu d'ajouter, une fois groupé
 *   visible         masqué depuis l'arbre de construction
 *   enfants         groupes, répétitions, symétries
 */
export function creerNoeud(champs) {
  if (!champs || typeof champs.type !== "string" || champs.type === "") {
    throw new Error("creerNoeud : le champ « type » est obligatoire.");
  }
  return Object.freeze({
    id:             champs.id ?? nouvelIdentifiant(),
    type:           champs.type,
    nom:            champs.nom ?? "",
    parametres:     Object.freeze({ ...(champs.parametres ?? {}) }),
    transformation: creerTransformation(champs.transformation),
    couleur:        champs.couleur ?? null,
    finition:       champs.finition ?? null,
    formules:       Object.freeze({ ...(champs.formules ?? {}) }),
    trou:           champs.trou === true,
    visible:        champs.visible !== false,
    enfants:        Object.freeze([...(champs.enfants ?? [])]),
  });
}

// ── Dérivation ──────────────────────────────────────────────────────────────

export function avecChamps(noeud, modifications) {
  return creerNoeud({ ...noeud, ...modifications });
}

export function avecParametres(noeud, modifications) {
  return avecChamps(noeud, { parametres: { ...noeud.parametres, ...modifications } });
}

export function avecTransformation(noeud, modifications) {
  return avecChamps(noeud, { transformation: { ...noeud.transformation, ...modifications } });
}

export function avecPosition(noeud, position) {
  return avecTransformation(noeud, { position });
}

export function avecEnfants(noeud, enfants) {
  return avecChamps(noeud, { enfants });
}

// ── Lecture ─────────────────────────────────────────────────────────────────

export function aDesEnfants(noeud) {
  return noeud.enfants.length > 0;
}

/* Le nom affiché : celui de l'élève s'il en a donné un, sinon l'étiquette du
   type, que seul l'appelant connaît (le noyau n'importe pas le registre). */
export function nomAffiche(noeud, etiquetteDuType) {
  return noeud.nom !== "" ? noeud.nom : etiquetteDuType;
}
