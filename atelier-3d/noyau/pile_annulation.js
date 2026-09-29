/*
 * noyau/pile_annulation.js
 * ────────────────────────
 * L'état d'édition : le document, ce qui a été fait, ce qui a été annulé.
 * Fonctions pures — l'état vit dans application.js, pas ici. C'est ce qui rend
 * « annuler puis refaire cinquante fois » testable sans navigateur.
 *
 * Ce fichier ne connaît aucun type de commande : il ne sait qu'appeler
 * appliquer / annuler / fusionnerAvec sur un descripteur du registre.
 */

import { descripteurDeCommande, commandeLot } from "./commandes/registre_commandes.js";

// Deux commandes de même nature émises à moins d'une demi-seconde d'intervalle
// appartiennent au même geste de l'élève : un glisser, une frappe au clavier.
export const DELAI_FUSION_MS = 500;
// Au-delà, on oublie les plus anciennes : une heure de travail garde de quoi
// revenir en arrière sans faire enfler la mémoire de l'onglet.
export const ACTIONS_GARDEES = 200;

const plafonner = (passe) => (passe.length > ACTIONS_GARDEES ? passe.slice(passe.length - ACTIONS_GARDEES) : passe);

export function creerEtat(document) {
  return Object.freeze({ document, passe: [], futur: [] });
}

export function peutAnnuler(etat) {
  return etat.passe.length > 0;
}

export function peutRefaire(etat) {
  return etat.futur.length > 0;
}

function fusionPossible(etat, commande, maintenant) {
  if (etat.passe.length === 0) return null;

  const derniere = etat.passe[etat.passe.length - 1];
  if (derniere.commande.type !== commande.type) return null;
  if (maintenant - derniere.instant > DELAI_FUSION_MS) return null;

  const descripteur = descripteurDeCommande(commande.type);
  if (typeof descripteur.fusionnerAvec !== "function") return null;

  return descripteur.fusionnerAvec(derniere.commande, commande);
}

/* Exécute une commande. Toute nouvelle action efface ce qui avait été annulé :
   on ne peut pas refaire un futur qui n'a plus de sens. */
export function executer(etat, commande, maintenant = Date.now()) {
  const descripteur = descripteurDeCommande(commande.type);
  const document = descripteur.appliquer(etat.document, commande);

  const fusionnee = fusionPossible(etat, commande, maintenant);
  if (fusionnee !== null) {
    const passe = etat.passe.slice(0, -1);
    passe.push({ commande: fusionnee, instant: maintenant });
    return Object.freeze({ document, passe, futur: [] });
  }

  return Object.freeze({
    document,
    passe: plafonner([...etat.passe, { commande, instant: maintenant }]),
    futur: [],
  });
}

export function annuler(etat) {
  if (!peutAnnuler(etat)) return etat;

  const derniere = etat.passe[etat.passe.length - 1];
  const descripteur = descripteurDeCommande(derniere.commande.type);
  return Object.freeze({
    document: descripteur.annuler(etat.document, derniere.commande),
    passe: etat.passe.slice(0, -1),
    futur: [derniere, ...etat.futur],
  });
}

/* Tout ce qui a été fait depuis « depuis » ne compte que pour une annulation :
   une opération réglée en dix retouches s'annule d'un coup. L'instant nul
   empêche le lot de fusionner avec le geste suivant. */
export function regrouper(etat, depuis, libelle) {
  if (etat.passe.length - depuis < 2) return etat;
  const commandes = etat.passe.slice(depuis).map((entree) => entree.commande);
  return Object.freeze({
    document: etat.document,
    passe: [...etat.passe.slice(0, depuis), { commande: commandeLot.creer(commandes, libelle), instant: 0 }],
    futur: [],
  });
}

/* Revenir à une profondeur d'annulation et oublier ce qui a été défait : une
   opération abandonnée ne doit pas pouvoir être « refaite ». */
export function revenirA(etat, profondeur) {
  let courant = etat;
  while (courant.passe.length > profondeur) courant = annuler(courant);
  return Object.freeze({ ...courant, futur: [] });
}

export function refaire(etat) {
  if (!peutRefaire(etat)) return etat;

  const prochaine = etat.futur[0];
  const descripteur = descripteurDeCommande(prochaine.commande.type);
  return Object.freeze({
    document: descripteur.appliquer(etat.document, prochaine.commande),
    passe: [...etat.passe, prochaine],
    futur: etat.futur.slice(1),
  });
}
