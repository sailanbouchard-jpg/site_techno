// ui/statusBar.js
// ───────────────
// La BARRE D'ÉTAT, en bas de la fenêtre : consigne courte de l'outil ou de
// l'essai en cours, coordonnées du point visé, zoom et temps simulé. C'est elle
// qui guide l'utilisateur, plutôt que des paragraphes permanents.
//
// Coordonnées : x en mètres, y = hauteur au-dessus du bas de la grille (on lit
// « en montant »), comme sur les règles graduées. Rafraîchie à 10 Hz par main.js.

import { state, MODES, TOOLS } from "../state.js";
import { reglerSolveur } from "../physics/solveur.js";
import { getBeamTypeById } from "../model/materials.js";
import { gridToWorld } from "../model/mesh.js";
import { ESSAI } from "../model/essai.js";
import { heightAbove } from "../render/rulers.js";
import { formatDecimal } from "../units.js";

const CONSIGNES = {
  [TOOLS.SELECT]: "Sélection : cliquer un élément pour afficher ses propriétés, glisser un nœud pour le déplacer.",
  [TOOLS.TERRAIN]: "Sol : cliquer les points du haut du relief.",
  [TOOLS.ANCHOR]: "Appui : cliquer un point du maillage ou l'extrémité d'une poutre.",
  [TOOLS.ADD_WEIGHT]: "Poids : cliquer un nœud ou une poutre.",
  [TOOLS.ADD_CAR]: "Voiture : cliquer une poutre de route.",
  [TOOLS.ARRIVEE]: "Arrivée : cliquer un point de la route où les véhicules doivent parvenir.",
  [TOOLS.ADD_VAN]: "Camionnette : cliquer une poutre de route.",
  [TOOLS.ADD_TRUCK]: "Camion : cliquer une poutre de route.",
};

export function majBarreEtat() {
  ecrire("etat-message", consigne());
  ecrire("etat-solveur", solveur());
  ecrire("etat-coordonnees", coordonnees());
  ecrire("etat-zoom", `Zoom ${Math.round(state.zoomLevel * 100)} %`);
  ecrire("etat-temps", `t = ${formatDecimal(state.simulationTime, 2)} s`);
}

function ecrire(id, texte) {
  const el = document.getElementById(id);
  if (el && el.textContent !== texte) el.textContent = texte;
}

// Ce que le solveur a dû consentir pour cette scène — affiché seulement quand
// c'est vrai, et seulement pendant un essai :
//   « Calcul allégé » : la scène est assez grosse pour que le solveur ait ajouté
//     de l'inertie aux nœuds les plus raides afin d'allonger son pas de temps
//     (physics/solveur.js). Flèches, efforts, taux de travail et ruptures sont
//     les mêmes ; seule la mise en charge est un peu plus molle.
//   « Ralenti ×0,4 » : la machine ne tient pas le temps réel, la simulation va au
//     ralenti. Le pont se comporte pareil — il met juste plus longtemps à le
//     montrer. Le dire évite de prendre un ralentissement pour un blocage.
function solveur() {
  if (state.mode !== MODES.SIMULATION) return "";
  const cases = [];
  if (reglerSolveur(state.structure).lourde) cases.push("Calcul allégé");
  const cadence = state.cadenceReelle;
  if (cadence < 0.8) cases.push(`Ralenti ×${formatDecimal(cadence, cadence < 0.1 ? 2 : 1)}`);
  return cases.join("   ");
}

function consigne() {
  if (state.mode === MODES.SIMULATION) {
    if (state.essai.statut === ESSAI.REUSSI) return "Essai terminé : pont validé.";
    if (state.essai.statut === ESSAI.ECHOUE) return `Essai terminé : ${state.essai.raison}`;
    return state.isRunning ? "Essai de charge en cours." : "Essai en pause.";
  }
  if (state.currentTool === TOOLS.ADD_BEAM) {
    const type = getBeamTypeById(state.currentBeamTypeId);
    const nom = type ? type.label : "Poutre";
    return state.pendingBeamFirstGrid
      ? `${nom} : cliquer le point d'arrivée. Échap pour interrompre la pose.`
      : `${nom} : cliquer le point de départ.`;
  }
  return CONSIGNES[state.currentTool] || "Prêt";
}

function coordonnees() {
  const p = state.hoverGrid ? gridToWorld(state.hoverGrid.i, state.hoverGrid.j) : state.pointer;
  if (!p) return "";
  return `x = ${formatDecimal(p.x, 2)} m    y = ${formatDecimal(heightAbove(p.y), 2)} m`;
}
