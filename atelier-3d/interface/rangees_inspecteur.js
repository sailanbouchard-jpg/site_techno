/*
 * interface/rangees_inspecteur.js
 * ───────────────────────────────
 * Les rangées de l'inspecteur : un libellé à gauche, un ou trois champs à
 * droite. Chaque rangée rend { element, definir(valeurs) } pour que le panneau
 * puisse mettre les valeurs à jour sans reconstruire — et donc sans voler le
 * focus à l'élève qui tape.
 */

import { creer, bouton } from "./elements.js";
import { aider } from "./bulle_d_aide.js";
import { icone } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";

export function rangee(libelle, contenu, titre, empilee = false) {
  return creer("div", { classe: empilee ? "rangee empilee" : "rangee" }, [
    creer("span", { classe: "libelle", texte: libelle, titre: titre ?? libelle }),
    contenu,
  ]);
}

/* Un champ texte qui ne valide qu'à Entrée ou en quittant le champ. */
export function rangeeTexte(libelle, valeur, surValider, indication = "") {
  const saisie = creer("input", {
    classe: "champ-texte",
    attributs: { type: "text", maxlength: "60", spellcheck: "false", placeholder: indication },
  });
  let courante = valeur;
  saisie.value = valeur;

  // Même règle que le nom du projet : Entrée valide d'elle-même.
  function valider() {
    const propre = saisie.value.trim();
    if (propre === courante) return;
    courante = propre;
    surValider(propre);
  }

  saisie.addEventListener("focus", () => saisie.select());
  saisie.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") {
      valider();
      saisie.blur();
    }
    if (evenement.key === "Escape") {
      saisie.value = courante;
      saisie.blur();
    }
    evenement.stopPropagation();
  });
  saisie.addEventListener("blur", valider);
  return {
    element: rangee(libelle, saisie),
    definir(v, nouvelleIndication) {
      courante = v;
      if (document.activeElement !== saisie) saisie.value = v;
      if (nouvelleIndication !== undefined) saisie.placeholder = nouvelleIndication;
    },
  };
}

/*
 * Trois champs X, Y, Z. options : { etiquettes, unite, pas, min, max, decimales,
 * surValider(axe, v, formule), surApercu(axe, v), surAnnuler(), cadenas }
 * cadenas : { verrouille(), basculer() } pour la rangée des dimensions.
 */
export function rangeeTrio(libelle, options) {
  const axes = ["x", "y", "z"];
  const champs = axes.map((axe, i) => creerChampNumerique({
    etiquette: options.etiquettes[i],
    titre: libelle + " " + options.etiquettes[i] + " — glisser pour régler",
    pasFixe: options.pasFixe,
    min: options.min,
    max: options.max,
    decimales: options.decimales,
    avecFormules: true,
    surValider: (v, formule) => options.surValider(axe, v, formule),
    surApercu: (v) => options.surApercu?.(axe, v),
    surAnnuler: () => options.surAnnuler?.(),
  }));

  const trio = creer("div", { classe: "trio" }, champs.map((c) => c.element));
  let cadenas = null;
  if (options.cadenas) {
    trio.classList.add("avec-cadenas");
    cadenas = bouton({ icone: "cadenas-ouvert", classe: "plat", titre: "Garder les proportions", surClic: options.cadenas.basculer });
    trio.append(cadenas);
  }

  function definirCadenas() {
    if (cadenas === null) return;
    const ferme = options.cadenas.verrouille();
    cadenas.replaceChildren(icone(ferme ? "cadenas-ferme" : "cadenas-ouvert"));
    cadenas.classList.toggle("actif", ferme);
    cadenas.title = ferme ? "Proportions gardées : cliquer pour libérer" : "Garder les proportions";
  }

  return {
    // Trois champs serrés : l'unité va dans le libellé, la place reste aux chiffres.
    element: rangee(options.unite ? libelle + " (" + options.unite + ")" : libelle, trio, libelle, true),
    definirCadenas,
    /* valeurs : { x, y, z } ou null quand elles ne sont pas encore connues ;
       formules : { x, y, z } en texte affichable, null pour un champ libre */
    definir(valeurs, formules = null) {
      champs.forEach((champ, i) => {
        champ.activer(valeurs !== null);
        champ.definirValeur(valeurs === null ? null : valeurs[axes[i]], formules?.[axes[i]] ?? null);
      });
      definirCadenas();
    },
  };
}

