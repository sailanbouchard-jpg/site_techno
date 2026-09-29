/*
 * noyau/commandes/commande_dupliquer.js
 * Copie des objets, enfants compris, avec de nouveaux identifiants. Chaque
 * copie est rangée juste après son original et légèrement décalée, pour qu'on
 * la voie apparaître.
 *
 * Les identifiants sont tirés à la création de la commande, pas à son
 * application : refaire une duplication redonne les mêmes copies.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, trouverParent, indexDansParent } from "../document.js";
import { creerNoeud } from "../noeud.js";

export function copieAvecNouveauxIdentifiants(noeud) {
  return creerNoeud({
    ...noeud,
    id: undefined,
    enfants: noeud.enfants.map(copieAvecNouveauxIdentifiants),
  });
}

export const commandeDupliquer = {
  type: "dupliquer",

  creer(document, ids, decalage = { x: 0, y: 0, z: 0 }) {
    const copies = ids.map((id) => {
      const noeud = trouverNoeud(document, id);
      const parent = trouverParent(document, id);
      if (noeud === null || parent === null) {
        throw new Error("Duplication impossible : l'objet « " + id + " » n'existe plus.");
      }
      const copie = copieAvecNouveauxIdentifiants(noeud);
      const { position } = copie.transformation;
      const placee = creerNoeud({
        ...copie,
        transformation: {
          ...copie.transformation,
          position: { x: position.x + decalage.x, y: position.y + decalage.y, z: position.z + decalage.z },
        },
      });
      return { idParent: parent.id, index: indexDansParent(document, id) + 1, noeud: placee };
    });

    // Du dernier rang au premier : une insertion ne décale ainsi jamais la
    // place prévue pour la suivante.
    copies.sort((a, b) => b.index - a.index);
    return { type: "dupliquer", copies };
  },

  appliquer(document, commande) {
    let resultat = document;
    for (const copie of commande.copies) {
      resultat = insererNoeud(resultat, copie.idParent, copie.noeud, copie.index);
    }
    return resultat;
  },

  annuler(document, commande) {
    let resultat = document;
    for (const copie of commande.copies) {
      resultat = supprimerNoeud(resultat, copie.noeud.id);
    }
    return resultat;
  },

  identifiantsCrees(commande) {
    return commande.copies.map((copie) => copie.noeud.id);
  },
};
