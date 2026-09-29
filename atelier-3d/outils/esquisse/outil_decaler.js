/*
 * outils/esquisse/outil_decaler.js
 * Décaler un contour : on survole un tracé, l'aperçu montre sa copie
 * parallèle du côté de la souris, à la distance réglée dans le bandeau ; un
 * clic la pose. Tout le contour suit (la chaîne de tracés reliés bout à
 * bout), pas seulement le trait visé.
 */

import { courbeSous, pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { chaineDe, chaineDecalee, apercuDuDecalage, appliquerLeDecalage, coteDe } from "../../noyau/esquisse/decalage_esquisse.js";
import { outilDeTrace, OPTIONS_DE_TRACE } from "./options_esquisse.js";

const TOLERANCE_PX = 10;

/* Le décalage que donnerait un clic ici : { elements }, ou { erreur }, ou null. */
function propose(evenement, contexte) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  const id = courbeSous(contenu, vise.uv, TOLERANCE_PX * vise.mmParPixel);
  if (id === null) return null;
  const chaine = chaineDe(contenu, id);
  if (chaine === null) return null;
  const courbes = chaine.seul !== undefined ? [chaine.seul] : chaine.elements.map((e) => e.courbe);
  // Les tracés de la chaîne, dans son sens de parcours, pour savoir de quel côté est la souris.
  const polylignes = chaine.seul !== undefined ? [pointsDeCourbe(contenu, chaine.seul)]
    : chaine.elements.map((e) => {
      const pts = pointsDeCourbe(contenu, e.courbe);
      return e.courbe.a === e.depuis ? pts : [...pts].reverse();
    });
  const { distance = 2 } = contexte.options();
  const signe = coteDe(contenu, chaine, vise.uv, polylignes);
  try {
    return { elements: chaineDecalee(contenu, chaine, signe * distance), courbes };
  } catch (erreur) {
    return { erreur: erreur.message, courbes };
  }
}

export default outilDeTrace({
  nom: "decaler",
  etiquette: "Décaler un contour",
  termeDuProgramme: "décalage (offset)",
  aide: "Trace une copie parallèle d'un contour, à la distance choisie, du côté où est la souris : paroi, jeu, rainure.",
  raccourci: "",
  groupe: "modification",
  curseur: "default",
  optionsBandeau: [
    { cle: "distance", etiquette: "Distance", type: "nombre", unite: "mm", defaut: 2, min: 0.05, max: 500, aide: "L'écart entre le contour et sa copie." },
    ...OPTIONS_DE_TRACE,
  ],

  desactiver(contexte) {
    contexte.esquisse.apercu([]);
    contexte.mesurer(null);
  },

  surDeplacement(evenement, contexte) {
    const p = propose(evenement, contexte);
    if (p === null) {
      contexte.esquisse.apercu([]);
      contexte.mesurer(null);
      return;
    }
    if (p.erreur !== undefined) {
      contexte.esquisse.apercu([]);
      contexte.mesurer(p.erreur);
      return;
    }
    contexte.esquisse.apercu(apercuDuDecalage(p.elements).map((points) => ({ points })));
    contexte.mesurer("Cliquer pour poser la copie de ce côté.");
  },

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const p = propose(evenement, contexte);
    if (p === null) return;
    if (p.erreur !== undefined) {
      contexte.annoncer?.(p.erreur, true);
      return;
    }
    contexte.esquisse.modifier((contenu) => appliquerLeDecalage(contenu, p.elements), "Décaler");
    contexte.esquisse.apercu([]);
  },

  surTouche: () => false,
});
