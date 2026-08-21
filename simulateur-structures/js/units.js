// units.js
// ────────
// Rôle : fonctions de formatage pour l'affichage à l'utilisateur. Les calculs
// internes restent TOUJOURS en unités SI (Newtons, kg, m, Pa) — c'est ce qui
// garde les formules physiques correctes. Ce fichier ne fait QUE convertir
// pour la lecture humaine.
//
// Ne doit PAS contenir : de formule physique, de logique d'état.
// Dépendances : aucune.

// Les forces en jeu vont de quelques newtons à plusieurs centaines de
// milliers de newtons : afficher en kilonewtons (kN) est bien plus lisible
// que des Newtons bruts.
export function formatForce(newtons) {
  return `${(newtons / 1000).toFixed(2)} kN`;
}

// Les masses vont de quelques kg (une petite poutre) à plusieurs dizaines de
// tonnes (un immeuble) : on bascule automatiquement en tonnes au-delà de 1000 kg.
export function formatMass(kg) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(1)} kg`;
}

// Masse en KILOGRAMMES entiers, séparateur de milliers = point (ex. 12 345 →
// "12.345 kg"). Utilisé pour le poids d'une poutre dans l'inspecteur.
export function formatKilograms(kg) {
  const n = Math.round(kg);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} kg`;
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
  return `${(newtons / 1e6).toFixed(1)} MN`;
}

// L'élongation RÉELLE d'une poutre (longueur actuelle − longueur de repos,
// pas le ratio) est de l'ordre du micron au dixième de millimètre pour des
// matériaux réalistes : illisible en mètres bruts, on affiche en millimètres.
export function formatElongation(meters) {
  return `${(meters * 1000).toFixed(4)} mm`;
}

// Allongement RELATIF d'une poutre en pourcentage, signé : + = traction
// (allongée), − = compression (raccourcie). Pour l'affichage "en direct".
export function formatElongationPercent(percent) {
  if (Math.abs(percent) < 0.005) return "0.00 %";
  return `${percent > 0 ? "+" : ""}${percent.toFixed(2)} %`;
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
