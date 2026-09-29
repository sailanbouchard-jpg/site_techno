/*
 * noyau/types/type_noeud_decoupe.js
 *
 * Une pièce coupée par un plan : on en garde le dessous, le dessus, ou les
 * deux moitiés écartées l'une de l'autre — pour imprimer en deux fois une
 * pièce trop haute, ou mettre à plat une pièce qui ne tiendrait pas debout.
 * La pièce devient son enfant ; « Retirer » la rend entière.
 *
 * Token attendu dans le document :
 *   { type: "decoupe", parametres: { axe: "z", position: 10, garder: "deux", ecart: 5 },
 *     enfants: [{ type: "cylindre", … }] }
 * position : la place du plan le long de l'axe, dans le repère de ce nœud
 * (posé au pied de la pièce, au milieu en X et en Y).
 */

import { PARAMETRE_CENTRE_OBJET, PARAMETRE_TAILLE_OBJET } from "./parametres_de_repetition.js";

const NORMALES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export default {
  nom: "decoupe",
  etiquette: "Découpe",
  termeDuProgramme: "coupe par un plan",
  aide: "Coupe une pièce par un plan : garder le dessous, le dessus, ou les deux morceaux écartés (pour imprimer une pièce en deux fois).",
  verbe: "Couper",
  icone: "decoupe",
  categorie: "interne",
  tailleParReglages: true,
  degroupable: true,

  nomAuto: (n, { nommer }) => "Découpe de " + (n.enfants[0] ? nommer(n.enfants[0]) : "…"),

  parametres: {
    axe: {
      etiquette: "Plan de coupe",
      defaut: "z",
      choix: [
        { valeur: "z", etiquette: "Horizontal", aide: "Coupe perpendiculaire à Z : un bas et un haut." },
        { valeur: "x", etiquette: "Gauche / droite", aide: "Coupe perpendiculaire à X." },
        { valeur: "y", etiquette: "Avant / arrière", aide: "Coupe perpendiculaire à Y." },
      ],
    },
    position: { etiquette: "Position du plan", unite: "mm", defaut: 0, min: -2000, max: 2000 },
    garder: {
      etiquette: "Garder",
      defaut: "deux",
      choix: [
        { valeur: "deux", etiquette: "Les deux morceaux" },
        { valeur: "dessous", etiquette: "Le côté négatif", aide: "Le dessous, la gauche ou l'avant." },
        { valeur: "dessus", etiquette: "Le côté positif", aide: "Le dessus, la droite ou l'arrière." },
      ],
    },
    ecart: { etiquette: "Écart entre les morceaux", unite: "mm", defaut: 5, min: 0, max: 500, masque: (p) => p.garder !== "deux" },
    centreObjet: PARAMETRE_CENTRE_OBJET,
    tailleObjet: PARAMETRE_TAILLE_OBJET,
  },

  assembler(atelier, enfants, p) {
    const pleins = enfants.filter((e) => !e.trou).map((e) => e.solide);
    if (pleins.length === 0) return null;
    const piece = pleins.length === 1 ? pleins[0] : atelier.Manifold.union(pleins);
    const n = NORMALES[p.axe] ?? NORMALES.z;
    const moins = n.map((c) => -c);
    const dessous = piece.trimByPlane(moins, -p.position);
    const dessus = piece.trimByPlane(n, p.position);
    if (p.garder === "dessous") return dessous;
    if (p.garder === "dessus") return dessus;
    if (dessous.isEmpty()) return dessus;
    if (dessus.isEmpty()) return dessous;
    return atelier.Manifold.union([dessous, dessus.translate(n.map((c) => c * p.ecart))]);
  },
};
