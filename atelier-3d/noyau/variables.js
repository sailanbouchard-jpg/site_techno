/*
 * noyau/variables.js
 * ──────────────────
 * Les variables du projet, et les champs qu'elles pilotent.
 *
 * Une variable : { id, nom, formule, min?, max?, unite?, aide? }. La formule
 * est un nombre (« 7.25 ») ou un calcul sur d'autres variables (« {v1} + 0,3 »),
 * voir expressions.js. Les bornes sont des formules elles aussi : clip_T peut
 * devoir rester au-dessus de « {v_longueur} / 10 ». Une modification qui ferait
 * sortir une variable de ses bornes est refusée (voir depassements).
 * unite : le texte montré dans le champ (« mm » par défaut) ; aide : la phrase
 * de sa bulle, surtout utile dans l'inspecteur d'un objet paramétrique ;
 * valeurs : les valeurs usuelles (« 0,42 ; 0,45 ; 0,62 »), entre lesquelles
 * les flèches du champ sautent.
 *
 * Un champ piloté garde sa formule à côté de sa valeur :
 *   noeud.formules["position.x"] = "{v1} * 2"
 *   noeud.formules["cote.rayon"], ["parametre.hauteur"], ["dimension.z"]…
 *   et, dans une esquisse, contrainte.formule.
 * Le nombre reste rangé à sa place habituelle : la géométrie, l'affichage et
 * l'export n'ont jamais à connaître les formules. Seul recalculer() les relit,
 * quand une variable ou une formule change.
 */

import { evaluer, referencesDe, reecrire, verifierEcriture, NOM_DE_VARIABLE, estUneFonction } from "./expressions.js";
import { avecRacine, parcourir } from "./document.js";
import { avecChamps, avecEnfants, avecParametres, avecTransformation, nouvelIdentifiant } from "./noeud.js";
import { typeDeNoeud, typeExiste } from "./registre_types_de_noeuds.js";
import { changementDeCote, valeursDesCotes } from "./cotes_des_formes.js";
import { contenuDe, recalerLesArcs } from "./esquisse/elements_esquisse.js";
import { changerValeur, resoudre } from "./esquisse/contraintes_esquisse.js";

// En dessous, deux valeurs sont la même : pas de nouveau nœud, pas de nouveau calcul.
const TOLERANCE = 1e-9;

// ── Les variables ───────────────────────────────────────────────────────────

/* Le nom, nettoyé et vérifié ; une erreur dit ce qui ne va pas. idGarde : la
   variable qu'on renomme, qui peut garder son propre nom. */
export function verifierNom(variables, nom, idGarde = null) {
  const propre = String(nom ?? "").trim();
  if (propre === "") throw new Error("Une variable a besoin d'un nom.");
  if (!NOM_DE_VARIABLE.test(propre)) {
    throw new Error("« " + propre + " » : lettres sans accent, chiffres et _ seulement, sans commencer par un chiffre (ex. pile_rayon).");
  }
  if (estUneFonction(propre)) throw new Error("« " + propre + " » est le nom d'une fonction de calcul : choisir un autre nom.");
  // Même nom à une majuscule près : deux variables qu'on confondrait.
  const doublon = variables.find((v) => v.id !== idGarde && v.nom.toLowerCase() === propre.toLowerCase());
  if (doublon !== undefined) throw new Error("Le nom « " + doublon.nom + " » est déjà pris.");
  return propre;
}

export function nouvelleVariable(variables, nom, formule = "0") {
  verifierEcriture(formule);
  return { id: "v" + nouvelIdentifiant(), nom: verifierNom(variables, nom), formule };
}

/* id → { valeur } ou { erreur } : une variable qui dépend d'elle-même, ou
   d'une variable disparue, n'a pas de valeur — sans bloquer les autres. */
