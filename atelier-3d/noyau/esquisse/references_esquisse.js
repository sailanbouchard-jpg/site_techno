/*
 * noyau/esquisse/references_esquisse.js
 * ─────────────────────────────────────
 * Les points de référence : un point d'une esquisse, marqué comme référence,
 * que les esquisses suivantes peuvent viser, quelle que soit leur orientation.
 *
 *   { genre: "reference", a }                         le point a est une référence
 *                                                     (une contrainte sans équation)
 *   { genre: "surReference", a, esquisse, point, u, v } le point a tombe sur la projection,
 *                                                     dans le plan de son esquisse, du point
 *                                                     de référence « point » de « esquisse » ;
 *                                                     (u, v) : cette projection, tenue à jour
 *   parametres.passePar = { esquisse, point }         le plan de l'esquisse glisse le long de sa
 *                                                     normale pour passer par ce point
 *   parametres.copieDe = id                           copie liée : mêmes tracés, même plan, décalé
 *                                                     de (deplacementU, V, W) dans le repère de
 *                                                     l'origine ; non modifiable directement
 *
 * Les esquisses sont numérotées dans l'ordre de la liste : une esquisse ne
 * vise que les références de celles qui la précèdent. Pas de boucle possible,
 * et une modification se propage d'un seul passage, de haut en bas.
 */

import { trouverNoeud, parcourir } from "../document.js";
import { fournitUnProfil, esquissesDuNoeud } from "../registre_types_de_noeuds.js";
import { appliquerAuPoint } from "../transformations.js";
import { contenuDe, recalerLesArcs } from "./elements_esquisse.js";
import { matriceDeLEsquisse } from "./plans_esquisse.js";
import { resoudre } from "./contraintes_esquisse.js";
import { commandeModifierEsquisse } from "../commandes/commande_modifier_esquisse.js";
import { commandeModifierParametre } from "../commandes/commande_modifier_parametre.js";

// En deçà, une référence n'a pas bougé : on ne réécrit pas l'esquisse qui la vise.
const IMMOBILE_MM = 1e-7;

/* Les esquisses du projet, dans l'ordre de la liste : c'est leur numéro. */
export function esquissesDansLOrdre(document) {
  return document.racine.enfants.filter((n) => fournitUnProfil(n.type));
}

/* Le numéro d'une esquisse (à partir de 1), ou 0. */
export function numeroDeLEsquisse(document, id) {
  return esquissesDansLOrdre(document).findIndex((n) => n.id === id) + 1;
}

const contraintesDe = (esquisse) => esquisse.parametres?.contraintes ?? [];

/* Les identifiants des points marqués comme références. */
export function pointsMarques(contenu) {
  return new Set((contenu.contraintes ?? []).filter((c) => c.genre === "reference").map((c) => c.a));
}

/* Les références d'une esquisse : [{ point, uv, monde }]. */
export function referencesDe(esquisse) {
  const points = esquisse.parametres?.points ?? {};
  const repere = matriceDeLEsquisse(esquisse.parametres);
  return [...pointsMarques({ contraintes: contraintesDe(esquisse) })]
    .filter((id) => points[id] !== undefined)
    .map((id) => ({ point: id, uv: points[id], monde: appliquerAuPoint(repere, [...points[id], 0]) }));
}

/* Les références que cette esquisse peut viser : celles des esquisses d'avant.
   [{ esquisse, numero, point, monde }] */
export function referencesAccessibles(document, idEsquisse) {
  const ordre = esquissesDansLOrdre(document);
  const rang = ordre.findIndex((n) => n.id === idEsquisse);
  const avant = rang < 0 ? ordre : ordre.slice(0, rang);
  return avant.flatMap((e, i) => referencesDe(e).map((r) => ({ esquisse: e.id, numero: i + 1, point: r.point, monde: r.monde })));
}

/* Les esquisses dont celle-ci dépend : celles qu'elle vise. */
export function dependancesDe(esquisse) {
  if (esquisse.parametres?.copieDe) return new Set([esquisse.parametres.copieDe]);
  const ids = new Set(contraintesDe(esquisse).filter((c) => c.genre === "surReference").map((c) => c.esquisse));
  if (esquisse.parametres?.passePar) ids.add(esquisse.parametres.passePar.esquisse);
  return ids;
}

