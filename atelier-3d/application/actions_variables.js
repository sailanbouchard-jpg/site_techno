/*
 * application/actions_variables.js
 * ────────────────────────────────
 * Ce qu'on fait des variables du projet : les créer, les renommer, changer
 * leur valeur, les retirer, et poser une formule sur un champ. Chaque action
 * recalcule tous les champs pilotés et en fait une seule commande : changer
 * pile_rayon qui déplace dix objets s'annule d'un Ctrl+Z.
 */

import { trouverNoeud, remplacerNoeud, avecVariables, parcourir } from "../noyau/document.js";
import {
  nouvelleVariable, verifierNom, valeursDesVariables, recalculer, sansLaVariable, usagesDesVariables, avecFormule, depassements,
} from "../noyau/variables.js";
import { modeleDe, problemeDesReglages } from "../noyau/bibliotheque_d_objets.js";
import { verifierEcriture } from "../noyau/expressions.js";
import { commandeModifierVariables } from "../noyau/commandes/commande_modifier_variables.js";
import { commandeModifierProprietes } from "../noyau/commandes/commande_modifier_proprietes.js";

const nombreLisible = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 3, useGrouping: false });

/*
 * Ce que la modification casserait : une variable qui sort de ses bornes, ou
 * un objet paramétrique dont un réglage piloté sort de celles de son modèle.
 * Seules comptent les nouveautés — ce qui était déjà hors bornes (un modèle
 * changé depuis) ne bloque pas les autres modifications. Rend un message, ou null.
 */
function ceQuiSortDesBornes(avant, apres) {
  const dejaHors = new Set(depassements(avant.variables).map((d) => d.id));
  const nouveau = depassements(apres.variables).find((d) => !dejaHors.has(d.id));
  if (nouveau !== undefined) return nouveau.message;
  const anciens = new Map([...parcourir(avant.racine)].map(({ noeud }) => [noeud.id, noeud]));
  for (const { noeud } of parcourir(apres.racine)) {
    const reglages = noeud.parametres.reglages;
    if (reglages === undefined || anciens.get(noeud.id)?.parametres.reglages === reglages) continue;
    const modele = modeleDe(noeud.parametres.modele);
    const probleme = modele === null ? null : problemeDesReglages(modele, reglages);
    if (probleme !== null) return probleme;
  }
  return null;
}

