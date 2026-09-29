/*
 * noyau/commandes/commande_modifier_parametre.js
 * Modifie une seule clé des paramètres propres au type (rayon, hauteur…).
 * Les champs numériques de l'inspecteur en émettent une par frappe : sans la
 * fusion, taper « 120 » laisserait trois entrées d'annulation.
 */

import { remplacerNoeud, trouverNoeud } from "../document.js";
import { avecParametres } from "../noeud.js";

function regler(document, idNoeud, cle, valeur) {
  const noeud = trouverNoeud(document, idNoeud);
  if (noeud === null) {
    throw new Error("Modification impossible : l'objet « " + idNoeud + " » n'existe plus.");
  }
  return remplacerNoeud(document, idNoeud, avecParametres(noeud, { [cle]: valeur }));
}

export const commandeModifierParametre = {
  type: "modifier_parametre",

  creer(idNoeud, cle, valeurAvant, valeurApres) {
    return { type: "modifier_parametre", idNoeud, cle, valeurAvant, valeurApres };
  },

  appliquer(document, commande) {
    return regler(document, commande.idNoeud, commande.cle, commande.valeurApres);
  },

  annuler(document, commande) {
    return regler(document, commande.idNoeud, commande.cle, commande.valeurAvant);
  },

  fusionnerAvec(precedente, courante) {
    if (precedente.idNoeud !== courante.idNoeud) return null;
    if (precedente.cle !== courante.cle) return null;
    return { ...precedente, valeurApres: courante.valeurApres };
  },
};
