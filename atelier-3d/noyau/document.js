/*
 * noyau/document.js
 * ─────────────────
 * Le document : une enveloppe versionnée autour d'un arbre de nœuds. C'est la
 * seule donnée qui existe dans le logiciel. La scène 3D, les panneaux, les
 * maillages et les vignettes en sont des dérivés recalculables.
 *
 * Toutes les fonctions sont pures. Celles qui « modifient » l'arbre ne
 * recopient que la branche touchée — les ancêtres du nœud visé — et rendent
 * tous les autres sous-arbres à l'identique, MÊME RÉFÉRENCE. C'est ce qui
 * permet à la vue de sauter les branches intactes au lieu de tout reconstruire.
 */

import { creerNoeud, avecEnfants } from "./noeud.js";

export const FORMAT_DOCUMENT  = "cao-college";
export const VERSION_DOCUMENT = 2;

// La racine n'est pas un solide : c'est le conteneur des objets de premier
// niveau. Son type n'a pas de fonction « construire » dans le registre, et
// c'est à ça que la couche géométrie reconnaît un conteneur.
export const TYPE_RACINE = "racine";

export function creerDocument(champs = {}) {
  return Object.freeze({
    format:  FORMAT_DOCUMENT,
    version: VERSION_DOCUMENT,
    nom:     champs.nom ?? "Projet sans nom",
    racine:  champs.racine ?? creerNoeud({ type: TYPE_RACINE, nom: "Construction" }),
    // Les vues en coupe du projet : voir noyau/vues_en_coupe.js.
    coupes:  champs.coupes ?? [],
    // Les variables du projet : voir noyau/variables.js.
    variables: Object.freeze([...(champs.variables ?? [])]),
    // Le plateau d'impression, ou null s'il est vide : voir noyau/plateau.js.
    impression: champs.impression ?? null,
  });
}

export function avecRacine(document, racine) {
  return Object.freeze({ ...document, racine });
}

export function avecNom(document, nom) {
  return Object.freeze({ ...document, nom });
}

export function avecCoupes(document, coupes) {
  return Object.freeze({ ...document, coupes });
}

export function avecImpression(document, impression) {
  return Object.freeze({ ...document, impression });
}

export function avecVariables(document, variables) {
  return Object.freeze({ ...document, variables: Object.freeze([...variables]) });
}

// ── Parcours ────────────────────────────────────────────────────────────────

/* Parcours prefixe. Rend le parent et la profondeur, dont l'arbre de
   construction a besoin pour son indentation. */
export function* parcourir(noeud, parent = null, profondeur = 0) {
  yield { noeud, parent, profondeur };
  for (const enfant of noeud.enfants) {
    yield* parcourir(enfant, noeud, profondeur + 1);
  }
}

export function trouverNoeud(document, id) {
  for (const { noeud } of parcourir(document.racine)) {
    if (noeud.id === id) return noeud;
  }
  return null;
}

export function trouverParent(document, id) {
  for (const { noeud, parent } of parcourir(document.racine)) {
    if (noeud.id === id) return parent;
  }
  return null;
}

export function indexDansParent(document, id) {
  const parent = trouverParent(document, id);
  return parent === null ? -1 : parent.enfants.findIndex((enfant) => enfant.id === id);
}

/* Liste des identifiants, de la racine jusqu'au nœud inclus ; [] s'il est
   absent. Sert à déplier l'arbre de construction sur la sélection. */
export function cheminVers(document, id) {
  const chemin = [];
  const descendre = (noeud) => {
    chemin.push(noeud.id);
    if (noeud.id === id) return true;
    for (const enfant of noeud.enfants) {
      if (descendre(enfant)) return true;
    }
    chemin.pop();
    return false;
  };
  return descendre(document.racine) ? chemin : [];
}

/* Nombre d'objets, racine exclue : c'est le chiffre de la barre d'etat. */
export function compterNoeuds(document) {
  let total = -1;
  for (const _ of parcourir(document.racine)) total += 1;
  return total;
}

// ── Modifications de l'arbre ────────────────────────────────────────────────

function remplacerDansSousArbre(noeud, id, remplacant) {
  if (noeud.id === id) return remplacant;
  if (noeud.enfants.length === 0) return noeud;

  let modifie = false;
  const enfants = noeud.enfants.map((enfant) => {
    const nouveau = remplacerDansSousArbre(enfant, id, remplacant);
    if (nouveau !== enfant) modifie = true;
    return nouveau;
  });
  return modifie ? avecEnfants(noeud, enfants) : noeud;
}

export function remplacerNoeud(document, id, remplacant) {
  // Vérifié avant, et pas déduit du résultat : remplacer un nœud par lui-même
  // est légitime et ne doit pas produire un message d'erreur mensonger.
  if (trouverNoeud(document, id) === null) {
    throw new Error("remplacerNoeud : aucun noeud « " + id + " » dans le document.");
  }
  return avecRacine(document, remplacerDansSousArbre(document.racine, id, remplacant));
}

export function insererNoeud(document, idParent, noeud, index = -1) {
  const parent = trouverNoeud(document, idParent);
  if (parent === null) {
    throw new Error("insererNoeud : aucun parent « " + idParent + " » dans le document.");
  }
  const enfants = [...parent.enfants];
  enfants.splice(index < 0 ? enfants.length : index, 0, noeud);
  return remplacerNoeud(document, idParent, avecEnfants(parent, enfants));
}

export function supprimerNoeud(document, id) {
  const parent = trouverParent(document, id);
  if (parent === null) {
    throw new Error("supprimerNoeud : « " + id + " » est absent, ou c'est la racine.");
  }
  const enfants = parent.enfants.filter((enfant) => enfant.id !== id);
  return remplacerNoeud(document, parent.id, avecEnfants(parent, enfants));
}

export function deplacerVersParent(document, id, idNouveauParent, index = -1) {
  const noeud = trouverNoeud(document, id);
  if (noeud === null) {
    throw new Error("deplacerVersParent : aucun noeud « " + id + " » dans le document.");
  }
  if (cheminVers(document, idNouveauParent).includes(id)) {
    throw new Error("deplacerVersParent : un objet ne peut pas contenir son propre parent.");
  }
  return insererNoeud(supprimerNoeud(document, id), idNouveauParent, noeud, index);
}
