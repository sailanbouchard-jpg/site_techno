/*
 * stockage/stockage_bibliotheque.js
 * ─────────────────────────────────
 * La bibliothèque d'objets paramétriques vit DANS le logiciel : un fichier
 * JSON par modèle dans atelier-3d/bibliotheque/, et un index. On la lit comme
 * n'importe quel fichier du logiciel (elle marche donc hors connexion) ; on
 * n'y écrit que par le site, avec la session administrateur.
 *
 * Fichier d'un modèle : { format, id, nom, description, modifie_le, document }
 * Index : [{ id, nom, description, modifie_le }]
 */

import { requete, requeteJson, corpsJson } from "./requetes.js";

const DOSSIER = "bibliotheque/";
const URL_INDEX = DOSSIER + "index.json";
const URL_API = "/api/cao/bibliotheque/";
const URL_ADMIN = "/api/admin/me";
export const FORMAT_MODELE = "cao-college-modele";

// Toujours relire : un modèle mis à jour doit l'être au prochain chargement de page.
const FRAIS = { cache: "no-store" };

export function creerStockageBibliotheque() {
  return {
    /* Tous les modèles, documents compris (sous leur forme brute). Un modèle
       illisible est écarté sans empêcher les autres de se charger. */
    async toutCharger() {
      let index;
      try {
        index = await requeteJson(URL_INDEX, FRAIS);
      } catch (_erreur) {
        return { modeles: [], illisibles: [] };
      }
      const lus = await Promise.all((Array.isArray(index) ? index : []).map(async (entree) => {
        try {
          const fichier = await requeteJson(DOSSIER + encodeURIComponent(entree.id) + ".json", FRAIS);
          return fichier.format === FORMAT_MODELE ? fichier : null;
        } catch (_erreur) {
          return null;
        }
      }));
      return {
        modeles: lus.filter((m) => m !== null),
        illisibles: index.filter((_e, i) => lus[i] === null).map((e) => e.nom ?? e.id),
      };
    },

    /* Seul l'administrateur du site écrit dans la bibliothèque : elle est commune à tous. */
    async peutEcrire() {
      try {
        const reponse = await fetch(URL_ADMIN, { credentials: "same-origin" });
        return reponse.ok && (await reponse.json()).admin === true;
      } catch (_erreur) {
        return false;
      }
    },

    async enregistrer(id, nom, description, document) {
      return requeteJson(URL_API + encodeURIComponent(id), corpsJson("PUT", { nom, description, document }));
    },

    async supprimer(id) {
      await requete(URL_API + encodeURIComponent(id), { method: "DELETE" });
    },
  };
}
