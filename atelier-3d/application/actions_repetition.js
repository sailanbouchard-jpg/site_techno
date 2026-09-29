/*
 * application/actions_repetition.js
 * ─────────────────────────────────
 * Symétrie, répétition en ligne, répétition en cercle, figer. Créer ou
 * modifier une répétition ouvre sa fenêtre d'opération (voir
 * application/operations/operations_repetition.js) ; ce module fournit les
 * briques : envelopper l'objet, régler, passer d'un repère à l'autre.
 */

import { trouverNoeud } from "../noyau/document.js";
import { estRepetition, parametresParDefaut, typeDeNoeud } from "../noyau/registre_types_de_noeuds.js";
import { matriceDeTransformation, inverser, appliquerAuPoint } from "../noyau/transformations.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import { commandeEnvelopper } from "../noyau/commandes/commande_envelopper.js";
import { commandeFiger } from "../noyau/commandes/commande_figer.js";
import { commandeDegrouper } from "../noyau/commandes/commande_degrouper.js";
import { commandeModifierParametre } from "../noyau/commandes/commande_modifier_parametre.js";
import { operationDeRepetition } from "./operations/operations_repetition.js";

export const arrondi = (valeur) => Math.round(valeur * 100) / 100 || 0;
const parametresDe = (noeud) => ({ ...parametresParDefaut(noeud.type), ...noeud.parametres });

export function creerActionsRepetition({ etat, scene, annoncer, edition, operations, choix, garderEnVue }) {
  function executer(commande) {
    if (commande !== null) etat.executer(commande);
  }

  const outils = {
    etat, scene, annoncer, choix, operations, garderEnVue,
    noeud: (id) => trouverNoeud(etat.document(), id),
    parametres: (id) => parametresDe(trouverNoeud(etat.document(), id)),

    /*
     * Pose l'objet sélectionné dans une répétition. parametresPour(taille)
     * rend les réglages de départ. Rend { id, taille } ; lève une erreur si
     * c'est impossible (l'opération ne s'ouvre pas).
     */
    envelopper(nomDuType, parametresPour) {
      const ids = edition.selectionAffichee();
      if (ids.length !== 1) {
        throw new Error("Sélectionner un seul objet. Pour en répéter plusieurs, les grouper d'abord.");
      }
      const boite = scene.boiteMonde(ids[0]);
      if (boite === null) throw new Error("L'objet se calcule encore : réessayer dans un instant.");
      const [x, y, z] = [0, 1, 2].map((i) => arrondi(boite.max[i] - boite.min[i]));
      const taille = { x, y, z };
      const appui = { x: (boite.min[0] + boite.max[0]) / 2, y: (boite.min[1] + boite.max[1]) / 2, z: boite.min[2] };
      const parametres = {
        ...parametresParDefaut(nomDuType),
        centreObjet: { x: 0, y: 0, z: arrondi(z / 2) },
        tailleObjet: taille,
        ...parametresPour(taille, appui),
      };
      const commande = commandeEnvelopper.creer(etat.document(), ids[0], nomDuType, parametres, appui);
      executer(commande);
      return { id: commande.enveloppe.id, taille };
    },

    /* Plusieurs réglages d'un coup. L'avant est la valeur réelle, défaut compris. */
    regler(id, valeurs) {
      const noeud = trouverNoeud(etat.document(), id);
      const p = parametresDe(noeud);
      const commandes = Object.entries(valeurs)
        .filter(([cle, valeur]) => JSON.stringify(p[cle]) !== JSON.stringify(valeur))
        .map(([cle, valeur]) => commandeModifierParametre.creer(id, cle, p[cle], valeur));
      if (commandes.length > 0) executer(commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, "Régler"));
    },

    /* Un point du monde vu dans le repère de la répétition, et l'inverse. */
    versLeRepere(id, point) {
      const m = matriceDeTransformation(outils.noeud(id).transformation);
      return appliquerAuPoint(inverser(m) ?? m, point).map(arrondi);
    },
    versLeMonde: (id, point) => appliquerAuPoint(matriceDeTransformation(outils.noeud(id).transformation), point),
  };

  function demarrer(nomDuType, id) {
    operations.demarrer(operationDeRepetition(nomDuType, outils, id));
  }

  return {
    creer: (nomDuType) => demarrer(nomDuType, null),
    modifier(id) {
      const noeud = outils.noeud(id);
      if (noeud !== null && estRepetition(noeud.type)) demarrer(noeud.type, id);
    },

    figer() {
      const repetitions = etat.noeudsSelectionnes().filter((n) => estRepetition(n.type));
      if (repetitions.length === 0) {
        annoncer("Figer : sélectionner une symétrie ou une répétition.", true);
        return;
      }
      try {
        const commandes = repetitions.map((n) => commandeFiger.creer(etat.document(), n.id));
        executer(commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, "Figer"));
      } catch (erreur) {
        annoncer(erreur.message, true);
      }
    },

    /* Les boutons de l'inspecteur pour une répétition. */
    actionsDe(noeud) {
      if (!estRepetition(noeud.type)) return [];
      const type = typeDeNoeud(noeud.type);
      return [
        { icone: type.icone, texte: "Modifier la " + type.etiquette.toLowerCase(), actif: true, action: () => this.modifier(noeud.id) },
        {
          icone: "figer", texte: "Figer", titre: "Remplace les copies par des pièces indépendantes, modifiables une à une.",
          actif: true, action: () => this.figer(),
        },
        {
          icone: "degrouper", texte: "Retirer la " + type.etiquette.toLowerCase(), titre: "Supprime les copies et ne conserve que l'objet d'origine.",
          actif: true,
          action: () => {
            try {
              executer(commandeDegrouper.creer(etat.document(), noeud.id));
            } catch (erreur) {
              annoncer(erreur.message, true);
            }
          },
        },
      ];
    },

    disponibilites() {
      const unSeul = edition.selectionAffichee().length === 1;
      return {
        symetrie: unSeul,
        repetition_ligne: unSeul,
        repetition_cercle: unSeul,
        figer: etat.noeudsSelectionnes().some((n) => estRepetition(n.type)),
      };
    },
  };
}
