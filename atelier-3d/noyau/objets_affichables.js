/*
 * noyau/objets_affichables.js
 * ───────────────────────────
 * Quels nœuds ont chacun leur propre solide à l'écran et dans le STL ?
 *
 * Les enfants de la racine, en descendant dans les conteneurs. Un groupe n'est
 * PAS un conteneur : il fond ses enfants en un seul solide, donc il apparaît
 * lui-même et ses enfants non. Un objet masqué n'apparaît pas du tout, une
 * esquisse non plus : elle n'est faite que de traits.
 *
 * C'est une règle sur le contenu du document, pas un détail d'affichage : la
 * vue et l'export doivent tomber d'accord, sinon l'élève imprime autre chose
 * que ce qu'il voit.
 */

import { estConteneur, fournitUnProfil } from "./registre_types_de_noeuds.js";

export function objetsAffichables(document) {
  const liste = [];
  const descendre = (noeud) => {
    for (const enfant of noeud.enfants) {
      if (!enfant.visible || fournitUnProfil(enfant.type)) continue;
      if (estConteneur(enfant.type)) descendre(enfant);
      else liste.push(enfant);
    }
  };
  descendre(document.racine);
  return liste;
}

/* Les esquisses visibles : elles sont dessinées dans la vue, et on peut les
   sélectionner. Une esquisse déjà extrudée est masquée, pas retirée. */
export function esquissesVisibles(document) {
  const liste = [];
  const descendre = (noeud) => {
    for (const enfant of noeud.enfants) {
      if (!enfant.visible) continue;
      if (fournitUnProfil(enfant.type)) liste.push(enfant);
      else if (estConteneur(enfant.type)) descendre(enfant);
    }
  };
  descendre(document.racine);
  return liste;
}
