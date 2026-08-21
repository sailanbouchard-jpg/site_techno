// physics/windSim.js
// ──────────────────
// ORCHESTRATION du vent en simulation. Relie le SIGNAL (wind.js), le CHAMP
// (windField.js) et les PARTICULES (windParticles.js), et applique la règle de
// LÉGÈRETÉ demandée : le champ n'est RECONSTRUIT que lorsque la vitesse du vent
// a notablement changé (delta ou changement de sens). Entre deux, il est figé et
// les particules ne font que l'échantillonner.
//
// Appelé une fois par IMAGE depuis main.js (pas par pas physique) : les
// particules sont visuelles et avancent au temps simulé de l'image.

import { windSpeedAt } from "./wind.js";
import { computeWindDomain, buildWindField } from "./windField.js";
import { createWindParticles, updateWindParticles, resizeWindParticles } from "./windParticles.js";

// Seuil de reconstruction du champ : en dessous, le champ reste figé. Au-delà
// (ou au changement de SENS du vent), on reconstruit. C'est ce seuil qui fait
// qu'un vent nerveux reconstruit plusieurs fois par seconde, un vent calme
// presque jamais.
const REBUILD_DELTA = 0.6; // m/s

// Vitesse instantanée du vent (m/s, signée) — pratique pour l'affichage.
export function currentWindSpeed(state) {
  return windSpeedAt(state.wind, state.simulationTime);
}

export function resetWindRuntime(state) {
  state.windRuntime = null;
}

// Crée l'état d'exécution (domaine + champ initial + particules) pour la session
// de simulation courante. La structure est figée en simulation : le domaine et
// la géométrie ne changent plus jusqu'au prochain reset.
function initRuntime(state) {
  const wind = state.wind;
  const domain = computeWindDomain(state.structure);
  const speed0 = windSpeedAt(wind, state.simulationTime);
  const field = buildWindField(state.structure, speed0, domain);
  const particles = createWindParticles(domain, wind.particleCount, wind.seed);
  state.windRuntime = {
    domain,
    field,
    particles,
    lastBuildSpeed: speed0,
    seedSig: wind.seed | 0,
    countSig: wind.particleCount | 0,
  };
  return state.windRuntime;
}

// Avance le vent d'une image. `frameDt` = temps SIMULÉ écoulé cette image (déjà
// mis à l'échelle par le ralenti). Sans effet si le vent est désactivé.
export function stepWindSim(state, frameDt) {
  const wind = state.wind;
  if (!wind || !wind.enabled) return;

  let rt = state.windRuntime;
  if (!rt) rt = initRuntime(state);

  // Changement de graine ou de nombre de particules réglé en direct.
  if ((wind.seed | 0) !== rt.seedSig) {
    rt.particles = createWindParticles(rt.domain, wind.particleCount, wind.seed);
    rt.seedSig = wind.seed | 0;
    rt.countSig = wind.particleCount | 0;
  } else if ((wind.particleCount | 0) !== rt.countSig) {
    resizeWindParticles(rt.particles, wind.particleCount);
    rt.countSig = wind.particleCount | 0;
  }

  // RECONSTRUCTION du champ seulement si la vitesse a notablement changé
  // (delta franchi) ou si le vent a changé de sens.
  const speed = windSpeedAt(wind, state.simulationTime);
  const changedEnough = Math.abs(speed - rt.lastBuildSpeed) >= REBUILD_DELTA;
  const flippedSign = speed * rt.lastBuildSpeed < 0;
  if (changedEnough || flippedSign) {
    rt.field = buildWindField(state.structure, speed, rt.domain);
    rt.lastBuildSpeed = speed;
  }

  updateWindParticles(rt.particles, rt.field, frameDt, wind.particleSeconds, state.simulationTime);
}
