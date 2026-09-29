/*
 * interface/ruban.js
 * ──────────────────
 * Le ruban, sous la barre du haut : tout ce que le logiciel sait faire,
 * rangé par familles (Formes, Dessiner, Répéter, Assembler, Organiser). Les
 * boutons d'une famille sont serrés, les familles bien séparées : l'œil
 * trouve la famille d'abord, le bouton ensuite.
 *
 * Chaque bouton a sa bulle d'aide : ce qu'il fait et, s'il est grisé, ce qu'il
 * faut sélectionner. Un bouton grisé l'est par aria-disabled et non disabled :
 * un bouton désactivé ne reçoit pas le survol dans tous les navigateurs, et
 * c'est justement là que la bulle est utile.
 *
 * Les formes se posent d'un clic au centre de la vue, ou se glissent dedans.
 * La liste des formes vient du registre : aucun code propre à une forme ici.
 */

import { creer } from "./elements.js";
import { icone, iconeExiste } from "./icones.js";
import { definirCondition } from "./bulle_d_aide.js";

export const TYPE_DE_GLISSER = "application/x-atelier-forme";

const GESTE_FORME = "Clic : ajout au centre de la vue. Glisser : dépôt à l'endroit voulu.";
const PENDANT_UNE_OPERATION = "Valider ou annuler d'abord l'opération en cours.";

const inactif = (b) => b.getAttribute("aria-disabled") === "true";

export function boutonRuban({ iconeNom, texte, aide, surClic, classe = "" }) {
  const b = creer("button", { classe: ("bouton-ruban " + classe).trim(), aide, attributs: { type: "button" } }, [
    icone(iconeExiste(iconeNom) ? iconeNom : "pave"),
    creer("span", { classe: "nom-ruban", texte }),
  ]);
  b.addEventListener("click", (evenement) => {
    if (!inactif(b)) surClic(evenement);
  });
  return b;
}

export function griser(b, grise) {
  b.setAttribute("aria-disabled", String(grise));
  b.draggable = !grise && b.dataset.glissable === "oui";
}

export function groupe(titre, boutons) {
  return creer("div", { classe: "groupe-ruban", attributs: { role: "group", "aria-label": titre } }, [
    creer("div", { classe: "boutons-ruban" }, boutons),
    creer("div", { classe: "titre-groupe-ruban", texte: titre }),
  ]);
}

/* Une forme : clic pour la poser, glisser pour la placer sous la souris. */
function boutonForme(type, ajouter, classe) {
  const b = boutonRuban({
    iconeNom: type.icone,
    texte: type.etiquette,
    aide: { nom: type.etiquette, terme: type.termeDuProgramme, texte: type.aide, geste: GESTE_FORME },
    surClic: () => ajouter(type.nom),
    classe,
  });
  b.dataset.glissable = "oui";
  b.draggable = true;
  b.addEventListener("dragstart", (evenement) => {
    evenement.dataTransfer.setData(TYPE_DE_GLISSER, type.nom);
    evenement.dataTransfer.effectAllowed = "copy";
  });
  return b;
}

/*
 * formes : types du registre (formesCreables) ;
 * dessin : { solides, solidesMulti, repetitions } : des types [{ nom, verbe, termeDuProgramme, aide, icone }] ;
 *          solidesMulti : ceux qu'on tire de plusieurs esquisses (balayage, lissage)
 * actions : { ajouter(nomDuType), operation(nom), nouvelleEsquisse(), consommer(nomDuType), consommerPlusieurs(nomDuType),
 *             repeter(nomDuType), aligner(), ouvrirBibliotheque(ancre), finition(nom) }
 */
