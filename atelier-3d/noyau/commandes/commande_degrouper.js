/*
 * noyau/commandes/commande_degrouper.js
 * ─────────────────────────────────────
 * Rend les enfants d'un groupe à son parent, à la place du groupe, sans qu'ils
 * bougent à l'écran : la transformation du groupe est reportée sur chacun.
 *
 * Un cas est refusé : un groupe étiré dans un seul sens qui contient des
 * objets tournés. Leurs formes seraient cisaillées, et aucune position /
 * rotation / dimension ne sait décrire un cisaillement. Plutôt que de déformer
 * la pièce de l'élève en silence, on le lui dit.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, trouverParent, indexDansParent } from "../document.js";
import { avecChamps } from "../noeud.js";
import { matriceDeTransformation, composer, decomposer } from "../transformations.js";

export const commandeDegrouper = {
  type: "degrouper",

  creer(document, idGroupe) {
    const groupe = trouverNoeud(document, idGroupe);
    const parent = trouverParent(document, idGroupe);
    if (groupe === null || parent === null) {
      throw new Error("Dégroupement impossible : ce groupe n'existe plus.");
    }
    if (groupe.enfants.length === 0) {
      throw new Error("Ce groupe est vide : il n'y a rien à dégrouper.");
    }

    const matriceDuGroupe = matriceDeTransformation(groupe.transformation);
    const enfants = groupe.enfants.map((enfant) => {
      const transformation = decomposer(composer(matriceDuGroupe, matriceDeTransformation(enfant.transformation)));
      if (transformation === null) {
        throw new Error("Impossible de dégrouper « " + (groupe.nom || "ce groupe") + " » : il a été étiré dans un " +
          "seul sens et contient des objets tournés. Remets-lui des proportions égales avant de dégrouper.");
      }
      // Ce que le groupe imposait à tous passe à chacun : un groupe-trou rend
      // des trous, un groupe masqué rend des objets masqués.
      return avecChamps(enfant, {
        transformation,
        trou: enfant.trou || groupe.trou,
        visible: enfant.visible && groupe.visible,
      });
    });

    return {
      type: "degrouper",
      idParent: parent.id,
      index: indexDansParent(document, idGroupe),
      groupe,
      enfants,
    };
  },

  appliquer(document, commande) {
    let resultat = supprimerNoeud(document, commande.groupe.id);
    commande.enfants.forEach((enfant, rang) => {
      resultat = insererNoeud(resultat, commande.idParent, enfant, commande.index + rang);
    });
    return resultat;
  },

  annuler(document, commande) {
    let resultat = document;
    for (const enfant of commande.enfants) {
      resultat = supprimerNoeud(resultat, enfant.id);
    }
    return insererNoeud(resultat, commande.idParent, commande.groupe, commande.index);
  },

  identifiantsCrees(commande) {
    return commande.enfants.map((enfant) => enfant.id);
  },

  identifiantsRestaures(commande) {
    return [commande.groupe.id];
  },
};
