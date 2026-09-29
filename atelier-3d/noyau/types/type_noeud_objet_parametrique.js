/*
 * noyau/types/type_noeud_objet_parametrique.js
 *
 * Un objet de la bibliothèque, posé dans le projet. Le document ne garde
 * qu'une RÉFÉRENCE au modèle et les réglages qui diffèrent de ses valeurs par
 * défaut : modifier le modèle dans la bibliothèque met à jour tous les projets
 * qui l'utilisent, à leur prochaine ouverture.
 *
 * Token attendu dans le document :
 *   { type: "objet_parametrique",
 *     parametres: { modele: "clip_a_male", nomDuModele: "Clip A — mâle",
 *                   reglages: { "vn3_k2": 18 } } }
 *
 * Avant le calcul, noyau/bibliotheque_d_objets.js lui donne pour enfants les
 * pièces du modèle recalculées avec ses réglages (avecSesModeles) : il les
 * assemble alors comme un groupe. Hors calcul, il n'a pas d'enfants.
 */

export default {
  nom: "objet_parametrique",
  etiquette: "Objet paramétrique",
  termeDuProgramme: "objet de la bibliothèque",
  aide: "Objet tiré de la bibliothèque : ses dimensions se règlent par ses paramètres, et il suit les mises à jour de son modèle.",
  icone: "bibliotheque",
  categorie: "interne",
  // Sa taille vient de ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  // L'inspecteur montre les variables du modèle à la place des paramètres ci-dessous.
  reglagesDuModele: true,
  // « Dégrouper » le remplace par ses pièces, devenues des solides ordinaires
  // (voir piecesDetachees dans noyau/bibliotheque_d_objets.js).
  degroupable: true,

  nomAuto: (n) => n.parametres.nomDuModele || "Objet paramétrique",

  parametres: {
    modele: { etiquette: "Modèle", texte: true, defaut: "", cache: true },
    // Le nom du modèle au moment de la pose : l'arbre le montre même hors connexion.
    nomDuModele: { etiquette: "Nom du modèle", texte: true, defaut: "", cache: true },
    reglages: { etiquette: "Réglages", defaut: Object.freeze({}), cache: true },
  },

  assembler(atelier, enfants) {
    const pleins = enfants.filter((e) => !e.trou).map((e) => e.solide);
    const trous = enfants.filter((e) => e.trou).map((e) => e.solide);
    if (pleins.length === 0) return null;
    const matiere = pleins.length === 1 ? pleins[0] : atelier.Manifold.union(pleins);
    return trous.length === 0 ? matiere : atelier.Manifold.difference([matiere, ...trous]);
  },
};
