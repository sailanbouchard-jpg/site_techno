/*
 * noyau/types/type_noeud_inconnu.js
 * Un objet que ce logiciel ne sait pas fabriquer : un projet enregistré par
 * une version plus récente, ou un fichier abîmé. Plutôt que de refuser tout le
 * projet — ou pire, de s'arrêter au premier parcours de l'arbre — l'objet est
 * gardé tel quel, visible dans la liste, et réenregistré à l'identique.
 * Il ne produit aucune forme.
 */

export default {
  nom: "inconnu",
  etiquette: "Objet inconnu",
  termeDuProgramme: "objet non reconnu",
  icone: "trou",
  categorie: "interne",
  aide: "Cet objet vient d'une version plus récente du logiciel. Il est conservé tel quel, mais ne s'affiche pas.",
  transformable: false,
  parametres: {
    typeOrigine: { etiquette: "Type d'origine", defaut: "", texte: true, lectureSeule: true },
  },
  nomAuto: (noeud) => "Objet inconnu (" + (noeud.parametres.typeOrigine || "?") + ")",
};
