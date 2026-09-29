/*
 * outils/esquisse/outil_gomme.js
 * Un clic efface le tracé visé ; un glisser efface tout ce qu'il touche, en
 * une seule annulation.
 */

import { supprimerCourbes } from "../../noyau/esquisse/elements_esquisse.js";
import { courbeSous, pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace } from "./options_esquisse.js";

const TOLERANCE_PX = 6;

let effaces = null;       // Set des tracés touchés pendant le geste

function montrer(contexte, ids) {
  const contenu = contexte.esquisse.contenu();
  if (contenu === null) return;
  const traces = contenu.courbes
    .filter((c) => ids.has(c.id))
    .map((c) => ({ points: pointsDeCourbe(contenu, c), genre: "gomme" }));
  contexte.esquisse.apercu(traces);
}

function toucher(evenement, contexte) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  return courbeSous(contenu, vise.uv, TOLERANCE_PX * vise.mmParPixel);
}

function arreter(contexte) {
  effaces = null;
  contexte.esquisse.apercu([]);
}

export default outilDeTrace({
  nom: "gomme",
  etiquette: "Gomme",
  termeDuProgramme: "effacer un tracé",
  aide: "Efface le tracé cliqué, ou tout ce que touche un glisser.",
  raccourci: "E",
  groupe: "modification",
  curseur: "default",

  desactiver: arreter,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    effaces = new Set();
    const id = toucher(evenement, contexte);
    if (id !== null) effaces.add(id);
    montrer(contexte, effaces);
    contexte.capturer(evenement.pointerId);
  },

  surDeplacement(evenement, contexte) {
    const id = toucher(evenement, contexte);
    if (effaces === null) {
      montrer(contexte, new Set(id === null ? [] : [id]));
      return;
    }
    if (id !== null && !effaces.has(id)) {
      effaces.add(id);
      montrer(contexte, effaces);
    }
  },

  surRelache(_evenement, contexte) {
    if (effaces === null) return;
    const ids = [...effaces];
    arreter(contexte);
    if (ids.length > 0) contexte.esquisse.modifier((contenu) => supprimerCourbes(contenu, ids), "Effacer");
  },

  surTouche(evenement, contexte) {
    if (effaces !== null && evenement.key === "Escape") {
      arreter(contexte);
      return true;
    }
    return false;
  },
});
