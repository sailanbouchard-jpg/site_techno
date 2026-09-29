/*
 * interface/barre_etat.js
 * ───────────────────────
 * Dimensions hors-tout de la sélection, nombre d'objets, voyant d'étanchéité.
 * C'est aussi là que s'affichent les erreurs — jamais dans une alerte — et la
 * mesure en cours pendant un glisser.
 *
 * Le voyant n'est pas cosmétique : un maillage non étanche s'imprime n'importe
 * comment, et l'élève doit le voir avant d'exporter, pas après.
 */

import { creer } from "./elements.js";

// Un message d'information s'efface de lui-même ; une erreur reste jusqu'au suivant.
const DUREE_MESSAGE_MS = 6000;
// Les derniers messages restent consultables : un avertissement manqué est un avertissement incompris.
const MESSAGES_GARDES = 8;
const nombre = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

export function creerBarreEtat(conteneur) {
  const message = creer("button", {
    classe: "message",
    aide: { nom: "Derniers messages", texte: "Cliquer pour revoir les huit derniers messages du logiciel." },
    attributs: { type: "button" },
  });
  const journal = creer("ul", { classe: "journal-messages", attributs: { hidden: "" } });
  const historique = [];
  const mesure = creer("span", { classe: "mesure" });
  const progression = creer("span", { classe: "progression", titre: "Calcul en cours", attributs: { hidden: "" } });
  const selection = creer("span");
  const objets = creer("span");
  const voyant = creer("span", { classe: "voyant" });
  const horsSite = creer("span", { classe: "hors-site", attributs: { hidden: "" } });
  const sousLeSol = creer("span", {
    classe: "hors-site",
    texte: "une pièce passe sous le sol",
    aide: { nom: "Pièce sous le plateau", texte: "À l'impression, tout ce qui est sous Z = 0 est coupé. Remonter la pièce, ou la reposer avec l'outil Poser." },
    attributs: { hidden: "" },
  });
  // Onglet Impression : les pièces qui dépassent du plateau ou se chevauchent.
  const avertissement = creer("span", { classe: "hors-site", attributs: { hidden: "" } });
  conteneur.append(message, journal, creer("span", { classe: "pousse" }), mesure, progression, selection, objets, voyant, avertissement, sousLeSol, horsSite);

  let effacement = null;

  function redessinerLeJournal() {
    journal.replaceChildren(...historique.map((entree) => creer("li", {
      classe: entree.erreur ? "erreur" : "",
      texte: entree.heure + " — " + entree.texte,
    })));
    if (historique.length === 0) journal.append(creer("li", { texte: "Aucun message pour le moment." }));
  }

  message.addEventListener("click", () => {
    redessinerLeJournal();
    journal.hidden = !journal.hidden;
  });
  document.addEventListener("pointerdown", (evenement) => {
    if (!journal.hidden && !journal.contains(evenement.target) && evenement.target !== message) journal.hidden = true;
  });

  return {
    annoncer(texte, erreur = false) {
      clearTimeout(effacement);
      const heure = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      historique.unshift({ texte, erreur, heure });
      if (historique.length > MESSAGES_GARDES) historique.pop();
      if (!journal.hidden) redessinerLeJournal();
      message.textContent = texte;
      message.title = texte;
      message.classList.toggle("erreur", erreur);
      if (!erreur) effacement = setTimeout(() => { message.textContent = ""; }, DUREE_MESSAGE_MS);
    },

    mesurer(texte) {
      mesure.textContent = texte ?? "";
    },

    calculs(enCours, long) {
      progression.hidden = !long;
      progression.title = enCours > 1 ? enCours + " calculs en cours" : "Calcul en cours";
    },

    /*
     * etat : { nombreSelectionnes, dimensions: {x, y, z} | null, objets,
     *          etanche: true | false | null, complet, horsSite, sousLeSol,
     *          nomDesObjets?, avertissement? }
     */
    mettreAJour(etat) {
      if (etat.nombreSelectionnes === 0) selection.textContent = "";
      else if (etat.dimensions === null) selection.textContent = etat.nombreSelectionnes + " sélectionné(s)";
      else {
        const { x, y, z } = etat.dimensions;
        selection.textContent = "Sélection : " + [x, y, z].map(nombre).join(" × ") + " mm";
      }

      const [un, plusieurs] = etat.nomDesObjets ?? ["objet", "objets"];
      objets.textContent = etat.objets + " " + (etat.objets > 1 ? plusieurs : un);
      avertissement.hidden = !etat.avertissement;
      avertissement.textContent = etat.avertissement ?? "";

      voyant.classList.toggle("ok", etat.etanche === true && etat.complet);
      voyant.classList.toggle("alerte", etat.etanche === false);
      if (etat.etanche === null) voyant.textContent = "rien à imprimer";
      else if (etat.etanche === false) voyant.textContent = "maillage NON étanche";
      else voyant.textContent = etat.complet ? "maillage étanche" : "calcul en cours";
      voyant.title = etat.etanche === false
        ? "Un objet importé est troué : il s'imprimera mal. Réparer le fichier avant de l'importer."
        : "Étanche : chaque arête du maillage est partagée par deux faces, le trancheur saura le remplir.";

      sousLeSol.hidden = !etat.sousLeSol;
      horsSite.hidden = !etat.horsSite;
      horsSite.textContent = "Travail non enregistré sur le site";
      horsSite.title = "Session non connectée : le projet n'est enregistré que dans ce navigateur. Se connecter pour le retrouver sur un autre poste.";
    },
  };
}
