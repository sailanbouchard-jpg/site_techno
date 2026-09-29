// physics/simulationEngine.js
// ───────────────────────────
// SEUL point d'entrée physique. Un pas complet : forces externes (gravité +
// charges mobiles) → forces axiales des segments → forces angulaires (flexion)
// → intégration des nœuds libres → avance des charges mobiles → ruptures.
//
// Les ruptures sont appliquées en TOUT DERNIER (elles changent la topologie),
// jamais pendant le calcul des forces : le résultat ne dépend pas de l'ordre
// de parcours.
//
// OPTIMISATIONS (machines faibles) — sans changer la physique :
//  • axial en ligne, ZÉRO allocation : la tension de chaque segment est stockée
//    dans segment._tension et RÉUTILISÉE par le scan d'efforts et le rendu ;
//  • flexion en gradient ANALYTIQUE + cache topologique (voir bending.js) ;
//  • scan des efforts/ruptures DÉCIMÉ : une fois tous les EFFORT_SCAN_PERIOD
//    secondes simulées au lieu de chaque pas (granularité ~4 ms, invisible face
//    aux 80 ms de persistance exigés pour rompre), caché sur beam._effort ;
//  • PAS DE TEMPS ADAPTATIF et, en scène lourde, MISE À L'ÉCHELLE DES MASSES :
//    c'est physics/solveur.js qui décide, une fois par état de topologie, du
//    pas que la scène permet et de l'inertie à ajouter pour l'allonger ;
//  • MISE EN SOMMEIL : à l'équilibre strict (stabilisée, sans vent, véhicule ni
//    surcharge, calme plat durable), le pas entier est sauté. Réveil : vent
//    activé, véhicule, ou modification de topologie (invalidateIndex).

import { findNodeById, findBeamById, ensureIndex } from "../model/Structure.js";
import { addExternalForce, addMobileLoadWeights, addStaticBeamLoadWeights, getGravityRampFactor } from "./loads.js";
import { addWindForces } from "./windForce.js";
import { windSpeedAt } from "./wind.js";
import { applyBending } from "./bending.js";
import { integrateNode } from "./integrator.js";
import { reglerSolveur } from "./solveur.js";
import { scanEfforts } from "./rupture.js";
import { applyGroundContact } from "./ground.js";
import { advanceMobileLoad } from "./vehicleMotion.js";
import {
  TAUX_AMORTISSEMENT, TAUX_AMORTISSEMENT_STABILISATION,
  SETTLE_SPEED_THRESHOLD, SETTLE_MIN_TIME, SETTLE_TIMEOUT,
  SLEEP_SPEED_THRESHOLD, SLEEP_DELAY,
} from "./config.js";

