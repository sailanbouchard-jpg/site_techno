// ui/beamTypeSelect.js
// ─────────────────────
// Rôle : composant partagé qui remplit un élément <select> avec le catalogue
// de types de poutres (model/materials.js::BEAM_TYPES). Utilisé à la fois par
// la barre d'outils (type de poutre courant pour les nouvelles poutres) et
// par l'inspecteur (modifier le type d'une poutre existante), pour garantir
// que les deux endroits proposent TOUJOURS exactement les mêmes options.
//
// Chaque appelant garde la responsabilité de fixer `.value` et de brancher son
// propre écouteur "change" (les deux endroits réagissent différemment à un
// changement : l'un met à jour state.currentBeamTypeId, l'autre modifie une
// poutre déjà créée) — seule la LISTE D'OPTIONS est partagée ici.
//
// Ne doit PAS contenir : de formule physique, de logique d'état.
// Dépendances : model/materials.js.

import { BEAM_TYPES } from "../model/materials.js";

export function populateBeamTypeSelect(select) {
  select.innerHTML = "";
  for (const beamType of BEAM_TYPES) {
    const option = document.createElement("option");
    option.value = beamType.id;
    option.textContent = beamType.label;
    select.appendChild(option);
  }
}
