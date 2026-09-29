/*
 * interface/saisie_de_formules.js
 * ───────────────────────────────
 * Ce que les champs savent des variables du projet. L'application donne la
 * liste à chaque changement du document ; les champs, l'auto-complétion et
 * l'éditeur de cote la lisent ici, sans qu'on la fasse passer par chacun des
 * trente endroits qui créent un champ.
 */

import { valeursDesVariables, versFormule, versTexte, utiliseDesVariables } from "../noyau/variables.js";
import { evaluer } from "../noyau/expressions.js";

let variables = [];
let valeurs = new Map();

export function connaitreLesVariables(liste) {
  if (liste === variables) return;
  variables = liste;
  valeurs = valeursDesVariables(liste);
}

/* Pour l'auto-complétion : [{ id, nom, valeur }] ; valeur null si en erreur. */
export function variablesDuProjet() {
  return variables.map((v) => ({ id: v.id, nom: v.nom, valeur: valeurs.get(v.id)?.valeur ?? null }));
}

export function valeurDeVariable(id) {
  return valeurs.get(id) ?? { erreur: "Variable inconnue." };
}

/* « 12,5 » ou « 1 000 » : un nombre français, sans calcul. */
function nombreSimple(texte) {
  const propre = texte.replace(/[\s  ]/g, "").replace(",", ".");
  if (propre === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(propre)) return null;
  return Number(propre);
}

/*
 * Ce que l'élève a tapé → { valeur, formule } ; formule null quand le calcul
 * n'utilise aucune variable (« 20 / 3 » donne un nombre, pas une formule).
 * avecVariables : le champ accepte les variables. Lève une erreur lisible.
 */
export function lireSaisie(texte, avecVariables) {
  const simple = nombreSimple(texte);
  if (simple !== null) return { valeur: simple, formule: null };
  if (texte.trim() === "") throw new Error("Le champ est vide.");
  const formule = versFormule(texte.trim(), variables);
  if (utiliseDesVariables(formule) && !avecVariables) {
    throw new Error("Ce champ n'accepte que des nombres et des calculs, pas les variables.");
  }
  const valeur = evaluer(formule, (ref) => {
    const trouve = valeurs.get(ref.id);
    if (trouve === undefined) throw new Error("Variable inconnue.");
    if (trouve.erreur !== undefined) throw new Error(trouve.erreur);
    return trouve.valeur;
  });
  return { valeur, formule: utiliseDesVariables(formule) ? formule : null };
}

/* Une formule du document, avec les noms d'aujourd'hui. */
export function texteDeFormule(formule) {
  return formule === null || formule === undefined ? null : versTexte(formule, variables);
}
