/*
 * interface/panneau_variables.js
 * ──────────────────────────────
 * Le bouton « Variables » au bout du bandeau, et le panneau qu'il déroule :
 * une ligne par variable (nom, valeur en mm), triées par nom — la convention
 * pile_rayon, pile_longueur… les range d'elle-même par pièce. Nom et valeur
 * se modifient à tout moment ; la valeur peut elle-même être un calcul sur
 * d'autres variables.
 *
 * « Nouvelle variable » ouvre une ligne dont le nom est à taper : elle
 * n'entre dans le projet qu'une fois nommée, ce qui évite les variables
 * sans nom qu'aucun champ ne pourrait appeler.
 *
 * Un clic dans une ligne déplie ses réglages dessous : bornes (des nombres
 * ou des calculs sur d'autres variables), unité, phrase d'aide et
 * suppression. Une seule fiche est ouverte à la fois ; un clic ailleurs la
 * referme. Le crochet [—] en bout de ligne signale une variable bornée.
 * Une variable bornée ne peut plus sortir de son intervalle, ni par son champ,
 * ni par une autre variable dont elle dépend.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";
import { montrerErreurSous } from "./completion_de_variables.js";
import { utiliseDesVariables, bornesDe, uniteDe, plageRealisable, valeursUsuellesDe } from "../noyau/variables.js";

const EXEMPLE = "Dans un champ de cote : pile_rayon * 2 + 0,3";

/* Un champ de nom : Entrée ou la sortie du champ valident, Échap renonce.
   Rend l'élément, avec definir(nom) pour le remettre d'accord avec le document. */
function champDeNom(valeur, surValider, surRenoncer = () => {}) {
  const saisie = creer("input", {
    classe: "champ-texte nom-variable",
    attributs: { type: "text", maxlength: "40", spellcheck: "false", autocomplete: "off", placeholder: "nom, ex. pile_rayon", "aria-label": "Nom de la variable" },
  });
  saisie.value = valeur;
  let courant = valeur;
  let renonce = false;

  function valider() {
    if (renonce) {
      renonce = false;
      return;
    }
    const propre = saisie.value.trim();
    if (propre === courant) {
      // Une ligne neuve quittée sans nom : elle disparaît, sans reproche.
      if (propre === "") surRenoncer();
      return;
    }
    try {
      surValider(propre);
      courant = propre;
      saisie.classList.remove("erreur");
    } catch (erreur) {
      saisie.classList.add("erreur");
      montrerErreurSous(saisie, erreur.message);
      saisie.value = courant;
      if (courant === "") surRenoncer();
    }
  }

  saisie.addEventListener("focus", () => saisie.select());
  saisie.addEventListener("keydown", (evenement) => {
    evenement.stopPropagation();
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      saisie.blur();
    } else if (evenement.key === "Escape") {
      renonce = true;
      saisie.value = courant;
      saisie.blur();
      if (courant === "") surRenoncer();
    }
  });
  saisie.addEventListener("blur", valider);
  saisie.definir = (nom) => {
    courant = nom;
    if (document.activeElement !== saisie) saisie.value = nom;
  };
  return saisie;
}

const lisible = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 4, useGrouping: false });

/* Un champ de texte court (unité, aide) : validé à la sortie ou par Entrée. */
function champLibre(placeholder, classe, surValider) {
  const saisie = creer("input", { classe: "champ-texte " + classe, attributs: { type: "text", spellcheck: "false", autocomplete: "off", placeholder } });
  let courant = "";
  saisie.addEventListener("keydown", (evenement) => {
    evenement.stopPropagation();
    if (evenement.key === "Enter") saisie.blur();
    if (evenement.key === "Escape") {
      saisie.value = courant;
      saisie.blur();
    }
  });
  saisie.addEventListener("blur", () => {
    if (saisie.value.trim() !== courant) surValider(saisie.value.trim());
  });
  saisie.definir = (texte) => {
    courant = texte;
    if (document.activeElement !== saisie) saisie.value = texte;
  };
  return saisie;
}

/*
 * actions : { ajouter(nom) → id, renommer(id, nom), changerValeur(id, valeur, formule),
 *             supprimer(id), borner(id, { min, max }) → réussi, decrire(id, { unite, aide }) }
 *   — ajouter et renommer lèvent l'erreur du nom ; les bornes sont des formules ou null.
 */
