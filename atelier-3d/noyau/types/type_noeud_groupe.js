/*
 * noyau/types/type_noeud_groupe.js
 *
 * Le groupe réunit ses enfants en un seul solide : union de ceux qui ajoutent
 * de la matière, moins ceux qui sont marqués « trou ». Réglé sur « la partie
 * commune », il ne garde au contraire que la matière présente dans TOUTES ses
 * pièces pleines — les trous y creusent ensuite de la même façon. Un seul
 * objet, trois façons d'assembler : réunir, croiser, percer.
 *
 * Il déclare « assembler » et non « construire » : la couche géométrie lui
 * remet les solides de ses enfants, DÉJÀ placés dans le repère du groupe.
 * Les enfants restent dans l'arbre, donc dégrouper les rend intacts, même
 * après avoir fermé et rouvert le projet.
 *
 * Il ne déclare pas dimensionsParDefaut : sa taille est celle de ce qu'il
 * contient, et on ne la connaît qu'une fois le calcul fait.
 */

export default {
  nom: "groupe",
  etiquette: "Groupe",
  termeDuProgramme: "assemblage : union et perçage",
  aide: "Plusieurs pièces réunies en une seule ; les pièces en trou y creusent. Son réglage permet de ne garder que leur partie commune.",
  icone: "groupe",
  categorie: "interne",
  // « Dégrouper » rend ses enfants à son parent.
  degroupable: true,

  nomAuto(n, { nommer }) {
    const pleins = n.enfants.filter((e) => !e.trou);
    if (n.parametres.assemblage === "commun") return "Partie commune de " + pleins.length + " pièces";
    if (pleins.length === n.enfants.length) return "Assemblage de " + n.enfants.length + " pièces";
    return (pleins.length === 1 ? nommer(pleins[0]) : "Assemblage") + " percé";
  },

  parametres: {
    assemblage: {
      etiquette: "Le groupe garde",
      defaut: "reunir",
      choix: [
        { valeur: "reunir", etiquette: "Toute la matière" },
        { valeur: "commun", etiquette: "La partie commune" },
      ],
    },
  },

  assembler(atelier, enfants, parametres) {
    const pleins = enfants.filter((e) => !e.trou).map((e) => e.solide);
    const trous = enfants.filter((e) => e.trou).map((e) => e.solide);

    if (pleins.length === 0) return null;   // un groupe de trous ne creuse rien

    const matiere = parametres.assemblage === "commun" && pleins.length > 1
      ? atelier.Manifold.intersection(pleins)
      : atelier.Manifold.union(pleins);
    return trous.length === 0 ? matiere : atelier.Manifold.difference([matiere, ...trous]);
  },
};
