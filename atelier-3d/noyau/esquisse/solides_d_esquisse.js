/*
 * noyau/esquisse/solides_d_esquisse.js
 * ────────────────────────────────────
 * Le lien entre une esquisse et les solides qu'on en tire. Une esquisse vit à
 * part, à la racine du projet, et reste à sa place : chaque extrusion,
 * épaississement ou révolution la désigne par son identifiant (paramètre
 * « esquisse »). Une même esquisse peut ainsi donner plusieurs solides, et la
 * modifier les fait tous suivre.
 *
 * Le calcul, lui, reçoit le solide avec une copie de son esquisse en enfant
 * (avecSesEsquisses) : la géométrie et le cache de maillages n'ont pas à
 * connaître le reste du document.
 */

import { creerNoeud, avecEnfants } from "../noeud.js";
import { trouverNoeud, parcourir } from "../document.js";
import { appliquerAuPoint } from "../transformations.js";
import {
  typeDeNoeud, parametresParDefaut, fournitUnProfil, consommeUnProfil, solidesDEsquisse, esquissesDuNoeud,
} from "../registre_types_de_noeuds.js";
import { contenuDe } from "./elements_esquisse.js";
import { bilanEsquisse, boiteDeLEsquisse, analyserEsquisse } from "./contours_esquisse.js";
import { matriceDeLEsquisse, translation } from "./plans_esquisse.js";

const arrondi = (valeur) => Math.round(valeur * 1000) / 1000 || 0;

/* Ce que l'esquisse permet : { extrusion: true, epaississement: false, … }. */
export function solidesPossibles(parametresEsquisse) {
  const bilan = bilanEsquisse(contenuDe(parametresEsquisse));
  const possibles = {};
  for (const type of solidesDEsquisse()) {
    possibles[type.nom] = !bilan.vide && (type.profilRequis !== "ferme" || bilan.fermee);
  }
  return possibles;
}

function boiteDansLeMonde(matrice, { min, max }) {
  const basMonde = [Infinity, Infinity, Infinity];
  const hautMonde = [-Infinity, -Infinity, -Infinity];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const p = appliquerAuPoint(matrice, [x, y, z]);
        for (let i = 0; i < 3; i += 1) {
          basMonde[i] = Math.min(basMonde[i], p[i]);
          hautMonde[i] = Math.max(hautMonde[i], p[i]);
        }
      }
    }
  }
  return { min: basMonde, max: hautMonde };
}

/*
 * Le solide qui consomme cette esquisse, posé exactement là où elle a été
 * dessinée. Son origine — le centre de son dessous — est estimée à partir de
 * la boîte des tracés : le maillage n'existe pas encore.
 */
export function solideDepuisEsquisse(nomDuType, esquisse) {
  const type = typeDeNoeud(nomDuType);
  if (typeof type.construireDepuisProfil !== "function" || !fournitUnProfil(esquisse.type)) {
    throw new Error("Seule une esquisse peut devenir un solide de cette façon.");
  }
  const contenu = contenuDe(esquisse.parametres);
  const bilan = bilanEsquisse(contenu);
  if (bilan.vide) throw new Error("L'esquisse est vide : aucun tracé à transformer en solide.");
  if (type.profilRequis === "ferme" && !bilan.fermee) {
    throw new Error("Aucun contour n'est fermé : refermer le tracé (il se remplit alors), ou choisir Épaissir.");
  }

  const parametres = parametresParDefaut(nomDuType);
  const local = type.boiteDansLePlan(parametres, boiteDeLEsquisse(contenu));
  const { min, max } = boiteDansLeMonde(matriceDeLEsquisse(esquisse.parametres), local);
  const origine = { x: arrondi((min[0] + max[0]) / 2), y: arrondi((min[1] + max[1]) / 2), z: arrondi(min[2]) };

  return creerNoeud({
    type: nomDuType,
    parametres: { ...parametres, origine, esquisse: esquisse.id },
    transformation: { position: origine },
  });
}

/* Ce que les solides à plusieurs esquisses reçoivent de chacune : ses tracés,
   ses contours analysés et son plan. */
export function sourcesDesEsquisses(esquisses) {
  return esquisses.map((esquisse) => {
    const contenu = contenuDe(esquisse.parametres ?? {});
    return { id: esquisse.id, contenu, profil: analyserEsquisse(contenu), matrice: matriceDeLEsquisse(esquisse.parametres ?? {}) };
  });
}

