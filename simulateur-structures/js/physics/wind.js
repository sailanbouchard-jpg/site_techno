// physics/wind.js
// ───────────────
// SIGNAL de vent w(t) : une vitesse SCALAIRE (ordre 1) qui varie dans le temps
// de façon DÉTERMINISTE à partir d'une graine (seed). Positif = vent vers la
// DROITE, négatif = vers la GAUCHE. C'est cette courbe qu'on prévisualise sur
// 30 s dans l'éditeur, et qui pilote l'intensité du champ de vent en simulation.
//
// Rien de physique « vrai » ici : on veut un vent RÉALISTE À L'ŒIL, léger et
// reproductible. La courbe = vitesse de base + rafales. Les rafales sont un
// BRUIT LISSE (value-noise interpolé en Catmull-Rom) sur deux octaves, dont les
// « nœuds » aléatoires ne dépendent QUE de la graine : changer une variance
// (amplitude/fréquence) redessine la même « personnalité », changer la graine
// donne un vent tout autre. Tout est fonction pure (aucune allocation durable).

// Paramètres par défaut du vent (repris tels quels dans state.js). Les deux
// « variances » réglables sont gustAmplitude (force des rafales) et gustRate
// (rapidité de leur variation).
export const DEFAULT_WIND = {
  enabled: false,
  speed: 14, // vitesse de base (m/s), SIGNÉE : > 0 → droite, < 0 → gauche
  gustAmplitude: 7, // variance 1 : amplitude des rafales (± m/s autour de la base)
  gustRate: 0.4, // variance 2 : rapidité de variation (≈ Hz : + haut = + nerveux)
  seed: 1, // graine (1 par défaut) : rejoue exactement le même vent
  particleCount: 140, // nombre de particules générées en simulation
  particleSeconds: 2.0, // longueur d'une particule = durée de sa traînée (s)
};

// Durée de la fenêtre prévisualisée dans l'éditeur (s).
export const WIND_PREVIEW_DURATION = 30;

// ── Générateur pseudo-aléatoire reproductible (mulberry32) ──
// Sert aux positions de départ des particules (pas au signal, qui utilise un
// hachage direct par index ci-dessous pour ne rien stocker).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Valeur d'un « nœud » de bruit (index k), dans [-1, 1[, fonction DÉTERMINISTE
// de (seed, k). Deux appels identiques renvoient toujours la même valeur : la
// courbe est donc figée pour une graine donnée, sans rien mémoriser.
function knot(seed, k) {
  let t = (Math.imul(seed | 0, 374761393) + Math.imul(k | 0, 668265263)) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  t = (t ^ (t >>> 16)) >>> 0;
  return (t / 4294967296) * 2 - 1;
}

// Interpolation Catmull-Rom entre 4 nœuds : courbe lisse (C1) passant par p1,p2.
function catmull(p0, p1, p2, p3, f) {
  const f2 = f * f;
  const f3 = f2 * f;
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
}

// Une octave de bruit lisse à la « fréquence » rate (nœuds espacés de 1/rate s).
function noiseOctave(seed, t, rate) {
  const x = t * rate;
  const k = Math.floor(x);
  const f = x - k;
  return catmull(knot(seed, k - 1), knot(seed, k), knot(seed, k + 1), knot(seed, k + 2), f);
}

// Bruit de rafales normalisé (≈ [-1, 1]) : une octave lente (le corps de la
// rafale) + une octave plus rapide et plus faible (le grain), pour éviter un
// signal trop « propre ». Ne dépend que de la graine et de la fréquence.
function gustNoise(seed, t, rate) {
  return 0.78 * noiseOctave(seed, t, rate) + 0.34 * noiseOctave(seed ^ 0x9e3779b9, t, rate * 2.7);
}

// Vitesse du vent à l'instant t (s), en m/s (signée). C'est LE point d'entrée du
// signal : base + rafales. Utilisé pour la prévisualisation ET en simulation.
export function windSpeedAt(wind, t) {
  const rate = Math.max(0.02, wind.gustRate || 0);
  return (wind.speed || 0) + (wind.gustAmplitude || 0) * gustNoise((wind.seed | 0) || 0, t, rate);
}

// Échantillonne la courbe de vent sur [0, duration] en `samples` points.
// Renvoie { ts, values, min, max } — min/max servent à la mise à l'échelle
// verticale automatique de la prévisualisation (le vent pouvant être négatif).
export function sampleWindCurve(wind, duration = WIND_PREVIEW_DURATION, samples = 320) {
  const ts = new Float32Array(samples);
  const values = new Float32Array(samples);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < samples; i++) {
    const t = (i / (samples - 1)) * duration;
    const v = windSpeedAt(wind, t);
    ts[i] = t;
    values[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!isFinite(min)) { min = 0; max = 0; }
  return { ts, values, min, max, duration };
}
