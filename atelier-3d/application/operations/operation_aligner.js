/*
 * application/operations/operation_aligner.js
 * ───────────────────────────────────────────
 * Aligner des pièces sur la première choisie, axe par axe : à gauche, au
 * milieu, à droite… La pièce de référence ne bouge pas ; les autres glissent
 * en direct à chaque choix.
 */

import { commandeLot } from "../../noyau/commandes/registre_commandes.js";
import { commandeTransformerNoeud } from "../../noyau/commandes/commande_transformer_noeud.js";

const AXES = ["x", "y", "z"];

function repere(boite, i, facon) {
  if (facon === "min") return boite.min[i];
  if (facon === "max") return boite.max[i];
  return (boite.min[i] + boite.max[i]) / 2;
}

const options = (bas, haut) => [
  { valeur: "", etiquette: "Aucun", aide: "Les pièces ne bougent pas selon cet axe." },
  { valeur: "min", etiquette: bas },
  { valeur: "centre", etiquette: "Centre" },
  { valeur: "max", etiquette: haut },
];

/*
 * outils : { etat, scene, noeud(id), nommer(noeud), ids }
 * ids : les pièces choisies, la première sert de référence.
 */
export function operationAligner(outils) {
  const [reference, ...mobiles] = outils.ids;
  // Tout est calculé depuis l'état de départ : changer d'avis ne cumule pas les déplacements.
  const depart = new Map(outils.ids.map((id) => [id, {
    boite: outils.scene.boiteMonde(id),
    transformation: outils.noeud(id).transformation,
  }]));

  function placer(valeurs) {
    const boiteRef = depart.get(reference).boite;
    const commandes = [];
    for (const id of mobiles) {
      const { boite, transformation } = depart.get(id);
      const position = { ...transformation.position };
      AXES.forEach((axe, i) => {
        if (valeurs[axe] === "") return;
        position[axe] += repere(boiteRef, i, valeurs[axe]) - repere(boite, i, valeurs[axe]);
      });
      const actuelle = outils.noeud(id).transformation;
      commandes.push(commandeTransformerNoeud.creer(id, actuelle, { ...actuelle, position }));
    }
    outils.etat.executer(commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, "Aligner"));
  }

  return {
    titre: "Alignement",
    icone: "aligner",
    libelle: "Aligner",
    champs: [
      { genre: "note", texte: "Référence, fixe : « " + outils.nommer(outils.noeud(reference)) + " »." },
      { genre: "choix", cle: "x", etiquette: "Axe X (gauche – droite)", options: options("Gauche", "Droite") },
      { genre: "choix", cle: "y", etiquette: "Axe Y (avant – arrière)", options: options("Avant", "Arrière") },
      { genre: "choix", cle: "z", etiquette: "Axe Z (bas – haut)", options: options("Bas", "Haut") },
    ],

    preparer() {
      if (mobiles.length === 0 || [...depart.values()].some((d) => d.boite === null)) {
        throw new Error("Sélectionner au moins deux pièces (Maj + clic). La première choisie sert de référence.");
      }
      return { x: "", y: "", z: "" };
    },

    changer(cle, valeur, valeurs) {
      const suivantes = { ...valeurs, [cle]: valeur };
      placer(suivantes);
      return suivantes;
    },

    aides() {
      const b = depart.get(reference).boite;
      const centre = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
      return [{ genre: "point", position: centre }];
    },
  };
}
