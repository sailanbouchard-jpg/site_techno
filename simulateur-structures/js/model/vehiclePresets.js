// model/vehiclePresets.js
// ────────────────────────
// Rôle : catalogue des charges mobiles proposées à l'utilisateur (boutons
// "Ajouter une voiture"/"Ajouter un camion" de la barre d'outils). PURES
// DONNÉES, aucun calcul physique — voir physics/vehicleMotion.js.
//
// referenceSpeed est en m/s (100 km/h ≈ 27,78 m/s ; 80 km/h ≈ 22,22 m/s) :
// c'est la vitesse de croisière atteinte sur une route plate à pleine
// puissance (voir physics/vehicleMotion.js pour la justification).
//
// Ne doit PAS contenir : de logique de calcul (-> model/MobileLoad.js, physics/).
// Dépendances : aucune.

// speedVariance et powerVariance : fraction (0–1) de variation aléatoire
// appliquée autour des valeurs par défaut à chaque instanciation.
// Ex. 0.15 → ±15 % autour de la valeur nominale.
export const VEHICLE_PRESETS = [
  // { id: "car", label: "Voiture", defaultMass: 1500, defaultPowerHp: 150, referenceSpeed: 27.78 },
  // { id: "truck", label: "Camion", defaultMass: 15000, defaultPowerHp: 400, referenceSpeed: 22.22 },
  { id: "car",   label: "Voiture", defaultMass: 1500,  defaultPowerHp: 6,  referenceSpeed: 2, speedVariance: 0.5, powerVariance: 0.40 },
  { id: "truck", label: "Camion",  defaultMass: 15000, defaultPowerHp: 15, referenceSpeed: 1.42, speedVariance: 0.3, powerVariance: 0.15 },
];

export function getVehiclePresetById(presetId) {
  return VEHICLE_PRESETS.find((preset) => preset.id === presetId) || null;
}

// Retourne une valeur nominale perturbée de ±variance (uniforme).
function applyVariance(value, variance) {
  return value * (1 + (Math.random() * 2 - 1) * variance);
}

// Instancie les paramètres d'un véhicule à partir d'un preset, en appliquant
// la variance aléatoire sur referenceSpeed et powerHp.
export function instantiateVehicleParams(preset) {
  return {
    mass: preset.defaultMass,
    powerHp:        applyVariance(preset.defaultPowerHp,    preset.powerVariance ?? 0),
    referenceSpeed: applyVariance(preset.referenceSpeed,    preset.speedVariance ?? 0),
  };
}
