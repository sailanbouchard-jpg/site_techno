/*
 * noyau/fabrique_de_noeuds.js
 * ───────────────────────────
 * Fabrique un objet neuf d'un type donné, avec ses valeurs par défaut. C'est
 * le seul endroit qui sait qu'une forme normalisée naît avec une échelle égale
 * à ses dimensions par défaut.
 */

import { creerNoeud } from "./noeud.js";
import { typeDeNoeud, parametresParDefaut } from "./registre_types_de_noeuds.js";

const ECHELLE_UNITE = { x: 1, y: 1, z: 1 };

/*
 * champs : les mêmes que creerNoeud, tous facultatifs. Les paramètres fournis
 * complètent ceux par défaut ; la transformation fournie complète l'échelle
 * par défaut.
 */
export function nouvelObjet(nomDuType, champs = {}) {
  const type = typeDeNoeud(nomDuType);
  const { parametres = {}, transformation = {}, ...autres } = champs;

  return creerNoeud({
    ...(type.trouParDefaut ? { trou: true } : {}),
    ...autres,
    type: nomDuType,
    parametres: { ...parametresParDefaut(nomDuType), ...parametres },
    transformation: {
      echelle: type.dimensionsParDefaut ?? ECHELLE_UNITE,
      ...transformation,
    },
  });
}