/* Le nuancier : la première pastille rend la couleur par défaut (null). */
export function rangeeCouleur(nuancier, surChoisir) {
  const pastilles = nuancier.map((couleur, i) => {
    const pastille = creer("button", {
      classe: "nuance",
      titre: i === 0 ? "Couleur par défaut" : couleur,
      attributs: { type: "button", "aria-label": i === 0 ? "Couleur par défaut" : "Couleur " + couleur },
    });
    // Le fond vient de la feuille de style (jeton --couleur-objet-N), pas du JS.
    pastille.dataset.rang = String(i + 1);
    pastille.addEventListener("click", () => surChoisir(i === 0 ? null : couleur));
    return pastille;
  });
  return {
    // Sur toute la largeur : seize pastilles tiennent sur une ou deux lignes.
    element: rangee("Couleur", creer("div", { classe: "nuancier" }, pastilles), undefined, true),
    definir(couleur) {
      pastilles.forEach((pastille, i) => {
        const choisie = i === 0 ? couleur === null : couleur === nuancier[i];
        pastille.classList.toggle("choisie", choisie);
      });
    },
  };
}

/* La finition : un bouton par aspect, celui de l'objet en surbrillance.
   finitions : [{ valeur, etiquette, aide }], valeur null pour la finition par défaut. */
export function rangeeFinition(finitions, surChoisir) {
  const boutons = finitions.map((f) => {
    const b = bouton({ texte: f.etiquette, aide: { nom: f.etiquette, texte: f.aide }, surClic: () => surChoisir(f.valeur) });
    return { b, valeur: f.valeur };
  });
  return {
    element: rangee("Finition", creer("div", { classe: "finitions" }, boutons.map((x) => x.b)), undefined, true),
    definir(finition) {
      for (const { b, valeur } of boutons) b.classList.toggle("actif", valeur === finition);
    },
  };
}

// Un seul panneau d'aspect ouvert à la fois ; un clic ailleurs ou Échap le ferme.
let aspectOuvert = null;   // { panneau, ouvrir, fermer }
document.addEventListener("pointerdown", (evenement) => {
  if (aspectOuvert === null) return;
  if (aspectOuvert.panneau.contains(evenement.target) || aspectOuvert.ouvrir.contains(evenement.target)) return;
  aspectOuvert.fermer();
}, true);
document.addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape") aspectOuvert?.fermer();
});

/*
 * L'aspect en une ligne : un bouton palette qui montre la couleur et la
 * finition actuelles, et déroule au clic le nuancier et les finitions. Le
 * panneau reste ouvert pendant qu'on essaie ; un clic ailleurs ou Échap le ferme.
 * finitions : [{ valeur, etiquette, aide }]. couleur undefined : sélection mêlée.
 */
