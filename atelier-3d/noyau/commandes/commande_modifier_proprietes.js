/*
 * noyau/commandes/commande_modifier_proprietes.js
 * Nom, couleur, finition, visibilité, case Trou, formules retirées : ce qui décrit un objet sans toucher à
 * sa forme ni à sa place. « avant » et « apres » portent les mêmes clés.
 */

import { remplacerNoeud, trouverNoeud } from "../document.js";
import { avecChamps } from "../noeud.js";

// Liste fermée : cette commande ne doit jamais servir à changer le type d'un
// objet ou ses enfants, qui ont chacun leur commande et leurs vérifications.
const PROPRIETES = new Set(["nom", "couleur", "finition", "visible", "trou", "formules"]);

function verifier(valeurs) {
  for (const cle of Object.keys(valeurs)) {
    if (!PROPRIETES.has(cle)) {
      throw new Error("La propriété « " + cle + " » ne se modifie pas de cette façon.");
    }
  }
}

function modifier(document, idNoeud, valeurs) {
  const noeud = trouverNoeud(document, idNoeud);
  if (noeud === null) {
    throw new Error("Modification impossible : l'objet « " + idNoeud + " » n'existe plus.");
  }
  return remplacerNoeud(document, idNoeud, avecChamps(noeud, valeurs));
}

const memesCles = (a, b) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((cle) => cle in b);

export const commandeModifierProprietes = {
  type: "modifier_proprietes",

  creer(idNoeud, avant, apres) {
    verifier(avant);
    verifier(apres);
    if (!memesCles(avant, apres)) {
      throw new Error("modifier_proprietes : « avant » et « apres » doivent porter les mêmes clés.");
    }
    return { type: "modifier_proprietes", idNoeud, avant, apres };
  },

  appliquer(document, commande) {
    return modifier(document, commande.idNoeud, commande.apres);
  },

  annuler(document, commande) {
    return modifier(document, commande.idNoeud, commande.avant);
  },

  // Taper un nom lettre par lettre ne laisse qu'une annulation.
  fusionnerAvec(precedente, courante) {
    if (precedente.idNoeud !== courante.idNoeud) return null;
    if (!memesCles(precedente.apres, courante.apres)) return null;
    return { ...precedente, apres: courante.apres };
  },
};
