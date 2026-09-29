/*
 * geometrie/cache_de_maillages.js
 * ───────────────────────────────
 * Le maillage est un cache, jamais une donnée. Ce fichier est la table
 * empreinte → maillage, et le seul endroit qui décide s'il faut recalculer.
 *
 * Le recalcul est paresseux : rien n'est construit tant que la vue ou l'export
 * ne réclame pas un maillage manquant. Et comme l'empreinte ignore la
 * transformation du nœud, déplacer un objet ne provoque aucun calcul.
 */

import { empreinteDeNoeud } from "../noyau/empreinte_de_noeud.js";

// Une centaine de maillages tient large pour une séance : au-delà, on jette les
// plus anciens plutôt que de laisser l'onglet gonfler jusqu'au ralentissement.
const TAILLE_MAXIMALE = 120;

export function creerCacheDeMaillages(ouvrier) {
  const maillages = new Map();        // empreinte → maillage ; Map = ordre d'insertion
  const enCours = new Map();          // empreinte → promesse partagée
  let calculs = 0;
  let dureeTotaleMs = 0;
  let dernierCalculMs = 0;

  function retenir(empreinte, maillage) {
    maillages.delete(empreinte);      // réinsérer remet l'entrée en fin de file
    maillages.set(empreinte, maillage);
    while (maillages.size > TAILLE_MAXIMALE) {
      maillages.delete(maillages.keys().next().value);
    }
  }

  return {
    /* Le maillage s'il est déjà là, null sinon. La vue s'en sert pour afficher
       tout de suite ce qu'elle peut, sans attendre. */
    maillageConnu(noeud) {
      return maillages.get(empreinteDeNoeud(noeud)) ?? null;
    },

    /* Réclame un maillage. Deux nœuds de même empreinte demandés en même temps
       ne déclenchent qu'un seul calcul : c'est le cas des répétitions. */
    async obtenirMaillage(noeud, noeudSerialise) {
      const empreinte = empreinteDeNoeud(noeud);

      const connu = maillages.get(empreinte);
      if (connu !== undefined) return connu;

      const dejaDemande = enCours.get(empreinte);
      if (dejaDemande !== undefined) return dejaDemande;

      const { promesse } = ouvrier.construire(noeudSerialise);
      const attente = promesse.then((resultat) => {
        retenir(empreinte, resultat.maillage);
        enCours.delete(empreinte);
        calculs += 1;
        dernierCalculMs = resultat.mesures.dureeMs;
        dureeTotaleMs += dernierCalculMs;
        return resultat.maillage;
      }).catch((erreur) => {
        enCours.delete(empreinte);
        throw erreur;
      });

      enCours.set(empreinte, attente);
      return attente;
    },

    calculEnCours(noeud) {
      return enCours.has(empreinteDeNoeud(noeud));
    },

    statistiques() {
      return {
        entrees: maillages.size,
        enCours: enCours.size,
        calculs,
        dureeTotaleMs,
        dernierCalculMs,
        dureeMoyenneMs: calculs === 0 ? 0 : dureeTotaleMs / calculs,
      };
    },

    vider() {
      maillages.clear();
    },
  };
}
