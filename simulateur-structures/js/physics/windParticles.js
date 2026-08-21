// physics/windParticles.js
// ────────────────────────
// PARTICULES de vent : des traceurs advectés par le champ (windField.js) qui
// laissent une TRAÎNÉE de quelques secondes — ce sont les « fils » de vent qu'on
// voit contourner la structure. Purement VISUEL : elles ne touchent pas à la
// physique de la structure (pas de couplage pour l'instant).
//
// Découplé du pas physique fin (0,5 ms) : on avance les particules une fois par
// IMAGE avec le temps simulé écoulé (léger, et la traînée reste raisonnable —
// ~1 point par image). Chaque particule mémorise sa traînée sur `particleSeconds`
// secondes (« longueur » réglable), puis recycle au bord amont.

import { sampleWindField } from "./windField.js";
import { mulberry32 } from "./wind.js";

const RESPAWN_MARGIN = 2; // m au-delà du domaine avant de recycler la particule
const MAX_SUBSTEPS = 4; // sous-pas d'advection par image (stabilité si image lente)
const SUBSTEP_DT = 0.02; // s visés par sous-pas
const MAX_TRAIL_POINTS = 400; // garde-fou (traînée très longue / image très lente)
const STUCK_SPEED_FRAC = 0.05; // sous cette fraction de |vent|, la particule « stagne »
const STUCK_FRAMES = 90; // images stagnantes avant recyclage (débloque les sillages)

// Crée l'état des particules : dispersées d'emblée dans tout le domaine pour que
// l'écran soit rempli dès le départ (traînée vide, elle se construit ensuite).
export function createWindParticles(domain, count, seed) {
  const rng = mulberry32(((seed | 0) || 1) * 2654435761);
  const n = Math.max(0, Math.min(2000, count | 0));
  const particles = [];
  for (let i = 0; i < n; i++) {
    particles.push({
      x: domain.x0 + rng() * (domain.x1 - domain.x0),
      y: domain.y0 + rng() * (domain.y1 - domain.y0),
      trail: [],
      stuck: 0,
    });
  }
  return { particles, rng, domain, count: n };
}

// Ajuste le nombre de particules sans tout réinitialiser (réglage en direct).
export function resizeWindParticles(pstate, count) {
  const n = Math.max(0, Math.min(2000, count | 0));
  const d = pstate.domain;
  while (pstate.particles.length < n) {
    pstate.particles.push({
      x: d.x0 + pstate.rng() * (d.x1 - d.x0),
      y: d.y0 + pstate.rng() * (d.y1 - d.y0),
      trail: [],
      stuck: 0,
    });
  }
  if (pstate.particles.length > n) pstate.particles.length = n;
  pstate.count = n;
}

// (Re)positionne une particule au bord AMONT du domaine (gauche si vent vers la
// droite, droite sinon), à une hauteur aléatoire, traînée remise à zéro.
function respawn(p, domain, speed, rng) {
  const inflowLeft = speed >= 0;
  p.x = inflowLeft ? domain.x0 : domain.x1;
  p.y = domain.y0 + rng() * (domain.y1 - domain.y0);
  p.trail.length = 0;
  p.stuck = 0;
}

// Avance toutes les particules d'un pas de temps `dt` (temps SIMULÉ de l'image).
// `field` fournit les vitesses ; `simTime` horodate les points pour purger la
// traînée au-delà de particleSeconds.
export function updateWindParticles(pstate, field, dt, particleSeconds, simTime) {
  if (dt <= 0 || pstate.particles.length === 0) return;
  const domain = pstate.domain;
  const speed = field.speed;
  const refSpeed = Math.max(0.001, Math.abs(speed));
  const subs = Math.max(1, Math.min(MAX_SUBSTEPS, Math.ceil(dt / SUBSTEP_DT)));
  const h = dt / subs;
  const sample = { vx: 0, vy: 0 };
  const cutoff = simTime - particleSeconds;

  for (const p of pstate.particles) {
    let lastMag = 0;
    for (let s = 0; s < subs; s++) {
      sampleWindField(field, p.x, p.y, sample);
      p.x += sample.vx * h;
      p.y += sample.vy * h;
      lastMag = Math.hypot(sample.vx, sample.vy);
    }

    // Point de traînée (un par image) + purge des points trop vieux.
    const trail = p.trail;
    trail.push(p.x, p.y, simTime);
    // trail est un tableau plat [x, y, t, x, y, t, ...]
    while (trail.length > 0 && trail[2] < cutoff) trail.splice(0, 3);
    if (trail.length > MAX_TRAIL_POINTS * 3) trail.splice(0, trail.length - MAX_TRAIL_POINTS * 3);

    // Recyclage : sortie du domaine, ou stagnation prolongée (sillage mort).
    if (lastMag < STUCK_SPEED_FRAC * refSpeed) p.stuck++; else p.stuck = 0;
    if (
      p.x < domain.x0 - RESPAWN_MARGIN || p.x > domain.x1 + RESPAWN_MARGIN ||
      p.y < domain.y0 - RESPAWN_MARGIN || p.y > domain.y1 + RESPAWN_MARGIN ||
      p.stuck > STUCK_FRAMES
    ) {
      respawn(p, domain, speed, pstate.rng);
    }
  }
}
