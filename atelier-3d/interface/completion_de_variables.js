/*
 * interface/completion_de_variables.js
 * ────────────────────────────────────
 * Dès qu'on tape des lettres dans un champ, la liste des variables qui
 * commencent ainsi s'ouvre sous le champ : « pi » propose pile_rayon,
 * pile_longueur… Flèches pour choisir, Entrée ou Tab pour prendre, Échap pour
 * fermer. Les noms qui contiennent les lettres ailleurs suivent, après.
 *
 * Le même petit cadre, en rouge, dit pourquoi un calcul est refusé.
 */

import { creer } from "./elements.js";
import { variablesDuProjet } from "./saisie_de_formules.js";

const PROPOSITIONS_MAX = 8;
const DUREE_ERREUR_MS = 4000;
const MOT_EN_COURS = /[A-Za-z_][A-Za-z0-9_]*$/;

// Un seul cadre pour tout l'atelier : un seul champ a le focus à la fois.
let cadre = null;
let erreurEnCours = null;
let champOuvert = null;   // le champ dont la liste est ouverte

function cadreFlottant() {
  if (cadre === null) {
    cadre = creer("div", { classe: "cadre-completion", attributs: { role: "listbox", hidden: "" } });
    document.body.append(cadre);
  }
  return cadre;
}

function placerSous(saisie) {
  const rect = saisie.getBoundingClientRect();
  const c = cadreFlottant();
  c.style.left = Math.round(rect.left) + "px";
  c.style.top = Math.round(rect.bottom + 2) + "px";
  c.style.minWidth = Math.round(Math.max(rect.width, 160)) + "px";
}

function fermerCadre() {
  champOuvert = null;
  if (cadre !== null) {
    cadre.hidden = true;
    cadre.replaceChildren();
    cadre.classList.remove("erreur");
  }
}

const valeurLisible = (v) => (v === null ? "erreur" : v.toLocaleString("fr-FR", { maximumFractionDigits: 3, useGrouping: false }) + " mm");

/* Un message sous le champ, quelques secondes : le calcul refusé, et pourquoi. */
export function montrerErreurSous(saisie, message) {
  clearTimeout(erreurEnCours);
  placerSous(saisie);
  const c = cadreFlottant();
  c.replaceChildren(creer("div", { classe: "message-completion", texte: message }));
  c.classList.add("erreur");
  c.hidden = false;
  erreurEnCours = setTimeout(fermerCadre, DUREE_ERREUR_MS);
}

/* À appeler AVANT d'écouter soi-même le clavier du champ : quand la liste est
   ouverte, Entrée, Tab, Échap et les flèches sont pour elle. */
export function brancherCompletion(saisie) {
  let choix = [];
  let rang = 0;
  const ouverte = () => champOuvert === saisie;

  function motEnCours() {
    const avant = saisie.value.slice(0, saisie.selectionStart ?? saisie.value.length);
    const trouve = MOT_EN_COURS.exec(avant);
    return trouve === null ? null : { debut: trouve.index, mot: trouve[0] };
  }

  function fermer() {
    if (ouverte()) fermerCadre();
  }

  function dessiner() {
    const c = cadreFlottant();
    c.classList.remove("erreur");
    c.replaceChildren(...choix.map((v, i) => {
      const ligne = creer("div", { classe: i === rang ? "choix-completion actif" : "choix-completion", attributs: { role: "option" } }, [
        creer("span", { classe: "nom-completion", texte: v.nom }),
        creer("span", { classe: "valeur-completion", texte: valeurLisible(v.valeur) }),
      ]);
      // Au pointerdown, et sans perdre le focus : le blur fermerait la liste avant le clic.
      ligne.addEventListener("pointerdown", (evenement) => {
        evenement.preventDefault();
        prendre(i);
      });
      return ligne;
    }));
  }

  function proposer() {
    const enCours = motEnCours();
    if (enCours === null) return fermer();
    const bas = enCours.mot.toLowerCase();
    const toutes = variablesDuProjet();
    const debut = toutes.filter((v) => v.nom.toLowerCase().startsWith(bas));
    const dedans = toutes.filter((v) => !v.nom.toLowerCase().startsWith(bas) && v.nom.toLowerCase().includes(bas));
    const parNom = (a, b) => a.nom.localeCompare(b.nom);
    choix = [...debut.sort(parNom), ...dedans.sort(parNom)].slice(0, PROPOSITIONS_MAX);
    // Le nom est déjà tapé en entier, et seul : rien à proposer.
    if (choix.length === 0 || (choix.length === 1 && choix[0].nom === enCours.mot)) return fermer();
    rang = Math.min(rang, choix.length - 1);
    clearTimeout(erreurEnCours);
    placerSous(saisie);
    dessiner();
    cadreFlottant().hidden = false;
    champOuvert = saisie;
  }

  function prendre(i) {
    const enCours = motEnCours();
    const variable = choix[i];
    fermer();
    if (enCours === null || variable === undefined) return;
    saisie.setRangeText(variable.nom, enCours.debut, saisie.selectionStart, "end");
    saisie.dispatchEvent(new Event("input", { bubbles: true }));
  }

  saisie.addEventListener("keydown", (evenement) => {
    if (!ouverte()) return;
    const touche = evenement.key;
    if (touche === "ArrowDown" || touche === "ArrowUp") {
      rang = (rang + (touche === "ArrowDown" ? 1 : -1) + choix.length) % choix.length;
      dessiner();
    } else if (touche === "Enter" || touche === "Tab") {
      prendre(rang);
    } else if (touche === "Escape") {
      fermer();
    } else {
      return;
    }
    evenement.preventDefault();
    evenement.stopImmediatePropagation();
  });
  saisie.addEventListener("input", () => {
    rang = 0;
    proposer();
  });
  saisie.addEventListener("blur", fermer);
}

// Le panneau défile sous la liste : elle se détacherait du champ. Le texte
// qui défile DANS le champ, quand la formule dépasse sa largeur, n'y est pour rien.
globalThis.addEventListener("scroll", (evenement) => {
  if (champOuvert !== null && evenement.target !== champOuvert) fermerCadre();
}, true);