const aDesDependances = (esquisse) => esquisse.parametres?.passePar != null || esquisse.parametres?.copieDe != null
  || contraintesDe(esquisse).some((c) => c.genre === "surReference");

/* Le plan d'une copie liée : celui de l'origine, déplacé de (u, v, w) dans son repère. */
export function repereDeLaCopie(parametresOrigine, parametresCopie) {
  const m = matriceDeLEsquisse(parametresOrigine);
  const [u, v, w] = [parametresCopie.deplacementU ?? 0, parametresCopie.deplacementV ?? 0, parametresCopie.deplacementW ?? 0];
  const repere = [...m];
  for (let ligne = 0; ligne < 3; ligne += 1) {
    repere[ligne * 4 + 3] = arrondi(m[ligne * 4 + 3] + m[ligne * 4] * u + m[ligne * 4 + 1] * v + m[ligne * 4 + 2] * w);
  }
  return repere;
}

/* L'esquisse d'origine d'une copie liée, si elle existe encore et la précède ; sinon null. */
function origineDeLaCopie(document, esquisse) {
  const ordre = esquissesDansLOrdre(document);
  const rang = ordre.findIndex((n) => n.id === esquisse.parametres.copieDe);
  return rang >= 0 && rang < ordre.findIndex((n) => n.id === esquisse.id) ? ordre[rang] : null;
}

/* Le point visé, dans le monde, ou pourquoi il est introuvable : { monde } | { probleme }. */
function pointVise(document, { esquisse, point }, idDemandeur) {
  const ordre = esquissesDansLOrdre(document);
  const rangSource = ordre.findIndex((n) => n.id === esquisse);
  if (rangSource < 0) return { probleme: "l'esquisse de référence n'existe plus" };
  if (rangSource >= ordre.findIndex((n) => n.id === idDemandeur)) {
    return { probleme: "l'esquisse de référence n°" + (rangSource + 1) + " doit se trouver avant celle-ci dans la liste" };
  }
  const source = ordre[rangSource];
  const reference = referencesDe(source).find((r) => r.point === point);
  if (reference === undefined) return { probleme: "le point visé n'est plus une référence de l'esquisse n°" + (rangSource + 1) };
  return { monde: reference.monde };
}

/* Ce qui ne va pas dans les références d'une esquisse, en une phrase, ou null. */
export function problemeDeReference(document, esquisse) {
  if (esquisse.parametres?.copieDe) {
    return origineDeLaCopie(document, esquisse) === null
      ? "Copie orpheline : l'esquisse d'origine n'existe plus, ou se trouve après la copie dans la liste." : null;
  }
  const visees = contraintesDe(esquisse).filter((c) => c.genre === "surReference");
  if (esquisse.parametres?.passePar) visees.push(esquisse.parametres.passePar);
  for (const visee of visees) {
    const { probleme } = pointVise(document, visee, esquisse.id);
    if (probleme) return "Référence perdue : " + probleme + ".";
  }
  return null;
}

/*
 * Ce qui relie une esquisse au reste du projet :
 *   sources       ce dont elle dépend (esquisses visées, esquisse d'origine d'une copie) ;
 *   utilisateurs  ce qui dépend d'elle (esquisses qui la visent, copies liées, solides
 *                 qu'on en a tirés, extrusions qui s'arrêtent sur l'un de ses points).
 * Pour un solide, sources = ses esquisses. Sert à montrer les dépendances
 * avant de supprimer ou de réordonner.
 */
