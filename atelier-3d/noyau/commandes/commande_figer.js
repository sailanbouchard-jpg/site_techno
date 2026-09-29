/*
 * noyau/commandes/commande_figer.js
 * ─────────────────────────────────
 * Figer une répétition : ses copies deviennent des objets indépendants,
 * qu'on peut sélectionner et déplacer un par un. Destructif, mais annulable.
 * Figer sépare ; pour souder le tout en une pièce, on groupe ensuite.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, trouverParent, indexDansParent } from "../document.js";
import { avecChamps } from "../noeud.js";
import { matriceDeTransformation, composer, decomposer } from "../transformations.js";
import { typeDeNoeud, parametresParDefaut } from "../registre_types_de_noeuds.js";
import { copieAvecNouveauxIdentifiants } from "./commande_dupliquer.js";

export const commandeFiger = {
  type: "figer",

  creer(document, idRepetition) {
    const repetition = trouverNoeud(document, idRepetition);
    const parent = trouverParent(document, idRepetition);
    if (repetition === null || parent === null) throw new Error("Cette répétition n'existe plus.");
    const type = typeDeNoeud(repetition.type);
    if (typeof type.copies !== "function") throw new Error("Seule une répétition peut être figée.");
    const original = repetition.enfants[0];
    if (original === undefined) throw new Error("Cette répétition est vide.");

    const matrice = matriceDeTransformation(repetition.transformation);
    const deLOriginal = matriceDeTransformation(original.transformation);
    const p = { ...parametresParDefaut(repetition.type), ...repetition.parametres };
    const copies = type.copies(p).map((m) => {
      const transformation = decomposer(composer(matrice, composer(m, deLOriginal)));
      if (transformation === null) {
        throw new Error("Impossible de figer : la répétition a été étirée dans un seul sens. Remets-lui des proportions égales.");
      }
      return avecChamps(copieAvecNouveauxIdentifiants(original), {
        transformation,
        trou: original.trou || repetition.trou,
        visible: original.visible && repetition.visible,
      });
    });
    return { type: "figer", idParent: parent.id, index: indexDansParent(document, idRepetition), repetition, copies };
  },

  appliquer(document, commande) {
    let resultat = supprimerNoeud(document, commande.repetition.id);
    commande.copies.forEach((copie, rang) => {
      resultat = insererNoeud(resultat, commande.idParent, copie, commande.index + rang);
    });
    return resultat;
  },

  annuler(document, commande) {
    let resultat = document;
    for (const copie of commande.copies) resultat = supprimerNoeud(resultat, copie.id);
    return insererNoeud(resultat, commande.idParent, commande.repetition, commande.index);
  },

  identifiantsCrees: (commande) => commande.copies.map((copie) => copie.id),
  identifiantsRestaures: (commande) => [commande.repetition.id],
};
