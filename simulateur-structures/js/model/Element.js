// model/Element.js
// ────────────────
// Rôle : fabrique d'une poutre (élément reliant deux nœuds). Calcule, à la
// création, sa longueur de repos (distance initiale entre A et B) et sa
// raideur de ressort équivalente. Expose aussi computeStiffness() pour que
// l'inspecteur puisse recalculer la raideur quand on change le type de poutre
// (matériau + section) d'une poutre existante, sans dupliquer la formule.
//
// `materialId` et `sectionArea` sont TOUJOURS fournis par l'appelant (dérivés
// d'un type de poutre du catalogue, voir model/materials.js::BEAM_TYPES) : ce
// fichier ne connaît aucune valeur par défaut, et ne sait même pas qu'un
// "type de poutre" existe — c'est un concept d'interface, pas physique.
//
// `isFloor` marque une poutre comme portant une charge utile de plancher (voir
// physics/mass.js) : par défaut false, une poutre normale ne porte que son
// propre poids.
//
// `isCable` marque une poutre comme ne résistant qu'à la traction, jamais à la
// compression (voir physics/springForces.js) : par défaut false (poutre rigide
// classique). Un câble reste un élément normal du catalogue de matériaux, pas
// un matériau séparé.
//
// `isRoad` marque une poutre comme faisant partie d'une "route" sur laquelle
// une charge mobile peut se déplacer (voir physics/vehicleMotion.js) : par
// défaut false, une poutre normale n'est jamais traversée par un véhicule.
//
// `restLength` est normalement calculé automatiquement depuis la distance
// ACTUELLE entre nodeA et nodeB (cas normal : une nouvelle poutre dessinée par
// l'utilisateur n'a pas encore bougé). On peut aussi le fournir explicitement
// — c'est le seul cas d'utilisation actuel : physics/rupture.js::breakElement(),
// qui a besoin que chaque moitié garde la moitié de la longueur de repos
// D'ORIGINE, pas la moitié de la distance actuelle (potentiellement étirée ou
// comprimée) entre le nœud existant et le nouveau nœud central.
//
// Ne doit PAS contenir : de formule de FORCE/dynamique (-> physics/springForces.js),
// ni de dessin.
// Dépendances : model/materials.js.

import { getMaterialById } from "./materials.js";

export function createElement({
  id,
  nodeAId,
  nodeBId,
  materialId,
  sectionArea,
  isFloor = false,
  isCable = false,
  isRoad = false,
  nodeA,
  nodeB,
  restLength,
}) {
  let actualRestLength = restLength;
  if (actualRestLength === undefined) {
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    actualRestLength = Math.sqrt(dx * dx + dy * dy);
  }

  return {
    id,
    nodeAId,
    nodeBId,
    materialId,
    sectionArea,
    isFloor,
    isCable,
    isRoad,
    restLength: actualRestLength,
    stiffness: computeStiffness(materialId, sectionArea, actualRestLength),
  };
}

// Raideur du ressort équivalent à la poutre : plus la poutre est rigide (module
// de Young élevé) et large (grande section), plus elle résiste à
// l'étirement/compression. Plus elle est longue, plus elle est "souple" pour un
// même matériau (un long élastique s'étire plus facilement qu'un court).
//
// Exportée pour que l'inspecteur (ui/inspector.js) puisse recalculer la
// raideur quand on change le type de poutre d'une poutre déjà créée, sans
// dupliquer cette formule ailleurs.
export function computeStiffness(materialId, sectionArea, restLength) {
  const material = getMaterialById(materialId);
  if (!material || restLength === 0) {
    return 0;
  }
  return (material.youngModulus * sectionArea) / restLength;
}