export function rangeeAspect(nuancier, finitions, surCouleur, surFinition) {
  const temoin = creer("span", { classe: "nuance temoin" });
  const texte = creer("span", { classe: "texte-aspect" });
  const ouvrir = creer("button", { classe: "bouton bouton-aspect", attributs: { type: "button", "aria-haspopup": "dialog" } }, [
    icone("palette"), temoin, texte,
  ]);
  const couleur = rangeeCouleur(nuancier, surCouleur);
  const finition = rangeeFinition(finitions, surFinition);
  const panneau = creer("div", { classe: "choix-aspect", attributs: { hidden: "", role: "dialog", "aria-label": "Couleur et finition" } }, [
    creer("div", { classe: "titre-bloc", texte: "Couleur" }), couleur.element.lastChild,
    creer("div", { classe: "titre-bloc", texte: "Finition" }), finition.element.lastChild,
  ]);

  const fermer = () => {
    panneau.hidden = true;
    ouvrir.classList.remove("actif");
    if (aspectOuvert?.panneau === panneau) aspectOuvert = null;
  };
  ouvrir.addEventListener("click", () => {
    if (!panneau.hidden) return fermer();
    aspectOuvert?.fermer();
    aspectOuvert = { panneau, ouvrir, fermer };
    const rect = ouvrir.getBoundingClientRect();
    panneau.hidden = false;
    // Sous le bouton, ou au-dessus s'il n'y a pas la place : jamais sur lui.
    const hauteur = panneau.offsetHeight;
    const dessous = rect.bottom + 4 + hauteur <= globalThis.innerHeight - 8;
    panneau.style.left = Math.round(Math.min(rect.left, globalThis.innerWidth - panneau.offsetWidth - 8)) + "px";
    panneau.style.top = Math.round(dessous ? rect.bottom + 4 : Math.max(8, rect.top - 4 - hauteur)) + "px";
    ouvrir.classList.add("actif");
  });

  // Le panneau est dans la rangée (en position fixe) : l'inspecteur qui se
  // reconstruit l'emporte avec lui.
  return {
    element: rangee("Aspect", creer("div", { classe: "ancre-aspect" }, [ouvrir, panneau])),
    definir(c, f) {
      couleur.definir(c);
      finition.definir(f);
      const rang = c === undefined ? null : c === null ? 1 : nuancier.indexOf(c) + 1;
      temoin.dataset.rang = rang === null || rang < 1 ? "" : String(rang);
      temoin.classList.toggle("melee", c === undefined);
      const nom = f === undefined ? "Finitions mêlées" : finitions.find((x) => x.valeur === f)?.etiquette ?? "Mat";
      texte.textContent = (c === undefined ? "Couleurs mêlées · " : "") + nom;
      ouvrir.title = "Couleur et finition — cliquer pour choisir";
    },
  };
}

/* Une case à cocher qui sait être « à moitié » quand la sélection est mêlée. */
export function rangeeCase(libelle, texte, surBasculer) {
  const caseACocher = creer("input", { attributs: { type: "checkbox" } });
  caseACocher.addEventListener("change", surBasculer);
  return {
    element: rangee(libelle, creer("label", { classe: "case" }, [caseACocher, texte])),
    definir(etat) {
      caseACocher.indeterminate = etat === null;
      caseACocher.checked = etat === true;
    },
  };
}

/* Une liste de choix : { valeur, etiquette }. */
function rangeeChoix(description, valeur, surValider) {
  const liste = creer("select", { classe: "champ-choix", attributs: { "aria-label": description.etiquette } });
  for (const choix of description.choix) {
    const option = creer("option", { texte: choix.etiquette, attributs: { value: choix.valeur } });
    liste.append(option);
  }
  liste.value = valeur;
  liste.addEventListener("change", () => surValider(liste.value));
  liste.addEventListener("keydown", (evenement) => evenement.stopPropagation());
  return { element: rangee(description.etiquette, liste), definir: (v) => { liste.value = v; } };
}

/*
 * Les cotes d'une forme de base (rayon, hauteur, ovalité…), une rangée chacune.
 * cotes : la liste du type ; options : { surValider(cle, v, formule), surApercu(cle, v), surAnnuler() }
 */
export function blocCotes(cotes, options) {
  const champs = new Map();
  const lignes = cotes.map((cote) => {
    const champ = creerChampNumerique({
      etiquette: "",
      titre: (cote.titre ?? cote.etiquette) + " — glisser l'étiquette pour régler",
      unite: cote.unite,
      min: cote.min,
      pasFixe: cote.pasFixe,
      decimales: cote.decimales,
      avecFormules: true,
      surValider: (v, formule) => options.surValider(cote.cle, v, formule),
      surApercu: (v) => options.surApercu(cote.cle, v),
      surAnnuler: () => options.surAnnuler(),
    });
    champs.set(cote.cle, champ);
    return rangee(cote.etiquette, champ.element, cote.titre);
  });
  return {
    lignes,
    /* valeurs : { cle: nombre } ; formules : { cle: texte } */
    definir(valeurs, formules = {}) {
      for (const [cle, champ] of champs) champ.definirValeur(valeurs[cle], formules[cle] ?? null);
    },
  };
}

/* Un paramètre propre au type, décrit par le registre. */
/* Le préfixe commun des noms (« clip_ ») : on l'ôte des libellés, déjà serrés. */
function prefixeCommun(noms) {
  if (noms.length < 2) return "";
  const premier = noms[0].indexOf("_");
  if (premier <= 0) return "";
  const prefixe = noms[0].slice(0, premier + 1);
  return noms.every((n) => n.startsWith(prefixe) && n.length > prefixe.length) ? prefixe : "";
}

