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

import { typesPoutreProposes } from "../state.js";
import { getBeamTypeById } from "../model/materials.js";

// `idCourant` : type de la poutre qu'on est en train de regarder. On l'ajoute
// toujours à la liste, même si le niveau l'interdit — sinon l'inspecteur d'une
// poutre de l'énoncé (la route, par exemple) afficherait un autre type que le sien.
export function populateBeamTypeSelect(select, idCourant = null) {
  select.innerHTML = "";
  const proposes = typesPoutreProposes();
  const courant = getBeamTypeById(idCourant);
  if (courant && !proposes.includes(courant)) proposes.push(courant);
  for (const beamType of proposes) {
    const option = document.createElement("option");
    option.value = beamType.id;
    option.textContent = beamType.label;
    select.appendChild(option);
  }
}
