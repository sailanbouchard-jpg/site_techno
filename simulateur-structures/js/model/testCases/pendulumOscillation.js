// model/testCases/pendulumOscillation.js
// ───────────────────────────────────────
// CAS DE TEST 2 : une barre fixée en haut, lâchée à 15° de la verticale,
// libre d'osciller comme un pendule avant de se stabiliser. Teste
// l'intégration dynamique, l'amortissement, et sert de non-régression pour
// le bug d'affichage de l'amplification (voir render/displayTransform.js::
// computeDisplayPositions) — c'est exactement la configuration qui l'avait
// révélé : un élément articulé par un seul point, libre de pivoter, dont le
// déplacement home → actuel contient surtout de la rotation rigide, pas de
// l'élongation.
//
// Géométrie : nœud fixe en (0, 0). Nœud libre initial à 15° de la verticale,
// à 5 m du nœud fixe : x = 5×sin(15°) ≈ 1,294 ; y = 5×cos(15°) ≈ 4,830.
// Matériau : Acier fin — E = 210×10⁹ Pa, ρ = 7850 kg/m³, A = 0,01 m².
// isFloor : false. Aucune force appliquée (seul le poids propre fait osciller
// la barre, comme un pendule).
//
// ─── VALEURS THÉORIQUES ATTENDUES ───
//
// Période d'oscillation (pendule simple, approximation petits angles —
// l'angle de 15° introduit une erreur de moins de 0,5% sur la période réelle,
// donc cette approximation reste excellente pour vérifier l'ordre de
// grandeur) :
//   T = 2π × √(L/g) = 2π × √(5/9,81) ≈ 4,4865 s
// Remarque : la masse n'intervient PAS dans cette formule, seules L et g
// comptent — c'est une propriété connue du pendule simple, pas un oubli.
//
// IMPORTANT : avec l'amortissement actuel (voir physics/config.js,
// VELOCITY_DAMPING_PER_SECOND = 0,7), l'amplitude perd environ 80% de sa
// valeur par période — l'oscillation reste visible sur 1 à 2 cycles avant de
// devenir difficile à distinguer. Si elle s'éteint plus vite que ça,
// VELOCITY_DAMPING_PER_SECOND n'a probablement pas été appliqué correctement.
//
// Position finale attendue (équilibre, barre verticale) : (0 ; 5,0000046),
// avec une élongation finale de ρ×g×L²/(2×E) = 7850×9,81×5² / (2×210×10⁹)
// ≈ 4,584×10⁻⁶ m — environ 5× plus petite que celle du cas 1, cohérent avec
// le fait que l'acier est beaucoup plus rigide que le bois.

import { createStructure, addNode, addElement } from "../Structure.js";

function buildPendulumOscillation() {
  const structure = createStructure();
  const fixedNode = addNode(structure, { x: 0, y: 0, fixed: true });
  const angleRad = (15 * Math.PI) / 180;
  const freeNode = addNode(structure, {
    x: 5 * Math.sin(angleRad),
    y: 5 * Math.cos(angleRad),
    fixed: false,
  });

  addElement(structure, {
    nodeAId: fixedNode.id,
    nodeBId: freeNode.id,
    materialId: "steel",
    sectionArea: 0.01,
    isFloor: false,
  });

  return structure;
}

export const pendulumOscillation = buildPendulumOscillation();