export function step(structure, dt, currentTime, wind) {
  // Lancement : tout repart de ZÉRO (pas d'effort résiduel d'un essai précédent).
  if (currentTime === 0) {
    structure._settled = false;
    structure._settleTime = 0;
    structure._asleep = false;
    structure._stillTime = 0;
    structure._effortCountdown = 0; // scan des efforts dès le premier pas
  }

  // SOMMEIL : à l'équilibre gelé, plus rien à calculer. On vérifie seulement les
  // conditions de réveil (le vent peut être activé en cours de simulation).
  if (structure._asleep) {
    if ((wind && wind.enabled) || structure.mobileLoads.length > 0) {
      structure._asleep = false;
    } else {
      structure._settleTime += dt;
      return;
    }
  }

  // 0. Index à jour pour tout le pas → toutes les recherches par id en O(1).
  //    (La topologie ne change qu'à l'étape 6, qui réinvalide l'index.)
  ensureIndex(structure);
  // Réglage du solveur pour cette topologie : pas admissible, masses d'inertie
  // (node._masse / node._masseInertie) et cadence du scan d'efforts. Lecture de
  // cache tant que rien ne change ; recalculé après chaque rupture.
  const reglage = reglerSolveur(structure);

  // Tampon de forces RÉUTILISÉ d'un pas à l'autre (zéro allocation par pas) :
  // une Map id→{fx,fy} persistante, remise à zéro ici. Jetée en même temps que
  // l'index quand la topologie change (invalidateIndex).
  let forces = structure._forces;
  if (!forces) {
    forces = new Map();
    structure._forces = forces;
  }

  // 1. Forces externes (gravité + charges posées) sur chaque nœud LIBRE.
  for (const node of structure.nodes) {
    if (node.fixed) continue;
    let f = forces.get(node.id);
    if (f) {
      f.fx = 0;
      f.fy = 0;
    } else {
      f = { fx: 0, fy: 0 };
      forces.set(node.id, f);
    }
    addExternalForce(f, structure, node, currentTime);
  }
  addStaticBeamLoadWeights(forces, structure, currentTime);
  addMobileLoadWeights(forces, structure, currentTime);

  // 1.5. Force du VENT sur les poutres (couplage fluide → structure). Montée en
  //      douceur au lancement (même rampe que la gravité) pour éviter un choc à t=0.
  if (wind && wind.enabled) {
    addWindForces(forces, structure, windSpeedAt(wind, currentTime), getGravityRampFactor(currentTime));
  }

  // 2. Forces axiales des segments (loi de Hooke, en ligne et sans allocation).
  //    Convention de signe : _tension > 0 = TRACTION, < 0 = COMPRESSION
  //    (réutilisée par le scan d'efforts et par le code couleur du rendu).
  for (const segment of structure.segments) {
    const nodeA = findNodeById(structure, segment.nodeAId);
    const nodeB = findNodeById(structure, segment.nodeBId);
    if (!nodeA || !nodeB) continue;
    const beam = findBeamById(structure, segment.beamId);
    const isCable = beam ? beam.isCable : false;

    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const currentLength = Math.sqrt(dx * dx + dy * dy);
    if (currentLength === 0) {
      segment._tension = 0;
      continue;
    }
    // TENSION DE BASE d'un câble : sa longueur de repos EFFECTIVE est raccourcie
    // (pretension > 0 → câble déjà tendu au lancement) ou allongée (< 0 → mou).
    let restLength = segment.restLength;
    if (isCable) {
      const p = beam.pretension || 0;
      if (p) restLength = segment.restLength * (1 - p / 100);
    }
    const elongation = currentLength - restLength;
    // Un câble ne reprend que la traction : comprimé, il est "mou" (force nulle).
    const magnitude = isCable && elongation < 0 ? 0 : segment.stiffness * elongation;
    segment._tension = magnitude;

    // Traction (magnitude > 0) : le segment tire A vers B et B vers A.
    const fx = (magnitude * dx) / currentLength;
    const fy = (magnitude * dy) / currentLength;
    if (!nodeA.fixed) {
      const f = forces.get(nodeA.id);
      f.fx += fx;
      f.fy += fy;
    }
    if (!nodeB.fixed) {
      const f = forces.get(nodeB.id);
      f.fx -= fx;
      f.fy -= fy;
    }
  }

  // 3. Forces angulaires (flexion) : charnières INTERNES de chaque poutre, puis
  //    continuité/encastrement aux ASSEMBLAGES (un grand tronçon ≡ des petits).
  //    Gradients analytiques + cache topologique — voir bending.js.
  applyBending(structure, forces);

  // 4. Intégration des nœuds libres. Tant que la structure n'est pas STABILISÉE,
  //    on amortit fort (chargement quasi-statique → pas de dépassement).
  const settled = structure._settled === true;
  // Amortissement converti depuis son taux par seconde : le pas n'est plus fixe,
  // mais l'amortissement RÉEL, lui, ne doit pas dépendre du pas choisi.
  const damping = Math.exp(-(settled ? TAUX_AMORTISSEMENT : TAUX_AMORTISSEMENT_STABILISATION) * dt);
  let maxSpeedSq = 0;
  for (const node of structure.nodes) {
    if (node.fixed) continue;
    // Masse d'INERTIE (= la vraie masse, sauf pour les nœuds alourdis par le
    // solveur en scène lourde — voir physics/solveur.js). Le POIDS, lui, a été
    // calculé à l'étape 1 sur la vraie masse.
    integrateNode(node, forces.get(node.id), node._masseInertie, dt, damping);
    const s2 = node.vx * node.vx + node.vy * node.vy;
    if (s2 > maxSpeedSq) maxSpeedSq = s2;
  }

  // 4.5. Contact avec le sol : aucun nœud ne peut pénétrer le terrain.
  applyGroundContact(structure);

  // 5. Charges mobiles : ne s'élancent qu'une fois la structure stabilisée
  //    (elle se met d'abord en charge sous le poids statique, véhicule compris).
  if (settled) {
    for (const vehicle of structure.mobileLoads) {
      advanceMobileLoad(vehicle, structure, dt);
    }
  }

  // Détection de stabilisation : la rampe de gravité est passée ET les nœuds se
  // sont calmés (ou délai de sécurité dépassé). Une fois stabilisé, on y reste.
  structure._settleTime = (structure._settleTime || 0) + dt;
  if (!settled) {
    const calm = structure._settleTime >= SETTLE_MIN_TIME && Math.sqrt(maxSpeedSq) < SETTLE_SPEED_THRESHOLD;
    if (calm || structure._settleTime >= SETTLE_TIMEOUT) structure._settled = true;
  }

  // 6. Scan des EFFORTS + RUPTURES, décimé (une fois par EFFORT_SCAN_PERIOD de
  //    temps simulé — soit reglage.pasParScan pas). Le scan met à jour
  //    beam._effort (réutilisé par le rendu) ; les ruptures ne s'appliquent
  //    qu'une fois STABILISÉ : un pic transitoire ne casse jamais rien.
  let brokenThisStep = 0;
  const countdown = (structure._effortCountdown ?? 0) - 1;
  if (countdown <= 0) {
    structure._effortCountdown = reglage.pasParScan;
    brokenThisStep = scanEfforts(structure, dt * reglage.pasParScan, structure._settled);
  } else {
    structure._effortCountdown = countdown;
  }

  // 7. Détection du SOMMEIL : stabilisée, sans vent ni véhicule, aucune poutre
  //    en dépassement, aucune rupture à l'instant, et un calme plat qui dure
  //    (vitesse max sous le seuil pendant SLEEP_DELAY). L'équilibre est alors
  //    figé : les pas suivants sont sautés jusqu'à un réveil.
  if (
    structure._settled && brokenThisStep === 0 && !structure._anyOverload &&
    (!wind || !wind.enabled) && structure.mobileLoads.length === 0 &&
    maxSpeedSq < SLEEP_SPEED_THRESHOLD * SLEEP_SPEED_THRESHOLD
  ) {
    structure._stillTime = (structure._stillTime || 0) + dt;
    if (structure._stillTime >= SLEEP_DELAY) structure._asleep = true;
  } else {
    structure._stillTime = 0;
  }
}
