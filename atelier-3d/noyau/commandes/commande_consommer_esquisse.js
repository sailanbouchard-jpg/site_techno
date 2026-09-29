/*
 * noyau/commandes/commande_consommer_esquisse.js
 * ──────────────────────────────────────────────
 * Extruder, épaissir ou faire tourner une esquisse : le solide naît à la
 * racine du projet et désigne l'esquisse, qui reste à sa place. Elle est
 * masquée — ses aplats se confondraient avec la base du solide — mais reste
 * dans la liste, prête à servir encore : une même esquisse peut donner
 * plusieurs solides.
 *
 * Balayage et lissage consomment plusieurs esquisses d'un coup : idEsquisse
 * est alors une liste, et toutes sont masquées.
 */

import { insererNoeud, supprimerNoeud, trouverNoeud, remplacerNoeud } from "../document.js";
import { avecChamps } from "../noeud.js";
import { fournitUnProfil } from "../registre_types_de_noeuds.js";
import { solideDepuisEsquisse, solideDepuisEsquisses } from "../esquisse/solides_d_esquisse.js";

function avecVisibilite(document, id, visible) {
  const noeud = trouverNoeud(document, id);
  return noeud === null || noeud.visible === visible ? document : remplacerNoeud(document, id, avecChamps(noeud, { visible }));
}

export const commandeConsommerEsquisse = {
  type: "consommer_esquisse",

  creer(document, idEsquisse, nomDuType) {
    const ids = Array.isArray(idEsquisse) ? idEsquisse : [idEsquisse];
    const esquisses = ids.map((id) => trouverNoeud(document, id));
    if (esquisses.some((e) => e === null || !fournitUnProfil(e.type))) {
      throw new Error("Cette esquisse n'existe plus.");
    }
    return {
      type: "consommer_esquisse",
      idRacine: document.racine.id,
      idsEsquisses: ids,
      visiblesAvant: esquisses.map((e) => e.visible),
      solide: Array.isArray(idEsquisse) ? solideDepuisEsquisses(nomDuType, esquisses) : solideDepuisEsquisse(nomDuType, esquisses[0]),
    };
  },

  appliquer(document, commande) {
    let resultat = insererNoeud(document, commande.idRacine, commande.solide);
    for (const id of commande.idsEsquisses) resultat = avecVisibilite(resultat, id, false);
    return resultat;
  },

  annuler(document, commande) {
    let resultat = supprimerNoeud(document, commande.solide.id);
    commande.idsEsquisses.forEach((id, i) => {
      resultat = avecVisibilite(resultat, id, commande.visiblesAvant[i]);
    });
    return resultat;
  },

  identifiantsCrees: (commande) => [commande.solide.id],
  identifiantsRestaures: (commande) => commande.idsEsquisses,
};
