/*
 * stockage/prereglages_personnels.js
 * ──────────────────────────────────
 * Les préréglages qu'on enregistre depuis le panneau de droite restent sur le
 * poste : ils décrivent CETTE imprimante avec CETTE bobine, calibrées ici. Ils
 * n'ont aucun sens sur un autre poste et n'ont donc rien à faire dans le projet
 * ni sur le site.
 *
 * localStorage peut être absent, plein ou refusé (navigation privée, poste
 * verrouillé) : les préréglages valent alors pour la séance, et l'atelier
 * continue de marcher.
 */

import { SOURCES } from "../noyau/reglages_impression.js";

const CLE = "atelier-3d:prereglages";
const FORMAT = 1;

/* Rend { imprimante: [...], buse: [...], … } — jamais null. */
export function lireLesPrereglagesPersonnels() {
  const vide = Object.fromEntries(SOURCES.map(({ id }) => [id, []]));
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "null");
    if (brut === null || brut.format !== FORMAT) return vide;
    for (const { id } of SOURCES) {
      if (Array.isArray(brut.parSource?.[id])) vide[id] = brut.parSource[id];
    }
    return vide;
  } catch (_erreur) {
    return vide;
  }
}

/* Rend false si le navigateur a refusé : l'appelant le dit à l'utilisateur. */
export function ecrireLesPrereglagesPersonnels(parSource) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ format: FORMAT, parSource }));
    return true;
  } catch (_erreur) {
    return false;
  }
}
