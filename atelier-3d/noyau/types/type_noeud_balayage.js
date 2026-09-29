/*
 * noyau/types/type_noeud_balayage.js
 *
 * Un profil fermé qui suit un chemin : tuyau, anse, poignée, rail, joint
 * torique. Deux esquisses : le profil (son contour) et le chemin (un seul
 * tracé, ouvert ou fermé, droit ou courbe). Par défaut, le profil est posé au
 * départ du chemin, en travers : on le dessine où l'on veut. Il peut aussi
 * rester là où il a été dessiné.
 *
 * Token attendu dans le document :
 *   { type: "balayage", parametres: { esquisse: "n4_…", chemin: "n7_…", orientation: "suivre",
 *                                     torsion: 0, echelleFin: 100, origine: { x, y, z } } }
 */

import { PARAMETRE_ORIGINE, PARAMETRE_ESQUISSE } from "../esquisse/plans_esquisse.js";
import {
  bouclesDuProfil, cheminDeLEsquisse, sectionsDuBalayage, solideParSections, boiteDesSections,
} from "../esquisse/solides_par_sections.js";
import { analyserEsquisse, boiteDeLEsquisse } from "../esquisse/contours_esquisse.js";

/* Avec une paroi, le profil devient un anneau (le contour moins son
   intérieur) : balayé d'un seul tenant, il donne un tuyau ouvert aux deux
   bouts, sans soustraction. */
function sections(p, [profil, chemin], atelier = null) {
  const leChemin = cheminDeLEsquisse(chemin.contenu, chemin.matrice);
  let boucles = bouclesDuProfil(profil.profil.fermes, atelier);
  if (boucles.length === 0) throw new Error("le profil du balayage n'a aucun contour fermé.");
  if (atelier !== null && p.paroi > 0) {
    const plein = new atelier.CrossSection(boucles, "Positive");
    const creux = plein.offset(-p.paroi, "Round");
    if (creux.isEmpty()) throw new Error("paroi trop épaisse pour ce profil : la réduire, ou mettre 0 pour un balayage plein.");
    boucles = plein.subtract(creux).toPolygons();
  }
  return { leChemin, liste: sectionsDuBalayage(boucles, profil.matrice, leChemin, p) };
}

/* Un chemin, c'est un seul tracé ; un profil, au moins un contour fermé. */
const estUnChemin = (contenu) => {
  const { fermes, ouverts } = analyserEsquisse(contenu);
  return fermes.length + ouverts.length === 1;
};
const estUnProfil = (contenu) => analyserEsquisse(contenu).fermes.length > 0;
const taille = (contenu) => {
  const boite = boiteDeLEsquisse(contenu);
  return boite === null ? 0 : Math.hypot(boite.max[0] - boite.min[0], boite.max[1] - boite.min[1]);
};

export default {
  nom: "balayage",
  etiquette: "Balayage",
  termeDuProgramme: "balayage d'un profil le long d'un chemin",
  aide: "Fait suivre un chemin à un contour fermé : tuyau, anse, poignée, rail. Sélectionner deux esquisses (Ctrl+clic dans la liste) : le profil et le chemin.",
  verbe: "Balayer",
  icone: "balayage",
  categorie: "interne",
  tailleParReglages: true,
  plusieursEsquisses: true,
  consigneOperation: "Le profil suit le chemin depuis son départ.",

  nomAuto: () => "Balayage",

  parametres: {
    placement: {
      etiquette: "Profil posé",
      defaut: "depart",
      choix: [
        { valeur: "depart", etiquette: "Au départ du chemin", aide: "Le centre du profil est posé au départ du chemin, en travers, son haut vers le haut : peu importe où il a été dessiné." },
        { valeur: "dessine", etiquette: "Là où il est dessiné", aide: "Le profil garde sa place et sa position par rapport au chemin : pour un profil décentré, ou dessiné exactement au départ." },
      ],
    },
    orientation: {
      etiquette: "Profil",
      defaut: "suivre",
      choix: [
        { valeur: "suivre", etiquette: "Suit la courbe", aide: "Le profil tourne avec le chemin, toujours en travers : un tuyau." },
        { valeur: "parallele", etiquette: "Reste parallèle", aide: "Le profil garde son orientation et glisse le long du chemin." },
      ],
    },
    torsion: { etiquette: "Torsion", unite: "°", defaut: 0, min: -3600, max: 3600, pasFixe: 15 },
    echelleFin: { etiquette: "Taille à l'arrivée", unite: "%", defaut: 100, min: 1, max: 1000, pasFixe: 5 },
    paroi: { etiquette: "Paroi (tuyau)", unite: "mm", defaut: 0, min: 0, max: 200, aide: "0 : plein. Sinon, un tuyau creux aux parois de cette épaisseur, ouvert aux deux bouts." },
    origine: PARAMETRE_ORIGINE,
    esquisse: PARAMETRE_ESQUISSE,
    chemin: { etiquette: "Chemin", defaut: null, cache: true },
  },

  esquissesDe: (p) => [p.esquisse, p.chemin],

  /* Deux esquisses sélectionnées : laquelle est le profil, laquelle le chemin.
     Rend les paramètres qui les désignent, ou lève une erreur lisible. */
  roles(esquisses) {
    if (esquisses.length !== 2) throw new Error("Sélectionner exactement deux esquisses : le profil et le chemin.");
    const possibles = [[0, 1], [1, 0]]
      .filter(([i, j]) => estUnProfil(esquisses[i].contenu) && estUnChemin(esquisses[j].contenu))
      .map(([i, j]) => ({ esquisse: esquisses[i].id, chemin: esquisses[j].id, tailleDuChemin: taille(esquisses[j].contenu) }));
    if (possibles.length === 0) {
      throw new Error("Il faut un profil (un contour fermé) et un chemin (un seul tracé continu), dans deux esquisses différentes.");
    }
    // Deux boucles simples : la plus grande sert de chemin. « Échanger » corrige au besoin.
    possibles.sort((x, y) => y.tailleDuChemin - x.tailleDuChemin);
    return { esquisse: possibles[0].esquisse, chemin: possibles[0].chemin };
  },

  echanger: (p) => ({ esquisse: p.chemin, chemin: p.esquisse }),

  boiteDepuisEsquisses: (p, sources) => boiteDesSections(sections(p, sources).liste),

  construireDepuisEsquisses(atelier, p, sources) {
    const { leChemin, liste } = sections(p, sources, atelier);
    return solideParSections(atelier, liste, leChemin.ferme);
  },
};
