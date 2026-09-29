/*
 * outils/outil_poser.js
 * Un rayon part de la souris : s'il touche la face d'un
 * autre objet, la pièce s'y colle, au point touché ; sinon elle se pose au sol.
 */

import { creerManipulation } from "./manipulation.js";
import { glisserEnPosant } from "./glissers_du_corps.js";

const manipulation = creerManipulation(glisserEnPosant);

export default {
  nom: "poser",
  etiquette: "Poser",
  termeDuProgramme: "mise en contact",
  aide: "Glisser une pièce : elle se colle à la face survolée, ou se pose sur le plateau.",
  raccourci: "P",
  curseur: "default",
  modeGizmo: "poser",
  optionsBandeau: [
    {
      cle: "orienter", etiquette: "Orienter sur la face", type: "case", defaut: true,
      aide: "La pièce se couche sur la face survolée et garde l'angle qu'on lui a donné par rapport à elle.",
    },
    // Positif, la pièce mord dans la surface : c'est ce qui la fait fusionner
    // proprement à l'impression au lieu de flotter dessus.
    {
      cle: "enfoncement", etiquette: "Enfoncement", type: "nombre", unite: "mm", defaut: 0, min: -50, max: 50,
      aide: "Profondeur à laquelle la pièce entre dans la surface. Positive, elle y reste soudée une fois groupée.",
    },
  ],

  activer() {},
  desactiver: (contexte) => manipulation.annuler(contexte),
  surAppui: manipulation.surAppui,
  surDeplacement: manipulation.surDeplacement,
  surRelache: manipulation.surRelache,
  surTouche: manipulation.surTouche,
};
