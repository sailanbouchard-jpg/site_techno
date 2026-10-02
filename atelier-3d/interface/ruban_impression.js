/*
 * interface/ruban_impression.js
 * ─────────────────────────────
 * Le ruban de l'onglet Impression : choisir l'imprimante, remplir le plateau,
 * orienter et ranger les pièces, exporter. Mêmes boutons et même rangement
 * par familles que le ruban de la conception.
 */

import { creer } from "./elements.js";
import { boutonRuban, griser, groupe } from "./ruban.js";
import { definirCondition } from "./bulle_d_aide.js";
import { ESSAIS } from "../noyau/calibration.js";

const UNE = "Sélectionner au moins une pièce du plateau.";

/*
 * imprimantes() : les préréglages d'imprimante [{ id, nom }], relus à chaque mise à
 *   jour — un préréglage enregistré en ajoute un. Le volume vient du matériel résolu.
 * actions : { machine(id), toutMettre(), disposer(), poserAPlat(), tourner(degres),
 *             orienter(), dupliquer(), retirer(), exporter(), exporterGcode(),
 *             apercu(), imprimantes(), calibrer(idEssai), retirerEssai() }
 * machines : [{ id, nom, largeur, profondeur, hauteur }]
 */
export function creerRubanImpression(conteneur, imprimantes, actions) {
  const choixMachine = creer("select", {
    classe: "champ-texte choix-machine",
    aide: { nom: "Imprimante", texte: "Le préréglage d'imprimante : les limites de la machine, la levée de buse, l'essuyage, la sortie du G-code. Un seul couvre la P1P et la P1S, qui tranchent à l'identique ; « Machine visée », dans les réglages, décide du modèle du fichier." },
    attributs: { "aria-label": "Imprimante" },
  }, imprimantes().map((m) => creer("option", { texte: m.nom, attributs: { value: m.id } })));
  choixMachine.addEventListener("change", () => actions.machine(choixMachine.value));
  const volume = creer("span", { classe: "volume-machine" });
  const blocMachine = creer("div", { classe: "bloc-machine" }, [choixMachine, volume]);

  const boutons = new Map();
  const commande = (nom, options, condition = null) => {
    const b = boutonRuban(options);
    boutons.set(nom, { bouton: b, condition });
    return b;
  };

  const plateau = [
    commande("toutMettre", {
      iconeNom: "plateau", texte: "Tout mettre",
      aide: { nom: "Tout mettre sur le plateau", texte: "Ajoute au plateau chaque objet du projet qui n'y est pas encore. Un objet peut aussi être ajouté seul depuis la liste de gauche." },
      surClic: actions.toutMettre,
    }, "Tous les objets du projet sont déjà sur le plateau."),
    commande("disposer", {
      iconeNom: "disposer", texte: "Disposer",
      aide: { nom: "Disposer", texte: "Range toutes les pièces en rangées, sans chevauchement, au centre du plateau." },
      surClic: actions.disposer,
    }, "Le plateau est vide."),
  ];

  const orienter = [
    commande("poserAPlat", {
      iconeNom: "poser", texte: "Poser à plat",
      aide: { nom: "Poser à plat", raccourci: "P", texte: "Cliquer ensuite la face de la pièce qui doit reposer sur le plateau. La pièce bascule pour poser cette face à plat." },
      surClic: actions.poserAPlat,
    }, "Le plateau est vide."),
    commande("tourner", {
      iconeNom: "tourner", texte: "Tourner 90°",
      aide: { nom: "Tourner d'un quart de tour", raccourci: "R", texte: "Tourne la sélection autour de la verticale. Maj+R tourne dans l'autre sens." },
      surClic: () => actions.tourner(90),
    }, UNE),
    commande("orienter", {
      iconeNom: "vue", texte: "Comme l'assemblage",
      aide: { nom: "Orientation de l'assemblage", texte: "Rend à la pièce l'orientation qu'elle a dans la conception." },
      surClic: actions.orienter,
    }, UNE),
  ];

  const organiser = [
    commande("dupliquer", {
      iconeNom: "dupliquer", texte: "Dupliquer",
      aide: { nom: "Dupliquer", raccourci: "Ctrl+D", texte: "Ajoute un exemplaire de plus de chaque pièce sélectionnée, à une place libre." },
      surClic: actions.dupliquer,
    }, UNE),
    commande("retirer", {
      iconeNom: "supprimer", texte: "Retirer",
      aide: { nom: "Retirer du plateau", raccourci: "Suppr", texte: "Retire la pièce du plateau. L'objet reste dans la conception." },
      surClic: actions.retirer,
    }, UNE),
  ];

  const apercu = [
    commande("apercu", {
      iconeNom: "couches", texte: "Aperçu tranché",
      aide: { nom: "Aperçu du tranchage", raccourci: "V", texte: "Montre les pièces telles qu'elles seront imprimées : couche par couche, ligne par ligne. Le tranchage suit chaque changement de pièce ou de réglage." },
      surClic: actions.apercu,
    }, "Le plateau est vide."),
  ];

  const envoyer = [
    commande("imprimantes", {
      iconeNom: "imprimante", texte: "Imprimantes",
      aide: { nom: "Imprimantes du réseau", texte: "Envoie le plateau à une imprimante du réseau local et suit l'impression : avancement, températures, pause, arrêt." },
      surClic: actions.imprimantes,
    }),
  ];

  // Un bouton par essai, dans l'ordre d'OrcaSlicer. Chacun ouvre sa boîte de
  // réglages, puis pose son éprouvette sur le plateau : on reste dans le
  // slicer, avec les réglages éditables à gauche.
  const calibrer = [
    ...ESSAIS.map((essai) => commande("essai_" + essai.id, {
      iconeNom: "regle", texte: essai.nom,
      aide: { nom: essai.titre, texte: essai.but },
      surClic: () => actions.calibrer(essai.id),
    })),
    commande("retirerEssai", {
      iconeNom: "supprimer", texte: "Retirer l'essai",
      aide: { nom: "Retirer l'essai", texte: "Enlève l'éprouvette du plateau. Le G-code redevient celui d'un plateau ordinaire." },
      surClic: actions.retirerEssai,
    }, "Aucun essai posé."),
  ];

  const exporter = [
    commande("exporterGcode", {
      iconeNom: "exporter", texte: "Fichier .gcode.3mf",
      aide: { nom: "Fichier pour l'imprimante", texte: "Tranche le plateau et télécharge le fichier que l'imprimante lit sur sa carte SD." },
      surClic: actions.exporterGcode,
    }, "Le plateau est vide."),
    commande("exporter", {
      iconeNom: "exporter", texte: "STL du plateau",
      aide: { nom: "Exporter le plateau", texte: "Télécharge un STL des pièces placées comme sur la machine : un trancheur l'ouvre à l'identique." },
      surClic: actions.exporter,
    }, "Le plateau est vide."),
  ];

  conteneur.append(
    groupe("Imprimante", [blocMachine]),
    groupe("Plateau", plateau),
    groupe("Orienter", orienter),
    groupe("Organiser", organiser),
    groupe("Tranchage", apercu),
    groupe("Imprimer", envoyer),
    groupe("Calibrer", calibrer),
    groupe("Exporter", exporter),
  );

  return {
    /* etat : { machine, disponibles: { nom: bool }, poserAPlat: bool } */
    mettreAJour({ imprimante, machine, disponibles, poserAPlat, apercu: apercuActif, imprimantes: imprimantesOuvertes }) {
      // Un préréglage personnel vient peut-être d'apparaître.
      const attendues = imprimantes();
      if (choixMachine.options.length !== attendues.length) {
        choixMachine.replaceChildren(...attendues.map((m) => creer("option", { texte: m.nom, attributs: { value: m.id } })));
      }
      if (choixMachine.value !== imprimante) choixMachine.value = imprimante;
      volume.textContent = machine.largeur + " × " + machine.profondeur + " × " + machine.hauteur + " mm";
      for (const [nom, { bouton, condition }] of boutons) {
        const possible = disponibles[nom] ?? true;
        griser(bouton, !possible);
        definirCondition(bouton, condition);
      }
      boutons.get("poserAPlat").bouton.classList.toggle("actif", poserAPlat);
      boutons.get("apercu").bouton.classList.toggle("actif", apercuActif);
      boutons.get("imprimantes").bouton.classList.toggle("actif", imprimantesOuvertes);
    },
  };
}
