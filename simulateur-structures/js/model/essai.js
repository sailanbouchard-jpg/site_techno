// model/essai.js
// ──────────────
// L'ARBITRE d'un essai. Règle unique, la même pour tous les niveaux :
//   le pont est validé si TOUS les véhicules atteignent le bout de la route
//   d'accès d'en face SANS qu'une seule poutre ne casse.
// Une fois validé, la note ne dépend que d'une chose : la MASSE du pont (ce que
// le joueur a posé en plus de l'énoncé) — 3 étoiles au plus léger.
//
// Le verdict n'interrompt rien : la simulation tourne tant que le joueur ne
// l'arrête pas, et le résultat s'affiche sur le côté (ui/levelHud.js).
//
// Ce fichier ne touche ni au DOM ni au dessin : il lit l'état de la simulation
// et rend un verdict.

import { state } from "../state.js";
import { DUREE_MAX_ESSAI, massePont, etoilesPour } from "./levels.js";
import { getCurrentRoadSegment, positionChute } from "../physics/vehicleMotion.js";

export const ESSAI = {
  AUCUN: "aucun",
  EN_COURS: "en-cours",
  REUSSI: "reussi",
  ECHOUE: "echoue",
};

export function essaiVierge() {
  return { statut: ESSAI.AUCUN, raison: "", masse: 0, etoiles: 0, immobileDepuis: null };
}

// Un véhicule arrêté au bord du vide n'ira jamais plus loin : inutile d'attendre
// la fin du chrono pour le dire. On laisse quand même passer un court arrêt (un
// véhicule qui patine sur une bosse redémarre).
const ARRET_TOLERE = 2; // secondes simulées

// Appelé au lancement du test (bouton Tester), après l'instantané.
export function demarrerEssai() {
  state.essai = state.niveauCourant
    ? { statut: ESSAI.EN_COURS, raison: "", masse: massePont(state.structure), etoiles: 0, immobileDepuis: null }
    : essaiVierge();
}

export function annulerEssai() {
  state.essai = essaiVierge();
}

// Abscisse (m) du véhicule, ou null s'il n'est plus sur une route (sa poutre a
// disparu) — ce qui veut dire qu'il est tombé avec elle.
function abscisseVehicule(structure, vehicle) {
  const chute = positionChute(vehicle);
  if (chute) return chute.x;
  const segment = getCurrentRoadSegment(vehicle, structure);
  if (!segment.nodeA || !segment.nodeB) return null;
  return segment.nodeA.x + (segment.nodeB.x - segment.nodeA.x) * segment.fraction;
}

// L'ARBITRAGE PUR, sans état global : la même règle sert à la partie en cours et
// à la vérification d'une solution par l'administrateur (ui/levelEditor.js).
// `memoire` est un objet de travail où l'on note l'instant d'immobilisation.
export function examiner(structure, niveau, tempsSimule, memoire) {
  if (structure.beams.some((beam) => beam.broken)) {
    return { statut: ESSAI.ECHOUE, raison: "Le pont a cédé." };
  }

  let enRoute = false;
  let quelquUnAvance = false;
  for (const vehicle of structure.mobileLoads) {
    // Arrivé au drapeau : plus rien ne peut lui arriver, on passe.
    if (vehicle.state === "arrive") continue;
    const x = abscisseVehicule(structure, vehicle);
    if (x === null) return { statut: ESSAI.ECHOUE, raison: "Un véhicule est tombé." };
    // Sans drapeau planté, l'arrivée est le bout de la route d'en face : un
    // véhicule qui l'a dépassé a fait son travail, même s'il bascule ensuite.
    if (x >= niveau.xArrivee - 0.5) continue;
    if (vehicle.state === "chute") {
      return { statut: ESSAI.ECHOUE, raison: "Un véhicule est tombé : la route s'arrête dans le vide." };
    }
    enRoute = true;
    if (vehicle.pathVelocity > 0.05) quelquUnAvance = true;
  }

  if (!enRoute) return { statut: ESSAI.REUSSI, raison: "" };

  if (tempsSimule > DUREE_MAX_ESSAI) {
    return { statut: ESSAI.ECHOUE, raison: "Un véhicule n'est jamais arrivé de l'autre côté." };
  }

  // Bloqué : la route s'arrête avant l'autre rive (ou le pont s'est affaissé
  // sous les roues). On attend `ARRET_TOLERE` avant de trancher.
  if (!structure._settled || quelquUnAvance) {
    memoire.immobileDepuis = null;
    return { statut: ESSAI.EN_COURS };
  }
  if (memoire.immobileDepuis === null || memoire.immobileDepuis === undefined) {
    memoire.immobileDepuis = tempsSimule;
    return { statut: ESSAI.EN_COURS };
  }
  if (tempsSimule - memoire.immobileDepuis > ARRET_TOLERE) {
    return { statut: ESSAI.ECHOUE, raison: "Un véhicule est resté bloqué : la route ne va pas jusqu'en face." };
  }
  return { statut: ESSAI.EN_COURS };
}

// Appelé à chaque image pendant la simulation. Ne fait rien tant que l'essai
// n'est pas tranché ; dès qu'il l'est, il fige le verdict (et le rendu de l'UI
// s'en occupe).
export function observerEssai() {
  const essai = state.essai;
  if (essai.statut !== ESSAI.EN_COURS) return;
  const niveau = state.niveauCourant;
  const verdict = examiner(state.structure, niveau, state.simulationTime, essai);
  if (verdict.statut === ESSAI.EN_COURS) return;
  if (verdict.statut === ESSAI.REUSSI) {
    const masse = massePont(state.structure);
    conclure(ESSAI.REUSSI, "", masse, etoilesPour(niveau, masse));
  } else {
    conclure(ESSAI.ECHOUE, verdict.raison);
  }
}

// Par défaut, la masse retenue est celle RELEVÉE au lancement : après une
// rupture la structure n'est plus qu'un tas de morceaux, sa masse courante ne
// veut plus rien dire.
function conclure(statut, raison, masse = state.essai.masse, etoiles = 0) {
  state.essai = { statut, raison, masse, etoiles, immobileDepuis: null };
}
