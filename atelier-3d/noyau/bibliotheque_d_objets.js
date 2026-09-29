/*
 * noyau/bibliotheque_d_objets.js
 * ──────────────────────────────
 * La bibliothèque d'objets paramétriques : des projets enregistrés dans le
 * logiciel lui-même (dossier atelier-3d/bibliotheque/), dont les variables
 * deviennent les paramètres de l'objet posé.
 *
 * Un modèle chargé : { id, nom, description, modifie_le, document }.
 *
 * Paramètres d'un objet posé : les variables du modèle qui valent un simple
 * nombre. Celles qui sont un calcul (clip_T = ent(…) * clip_lw) suivent
 * toutes seules ; l'inspecteur les montre sans permettre de les changer. Les
 * bornes du modèle s'appliquent aux réglages : une valeur que la conception
 * interdit ne peut pas être posée.
 *
 * Les modèles sont connus ici, au niveau du module, comme les variables dans
 * interface/saisie_de_formules.js : l'application les charge au démarrage et
 * les donne une fois pour toutes, sans les faire passer par chaque fonction.
 */

import { avecVariables, parcourir, trouverNoeud } from "./document.js";
import { avecChamps, avecEnfants, avecParametres, creerNoeud } from "./noeud.js";
import { composer, decomposer, matriceDeTransformation } from "./transformations.js";
import { objetsAffichables } from "./objets_affichables.js";
import { typeDeNoeud, typeExiste, esquissesDuNoeud } from "./registre_types_de_noeuds.js";
import { avecSesEsquisses } from "./esquisse/solides_d_esquisse.js";
import { contenuDe } from "./esquisse/elements_esquisse.js";
import { degresDeLiberte, resoudre } from "./esquisse/contraintes_esquisse.js";
import { nommer } from "./noms_automatiques.js";
import {
  valeursDesVariables, depassements, recalculer, utiliseDesVariables, uniteDe, premierProbleme,
  plageRealisable, valeursUsuellesDe,
} from "./variables.js";

// Un modèle qui contient un objet paramétrique, qui en contient un autre… on s'arrête là.
const PROFONDEUR_MAX = 4;

let modeles = new Map();
let version = 0;

export function connaitreLesModeles(liste) {
  modeles = new Map(liste.map((m) => [m.id, m]));
  version += 1;
}

export const modeleDe = (id) => modeles.get(id) ?? null;
export const listeDesModeles = () => [...modeles.values()].sort((a, b) => a.nom.localeCompare(b.nom));
export const versionDeLaBibliotheque = () => version;

/* Une variable réglable : un simple nombre. Des bornes égales la figent. */
export function estReglable(variable) {
  if (utiliseDesVariables(variable.formule)) return false;
  return !(variable.min && variable.max && variable.min === variable.max);
}

/* Les variables du modèle, les réglages de l'objet à la place des défauts. */
export function variablesAvecReglages(modele, reglages = {}) {
  return modele.document.variables.map((v) => (estReglable(v) && Number.isFinite(reglages[v.id]) ? { ...v, formule: String(reglages[v.id]) } : v));
}

/* Le premier problème de ces réglages, ou null. C'est le message que l'élève
   lira : une borne dépassée d'abord — « la longueur doit rester au moins
   égale à 8,75 mm » dit quoi faire, pas « division par zéro » plus loin dans
   la chaîne de calcul, qui n'en est que la conséquence. */
export function problemeDesReglages(modele, reglages = {}) {
  return premierProbleme(variablesAvecReglages(modele, reglages));
}

// Les paramètres d'un objet, par réglages : l'inspecteur les redemande à chaque
// mise à jour, et chercher leurs plages permises coûte des centaines de calculs.
const parametresConnus = new WeakMap();   // réglages → { cle, liste }

/*
 * Ce que l'inspecteur montre : [{ id, nom, valeur, min, max, raisonMin, raisonMax,
 * unite, aide, valeursUsuelles, reglable, erreur? }], dans l'ordre où l'auteur
 * du modèle a créé ses variables. Pour un paramètre, min et max sont ceux que
 * TOUTES les règles du modèle permettent, les autres réglages restant ce qu'ils sont.
 */
