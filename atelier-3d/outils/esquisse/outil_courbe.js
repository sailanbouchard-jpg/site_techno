/*
 * outils/esquisse/outil_courbe.js
 * Une courbe libre (spline) : chaque clic pose un point par lequel elle passe.
 * Entrée, ou un double-clic, la termine ; un clic sur son premier point la
 * referme. Retour arrière retire le dernier point, Échap abandonne. Les
 * points restent dans l'esquisse : les tirer remodèle la courbe, les coter
 * la fixe.
 */

import { ajouterSpline, pointsDeSpline, distance } from "../../noyau/esquisse/elements_esquisse.js";
import { outilDeTrace } from "./options_esquisse.js";

// Deux clics à moins de ça, en pixels et en millisecondes, font un double-clic.
const DOUBLE_CLIC_MS = 350;
const TOLERANCE_FERMETURE_PX = 8;

let points = [];          // [{ uv, id }]
let dernier = null;
let dernierClic = 0;

function terminer(contexte) {
  points = [];
  contexte.esquisse.apercu([]);
  contexte.mesurer(null);
}

function valider(contexte, ferme = false) {
  const poses = points;
  if (poses.length < (ferme ? 3 : 2)) {
    terminer(contexte);
    return;
  }
  contexte.esquisse.modifier((contenu) => {
    const reprendre = (p) => (p.id !== null && p.id in contenu.points ? p.id : p.uv);
    return ajouterSpline(contenu, poses.map(reprendre), ferme).contenu;
  }, ferme ? "Courbe fermée" : "Courbe");
  terminer(contexte);
}

function montrer(contexte) {
  if (dernier === null) return;
  contexte.esquisse.montrer(dernier);
  if (points.length === 0) return;
  const passages = [...points.map((p) => p.uv), dernier.uv];
  contexte.esquisse.apercu([{ points: pointsDeSpline(passages, false) }]);
  contexte.mesurer("Courbe : " + points.length + (points.length > 1 ? " points" : " point")
    + ". Entrée ou double-clic : terminer ; clic sur le premier point : refermer.");
}

export default outilDeTrace({
  nom: "courbe",
  etiquette: "Courbe libre",
  termeDuProgramme: "courbe spline",
  aide: "Une courbe douce qui passe par les points cliqués. Entrée ou double-clic pour terminer, clic sur le premier point pour la refermer. Ses points se déplacent ensuite pour la remodeler.",
  raccourci: "",

  desactiver: terminer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const vise = contexte.esquisse.accrocher(evenement, { depuis: points.at(-1)?.uv ?? null });
    if (vise === null) return;
    dernier = vise;
    const maintenant = performance.now();
    const double = maintenant - dernierClic < DOUBLE_CLIC_MS;
    dernierClic = maintenant;
    if (double && points.length >= 2) {
      valider(contexte);
      return;
    }
    // Un clic sur le premier point referme la courbe.
    if (points.length >= 3 && distance(vise.uv, points[0].uv) < TOLERANCE_FERMETURE_PX * (vise.mmParPixel ?? 0.1)) {
      valider(contexte, true);
      return;
    }
    if (points.length === 0 || distance(vise.uv, points.at(-1).uv) > 1e-6) points.push({ uv: vise.uv, id: vise.idPoint });
    montrer(contexte);
  },

  surDeplacement(evenement, contexte) {
    const vise = contexte.esquisse.accrocher(evenement, { depuis: points.at(-1)?.uv ?? null });
    if (vise === null) return;
    dernier = vise;
    montrer(contexte);
  },

  surTouche(evenement, contexte) {
    if (points.length === 0) return false;
    if (evenement.key === "Enter") {
      valider(contexte);
      return true;
    }
    if (evenement.key === "Backspace") {
      points.pop();
      if (points.length === 0) terminer(contexte);
      else montrer(contexte);
      return true;
    }
    if (evenement.key === "Escape") {
      terminer(contexte);
      return true;
    }
    return false;
  },
});