export function valeursDesVariables(variables) {
  const parId = new Map(variables.map((v) => [v.id, v]));
  const resultats = new Map();
  const enCours = new Set();

  function resoudreVariable(id) {
    if (resultats.has(id)) return resultats.get(id);
    const variable = parId.get(id);
    if (variable === undefined) return { erreur: "Cette formule utilise une variable supprimée." };
    if (enCours.has(id)) return { erreur: "« " + variable.nom + " » dépend d'elle-même." };
    enCours.add(id);
    let resultat;
    try {
      resultat = { valeur: evaluer(variable.formule, (ref) => lireReference(ref)) };
    } catch (erreur) {
      resultat = { erreur: erreur.message };
    }
    enCours.delete(id);
    resultats.set(id, resultat);
    return resultat;
  }
  function lireReference(ref) {
    if (ref.id === undefined) throw new Error("« " + ref.nom + " » n'est pas une variable du projet.");
    const trouve = resoudreVariable(ref.id);
    if (trouve.erreur !== undefined) throw new Error(trouve.erreur);
    return trouve.valeur;
  }

  for (const variable of variables) resoudreVariable(variable.id);
  return resultats;
}

// ── Les bornes ──────────────────────────────────────────────────────────────

export const UNITE_PAR_DEFAUT = "mm";
// Un tiret : une grandeur sans unité (un frottement, une déformation).
export const SANS_UNITE = "-";
export const uniteDe = (variable) => (variable.unite === SANS_UNITE ? "" : variable.unite ?? UNITE_PAR_DEFAUT);
const lisible = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 4, useGrouping: false });

/* { min, max } en nombres (null : pas de borne), ou { erreur } si une borne
   ne se calcule pas. valeurs : celles de valeursDesVariables. */
export function bornesDe(variable, valeurs) {
  try {
    return {
      min: variable.min ? valeurDeFormule(variable.min, valeurs) : null,
      max: variable.max ? valeurDeFormule(variable.max, valeurs) : null,
    };
  } catch (erreur) {
    return { erreur: "Borne de « " + variable.nom + " » : " + erreur.message };
  }
}

/* Les variables hors de leurs bornes : [{ id, message }]. Un message dit la
   valeur et l'intervalle permis, pour qu'on sache quoi changer. */
export function depassements(variables, valeurs = valeursDesVariables(variables)) {
  const liste = [];
  for (const variable of variables) {
    if (!variable.min && !variable.max) continue;
    const valeur = valeurs.get(variable.id)?.valeur;
    if (valeur === undefined) continue;
    const bornes = bornesDe(variable, valeurs);
    if (bornes.erreur !== undefined) {
      liste.push({ id: variable.id, message: bornes.erreur, borneEnErreur: true });
      continue;
    }
    const tolerance = 1e-9 * Math.max(1, Math.abs(valeur));
    const tropPetite = bornes.min !== null && valeur < bornes.min - tolerance;
    const tropGrande = bornes.max !== null && valeur > bornes.max + tolerance;
    if (!tropPetite && !tropGrande) continue;
    const unite = uniteDe(variable) === "" ? "" : " " + uniteDe(variable);
    const permis = bornes.min !== null && bornes.max !== null
      ? "entre " + lisible(bornes.min) + " et " + lisible(bornes.max) + unite
      : bornes.min !== null ? "au moins " + lisible(bornes.min) + unite : "au plus " + lisible(bornes.max) + unite;
    const origine = tropPetite ? variable.min : variable.max;
    const detail = utiliseDesVariables(origine) ? " (" + versTexte(origine, variables) + ")" : "";
    liste.push({ id: variable.id, message: "« " + variable.nom + " » vaudrait " + lisible(valeur) + unite + " : elle doit rester " + permis + detail + "." });
  }
  return liste;
}

/* Le premier problème de ces variables, ou null. Une borne dépassée passe
   avant une erreur de calcul : « la longueur doit rester au moins égale à
   8,75 mm » dit quoi faire, pas « division par zéro » plus loin dans la
   chaîne, qui n'en est que la conséquence. */