/* dimensions : { lire(noeud, axe), ecrire(noeud, axe, v) } pour les groupes, voir noyau/variables.js. */
export function creerActionsVariables({ etat, annoncer, dimensions }) {
  /* fabriquer(document) → document modifié ; cle : voir la commande (fusion des flèches). */
  function changer(fabriquer, libelle, cle = null) {
    try {
      const avant = etat.document();
      const brut = fabriquer(avant);
      if (brut === avant) return true;
      const apres = recalculer(brut, dimensions);
      const hors = ceQuiSortDesBornes(avant, apres);
      if (hors !== null) throw new Error(hors);
      etat.executer(commandeModifierVariables.creer(avant, apres, libelle, cle));
      return true;
    } catch (erreur) {
      annoncer(erreur.message, true);
      return false;
    }
  }

  const variableParId = (id) => etat.document().variables.find((v) => v.id === id);

  return {
    /* Rend l'identifiant de la nouvelle variable, ou lève l'erreur du nom
       (le panneau l'affiche sous le champ plutôt qu'en bas de l'écran). */
    ajouter(nom) {
      const variable = nouvelleVariable(etat.document().variables, nom, "0");
      changer((document) => avecVariables(document, [...document.variables, variable]), "Nouvelle variable");
      return variable.id;
    },

    /* Lève l'erreur du nom, comme ajouter. Les formules désignent la variable
       par son identifiant : aucune n'est à réécrire. */
    renommer(id, nom) {
      const propre = verifierNom(etat.document().variables, nom, id);
      if (variableParId(id)?.nom === propre) return;
      changer((document) => avecVariables(document, document.variables.map((v) => (v.id === id ? { ...v, nom: propre } : v))), "Renommer la variable");
    },

    /* formule : un calcul sur d'autres variables, ou null pour un simple nombre.
       Rend false si la valeur est refusée (hors bornes, dépendance circulaire). */
    changerValeur(id, valeur, formule) {
      const texte = formule ?? String(valeur);
      verifierEcriture(texte);
      return changer((document) => {
        const modifie = avecVariables(document, document.variables.map((v) => (v.id === id ? { ...v, formule: texte } : v)));
        const resultat = valeursDesVariables(modifie.variables).get(id);
        if (resultat?.erreur !== undefined) throw new Error(resultat.erreur);
        return modifie;
      }, "Valeur de variable", "valeur:" + id);
    },

    /* bornes : { min, max }, des formules (identifiants) ou null pour retirer
       la borne. Refusé si la valeur actuelle en sortirait : on borne pour
       protéger une valeur juste, pas pour la corriger en douce. */
    borner(id, { min, max }) {
      for (const borne of [min, max]) if (borne) verifierEcriture(borne);
      return changer((document) => avecVariables(document, document.variables.map((v) => {
        if (v.id !== id) return v;
        const { min: _a, max: _b, ...sans } = v;
        return { ...sans, ...(min ? { min } : {}), ...(max ? { max } : {}) };
      })), "Bornes de variable");
    },

    /* L'unité affichée, la phrase d'aide et les valeurs usuelles (« 0,42 ; 0,45 ») ;
       "" les retire. Une valeur usuelle qui n'est pas un nombre est refusée. */
    decrire(id, { unite, aide, valeurs }) {
      let propresValeurs = null;
      if (valeurs !== undefined) {
        const morceaux = valeurs.split(";").map((t) => t.trim()).filter((t) => t !== "");
        const faux = morceaux.find((t) => !Number.isFinite(Number(t.replace(",", "."))));
        if (faux !== undefined) {
          annoncer("« " + faux + " » n'est pas un nombre : valeurs usuelles séparées par « ; », ex. 0,42 ; 0,45.", true);
          return false;
        }
        propresValeurs = morceaux.join(" ; ");
      }
      return changer((document) => avecVariables(document, document.variables.map((v) => {
        if (v.id !== id) return v;
        const { unite: _u, aide: _a, valeurs: _v, ...sans } = v;
        const propreUnite = (unite ?? v.unite ?? "").trim().slice(0, 12);
        const propreAide = (aide ?? v.aide ?? "").trim().slice(0, 300);
        const lesValeurs = propresValeurs ?? v.valeurs ?? "";
        return {
          ...sans,
          ...(propreUnite ? { unite: propreUnite } : {}),
          ...(propreAide ? { aide: propreAide } : {}),
          ...(lesValeurs ? { valeurs: lesValeurs } : {}),
        };
      })), "Description de variable");
    },

    /* Là où elle servait, sa valeur est écrite à la place : rien ne bouge. */
    supprimer(id) {
      const variable = variableParId(id);
      if (variable === undefined) return;
      const usages = usagesDesVariables(etat.document()).get(id) ?? 0;
      const valeur = valeursDesVariables(etat.document().variables).get(id)?.valeur ?? 0;
      if (!changer((document) => sansLaVariable(document, id), "Supprimer la variable")) return;
      annoncer(usages === 0
        ? "Variable « " + variable.nom + " » supprimée."
        : "Variable « " + variable.nom + " » supprimée : " + (usages === 1 ? "le champ qui l'utilisait garde" : "les " + usages + " champs qui l'utilisaient gardent")
          + " sa valeur, " + nombreLisible(valeur) + ".");
    },

    usages: () => usagesDesVariables(etat.document()),
    valeurs: () => valeursDesVariables(etat.document().variables),

    poserFormule(idNoeud, cle, formule) {
      changer((document) => {
        const noeud = trouverNoeud(document, idNoeud);
        if (noeud === null) throw new Error("Cet objet n'existe plus.");
        return remplacerNoeud(document, idNoeud, avecFormule(noeud, cle, formule));
      }, "Formule");
    },

    /* Un nombre tapé à la place d'une formule : le champ redevient libre. Si
       la valeur a changé, la commande l'a déjà fait (voir etat_application.js). */
    retirerFormule(idNoeud, cle) {
      const noeud = trouverNoeud(etat.document(), idNoeud);
      if (noeud === null || noeud.formules[cle] === undefined) return;
      const { [cle]: _retiree, ...restantes } = noeud.formules;
      etat.executer(commandeModifierProprietes.creer(idNoeud, { formules: noeud.formules }, { formules: restantes }));
    },

    /* La formule d'un champ (le champ la réécrit avec les noms), ou null. */
    formuleDe: (noeud, cle) => noeud.formules[cle] ?? null,

    /* Un champ de l'inspecteur validé : formule posée, ou valeur ordinaire
       (modifier()) qui libère le champ — sauf si modifier() rend false : la
       valeur a été refusée, la formule reste. */
    valider(idNoeud, cle, formule, modifier) {
      if (formule) {
        this.poserFormule(idNoeud, cle, formule);
        return;
      }
      if (modifier() === false) return;
      this.retirerFormule(idNoeud, cle);
    },
  };
}
