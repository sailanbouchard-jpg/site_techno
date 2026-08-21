// model/testCases/twoBarTruss.js
// ────────────────────────────────
// CAS DE TEST 3 : deux nœuds fixes au sol, reliés à un seul nœud libre par
// deux barres symétriques formant un triangle 3-4-5 (dimensions choisies
// pour donner des angles "ronds", faciles à vérifier à la main). Teste la
// sommation des forces sur un nœud connecté à PLUSIEURS poutres à la fois
// (contrairement aux cas 1 et 2, qui n'en ont qu'une).
//
// Géométrie : nœud fixe A en (-3, 10) ; nœud fixe B en (3, 10) ; nœud libre C
// en (0, 6). Barre A-C et barre B-C, chacune de longueur 5 m (3-4-5 : 3 m
// horizontal, 4 m vertical, 5 m de barre).
// Matériau (les deux barres) : Béton fin — E = 30×10⁹ Pa, ρ = 2500 kg/m³,
// A = 0,05 m². isFloor : false sur les deux.
// Force appliquée sur le nœud libre C : 20 000 N (20 kN), verticale,
// descendante, constante dans le temps (axe y, A = 20000 N, B = 0).
//
// ATTENTION CONVENTION D'AXES (voir physics/loads.js) : sur un Canvas2D, Y
// augmente vers le BAS. Le nœud C (y=6) est donc géométriquement AU-DESSUS
// des nœuds fixes A et B (y=10, "au sol") : ce cas représente un portique en
// forme de "A" (deux jambes inclinées partant du sol vers un sommet), pas une
// suspension par câbles. Une charge verticale descendante au sommet C
// COMPRIME donc les deux barres (comme les deux jambes d'un step-ladder sous
// une charge), elle ne les met pas en traction — d'où le signe NÉGATIF
// attendu pour la force interne ci-dessous (magnitude < 0, voir
// physics/springForces.js : "positive en traction, négative en compression").
//
// ─── VALEURS THÉORIQUES ATTENDUES ───
//
// cos(θ) = composante verticale / longueur = 4/5 = 0,8 (θ = angle de chaque
// barre par rapport à la verticale).
//
// Masse propre de chaque barre : ρ×A×L = 2500×0,05×5 = 625 kg ; moitié au
// nœud C par barre = 312,5 kg ; les DEUX barres aboutissent à C, donc la
// masse effective totale apportée à C par les poutres = 625 kg.
//
// Force verticale totale au nœud C (charge appliquée + poids propre des deux
// barres) :
//   F_total = 20 000 + 625×9,81 = 26 131,25 N
//
// Par symétrie, chaque barre porte le même effort axial T (en COMPRESSION,
// voir remarque sur la convention d'axes ci-dessus). L'équilibre vertical au
// nœud C donne : 2×T×cos(θ) = F_total, donc :
//   T = F_total / (2×cos(θ)) = 26 131,25 / 1,6 ≈ 16 332,03 N (compression,
//   donc magnitude attendue ≈ -16 332,03 N avec la convention de signe de
//   physics/springForces.js)
//
// Raideur de chaque barre : k = E×A/L = 30×10⁹×0,05/5 = 3×10⁸ N/m
// Élongation attendue de chaque barre (négative, la barre se raccourcit) :
// -T/k = -16332,03 / 3×10⁸ ≈ -5,444×10⁻⁵ m ≈ -0,0544 mm
//
// Déplacement vertical attendu du nœud C (approximation petites
// déformations, largement valide ici car l'élongation est environ 100 000
// fois plus petite que la longueur de la barre) :
//   δ_vertical ≈ élongation / cos(θ) = 5,444×10⁻⁵ / 0,8 ≈ 6,805×10⁻⁵ m
//   (≈ 0,068 mm), vers le bas.
//
// Déplacement HORIZONTAL attendu du nœud C : exactement 0 par symétrie —
// si la simulation montre un déplacement horizontal non négligeable, c'est
// le signe d'un bug (asymétrie numérique, ordre de parcours, etc.), pas un
// comportement physique normal.

import { createStructure, addNode, addElement, addForce } from "../Structure.js";
import { FORCE_COLOR_PALETTE } from "../../render/styleConfig.js";

function buildTwoBarTruss() {
  const structure = createStructure();
  const nodeA = addNode(structure, { x: -3, y: 10, fixed: true });
  const nodeB = addNode(structure, { x: 3, y: 10, fixed: true });
  const nodeC = addNode(structure, { x: 0, y: 6, fixed: false });

  addElement(structure, { nodeAId: nodeA.id, nodeBId: nodeC.id, materialId: "concrete", sectionArea: 0.05, isFloor: false });
  addElement(structure, { nodeAId: nodeB.id, nodeBId: nodeC.id, materialId: "concrete", sectionArea: 0.05, isFloor: false });

  // b = 0 : force constante dans le temps, period n'a alors aucun effet (mais
  // doit rester non nulle pour éviter une division par zéro dans evaluateForce).
  const downwardLoad = addForce(structure, {
    type: "sine",
    axis: "y",
    a: 20000,
    b: 0,
    period: 1,
    phase: 0,
    color: FORCE_COLOR_PALETTE[0],
  });
  nodeC.appliedForceIds.push(downwardLoad.id);

  return structure;
}

export const twoBarTruss = buildTwoBarTruss();
