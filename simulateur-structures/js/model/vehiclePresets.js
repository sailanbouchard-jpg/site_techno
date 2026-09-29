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
// ── Deux masses, et c'est voulu ──
// masseAffichee est ce qu'on ANNONCE : l'ordre de grandeur réel d'un tel
// véhicule, ce que les élèves doivent retenir (« un camion, c'est 15 tonnes »).
// masseSolveur est ce que la structure encaisse réellement. Elle est plus basse,
// parce qu'un tablier de jeu n'a ni la largeur ni le nombre de poutres d'un
// ouvrage réel : à 15 t pour de bon, presque aucun pont d'élève ne passerait et
// le jeu n'apprendrait plus rien. On garde donc le chiffre juste sous les yeux
// et une charge jouable sous les roues. Le rapport est le même pour tous les
// calculs : masse, traction, puissance travaillent sur masseSolveur.
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

function vehicule(id, label, masseAffichee, masseSolveur, referenceSpeed) {
  return {
    id,
    label,
    masseAffichee,
    defaultMass: masseSolveur,
    referenceSpeed,
    defaultPowerHp: puissanceNominale(masseSolveur, referenceSpeed),
  };
}

export const VEHICLE_PRESETS = [
  //         id       libellé         annoncée  au calcul  vitesse
  vehicule("car", "Voiture", 1500, 1500, 2),
  vehicule("van", "Camionnette", 3500, 2500, 1.9),
  vehicule("truck", "Camion", 15000, 8000, 1.7),
];

export function getVehiclePresetById(presetId) {
  return VEHICLE_PRESETS.find((preset) => preset.id === presetId) || null;
}

// Rapport masse au calcul / masse annoncée d'un modèle : sert à garder les deux
// masses cohérentes quand l'administrateur change celle qui est annoncée.
export function allegement(presetId) {
  const preset = getVehiclePresetById(presetId);
  return preset ? preset.defaultMass / preset.masseAffichee : 1;
}

// Ce qu'on ANNONCE pour un véhicule posé. Les véhicules enregistrés avant cette
// distinction n'ont qu'une masse : c'est elle qu'on annonce.
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
