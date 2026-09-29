/*
 * application/actions_coupes.js
 * ─────────────────────────────
 * Les vues en coupe : les créer, les régler, les activer, les supprimer. Les
 * coupes sont dans le document ; laquelle est active est un état de l'écran,
 * gardé ici. Pendant qu'une coupe est active, tout fonctionne comme d'habitude :
 * seule la moitié des pièces tournée vers la caméra est retirée à l'affichage.
 */

import { commandeModifierCoupes } from "../noyau/commandes/commande_modifier_coupes.js";
import {
  PLANS_DE_COUPE, nouvelleCoupe, planDeLaCoupe, vueDeLaCoupe,
} from "../noyau/vues_en_coupe.js";

const PLAN_PAR_DEFAUT = "XZ";

/* dependances : { etat, scene, operations, rafraichir() } */
export function creerActionsCoupes({ etat, scene, operations, rafraichir }) {
  let active = null;   // l'identifiant de la coupe active, ou null

  const coupes = () => etat.document().coupes ?? [];
  const modifierListe = (apres) => etat.executer(commandeModifierCoupes.creer(coupes(), apres));

  /* La coupe active, relue dans le document : une annulation a pu la changer ou la retirer. */
  function appliquer() {
    const coupe = coupes().find((c) => c.id === active) ?? null;
    if (coupe === null) active = null;
    scene.definirCoupe(coupe === null ? null : planDeLaCoupe(coupe));
  }

  /* La caméra face à la coupe. En esquisse, la vue reste face au plan d'esquisse. */
  const regarder = (coupe) => scene.placerSurVue(vueDeLaCoupe(coupe));

  /* Au milieu des pièces, le long de l'axe perpendiculaire au plan : la coupe les traverse. */
  function positionAuMilieu(plan) {
    const boite = scene.boiteDeLaScene();
    if (boite.isEmpty()) return 0;
    const axe = PLANS_DE_COUPE[plan].axe;
    return Math.round((boite.min.getComponent(axe) + boite.max.getComponent(axe)) * 5) / 10;
  }

  /* Créer une coupe (idExistant absent) ou régler une coupe existante. */
  function operationCoupe(idExistant = null) {
    let id = idExistant;
    return {
      titre: idExistant === null ? "Nouvelle vue en coupe" : "Vue en coupe",
      icone: "coupe",
      libelle: idExistant === null ? "Nouvelle vue en coupe" : "Régler la vue en coupe",
      champs: [
        {
          genre: "choix", cle: "plan", etiquette: "Plan de base",
          options: Object.entries(PLANS_DE_COUPE).map(([valeur, p]) => ({
            valeur, etiquette: p.etiquette, aide: "Plan " + valeur + ", décalé le long de l'axe " + p.nomDeLAxe + ".",
          })),
        },
        {
          genre: "nombre", cle: "position", etiquette: "Décalage", unite: "mm", decimales: 1,
          aide: "Position du plan de coupe sur l'axe qui lui est perpendiculaire : Z pour XY, Y pour XZ, X pour YZ.",
        },
        { genre: "case", cle: "inverse", texte: "Voir depuis l'autre côté" },
      ],

      preparer() {
        if (id !== null) {
          const coupe = coupes().find((c) => c.id === id);
          if (coupe === undefined) return null;
          active = id;
          appliquer();
          return { plan: coupe.plan, position: coupe.position, inverse: coupe.inverse };
        }
        const coupe = nouvelleCoupe(coupes(), PLAN_PAR_DEFAUT, positionAuMilieu(PLAN_PAR_DEFAUT));
        modifierListe([...coupes(), coupe]);
        id = coupe.id;
        active = id;
        appliquer();
        regarder(coupe);
        return { plan: coupe.plan, position: coupe.position, inverse: coupe.inverse };
      },

      changer(cle, valeur, valeurs) {
        const suivantes = { ...valeurs, [cle]: valeur };
        // Un autre plan : la coupe repart du milieu des pièces, le long de son nouvel axe.
        if (cle === "plan") suivantes.position = positionAuMilieu(valeur);
        modifierListe(coupes().map((c) => (c.id === id ? { ...c, ...suivantes } : c)));
        active = id;
        appliquer();
        if (cle !== "position") regarder(suivantes);
        return suivantes;
      },

      // Annuler rend le document d'avant : la coupe créée disparaît, la coupe réglée reprend ses valeurs.
      apresAnnulation: () => {
        appliquer();
        rafraichir();
      },
    };
  }

  return {
    active: () => active,

    /* Après chaque changement du document (annuler, ouvrir un projet…). */
    synchroniser: appliquer,

    creer: () => operations.demarrer(operationCoupe()),
    regler: (id) => operations.demarrer(operationCoupe(id)),

    /* Un clic sur une vue en coupe l'active ; un second la quitte. */
    basculer(id) {
      const coupe = coupes().find((c) => c.id === id);
      if (coupe === undefined) return;
      active = active === id ? null : id;
      appliquer();
      if (active !== null) regarder(coupe);
      rafraichir();
    },

    supprimer(id) {
      if (active === id) active = null;
      modifierListe(coupes().filter((c) => c.id !== id));
    },
  };
}
