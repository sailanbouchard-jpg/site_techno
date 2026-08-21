// physics/rupture.js
// ──────────────────
// Une poutre peut se rompre en TRACTION, en COMPRESSION ou en FLEXION, à
// L'ENDROIT le plus sollicité. La RÉSISTANCE est calculée sur la vraie
// contrainte (force / section, moment / module), indépendamment du gain de
// déformation : casser reste "vrai" même si la déformation est exagérée.
//
// Le flambement, lui, n'est pas un seuil ici : il ÉMERGE de la dynamique
// (compression + ressorts angulaires + imperfection, voir bending.js). Une
// poutre flambée finit souvent par rompre en flexion à mi-portée — ce que
// détecte la partie "flexion" ci-dessous.
//
// Les joints/points ne se brisent jamais (comportement élastique).
//
// OPTIMISATIONS (voir simulationEngine.js) :
//  • le scan complet (scanEfforts) est DÉCIMÉ (tous les N pas) et met en cache
//    son résultat sur chaque poutre (beam._effort = { util, breakIndex, type })
//    — le rendu lit ce cache au lieu de tout recalculer par image ;
//  • l'axial RÉUTILISE la tension segment._tension calculée par le pas courant
//    (demi-pas d'écart au plus — invisible face aux 80 ms de persistance) ;
//  • la flexion RÉUTILISE le cache topologique de bending.js (kθ, angles de
//    repos, membres des joints) au lieu de les recalculer.

import { getMaterialById } from "../model/materials.js";
import { findNodeById, findSegmentById, splitBeam, removeBeam } from "../model/Structure.js";
import { computeSegmentForce } from "./springForces.js";
import { getBendCache, turningAngle, beamEndJointUtil } from "./bending.js";
import { RUPTURE_PERSIST_TIME } from "./config.js";

// Taux de travail (≥1 = rompt) d'un segment en axial : contrainte / résistance,
// résistance différente en traction et en compression (asymétrie matériau).
// La tension vient du cache du pas courant (segment._tension) quand il existe.
function segmentAxialUtilization(structure, beam, segment, material) {
  let magnitude = segment._tension;
  if (magnitude === undefined) {
    // Hors simulation (aucun pas encore calculé) : calcul direct.
    const a = findNodeById(structure, segment.nodeAId);
    const b = findNodeById(structure, segment.nodeBId);
    if (!a || !b) return { util: 0, type: null };
    magnitude = computeSegmentForce(a, b, segment, beam.isCable, beam.isCable ? beam.pretension || 0 : 0).magnitude;
  }
  const stress = Math.abs(magnitude) / beam.sectionArea;
  const limit = magnitude >= 0 ? material.tensileStrength : material.compressiveStrength;
  // magnitude > 0 = traction, < 0 = compression (voir simulationEngine.js).
  return { util: limit > 0 ? stress / limit : 0, type: magnitude >= 0 ? "traction" : "compression" };
}

