/*
 * outils/esquisse/outil_chanfrein.js
 * Chanfreiner un angle : on clique le coin entre deux traits droits, et il
 * est remplacé par un pan coupé de la taille réglée dans le bandeau. C'est le
 * chanfrein le plus sûr : tout se passe dans le dessin, avant le volume.
 */

import { chanfreinerAngle, courbesDuPoint } from "../../noyau/esquisse/elements_esquisse.js";
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
  return { id, uv: contenu.points[id], possible: courbes.length === 2 && courbes.every((c) => c.genre === "segment") };
}

export default outilDeTrace({
  nom: "chanfreinEsquisse",
  etiquette: "Chanfreiner un angle",
  termeDuProgramme: "chanfrein",
  aide: "Remplace le coin entre deux segments par un pan coupé, à la distance choisie du coin sur chaque trait.",
  raccourci: "",
  groupe: "modification",
  curseur: "default",
  optionsBandeau: [
    { cle: "distance", etiquette: "Taille", type: "nombre", unite: "mm", defaut: 2, min: 0.1, max: 500, aide: "Distance entre le coin et le début du pan coupé, sur chaque trait." },
    ...OPTIONS_DE_TRACE,
  ],

  desactiver(contexte) {
    contexte.esquisse.montrer(null);
  },

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const coin = coinSous(evenement, contexte);
    if (coin === null) return;
    const { distance = 2 } = contexte.options();
    contexte.esquisse.modifier((contenu) => chanfreinerAngle(contenu, coin.id, distance), "Chanfreiner");
  },

  surDeplacement(evenement, contexte) {
    const coin = coinSous(evenement, contexte);
    contexte.esquisse.montrer(coin === null || !coin.possible ? null : { uv: coin.uv, guides: [] });
  },

  surTouche: () => false,
});
