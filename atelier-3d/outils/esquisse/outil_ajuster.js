/*
 * outils/esquisse/outil_ajuster.js
 * Ajuster : cliquer le morceau de trait en trop, il disparaît jusqu'aux
 * croisements voisins. C'est l'outil qui permet de tracer large puis de
 * nettoyer, au lieu d'effacer un trait entier et de le refaire.
 */

import { ajusterAuCroisement } from "../../noyau/esquisse/ajuster_trace.js";
import { courbeSous, pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace } from "./options_esquisse.js";

const TOLERANCE_PX = 8;

function viser(evenement, contexte) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  const id = courbeSous(contenu, vise.uv, TOLERANCE_PX * vise.mmParPixel);
  return id === null ? null : { id, uv: vise.uv, contenu };
}

function montrer(contexte, cible) {
  if (cible === null) {
    contexte.esquisse.apercu([]);
    contexte.mesurer("Ajuster : cliquer le morceau de trait à retirer.");
    return;
  }
  const courbe = cible.contenu.courbes.find((c) => c.id === cible.id);
  contexte.esquisse.apercu([{ points: pointsDeCourbe(cible.contenu, courbe), genre: "gomme" }]);
  contexte.mesurer("Ajuster : le morceau entre les deux croisements part.");
}

export default outilDeTrace({
  nom: "ajuster",
  etiquette: "Ajuster",
  termeDuProgramme: "ajuster un tracé",
  aide: "Retire le morceau de trait cliqué, jusqu'aux croisements voisins. Un trait qui ne croise rien part en entier.",
  raccourci: "J",
  groupe: "modification",

  desactiver: (contexte) => contexte.esquisse.apercu([]),

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const cible = viser(evenement, contexte);
    if (cible === null) return;
    contexte.esquisse.modifier((contenu) => ajusterAuCroisement(contenu, cible.id, cible.uv), "Ajuster");
    contexte.esquisse.apercu([]);
  },

  surDeplacement(evenement, contexte) {
    montrer(contexte, viser(evenement, contexte));
  },
});