export function parametresDuModele(modele, reglages = {}) {
  const cle = modele.id + "@" + version;
  const connu = parametresConnus.get(reglages);
  if (connu !== undefined && connu.cle === cle) return connu.liste;
  const variables = variablesAvecReglages(modele, reglages);
  const valeurs = valeursDesVariables(variables);
  const liste = variables.map((v) => {
    const reglable = estReglable(v);
    const plage = reglable ? plageRealisable(variables, v.id) : {};
    return {
      id: v.id,
      nom: v.nom,
      valeur: valeurs.get(v.id)?.valeur ?? null,
      erreur: valeurs.get(v.id)?.erreur,
      min: plage.min ?? null,
      max: plage.max ?? null,
      raisonMin: plage.raisonMin ?? null,
      raisonMax: plage.raisonMax ?? null,
      unite: uniteDe(v),
      aide: v.aide ?? "",
      valeursUsuelles: valeursUsuellesDe(v),
      reglable,
    };
  });
  parametresConnus.set(reglages, { cle, liste });
  return liste;
}

// ── Préparer le calcul ──────────────────────────────────────────────────────

const preparations = new WeakMap();   // nœud → { version, resultat }

function avecErreur(noeud, message) {
  return avecEnfants(avecParametres(noeud, { erreurDePreparation: message }), []);
}

function developper(noeud, profondeur) {
  const modele = modeleDe(noeud.parametres.modele);
  if (modele === null) {
    return avecErreur(noeud, "le modèle « " + (noeud.parametres.nomDuModele || noeud.parametres.modele) + " » n'est plus dans la bibliothèque.");
  }
  if (profondeur >= PROFONDEUR_MAX) return avecErreur(noeud, "trop d'objets paramétriques imbriqués les uns dans les autres.");
  const probleme = problemeDesReglages(modele, noeud.parametres.reglages);
  if (probleme !== null) return avecErreur(noeud, probleme);
  const document = recalculer(avecVariables(modele.document, variablesAvecReglages(modele, noeud.parametres.reglages)));
  const pieces = objetsAffichables(document).map((objet) => avecSesModelesA(avecSesEsquisses(document, objet), profondeur + 1));
  if (pieces.length === 0) return avecErreur(noeud, "le modèle « " + modele.nom + " » ne contient aucune pièce visible.");
  // Une seule pièce : l'objet posé prend son aspect, tant qu'on ne lui en donne pas un.
  // (Ce nœud ne sert qu'au calcul et à l'affichage : le document n'en garde rien.)
  const seule = pieces.length === 1 ? pieces[0] : null;
  return avecChamps(noeud, {
    enfants: pieces,
    couleur: noeud.couleur ?? seule?.couleur ?? null,
    finition: noeud.finition ?? seule?.finition ?? null,
  });
}

function avecSesModelesA(noeud, profondeur) {
  if (typeExiste(noeud.type) && typeDeNoeud(noeud.type).reglagesDuModele) {
    const connue = preparations.get(noeud);
    if (connue !== undefined && connue.version === version) return connue.resultat;
    const resultat = developper(noeud, profondeur);
    preparations.set(noeud, { version, resultat });
    return resultat;
  }
  if (noeud.enfants.length === 0) return noeud;
  let change = false;
  const enfants = noeud.enfants.map((enfant) => {
    const resolu = avecSesModelesA(enfant, profondeur);
    if (resolu !== enfant) change = true;
    return resolu;
  });
  return change ? avecEnfants(noeud, enfants) : noeud;
}

/* Le nœud tel que le calcul le reçoit : chaque objet paramétrique porte les
   pièces de son modèle en enfants. Même référence si rien n'est à développer :
   le cache de maillages et la vue comparent par identité. */
export function avecSesModeles(noeud) {
  return avecSesModelesA(noeud, 0);
}

/* Tout ce qu'il faut avant le calcul d'un objet du projet. */
export function pretPourLeCalcul(document, noeud) {
  return avecSesModeles(avecSesEsquisses(document, noeud));
}

// ── Dégrouper un objet posé ─────────────────────────────────────────────────

/* Une copie aux identifiants neufs, sans formules : elles citaient les
   variables du modèle, qui n'existent pas dans le projet. Les valeurs restent. */
function copieSansFormules(noeud, esquissesRenommees) {
  const parametres = { ...noeud.parametres };
  // Les esquisses désignées : l'unique (extrusion), le chemin (balayage), les sections (lissage).
  const renommer = (id) => esquissesRenommees.get(id) ?? id;
  if (typeof parametres.esquisse === "string") parametres.esquisse = renommer(parametres.esquisse);
  if (typeof parametres.chemin === "string") parametres.chemin = renommer(parametres.chemin);
  if (Array.isArray(parametres.sections)) parametres.sections = parametres.sections.map(renommer);
  if (Array.isArray(parametres.contraintes)) {
    parametres.contraintes = parametres.contraintes.map(({ formule: _retiree, ...c }) => c);
  }
  return creerNoeud({
    ...noeud,
    id: undefined,
    parametres,
    formules: {},
    enfants: noeud.enfants.map((enfant) => copieSansFormules(enfant, esquissesRenommees)),
  });
}