export function premierProbleme(variables) {
  const valeurs = valeursDesVariables(variables);
  const hors = depassements(variables, valeurs);
  const franc = hors.find((d) => !d.borneEnErreur);
  if (franc !== undefined) return franc.message;
  for (const variable of variables) {
    const trouve = valeurs.get(variable.id);
    if (trouve?.erreur !== undefined) return "« " + variable.nom + " » : " + trouve.erreur;
  }
  return hors[0]?.message ?? null;
}

/* Les valeurs usuelles d'une variable, en nombres. */
export function valeursUsuellesDe(variable) {
  if (!variable.valeurs) return [];
  return variable.valeurs.split(";").map((t) => t.trim()).filter((t) => t !== "")
    .map((t) => Number(t.replace(",", "."))).filter((v) => Number.isFinite(v));
}

const ETAPES_DE_RECHERCHE = 32;
// Une borne trouvée par la recherche s'écrit avec trois chiffres significatifs.
const CHIFFRES_DES_BORNES = 3;
// Sans borne déclarée, jusqu'où chercher une limite venue d'une autre variable.
const PORTEE_SANS_BORNE = 1e4;

/*
 * L'intervalle réellement permis à une variable qui vaut un simple nombre,
 * les autres restant ce qu'elles sont : ses propres bornes, mais aussi celles
 * de toutes les variables qui dépendent d'elle. clip_accroche est bornée à
 * 3 mm, mais avec une longueur de 15 mm, la longueur minimale l'arrête à
 * 1,05 mm. Rend { min, max, raisonMin, raisonMax } (null : pas de limite) ;
 * la raison dit ce qui casserait au-delà.
 *
 * La recherche coupe l'intervalle en deux entre la valeur actuelle (permise)
 * et la borne déclarée : elle suppose qu'au-delà de la limite, tout reste
 * interdit — ce qui est le cas d'une règle de conception.
 */
export function plageRealisable(variables, id) {
  const variable = variables.find((v) => v.id === id);
  const valeurs = valeursDesVariables(variables);
  const depart = valeurs.get(id)?.valeur;
  const declarees = variable === undefined ? {} : bornesDe(variable, valeurs);
  const resultat = { min: declarees.min ?? null, max: declarees.max ?? null, raisonMin: null, raisonMax: null };
  if (variable === undefined || depart === undefined || utiliseDesVariables(variable.formule)) return resultat;
  const avec = (v) => variables.map((w) => (w.id === id ? { ...w, formule: String(v) } : w));
  if (premierProbleme(avec(depart)) !== null) return resultat;

  for (const sens of [1, -1]) {
    const declaree = sens > 0 ? declarees.max : declarees.min;
    const loin = declaree ?? depart + sens * Math.max(PORTEE_SANS_BORNE, Math.abs(depart) * 100);
    const problemeLoin = premierProbleme(avec(loin));
    if (problemeLoin === null) continue;   // la borne déclarée est atteignable : elle reste
    let permise = depart;
    let interdite = loin;
    let raison = problemeLoin;
    for (let i = 0; i < ETAPES_DE_RECHERCHE; i += 1) {
      const milieu = (permise + interdite) / 2;
      const probleme = premierProbleme(avec(milieu));
      if (probleme === null) permise = milieu;
      else {
        interdite = milieu;
        raison = probleme;
      }
    }
    // Arrondie vers l'intérieur, à trois chiffres : la borne affichée reste
    // permise, et se lit (31,4 plutôt que 31,4999).
    const quantum = Math.abs(permise) > 0 ? 10 ** (Math.floor(Math.log10(Math.abs(permise))) - CHIFFRES_DES_BORNES + 1) : 1e-6;
    const lisible = (v) => Number(v.toFixed(Math.max(0, -Math.floor(Math.log10(quantum)))));
    const arrondie = sens > 0
      ? Math.max(depart, lisible(Math.floor(permise / quantum + 1e-9) * quantum))
      : Math.min(depart, lisible(Math.ceil(permise / quantum - 1e-9) * quantum));
    const texte = "au-delà, " + raison.replace(/\.$/, "");
    if (sens > 0) Object.assign(resultat, { max: arrondie, raisonMax: texte });
    else Object.assign(resultat, { min: arrondie, raisonMin: texte });
  }
  return resultat;
}

