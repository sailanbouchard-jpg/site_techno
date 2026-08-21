// model/testCases/floorLiveLoad.js
// ──────────────────────────────────
// CAS DE TEST 4 : reprend EXACTEMENT la géométrie et le matériau du cas 1
// (barre verticale, bois fin, 10 m, aucune force appliquée), en ajoutant
// uniquement isFloor = true sur l'unique poutre. Teste isolément le
// mécanisme de charge utile des planchers (physics/mass.js,
// FLOOR_LIVE_LOAD_PER_LENGTH), par comparaison directe avec le cas 1.
//
// Géométrie, matériau : identiques au cas 1 (voir verticalTensionBar.js).
// isFloor : true (seule différence avec le cas 1).
//
// ─── VALEURS THÉORIQUES ATTENDUES ───
//
// Charge utile totale portée par la poutre :
//   FLOOR_LIVE_LOAD_PER_LENGTH × L = 150 × 10 = 1500 kg
// Moitié au nœud libre (même répartition que la masse propre, voir
// physics/mass.js) : 750 kg.
//
// Masse effective totale au nœud libre :
//   125 kg (poids propre, comme au cas 1) + 750 kg (charge utile) = 875 kg
//
// Force de gravité totale : F = 875 × 9,81 = 8583,75 N
//
// Élongation attendue : F/k = 8583,75 / 5,5×10⁷ ≈ 1,561×10⁻⁴ m ≈ 0,1561 mm
//
// VÉRIFICATION CROISÉE directe avec le cas 1 : le ratio des deux masses
// effectives est 875/125 = 7 exactement — l'élongation de ce cas doit donc
// être exactement 7× celle du cas 1 (0,1561 / 0,0223 ≈ 7,0 ✓), puisque la
// raideur de la poutre est identique dans les deux cas. Si ce ratio ne tombe
// pas sur 7 (à la précision numérique près), le mécanisme de charge utile a
// un bug.

import { createStructure, addNode, addElement } from "../Structure.js";

function buildFloorLiveLoad() {
  const structure = createStructure();
  const fixedNode = addNode(structure, { x: 0, y: 0, fixed: true });
  const freeNode = addNode(structure, { x: 0, y: 10, fixed: false });

  addElement(structure, {
    nodeAId: fixedNode.id,
    nodeBId: freeNode.id,
    materialId: "wood",
    sectionArea: 0.05,
    isFloor: true,
  });

  return structure;
}

export const floorLiveLoad = buildFloorLiveLoad();