export function creerRuban(conteneur, formes, dessin, actions) {
  const commandes = new Map();   // nom → { bouton, condition }

  /* description : { iconeNom, texte, aide, surClic } ; condition : ce qui manque quand il est grisé. */
  function commande(nom, description, condition = "") {
    const b = boutonRuban(description);
    commandes.set(nom, { bouton: b, condition });
    return b;
  }

  // ── Formes et formes prêtes ──
  const primitives = formes.filter((type) => type.categorie === "primitive").map((type) => boutonForme(type, actions.ajouter));
  const bibliotheque = creer("div", { classe: "menu-ruban", attributs: { role: "menu" } },
    formes.filter((type) => type.categorie === "bibliotheque").map((type) => boutonForme(type, (nom) => {
      bibliotheque.hidden = true;
      actions.ajouter(nom);
    }, "dans-menu")));
  bibliotheque.hidden = true;
  const ouvrirBibliotheque = boutonRuban({
    iconeNom: "etoile", texte: "Plus ▾",
    aide: { nom: "Formes prêtes", texte: "Étoile, cœur, engrenage, flèche, croix : des formes déjà en volume." },
    surClic: (evenement) => {
      evenement.stopPropagation();
      bibliotheque.hidden = !bibliotheque.hidden;
    },
  });
  const blocBibliotheque = creer("div", { classe: "ancre-menu" }, [ouvrirBibliotheque, bibliotheque]);
  document.addEventListener("pointerdown", (evenement) => {
    if (!blocBibliotheque.contains(evenement.target)) bibliotheque.hidden = true;
  });
  // Le glisser d'une forme hors du menu referme le menu, pour laisser voir la vue.
  bibliotheque.addEventListener("dragstart", () => setTimeout(() => { bibliotheque.hidden = true; }));

  // ── Bibliothèque d'objets paramétriques ──
  const objets = boutonRuban({
    iconeNom: "bibliotheque", texte: "Objets ▾",
    aide: { nom: "Bibliothèque d'objets", texte: "Objets paramétriques prêts à poser (clips…) : leurs dimensions se règlent par leurs paramètres, dans les limites que leur conception autorise." },
    surClic: (evenement) => {
      evenement.stopPropagation();
      actions.ouvrirBibliotheque(objets);
    },
  });

  // ── Dessiner ──
  const dessiner = [
    commande("esquisse", {
      iconeNom: "esquisse", texte: "Esquisse",
      aide: {
        nom: "Esquisse", raccourci: "K",
        texte: "Dessin à plat sur un plan de base ou sur la face plane d'une pièce. Il sert ensuite à créer un solide.",
      },
      surClic: () => actions.nouvelleEsquisse(),
    }, "Valider d'abord l'esquisse ou l'opération en cours."),
    ...dessin.solides.map((solide) => commande(solide.nom, {
      iconeNom: solide.icone, texte: solide.verbe,
      aide: { nom: solide.verbe, terme: solide.termeDuProgramme, texte: solide.aide },
      surClic: () => actions.consommer(solide.nom),
    }, solide.profilRequis === "ferme"
      ? "Sélectionner une esquisse dont le contour est fermé."
      : "Sélectionner une esquisse.")),
    ...(dessin.solidesMulti ?? []).map((solide) => commande(solide.nom, {
      iconeNom: solide.icone, texte: solide.verbe,
      aide: { nom: solide.verbe, terme: solide.termeDuProgramme, texte: solide.aide },
      surClic: () => actions.consommerPlusieurs(solide.nom),
    }, solide.nom === "balayage"
      ? "Sélectionner deux esquisses (Ctrl+clic dans la liste) : un contour fermé et un chemin d'un seul tracé."
      : "Sélectionner au moins deux esquisses à contour fermé (Ctrl+clic dans la liste), et au besoin une courbe guide.")),
  ];

  // ── Répéter ──
  const repeter = [
    ...dessin.repetitions.map((repetition) => commande(repetition.nom, {
      iconeNom: repetition.icone, texte: repetition.verbeCourt ?? repetition.verbe,
      aide: { nom: repetition.verbe, terme: repetition.termeDuProgramme, texte: repetition.aide },
      surClic: () => actions.repeter(repetition.nom),
    }, "Sélectionner un seul objet. Pour en répéter plusieurs, les grouper d'abord.")),
    commande("figer", {
      iconeNom: "figer", texte: "Figer",
      aide: { nom: "Figer", texte: "Remplace une symétrie ou une répétition par des pièces indépendantes, modifiables une à une." },
      surClic: () => actions.operation("figer"),
    }, "Sélectionner une symétrie ou une répétition."),
  ];

  // ── Finir : ce qui se fait sur une pièce déjà en volume ──
  const finir = [
    ["extrusion_face", "Face", "Extrude une face plane d'une pièce : cliquer la face dans la vue, puis choisir la hauteur, et si la matière s'ajoute à la pièce ou la creuse.", "Valider d'abord l'esquisse ou l'opération en cours."],
    ["aretes", "Arêtes", "Chanfreins et congés sur les arêtes d'une pièce : sélectionner la pièce, puis cliquer ses arêtes dans la vue.", "Sélectionner une seule pièce."],
    ["decoupe", "Couper", "Coupe une pièce par un plan : garder un côté, ou les deux morceaux écartés pour imprimer en deux fois.", "Sélectionner une seule pièce."],
    ["analyse", "Analyser", "Volume, masse, centre de gravité ; entre plusieurs pièces, recouvrements et jeux.", "Sélectionner au moins une pièce."],
  ].map(([nom, texte, explication, condition]) => commande(nom, {
    iconeNom: nom, texte,
    aide: { nom: texte, texte: explication },
    surClic: () => actions.finition(nom),
  }, condition));

  // ── Assembler et organiser ──
  const PLUSIEURS = "Sélectionner au moins deux pièces (Maj + clic).";
  const UNE = "Sélectionner au moins une pièce.";
  const bouton = ([nom, texte, raccourci, explication, condition]) => commande(nom, {
    iconeNom: nom, texte,
    aide: { nom: texte, raccourci, texte: explication },
    surClic: () => (nom === "aligner" ? actions.aligner() : actions.operation(nom)),
  }, condition);

  const assembler = [
    ["grouper", "Grouper", "Ctrl+G", "Réunit les pièces sélectionnées en une seule. Les pièces en trou creusent les autres.", PLUSIEURS],
    ["croiser", "Croiser", "", "Groupe les pièces en ne gardant que leur partie commune, celle où elles se chevauchent. Le réglage du groupe permet de revenir à la réunion.", PLUSIEURS],
    ["degrouper", "Dégrouper", "Ctrl+Maj+G", "Sépare un groupe en ses pièces d'origine.", "Sélectionner un groupe."],
    ["trou", "Trou", "T", "Fait passer la pièce de plein à trou, ou l'inverse. Un trou creuse les pièces avec lesquelles il est groupé.", UNE],
  ].map(bouton);

  const organiser = [
    ["aligner", "Aligner", "", "Aligne les pièces sélectionnées sur la première choisie, selon X, Y ou Z.", PLUSIEURS],
    ["dupliquer", "Dupliquer", "Ctrl+D", "Copie la sélection, superposée à l'original et prête à être déplacée.", UNE],
    ["supprimer", "Supprimer", "Suppr", "Supprime la sélection.", UNE],
  ].map(bouton);

  conteneur.append(
    groupe("Formes", [...primitives, blocBibliotheque]),
    groupe("Bibliothèque", [objets]),
    groupe("Dessiner", dessiner),
    groupe("Répéter", repeter),
    groupe("Finir", finir),
    groupe("Assembler", assembler),
    groupe("Organiser", organiser),
  );

  return {
    /* disponibles : { grouper: bool, … } ; tout : false pendant une opération */
    mettreAJour(disponibles, tout = true) {
      for (const [nom, { bouton: b, condition }] of commandes) {
        const possible = tout && (disponibles[nom] ?? true);
        griser(b, !possible);
        definirCondition(b, tout ? condition : PENDANT_UNE_OPERATION);
      }
      for (const b of [...primitives, ouvrirBibliotheque, objets]) {
        griser(b, !tout);
        definirCondition(b, PENDANT_UNE_OPERATION);
      }
    },
  };
}