/* Le balayage ou le lissage tiré de ces esquisses (sélectionnées dans la
   liste). Son origine — le centre de son dessous — vient des sections
   calculées d'avance : le maillage n'existe pas encore. Lève une erreur
   lisible si les esquisses ne conviennent pas. */
export function solideDepuisEsquisses(nomDuType, esquisses) {
  const type = typeDeNoeud(nomDuType);
  if (esquisses.some((e) => !fournitUnProfil(e.type))) throw new Error("Seules des esquisses peuvent servir à un " + type.etiquette.toLowerCase() + ".");
  const roles = type.roles(sourcesDesEsquisses(esquisses));
  const parametres = { ...parametresParDefaut(nomDuType), ...roles };
  const parId = new Map(esquisses.map((e) => [e.id, e]));
  const sources = sourcesDesEsquisses(type.esquissesDe(parametres).map((id) => parId.get(id)));
  let boite;
  try {
    boite = type.boiteDepuisEsquisses(parametres, sources);
  } catch (erreur) {
    throw new Error(type.etiquette + " impossible : " + erreur.message);
  }
  const { min, max } = boite;
  const origine = { x: arrondi((min[0] + max[0]) / 2), y: arrondi((min[1] + max[1]) / 2), z: arrondi(min[2]) };
  return creerNoeud({
    type: nomDuType,
    parametres: { ...parametres, origine },
    transformation: { position: origine },
  });
}

/* Le décalage qu'applique un solide d'esquisse à sa géométrie. */
export function matriceDOrigine(parametres) {
  const o = parametres.origine ?? { x: 0, y: 0, z: 0 };
  return translation([-o.x, -o.y, -o.z]);
}

/* Le repère (u, v, w) → monde d'une esquisse : son plan. Elle reste à sa
   place, quoi qu'il arrive aux solides qu'on en a tirés. */
export function repereDeLEsquisse(document, idEsquisse) {
  const esquisse = trouverNoeud(document, idEsquisse);
  return esquisse === null ? null : matriceDeLEsquisse(esquisse.parametres);
}

/* L'esquisse d'un nœud : lui-même s'il en est une, sinon celle qu'il désigne. */
export function esquisseDe(document, id) {
  const noeud = trouverNoeud(document, id);
  if (noeud === null) return null;
  if (fournitUnProfil(noeud.type)) return noeud;
  if (consommeUnProfil(noeud.type)) {
    const esquisse = trouverNoeud(document, noeud.parametres.esquisse);
    return esquisse !== null && fournitUnProfil(esquisse.type) ? esquisse : null;
  }
  return null;
}

/* Les solides tirés de cette esquisse, où qu'ils soient (dans un groupe, une répétition…). */
export function solidesDeLEsquisse(document, idEsquisse) {
  const liste = [];
  for (const { noeud } of parcourir(document.racine)) {
    if (esquissesDuNoeud(noeud).includes(idEsquisse)) liste.push(noeud);
  }
  return liste;
}

/* Ce nœud, ou l'un de ses descendants, est-il tiré de cette esquisse ? */
export function contientUnSolideDe(noeud, idEsquisse) {
  for (const { noeud: n } of parcourir(noeud)) {
    if (esquissesDuNoeud(n).includes(idEsquisse)) return true;
  }
  return false;
}

/* Le nœud tel que le calcul le reçoit : chaque solide d'esquisse porte une
   copie de ses esquisses en enfants, dans l'ordre. Un sous-arbre sans solide
   d'esquisse est rendu tel quel, même référence. */
export function avecSesEsquisses(document, noeud) {
  if (consommeUnProfil(noeud.type)) {
    const esquisses = esquissesDuNoeud(noeud).map((id) => trouverNoeud(document, id));
    return avecEnfants(noeud, esquisses.filter((e) => e !== null));
  }
  if (noeud.enfants.length === 0) return noeud;
  let change = false;
  const enfants = noeud.enfants.map((enfant) => {
    const resolu = avecSesEsquisses(document, enfant);
    if (resolu !== enfant) change = true;
    return resolu;
  });
  return change ? avecEnfants(noeud, enfants) : noeud;
}
