/*
 * noyau/types/type_noeud_texte.js
 *
 * Un texte en volume : la chaîne, la police, la hauteur des lettres,
 * l'épaisseur. Posé à plat, il se lit du dessus ; collé sur une face, il se
 * lit depuis l'extérieur de la face. Le cintrage le courbe autour d'un axe
 * vertical du texte, pour qu'il épouse un boîtier rond : c'est un réglage à
 * l'œil, pas un calcul de la courbure réelle de la surface.
 *
 * Token attendu dans le document :
 *   { type: "texte", parametres: { texte: "LÉO", police: "baton", taille: 8, epaisseur: 1.5, cintrage: 0 } }
 */

import { POLICES, cleDePolice } from "../polices.js";

// Le cintrage découpe le texte en petits morceaux pour pouvoir le courber.
const FINESSE_MIN_MM = 0.4;
const FINESSE_MAX_MM = 2;

export default {
  nom: "texte",
  etiquette: "Texte",
  termeDuProgramme: "texte en relief",
  aide: "Lettres en volume, posées à plat ou collées sur une face, en relief ou gravées.",
  icone: "texte",
  categorie: "primitive",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  // « Coller sur une face », « En relief », « Gravé » s'appliquent à lui.
  collable: true,

  nomAuto: (n) => "Texte « " + n.parametres.texte + " »",

  parametres: {
    texte: { etiquette: "Texte", texte: true, defaut: "Texte" },
    police: {
      etiquette: "Police",
      defaut: "baton",
      choix: POLICES.map((p) => ({ valeur: p.nom, etiquette: p.etiquette })),
    },
    taille: { etiquette: "Hauteur des lettres", unite: "mm", defaut: 10, min: 1, max: 300 },
    epaisseur: { etiquette: "Épaisseur", unite: "mm", defaut: 2, min: 0.2, max: 100 },
    // Où le texte a été collé : { point, normale }, ou null s'il est posé.
    surface: { etiquette: "Face", defaut: null, cache: true },
    cintrage: {
      etiquette: "Cintrage (rayon)",
      titre: "0 : à plat. Un rayon positif enroule le texte sur un objet rond ; négatif, dans un creux.",
      unite: "mm", defaut: 0, min: -1000, max: 1000, direct: true,
    },
  },

  fichiersRequis: (p) => [cleDePolice(p.police)],

  construire(atelier, p, ressources) {
    const contours = ressources.texte(cleDePolice(p.police), p.texte, p.taille);
    if (contours.length === 0) return null;
    // Règle « non nulle » : c'est celle des polices, et elle soude les
    // lettres manuscrites qui se chevauchent au lieu de les trouer.
    const solide = new atelier.CrossSection(contours, "NonZero").extrude(p.epaisseur);
    const rayon = p.cintrage;
    if (Math.abs(rayon) < 1) return solide;

    const finesse = Math.min(FINESSE_MAX_MM, Math.max(FINESSE_MIN_MM, Math.abs(rayon) / 40));
    // Le texte s'enroule autour d'un axe parallèle à ses lettres, placé à
    // « rayon » sous sa face d'appui : le pied des lettres touche le cylindre.
    return solide.refineToLength(finesse).warp((v) => {
      const angle = v[0] / rayon;
      const distance = rayon + v[2];
      v[0] = distance * Math.sin(angle);
      v[2] = distance * Math.cos(angle) - rayon;
    });
  },
};
