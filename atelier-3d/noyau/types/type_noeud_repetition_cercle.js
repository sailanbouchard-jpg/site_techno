/*
 * noyau/types/type_noeud_repetition_cercle.js
 *
 * L'original recopié autour d'un axe : les pales d'une hélice, les étoiles
 * autour d'un boîtier. À ne pas confondre avec la révolution, qui balaie un
 * profil et donne un solide plein.
 *
 * Token attendu dans le document :
 *   { type: "repetition_cercle",
 *     parametres: { axe: "z", nombre: 4, angle: 360, tourner: true, centreX: -15, centreY: 0, centreZ: 0 },
 *     enfants: [{ type: "extrusion", … }] }
 * Le centre est dans le repère de la répétition, posée au pied de l'original.
 */

import { copiesEnCercle } from "../matrices_de_copies.js";
import { CHOIX_D_AXE, PARAMETRE_NOMBRE, PARAMETRE_CENTRE_OBJET, PARAMETRE_TAILLE_OBJET } from "./parametres_de_repetition.js";

const coordonnee = (etiquette) => ({ etiquette, unite: "mm", defaut: 0, min: -5000, max: 5000, avance: true });

export default {
  nom: "repetition_cercle",
  etiquette: "Répétition en cercle",
  termeDuProgramme: "répétition circulaire",
  aide: "Copies d'un objet réparties sur un cercle.",
  verbe: "Répéter en cercle",
  verbeCourt: "En cercle",
  icone: "repetition_cercle",
  categorie: "interne",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  degroupable: true,

  nomAuto: (n, { nommer }) => n.parametres.nombre + " × " + (n.enfants[0] ? nommer(n.enfants[0]) : "…") + " en cercle",

  parametres: {
    axe: { etiquette: "Axe", defaut: "z", choix: CHOIX_D_AXE },
    nombre: { ...PARAMETRE_NOMBRE, defaut: 6 },
    angle: { etiquette: "Angle total", unite: "°", defaut: 360, min: 1, max: 360, pasFixe: 15, direct: true },
    tourner: { etiquette: "Copies", case: "tournent avec le cercle", defaut: true },
    centreX: coordonnee("Centre X"),
    centreY: coordonnee("Centre Y"),
    centreZ: coordonnee("Centre Z"),
    centreObjet: PARAMETRE_CENTRE_OBJET,
    tailleObjet: PARAMETRE_TAILLE_OBJET,
  },

  copies: copiesEnCercle,
};
