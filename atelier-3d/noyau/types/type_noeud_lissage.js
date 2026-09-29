/*
 * noyau/types/type_noeud_lissage.js
 *
 * Plusieurs profils fermés, chacun dans son esquisse, que le logiciel relie
 * par une surface : un carré en bas et un rond en haut donnent une trémie, des
 * ellipses de tailles différentes une coque, une bouteille, un bec verseur.
 * Les esquisses sont en général sur des plans parallèles décalés (réglage
 * « Décalage » de l'esquisse), mais tous les plans conviennent.
 *
 * Une courbe guide (une esquisse d'un seul tracé ouvert, sélectionnée avec
 * les sections) donne sa trajectoire à la surface : col de cygne, corne, bec.
 * Bouclé, la dernière section rejoint la première : un anneau de sections.
 *
 * Token attendu dans le document :
 *   { type: "lissage", parametres: { sections: ["n4_…", "n6_…", "n9_…"], esquisse: "n4_…",
 *                                    guide: null, raccord: "lisse", boucle: false, origine: { x, y, z } } }
 * esquisse : la première section, celle que « Modifier l'esquisse » rouvre.
 */

import { PARAMETRE_ORIGINE, PARAMETRE_ESQUISSE } from "../esquisse/plans_esquisse.js";
import {
  bouclesDuProfil, sectionsDuLissage, solideParSections, boiteDesSections, cheminDeLEsquisse,
} from "../esquisse/solides_par_sections.js";
import { analyserEsquisse, boiteDeLEsquisse } from "../esquisse/contours_esquisse.js";
import { appliquerAuPoint } from "../transformations.js";

/* Les sources arrivent dans l'ordre d'esquissesDe : les sections, puis la courbe guide. */
function sections(p, sources, atelier = null) {
  const nombre = (p.sections ?? []).length;
  const guide = p.guide ? cheminDeLEsquisse(sources[nombre].contenu, sources[nombre].matrice) : null;
  if (guide !== null && guide.ferme) throw new Error("la courbe guide doit être un tracé ouvert.");
  const profils = sources.slice(0, nombre).map((s) => ({ boucles2D: bouclesDuProfil(s.profil.fermes, atelier), matrice: s.matrice }));
  return sectionsDuLissage(profils, p.raccord, { guide, boucle: p.boucle === true && guide === null });
}

/* Une courbe guide : un seul tracé, ouvert, et pas de contour fermé. */
const estUnGuide = (contenu) => {
  const { fermes, ouverts } = analyserEsquisse(contenu);
  return fermes.length === 0 && ouverts.length === 1;
};

/* Le centre du dessin d'une esquisse, dans le monde. */
function centreDansLeMonde(esquisse) {
  const boite = boiteDeLEsquisse(esquisse.contenu);
  const [u, v] = boite === null ? [0, 0] : [(boite.min[0] + boite.max[0]) / 2, (boite.min[1] + boite.max[1]) / 2];
  return appliquerAuPoint(esquisse.matrice, [u, v, 0]);
}

/* Les sections dans l'ordre où la surface les traverse : on part d'un bout
   (l'une des deux plus éloignées) et on va chaque fois à la plus proche. */
function ordonner(esquisses) {
  const centres = esquisses.map(centreDansLeMonde);
  const d = (i, j) => Math.hypot(...centres[i].map((c, k) => c - centres[j][k]));
  let depart = 0;
  let loin = -1;
  for (let i = 0; i < centres.length; i += 1) {
    for (let j = 0; j < centres.length; j += 1) {
      if (d(i, j) > loin) {
        loin = d(i, j);
        depart = i;
      }
    }
  }
  const ordre = [depart];
  const restes = new Set(esquisses.keys());
  restes.delete(depart);
  while (restes.size > 0) {
    const dernier = ordre[ordre.length - 1];
    const suivant = [...restes].reduce((m, i) => (d(dernier, i) < d(dernier, m) ? i : m));
    ordre.push(suivant);
    restes.delete(suivant);
  }
  return ordre.map((i) => esquisses[i]);
}

export default {
  nom: "lissage",
  etiquette: "Lissage",
  termeDuProgramme: "lissage entre plusieurs profils",
  aide: "Relie plusieurs contours fermés, dessinés dans des esquisses différentes, par une surface continue : trémie, bouteille, coque. Sélectionner les esquisses (Ctrl+clic dans la liste) ; une esquisse d'un seul tracé ouvert, sélectionnée avec elles, sert de courbe guide.",
  verbe: "Lisser",
  icone: "lissage",
  categorie: "interne",
  tailleParReglages: true,
  plusieursEsquisses: true,
  consigneOperation: "Les sections sont reliées dans l'ordre où elles se suivent dans l'espace.",

  nomAuto: (n) => "Lissage (" + (n.parametres.sections?.length ?? 0) + " sections)",

  parametres: {
    raccord: {
      etiquette: "Surface",
      defaut: "lisse",
      choix: [
        { valeur: "lisse", etiquette: "Courbe douce", aide: "Une courbe régulière passe par toutes les sections : formes arrondies, sans arête." },
        { valeur: "droit", etiquette: "Faces droites", aide: "Des faces planes vont d'une section à la suivante : formes facettées, arêtes nettes." },
      ],
    },
    boucle: {
      etiquette: "Bouclé", case: "relier la dernière section à la première", defaut: false,
      aide: "Pour un anneau de sections : la surface revient à son départ, sans bouchons. Sans effet avec une courbe guide.",
    },
    origine: PARAMETRE_ORIGINE,
    esquisse: PARAMETRE_ESQUISSE,
    sections: { etiquette: "Sections", defaut: Object.freeze([]), cache: true },
    guide: { etiquette: "Courbe guide", defaut: null, cache: true },
  },

  esquissesDe: (p) => [...(p.sections ?? []), ...(p.guide ? [p.guide] : [])],

  roles(esquisses) {
    const guides = esquisses.filter((e) => estUnGuide(e.contenu));
    if (guides.length > 1) throw new Error("Un lissage accepte une seule courbe guide : un tracé ouvert.");
    const profils = esquisses.filter((e) => !guides.includes(e));
    if (profils.length < 2) throw new Error("Sélectionner au moins deux esquisses à contour fermé (Ctrl+clic dans la liste), et au besoin une courbe guide.");
    const sansContour = profils.find((e) => analyserEsquisse(e.contenu).fermes.length === 0);
    if (sansContour !== undefined) throw new Error("Chaque section d'un lissage doit contenir un contour fermé ; la courbe guide, un seul tracé ouvert.");
    const ordre = ordonner(profils).map((e) => e.id);
    return { sections: ordre, esquisse: ordre[0], guide: guides[0]?.id ?? null };
  },

  boiteDepuisEsquisses: (p, sources) => boiteDesSections(sections(p, sources)),

  construireDepuisEsquisses: (atelier, p, sources) => solideParSections(atelier, sections(p, sources, atelier), p.boucle === true && !p.guide),
};
