/*
 * outils/esquisse/outil_pinceau.js
 * Tracé à main levée : on dessine en maintenant le bouton, et au relâcher le
 * geste est simplifié en segments et en arcs, qu'on pourra reprendre point
 * par point. Un geste qui revient à son départ se referme tout seul.
 */

import { ajouterPolyligne, distance } from "../../noyau/esquisse/elements_esquisse.js";
import { simplifierTrace } from "../../noyau/esquisse/simplification_trace.js";
import { outilDeTrace, OPTIONS_DE_TRACE } from "./options_esquisse.js";

// Un point n'est retenu que si la souris a bougé d'au moins ça.
const PAS_DE_RELEVE_PX = 1.5;
const FERMETURE_PX = 12;

let geste = null;         // { points, mmParPixel }

function arreter(contexte) {
  geste = null;
  contexte.esquisse.apercu([]);
  contexte.mesurer(null);
}

export default outilDeTrace({
  nom: "pinceau",
  etiquette: "Pinceau",
  termeDuProgramme: "tracé à main levée",
  aide: "Tracé à main levée, bouton maintenu. Il est simplifié au relâcher.",
  raccourci: "B",
  optionsBandeau: [
    {
      cle: "lissage", etiquette: "Lissage", type: "nombre", unite: "px", defaut: 3, min: 0.5, max: 20,
      aide: "Plus la valeur est grande, plus le tracé est simplifié au relâcher.",
    },
    ...OPTIONS_DE_TRACE,
  ],

  desactiver: arreter,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    // Le départ s'accroche aux points existants : on peut prolonger un tracé.
    const depart = contexte.esquisse.accrocher(evenement, { sansGrille: true });
    if (depart === null) return;
    geste = { points: [depart.uv], mmParPixel: depart.mmParPixel };
    contexte.capturer(evenement.pointerId);
  },

  surDeplacement(evenement, contexte) {
    if (geste === null) {
      contexte.esquisse.montrer(contexte.esquisse.accrocher(evenement, { sansGrille: true }));
      return;
    }
    const vise = contexte.esquisse.viser(evenement);
    if (vise === null || distance(vise.uv, geste.points.at(-1)) < PAS_DE_RELEVE_PX * geste.mmParPixel) return;
    geste.points.push(vise.uv);
    contexte.esquisse.apercu([{ points: geste.points }]);
    contexte.esquisse.montrer(null);
  },

  surRelache(evenement, contexte) {
    if (geste === null) return;
    const { points, mmParPixel } = geste;
    const fin = contexte.esquisse.accrocher(evenement, { sansGrille: true });
    if (fin !== null && fin.idPoint !== null) points.push(fin.uv);
    arreter(contexte);

    const { lissage = 3 } = contexte.options();
    const { sommets, fermee } = simplifierTrace(points, lissage * mmParPixel, FERMETURE_PX * mmParPixel);
    if (sommets.length < 2) return;
    contexte.esquisse.modifier((contenu) => ajouterPolyligne(contenu, sommets, fermee).contenu, "Pinceau");
  },

  surTouche(evenement, contexte) {
    if (geste !== null && evenement.key === "Escape") {
      arreter(contexte);
      return true;
    }
    return false;
  },
});
