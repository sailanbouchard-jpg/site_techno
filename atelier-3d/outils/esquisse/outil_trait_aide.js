/*
 * outils/esquisse/outil_trait_aide.js
 * Trait d'aide : cliquer un tracé le fait passer en trait de construction, et
 * inversement. Un trait d'aide guide le dessin — un axe de symétrie, une
 * diagonale, un cercle de repère — et se cote comme les autres, mais il ne
 * ferme aucun contour : il ne donne pas de matière.
 */

import { basculerConstruction } from "../../noyau/esquisse/elements_esquisse.js";
import { courbeSous, pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace } from "./options_esquisse.js";

const TOLERANCE_PX = 8;

function viser(evenement, contexte) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  const id = courbeSous(contenu, vise.uv, TOLERANCE_PX * vise.mmParPixel);
  return id === null ? null : { id, contenu };
}

export default outilDeTrace({
  nom: "trait_aide",
  etiquette: "Trait d'aide",
  termeDuProgramme: "trait de construction",
  aide: "Fait passer un tracé en trait d'aide, ou l'inverse. Un trait d'aide sert de repère et ne donne pas de matière.",
  raccourci: "W",
  groupe: "modification",

  desactiver: (contexte) => contexte.esquisse.apercu([]),

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const cible = viser(evenement, contexte);
    if (cible === null) return;
    contexte.esquisse.modifier((contenu) => basculerConstruction(contenu, [cible.id]), "Trait d'aide");
  },

  surDeplacement(evenement, contexte) {
    const cible = viser(evenement, contexte);
    if (cible === null) {
      contexte.esquisse.apercu([]);
      contexte.mesurer("Trait d'aide : cliquer un tracé pour le changer en repère, ou l'inverse.");
      return;
    }
    const courbe = cible.contenu.courbes.find((c) => c.id === cible.id);
    contexte.esquisse.apercu([{ points: pointsDeCourbe(cible.contenu, courbe), genre: "choisi" }]);
    contexte.mesurer(courbe.construction === true ? "Ce trait d'aide redevient un tracé." : "Ce tracé devient un trait d'aide.");
  },
});
