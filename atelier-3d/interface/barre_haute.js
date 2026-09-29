/*
 * interface/barre_haute.js
 * ────────────────────────
 * Nom du projet, onglets Conception / Impression / Calibration, Annuler, Refaire, Importer,
 * Exporter STL. Rien d'autre : l'enregistrement est permanent et automatique,
 * son état s'affiche à droite.
 */

import { creer, bouton, separateur } from "./elements.js";

const TEXTES_ENREGISTREMENT = {
  neuf: "",
  enregistre: "Enregistré",
  "a-enregistrer": "Modifications en attente",
  enregistrement: "Enregistrement…",
  erreur: "Non enregistré",
};

/*
 * actions : { renommer(nom), annuler(), refaire(), importer(fichiers),
 *             exporter(), ouvrirMenuProjets(ancre), changerEspace(nom) }
 */
export function creerBarreHaute(conteneur, actions) {
  const nom = creer("input", {
    classe: "champ-texte nom-projet",
    titre: "Nom du projet",
    attributs: { type: "text", maxlength: "80", spellcheck: "false", "aria-label": "Nom du projet" },
  });
  let nomAffiche = "";

  // Entrée valide sans attendre la perte du focus : un navigateur dont la
  // fenêtre n'est pas au premier plan n'envoie pas toujours l'événement blur.
  function valider() {
    const propre = nom.value.trim();
    if (propre === "") {
      nom.value = nomAffiche;
    } else if (propre !== nomAffiche) {
      nomAffiche = propre;
      actions.renommer(propre);
    }
  }

  nom.addEventListener("focus", () => nom.select());
  nom.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") {
      valider();
      nom.blur();
    }
    if (evenement.key === "Escape") {
      nom.value = nomAffiche;
      nom.blur();
    }
    evenement.stopPropagation();
  });
  nom.addEventListener("blur", valider);

  const projets = bouton({ icone: "menu", classe: "plat", aide: { nom: "Mes projets", texte: "Ouvrir, créer ou supprimer un projet." }, surClic: () => actions.ouvrirMenuProjets(projets) });
  const annuler = bouton({ icone: "annuler", texte: "Annuler", classe: "plat", aide: { nom: "Annuler", raccourci: "Ctrl+Z", texte: "Défait la dernière action." }, surClic: actions.annuler });
  const refaire = bouton({ icone: "refaire", texte: "Refaire", classe: "plat", aide: { nom: "Refaire", raccourci: "Ctrl+Y", texte: "Rétablit la dernière action annulée." }, surClic: actions.refaire });

  const choixDeFichier = creer("input", { attributs: { type: "file", accept: ".stl,model/stl", multiple: "", hidden: "" } });
  choixDeFichier.addEventListener("change", () => {
    if (choixDeFichier.files.length > 0) actions.importer([...choixDeFichier.files]);
    choixDeFichier.value = "";
  });
  const importer = bouton({
    icone: "importer", texte: "Importer", classe: "plat",
    aide: { nom: "Importer", texte: "Ajoute au projet une pièce venue d'un fichier STL.", geste: "Le fichier peut aussi être déposé sur la vue." },
    surClic: () => choixDeFichier.click(),
  });
  const exporter = bouton({ icone: "exporter", texte: "Exporter STL", classe: "plat", aide: { nom: "Exporter STL", texte: "Télécharge le projet en fichier STL, prêt pour le logiciel de l'imprimante 3D." }, surClic: actions.exporter });

  const raccourcis = bouton({
    texte: "?", classe: "plat",
    aide: { nom: "Raccourcis clavier", texte: "La liste de toutes les touches du logiciel." },
    surClic: actions.ouvrirLesRaccourcis,
  });

  const indicateur = creer("span", { classe: "indicateur-enregistrement" });

  // Deux mondes : l'assemblage qu'on conçoit, le plateau qu'on imprime. On passe
  // de l'un à l'autre sans rien perdre, autant de fois qu'on veut.
  const onglet = (nomEspace, texte, explication) => {
    const b = creer("button", {
      classe: "onglet-espace", texte,
      aide: { nom: texte, texte: explication },
      attributs: { type: "button", role: "tab", "aria-selected": "false" },
    });
    b.addEventListener("click", () => actions.changerEspace(nomEspace));
    return b;
  };
  const onglets = {
    conception: onglet("conception", "Conception", "Concevoir les pièces et les assembler."),
    impression: onglet("impression", "Impression", "Placer les pièces sur le plateau de l'imprimante. Leur place dans l'assemblage ne change pas."),
    calibration: onglet("calibration", "Calibration", "Régler l'imprimante et la matière par des impressions d'essai. Le projet n'y est pas touché."),
  };
  const barreOnglets = creer("div", { classe: "onglets-espace", attributs: { role: "tablist", "aria-label": "Espace de travail" } },
    [onglets.conception, onglets.impression, onglets.calibration]);

  conteneur.append(
    nom, projets, separateur(), barreOnglets, separateur(), annuler, refaire, separateur(), importer, exporter, choixDeFichier,
    creer("span", { classe: "pousse" }), raccourcis, indicateur,
  );

  return {
    mettreAJour({ nomDuProjet, peutAnnuler, peutRefaire, espace }) {
      for (const [nomEspace, b] of Object.entries(onglets)) {
        b.setAttribute("aria-selected", String(nomEspace === espace));
        b.classList.toggle("actif", nomEspace === espace);
      }
      importer.hidden = espace !== "conception";
      exporter.hidden = espace === "calibration";
      exporter.querySelector("span").textContent = espace === "impression" ? "Exporter le plateau" : "Exporter STL";
      nomAffiche = nomDuProjet;
      if (document.activeElement !== nom) nom.value = nomDuProjet;
      annuler.disabled = !peutAnnuler;
      refaire.disabled = !peutRefaire;
    },

    /* horsSite : l'élève n'est pas connecté, le projet reste dans ce navigateur. */
    afficherEnregistrement(etat, message = "", horsSite = false) {
      const texte = TEXTES_ENREGISTREMENT[etat] ?? "";
      indicateur.textContent = horsSite && etat === "enregistre" ? "Enregistré dans ce navigateur" : texte;
      indicateur.classList.toggle("erreur", etat === "erreur");
      indicateur.title = message;
    },
  };
}
