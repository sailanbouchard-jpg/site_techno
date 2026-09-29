/*
 * stockage/combinaisons_enregistrees.js
 * ─────────────────────────────────────
 * Les combinaisons de calibration restent sur le poste : elles décrivent CETTE
 * imprimante avec CETTE bobine, elles n'ont aucun sens sur un autre poste et
 * n'ont donc rien à faire dans le projet ni sur le site.
 *
 * localStorage peut être absent, plein ou refusé (navigation privée, poste
 * verrouillé) : dans ce cas les combinaisons valent pour la séance, et
 * l'atelier continue de marcher.
 */

import { combinaisonDepuisBrut, FORMAT } from "../noyau/combinaisons.js";

const CLE = "atelier-3d:combinaisons";
// L'ancienne clé, quand les résultats d'essais n'appartenaient encore à aucune
// combinaison : ils sont repris dans la première créée.
const CLE_ANCIENNE = "atelier-3d:calibration";

export function lireLesCombinaisons() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "null");
    if (brut === null || brut.format !== FORMAT || !Array.isArray(brut.combinaisons)) return [];
    return brut.combinaisons.map(combinaisonDepuisBrut).filter((c) => c !== null);
  } catch (_erreur) {
    return [];
  }
}

export function ecrireLesCombinaisons(combinaisons) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ format: FORMAT, combinaisons }));
    return true;
  } catch (_erreur) {
    return false;
  }
}

/* Les essais conclus avant qu'il y ait des combinaisons, pour ne pas les perdre. */
export function lireLesAnciensResultats() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_ANCIENNE) ?? "null");
    return brut !== null && typeof brut === "object" ? brut : {};
  } catch (_erreur) {
    return {};
  }
}

export function oublierLesAnciensResultats() {
  try {
    localStorage.removeItem(CLE_ANCIENNE);
  } catch (_erreur) {
    // Rien à faire : au pire ils seront repris une seconde fois.
  }
}
