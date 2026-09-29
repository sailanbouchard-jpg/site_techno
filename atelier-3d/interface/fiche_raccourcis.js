/*
 * interface/fiche_raccourcis.js
 * ─────────────────────────────
 * La liste des raccourcis, ouverte d'un bouton dans la barre du haut. Les
 * bulles de survol les donnent un par un ; ici on les voit tous d'un coup,
 * ce qui permet de les apprendre au lieu de les découvrir.
 *
 * Les touches des outils viennent du registre : un outil neuf apparaît ici
 * sans qu'on y touche.
 */

import { creer, bouton } from "./elements.js";

const GENERAUX = [
  ["Ctrl + Z", "Annuler"],
  ["Ctrl + Y", "Refaire"],
  ["Ctrl + S", "Enregistrer maintenant"],
  ["Ctrl + A", "Tout sélectionner"],
  ["Ctrl + C / Ctrl + V", "Copier / Coller"],
  ["Ctrl + D", "Dupliquer"],
  ["Ctrl + G", "Grouper"],
  ["Ctrl + Maj + G", "Dégrouper"],
  ["Suppr", "Supprimer la sélection"],
  ["T", "Trou ou plein"],
  ["R / Maj + R", "Quart de tour autour de Z / de X"],
  ["K", "Nouvelle esquisse"],
  ["F", "Cadrer la vue"],
  ["Échap", "Ne plus rien sélectionner"],
  ["Flèches", "Déplacer de 1 mm (Maj : 10 mm)"],
  ["Page ↑ / ↓", "Monter ou descendre"],
];

const VUE = [
  ["Clic gauche dans le vide", "Déplacer la vue"],
  ["Clic droit", "Tourner la vue"],
  ["Molette", "Zoomer sur le point visé"],
  ["Alt pendant un glisser", "Sans aimantation"],
  ["Maj pendant une rotation", "Sans crans"],
];

function tableau(titre, lignes) {
  return creer("section", { classe: "bloc-raccourcis" }, [
    creer("h3", { texte: titre }),
    creer("dl", {}, lignes.flatMap(([touche, quoi]) => [
      creer("dt", { texte: touche }),
      creer("dd", { texte: quoi }),
    ])),
  ]);
}

/* outilsParFamille : [{ etiquette, outils: [{ etiquette, raccourci }] }] */
export function creerFicheRaccourcis(conteneur, outilsParFamille) {
  const fiche = creer("div", { classe: "fiche-raccourcis", attributs: { hidden: "", role: "dialog", "aria-label": "Raccourcis clavier" } });
  const fermer = bouton({ texte: "Fermer", classe: "plat", surClic: () => { fiche.hidden = true; } });

  fiche.append(
    creer("div", { classe: "titre-fiche" }, [creer("strong", { texte: "Raccourcis" }), fermer]),
    creer("div", { classe: "colonnes-raccourcis" }, [
      tableau("Le projet", GENERAUX),
      tableau("La vue", VUE),
      ...outilsParFamille.map((famille) => tableau(famille.etiquette, famille.outils
        .filter((outil) => outil.raccourci)
        .map((outil) => [outil.raccourci.toUpperCase(), outil.etiquette]))),
    ]),
  );
  conteneur.append(fiche);

  document.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Escape" && !fiche.hidden) fiche.hidden = true;
  });

  return {
    basculer() {
      fiche.hidden = !fiche.hidden;
    },
  };
}
