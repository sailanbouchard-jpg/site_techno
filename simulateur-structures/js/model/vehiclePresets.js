// model/vehiclePresets.js
// ────────────────────────
// Rôle : catalogue des charges mobiles proposées à l'utilisateur (outils
// Voiture, Camionnette, Camion de la barre d'outils). PURES DONNÉES + le calcul
// de la puissance qu'il faut pour tenir la vitesse — voir physics/vehicleMotion.js
// pour le modèle de traction lui-même.
//
// Aucun tirage aléatoire : un niveau FIXE la masse et la vitesse de ses
// véhicules, sinon le même pont passerait une fois sur deux.
//
// ── Une seule masse : celle qu'on annonce ──
// Un camion de 15 t pèse 15 t sous les roues. Il y a eu ici deux masses — une
// annoncée, une plus légère pour le calcul — parce que presque aucun pont
// d'élève ne passait : l'axial était alors 500× plus mou que la flexion, les
// treillis ne portaient rien et il fallait bien alléger les camions pour que le
// jeu reste jouable (voir AXIAL_STIFFNESS_DIVISOR dans physics/config.js). La
// cause étant corrigée, le pansement n'a plus lieu d'être : un chiffre sous les
// yeux qui ne serait pas celui sous les roues n'apprendrait rien de bon.
// masseAffichee reste dans le modèle des véhicules POSÉS : un niveau peut
// annoncer une masse particulière, et c'est elle qui charge la structure.
//
// ── Vitesses ──
// referenceSpeed est en m/s. Ce sont des vitesses de MANŒUVRE, pas d'autoroute :
// on regarde un ouvrage se charger, pas une course. Plus le véhicule est lourd,
// plus il avance lentement — mais il avance pour de bon.
//
// ── Puissance : elle se DÉDUIT, elle ne se choisit pas ──
// Le modèle de traction donne une vitesse d'équilibre v = P / (µ·m·g) : la
// puissance et la vitesse ne sont donc PAS indépendantes. Une puissance choisie
// à la main « parce qu'un camion fait 400 ch » donnait un camion de 15 t bloqué
// à 0,5 m/s, très loin de sa vitesse annoncée. On calcule donc la puissance à
// partir de la masse et de la vitesse visée, avec une marge : la vitesse
// d'équilibre est alors au-dessus de la consigne, et c'est la consigne
// (referenceSpeed) qui plafonne. Le véhicule tient sa vitesse, et il l'atteint
// franchement au lieu d'y ramper.
//
// Ne doit PAS contenir : de logique de calcul de mouvement (-> physics/).

import { GRAVITY_ACCELERATION, ROLLING_RESISTANCE, WATTS_PER_HORSEPOWER } from "../physics/config.js";

// Combien de fois la puissance strictement nécessaire : de quoi accélérer
// vraiment, et de quoi encaisser une route qui s'affaisse sous la charge.
const MARGE_PUISSANCE = 2.5;

// Puissance (ch) qu'il faut à une masse (kg) pour tenir une vitesse (m/s).
export function puissanceNominale(masse, vitesse) {
  const resistance = ROLLING_RESISTANCE * masse * GRAVITY_ACCELERATION; // N
  return Math.round((MARGE_PUISSANCE * resistance * vitesse) / WATTS_PER_HORSEPOWER);
}

function vehicule(id, label, masse, referenceSpeed) {
  return {
    id,
    label,
    masseAffichee: masse,
    defaultMass: masse,
    referenceSpeed,
    defaultPowerHp: puissanceNominale(masse, referenceSpeed),
  };
}

export const VEHICLE_PRESETS = [
  //         id       libellé         masse  vitesse
  vehicule("car", "Voiture", 1500, 2),
  vehicule("van", "Camionnette", 3500, 1.9),
  vehicule("truck", "Camion", 15000, 1.7),
];

export function getVehiclePresetById(presetId) {
  return VEHICLE_PRESETS.find((preset) => preset.id === presetId) || null;
}

// Ce qu'on ANNONCE pour un véhicule posé — et, depuis la suppression de
// l'allègement, ce qu'il pèse. Les véhicules les plus anciens n'ont qu'une masse.
export function masseAffichee(vehicle) {
  return vehicle.masseAffichee || vehicle.mass;
}

// Paramètres d'un véhicule posé : ceux du modèle, tels quels.
export function instantiateVehicleParams(preset) {
  return {
    mass: preset.defaultMass,
    masseAffichee: preset.masseAffichee,
    powerHp: preset.defaultPowerHp,
    referenceSpeed: preset.referenceSpeed,
  };
}