/* La valeur d'une formule, avec les valeurs de valeursDesVariables. */
export function valeurDeFormule(formule, valeurs) {
  return evaluer(formule, (ref) => {
    const trouve = ref.id === undefined ? undefined : valeurs.get(ref.id);
    if (trouve === undefined) throw new Error("Cette formule utilise une variable supprimée.");
    if (trouve.erreur !== undefined) throw new Error(trouve.erreur);
    return trouve.valeur;
  });
}

/* Ce que l'élève a tapé, les noms remplacés par les identifiants. */
export function versFormule(texte, variables) {
  return reecrire(texte, {
    remplacerNom(nom) {
      const variable = variables.find((v) => v.nom === nom)
        ?? variables.find((v) => v.nom.toLowerCase() === nom.toLowerCase());
      if (variable === undefined) throw new Error("« " + nom + " » n'est pas une variable du projet.");
      return "{" + variable.id + "}";
    },
  });
}

/* Et l'inverse, pour l'affichage. Une variable disparue s'écrit « ? ». */
export function versTexte(formule, variables) {
  return reecrire(formule, {
    remplacerReference: (id) => variables.find((v) => v.id === id)?.nom ?? "?",
  });
}

export const utiliseDesVariables = (formule) => referencesDe(formule).size > 0;

// ── Les champs d'un nœud ────────────────────────────────────────────────────

function descriptionDuParametre(noeud, cle) {
  return typeExiste(noeud.type) ? typeDeNoeud(noeud.type).parametres?.[cle] : undefined;
}

/* La valeur actuelle d'un champ, pour la comparer à celle de sa formule.
   dimensions : { lire(noeud, axe), ecrire(noeud, axe, v) } — une dimension de
   groupe dépend de son maillage, que seule l'application connaît. */
export function lireChamp(noeud, cle, dimensions = null) {
  const [famille, sous] = cle.split(".");
  if (famille === "position" || famille === "rotation") return noeud.transformation[famille][sous];
  if (famille === "parametre") return noeud.parametres[sous] ?? descriptionDuParametre(noeud, sous)?.defaut;
  if (famille === "cote") return valeursDesCotes(typeDeNoeud(noeud.type), noeud)[sous];
  if (famille === "dimension") return dimensions?.lire(noeud, sous) ?? noeud.transformation.echelle[sous];
  // Un réglage d'objet paramétrique jamais touché vaut le défaut du modèle, que le noyau ne lit pas ici.
  if (famille === "reglage") return noeud.parametres.reglages?.[sous] ?? Number.NaN;
  return undefined;
}

function bornerAuParametre(description, valeur) {
  let v = valeur;
  if (description.min !== undefined) v = Math.max(description.min, v);
  if (description.max !== undefined) v = Math.min(description.max, v);
  return description.entier ? Math.round(v) : v;
}

/* Le nœud avec ce champ à cette valeur. Une valeur que la forme refuse lève
   une erreur : le champ garde alors la précédente. */
export function ecrireChamp(noeud, cle, valeur, dimensions = null) {
  const [famille, sous] = cle.split(".");
  if (famille === "position" || famille === "rotation") {
    return avecTransformation(noeud, { [famille]: { ...noeud.transformation[famille], [sous]: valeur } });
  }
  if (famille === "parametre") {
    const description = descriptionDuParametre(noeud, sous);
    return description === undefined ? noeud : avecParametres(noeud, { [sous]: bornerAuParametre(description, valeur) });
  }
  if (famille === "cote") {
    const type = typeDeNoeud(noeud.type);
    const cote = type.cotes?.find((c) => c.cle === sous);
    if (cote === undefined) return noeud;
    const { transformation, parametres } = changementDeCote(type, noeud, sous, Math.max(cote.min ?? -Infinity, valeur));
    return avecChamps(noeud, { transformation, parametres: { ...noeud.parametres, ...parametres } });
  }
  if (famille === "dimension") {
    const transformation = dimensions?.ecrire(noeud, sous, valeur) ?? null;
    return transformation === null ? noeud : avecChamps(noeud, { transformation });
  }
  if (famille === "reglage") return avecParametres(noeud, { reglages: { ...(noeud.parametres.reglages ?? {}), [sous]: valeur } });
  return noeud;
}

