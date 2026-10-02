/*
 * noyau/types/type_noeud_eprouvette.js
 *
 * Une éprouvette de calibration posée sur le plateau. Token attendu :
 *   { type: "eprouvette",
 *     parametres: { modele: "temperature_tower.drc", coupeBas: 540, coupeHaut: 630 },
 *     transformation: { echelle: { x: 1, y: 1, z: 1 } } }
 *
 * Contrairement à un objet importé, elle n'est PAS ramenée au cube unité : le
 * maillage d'Orca est déjà aux bonnes dimensions en millimètres, et l'échelle
 * n'est qu'un facteur (celui de la buse montée, par exemple). La normaliser
 * fausserait la coupe, qui est donnée en millimètres du modèle.
 *
 * La coupe, justement : c'est elle qui règle l'éprouvette sur la plage demandée.
 * La tour de température fait 700 mm, un cran de 10 mm par 5 °C en partant de
 * 500 °C en bas ; demander 230 → 190 revient à n'en garder que la tranche
 * 540 → 630 mm. Zéro veut dire « pas de coupe de ce côté ».
 */

import { cleDEprouvette } from "../eprouvettes.js";

export default {
  nom: "eprouvette",
  etiquette: "Éprouvette de calibration",
  termeDuProgramme: "éprouvette d'essai",
  aide: "Éprouvette d'un essai de calibration. Sa forme et sa taille viennent de l'essai : elles ne se règlent pas à la main.",
  icone: "regle",
  categorie: "interne",
  // Ce qui permet à l'onglet Impression de reconnaître les siennes sans
  // tester le nom du type : un essai remplace celles du précédent.
  eprouvette: true,
  // Sa taille vient de l'essai : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,

  parametres: {
    modele: { etiquette: "Modèle", texte: true, defaut: "", cache: true },
    coupeBas: { etiquette: "Coupe basse", unite: "mm", defaut: 0, lectureSeule: true },
    coupeHaut: { etiquette: "Coupe haute", unite: "mm", defaut: 0, lectureSeule: true },
  },

  fichiersRequis(p) {
    return p.modele ? [cleDEprouvette(p.modele)] : [];
  },

  construire(atelier, p, ressources) {
    const brut = ressources.maillageImporte(cleDEprouvette(p.modele));
    if (brut === null) {
      throw new Error("l'éprouvette « " + p.modele + " » n'est pas encore chargée : réessayer dans un instant.");
    }
    const maillage = new atelier.Mesh({ numProp: 3, vertProperties: brut.positions, triVerts: brut.indices });
    maillage.merge();
    let solide = new atelier.Manifold(maillage);
    // Même convention que la découpe : trimByPlane garde le côté vers lequel
    // pointe la normale.
    if (p.coupeBas > 0) solide = solide.trimByPlane([0, 0, 1], p.coupeBas);
    if (p.coupeHaut > 0) solide = solide.trimByPlane([0, 0, -1], -p.coupeHaut);
    // Couper une tranche à 540 mm du bas laisserait l'éprouvette flotter à 540 mm.
    // On la remet où toutes les formes du logiciel se trouvent : centrée en X et
    // Y, posée sur Z = 0. Sa TAILLE, elle, n'est pas touchée — c'est celle du
    // maillage d'Orca, en millimètres, et c'est ce qui rend la mesure juste.
    const { min, max } = solide.boundingBox();
    return solide.translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]]);
  },
};
