/*
 * noyau/commandes/registre_commandes.js
 * ─────────────────────────────────────
 * La pile d'annulation ne connaît aucun type de commande : elle passe par ce
 * registre. Ajouter une commande au logiciel = un fichier neuf et une ligne
 * ici. La pile, elle, ne bouge jamais.
 */

import { commandeAjouterNoeud } from "./commande_ajouter_noeud.js";
import { commandeSupprimerNoeud } from "./commande_supprimer_noeud.js";
import { commandeDeplacerNoeud } from "./commande_deplacer_noeud.js";
import { commandeTransformerNoeud } from "./commande_transformer_noeud.js";
import { commandeModifierParametre } from "./commande_modifier_parametre.js";
import { commandeModifierProprietes } from "./commande_modifier_proprietes.js";
import { commandeBasculerTrou } from "./commande_basculer_trou.js";
import { commandeGrouper } from "./commande_grouper.js";
import { commandeDegrouper } from "./commande_degrouper.js";
import { commandeDupliquer } from "./commande_dupliquer.js";
import { commandeRenommerDocument } from "./commande_renommer_document.js";
import { commandeModifierEsquisse } from "./commande_modifier_esquisse.js";
import { commandeConsommerEsquisse } from "./commande_consommer_esquisse.js";
import { commandeEnvelopper } from "./commande_envelopper.js";
import { commandeFiger } from "./commande_figer.js";
import { commandeModifierCoupes } from "./commande_modifier_coupes.js";
import { commandeModifierVariables } from "./commande_modifier_variables.js";
import { commandeModifierPlateau } from "./commande_modifier_plateau.js";
import { creerCommandeLot } from "./commande_lot.js";

// Déclaration de fonction, donc hissée : le lot peut la recevoir avant que la
// table ci-dessous soit remplie, il ne l'appellera qu'à l'usage.
export function descripteurDeCommande(type) {
  const descripteur = PAR_TYPE.get(type);
  if (descripteur === undefined) {
    throw new Error("Commande inconnue : « " + type + " ».");
  }
  return descripteur;
}

export const commandeLot = creerCommandeLot(descripteurDeCommande);

const COMMANDES = [
  commandeAjouterNoeud,
  commandeSupprimerNoeud,
  commandeDeplacerNoeud,
  commandeTransformerNoeud,
  commandeModifierParametre,
  commandeModifierProprietes,
  commandeBasculerTrou,
  commandeGrouper,
  commandeDegrouper,
  commandeDupliquer,
  commandeRenommerDocument,
  commandeModifierEsquisse,
  commandeConsommerEsquisse,
  commandeEnvelopper,
  commandeFiger,
  commandeModifierCoupes,
  commandeModifierVariables,
  commandeModifierPlateau,
  commandeLot,
];

const PAR_TYPE = new Map(COMMANDES.map((commande) => [commande.type, commande]));

/* Les objets qu'une commande vient de faire naître, pour que l'interface les
   sélectionne : la copie après « Dupliquer », le groupe après « Grouper ». */
export function identifiantsCrees(commande) {
  const descripteur = descripteurDeCommande(commande.type);
  return typeof descripteur.identifiantsCrees === "function" ? descripteur.identifiantsCrees(commande) : [];
}

/* Les objets qu'annuler la commande fait revenir, pour les resélectionner :
   annuler « Grouper » rend les membres, annuler « Supprimer » rend l'objet. */
export function identifiantsRestaures(commande) {
  const descripteur = descripteurDeCommande(commande.type);
  return typeof descripteur.identifiantsRestaures === "function" ? descripteur.identifiantsRestaures(commande) : [];
}