/* Le nœud avec cette formule sur ce champ (null la retire). */
export function avecFormule(noeud, cle, formule) {
  const formules = { ...noeud.formules };
  if (formule === null) delete formules[cle];
  else formules[cle] = formule;
  return avecChamps(noeud, { formules });
}

// ── Recalculer ──────────────────────────────────────────────────────────────

function recalculerEsquisse(noeud, valeurDe) {
  let contenu = contenuDe(noeud.parametres);
  let change = false;
  for (const contrainte of contenu.contraintes) {
    if (!contrainte.formule) continue;
    try {
      const valeur = valeurDe(contrainte.formule);
      // Une cote orientée garde une valeur positive et retourne son sens.
      const actuelle = contrainte.sens !== undefined && valeur < 0 ? -contrainte.valeur : contrainte.valeur;
      if (Math.abs(actuelle - valeur) < TOLERANCE) continue;
      contenu = changerValeur(contenu, contrainte.id, valeur, contrainte.formule);
      change = true;
    } catch (_erreur) {
      // Valeur refusée (longueur négative…) : la cote garde la précédente.
    }
  }
  if (!change) return noeud;
  const fini = recalerLesArcs(resoudre(contenu).contenu);
  return avecParametres(noeud, { points: fini.points, courbes: fini.courbes, contraintes: fini.contraintes });
}

function recalculerNoeud(noeud, valeurDe, dimensions) {
  const enfants = noeud.enfants.map((enfant) => recalculerNoeud(enfant, valeurDe, dimensions));
  let courant = enfants.some((e, i) => e !== noeud.enfants[i]) ? avecEnfants(noeud, enfants) : noeud;

  for (const [cle, formule] of Object.entries(courant.formules)) {
    try {
      const valeur = valeurDe(formule);
      if (Math.abs(lireChamp(courant, cle, dimensions) - valeur) < TOLERANCE) continue;
      courant = ecrireChamp(courant, cle, valeur, dimensions);
    } catch (_erreur) {
      // Variable en erreur, ou valeur que la forme refuse : le champ garde la précédente.
    }
  }
  if ((courant.parametres.contraintes ?? []).some((c) => c.formule)) courant = recalculerEsquisse(courant, valeurDe);
  return courant;
}

/* Le document où chaque champ piloté vaut sa formule. Les branches sans
   formule gardent leur référence : la vue ne les recalcule pas. */
export function recalculer(document, dimensions = null) {
  const valeurs = valeursDesVariables(document.variables);
  const racine = recalculerNoeud(document.racine, (formule) => valeurDeFormule(formule, valeurs), dimensions);
  return racine === document.racine ? document : avecRacine(document, racine);
}

// ── Qui utilise quoi ────────────────────────────────────────────────────────

/* id de variable → nombre de champs (et de variables) qui s'en servent. */
export function usagesDesVariables(document) {
  const compte = new Map();
  const noter = (formule) => {
    for (const id of referencesDe(formule)) compte.set(id, (compte.get(id) ?? 0) + 1);
  };
  for (const variable of document.variables) {
    noter(variable.formule);
    if (variable.min) noter(variable.min);
    if (variable.max) noter(variable.max);
  }
  for (const { noeud } of parcourir(document.racine)) {
    for (const formule of Object.values(noeud.formules)) noter(formule);
    for (const contrainte of noeud.parametres.contraintes ?? []) if (contrainte.formule) noter(contrainte.formule);
  }
  return compte;
}

