// model/materials.js
// ──────────────────
// Catalogue des matériaux ET des "types de poutres" (matériau × épaisseur).
// PURES DONNÉES + petites fonctions de recherche. Pour ajouter un matériau ou
// un type : ajouter une ligne, c'est tout.
//
// youngModulus / tensileStrength / compressiveStrength en Pascals (Pa),
// density en kg/m³. VALEURS RÉELLES (ordre Eurocode) — elles donnent des
// comportements réalistes ET bien distincts (calibrées par RDM, voir plus bas).
//
// ── Pourquoi ces valeurs (le couplage E ↔ résistance) ──
// Le module d'Young E et la résistance ne se règlent PAS séparément :
//  - E fixe la RAIDEUR (donc la flèche, et le moment de rappel en flexion) ;
//  - la résistance fixe QUAND ça casse (contrainte = 6·M/t² > limite).
// Si E est trop faible (ancienne valeur acier 20 GPa au lieu de 210), le moment
// de rappel est 10× trop bas : la contrainte de flexion n'atteint jamais la
// limite et la poutre PLIE à 90° sans casser. Avec le E réel, elle CASSE à une
// flèche réaliste (acier ~2-6 %, bois ~10 %, béton ~0,1 % = cassant). C'est
// pour ça qu'il faut les déterminer ENSEMBLE — ce qui est fait ici.
//
// ── Personnalités obtenues (vérifiées par calibration RDM) ──
//  - ACIER : très raide + très résistant, mais LOURD (ρ=7850) → casse sous son
//    propre poids au-delà de ~18 m. Fort sous charge, mais le poids le limite.
//  - BOIS : léger (ρ=500) et souple → franchit de longues portées sous son seul
//    poids et fléchit visiblement avant de céder. Excellent rapport résistance/poids.
//  - BÉTON : CASSANT, très fort en compression (30 MPa) mais quasi nul en
//    traction (3 MPa) → casse en flexion même sous son poids, mais tient des
//    charges énormes en COLONNE/ARC. (D'où le béton ARMÉ dans la réalité.)
//
// ── Pour rendre le jeu plus "fragile" sans toucher à la physique ──
// Il suffit de baisser les résistances ci-dessous d'un même facteur (ex. ×0,5) :
// les portées et charges de ruine diminuent d'autant, les rapports entre
// matériaux (donc leurs personnalités) restent identiques.

// color / colorEdge / colorHi : teinte de base + son ombre (bord) + son reflet
// (filet clair) pour donner aux poutres un rendu de "vraie" barre, pas un trait
// plat. Palette choisie DISTINCTE même pour un daltonien (deutéran/protan) :
// bois = ORANGE chaud, acier = BLEU franc, béton = GRIS clair froid — trois
// teintes bien séparées en teinte ET en luminosité.
export const MATERIALS = [
  { id: "wood", name: "Bois", youngModulus: 11e9, density: 500, tensileStrength: 7e6, compressiveStrength: 4e6,
    color: "#e0962f", colorEdge: "#9a601c", colorHi: "#f6cb80" },
  { id: "steel", name: "Acier", youngModulus: 150e9, density: 7850, tensileStrength: 170e6, compressiveStrength: 100e6,
    color: "#4a86c8", colorEdge: "#2a5793", colorHi: "#a3c6ee" },
  { id: "concrete", name: "Béton", youngModulus: 20e9, density: 2500, tensileStrength: 20e6, compressiveStrength: 200e6,
    color: "#b7bcc4", colorEdge: "#7c828c", colorHi: "#e4e7eb" },
  // ROUTE : tablier bitume, résistance type BÉTON ARMÉ (fort en compression ET
  // correct en traction grâce aux armatures). Sombre, reflet faible (asphalte).
  { id: "road", name: "Route", youngModulus: 32e9, density: 4000, tensileStrength: 30e6, compressiveStrength: 60e6,
    color: "#34383d", colorEdge: "#1b1e22", colorHi: "#5b636c" },
  // CÂBLE : acier toronné. NE TRAVAILLE QU'EN TRACTION (voir springForces +
  // bending) : très résistant tendu, AUCUNE rigidité de flexion → part en vrille
  // sous compression sans jamais casser. Noir, reflets métalliques des torons.
  { id: "cable", name: "Câble", youngModulus: 120e9, density: 7850, tensileStrength: 30e6, compressiveStrength: 1e6,
    color: "#1b1b1d", colorEdge: "#000000", colorHi: "#7a7d82" },
];

export function getMaterialById(materialId) {
  return MATERIALS.find((material) => material.id === materialId) || null;
}

// "Types de poutres" proposés à l'utilisateur : matériau + épaisseur. Convention
// (héritée du projet) : profondeur conventionnelle de 1 m, donc aire de section
// (m²) = épaisseur (m). On ne règle plus une section libre : on choisit un type.
// Champs optionnels road/cable : une poutre posée avec ce type est d'office une
// ROUTE (charges mobiles) ou un CÂBLE (traction seule) — voir Structure.addBeam.
//
// maxLength (m) : longueur MAXIMALE d'un élément de ce type. Pédagogiquement,
// c'est la longueur d'un élément « livrable » : le béton se pose en éléments
// courts, l'acier permet de grandes portées, un câble est presque libre. Un
// tracé plus long est automatiquement DÉCOUPÉ : chaque clic au-delà pose un
// élément de longueur max dans la direction visée (pose en série, voir
// structureEditor.js::handleAddBeam et Structure.js::clampBeamEnd).
export const BEAM_TYPES = [
  { id: "wood-thin", materialId: "wood", label: "Bois fin", thickness: 0.06, maxLength: 6 },
  { id: "wood-large", materialId: "wood", label: "Bois large", thickness: 0.16, maxLength: 6 },
  { id: "steel-thin", materialId: "steel", label: "Acier fin", thickness: 0.03, maxLength: 6 },
  { id: "steel-large", materialId: "steel", label: "Acier large", thickness: 0.08, maxLength: 6 },
  { id: "concrete-thin", materialId: "concrete", label: "Béton fin", thickness: 0.12, maxLength: 5 },
  { id: "concrete-large", materialId: "concrete", label: "Béton large", thickness: 0.40, maxLength: 5 },
  { id: "road", materialId: "road", label: "Route", thickness: 0.20, road: true, maxLength: 4 },
  { id: "cable", materialId: "cable", label: "Câble", thickness: 0.015, cable: true, maxLength: 25 },
];

export function getBeamTypeById(beamTypeId) {
  return BEAM_TYPES.find((beamType) => beamType.id === beamTypeId) || null;
}
