/*
 * outils/registre_outils.js
 * ─────────────────────────
 * Les outils, en deux familles : les modes de déplacement, et les outils de
 * tracé qui ne servent que dans une esquisse ouverte. Un seul actif à la fois
 * dans chaque famille. Ajouter un outil = un fichier et une ligne ici : le
 * bandeau se construit depuis optionsBandeau, sans code propre à un outil.
 *
 * Contrat d'un outil :
 *   nom, etiquette, termeDuProgramme, raccourci, curseur
 *   aide             une phrase, montrée au survol du bouton
 *   famille          "deplacement" (par défaut) ou "esquisse"
 *   groupe           dans une esquisse : "dessin" (par défaut), "modification"
 *                    ou "contrainte" — le bandeau les range en trois familles séparées
 *   modeGizmo        quelles poignées montrer autour de la sélection (null : aucune)
 *   optionsBandeau   [{ cle, etiquette, type: "case" | "nombre" | "texte" | "choix", defaut, unite?, min?, max?, pas?,
 *                       choix? ([{ valeur, etiquette }]), partage?, aide? }]
 *   activer(contexte), desactiver(contexte)
 *   surAppui, surDeplacement, surRelache (evenement, contexte)
 *   surTouche(evenement, contexte) → true si la touche a été prise
 */

import outilPoser from "./outil_poser.js";
import outilLibre from "./outil_libre.js";
import outilAxe from "./outil_axe.js";
import outilMesurer from "./outil_mesurer.js";
import outilPinceau from "./esquisse/outil_pinceau.js";
import outilTrait from "./esquisse/outil_trait.js";
import outilContour from "./esquisse/outil_contour.js";
import outilArc from "./esquisse/outil_arc.js";
import outilArcCentre from "./esquisse/outil_arc_centre.js";
import outilCourbe from "./esquisse/outil_courbe.js";
import outilDecaler from "./esquisse/outil_decaler.js";
import outilCercle from "./esquisse/outil_cercle.js";
import outilRectangle from "./esquisse/outil_rectangle.js";
import outilPolygone from "./esquisse/outil_polygone.js";
import outilGomme from "./esquisse/outil_gomme.js";
import outilSelection from "./esquisse/outil_selection.js";
import outilArrondi from "./esquisse/outil_arrondi.js";
import outilChanfreinEsquisse from "./esquisse/outil_chanfrein.js";
import outilAjuster from "./esquisse/outil_ajuster.js";
import outilSymetrieEsquisse from "./esquisse/outil_symetrie_esquisse.js";
import outilTraitAide from "./esquisse/outil_trait_aide.js";
import outilCote from "./esquisse/outil_cote.js";
import {
  outilHorizontalVertical, outilSurAxe, outilFixer, outilParallele, outilPerpendiculaire, outilEgal,
  outilTangente, outilConcentrique, outilReference, outilSurReference,
} from "./esquisse/outils_de_relation.js";

const OUTILS = [
  outilLibre, outilPoser, outilAxe, outilMesurer,
  outilSelection, outilTrait, outilContour, outilArc, outilArcCentre, outilCourbe, outilCercle, outilRectangle, outilPolygone, outilPinceau,
  outilGomme, outilAjuster, outilDecaler, outilArrondi, outilChanfreinEsquisse, outilSymetrieEsquisse, outilTraitAide,
  outilCote, outilHorizontalVertical, outilSurAxe, outilFixer, outilParallele, outilPerpendiculaire, outilEgal,
  outilTangente, outilConcentrique, outilReference, outilSurReference,
];
const PAR_NOM = new Map(OUTILS.map((outil) => [outil.nom, outil]));

export const FAMILLES = {
  deplacement: { etiquette: "Déplacement", parDefaut: outilLibre.nom },
  esquisse: { etiquette: "Esquisse", parDefaut: outilSelection.nom },
};

export const familleDe = (outil) => outil.famille ?? "deplacement";

export function listeDesOutils(famille = "deplacement") {
  return OUTILS.filter((outil) => familleDe(outil) === famille);
}

export function outilParNom(nom) {
  const outil = PAR_NOM.get(nom);
  if (outil === undefined) throw new Error("Outil inconnu : « " + nom + " ».");
  return outil;
}

/* Les réglages de départ de tous les modes. Un réglage « partagé » n'a qu'une
   valeur pour tous ; les autres sont rangés sous le nom de leur mode. */
export function reglagesParDefaut() {
  const reglages = { partages: {} };
  for (const outil of OUTILS) {
    reglages[outil.nom] = {};
    for (const option of outil.optionsBandeau) {
      if (option.type === "texte") continue;
      if (option.partage) reglages.partages[option.cle] = option.defaut;
      else reglages[outil.nom][option.cle] = option.defaut;
    }
  }
  return reglages;
}

export function reglagesDe(reglages, nomOutil) {
  return { ...reglages.partages, ...reglages[nomOutil] };
}

export function avecReglage(reglages, nomOutil, cle, valeur) {
  const option = outilParNom(nomOutil).optionsBandeau.find((o) => o.cle === cle);
  if (option === undefined) throw new Error("Réglage inconnu : « " + cle + " ».");
  if (option.partage) return { ...reglages, partages: { ...reglages.partages, [cle]: valeur } };
  return { ...reglages, [nomOutil]: { ...reglages[nomOutil], [cle]: valeur } };
}
