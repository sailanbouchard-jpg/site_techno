/*
 * noyau/commandes/commande_lot.js
 * ───────────────────────────────
 * Plusieurs commandes qui ne forment qu'un geste : supprimer trois objets
 * sélectionnés, les déplacer ensemble, les marquer tous « trou ». Une seule
 * entrée d'annulation pour le tout.
 *
 * Ce fichier est une fabrique, et non une commande prête à l'emploi : le lot
 * doit retrouver le descripteur de chacune de ses commandes, donc dépend du
 * registre — qui, lui, contient le lot. Recevoir la fonction de recherche en
 * paramètre évite l'import circulaire, dont le résultat dépendrait de l'ordre
 * de chargement des modules.
 */

export function creerCommandeLot(descripteurDeCommande) {
  return {
    type: "lot",

    creer(commandes, libelle = "") {
      if (commandes.length === 0) {
        throw new Error("Un lot de commandes ne peut pas être vide.");
      }
      return { type: "lot", libelle, commandes };
    },

    appliquer(document, lot) {
      return lot.commandes.reduce(
        (resultat, commande) => descripteurDeCommande(commande.type).appliquer(resultat, commande),
        document,
      );
    },

    // À rebours : chaque commande est annulée dans l'état exact qu'elle a laissé.
    annuler(document, lot) {
      return [...lot.commandes].reverse().reduce(
        (resultat, commande) => descripteurDeCommande(commande.type).annuler(resultat, commande),
        document,
      );
    },

    identifiantsCrees(lot) {
      return lot.commandes.flatMap((commande) => {
        const descripteur = descripteurDeCommande(commande.type);
        return typeof descripteur.identifiantsCrees === "function" ? descripteur.identifiantsCrees(commande) : [];
      });
    },

    identifiantsRestaures(lot) {
      return lot.commandes.flatMap((commande) => {
        const descripteur = descripteurDeCommande(commande.type);
        return typeof descripteur.identifiantsRestaures === "function" ? descripteur.identifiantsRestaures(commande) : [];
      });
    },

    // Deux lots fusionnent si leurs commandes, prises une à une, fusionnent :
    // c'est le cas de plusieurs objets qu'on déplace ensemble au clavier.
    fusionnerAvec(precedent, courant) {
      if (precedent.commandes.length !== courant.commandes.length) return null;
      const fusionnees = [];
      for (let i = 0; i < courant.commandes.length; i += 1) {
        const [a, b] = [precedent.commandes[i], courant.commandes[i]];
        if (a.type !== b.type) return null;
        const descripteur = descripteurDeCommande(a.type);
        if (typeof descripteur.fusionnerAvec !== "function") return null;
        const fusion = descripteur.fusionnerAvec(a, b);
        if (fusion === null) return null;
        fusionnees.push(fusion);
      }
      return { ...precedent, commandes: fusionnees };
    },
  };
}
