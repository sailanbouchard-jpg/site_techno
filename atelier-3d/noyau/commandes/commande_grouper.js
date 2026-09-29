/*
 * noyau/commandes/commande_grouper.js
 * ───────────────────────────────────
 * Grouper retire les objets sélectionnés de leur parent et les range sous un
 * nœud « groupe » posé à la place du premier d'entre eux. Les objets ne sont
 * pas fusionnés dans le document : seul leur MAILLAGE le sera, dans l'ouvrier.
 * L'arbre reste la vérité, donc dégrouper les rend intacts.
 *
 * pointDAppui : là où le groupe se tient, en général le centre du dessous de
 * l'ensemble — c'est l'appelant qui le mesure, à partir de ce qu'il voit. Le
 * groupe est posé là, et ses enfants décalés d'autant : rien ne bouge à
 * l'écran, mais le mode « Poser » saisit ensuite le groupe par son pied, comme
 * n'importe quel objet.
 *
 * Restriction assumée : les membres doivent partager le même parent. Sinon il
 * faudrait recalculer leurs transformations pour les faire entrer dans un
 * repère commun, et l'élève verrait ses objets sauter.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, trouverParent, indexDansParent } from "../document.js";
import { creerNoeud, avecPosition } from "../noeud.js";

const ORIGINE = { x: 0, y: 0, z: 0 };

function decale(noeud, appui) {
  const { position } = noeud.transformation;
  return avecPosition(noeud, { x: position.x - appui.x, y: position.y - appui.y, z: position.z - appui.z });
}

export const commandeGrouper = {
  type: "grouper",

  creer(document, idsMembres, nomDuGroupe = "", pointDAppui = ORIGINE, parametres = {}) {
    if (idsMembres.length < 2) {
      throw new Error("Il faut au moins deux objets pour faire un groupe.");
    }

    const membres = idsMembres.map((id) => {
      const noeud = trouverNoeud(document, id);
      const parent = trouverParent(document, id);
      if (noeud === null || parent === null) {
        throw new Error("Groupement impossible : l'objet « " + id + " » n'existe plus.");
      }
      return { idParent: parent.id, index: indexDansParent(document, id), noeud };
    });

    const idParent = membres[0].idParent;
    if (membres.some((membre) => membre.idParent !== idParent)) {
      throw new Error("Pour les grouper, les objets doivent être au même niveau de la construction.");
    }

    // Les enfants gardent l'ordre de la construction, pas celui de la sélection :
    // l'ordre d'un groupe change son résultat quand il contient des trous.
    const ordonnes = [...membres].sort((a, b) => a.index - b.index);
    const groupe = creerNoeud({
      type: "groupe",
      nom: nomDuGroupe,
      parametres,
      transformation: { position: pointDAppui },
      enfants: ordonnes.map((membre) => decale(membre.noeud, pointDAppui)),
    });

    return { type: "grouper", idParent, index: ordonnes[0].index, membres: ordonnes, groupe };
  },

  appliquer(document, commande) {
    let resultat = document;
    for (const membre of commande.membres) {
      resultat = supprimerNoeud(resultat, membre.noeud.id);
    }
    return insererNoeud(resultat, commande.idParent, commande.groupe, commande.index);
  },

  annuler(document, commande) {
    let resultat = supprimerNoeud(document, commande.groupe.id);
    // Rangs croissants : chaque insertion décale les suivantes d'un cran, donc
    // remettre dans l'ordre d'origine restitue exactement la liste de départ.
    for (const membre of commande.membres) {
      resultat = insererNoeud(resultat, membre.idParent, membre.noeud, membre.index);
    }
    return resultat;
  },

  identifiantsCrees(commande) {
    return [commande.groupe.id];
  },

  identifiantsRestaures(commande) {
    return commande.membres.map((membre) => membre.noeud.id);
  },
};
