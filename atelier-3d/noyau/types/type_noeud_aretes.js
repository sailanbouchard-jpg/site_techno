/*
 * noyau/types/type_noeud_aretes.js
 *
 * Chanfreins ou congés sur des arêtes choisies d'une pièce (voir
 * noyau/aretes.js). La pièce devient son enfant, comme pour une symétrie ;
 * « Retirer » la rend telle qu'elle était.
 *
 * Token attendu dans le document :
 *   { type: "aretes", parametres: { genre: "chanfrein", taille: 1, aretes: [{ points, n1, n2, ferme }] },
 *     enfants: [{ type: "pave", … }] }
 * Les arêtes sont notées dans le repère de ce nœud : elles suivent la pièce
 * quand on la déplace. Si la pièce change de forme, elles restent où elles
 * étaient : les choisir à nouveau.
 */

import { casserLesAretes } from "../aretes.js";
import { PARAMETRE_CENTRE_OBJET, PARAMETRE_TAILLE_OBJET } from "./parametres_de_repetition.js";

export default {
  nom: "aretes",
  etiquette: "Chanfreins et congés",
  termeDuProgramme: "chanfrein, congé d'arête",
  aide: "Casse les arêtes choisies d'une pièce : chanfrein (pan incliné) ou congé (arrondi). Sélectionner la pièce, puis cliquer les arêtes dans la vue.",
  verbe: "Arêtes",
  icone: "aretes",
  categorie: "interne",
  tailleParReglages: true,
  degroupable: true,

  nomAuto: (n, { nommer }) => {
    const nombre = n.parametres.aretes?.length ?? 0;
    const quoi = n.parametres.genre === "conge" ? "Congés" : "Chanfreins";
    return quoi + " (" + nombre + ") de " + (n.enfants[0] ? nommer(n.enfants[0]) : "…");
  },

  parametres: {
    genre: {
      etiquette: "Forme",
      defaut: "chanfrein",
      choix: [
        { valeur: "chanfrein", etiquette: "Chanfrein", aide: "Un pan incliné remplace l'arête." },
        { valeur: "conge", etiquette: "Congé", aide: "Un arrondi remplace l'arête." },
      ],
    },
    taille: { etiquette: "Taille", unite: "mm", defaut: 1, min: 0.1, max: 200 },
    aretes: { etiquette: "Arêtes", defaut: Object.freeze([]), cache: true },
    centreObjet: PARAMETRE_CENTRE_OBJET,
    tailleObjet: PARAMETRE_TAILLE_OBJET,
  },

  assembler(atelier, enfants, p) {
    const pleins = enfants.filter((e) => !e.trou).map((e) => e.solide);
    if (pleins.length === 0) return null;
    const piece = pleins.length === 1 ? pleins[0] : atelier.Manifold.union(pleins);
    return casserLesAretes(atelier, piece, p.aretes ?? [], p.genre, p.taille);
  },
};