export function liensDuNoeud(document, id) {
  const noeud = trouverNoeud(document, id);
  if (noeud === null) return { sources: [], utilisateurs: [] };
  const sources = new Set(esquissesDuNoeud(noeud));
  if (noeud.parametres?.jusqua) sources.add(noeud.parametres.jusqua.esquisse);
  if (fournitUnProfil(noeud.type)) for (const source of dependancesDe(noeud)) sources.add(source);

  const utilisateurs = new Set();
  if (fournitUnProfil(noeud.type)) {
    for (const { noeud: autre } of parcourir(document.racine)) {
      if (autre.id === id) continue;
      const vise = esquissesDuNoeud(autre).includes(id)
        || autre.parametres?.jusqua?.esquisse === id
        || (fournitUnProfil(autre.type) && dependancesDe(autre).has(id));
      if (vise) utilisateurs.add(autre.id);
    }
  }
  return { sources: [...sources].filter((autre) => trouverNoeud(document, autre) !== null), utilisateurs: [...utilisateurs] };
}

/* Un ordre des esquisses (leurs identifiants) est-il possible ? null, ou pourquoi pas. */
export function refusDeLOrdre(document, ids) {
  const rangs = new Map(ids.map((id, i) => [id, i]));
  for (const id of ids) {
    const esquisse = trouverNoeud(document, id);
    for (const source of dependancesDe(esquisse)) {
      if (rangs.has(source) && rangs.get(source) > rangs.get(id)) {
        return "Impossible : une esquisse passerait avant celle dont elle utilise un point de référence. "
          + "Une esquisse ne vise que les références des esquisses placées au-dessus d'elle.";
      }
    }
  }
  return null;
}

/* La projection d'un point du monde dans le plan d'un repère orthonormé : [u, v]. */
export function projeter(repere, [x, y, z]) {
  const d = [x - repere[3], y - repere[7], z - repere[11]];
  return [0, 1].map((k) => repere[k] * d[0] + repere[4 + k] * d[1] + repere[8 + k] * d[2]);
}

/* Les réglages du plan qui le font passer par ce point, sans le tourner :
   { decalage } pour un plan de base, { repere } pour une face. */
export function planPassantPar(parametres, monde) {
  const m = matriceDeLEsquisse(parametres);
  const n = [m[2], m[6], m[10]];
  const ecart = n[0] * (monde[0] - m[3]) + n[1] * (monde[1] - m[7]) + n[2] * (monde[2] - m[11]);
  if (Array.isArray(parametres.repere)) {
    const repere = [...parametres.repere];
    [3, 7, 11].forEach((i, k) => { repere[i] = arrondi(repere[i] + n[k] * ecart); });
    return { repere };
  }
  return { decalage: arrondi((parametres.decalage ?? 0) + ecart) };
}

const arrondi = (x) => Math.round(x * 1e6) / 1e6 || 0;

// Une extrusion jusqu'à un point posé dans le plan garde une épaisseur.
const HAUTEUR_MIN_MM = 0.1;

/* Le point de référence dans le monde, ou null s'il n'existe plus. */
function mondeDeLaReference(document, { esquisse, point }) {
  const source = trouverNoeud(document, esquisse);
  if (source === null || !fournitUnProfil(source.type)) return null;
  return referencesDe(source).find((r) => r.point === point)?.monde ?? null;
}

/* Hauteur et sens d'une extrusion qui va jusqu'à ce point : la distance du
   point au plan, le long de la normale ; le sens suit le côté où il se trouve. */
export function hauteurJusquA(parametresExtrusion, parametresEsquisse, monde) {
  const m = matriceDeLEsquisse(parametresEsquisse);
  const d = m[2] * (monde[0] - m[3]) + m[6] * (monde[1] - m[7]) + m[10] * (monde[2] - m[11]);
  if (parametresExtrusion.sens === "symetrique") return { hauteur: Math.max(HAUTEUR_MIN_MM, arrondi(2 * Math.abs(d))), sens: "symetrique" };
  return { hauteur: Math.max(HAUTEUR_MIN_MM, arrondi(Math.abs(d))), sens: d < 0 ? "bas" : "haut" };
}

/*
 * Les commandes qui remettent chaque esquisse d'accord avec les références
 * qu'elle vise, de la première à la dernière : le plan d'abord (il change la
 * projection), puis les points. Une référence perdue laisse l'esquisse telle
 * quelle — elle garde sa dernière position connue.
 */
