// units.js
// ────────
// Rôle : fonctions de formatage pour l'affichage à l'utilisateur. Les calculs
// internes restent TOUJOURS en unités SI (Newtons, kg, m, Pa) — c'est ce qui
// garde les formules physiques correctes. Ce fichier ne fait QUE convertir
// pour la lecture humaine, à la française : virgule décimale, espace fine
// insécable entre les milliers et devant les unités composées.
//
// Ne doit PAS contenir : de formule physique, de logique d'état.
// Dépendances : aucune.

const THIN_SPACE = " "; // espace fine insécable

// Nombre à virgule décimale, `decimals` chiffres après la virgule.
export function formatDecimal(value, decimals) {
  return value.toFixed(decimals).replace(".", ",");
}

// Entier avec séparateur de milliers (12345 → « 12 345 »).
export function formatInteger(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
}

// Les forces en jeu vont de quelques newtons à plusieurs centaines de
// milliers de newtons : afficher en kilonewtons (kN) est bien plus lisible
// que des Newtons bruts.
export function formatForce(newtons) {
  return `${formatDecimal(newtons / 1000, 2)} kN`;
}

// Les masses vont de quelques kg (une petite poutre) à plusieurs dizaines de
// tonnes : on bascule automatiquement en tonnes au-delà de 1000 kg.
export function formatMass(kg) {
  if (kg >= 1000) return `${formatDecimal(kg / 1000, 2)} t`;
  return `${formatDecimal(kg, 1)} kg`;
}

// Masse en KILOGRAMMES entiers (ex. 12 345 → « 12 345 kg »).
export function formatKilograms(kg) {
  return `${formatInteger(kg)} kg`;
}

// Masse courte pour une étiquette : « 500 kg », « 1,5 t », « 8 t ».
export function formatMassShort(kg) {
  if (kg < 1000) return `${Math.round(kg)} kg`;
  const tonnes = Math.round(kg / 100) / 10;
  return `${formatDecimal(tonnes, Number.isInteger(tonnes) ? 0 : 1)} t`;
}

// Le module de Young est de l'ordre de 10⁹ à 10¹¹ Pa : illisible en Pascals bruts.
export function formatYoungModulus(pa) {
  return `${(pa / 1e9).toFixed(0)} GPa`;
}

// La contrainte de rupture est de l'ordre de 10⁷ Pa : on affiche en MPa.
export function formatStress(pa) {
  return `${(pa / 1e6).toFixed(0)} MPa`;
}

// Le coefficient de rigidité axiale (E × section, en Pa·m² = N) d'une poutre
// est de l'ordre de 10⁸ à 10¹⁰ N : on affiche en méganewtons (MN).
export function formatAxialRigidity(newtons) {
  return `${formatDecimal(newtons / 1e6, 1)} MN`;
}

// L'élongation RÉELLE d'une poutre (longueur actuelle − longueur de repos,
// pas le ratio) est de l'ordre du micron au dixième de millimètre pour des
// matériaux réalistes : illisible en mètres bruts, on affiche en millimètres.
export function formatElongation(meters) {
  return `${formatDecimal(meters * 1000, 4)} mm`;
}

// Allongement RELATIF d'une poutre en pourcentage, signé : + = traction
// (allongée), − = compression (raccourcie). Pour l'affichage "en direct".
export function formatElongationPercent(percent) {
  if (Math.abs(percent) < 0.005) return `0,00${THIN_SPACE}%`;
  return `${percent > 0 ? "+" : ""}${formatDecimal(percent, 2)}${THIN_SPACE}%`;
}

// Pourcentage entier (taux de travail) : « 54 % ».
export function formatPercent(ratio) {
  return `${Math.round(ratio * 100)}${THIN_SPACE}%`;
}

// La vitesse de référence d'une charge mobile (physics/vehicleMotion.js) est
// stockée en m/s en interne (cohérent avec le reste du moteur physique, en
// unités SI), mais éditée en km/h dans l'inspecteur : bien plus parlant pour
// un véhicule ("100 km/h" plutôt que "27.78 m/s").
export function msToKmh(metersPerSecond) {
  return metersPerSecond * 3.6;
}

export function kmhToMs(kilometersPerHour) {
  return kilometersPerHour / 3.6;
}
