// model/testCases/verticalTensionBar.js
// ──────────────────────────────────────
// CAS DE TEST 1 : une barre verticale, fixée en haut, libre en bas, soumise
// uniquement à son propre poids (aucune force appliquée). Teste le calcul de
// masse dérivé des poutres (physics/mass.js) et la formule d'élongation
// élastique de base, sans complication de rotation ni de charge utile.
//
// Géométrie : nœud fixe en (0, 0), nœud libre en (0, 10) — barre verticale de
// 10 m de long (le nœud libre est "en dessous" car l'axe Y du canvas augmente
// vers le bas, donc "en dessous" = Y plus grand).
// Matériau : Bois fin — E = 11×10⁹ Pa, ρ = 500 kg/m³, A = 0,05 m².
// isFloor : false.
// Aucune force appliquée.
//
// ─── VALEURS THÉORIQUES ATTENDUES (à l'équilibre, après stabilisation) ───
//
// Masse effective du nœud libre = moitié de la masse de la poutre
// (lumped mass, voir physics/mass.js) :
//   masseBarre = ρ × A × L = 500 × 0,05 × 10 = 250 kg
//   masseEffective = 250 / 2 = 125 kg
//
// Force de gravité sur le nœud libre :
//   F = 125 × 9,81 = 1226,25 N
//
// Raideur de la poutre :
//   k = E×A/L = 11×10⁹ × 0,05 / 10 = 5,5×10⁷ N/m
//
// Élongation attendue à l'équilibre :
//   δ = F / k = 1226,25 / 5,5×10⁷ ≈ 2,2295×10⁻⁵ m ≈ 0,0223 mm
//
// Vérification croisée par la formule du barreau continu pesant sous son
// propre poids (résultat identique car la masse est répartie pour moitié
// aux deux extrémités d'une poutre uniforme — coïncidence exacte, pas une
// approximation) :
//   δ = ρ×g×L² / (2×E) = 500×9,81×10² / (2×11×10⁹) ≈ 2,2295×10⁻⁵ m  ✓
//
// Position finale attendue du nœud libre : (0 ; 10,0000223)
// Contrainte axiale : σ = F/A = 1226,25/0,05 = 24 525 Pa (négligeable, loin
// de la limite de rupture du bois ~24 MPa — normal, aucune rupture n'est
// modélisée de toute façon).

import { createStructure, addNode, addElement } from "../Structure.js";

function buildVerticalTensionBar() {
  const structure = createStructure();
  const fixedNode = addNode(structure, { x: 0, y: 0, fixed: true });
  const freeNode = addNode(structure, { x: 0, y: 10, fixed: false });

  addElement(structure, {
    nodeAId: fixedNode.id,
    nodeBId: freeNode.id,
    materialId: "wood",
    sectionArea: 0.05,
    isFloor: false,
  });

  return structure;
}

export const verticalTensionBar = buildVerticalTensionBar();
