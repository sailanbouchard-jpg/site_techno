// physics/solveur.js
// ──────────────────
// RÉGLAGE AUTOMATIQUE DU SOLVEUR : quel pas de temps cette scène-ci permet-elle,
// et faut-il l'aider à tenir la cadence ?
//
// LE PROBLÈME. L'intégration explicite (integrator.js) diverge dès que le pas
// dépasse 2/ω, où ω = √(raideur/masse) est la pulsation propre la plus haute de
// la scène. Ce plafond ne dépend pas du NOMBRE de poutres : il est fixé par
// l'élément le plus raide rapporté à sa masse — en pratique la FLEXION d'une
// poutre épaisse (béton large : ω ≈ 940 rad/s, donc 2 ms). Un pas figé à 0,5 ms
// devait convenir au pire cas imaginable : une scène tout en bois (ω ≈ 450)
// payait quatre fois trop cher, et une grosse scène ne tenait plus la cadence.
//
// DEUX LEVIERS, du plus honnête au plus arrangeant :
//
//  1. PAS DE TEMPS ADAPTATIF (toujours actif, aucun compromis). On mesure ω sur
//     la scène réelle et on prend dt = MARGE_STABILITE · 2/ω. La physique est
//     identique — seule l'erreur d'intégration change, et elle est sans objet
//     ici : on relaxe vers un ÉQUILIBRE, dont la position ne dépend pas du pas.
//     (Mesuré sur un viaduc de 75 poutres : 1,5 mm d'écart sur 169 mm de flèche.)
//
//  2. MISE À L'ÉCHELLE DES MASSES (surtout en scène LOURDE). On ajoute de
//     l'INERTIE — et rien que de l'inertie, jamais du poids — aux quelques nœuds
//     qui tirent ω vers le haut, jusqu'à ramener leur pulsation à OMEGA_CIBLE.
//     C'est la technique classique des codes de calcul explicites (« mass
//     scaling »), et elle est légitime ici pour une raison simple : un ÉQUILIBRE
//     STATIQUE ne dépend d'AUCUNE masse d'inertie. Flèches, efforts, taux de
//     travail, ruptures : inchangés. Seul le transitoire de mise en charge est
//     ralenti pour ces nœuds — or c'est déjà une relaxation fortement amortie,
//     dont personne ne regarde le détail.
//     Le poids, lui, reste calculé sur la VRAIE masse (loads.js) : la structure
//     porte exactement ce qu'elle portait.
//     Contrepartie assumée : un débris qui se détache a le vrai poids et une
//     inertie gonflée, donc il tombe un peu au ralenti. D'où FACTEUR_INERTIE_MAX,
//     qui borne l'effet (et, sous ce plafond, on raccourcit le pas au lieu
//     d'alourdir davantage). En pratique la chute est de toute façon plafonnée à
//     MAX_NODE_SPEED : le débris met un peu plus longtemps à atteindre ce
//     plafond, c'est tout.
//     Hors scène lourde, ce levier ne sert qu'à tenir un PLANCHER de pas : après
//     une rupture, les débris sont des tronçons courts donc très raides pour leur
//     masse (ω ∝ 1/longueur²), et sans cela le pas — donc le coût — s'effondrerait
//     juste au moment de l'effondrement.
//
// Tout est recalculé UNE fois par état de topologie (comme les autres caches :
// jeté par invalidateIndex), jamais par pas.

import { ensureIndex } from "../model/Structure.js";
import { preparerMasses } from "./mass.js";
import { getBendCache } from "./bending.js";
import {
  MARGE_STABILITE, PHYSICS_DT_MIN, PHYSICS_DT_MAX,
  SEUIL_SCENE_LOURDE, OMEGA_CIBLE_ALLEGE, OMEGA_CIBLE_NORMALE, FACTEUR_INERTIE_MAX,
  EFFORT_SCAN_PERIOD, EFFORT_SCAN_PERIOD_ALLEGE,
} from "./config.js";

