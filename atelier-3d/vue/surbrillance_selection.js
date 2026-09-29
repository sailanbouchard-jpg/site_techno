/*
 * vue/surbrillance_selection.js
 * ─────────────────────────────
 * Les contours d'un objet : orange quand il est sélectionné, orange clair
 * sous la souris, en pointillé gris pendant que son maillage se calcule — et,
 * le reste du temps, ses arêtes en trait fin : foncées sur une pièce claire,
 * claires sur une pièce sombre, pour qu'on lise toujours sa forme.
 *
 * Les arêtes sont extraites une fois par maillage (même empreinte, mêmes
 * arêtes) : sur un boîtier importé de cent mille triangles, les recalculer à
 * chaque clic ferait saccader la sélection.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { materiauDeContour } from "./materiaux.js";

// Deux faces qui font plus de 40° entre elles dessinent une arête visible :
// au-dessous, c'est une surface courbe à peine facettée (un tore, un cône),
// dont les traits feraient des rayures.
const ANGLE_D_ARETE_DEGRES = 40;
// Chaque pièce affichée a ses arêtes : le cache doit tenir une scène entière.
const TAILLE_MAXIMALE_DU_CACHE = 400;
// Discrètes : elles dessinent la forme sans en faire un fil de fer.
const OPACITE_ARETES_SUR_CLAIR = 0.45;
const OPACITE_ARETES_SUR_SOMBRE = 0.4;

export function creerSurbrillance(couleurs) {
  const aretesParEmpreinte = new Map();
  const materiaux = {
    selection: materiauDeContour(couleurs.selection),
    survol: materiauDeContour(couleurs.survol),
    attente: materiauDeContour(couleurs.attente, true),
    // Ce qui dépend de l'esquisse choisie, ou ce dont elle dépend : la couleur des références.
    dependance: materiauDeContour(couleurs.reference),
    source: materiauDeContour(couleurs.reference, true),
    arete: materiauDeContour(couleurs.areteSurClair, false, OPACITE_ARETES_SUR_CLAIR),
    areteClaire: materiauDeContour(couleurs.areteSurSombre, false, OPACITE_ARETES_SUR_SOMBRE),
  };

  /* rapports : l'étirement de l'objet à l'affichage, ou null. Les angles se
     jugent sur la forme étirée, celle qu'on voit (voir normales_du_maillage.js). */
  function aretes(cle, geometrie, rapports) {
    let resultat = aretesParEmpreinte.get(cle);
    if (resultat === undefined) {
      if (rapports === null) {
        resultat = new THREE.EdgesGeometry(geometrie, ANGLE_D_ARETE_DEGRES);
      } else {
        const etiree = geometrie.clone().scale(...rapports);
        resultat = new THREE.EdgesGeometry(etiree, ANGLE_D_ARETE_DEGRES).scale(...rapports.map((r) => 1 / r));
        etiree.dispose();
      }
      aretesParEmpreinte.set(cle, resultat);
      if (aretesParEmpreinte.size > TAILLE_MAXIMALE_DU_CACHE) {
        const [plusAncienne, geometrieAncienne] = aretesParEmpreinte.entries().next().value;
        aretesParEmpreinte.delete(plusAncienne);
        geometrieAncienne.dispose();
      }
    }
    return resultat;
  }

  return {
    /* Les contours suivent la vue en coupe : plan (THREE.Plane) ou null. */
    couper(plan) {
      for (const materiau of Object.values(materiaux)) {
        materiau.clippingPlanes = plan === null ? null : [plan];
        materiau.needsUpdate = true;
      }
    },

    /* genre : "selection" | "survol" | "attente" | "arete" | "areteClaire" | null. Le contour est un
       enfant du maillage : il suit ses déplacements et ses aperçus sans rien
       recalculer. */
    appliquer(maillage3d, cle, genre, rapports = null) {
      let contour = maillage3d.userData.contour ?? null;
      if (genre === null) {
        if (contour !== null) contour.visible = false;
        return;
      }

      const geometrie = aretes(cle, maillage3d.geometry, rapports);
      if (contour === null || contour.geometry !== geometrie) {
        if (contour !== null) maillage3d.remove(contour);
        contour = new THREE.LineSegments(geometrie, materiaux[genre]);
        contour.raycast = () => {};    // le contour ne doit jamais intercepter un clic
        maillage3d.add(contour);
        maillage3d.userData.contour = contour;
      }

      contour.material = materiaux[genre];
      contour.renderOrder = genre === "selection" ? 2 : genre.startsWith("arete") ? 0 : 1;
      if (genre === "attente") contour.computeLineDistances();
      contour.visible = true;
    },
  };
}
