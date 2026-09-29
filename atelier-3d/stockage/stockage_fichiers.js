/*
 * stockage/stockage_fichiers.js
 * ─────────────────────────────
 * Les fichiers STL importés, rangés par clé de contenu. Sur le site quand
 * l'élève est connecté ; sinon dans IndexedDB, parce que localStorage plafonne
 * à quelques mégaoctets et qu'un boîtier de lampe les dépasse.
 */

import { requete } from "./requetes.js";

const URL_FICHIERS = "/api/cao/fichiers/";
const BASE_LOCALE = "atelier-3d";
const MAGASIN = "fichiers";

function stockageDuSite() {
  return {
    async deposer(cle, octets, nom) {
      // Même contenu, même clé : inutile de renvoyer un fichier déjà rangé.
      const existe = await fetch(URL_FICHIERS + cle, { method: "HEAD", credentials: "same-origin" });
      if (existe.ok) return;
      await requete(URL_FICHIERS + cle + "?nom=" + encodeURIComponent(nom), {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: octets,
      });
    },

    async lire(cle) {
      const reponse = await requete(URL_FICHIERS + cle);
      return reponse.arrayBuffer();
    },
  };
}

function ouvrirBase() {
  return new Promise((resoudre, rejeter) => {
    const demande = indexedDB.open(BASE_LOCALE, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN);
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error);
  });
}

function operation(base, mode, action) {
  return new Promise((resoudre, rejeter) => {
    const transaction = base.transaction(MAGASIN, mode);
    const demande = action(transaction.objectStore(MAGASIN));
    transaction.oncomplete = () => resoudre(demande.result);
    transaction.onerror = () => rejeter(transaction.error);
  });
}

/* Sans IndexedDB (certaines navigations privées), les fichiers restent en
   mémoire : l'import marche, mais ne survit pas à un rechargement. */
function stockageDuNavigateur() {
  const memoire = new Map();
  const base = typeof indexedDB === "undefined" ? Promise.reject(new Error("absent")) : ouvrirBase();
  base.catch(() => {});

  return {
    async deposer(cle, octets) {
      try {
        const ouverte = await base;
        await operation(ouverte, "readwrite", (magasin) => magasin.put(octets.slice(0), cle));
      } catch (_erreur) {
        memoire.set(cle, octets.slice(0));
      }
    },

    async lire(cle) {
      if (memoire.has(cle)) return memoire.get(cle).slice(0);
      let octets;
      try {
        octets = await operation(await base, "readonly", (magasin) => magasin.get(cle));
      } catch (_erreur) {
        octets = undefined;
      }
      if (octets === undefined) {
        throw new Error("Ce fichier importé n'est plus dans ce navigateur : réimporte-le.");
      }
      return octets;
    },
  };
}

export function creerStockageDeFichiers(eleve) {
  return eleve === null ? stockageDuNavigateur() : stockageDuSite();
}
