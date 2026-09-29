/*
 * interface/etiquettes_contraintes.js
 * ───────────────────────────────────
 * Les étiquettes des contraintes de l'esquisse ouverte, posées sur la vue :
 * la valeur de chaque cote, le symbole de chaque relation (H, V, ∥…). Cliquer
 * une cote ouvre un champ pour changer sa valeur ; la croix, qui apparaît au
 * survol, retire la contrainte ; la glisser l'écarte du tracé, et la ligne de
 * cote suit. Une contrainte que le dessin ne peut pas satisfaire est en rouge.
 *
 * Les éléments sont réutilisés d'une image à l'autre : les redessiner à chaque
 * mouvement de caméra faisait clignoter les étiquettes et perdre le survol.
 */

import { creer } from "./elements.js";
import { brancherCompletion } from "./completion_de_variables.js";

// En dessous, le relâcher est un clic (ouvrir la valeur), pas un déplacement.
const SEUIL_DE_GLISSER_PX = 3;
// Au-delà, le champ de la cote défile plutôt que de couvrir le dessin.
const LARGEUR_SAISIE_MAX_PX = 420;

/* actions : { editer(id), supprimer(id), deplacer(id, evenement, phase), survoler(id) } */
export function creerEtiquettesContraintes(vue, actions) {
  const calque = creer("div", { classe: "etiquettes-contraintes" });
  vue.append(calque);
  const affichees = new Map();   // id → { element, valeur, retirer, description }
  let saisie = null;             // { id, champ } pendant qu'on tape une valeur
  let glisse = null;             // { id, depart, bouge } pendant qu'on déplace une étiquette
  // Ce que le point posé ici recevra (« sur l'origine », « sur X »), avant le clic.
  const indication = creer("div", { classe: "etiquette-contrainte indication-accroche", attributs: { "aria-live": "polite" } });

  function fabriquer(id) {
    const valeur = creer("span", { classe: "texte-contrainte" });
    const retirer = creer("button", {
      classe: "retirer-contrainte", texte: "×", attributs: { type: "button" },
    });
    retirer.addEventListener("pointerdown", (evenement) => evenement.stopPropagation());
    retirer.addEventListener("click", (evenement) => {
      evenement.stopPropagation();
      actions.supprimer(id);
    });
    const element = creer("div", { classe: "etiquette-contrainte", attributs: { "data-id": id } }, [valeur, retirer]);

    // Glisser l'étiquette l'écarte du tracé ; un simple clic ouvre sa valeur.
    element.addEventListener("pointerdown", (evenement) => {
      if (evenement.button !== 0 || saisie !== null) return;
      evenement.preventDefault();
      element.setPointerCapture(evenement.pointerId);
      glisse = { id, depart: [evenement.clientX, evenement.clientY], bouge: false };
      actions.deplacer(id, evenement, "debut");
    });
    element.addEventListener("pointermove", (evenement) => {
      if (glisse === null || glisse.id !== id) return;
      const ecart = Math.hypot(evenement.clientX - glisse.depart[0], evenement.clientY - glisse.depart[1]);
      if (!glisse.bouge && ecart < SEUIL_DE_GLISSER_PX) return;
      glisse.bouge = true;
      actions.deplacer(id, evenement, "glisser");
    });
    const finir = (evenement) => {
      if (glisse === null || glisse.id !== id) return;
      const aBouge = glisse.bouge;
      glisse = null;
      actions.deplacer(id, evenement, aBouge ? "fin" : "abandon");
      if (!aBouge && affichees.get(id)?.cote === true) actions.editer(id);
    };
    element.addEventListener("pointerup", finir);
    element.addEventListener("pointercancel", finir);
    element.addEventListener("pointerenter", () => actions.survoler(id));
    element.addEventListener("pointerleave", () => actions.survoler(null));

    calque.append(element);
    return { element, valeur, retirer, description: "" };
  }

  return {
    /* liste : [{ id, texte, cote, nom, conflit, formule, redondante, x, y }], x et y en pixels de la page ;
       formule : le calcul qui pilote la cote, écrit avec les noms, ou null ;
       redondante : les autres contraintes l'imposent déjà. */
    afficher(liste) {
      if (saisie !== null) return;   // on ne redessine pas sous les doigts de l'élève
      const cadre = vue.getBoundingClientRect();
      const vues = new Set();
      for (const e of liste) {
        vues.add(e.id);
        const affichee = affichees.get(e.id) ?? fabriquer(e.id);
        affichees.set(e.id, affichee);
        const formule = e.formule ?? null;
        const description = [e.texte, e.cote, e.conflit, e.nom, formule, e.redondante].join("|");
        if (description !== affichee.description) {
          affichee.description = description;
          affichee.valeur.textContent = e.texte;
          affichee.element.className = "etiquette-contrainte" + (e.cote ? " cote" : "") + (e.conflit ? " conflit" : "")
            + (formule !== null ? " pilotee" : "") + (e.redondante && !e.conflit ? " redondante" : "");
          affichee.cote = e.cote;
          affichee.element.title = e.nom + (formule !== null ? " = " + formule : "")
            + (e.conflit ? " — contredit les autres contraintes" : "")
            + (e.redondante && !e.conflit ? " — en trop : les autres contraintes l'imposent déjà, la retirer ne libère rien" : "")
            + (e.cote ? " — cliquer pour changer, glisser pour déplacer" : "");
          affichee.retirer.title = "Retirer : " + e.nom.toLowerCase();
        }
        affichee.element.style.transform = "translate(" + Math.round(e.x - cadre.left) + "px, "
          + Math.round(e.y - cadre.top) + "px) translate(-50%, -50%)";
      }
      for (const [id, affichee] of affichees) {
        if (vues.has(id)) continue;
        affichee.element.remove();
        affichees.delete(id);
      }
    },

    /* Un champ remplace l'étiquette de la cote ; Entrée valide, Échap renonce.
       On y tape un nombre, un calcul ou une formule (texteFormule : celle
       d'avant) ; surValider reçoit le texte tapé, ou null si on renonce. */
    editer(id, valeur, surValider, texteFormule = null) {
      const affichee = affichees.get(id);
      if (affichee === undefined) return;
      const element = affichee.element;
      const champ = creer("input", {
        classe: "saisie-contrainte",
        attributs: { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": "Valeur de la cote" },
      });
      champ.value = texteFormule ?? String(Math.round(valeur * 100) / 100).replace(".", ",");
      brancherCompletion(champ);
      // Le champ s'élargit avec la formule : tout ce qui est tapé reste lisible.
      const ajuster = () => {
        champ.style.width = "";
        champ.style.width = Math.min(Math.max(champ.scrollWidth + 6, champ.offsetWidth), LARGEUR_SAISIE_MAX_PX) + "px";
      };
      champ.addEventListener("input", ajuster);
      element.replaceChildren(champ);
      element.classList.add("en-saisie");
      saisie = { id, champ };
      ajuster();
      champ.focus();
      champ.select();

      const terminer = (garder) => {
        if (saisie === null || saisie.champ !== champ) return;
        saisie = null;
        affichees.delete(id);
        element.remove();
        surValider(garder && champ.value.trim() !== "" ? champ.value : null);
      };
      champ.addEventListener("keydown", (evenement) => {
        evenement.stopPropagation();
        if (evenement.key === "Enter") terminer(true);
        else if (evenement.key === "Escape") terminer(false);
      });
      champ.addEventListener("pointerdown", (evenement) => evenement.stopPropagation());
      champ.addEventListener("blur", () => terminer(true));
    },

    /* texte : la contrainte que recevrait un point posé au pixel (x, y) de
       la page, ou null pour n'en montrer aucune. */
    indiquer(texte, x = 0, y = 0) {
      if (texte === null) {
        indication.remove();
        return;
      }
      if (!indication.isConnected) calque.append(indication);
      indication.textContent = texte;
      const cadre = vue.getBoundingClientRect();
      indication.style.transform = "translate(" + Math.round(x - cadre.left) + "px, " + Math.round(y - cadre.top) + "px)";
    },

    enSaisie: () => saisie !== null,

    vider() {
      saisie = null;
      glisse = null;
      affichees.clear();
      calque.replaceChildren();
    },
  };
}