// Endroit le plus sollicité d'une poutre : { util, breakIndex, type } (index de
// nœud interne où scinder, et mode dominant "compression"|"traction"|"flexion").
// breakIndex = -1 pour une poutre à 1 segment (pas de nœud interne) → casse net.
function worstLocation(structure, beam) {
  const material = getMaterialById(beam.materialId);
  const ids = beam.nodeIds;
  if (!material) return { util: 0, breakIndex: null, type: null };

  // Une poutre courte (≈ 1 m) n'a qu'UN segment, donc PAS de nœud interne où
  // scinder : si elle rompt, elle casse net (on la retire). breakIndex = -1 sert
  // de marqueur pour cela (voir scanEfforts). Pas de flexion interne possible.
  const single = ids.length < 3;
  let best = { util: 0, breakIndex: null, type: null };

  // Axial, segment par segment (vaut aussi pour 1 segment).
  for (let k = 0; k < beam.segIds.length; k++) {
    const segment = findSegmentById(structure, beam.segIds[k]);
    if (!segment) continue;
    const { util, type } = segmentAxialUtilization(structure, beam, segment, material);
    const breakIndex = single ? -1 : Math.min(Math.max(k, 1), ids.length - 2);
    if (util > best.util) best = { util, breakIndex, type };
  }

  if (!single && material.tensileStrength > 0) {
    // Flexion, charnière par charnière (charnières INTERNES, ≥ 2 segments).
    // kθ et angles de repos viennent du cache topologique (bending.js).
    const data = getBendCache(structure).beamDataById.get(beam.id);
    if (data && data.kTheta !== 0 && data.restAngles) {
      const nodes = data.nodes;
      const stressPerMoment = 6 / (beam.sectionArea * beam.sectionArea);
      for (let i = 1; i < nodes.length - 1; i++) {
        // Contrainte mesurée par rapport à l'angle de coude AU REPOS : la
        // grosse imperfection de construction n'est PAS une contrainte.
        const d = turningAngle(nodes[i - 1], nodes[i], nodes[i + 1]) - data.restAngles[i - 1];
        const moment = Math.abs(data.kTheta * Math.atan2(Math.sin(d), Math.cos(d)));
        const util = moment * stressPerMoment / material.tensileStrength;
        if (util > best.util) best = { util, breakIndex: i, type: "flexion" };
      }
    }
  }

  // Flexion au droit d'un ASSEMBLAGE (joint partagé non ancré) : le moment de
  // coude y est rapporté à la poutre — pour qu'un découpage en tronçons casse au
  // même endroit / au même % qu'une poutre entière (voir bending.js). Vaut AUSSI
  // pour une poutre à 1 segment, qui ne fléchit QUE là (breakIndex = -1, casse net).
  const je = beamEndJointUtil(structure, beam);
  if (je.breakIndex !== null && je.util > best.util) {
    best = { util: je.util, breakIndex: je.breakIndex, type: "flexion" };
  }

  return best;
}

// Taux de travail max d'une poutre (calcul DIRECT, pour l'inspecteur). Le rendu,
// lui, lit le cache beam._effort rempli par scanEfforts.
export function beamUtilization(structure, beam) {
  return worstLocation(structure, beam).util;
}

// Taux de travail + mode dominant + endroit (calcul direct, même remarque).
export function beamEffort(structure, beam) {
  return worstLocation(structure, beam); // { util, breakIndex, type }
}

// SCAN des efforts : met à jour beam._effort pour TOUTES les poutres (consommé
// par le rendu : couleur d'alerte, étiquette de %), et — si `applyBreaks` —
// casse celles qui dépassent leur limite depuis assez longtemps, à leur point
// le plus sollicité. `elapsed` = temps simulé écoulé depuis le scan précédent
// (le scan est décimé). Les ruptures sont COLLECTÉES puis appliquées après le
// parcours (splitBeam modifie la liste des poutres). Renvoie le nombre de
// ruptures de ce scan.
export function scanEfforts(structure, elapsed, applyBreaks) {
  const toBreak = [];
  let anyOverload = false;
  for (const beam of structure.beams) {
    const best = worstLocation(structure, beam);
    beam._effort = best;
    if (best.util > 1 && best.breakIndex !== null) {
      anyOverload = true;
      if (applyBreaks) {
        // Anti-pic : on n'accumule le "temps de surcharge" que tant qu'on dépasse
        // la limite ; il faut tenir RUPTURE_PERSIST_TIME pour casser (voir config).
        beam.overTime = (beam.overTime || 0) + elapsed;
        if (beam.overTime >= RUPTURE_PERSIST_TIME) toBreak.push({ beamId: beam.id, breakIndex: best.breakIndex });
      }
    } else {
      beam.overTime = 0;
    }
  }
  // Bloque la mise en sommeil tant qu'une poutre est en dépassement (une rupture
  // imminente ne doit pas être gelée) — voir simulationEngine.js.
  structure._anyOverload = anyOverload;

  for (const { beamId, breakIndex } of toBreak) {
    // -1 : poutre à 1 segment (pas de nœud interne) → elle casse net (retirée).
    if (breakIndex === -1) removeBeam(structure, beamId);
    else splitBeam(structure, beamId, breakIndex);
  }
  return toBreak.length;
}
