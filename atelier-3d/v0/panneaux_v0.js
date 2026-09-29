/*
 * v0/panneaux_v0.js
 * ─────────────────
 * Les panneaux du jalon V0 : l'arbre de construction, la barre d'état, l'état
 * des boutons. Du DOM et rien d'autre — aucun import de three.js, conformément
 * à la séparation des couches.
 *
 * Provisoire, comme tout ce qui porte « v0 » : en V1, chacun de ces blocs
 * devient un fichier de interface/ à part entière, avec le soin qui va avec.
 */

import { parcourir, trouverNoeud, compterNoeuds } from "../noyau/document.js";
import { etiquetteDuType } from "../noyau/registre_types_de_noeuds.js";

export { couleursDeLaVue } from "../interface/couleurs_de_la_vue.js";
export { telecharger } from "../interface/telechargement.js";

const element = (id) => document.getElementById(id);

let messageCourant = "";

export function annoncer(texte, estUneErreur = false) {
  messageCourant = texte;
  const champ = element("etat-message");
  champ.textContent = texte;
  champ.className = estUneErreur ? "alerte" : "";
}

export function messageDEtat() {
  return messageCourant;
}

export function dessinerArbre(document_, selection) {
  const liste = element("arbre");
  liste.textContent = "";

  for (const { noeud, profondeur } of parcourir(document_.racine)) {
    if (profondeur === 0) continue;   // la racine n'est pas un objet

    const ligne = document.createElement("li");
    ligne.dataset.id = noeud.id;
    ligne.className = noeud.id === selection ? "choisi" : "";
    ligne.style.paddingLeft = 4 + (profondeur - 1) * 12 + "px";
    ligne.textContent = noeud.nom !== "" ? noeud.nom : etiquetteDuType(noeud.type);

    if (noeud.trou) {
      const marque = document.createElement("span");
      marque.className = "marque-trou";
      marque.textContent = " · trou";
      ligne.appendChild(marque);
    }
    liste.appendChild(ligne);
  }
}

/*
 * tailleDeLaSelection est fourni par l'appelant : c'est la vue 3D qui connaît
 * la boîte englobante d'un objet une fois posé, et l'interface n'a pas le droit
 * d'aller la chercher elle-même dans three.js.
 */
export function dessinerBarreDEtat(document_, selection, maillages, tailleDeLaSelection) {
  element("etat-objets").textContent = compterNoeuds(document_) + " objets";

  const noeud = selection === null ? null : trouverNoeud(document_, selection);
  if (noeud === null) {
    element("etat-selection").textContent = "";
  } else if (tailleDeLaSelection === null) {
    element("etat-selection").textContent = "Sélection : " + (noeud.nom || etiquetteDuType(noeud.type));
  } else {
    const cotes = tailleDeLaSelection.map((valeur) => valeur.toFixed(1)).join(" × ");
    element("etat-selection").textContent = "Sélection : " + cotes + " mm";
  }

  const voyant = element("etat-etancheite");
  if (maillages.length === 0) {
    voyant.textContent = "";
    voyant.className = "";
  } else if (maillages.every((maillage) => maillage.etanche)) {
    voyant.textContent = "maillage étanche";
    voyant.className = "etanche";
  } else {
    voyant.textContent = "maillage NON étanche — ne pas imprimer";
    voyant.className = "alerte";
  }
}

export function majBoutons(document_, selection) {
  const noeud = selection === null ? null : trouverNoeud(document_, selection);

  element("bouton-supprimer").disabled = noeud === null;
  element("case-trou").disabled = noeud === null;
  element("case-trou").checked = noeud !== null && noeud.trou;
  element("bouton-grouper").disabled = document_.racine.enfants.length < 2;
}

export function majBoutonsAnnulation(peutAnnulerMaintenant, peutRefaireMaintenant) {
  element("bouton-annuler").disabled = !peutAnnulerMaintenant;
  element("bouton-refaire").disabled = !peutRefaireMaintenant;
}
