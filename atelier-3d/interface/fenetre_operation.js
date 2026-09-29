/*
 * interface/fenetre_operation.js
 * ──────────────────────────────
 * La fenêtre d'une opération en cours (symétrie, répétition, extrusion…),
 * posée en bas à gauche, par-dessus l'arbre de construction (en retrait
 * pendant l'opération) : la vue 3D reste dégagée, c'est là que se voit le
 * résultat. Elle nomme chaque entrée attendue et n'offre que les choix
 * utiles. Valider garde le résultat, Annuler le défait entièrement.
 *
 * Aucune règle ici : la fenêtre affiche des champs décrits par l'opération et
 * rapporte chaque changement.
 *
 * Champ : { genre, cle?, etiquette?, visible?(valeurs), … }
 *   "choix"   options: [{ valeur, etiquette, detail?, aide? }]  — des boutons
 *             côte à côte ; aide : la phrase de leur bulle de survol
 *   "nombre"  unite, min, max, pas, entier, decimales, aide?
 *   "case"    texte
 *   "texte"   indication
 *   "bouton"  icone, texte, action()
 *   "note"    texte (chaîne ou fonction des valeurs)
 */

import { creer, bouton } from "./elements.js";
import { icone, iconeExiste } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";

const LIBELLE_COURT = 8;

function champChoix(champ, changer) {
  const boutons = champ.options.map((option) => {
    const aide = option.aide ? { nom: option.etiquette, texte: option.aide } : undefined;
    const b = creer("button", { classe: "choix-illustre", aide, attributs: { type: "button" } }, [
      creer("span", { classe: "choix-titre", texte: option.etiquette }),
      option.detail ? creer("span", { classe: "choix-detail", texte: option.detail }) : null,
    ]);
    b.addEventListener("click", () => changer(option.valeur));
    return { b, valeur: option.valeur };
  });
  const element = creer("div", { classe: "choix-illustres", attributs: { role: "radiogroup" } }, boutons.map((x) => x.b));
  // Des mots courts tiennent sur une rangée ; sinon quatre choix font deux
  // rangées de deux, plutôt que trois et un orphelin.
  const n = boutons.length;
  const courts = champ.options.every((option) => option.etiquette.length <= LIBELLE_COURT && !option.detail);
  element.style.setProperty("--colonnes", String(courts ? Math.min(n, 4) : n === 4 ? 2 : Math.min(n, 3)));
  return {
    element,
    definir(valeur) {
      for (const { b, valeur: v } of boutons) {
        b.classList.toggle("actif", v === valeur);
        b.setAttribute("aria-checked", String(v === valeur));
      }
    },
  };
}

function champNombre(champ, changer, avecFormules) {
  const numerique = creerChampNumerique({
    etiquette: "",
    titre: champ.etiquette,
    unite: champ.unite,
    min: champ.min,
    max: champ.max,
    pasFixe: champ.pasFixe,
    valeursUsuelles: champ.valeursUsuelles,
    entier: champ.entier,
    decimales: champ.decimales,
    // Les variables du projet, avec l'auto-complétion, quand l'opération sait où ranger la formule.
    avecFormules,
    // Le résultat suit le réglage en direct : c'est tout l'intérêt de la fenêtre.
    surApercu: (valeur) => changer(valeur),
    surValider: (valeur, formule) => changer(valeur, formule ?? null),
  });
  return { element: numerique.element, definir: (v, formule) => numerique.definirValeur(v, formule ?? null) };
}

function champCase(champ, changer) {
  const caseACocher = creer("input", { attributs: { type: "checkbox" } });
  caseACocher.addEventListener("change", () => changer(caseACocher.checked));
  return {
    element: creer("label", { classe: "case" }, [caseACocher, champ.texte]),
    definir: (v) => { caseACocher.checked = v === true; },
  };
}

function champTexte(champ, changer) {
  const saisie = creer("input", {
    classe: "champ-texte",
    attributs: { type: "text", maxlength: "60", spellcheck: "false", placeholder: champ.indication ?? "" },
  });
  saisie.addEventListener("input", () => changer(saisie.value));
  saisie.addEventListener("keydown", (evenement) => {
    // Entrée garde son sens pour la fenêtre (Valider) ; le reste reste dans le champ.
    if (evenement.key !== "Enter" && evenement.key !== "Escape") evenement.stopPropagation();
  });
  return {
    element: saisie,
    definir(v) {
      if (document.activeElement !== saisie) saisie.value = v ?? "";
    },
  };
}

