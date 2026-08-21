// physics/bending.js
// ──────────────────
// La FLEXION. Des RESSORTS ANGULAIRES pénalisent le changement d'angle :
//  1. charnière INTERNE : entre deux segments consécutifs d'une même poutre
//     (repos droit) → rigidité de flexion E·I, et FLAMBEMENT émergent sous
//     compression. Gérée par poutre.
//  2. ASSEMBLAGE (un nœud "joint" partagé par plusieurs poutres, ou un appui
//     ancré) → géré par nœud. Cas :
//       • nœud ANCRÉ en PIVOT LIBRE (node.clamped = false) : l'appui FIGE la
//         position mais laisse la rotation LIBRE (aucun moment, ni au sol ni entre
//         poutres). Aucun ressort angulaire.
//       • nœud ANCRÉ en ENCASTREMENT (node.clamped = true) : l'appui FIGE la
//         position ET l'ORIENTATION — chaque poutre est rappelée vers sa direction
//         de REPOS absolue (½·k·écart²). Il transmet donc un MOMENT (comportement
//         de console : la poutre fléchit contre l'appui et peut rompre à sa base).
//       • nœud LIBRE avec ≥2 poutres : assemblage RIGIDE à ROTATION LIBRE — on
//         ne pénalise que les rotations RELATIVES des membres (les "coudes"),
//         jamais la rotation d'ensemble. Pour 2 membres alignés, c'est EXACTEMENT
//         une charnière interne (k = 2·kθ choisi pour ça) : découper une poutre
//         en tronçons redonne donc la MÊME flexion qu'une poutre entière.
//
// FORCES ANALYTIQUES (optimisation). La force de chaque ressort est le GRADIENT
// de son énergie ½·k·angle², calculé en FORME FERMÉE (avant : différences
// finies = 12 évaluations d'énergie par charnière et par pas — c'était LE poste
// de calcul dominant). Les formules :
//   • pour l'angle de coude θ = atan2(e1×e2, e1·e2) entre e1 = p1−p0 et
//     e2 = p2−p1 :  ∇p0 θ = e1⊥/|e1|²,  ∇p2 θ = e2⊥/|e2|²,
//     ∇p1 θ = −(∇p0 θ + ∇p2 θ)   (avec e⊥ = (−ey, ex))
//     et F = −k·(θ−θ₀)·∇θ. La somme des forces d'un terme est NULLE (aucune
//     quantité de mouvement créée), exactement comme le gradient exact.
//   • pour l'assemblage libre, la rotation d'ensemble θ̄ (moyenne circulaire
//     pondérée) dépend elle-même des membres : sa dérivée ∂θ̄/∂δⱼ = kⱼ·cos(devⱼ)/R
//     (R = |Σ k·e^{iδ}|) entre dans la règle de la chaîne — voir applyRigidJoint.
// Ces gradients sont VALIDÉS numériquement contre les différences finies de
// totalBendingEnergy (voir le script de vérification), et l'énergie ne peut que
// décroître avec l'amortissement, comme avant.
//
// CACHE TOPOLOGIQUE (optimisation). Tout ce qui ne dépend que de la topologie et
// des positions de REPOS (angles de repos des charnières, raideur kθ, liste des
// membres d'un joint avec leurs directions de repos) est précalculé UNE fois par
// état de topologie (getBendCache), et jeté par invalidateIndex. Avant : refait
// à CHAQUE pas (atan2 sur les positions de repos, allocations de tableaux).

import { BENDING_STIFFNESS_DIVISOR } from "./config.js";
import { getMaterialById } from "../model/materials.js";
import { ensureIndex, findNodeById, findSegmentById, findBeamById, segmentsConnectedToNode } from "../model/Structure.js";

// Facteur qui rend un joint à 2 poutres alignées STRICTEMENT équivalent à une
// charnière interne. Démonstration : pour 2 membres de même raideur k, l'énergie
// "variance" vaut ¼·k·(rotation relative)². Une charnière interne vaut
// ½·kθ·angle². Comme la rotation relative = l'angle de coude, il faut ¼·k = ½·kθ,
// donc k = 2·kθ. (Ne pas régler : casse l'équivalence tronçons ↔ poutre entière.)
const JOINT_CONTINUITY_FACTOR = 2;