export function commandesDePropagation(document) {
  const ordre = esquissesDansLOrdre(document);
  const hauteursSuivies = [...parcourir(document.racine)].some(({ noeud }) => noeud.parametres?.jusqua);
  if (!ordre.some(aDesDependances) && !hauteursSuivies) return [];
  const commandes = [];
  let courant = document;
  const executer = (commande, descripteur) => {
    courant = descripteur.appliquer(courant, commande);
    commandes.push(commande);
  };
  for (const { id } of ordre) {
    let esquisse = trouverNoeud(courant, id);
    if (!aDesDependances(esquisse)) continue;

    // Une copie liée reprend tout de son origine : tracés, contraintes, plan.
    if (esquisse.parametres.copieDe) {
      const origine = origineDeLaCopie(courant, esquisse);
      if (origine === null) continue;
      const repere = repereDeLaCopie(origine.parametres, esquisse.parametres);
      for (const [cle, valeur] of [["repere", repere], ["plan", origine.parametres.plan ?? "XY"], ["sensExterieur", origine.parametres.sensExterieur ?? 1]]) {
        const avant = esquisse.parametres[cle] ?? null;
        if (JSON.stringify(avant) !== JSON.stringify(valeur)) executer(commandeModifierParametre.creer(id, cle, avant, valeur), commandeModifierParametre);
      }
      const [dOrigine, dCopie] = [origine, trouverNoeud(courant, id)].map((n) => contenuDe(n.parametres));
      const cle = (c) => JSON.stringify([c.points, c.courbes, c.contraintes]);
      if (cle(dOrigine) !== cle(dCopie)) executer(commandeModifierEsquisse.creer(id, dCopie, dOrigine, "Suivre l'esquisse d'origine"), commandeModifierEsquisse);
      continue;
    }

    const passePar = esquisse.parametres.passePar;
    if (passePar) {
      const { monde } = pointVise(courant, passePar, id);
      if (monde) {
        for (const [cle, valeur] of Object.entries(planPassantPar(esquisse.parametres, monde))) {
          const avant = esquisse.parametres[cle] ?? (cle === "decalage" ? 0 : null);
          if (JSON.stringify(avant) === JSON.stringify(valeur)) continue;
          executer(commandeModifierParametre.creer(id, cle, avant, valeur), commandeModifierParametre);
        }
        esquisse = trouverNoeud(courant, id);
      }
    }

    const repere = matriceDeLEsquisse(esquisse.parametres);
    const contenu = contenuDe(esquisse.parametres);
    let bouge = false;
    const contraintes = contenu.contraintes.map((c) => {
      if (c.genre !== "surReference") return c;
      const { monde } = pointVise(courant, c, id);
      if (!monde) return c;
      const [u, v] = projeter(repere, monde).map(arrondi);
      if (Math.abs(u - c.u) < IMMOBILE_MM && Math.abs(v - c.v) < IMMOBILE_MM) return c;
      bouge = true;
      return { ...c, u, v };
    });
    if (!bouge) continue;
    const { contenu: resolu } = resoudre({ ...contenu, contraintes });
    executer(commandeModifierEsquisse.creer(id, contenu, recalerLesArcs(resolu), "Suivre les références"), commandeModifierEsquisse);
  }

  // Les extrusions jusqu'à un point, une fois toutes les esquisses à leur place.
  if (hauteursSuivies) {
    for (const { noeud } of [...parcourir(courant.racine)]) {
      const p = noeud.parametres;
      if (!p?.jusqua) continue;
      const monde = mondeDeLaReference(courant, p.jusqua);
      const esquisse = trouverNoeud(courant, p.esquisse);
      if (monde === null || esquisse === null) continue;
      for (const [cle, valeur] of Object.entries(hauteurJusquA(p, esquisse.parametres, monde))) {
        const avant = trouverNoeud(courant, noeud.id).parametres[cle];
        if (avant !== valeur) executer(commandeModifierParametre.creer(noeud.id, cle, avant, valeur), commandeModifierParametre);
      }
    }
  }
  return commandes;
}