function champBouton(champ) {
  return { element: bouton({ icone: champ.icone, texte: champ.texte, surClic: () => champ.action() }), definir() {} };
}

function champNote() {
  const note = creer("p", { classe: "note-operation" });
  return { element: note, definir: (texte) => { note.textContent = texte; } };
}

const FABRIQUES = { choix: champChoix, nombre: champNombre, case: champCase, texte: champTexte, bouton: champBouton, note: champNote };

export function creerFenetreOperation(conteneur) {
  const titre = creer("span", { classe: "titre-operation" });
  const pictogramme = creer("span", { classe: "picto-operation" });
  const consigne = creer("p", { classe: "consigne-operation", attributs: { "aria-live": "polite" } });
  const corps = creer("div", { classe: "corps-operation" });
  const annuler = bouton({
    texte: "Annuler",
    aide: { nom: "Annuler", raccourci: "Échap", texte: "Abandonne l'opération : le projet revient à son état précédent." },
  });
  const valider = bouton({
    icone: "valider", texte: "Valider", classe: "principal",
    aide: { nom: "Valider", raccourci: "Entrée", texte: "Conserve le résultat affiché." },
  });
  const fenetre = creer("section", { classe: "fenetre-operation", attributs: { role: "dialog", "aria-label": "Opération en cours" } }, [
    creer("header", { classe: "tete-operation" }, [pictogramme, titre]),
    consigne,
    corps,
    creer("footer", { classe: "pied-operation" }, [annuler, valider]),
  ]);
  fenetre.hidden = true;
  conteneur.append(fenetre);

  let rangees = [];
  let rappels = null;

  annuler.addEventListener("click", () => rappels?.surAnnuler());
  valider.addEventListener("click", () => rappels?.surValider());

  return {
    /*
     * description : { titre, icone, consigne, champs, valeurs, texteValider,
     *                 surChanger(cle, valeur), surValider(), surAnnuler() }
     */
    ouvrir(description) {
      rappels = description;
      titre.textContent = description.titre;
      pictogramme.replaceChildren(description.icone && iconeExiste(description.icone) ? icone(description.icone) : "");
      valider.querySelector("span").textContent = description.texteValider ?? "Valider";
      corps.replaceChildren();
      rangees = description.champs.map((champ) => {
        const rendu = FABRIQUES[champ.genre](champ, (valeur, formule) => rappels.surChanger(champ.cle, valeur, formule),
          description.avecFormules === true);
        // Un nombre tient sur une ligne, son libellé à gauche ; un choix a son libellé au-dessus.
        const enLigne = champ.genre === "nombre" || champ.genre === "texte";
        const libelle = champ.etiquette
          ? creer("span", { classe: "libelle-operation", texte: champ.etiquette, aide: champ.aide ? { nom: champ.etiquette, texte: champ.aide } : undefined })
          : null;
        const rangee = creer("div", { classe: "rangee-operation" + (enLigne ? " en-ligne" : "") }, [libelle, rendu.element]);
        corps.append(rangee);
        return { champ, rendu, rangee };
      });
      fenetre.hidden = false;
      this.definir(description.valeurs, description.consigne, true, description.formules);
    },

    /* valeurs : l'état de l'opération ; consigne : ce qui est attendu maintenant, ou rien. */
    definir(valeurs, texteConsigne, peutValider = true, formules = {}) {
      if (texteConsigne !== undefined) {
        consigne.textContent = texteConsigne ?? "";
        consigne.hidden = !texteConsigne;
      }
      valider.disabled = !peutValider;
      for (const { champ, rendu, rangee } of rangees) {
        rangee.hidden = typeof champ.visible === "function" && !champ.visible(valeurs);
        if (champ.genre === "note") rendu.definir(typeof champ.texte === "function" ? champ.texte(valeurs) : champ.texte);
        else if (champ.cle !== undefined) rendu.definir(valeurs[champ.cle], formules[champ.cle]);
      }
      valider.hidden = rappels?.sansValider === true;
    },

    fermer() {
      fenetre.hidden = true;
      corps.replaceChildren();
      rangees = [];
      rappels = null;
    },

    ouverte: () => !fenetre.hidden,
  };
}
