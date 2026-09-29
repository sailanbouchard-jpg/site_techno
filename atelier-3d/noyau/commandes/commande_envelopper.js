/*
 * noyau/commandes/commande_envelopper.js
 * ──────────────────────────────────────
 * Pose un objet dans une répétition (symétrie, en ligne, en cercle) : la
 * répétition prend sa place dans la construction, au pied de l'objet, et
 * l'objet devient son enfant, décalé d'autant. Rien ne bouge à l'écran.
 *
 * Un objet « trou » donne une répétition de trous : c'est la répétition qui
 * porte la case, l'original redevient plein à l'intérieur.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, trouverParent, indexDansParent } from "../document.js";
import { creerNoeud, avecChamps, avecPosition } from "../noeud.js";

export const commandeEnvelopper = {
  type: "envelopper",

  /* pointDAppui : le pied de l'objet, dans le repère de son parent. */
  creer(document, idNoeud, nomDuType, parametres, pointDAppui) {
    const noeud = trouverNoeud(document, idNoeud);
    const parent = trouverParent(document, idNoeud);
    if (noeud === null || parent === null) {
      throw new Error("Cet objet n'existe plus.");
    }
    const { position } = noeud.transformation;
    const decale = avecPosition(avecChamps(noeud, { trou: false }), {
      x: position.x - pointDAppui.x, y: position.y - pointDAppui.y, z: position.z - pointDAppui.z,
    });
    const enveloppe = creerNoeud({
      type: nomDuType,
      parametres,
      transformation: { position: pointDAppui },
      trou: noeud.trou,
      enfants: [decale],
    });
    return { type: "envelopper", idParent: parent.id, index: indexDansParent(document, idNoeud), noeud, enveloppe };
  },

  appliquer(document, commande) {
    const sans = supprimerNoeud(document, commande.noeud.id);
    return insererNoeud(sans, commande.idParent, commande.enveloppe, commande.index);
  },

  annuler(document, commande) {
    const sans = supprimerNoeud(document, commande.enveloppe.id);
    return insererNoeud(sans, commande.idParent, commande.noeud, commande.index);
  },

  identifiantsCrees: (commande) => [commande.enveloppe.id],
  identifiantsRestaures: (commande) => [commande.noeud.id],
};
