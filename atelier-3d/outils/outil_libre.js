/*
 * outils/outil_libre.js
 * Le mode par défaut. La pièce glisse à l'horizontale et garde sa hauteur,
 * sans s'accrocher aux surfaces. Seule la flèche Z du gizmo reste : elle
 * change la hauteur. Pas de rotation ici : c'est le rôle des autres modes.
 */

import { creerManipulation } from "./manipulation.js";
import { glisserLibrement } from "./glissers_du_corps.js";

const manipulation = creerManipulation(glisserLibrement);

export default {
  nom: "libre",
  etiquette: "Libre",
  termeDuProgramme: "translation libre",
  aide: "Glisser une pièce à l'horizontale : sa hauteur ne change pas. La flèche Z du gizmo règle la hauteur. En vue de face ou de côté, la pièce suit la souris dans le plan de l'écran.",
  raccourci: "L",
  curseur: "move",
  modeGizmo: "libre",
  optionsBandeau: [
    { cle: "aide", type: "texte", etiquette: "Alt : sans aimantation" },
  ],

  activer() {},
  desactiver: (contexte) => manipulation.annuler(contexte),
  surAppui: manipulation.surAppui,
  surDeplacement: manipulation.surDeplacement,
  surRelache: manipulation.surRelache,
  surTouche: manipulation.surTouche,
};
