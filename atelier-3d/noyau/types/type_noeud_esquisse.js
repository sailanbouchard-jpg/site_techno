/*
 * noyau/types/type_noeud_esquisse.js
 *
 * Un ensemble de traits, d'arcs et de cercles tracés sur un plan de base. Ne
 * produit aucun solide par lui-même : extrusions, épaississements et
 * révolutions le désignent. Il reste à la racine du projet, à sa place ; on
 * peut en tirer plusieurs solides, et le modifier les fait tous suivre.
 *
 * Token attendu dans le document :
 *   { type: "esquisse",
 *     parametres: { plan: "XZ",
 *                   points: { "1": [0, 0], "2": [30, 0] },
 *                   courbes: [{ id: "1", genre: "segment", a: "1", b: "2" }] } }
 *
 * Sa transformation reste neutre : une esquisse est posée sur un plan de
 * base, et ce sont les solides qu'on en tire qui se déplacent.
 */

import { libelleDuPlan } from "../esquisse/plans_esquisse.js";
import { cote } from "../format_cotes.js";

// Une esquisse posée sur une face penchée garde le repère de la face : ni décalage ni inclinaison.
const surUneFace = (p) => Array.isArray(p.repere);
// Un plan qui passe par un point de référence : son décalage suit le point.
const passeParUnPoint = (p) => p.passePar != null;
// Une copie liée : ses tracés et son plan viennent de l'esquisse d'origine ; seul son déplacement lui appartient.
const estUneCopie = (p) => p.copieDe != null;
const pasUneCopie = (p) => !estUneCopie(p);


export default {
  nom: "esquisse",
  etiquette: "Esquisse",
  termeDuProgramme: "esquisse plane",
  aide: "Dessin à plat, sur un plan ou une face, qui sert de base à un solide.",
  icone: "esquisse",
  categorie: "interne",
  fournitUnProfil: true,
  transformable: false,

  nomAuto(n) {
    const p = n.parametres;
    if (estUneCopie(p)) return "Copie liée d'esquisse";
    if (Array.isArray(p.repere)) return "Esquisse sur une face";
    return "Esquisse " + (p.plan ?? "XY") + (p.inclinaison ? " inclinée " + cote(p.inclinaison) + "°" : "")
      + (p.decalage ? " à " + cote(p.decalage) + " mm" : "");
  },

  parametres: {
    plan: { etiquette: "Plan", texte: true, defaut: "XY", lectureSeule: true, libelle: libelleDuPlan },
    // Distance du plan à l'origine, le long de sa normale (esquisse sur une face, section d'un
    // lissage) ; la changer fait glisser le plan, et les solides tirés de l'esquisse suivent.
    decalage: { etiquette: "Décalage du plan", unite: "mm", defaut: 0, min: -2000, max: 2000, masque: (p) => surUneFace(p) || passeParUnPoint(p) || estUneCopie(p) },
    // Le plan pivote autour de l'un de ses axes (passant par l'origine) avant de glisser.
    inclinaison: { etiquette: "Inclinaison", unite: "°", defaut: 0, min: -180, max: 180, pasFixe: 15, masque: (p) => surUneFace(p) || estUneCopie(p) },
    pivot: {
      etiquette: "Pivote autour de",
      defaut: "horizontal",
      masque: (p) => surUneFace(p) || estUneCopie(p) || !p.inclinaison,
      choix: [
        { valeur: "horizontal", etiquette: "Son axe horizontal" },
        { valeur: "vertical", etiquette: "Son axe vertical" },
      ],
    },
    // Copie liée : l'esquisse d'origine, et le déplacement de la copie dans le repère
    // de l'origine (u, v dans son plan, w le long de sa normale).
    copieDe: { etiquette: "Copie de", defaut: null, cache: true },
    deplacementU: { etiquette: "Déplacement horizontal", unite: "mm", defaut: 0, min: -2000, max: 2000, masque: pasUneCopie,
      aide: "Fait glisser la copie dans son plan, le long de l'axe horizontal de l'esquisse d'origine." },
    deplacementV: { etiquette: "Déplacement vertical", unite: "mm", defaut: 0, min: -2000, max: 2000, masque: pasUneCopie,
      aide: "Fait glisser la copie dans son plan, le long de l'axe vertical de l'esquisse d'origine." },
    deplacementW: { etiquette: "Écart au plan d'origine", unite: "mm", defaut: 0, min: -2000, max: 2000, masque: pasUneCopie,
      aide: "Éloigne la copie du plan de l'esquisse d'origine, le long de sa normale : pour une section de lissage, par exemple." },
    // Une face qui n'est parallèle à aucun plan de base : le repère de la face, tel quel.
    repere: { etiquette: "Repère", defaut: null, cache: true },
    // { esquisse, point } : le plan passe par ce point de référence (voir references_esquisse.js).
    passePar: { etiquette: "Passe par", defaut: null, cache: true },
    // -1 : la normale du plan entre dans la pièce où l'esquisse a été posée.
    sensExterieur: { etiquette: "Sens de la face", defaut: 1, cache: true },
    points: { etiquette: "Points", defaut: Object.freeze({}), cache: true },
    courbes: { etiquette: "Tracés", defaut: Object.freeze([]), cache: true },
    contraintes: { etiquette: "Contraintes", defaut: Object.freeze([]), cache: true },
  },
};
