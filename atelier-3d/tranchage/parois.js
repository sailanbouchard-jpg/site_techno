/*
 * tranchage/parois.js
 * ───────────────────
 * Les parois d'une couche : la section de la pièce, rétrécie pas à pas. La
 * ligne centrale de la paroi extérieure est à une demi-largeur du bord ; chaque
 * paroi suivante est à un « espacement » de la précédente.
 *
 * L'espacement est plus petit que la largeur : une ligne déposée est un
 * rectangle aux bords arrondis, et deux lignes voisines se recouvrent sur ces
 * arrondis (formule de Slic3r, reprise par PrusaSlicer et OrcaSlicer) :
 *   espacement = largeur − hauteur × (1 − π/4)
 *
 * Là où la pièce est trop fine pour une paroi entière, ou entre deux parois
 * qui ne se touchent pas, il reste des interstices : ce qui, dans la bande des
 * parois, n'est couvert par aucune ligne. Ils sont rendus à part, pour être
 * remplis de lignes fines.
 *
 * Les décalages de contours sont ceux de Clipper2, fournis par Manifold
 * (CrossSection.offset). Chaque section 2D est libérée par qui la possède :
 * elle vit dans la mémoire du WebAssembly, pas dans celle du navigateur.
 */

import { TYPES_DE_LIGNE } from "./protocole_tranchage.js";

// Un coin très aigu serait prolongé à l'infini par un décalage en onglet : on le coupe.
export const LIMITE_D_ONGLET = 3;
// Une surface plus petite que ça n'est qu'un reste de décalage : on ne l'imprime pas.
export const AIRE_MINIMALE_MM2 = 0.01;
// Un interstice plus étroit que ça ne se remplit pas : la buse ne sait pas déposer si peu.
const LARGEUR_MINIMALE_D_INTERSTICE_MM = 0.1;

export function espacement(largeur, hauteur) {
  return largeur - hauteur * (1 - Math.PI / 4);
}

/*
 * section : la CrossSection de la couche (elle reste à l'appelant).
 * options : { nombre, largeurExterieure, largeurInterieure, hauteur, exterieureDAbord }
 * Rend { chemins, interieur, interstices } :
 *   chemins      par rang, du bord vers le centre : [[{ type, largeur, points, ferme: true }]]
 *   interieur    la CrossSection qui reste à remplir, ou null
 *   interstices  la CrossSection des espaces trop étroits pour une paroi, ou null
 * Les deux sections rendues sont à libérer par l'appelant.
 */
export function paroisDeLaCouche(wasm, section, options) {
  const C = wasm.CrossSection;
  const parRang = [];
  const bandes = [];
  let decalage = 0;
  let largeurPrecedente = null;
  for (let rang = 0; rang < options.nombre; rang += 1) {
    const largeur = rang === 0 ? options.largeurExterieure : options.largeurInterieure;
    decalage += largeurPrecedente === null
      ? largeur / 2
      : (espacement(largeurPrecedente, options.hauteur) + espacement(largeur, options.hauteur)) / 2;
    largeurPrecedente = largeur;
    const boucle = section.offset(-decalage, "Miter", LIMITE_D_ONGLET);
    const polygones = boucle.area() > AIRE_MINIMALE_MM2 ? boucle.toPolygons() : [];
    if (polygones.length === 0) {
      boucle.delete();
      break;
    }
    // La bande que cette paroi couvre : son tracé élargi d'un demi-espacement de chaque côté.
    const demi = espacement(largeur, options.hauteur) / 2;
    const dehors = boucle.offset(demi, "Miter", LIMITE_D_ONGLET);
    const dedans = boucle.offset(-demi, "Miter", LIMITE_D_ONGLET);
    bandes.push(dehors.subtract(dedans));
    dehors.delete();
    dedans.delete();
    boucle.delete();
    const type = rang === 0 ? TYPES_DE_LIGNE.paroiExterieure : TYPES_DE_LIGNE.paroisInterieures;
    parRang.push(polygones.map((points) => ({ type, largeur, points, ferme: true })));
  }

  // L'intérieur commence à une demi-ligne de la dernière paroi.
  let interieur = null;
  if (parRang.length === options.nombre) {
    interieur = section.offset(-(decalage + espacement(largeurPrecedente, options.hauteur) / 2), "Miter", LIMITE_D_ONGLET);
    if (interieur.area() <= AIRE_MINIMALE_MM2) {
      interieur.delete();
      interieur = null;
    }
  }

  // Les interstices : la section, moins l'intérieur, moins ce que couvrent les parois.
  const aRetirer = [...bandes];
  if (interieur !== null) aRetirer.push(interieur);
  const couvert = aRetirer.length === 0 ? null : C.union(aRetirer);
  const reste = couvert === null ? section.offset(0, "Miter", LIMITE_D_ONGLET) : section.subtract(couvert);
  // Une ouverture morphologique retire les filets plus étroits qu'une ligne minimale.
  const aminci = reste.offset(-LARGEUR_MINIMALE_D_INTERSTICE_MM / 2, "Miter", LIMITE_D_ONGLET);
  let interstices = aminci.offset(LARGEUR_MINIMALE_D_INTERSTICE_MM / 2, "Miter", LIMITE_D_ONGLET);
  for (const s of [...bandes, couvert, reste, aminci]) s?.delete();
  if (interstices.area() <= AIRE_MINIMALE_MM2) {
    interstices.delete();
    interstices = null;
  }
  return { chemins: parRang, interieur, interstices, exterieureDAbord: options.exterieureDAbord };
}