/* Réécrit toutes les formules ; celles qui n'utilisent plus aucune variable
   disparaissent, le champ garde sa valeur. */
function reecrireLesFormules(document, reecrireUne) {
  const garder = (formule) => {
    const nouvelle = reecrireUne(formule);
    return utiliseDesVariables(nouvelle) ? nouvelle : null;
  };
  const noeudReecrit = (noeud) => {
    const enfants = noeud.enfants.map(noeudReecrit);
    let courant = enfants.some((e, i) => e !== noeud.enfants[i]) ? avecEnfants(noeud, enfants) : noeud;
    const cles = Object.keys(courant.formules);
    if (cles.length > 0) {
      const formules = {};
      for (const cle of cles) {
        const nouvelle = garder(courant.formules[cle]);
        if (nouvelle !== null) formules[cle] = nouvelle;
      }
      courant = avecChamps(courant, { formules });
    }
    const contraintes = courant.parametres.contraintes ?? [];
    if (contraintes.some((c) => c.formule)) {
      courant = avecParametres(courant, {
        contraintes: contraintes.map((c) => {
          if (!c.formule) return c;
          const nouvelle = garder(c.formule);
          if (nouvelle !== null) return { ...c, formule: nouvelle };
          const { formule: _retiree, ...sans } = c;
          return sans;
        }),
      });
    }
    return courant;
  };
  return avecRacine(document, noeudReecrit(document.racine));
}

/* Retire une variable : là où elle servait, sa valeur est écrite à la place.
   Rien ne bouge dans le dessin, et l'annulation la rend avec ses usages. */
export function sansLaVariable(document, id) {
  const valeurs = valeursDesVariables(document.variables);
  const trouvee = valeurs.get(id);
  const valeur = trouvee?.valeur ?? 0;
  const ecrite = "(" + String(Math.round(valeur * 1e6) / 1e6) + ")";
  const remplacer = (formule) => reecrire(formule, { remplacerReference: (ref) => (ref === id ? ecrite : "{" + ref + "}") });
  const restantes = document.variables
    .filter((v) => v.id !== id)
    .map((v) => {
      const propre = { ...v, formule: remplacer(v.formule) };
      if (v.min) propre.min = remplacer(v.min);
      if (v.max) propre.max = remplacer(v.max);
      return propre;
    });
  const allegee = reecrireLesFormules(document, remplacer);
  return Object.freeze({ ...allegee, variables: Object.freeze(restantes) });
}

/*
 * Après une commande ordinaire (un glisser, une flèche du clavier, un champ
 * tapé sans formule) : les formules dont le champ a changé de valeur ne
 * pilotent plus rien — on les retire, sinon la prochaine variable modifiée
 * remettrait l'objet ailleurs sans prévenir. Rend [{ id, avant, apres }].
 */
export function formulesDevenuesCaduques(avant, apres) {
  const pilotes = [...parcourir(apres.racine)].filter(({ noeud }) => Object.keys(noeud.formules).length > 0);
  if (pilotes.length === 0) return [];
  const anciens = new Map([...parcourir(avant.racine)].map(({ noeud }) => [noeud.id, noeud]));
  const retraits = [];
  for (const { noeud } of pilotes) {
    const ancien = anciens.get(noeud.id);
    if (ancien === undefined || ancien === noeud) continue;
    const formules = { ...noeud.formules };
    for (const [cle, formule] of Object.entries(noeud.formules)) {
      if (ancien.formules[cle] !== formule) continue;   // la commande a posé cette formule elle-même
      let a;
      let b;
      try {
        a = lireChamp(ancien, cle);
        b = lireChamp(noeud, cle);
      } catch (_erreur) {
        continue;
      }
      if (Math.abs(a - b) > 1e-6) delete formules[cle];
    }
    if (Object.keys(formules).length !== Object.keys(noeud.formules).length) {
      retraits.push({ id: noeud.id, avant: noeud.formules, apres: formules });
    }
  }
  return retraits;
}
