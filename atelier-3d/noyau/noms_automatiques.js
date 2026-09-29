/*
 * noyau/noms_automatiques.js
 * ──────────────────────────
 * Le nom qu'affiche un objet que l'élève n'a pas nommé : « Cylindre Ø70 × 90 »,
 * « Texte « LÉO » », « Pavé 50 × 15 × 4 percé ». Dans l'arbre, on reconnaît
 * ainsi chaque pièce sans avoir à cliquer dessus.
 *
 * Chaque type peut fournir nomAuto(noeud, outils) ; outils : { nommer, dimensions }.
 */

import { typeDeNoeud } from "./registre_types_de_noeuds.js";

/* Les dimensions d'une forme normalisée : son échelle, en valeurs absolues. */
const dimensions = (noeud) => {
  const e = noeud.transformation.echelle;
  return [Math.abs(e.x), Math.abs(e.y), Math.abs(e.z)];
};

export function nommer(noeud) {
  if (noeud.nom !== "") return noeud.nom;
  const type = typeDeNoeud(noeud.type);
  if (typeof type.nomAuto !== "function") return type.etiquette;
  return type.nomAuto({ ...noeud, parametres: parametresComplets(noeud, type) }, { nommer, dimensions: dimensions(noeud) });
}

function parametresComplets(noeud, type) {
  const defauts = Object.fromEntries(Object.entries(type.parametres).map(([cle, d]) => [cle, d.defaut]));
  return { ...defauts, ...noeud.parametres };
}
