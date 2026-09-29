/*
 * noyau/types/type_noeud_importe.js
 *
 * Token attendu dans le document :
 *   { type: "importe",
 *     parametres: { fichier: "k8f3…", nomDuFichier: "boitier.stl", triangles: 12480 },
 *     transformation: { echelle: { x: 62.5, y: 31, z: 118 } } }
 *
 * Le document ne contient PAS le maillage : seulement la clé du fichier, qui
 * est rangé à part (sur le site, ou dans le navigateur hors connexion). Un
 * projet reste ainsi léger même avec un boîtier de plusieurs mégaoctets.
 *
 * Comme les primitives, la forme est ramenée au cube unité ; l'import règle
 * l'échelle sur la taille réelle du fichier. Les dimensions affichées sont
 * donc celles de l'objet, en millimètres.
 */

export default {
  nom: "importe",
  etiquette: "Objet importé",
  termeDuProgramme: "maillage STL",
  aide: "Maillage importé d'un fichier STL. Seule sa taille se règle.",
  icone: "importe",
  categorie: "interne",
  dimensionsParDefaut: { x: 1, y: 1, z: 1 },

  parametres: {
    fichier: { etiquette: "Clé du fichier", texte: true, defaut: "", cache: true },
    nomDuFichier: { etiquette: "Fichier", texte: true, defaut: "", lectureSeule: true },
    triangles: { etiquette: "Triangles", defaut: 0, entier: true, lectureSeule: true },
  },

  // Le fichier doit être chargé dans l'ouvrier avant tout calcul.
  fichiersRequis(p) {
    return p.fichier ? [p.fichier] : [];
  },

  construire(atelier, p, ressources) {
    const brut = ressources.maillageImporte(p.fichier);
    if (brut === null) {
      throw new Error("le fichier « " + p.nomDuFichier + " » n'est pas disponible. " +
        "Le réimporter, ou vérifier que la session est celle du compte qui l'a importé.");
    }

    try {
      const maillage = new atelier.Mesh({ numProp: 3, vertProperties: brut.positions, triVerts: brut.indices });
      maillage.merge();
      return new atelier.Manifold(maillage);
    } catch (_erreur) {
      // Un maillage troué s'affiche quand même, voyant rouge allumé : l'élève
      // doit voir le problème avant d'exporter, pas tomber sur un message.
      return { maillageBrut: brut };
    }
  },
};