// Raideur d'une charnière (N·m/rad) : E·I / L, assouplie par le diviseur de
// flexion. I = épaisseur³/12 (section rectangulaire de 1 m de profondeur).
// Le CÂBLE a une rigidité de flexion NULLE : aucune charnière ne le maintient
// droit → sous compression il part en vrille (flambement total) comme une corde.
export function bendingStiffness(materialId, sectionArea, segLength) {
  if (materialId === "cable") return 0;
  const material = getMaterialById(materialId);
  if (!material || segLength === 0) return 0;
  const momentOfInertia = Math.pow(sectionArea, 3) / 12;
  return (material.youngModulus * momentOfInertia) / segLength / BENDING_STIFFNESS_DIVISOR;
}

// Angle de rotation (rad) entre p0→p1 et p1→p2 (0 = aligné). Réutilisé par rupture.js.
export function turningAngle(p0, p1, p2) {
  const e1x = p1.x - p0.x, e1y = p1.y - p0.y;
  const e2x = p2.x - p1.x, e2y = p2.y - p1.y;
  return Math.atan2(e1x * e2y - e1y * e2x, e1x * e2x + e1y * e2y);
}

// Ramène un angle dans (−π, π].
function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Repli RAPIDE pour un angle déjà dans (−2π, 2π) (différence de deux angles
// wrappés) : un simple ±2π, sans passer par sin/cos/atan2.
function wrapDiff(a) {
  if (a > Math.PI) return a - 2 * Math.PI;
  if (a < -Math.PI) return a + 2 * Math.PI;
  return a;
}

function addForce(forces, node, fx, fy) {
  if (node.fixed) return;
  const f = forces.get(node.id);
  if (f) {
    f.fx += fx;
    f.fy += fy;
  }
}

// ── Cache topologique de flexion ─────────────────────────────────────────────
// Précalcule, par état de topologie (jeté par invalidateIndex) :
//  - par poutre : ses nœuds (références), kθ, et les angles de coude AU REPOS ;
//  - par joint concerné : la liste de ses membres (adjacent, direction de repos
//    α, raideurs k et kRaw). Les joints en pivot pur (ancrés non encastrés) et
//    les joints à moins de membres que nécessaire ne figurent PAS dans la liste.
export function getBendCache(structure) {
  const token = ensureIndex(structure);
  let cache = structure._bendCache;
  if (cache && cache.token === token) return cache;

  const beams = [];
  const beamDataById = new Map();
  for (const beam of structure.beams) {
    const nodes = [];
    let ok = true;
    for (const id of beam.nodeIds) {
      const n = findNodeById(structure, id);
      if (!n) { ok = false; break; }
      nodes.push(n);
    }
    if (!ok) continue;
    const seg0 = findSegmentById(structure, beam.segIds[0]);
    const kTheta = bendingStiffness(beam.materialId, beam.sectionArea, seg0 ? seg0.restLength : 1);
    // Angles de coude AU REPOS (forme CONSTRUITE, imperfection comprise) : la
    // flexion ne pénalise que l'ÉCART À CE REPOS, pas l'écart au tout-droit.
    // Sinon l'imperfection de flambement (demi-sinus d'amplitude ∝ longueur →
    // COURBURE ∝ 1/longueur) compte comme une énorme contrainte sur les tronçons
    // COURTS : une travée découpée « prend cher » et casse alors qu'une poutre
    // entière (imperfection lisse) tient. Mesurer au repos rend une poutre
    // découpée IDENTIQUE à une poutre entière — et garde le germe de flambement.
    let restAngles = null;
    if (nodes.length >= 3) {
      restAngles = new Float64Array(nodes.length - 2);
      for (let i = 1; i < nodes.length - 1; i++) {
        restAngles[i - 1] = turningAngle(
          { x: nodes[i - 1].restX, y: nodes[i - 1].restY },
          { x: nodes[i].restX, y: nodes[i].restY },
          { x: nodes[i + 1].restX, y: nodes[i + 1].restY },
        );
      }
    }
    const entry = { beam, nodes, kTheta, restAngles };
    beams.push(entry);
    beamDataById.set(beam.id, entry);
  }

  const joints = [];
  const membersByJointId = new Map();
  for (const node of structure.nodes) {
    if (node.kind !== "joint") continue;
    // Appui ancré en PIVOT LIBRE : rotation libre → aucun ressort, aucun moment.
    if (node.fixed && !node.clamped) continue;
    const members = prepareJointMembers(structure, node);
    // Encastrement : une seule poutre suffit (console). Assemblage libre : ≥ 2.
    if (members.length < (node.fixed ? 1 : 2)) continue;
    joints.push({ joint: node, members, anchored: node.fixed === true });
    membersByJointId.set(node.id, members);
  }

  cache = { token, beams, joints, beamDataById, membersByJointId };
  structure._bendCache = cache;
  return cache;
}

// Membres (poutres) arrivant à un nœud "joint" : pour chacun, le nœud VOISIN (le
// 2e nœud de la poutre côté joint), la direction de REPOS absolue joint→voisin,
// et la raideur k = 2·kθ du segment d'extrémité. Appelé UNIQUEMENT à la
// construction du cache (getBendCache), plus jamais par pas.
function prepareJointMembers(structure, joint) {
  const segs = segmentsConnectedToNode(structure, joint.id);
  const members = [];
  for (const s of segs) {
    const adjId = s.nodeAId === joint.id ? s.nodeBId : s.nodeAId;
    const adj = findNodeById(structure, adjId);
    const beam = findBeamById(structure, s.beamId);
    if (!adj || !beam) continue;
    if (beam.isCable) continue; // un câble est ROTULÉ : il ne transmet aucun moment
    const rx = adj.restX - joint.restX, ry = adj.restY - joint.restY;
    // kRaw = kθ (raideur brute de charnière) : sert à l'ENCASTREMENT (rappel
    // absolu du membre, comme s'il prolongeait un mur rigide). k = 2·kθ sert à
    // l'assemblage libre (équivalence tronçons ↔ poutre entière, cf. plus haut).
    const kRaw = bendingStiffness(beam.materialId, beam.sectionArea, s.restLength);
    members.push({
      beam,
      adj,
      alpha: Math.atan2(ry, rx),
      k: JOINT_CONTINUITY_FACTOR * kRaw,
      kRaw,
      delta: 0, // rempli à chaque évaluation (rotation du membre depuis son repos)
    });
  }
  return members;
}

// Rotation d'ensemble du joint = moyenne CIRCULAIRE des rotations des membres
// (pondérée par k) ; remplit m.delta (rotation du membre depuis son repos).
function jointMeanRotation(joint, members) {
  let sumSin = 0, sumCos = 0;
  for (const m of members) {
    m.delta = wrapAngle(Math.atan2(m.adj.y - joint.y, m.adj.x - joint.x) - m.alpha);
    sumSin += m.k * Math.sin(m.delta);
    sumCos += m.k * Math.cos(m.delta);
  }
  return sumSin === 0 && sumCos === 0 ? 0 : Math.atan2(sumSin, sumCos);
}

// ── Application des forces de flexion (un appel par pas physique) ────────────
export function applyBending(structure, forces) {
  const cache = getBendCache(structure);

  // 1. Charnières INTERNES de chaque poutre : F = −kθ·(θ−θ₀)·∇θ, en forme fermée.
  for (const entry of cache.beams) {
    const { nodes, kTheta, restAngles } = entry;
    if (kTheta === 0 || !restAngles) continue;
    for (let i = 1; i < nodes.length - 1; i++) {
      const p0 = nodes[i - 1], p1 = nodes[i], p2 = nodes[i + 1];
      const e1x = p1.x - p0.x, e1y = p1.y - p0.y;
      const e2x = p2.x - p1.x, e2y = p2.y - p1.y;
      const l1 = e1x * e1x + e1y * e1y;
      const l2 = e2x * e2x + e2y * e2y;
      if (l1 < 1e-12 || l2 < 1e-12) continue; // segment dégénéré : pas de coude défini
      const theta = Math.atan2(e1x * e2y - e1y * e2x, e1x * e2x + e1y * e2y);
      const g = kTheta * wrapDiff(theta - restAngles[i - 1]); // moment du ressort
      // ∇p0 θ = e1⊥/|e1|², ∇p2 θ = e2⊥/|e2|², ∇p1 θ = −(∇p0 + ∇p2), F = −g·∇θ.
      const f0x = g * (e1y / l1), f0y = -g * (e1x / l1);
      const f2x = g * (e2y / l2), f2y = -g * (e2x / l2);
      addForce(forces, p0, f0x, f0y);
      addForce(forces, p2, f2x, f2y);
      addForce(forces, p1, -(f0x + f2x), -(f0y + f2y));
    }
  }

  // 2. Assemblages (joints encastrés ou libres à ≥ 2 membres).
  for (const j of cache.joints) {
    if (j.anchored) applyClampedJoint(forces, j.joint, j.members);
    else applyRigidJoint(forces, j.joint, j.members);
  }
}

// Appui ENCASTRÉ : E = ½·Σ kθ·(écart à la direction de REPOS ABSOLUE)². Le nœud
// étant fixe (position figée), le moment se traduit en force de rappel sur les
// nœuds VOISINS (comportement de console). F_adj = −kRaw·dev·r⊥/|r|².
function applyClampedJoint(forces, joint, members) {
  for (const m of members) {
    const rx = m.adj.x - joint.x, ry = m.adj.y - joint.y;
    const r2 = rx * rx + ry * ry;
    if (r2 < 1e-12) continue;
    const dev = wrapAngle(Math.atan2(ry, rx) - m.alpha);
    const g = m.kRaw * dev;
    addForce(forces, m.adj, g * (ry / r2), -g * (rx / r2));
  }
}

// Assemblage RIGIDE à rotation libre : E = ½·Σ k·(δ − θ̄)², invariante par
// translation ET rotation globale (θ̄ = moyenne circulaire pondérée). Gradient
// avec la règle de la chaîne complète (θ̄ dépend des δ) :
//   ∂E/∂δⱼ = kⱼ·devⱼ − D·kⱼ·cos(devⱼ)/R   (D = Σ k·dev, R = |Σ k·e^{iδ}|)
// puis ∇_adj δⱼ = r⊥/|r|², ∇_joint δⱼ = −r⊥/|r|².
function applyRigidJoint(forces, joint, members) {
  let sumSin = 0, sumCos = 0;
  for (const m of members) {
    const rx = m.adj.x - joint.x, ry = m.adj.y - joint.y;
    m._rx = rx;
    m._ry = ry;
    m._r2 = rx * rx + ry * ry;
    m.delta = wrapAngle(Math.atan2(ry, rx) - m.alpha);
    sumSin += m.k * Math.sin(m.delta);
    sumCos += m.k * Math.cos(m.delta);
  }
  const theta = sumSin === 0 && sumCos === 0 ? 0 : Math.atan2(sumSin, sumCos);
  const R = Math.hypot(sumSin, sumCos);

  let D = 0;
  for (const m of members) {
    m._dev = wrapDiff(m.delta - theta);
    D += m.k * m._dev;
  }

  let fjx = 0, fjy = 0;
  for (const m of members) {
    if (m._r2 < 1e-12) continue;
    let g = m.k * m._dev;
    if (R > 1e-9) g -= (D * m.k * Math.cos(m._dev)) / R;
    // ∇_adj δ = r⊥/|r|² avec r⊥ = (−ry, rx) ; F = −g·∇δ.
    const px = -m._ry / m._r2, py = m._rx / m._r2;
    addForce(forces, m.adj, -g * px, -g * py);
    fjx += g * px;
    fjy += g * py;
  }
  addForce(forces, joint, fjx, fjy);
}

// ── Énergies (pour la VÉRIFICATION numérique et l'équivalence des modèles) ───
// Somme de toutes les énergies de flexion de la structure. Les forces
// analytiques ci-dessus doivent être −∇ de cette fonction : le script de
// vérification compare F et les différences finies de totalBendingEnergy.
export function totalBendingEnergy(structure) {
  const cache = getBendCache(structure);
  let E = 0;
  for (const entry of cache.beams) {
    const { nodes, kTheta, restAngles } = entry;
    if (kTheta === 0 || !restAngles) continue;
    for (let i = 1; i < nodes.length - 1; i++) {
      const d = wrapAngle(turningAngle(nodes[i - 1], nodes[i], nodes[i + 1]) - restAngles[i - 1]);
      E += 0.5 * kTheta * d * d;
    }
  }
  for (const j of cache.joints) {
    if (j.anchored) {
      for (const m of j.members) {
        const cur = Math.atan2(m.adj.y - j.joint.y, m.adj.x - j.joint.x);
        const dev = wrapAngle(cur - m.alpha);
        E += 0.5 * m.kRaw * dev * dev;
      }
    } else {
      const theta = jointMeanRotation(j.joint, j.members);
      for (const m of j.members) {
        const dev = wrapAngle(m.delta - theta);
        E += 0.5 * m.k * dev * dev;
      }
    }
  }
  return E;
}

// ── Taux de travail en flexion d'un ASSEMBLAGE, attribué à une poutre ─────────
// Pour que l'affichage du % et la RUPTURE d'une poutre découpée en tronçons
// collent à ceux d'une poutre entière : le moment de coude au joint (M = k·écart,
// soit kθ·angle pour 2 membres alignés) est rapporté à la poutre, à son nœud
// interne le plus proche du joint. Renvoie { util, breakIndex }.
export function beamEndJointUtil(structure, beam) {
  const ids = beam.nodeIds;
  const material = getMaterialById(beam.materialId);
  if (!material || material.tensileStrength <= 0) return { util: 0, breakIndex: null };
  const cache = getBendCache(structure);

  // Une poutre à 1 segment (≈ 1 m) ne fléchit qu'à ses joints : ce terme est sa
  // SEULE flexion. Sans nœud interne, elle casse net (breakIndex = -1).
  const single = ids.length < 3;
  let best = { util: 0, breakIndex: null };
  for (const atStart of [true, false]) {
    const jointId = atStart ? ids[0] : ids[ids.length - 1];
    const joint = findNodeById(structure, jointId);
    if (!joint || joint.kind !== "joint") continue;
    // Le cache ne contient que les joints qui transmettent un moment (pas les
    // pivots purs, pas les extrémités libres à < 2 membres) : sinon rien à faire.
    const members = cache.membersByJointId.get(jointId);
    if (!members) continue;
    const mine = members.find((m) => m.beam.id === beam.id);
    if (!mine) continue;

    let moment;
    if (joint.fixed) {
      // Encastrement : moment = kθ · écart à la direction de REPOS absolue.
      const cur = Math.atan2(mine.adj.y - joint.y, mine.adj.x - joint.x);
      const dev = wrapAngle(cur - mine.alpha);
      moment = Math.abs(mine.kRaw * dev);
    } else {
      // Assemblage libre : moment = k · écart à la rotation d'ensemble.
      const theta = jointMeanRotation(joint, members);
      const dev = wrapAngle(mine.delta - theta);
      moment = Math.abs(mine.k * dev);
    }
    const stress = (6 * moment) / (beam.sectionArea * beam.sectionArea);
    const util = stress / material.tensileStrength;
    const breakIndex = single ? -1 : atStart ? 1 : ids.length - 2;
    if (util > best.util) best = { util, breakIndex };
  }
  return best;
}