const lisible = (v) => (v === null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: 4, useGrouping: false }));

/*
 * Les paramètres d'un objet de la bibliothèque : un champ par variable
 * réglable du modèle, borné comme le modèle l'exige ; les valeurs calculées
 * en dessous, repliées, en lecture seule. parametres : voir parametresDuModele.
 * surValider(idVariable, valeur, formule). Rend { elements, definir(parametres, formuleDe) }.
 */
export function blocReglagesDuModele(parametres, surValider) {
  const prefixe = prefixeCommun(parametres.map((p) => p.nom));
  const libelleDe = (p) => p.nom.slice(prefixe.length).replace(/_/g, " ");
  const champs = new Map();
  const infos = new Map();
  const reglables = [];
  const calculees = creer("details", { classe: "avances valeurs-calculees" }, [creer("summary", { texte: "Valeurs calculées" })]);

  for (const p of parametres) {
    if (p.reglable) {
      const champ = creerChampNumerique({
        unite: p.unite, decimales: 0, avecFormules: true, min: p.min ?? undefined, max: p.max ?? undefined,
        valeursUsuelles: p.valeursUsuelles,
        surValider: (valeur, formule) => surValider(p.id, valeur, formule),
      });
      const element = rangee(libelleDe(p), champ.element);
      aider(element.firstChild, { nom: p.nom, texte: p.aide || "Paramètre du modèle.", condition: "" });
      champs.set(p.id, { champ, element });
      reglables.push(element);
    } else {
      const info = creer("span", { classe: "info-lecture" });
      const element = rangee(libelleDe(p), info);
      aider(element.firstChild, { nom: p.nom, texte: p.aide || "Calculé par le modèle à partir des paramètres." });
      infos.set(p.id, info);
      calculees.append(element);
    }
  }

  return {
    elements: [...reglables, infos.size > 0 ? calculees : null].filter((e) => e !== null),
    definir(liste, formuleDe) {
      for (const p of liste) {
        const trouve = champs.get(p.id);
        if (trouve !== undefined) {
          trouve.champ.definirBornes(p.min, p.max, { min: p.raisonMin, max: p.raisonMax });
          trouve.champ.definirValeursUsuelles(p.valeursUsuelles);
          trouve.champ.definirValeur(p.valeur, formuleDe(p.id));
          const bornes = p.min !== null || p.max !== null ? " — permis : " + lisible(p.min) + " à " + lisible(p.max) + " " + p.unite : "";
          trouve.element.lastChild.title = (p.erreur ?? "") + bornes;
          continue;
        }
        const info = infos.get(p.id);
        if (info !== undefined) info.textContent = p.erreur !== undefined ? "erreur" : (lisible(p.valeur) + " " + p.unite).trim();
      }
    },
  };
}

export function rangeeParametre(description, valeur, surValider) {
  if (description.lectureSeule) {
    const info = creer("span", { classe: "info-lecture" });
    const definir = (v) => {
      const texte = description.libelle ? description.libelle(v) : v;
      info.textContent = typeof texte === "number" ? texte.toLocaleString("fr-FR") : String(texte);
      info.title = info.textContent;
    };
    definir(valeur);
    return { element: rangee(description.etiquette, info), definir };
  }
  if (description.choix) return rangeeChoix(description, valeur, surValider);
  if (description.case) {
    const r = rangeeCase(description.etiquette, description.case, (evenement) => surValider(evenement.target.checked));
    r.definir(valeur);
    return r;
  }
  if (description.texte) return rangeeTexte(description.etiquette, valeur, surValider);

  const champ = creerChampNumerique({
    etiquette: "",
    unite: description.unite,
    valeur,
    min: description.min,
    max: description.max,
    pasFixe: description.pasFixe,
    valeursUsuelles: description.valeursUsuelles,
    entier: description.entier,
    titre: description.titre,
    avecFormules: true,
    surValider,
    // « direct » : le réglage s'applique pendant qu'on le fait glisser. Les
    // modifications successives fusionnent en une seule annulation.
    surApercu: description.direct ? surValider : undefined,
  });
  return { element: rangee(description.etiquette, champ.element), definir: (v, formule = null) => champ.definirValeur(v, formule) };
}
