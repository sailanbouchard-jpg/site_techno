/*
 * noyau/commandes/commande_modifier_variables.js
 * Une variable ajoutée, renommée, changée ou retirée, une formule posée sur un
 * champ : tout ce qui recalcule les champs pilotés. Changer une variable peut
 * déplacer vingt objets d'un coup ; la commande garde donc la liste des
 * variables et l'arbre, d'avant et d'après. Les nœuds étant partagés d'une
 * version à l'autre, cela ne coûte que les branches recalculées.
 */

import { avecRacine, avecVariables } from "../document.js";

const remettre = (document, etat) => avecVariables(avecRacine(document, etat.racine), etat.variables);

export const commandeModifierVariables = {
  type: "modifier_variables",

  /* cle : ce qui est réglé (« valeur:v3 »), pour fusionner les flèches d'un même champ. */
  creer(documentAvant, documentApres, libelle, cle = null) {
    return {
      type: "modifier_variables",
      libelle,
      cle,
      avant: { variables: documentAvant.variables, racine: documentAvant.racine },
      apres: { variables: documentApres.variables, racine: documentApres.racine },
    };
  },

  appliquer: (document, commande) => remettre(document, commande.apres),
  annuler: (document, commande) => remettre(document, commande.avant),

  fusionnerAvec(precedente, courante) {
    if (precedente.cle === null || precedente.cle !== courante.cle) return null;
    return { ...precedente, apres: courante.apres };
  },
};
