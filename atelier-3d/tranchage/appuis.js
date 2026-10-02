/*
 * tranchage/appuis.js
 * ───────────────────
 * Ce qui porte la matière d'une couche — le vocabulaire commun à tout le
 * trancheur.
 *
 * Avant ce module, trois endroits calculaient chacun leur propre idée de
 * « ce qui porte » : les parois par trois décalages de la couche d'en dessous,
 * les ponts par une différence booléenne, le diagnostic par un échantillon de
 * points. Trois règles, trois seuils, et aucun ne savait ce que les autres
 * avaient décidé. D'où l'impossibilité d'écrire simplement « inverser l'ordre
 * des parois seulement sur les couches qui débordent » ou « ne pas s'appuyer
 * sur un pont ».
 *
 * Deux notions, et c'est tout :
 *
 *   le PORTEUR         la matière d'une couche sur laquelle on peut compter.
 *                      C'est sa section, moins ce qui n'a trouvé aucun appui :
 *                      un pont dont aucun brin n'est ancré ne porte rien, et la
 *                      couche d'au-dessus n'a pas à le prendre pour du solide.
 *                      (Un pont correctement ancré, lui, est tendu : il compte
 *                      comme du plein, c'est aussi le choix de PrusaSlicer.)
 *
 *   la PART DANS LE VIDE  pour un point du tracé, la fraction de la largeur de
 *                      sa ligne qui n'a rien en dessous, de 0 (posée) à 1
 *                      (entièrement en l'air). Une ligne dont la ligne centrale
 *                      est à la distance d hors du porteur a pour part
 *                      d / largeur + 1/2.
 *
 * La part se lit sur des BANDES : le porteur décalé de (part − ½) × largeur.
 * Sortir de la bande d'une part, c'est dépasser cette part. Les bandes sont
 * emboîtées, de la plus petite part à la plus grande, donc la recherche se fait
 * par dichotomie : huit bandes se départagent en trois tests au lieu de huit.
 */

import { LIMITE_D_ONGLET, AIRE_MINIMALE_MM2 } from "./parois.js";
import { dansLaZone } from "./remplissage.js";

// Les crans d'OrcaSlicer : 25 %, 50 %, 75 % de la largeur dans le vide — plus la
// ligne entièrement en l'air. Ce dernier cran ne change aucune vitesse (au-delà
// de 75 % c'est la même), mais sans lui une ligne qui ne touche rien serait
// rapportée à 0,75 : le débit ne serait pas assez réduit, et l'enroulement
// s'accumulerait trop lentement.
const CRANS_PAR_PALIERS = [0.25, 0.5, 0.75, 1];
// En mode progressif, la part est mesurée au huitième : les écarts de vitesse
// d'un morceau au suivant deviennent assez petits pour ne plus laisser de bourrelet.
const CRANS_PROGRESSIFS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
// En vitesse unique, une seule question : la ligne déborde-t-elle ?
const CRANS_UNIQUES = [0.25];

/* Les crans à mesurer, selon la façon dont la vitesse des surplombs est choisie. */
export function cransDeSurplomb(strategie) {
  if (strategie === "lissee") return CRANS_PROGRESSIFS;
  if (strategie === "unique") return CRANS_UNIQUES;
  return CRANS_PAR_PALIERS;
}

/*
 * Les appuis d'une couche.
 *   section   la CrossSection de la couche (reste à l'appelant)
 *   porteur   la matière stable de la couche d'en dessous, ou null pour la première
 *   largeur   la largeur de la ligne dont on mesure le débord
 *   crans     les parts à mesurer (cransDeSurplomb)
 *   garder    la fonction du trancheur qui note une section à libérer
 * Rend { bandes, crans, debord, aUnSurplomb } :
 *   bandes       un jeu de polygones par cran, dans l'ordre des crans, ou null
 *                si la couche est entièrement portée (rien à mesurer)
 *   debord       la CrossSection de ce qui n'a rien en dessous, ou null
 *   aUnSurplomb  vrai si la couche déborde quelque part
 */
export function appuisDeLaCouche(section, porteur, largeur, crans, garder) {
  if (porteur === null) return { bandes: null, crans, debord: null, aUnSurplomb: false };
  const debord = garder(section.subtract(porteur));
  if (debord.area() <= AIRE_MINIMALE_MM2) {
    return { bandes: null, crans, debord: null, aUnSurplomb: false };
  }
  const bandes = crans.map((part) => {
    const marge = (part - 0.5) * largeur;
    if (Math.abs(marge) < 1e-6) return porteur.toPolygons();
    return garder(porteur.offset(marge, "Miter", LIMITE_D_ONGLET)).toPolygons();
  });
  return { bandes, crans, debord, aUnSurplomb: true };
}

/*
 * La part de la largeur qui est dans le vide, en ce point, parmi les crans
 * mesurés. 0 : la ligne repose entièrement.
 * Les bandes sont emboîtées (la bande d'une petite part est contenue dans celle
 * d'une grande), donc « être dehors » est vrai pour les premières bandes et faux
 * ensuite : une dichotomie trouve la dernière bande dont le point est sorti.
 */
export function partDansLeVide(x, y, appuis) {
  const { bandes, crans } = appuis;
  if (bandes === null) return 0;
  const dehors = (i) => !dansLaZone(x, y, bandes[i]);
  if (!dehors(0)) return 0;
  let bas = 0;
  let haut = bandes.length - 1;
  // bas est dehors, on cherche le dernier indice dehors.
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1;
    if (dehors(milieu)) bas = milieu;
    else haut = milieu - 1;
  }
  return crans[bas];
}

/*
 * La matière stable d'une couche : sa section, moins ce qui n'a trouvé aucun
 * appui. C'est elle, et non la section brute, que la couche d'au-dessus prend
 * pour sol. Sans cette distinction, une pile de ponts (un tube couché, une
 * fenêtre au-dessus d'une autre) s'appuierait de proche en proche sur du vide.
 *   instables : les CrossSection à retirer (ponts sans aucun brin ancré)
 * Rend la section elle-même si rien n'est à retirer — l'appelant ne la libère
 * donc jamais deux fois, « garder » s'en charge.
 */
export function matiereStable(wasm, section, instables, garder) {
  const aRetirer = instables.filter((z) => z !== null && z.area() > AIRE_MINIMALE_MM2);
  if (aRetirer.length === 0) return section;
  const vide = garder(wasm.CrossSection.union(aRetirer));
  const stable = garder(section.subtract(vide));
  return stable.area() > AIRE_MINIMALE_MM2 ? stable : section;
}
