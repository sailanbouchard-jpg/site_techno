/*
 * geometrie/client_ouvrier.js
 * ───────────────────────────
 * Côté fil principal : lance l'ouvrier, tient la table des requêtes en
 * attente, et rend une promesse par requête.
 */

import {
  requeteConstruire, requeteAnnuler, requeteChargerFichier, requeteChargerPolice, estMessagePret, REPONSE,
} from "./protocole_ouvrier.js";

const CHEMIN_OUVRIER = new URL("./ouvrier_geometrie.js", import.meta.url);

export function demarrerOuvrier() {
  const ouvrier = new Worker(CHEMIN_OUVRIER, { type: "module" });

  const enAttente = new Map();
  const fichiersCharges = new Set();
  let prochainIdentifiant = 0;
  let resoudrePret;
  let rejeterPret;
  const pret = new Promise((resoudre, rejette) => {
    resoudrePret = resoudre;
    rejeterPret = rejette;
  });

  function envoyer(fabriquer, transferables = []) {
    prochainIdentifiant += 1;
    const id = prochainIdentifiant;
    const promesse = new Promise((resoudre, rejette) => {
      enAttente.set(id, { resoudre, rejette });
    });
    ouvrier.postMessage(fabriquer(id), transferables);
    return { id, promesse };
  }

  ouvrier.onmessage = (evenement) => {
    const message = evenement.data;

    if (estMessagePret(message)) {
      resoudrePret(message);
      return;
    }

    // Une erreur sans identifiant vient du démarrage : personne n'attend de
    // maillage, mais tout le monde attend que l'ouvrier soit prêt.
    if (message.id === null || message.id === undefined) {
      rejeterPret(new Error(message.erreur));
      return;
    }

    const attente = enAttente.get(message.id);
    if (attente === undefined) return;   // requête abandonnée entre-temps
    enAttente.delete(message.id);

    if (message.type === REPONSE.RESULTAT) {
      attente.resoudre({ maillage: message.maillage, mesures: message.mesures });
    } else if (message.type === REPONSE.FICHIER) {
      fichiersCharges.add(message.cle);
      attente.resoudre({ cle: message.cle, triangles: message.triangles, boite: message.boite });
    } else {
      attente.rejette(new Error(message.erreur));
    }
  };

  // Une erreur de chargement du module ne passe pas par onmessage : sans ça,
  // l'interface attendrait un ouvrier qui ne viendra jamais, sans rien dire.
  ouvrier.onerror = (evenement) => {
    rejeterPret(new Error(evenement.message || "l'ouvrier de géométrie n'a pas pu être chargé"));
  };

  return {
    pret,

    construire(noeudSerialise) {
      return envoyer((id) => requeteConstruire(id, noeudSerialise));
    },

    /* Les octets sont transférés : ils ne sont plus lisibles ici ensuite. */
    chargerFichier(octets) {
      return envoyer((id) => requeteChargerFichier(id, octets), [octets]).promesse;
    },

    chargerPolice(cle, adresse) {
      return envoyer((id) => requeteChargerPolice(id, cle, adresse)).promesse;
    },

    fichierCharge(cle) {
      return fichiersCharges.has(cle);
    },

    abandonner(id) {
      if (!enAttente.delete(id)) return;
      ouvrier.postMessage(requeteAnnuler(id));
    },

    calculsEnCours() {
      return enAttente.size;
    },

    arreter() {
      ouvrier.terminate();
      enAttente.clear();
    },
  };
}