// Réglage courant de la scène : { dt, lourde, noeudsAlourdis, omegaMax, pasParScan }.
// Le résultat est mis en cache sur la structure et réutilisé tant que la
// topologie ne change pas. Remplit aussi node._masseInertie sur chaque nœud.
export function reglerSolveur(structure) {
  const token = ensureIndex(structure);
  const cache = structure._solveur;
  if (cache && cache.token === token) return cache;

  preparerMasses(structure); // node._masse = masse VRAIE (poids et inertie de base)
  const raideurs = raideursEquivalentes(structure);
  const lourde = structure.segments.length >= SEUIL_SCENE_LOURDE;
  // Scène ordinaire : on n'alourdit que ce qu'il faut pour ne jamais descendre
  // sous le pas d'avant (débris courts après rupture). Scène lourde : on vise
  // bien plus bas, pour gagner un pas ~5× plus long.
  const omegaCible = lourde ? OMEGA_CIBLE_ALLEGE : OMEGA_CIBLE_NORMALE;

  let omegaMax = 0;
  let noeudsAlourdis = 0;
  for (const node of structure.nodes) {
    node._masseInertie = node._masse;
    if (node.fixed) continue;
    const k = raideurs.get(node.id) || 0;
    let omega = Math.sqrt(k / node._masse);
    if (omega > omegaCible) {
      // Inertie juste suffisante pour ramener ω à la cible, sans dépasser le
      // plafond (au-delà, c'est le pas qui cède, pas la masse).
      const facteur = Math.min((omega / omegaCible) ** 2, FACTEUR_INERTIE_MAX);
      node._masseInertie = node._masse * facteur;
      omega = Math.sqrt(k / node._masseInertie);
      noeudsAlourdis += 1;
    }
    if (omega > omegaMax) omegaMax = omega;
  }

  const dt = omegaMax > 0
    ? Math.min(PHYSICS_DT_MAX, Math.max(PHYSICS_DT_MIN, (MARGE_STABILITE * 2) / omegaMax))
    : PHYSICS_DT_MAX;
  const periodeScan = lourde ? EFFORT_SCAN_PERIOD_ALLEGE : EFFORT_SCAN_PERIOD;

  const reglage = {
    token,
    dt,
    lourde,
    noeudsAlourdis,
    omegaMax: Math.round(omegaMax),
    pasParScan: Math.max(1, Math.round(periodeScan / dt)),
  };
  structure._solveur = reglage;
  return reglage;
}

// Pas de temps que cette scène permet (raccourci du réglage ci-dessus).
export function pasDeTemps(structure) {
  return reglerSolveur(structure).dt;
}

// Raideur de RAPPEL équivalente de chaque nœud (N/m) : ce à quoi il est retenu
// s'il s'écarte un peu de sa place. C'est elle qui, rapportée à la masse, donne
// la pulsation propre — donc le pas de temps admissible.
//   • axial : la raideur de chaque sous-élément qui y aboutit ;
//   • flexion : une charnière de raideur kθ reliée par un bras de levier L
//     rappelle latéralement comme un ressort de 4·kθ/L². C'est de loin le terme
//     dominant pour les poutres épaisses (kθ ∝ épaisseur³), et donc le vrai
//     responsable du pas de temps.
function raideursEquivalentes(structure) {
  const k = new Map();
  const ajouter = (id, valeur) => k.set(id, (k.get(id) || 0) + valeur);
  for (const segment of structure.segments) {
    ajouter(segment.nodeAId, segment.stiffness);
    ajouter(segment.nodeBId, segment.stiffness);
  }

  const cache = getBendCache(structure);
  for (const entry of cache.beams) {
    if (!entry.kTheta || entry.nodes.length < 3) continue;
    const a = entry.nodes[0], b = entry.nodes[1];
    const L = Math.hypot(b.restX - a.restX, b.restY - a.restY) || 1;
    const kLateral = (4 * entry.kTheta) / (L * L);
    for (const node of entry.nodes) ajouter(node.id, kLateral);
  }
  for (const j of cache.joints) {
    for (const membre of j.members) {
      const L = Math.hypot(membre.adj.restX - j.joint.restX, membre.adj.restY - j.joint.restY) || 1;
      const kLateral = membre.k / (L * L);
      ajouter(membre.adj.id, kLateral);
      ajouter(j.joint.id, kLateral);
    }
  }
  return k;
}
