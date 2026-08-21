// model/testCases/index.js
// ─────────────────────────
// Rôle : agrège les configurations de test prédéfinies en un seul tableau,
// utilisé par ui/testCasePanel.js pour générer la liste de boutons de la
// barre latérale. Chaque entrée associe un identifiant et un libellé à la
// structure de référence du cas (voir les fichiers individuels pour le
// détail de la géométrie et des valeurs théoriques attendues).
//
// Ne doit PAS contenir : de formule physique, de logique d'état (->
// state.js::loadTestCase, qui clone la structure choisie avant de l'utiliser).
// Dépendances : les fichiers de model/testCases/.

import { verticalTensionBar } from "./verticalTensionBar.js";
import { pendulumOscillation } from "./pendulumOscillation.js";
import { twoBarTruss } from "./twoBarTruss.js";
import { floorLiveLoad } from "./floorLiveLoad.js";

export const TEST_CASES = [
  { id: "vertical-tension-bar", label: "1. Barre verticale en traction", structure: verticalTensionBar },
  { id: "pendulum-oscillation", label: "2. Pendule (oscillation amortie)", structure: pendulumOscillation },
  { id: "two-bar-truss", label: "3. Treillis à deux barres (3-4-5)", structure: twoBarTruss },
  { id: "floor-live-load", label: "4. Plancher : charge utile", structure: floorLiveLoad },
];