/*
 * Les pièces d'un objet posé, telles que ses réglages les font, devenues des
 * objets ordinaires : chacune se place alors seule (le mâle d'un clip dans une
 * pièce, la femelle dans l'autre). Elles ne suivent plus le modèle.
 * Rend { esquisses, pieces } : les esquisses vont à la racine du projet, les
 * pièces à la place de l'objet. Lève une erreur si les réglages sont refusés.
 */
export function piecesDetachees(noeud) {
  const modele = modeleDe(noeud.parametres.modele);
  if (modele === null) throw new Error("Le modèle de cet objet n'est plus dans la bibliothèque : il ne peut pas être dégroupé.");
  const probleme = problemeDesReglages(modele, noeud.parametres.reglages);
  if (probleme !== null) throw new Error(probleme);
  const document = recalculer(avecVariables(modele.document, variablesAvecReglages(modele, noeud.parametres.reglages)));
  const pieces = objetsAffichables(document);

  // Les esquisses dont les pièces sont tirées, une copie chacune.
  const esquissesRenommees = new Map();
  const esquisses = [];
  for (const piece of pieces) {
    for (const { noeud: n } of parcourir(piece)) {
      for (const id of esquissesDuNoeud(n)) {
        if (esquissesRenommees.has(id)) continue;
        const esquisse = trouverNoeud(document, id);
        if (esquisse === null) continue;
        const copie = avecChamps(copieSansFormules(esquisse, esquissesRenommees), { visible: false });
        esquissesRenommees.set(id, copie.id);
        esquisses.push(copie);
      }
    }
  }

  const repere = matriceDeTransformation(noeud.transformation);
  return {
    esquisses,
    pieces: pieces.map((piece) => {
      const place = decomposer(composer(repere, matriceDeTransformation(piece.transformation)));
      return avecChamps(copieSansFormules(piece, esquissesRenommees), {
        transformation: { ...place, appui: piece.transformation.appui },
        // L'aspect et le rôle donnés à l'objet passent à ses pièces.
        couleur: noeud.couleur ?? piece.couleur,
        finition: noeud.finition ?? piece.finition,
        trou: noeud.trou || piece.trou,
      });
    }),
  };
}

// ── Enregistrer un modèle ───────────────────────────────────────────────────

/*
 * Ce qui empêche d'enregistrer ce document comme modèle : [message]. Un
 * modèle doit se recalculer tout seul pour n'importe quel réglage permis :
 * ses esquisses sont donc entièrement contraintes, ses variables calculables
 * et dans leurs bornes. idDuModele : pour refuser un modèle qui se contient.
 */
export function problemesDuModele(document, idDuModele = null) {
  const problemes = [];
  const valeurs = valeursDesVariables(document.variables);
  for (const variable of document.variables) {
    const trouve = valeurs.get(variable.id);
    if (trouve?.erreur !== undefined) problemes.push("« " + variable.nom + " » : " + trouve.erreur);
  }
  problemes.push(...depassements(document.variables, valeurs).map((d) => d.message));

  const pieces = objetsAffichables(document);
  if (pieces.length === 0) problemes.push("Le modèle ne contient aucune pièce visible.");

  const esquissesUtilisees = new Set();
  for (const { noeud } of parcourir(document.racine)) {
    for (const id of esquissesDuNoeud(noeud)) esquissesUtilisees.add(id);
    if (idDuModele !== null && noeud.parametres.modele === idDuModele) {
      problemes.push("Le modèle se contient lui-même (« " + nommer(noeud) + " »).");
    }
  }
  for (const id of esquissesUtilisees) {
    const esquisse = trouverNoeud(document, id);
    if (esquisse === null) continue;
    const contenu = contenuDe(esquisse.parametres);
    const libres = degresDeLiberte(contenu);
    if (libres > 0) {
      problemes.push("« " + nommer(esquisse) + " » a encore " + libres + (libres === 1 ? " degré" : " degrés") + " de liberté : la contraindre entièrement (cotes et relations).");
    } else if (!resoudre(contenu).ok) {
      problemes.push("« " + nommer(esquisse) + " » a des contraintes contradictoires.");
    }
  }
  return problemes;
}

/* L'identifiant de fichier d'un nouveau modèle : son nom sans accents ni espaces. */
export function identifiantDepuisNom(nom) {
  const propre = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  return propre || "objet";
}
