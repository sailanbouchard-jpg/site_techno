/*
 * noyau/types/type_noeud_racine.js
 * La racine du document : un simple conteneur. Elle n'a ni « construire » ni
 * « assembler », et c'est exactement à ça que la couche géométrie reconnaît un
 * nœud qu'elle ne doit pas construire — elle construit ses enfants un par un.
 */

export default {
  nom: "racine",
  etiquette: "Construction",
  icone: "construction",
  categorie: "interne",
  parametres: {},
};
