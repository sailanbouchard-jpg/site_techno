/*
 * geometrie/ouvrier_geometrie.js
 * ──────────────────────────────
 * Tourne dans un Web Worker. Il ne fait que recevoir des requêtes et rendre
 * des réponses : démarrer Manifold, lire les fichiers importés, construire des
 * maillages. La géométrie proprement dite est dans construction_du_solide.js,
 * qui tourne aussi sous Node.
 *
 * Il n'importe ni three.js ni le DOM, et il n'a aucune notion de sélection, de
 * couleur ou de caméra : on lui donne une forme à faire, il la fait.
 */

import chargerManifold from "../vendor/manifold-3.5.3/manifold.js";
import { preparerAtelier, construireMaillage } from "./construction_du_solide.js";
import { lireStl } from "./lecture_stl.js";
import { cleDeFichier } from "./cle_de_fichier.js";
import { lirePolice } from "./lecture_police.js";
import { contoursDuTexte } from "./texte_en_contours.js";
import {
  REQUETE, reponseResultat, reponseErreur, reponseFichierCharge, messagePret, transferablesDeReponse,
} from "./protocole_ouvrier.js";

let atelier = null;
const requetesAbandonnees = new Set();

// Les fichiers importés, lus une fois pour toute la séance : clé → maillage.
const fichiers = new Map();
const polices = new Map();   // clé → { police, nom }
const ressources = {
  maillageImporte: (cle) => fichiers.get(cle) ?? null,
  texte(cle, texte, taille) {
    const chargee = polices.get(cle);
    if (chargee === undefined) throw new Error("la police n'est pas encore chargée : réessayer dans un instant.");
    return contoursDuTexte(chargee.police, texte, taille, chargee.nom);
  },
};

/* L'ouvrier a son propre chronomètre de ressources : le .wasm du moteur, qui
   est le plus gros fichier du logiciel, n'apparaît nulle part dans celui du fil
   principal. La page de mesures V0 en a besoin. */
function ressourcesChargees() {
  return performance.getEntriesByType("resource").map((entree) => ({
    nom: entree.name,
    reseau: entree.encodedBodySize,
    decompresse: entree.decodedBodySize,
    depuisLeCache: entree.transferSize === 0 || entree.encodedBodySize === 0,
  }));
}

function traiterConstruire(id, noeud) {
  try {
    const { maillage, dureeMs } = construireMaillage(atelier, noeud, ressources, () => performance.now());
    const reponse = reponseResultat(id, maillage, { dureeMs });
    postMessage(reponse, transferablesDeReponse(reponse));
  } catch (erreur) {
    postMessage(reponseErreur(id, "Le calcul de la forme a échoué : " + erreur.message));
  }
}

function traiterChargerFichier(id, octets) {
  try {
    const cle = cleDeFichier(octets);
    if (!fichiers.has(cle)) {
      const lu = lireStl(octets);
      fichiers.set(cle, { positions: lu.positions, indices: lu.indices, triangles: lu.triangles, boite: lu.boite });
    }
    const { triangles, boite } = fichiers.get(cle);
    postMessage(reponseFichierCharge(id, { cle, triangles, boite }));
  } catch (erreur) {
    postMessage(reponseErreur(id, "Import impossible : " + erreur.message));
  }
}

async function traiterChargerPolice(id, cle, adresse) {
  try {
    if (!polices.has(cle)) {
      const reponse = await fetch(adresse);
      if (!reponse.ok) throw new Error("fichier introuvable (" + reponse.status + ")");
      polices.set(cle, { police: lirePolice(await reponse.arrayBuffer()), nom: adresse.split("/").pop() });
    }
    postMessage(reponseFichierCharge(id, { cle }));
  } catch (erreur) {
    postMessage(reponseErreur(id, "La police n'a pas pu être chargée : " + erreur.message));
  }
}

self.onmessage = (evenement) => {
  const message = evenement.data;

  if (message.type === REQUETE.ANNULER) {
    requetesAbandonnees.add(message.id);
    return;
  }

  if (message.type === REQUETE.CHARGER_FICHIER) {
    traiterChargerFichier(message.id, message.octets);
    return;
  }

  if (message.type === REQUETE.CHARGER_POLICE) {
    traiterChargerPolice(message.id, message.cle, message.adresse);
    return;
  }

  if (message.type === REQUETE.CONSTRUIRE) {
    // La requête a pu être abandonnée pendant qu'elle attendait son tour.
    if (requetesAbandonnees.delete(message.id)) return;
    if (atelier === null) {
      postMessage(reponseErreur(message.id, "Le moteur de géométrie n'est pas encore prêt."));
      return;
    }
    traiterConstruire(message.id, message.charge);
  }
};

// ── Démarrage ───────────────────────────────────────────────────────────────

const debutChargement = performance.now();
chargerManifold()
  .then((wasm) => {
    wasm.setup();
    atelier = preparerAtelier(wasm);
    postMessage(messagePret({
      dureeChargementMs: performance.now() - debutChargement,
      ressources: ressourcesChargees(),
    }));
  })
  .catch((erreur) => {
    postMessage(reponseErreur(
      null,
      "Le moteur de géométrie n'a pas pu démarrer (" + erreur.message +
      "). Recharger la page ; si le problème persiste, prévenir le professeur."
    ));
  });
