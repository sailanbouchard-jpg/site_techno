/*
 * outils/esquisse/outil_arrondi.js
 * Arrondir un angle : on clique le coin entre deux traits droits, et il est
 * remplacé par un arc du rayon réglé dans le bandeau. Les arrondis se font
 * ici, dans l'esquisse — pas de congé sur les solides.
 */

import { arrondirAngle, courbesDuPoint } from "../../noyau/esquisse/elements_esquisse.js";
import { pointSous } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace, OPTIONS_DE_TRACE } from "./options_esquisse.js";

const TOLERANCE_PX = 8;

function coinSous(evenement, contexte) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  const id = pointSous(contenu, vise.uv, TOLERANCE_PX * vise.mmParPixel);
  if (id === null) return null;
  const courbes = courbesDuPoint(contenu, id);
  const arrondissable = courbes.length === 2 && courbes.every((c) => c.genre === "segment");
  return { id, uv: contenu.points[id], arrondissable };
}

export default outilDeTrace({
  nom: "arrondi",
  etiquette: "Arrondir un angle",
  termeDuProgramme: "raccordement par un arc",
  aide: "Remplace le coin entre deux segments par un arc du rayon choisi.",
  raccourci: "U",
  groupe: "modification",
  curseur: "default",
  optionsBandeau: [
    { cle: "rayon", etiquette: "Rayon", type: "nombre", unite: "mm", defaut: 3, min: 0.1, max: 500, aide: "Rayon de l'arc qui remplace le coin." },
    ...OPTIONS_DE_TRACE,
  ],

  desactiver(contexte) {
    contexte.esquisse.montrer(null);
  },

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const coin = coinSous(evenement, contexte);
    if (coin === null) return;
    const { rayon = 3 } = contexte.options();
    contexte.esquisse.modifier((contenu) => arrondirAngle(contenu, coin.id, rayon), "Arrondir");
  },

  surDeplacement(evenement, contexte) {
    const coin = coinSous(evenement, contexte);
    contexte.esquisse.montrer(coin === null || !coin.arrondissable ? null : { uv: coin.uv, guides: [] });
  },

  surTouche: () => false,
});