export function creerPanneauVariables(bandeau, actions) {
  const compte = creer("span", { classe: "compte-variables" });
  const ouvrir = bouton({
    icone: "variables",
    texte: "Variables",
    classe: "bouton-variables",
    aide: {
      nom: "Variables",
      texte: "Des valeurs nommées (pile_rayon, pile_longueur…) qu'on écrit dans les champs à la place d'un nombre. Changer la variable change tous les objets qui l'utilisent.",
    },
    surClic: () => basculer(),
  });
  ouvrir.append(compte);
  bandeau.append(ouvrir);

  const liste = creer("div", { classe: "liste-variables" });
  const vide = creer("p", { classe: "variables-vide", texte: "Aucune variable dans ce projet." });
  const nouvelle = bouton({ icone: "plus", texte: "Nouvelle variable", classe: "plat", surClic: () => ouvrirBrouillon() });
  const panneau = creer("div", { classe: "panneau-variables", attributs: { hidden: "", role: "dialog", "aria-label": "Variables du projet" } }, [
    creer("div", { classe: "titre-fiche" }, [
      creer("strong", { texte: "Variables" }),
      creer("span", { classe: "terme", texte: "en mm, sauf unité précisée" }),
      bouton({ texte: "Fermer", classe: "plat", surClic: () => fermer() }),
    ]),
    vide,
    liste,
    nouvelle,
    creer("p", { classe: "terme exemple-variables", texte: EXEMPLE }),
  ]);
  document.body.append(panneau);

  // Fermé par un clic ailleurs, ou par Échap hors d'un champ : ce n'est pas
  // une fenêtre qui retient l'élève.
  document.addEventListener("pointerdown", (evenement) => {
    if (panneau.hidden || ouvrir.contains(evenement.target)) return;
    if (evenement.target.closest?.(".cadre-completion")) return;
    // Dans le panneau, hors de la variable dépliée : sa fiche se referme.
    if (panneau.contains(evenement.target)) {
      const bloc = evenement.target.closest(".bloc-variable");
      if (ficheOuverte !== null && lignes.get(ficheOuverte)?.element !== bloc) replierFiche();
      return;
    }
    fermer();
  }, true);
  document.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape" && !panneau.hidden) fermer();
  });

  let lignes = new Map();     // id → { element, ligne, nom, champ, usage, borne, fiche… }
  let cleAffichee = null;
  let brouillon = null;
  let aFocaliser = null;
  let enFermeture = false;
  let ficheOuverte = null;    // la variable dont les réglages sont dépliés
  let dernier = { variables: [], valeurs: new Map(), usages: new Map() };

  function placer() {
    const rect = ouvrir.getBoundingClientRect();
    panneau.style.top = Math.round(rect.bottom + 4) + "px";
    panneau.style.right = Math.max(8, Math.round(globalThis.innerWidth - rect.right)) + "px";
  }

  function fermer() {
    // Un nom tapé dans la ligne neuve compte, même si on clique ailleurs.
    enFermeture = true;
    brouillon?.querySelector("input").blur();
    enFermeture = false;
    panneau.hidden = true;
    ouvrir.classList.remove("actif");
    replierFiche();
    brouillon?.remove();
    brouillon = null;
  }

  function basculer() {
    if (!panneau.hidden) return fermer();
    placer();
    panneau.hidden = false;
    ouvrir.classList.add("actif");
    if (dernier.variables.length === 0) ouvrirBrouillon();
  }

  function ouvrirBrouillon() {
    if (brouillon !== null) {
      brouillon.querySelector("input").focus();
      return;
    }
    const nom = champDeNom("", (propre) => {
      const id = actions.ajouter(propre);
      // La valeur est la suite logique du nom : le curseur y va, sauf si on part.
      if (!enFermeture) aFocaliser = id;
      brouillon?.remove();
      brouillon = null;
    }, () => {
      brouillon?.remove();
      brouillon = null;
    });
    brouillon = creer("div", { classe: "ligne-variable brouillon" }, [nom]);
    liste.after(brouillon);
    vide.hidden = true;
    nom.focus();
  }

  const variableCourante = (id) => dernier.variables.find((v) => v.id === id);

  // La plage réellement permise à chaque variable, recalculée seulement quand les variables changent.
  const plages = new WeakMap();   // liste des variables → Map(id → plage)
  function plageDe(id) {
    let parId = plages.get(dernier.variables);
    if (parId === undefined) {
      parId = new Map();
      plages.set(dernier.variables, parId);
    }
    if (!parId.has(id)) parId.set(id, plageRealisable(dernier.variables, id));
    return parId.get(id);
  }

  function fabriquerLigne(variable) {
    const id = variable.id;
    const nom = champDeNom(variable.nom, (propre) => actions.renommer(id, propre));
    const champ = creerChampNumerique({
      unite: uniteDe(variable),
      decimales: 4,
      avecFormules: true,
      titre: "Valeur de " + variable.nom,
      // Refusée (une borne) : le champ reprend la valeur du document, après la sortie du champ.
      surValider: (valeur, formule) => {
        if (actions.changerValeur(id, valeur, formule) === false) setTimeout(() => synchroniser(lignes.get(id), variableCourante(id)));
      },
    });
    const usage = creer("span", { classe: "usage-variable" });
    // Un simple signal : cliquer n'importe où dans la ligne ouvre déjà ses réglages.
    const borne = creer("span", { classe: "signal-bornes" }, [icone("borne")]);
    const ligne = creer("div", { classe: "ligne-variable" }, [nom, champ.element, usage, borne]);

    // ── Ses réglages, dépliés sous la ligne ──
    // Une borne refusée (la valeur actuelle en sortirait) : le champ reprend la borne en vigueur.
    const poserBorne = (cote) => (valeur, formule) => {
      const actuelle = variableCourante(id);
      const texte = formule ?? (valeur === null ? null : String(valeur));
      const bornes = { min: actuelle?.min ?? null, max: actuelle?.max ?? null, [cote]: texte };
      // Après la sortie du champ : tant qu'il a le focus, il garde ce qu'on y a tapé.
      if (!actions.borner(id, bornes)) setTimeout(() => synchroniser(lignes.get(id), variableCourante(id)));
    };
    const champBorne = (cote) => creerChampNumerique({
      etiquette: cote === "min" ? "Min" : "Max",
      titre: cote === "min" ? "Valeur la plus petite permise (vide : aucune)" : "Valeur la plus grande permise (vide : aucune)",
      decimales: 4, avecFormules: true, accepteVide: true, unite: uniteDe(variable),
      surValider: poserBorne(cote),
    });
    const min = champBorne("min");
    const max = champBorne("max");
    const unite = champLibre("mm", "unite-variable", (texte) => actions.decrire(id, { unite: texte }));
    unite.title = "Unité affichée : mm si vide, « - » pour une grandeur sans unité";
    const aide = champLibre("à quoi sert-elle ? (montré au survol)", "aide-variable", (texte) => actions.decrire(id, { aide: texte }));
    const valeurs = champLibre("valeurs usuelles, ex. 0,42 ; 0,45 ; 0,62", "valeurs-variable", (texte) => {
      if (actions.decrire(id, { valeurs: texte }) === false) setTimeout(() => synchroniser(lignes.get(id), variableCourante(id)));
    });
    valeurs.title = "Les flèches du champ sautent d'une valeur à l'autre, et le bouton ▾ les propose";
    // Supprimer, rare et sans retour visible : dans la fiche, confirmé par un second clic.
    const retirer = bouton({ icone: "supprimer", texte: "Supprimer", classe: "plat retirer-variable" });
    retirer.title = "Supprimer la variable : les champs qui l'utilisent gardent sa valeur";
    retirer.addEventListener("click", () => {
      if (!retirer.classList.contains("danger")) {
        retirer.classList.add("danger");
        retirer.lastChild.textContent = "Supprimer ?";
        return;
      }
      actions.supprimer(id);
    });
    const fiche = creer("div", { classe: "fiche-variable", attributs: { hidden: "" } }, [min.element, max.element, unite, aide, valeurs, retirer]);
    const element = creer("div", { classe: "bloc-variable" }, [ligne, fiche]);
    element.addEventListener("focusin", () => deplierFiche(id));
    element.addEventListener("pointerdown", () => deplierFiche(id));
    return { element, ligne, nom, champ, usage, borne, fiche, min, max, unite, aide, valeurs, retirer };
  }

  function replierFiche() {
    const l = lignes.get(ficheOuverte);
    ficheOuverte = null;
    if (l === undefined) return;
    l.fiche.hidden = true;
    l.element.classList.remove("depliee");
    l.retirer.classList.remove("danger");
    l.retirer.lastChild.textContent = "Supprimer";
  }

  function deplierFiche(id) {
    if (ficheOuverte === id) return;
    replierFiche();
    const l = lignes.get(id);
    if (l === undefined) return;
    ficheOuverte = id;
    l.fiche.hidden = false;
    l.element.classList.add("depliee");
  }

  /* La ligne d'une variable remise d'accord avec le document. */
  function synchroniser(ligne, variable) {
    if (ligne === undefined || variable === undefined) return;
    ligne.nom.definir(variable.nom);
    const resultat = dernier.valeurs.get(variable.id) ?? {};
    const formule = utiliseDesVariables(variable.formule) ? variable.formule : null;
    const bornes = bornesDe(variable, dernier.valeurs);
    const unite = uniteDe(variable);
    ligne.champ.definirUnite(unite);
    const plage = plageDe(variable.id);
    ligne.champ.definirBornes(plage.min, plage.max, { min: plage.raisonMin, max: plage.raisonMax });
    ligne.champ.definirValeursUsuelles(valeursUsuellesDe(variable));
    ligne.champ.definirValeur(resultat.valeur ?? null, formule);
    ligne.ligne.classList.toggle("en-erreur", resultat.erreur !== undefined);
    ligne.ligne.title = resultat.erreur ?? variable.aide ?? "";

    const borneeMin = variable.min ? bornes.min ?? null : null;
    const borneeMax = variable.max ? bornes.max ?? null : null;
    ligne.min.definirUnite(unite);
    ligne.max.definirUnite(unite);
    ligne.min.definirValeur(borneeMin, variable.min && utiliseDesVariables(variable.min) ? variable.min : null);
    ligne.max.definirValeur(borneeMax, variable.max && utiliseDesVariables(variable.max) ? variable.max : null);
    ligne.unite.definir(variable.unite ?? "");
    ligne.aide.definir(variable.aide ?? "");
    ligne.valeurs.definir(variable.valeurs ?? "");
    const bornee = Boolean(variable.min || variable.max);
    ligne.borne.classList.toggle("actif", bornee);
    ligne.borne.title = bornes.erreur ?? (bornee
      ? "Bornée : " + (borneeMin !== null ? lisible(borneeMin) : "…") + " à " + (borneeMax !== null ? lisible(borneeMax) : "…") + " " + unite
      : "");
  }

  return {
    /* variables : celles du document ; valeurs : id → { valeur | erreur } ; usages : id → nombre */
    mettreAJour(variables, valeurs, usages) {
      dernier = { variables, valeurs, usages };
      compte.textContent = variables.length > 0 ? String(variables.length) : "";
      const triees = [...variables].sort((a, b) => a.nom.localeCompare(b.nom));
      const cle = triees.map((v) => v.id + ":" + v.nom).join("|");
      if (cle !== cleAffichee) {
        lignes = new Map(triees.map((v) => [v.id, lignes.get(v.id) ?? fabriquerLigne(v)]));
        liste.replaceChildren(...[...lignes.values()].map((l) => l.element));
        cleAffichee = cle;
      }
      vide.hidden = variables.length > 0 || brouillon !== null;
      for (const variable of triees) {
        const ligne = lignes.get(variable.id);
        // Une annulation peut rendre l'ancien nom, les anciennes bornes.
        synchroniser(ligne, variable);
        const n = usages.get(variable.id) ?? 0;
        ligne.usage.textContent = n > 0 ? String(n) : "";
        ligne.usage.title = n === 0 ? "" : "Utilisée par " + n + (n === 1 ? " champ" : " champs");
      }
      if (aFocaliser !== null && lignes.has(aFocaliser)) {
        const saisie = lignes.get(aFocaliser).champ.element.querySelector("input");
        aFocaliser = null;
        saisie.focus();
      }
      if (!panneau.hidden) placer();
    },

    fermer,
  };
}
