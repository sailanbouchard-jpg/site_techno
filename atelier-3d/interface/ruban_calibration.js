/*
 * interface/ruban_calibration.js
 * ──────────────────────────────
 * Le ruban de l'onglet Calibration. Il est court exprès : ici on ne pose rien
 * sur le plateau et on ne déplace rien, c'est l'essai qui décide de ce qui s'y
 * trouve. Restent l'aperçu, l'envoi à l'imprimante, l'arrêt de l'essai et
 * l'export de la combinaison.
 */

import { creer } from "./elements.js";
import { boutonRuban, griser, groupe } from "./ruban.js";
import { definirCondition } from "./bulle_d_aide.js";

const SANS_ESSAI = "Ouvrir un essai et poser son éprouvette.";
const SANS_COMBINAISON = "Créer ou choisir une combinaison.";

/*
 * actions : { apercu(), imprimantes(), arreter(), exporterFichier(), exporter() }
 */
export function creerRubanCalibration(conteneur, actions) {
  const nomDeLaCombinaison = creer("span", { classe: "nom-combinaison" });
  const nomDeLEssai = creer("span", { classe: "volume-machine" });
  const blocEssai = creer("div", { classe: "bloc-machine" }, [nomDeLaCombinaison, nomDeLEssai]);

  const boutons = new Map();
  const commande = (nom, options, condition = null) => {
    const b = boutonRuban(options);
    boutons.set(nom, { bouton: b, condition });
    return b;
  };

  const essai = [
    commande("apercu", {
      iconeNom: "couches", texte: "Aperçu tranché",
      aide: { nom: "Aperçu du tranchage", raccourci: "V", texte: "Montre l'éprouvette telle qu'elle sera imprimée, couche par couche." },
      surClic: actions.apercu,
    }, SANS_ESSAI),
    commande("arreter", {
      iconeNom: "arret", texte: "Arrêter l'essai",
      aide: { nom: "Arrêter l'essai", texte: "Retire l'éprouvette. Les résultats déjà retenus restent dans la combinaison." },
      surClic: actions.arreter,
    }, SANS_ESSAI),
  ];

  const imprimer = [
    commande("imprimantes", {
      iconeNom: "imprimante", texte: "Imprimantes",
      aide: { nom: "Imprimantes du réseau", texte: "Envoie l'éprouvette à une imprimante du réseau local et suit l'impression." },
      surClic: actions.imprimantes,
    }, SANS_ESSAI),
    commande("fichier", {
      iconeNom: "exporter", texte: "Fichier .gcode.3mf",
      aide: { nom: "Fichier pour l'imprimante", texte: "Télécharge l'éprouvette à copier sur la carte SD." },
      surClic: actions.exporterFichier,
    }, SANS_ESSAI),
  ];

  const combinaison = [
    commande("exporter", {
      iconeNom: "exporter", texte: "Exporter",
      aide: { nom: "Exporter la combinaison", texte: "Crée cinq préréglages personnels du nom de la combinaison (imprimante, buse, plaque, matériau, réglages), choisissables dans l'onglet Impression." },
      surClic: actions.exporter,
    }, SANS_COMBINAISON),
  ];

  conteneur.append(
    groupe("Combinaison", [blocEssai]),
    groupe("Essai", essai),
    groupe("Imprimer", imprimer),
    groupe("Préréglages", combinaison),
  );

  return {
    /* etat : { essai: nom | null, combinaison, apercu, imprimantes } */
    mettreAJour({ essai: nomEssai, combinaison: active, apercu, imprimantes }) {
      nomDeLaCombinaison.textContent = active === null ? "Aucune combinaison" : active.nom;
      nomDeLEssai.textContent = nomEssai === null ? "Aucun essai en cours" : nomEssai;
      const disponibles = {
        apercu: nomEssai !== null,
        arreter: nomEssai !== null,
        imprimantes: nomEssai !== null,
        fichier: nomEssai !== null,
        exporter: active !== null,
      };
      for (const [nom, { bouton: b, condition }] of boutons) {
        griser(b, !disponibles[nom]);
        definirCondition(b, condition);
      }
      boutons.get("apercu").bouton.classList.toggle("actif", apercu);
      boutons.get("imprimantes").bouton.classList.toggle("actif", imprimantes);
    },
  };
}
