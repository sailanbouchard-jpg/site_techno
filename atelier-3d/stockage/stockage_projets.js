/*
 * stockage/stockage_projets.js
 * ────────────────────────────
 * Où vivent les projets : sur le site quand l'élève est connecté, dans le
 * navigateur sinon. Les deux présentent exactement les mêmes fonctions, pour
 * que le reste du logiciel n'ait jamais à savoir lequel il utilise.
 *
 * Les documents circulent ici sous leur forme brute (documentVersBrut) : ce
 * fichier ne connaît pas le noyau, il range du JSON.
 */

import { requete, requeteJson, corpsJson } from "./requetes.js";

const URL_PROJETS = "/api/cao/projets";
const CLE_INDEX_LOCAL = "atelier-3d:projets";
const PREFIXE_PROJET_LOCAL = "atelier-3d:projet:";

// ── Sur le site ─────────────────────────────────────────────────────────────

function stockageDuSite() {
  return {
    surLeSite: true,

    async lister() {
      const projets = await requeteJson(URL_PROJETS);
      return projets.map((projet) => ({ ...projet, id: String(projet.id) }));
    },

    async ouvrir(id) {
      const projet = await requeteJson(URL_PROJETS + "/" + encodeURIComponent(id));
      return { ...projet, id: String(projet.id) };
    },

    async creer(nom, document, vignette) {
      const reponse = await requeteJson(URL_PROJETS, corpsJson("POST", { nom, document, vignette }));
      return { id: String(reponse.id), modifie_le: reponse.modifie_le };
    },

    /* auFermer : l'onglet se ferme, la requête doit survivre à la page. Le
       navigateur limite alors le corps à 64 Ko : on n'envoie pas la vignette. */
    async enregistrer(id, nom, document, vignette, auFermer = false) {
      const corps = auFermer ? { nom, document } : { nom, document, vignette };
      const reponse = await requeteJson(URL_PROJETS + "/" + encodeURIComponent(id),
        corpsJson("PUT", corps, auFermer ? { keepalive: true } : {}));
      return { id: String(reponse.id), modifie_le: reponse.modifie_le };
    },

    async supprimer(id) {
      await requete(URL_PROJETS + "/" + encodeURIComponent(id), { method: "DELETE" });
    },
  };
}

// ── Dans le navigateur ──────────────────────────────────────────────────────

/* localStorage peut être absent ou plein (navigation privée, poste verrouillé) :
   chaque accès est protégé, et l'échec dit à l'élève ce qu'il risque. */
function lire(cle, defaut) {
  try {
    const texte = localStorage.getItem(cle);
    return texte === null ? defaut : JSON.parse(texte);
  } catch (_erreur) {
    return defaut;
  }
}

function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch (_erreur) {
    throw new Error("Le navigateur refuse d'enregistrer (mémoire pleine ou navigation privée). " +
      "Connecte-toi au site pour ne pas perdre ton travail.");
  }
}

function stockageDuNavigateur() {
  const index = () => lire(CLE_INDEX_LOCAL, []);

  return {
    surLeSite: false,

    async lister() {
      return [...index()].sort((a, b) => b.modifie_le.localeCompare(a.modifie_le));
    },

    async ouvrir(id) {
      const entree = index().find((projet) => projet.id === id);
      const document = lire(PREFIXE_PROJET_LOCAL + id, null);
      if (entree === undefined || document === null) {
        throw new Error("Ce projet n'existe plus dans ce navigateur.");
      }
      return { id, nom: entree.nom, modifie_le: entree.modifie_le, document };
    },

    async creer(nom, document, vignette) {
      const id = "local-" + Date.now().toString(36);
      const modifie_le = new Date().toISOString();
      ecrire(PREFIXE_PROJET_LOCAL + id, document);
      ecrire(CLE_INDEX_LOCAL, [...index(), { id, nom, modifie_le, vignette_png: vignette ?? null }]);
      return { id, modifie_le };
    },

    async enregistrer(id, nom, document, vignette) {
      const modifie_le = new Date().toISOString();
      ecrire(PREFIXE_PROJET_LOCAL + id, document);
      ecrire(CLE_INDEX_LOCAL, index().map((projet) => (projet.id !== id ? projet : {
        ...projet, nom, modifie_le, vignette_png: vignette ?? projet.vignette_png,
      })));
      return { id, modifie_le };
    },

    async supprimer(id) {
      try {
        localStorage.removeItem(PREFIXE_PROJET_LOCAL + id);
      } catch (_erreur) {
        // Rien à nettoyer si le stockage est inaccessible.
      }
      ecrire(CLE_INDEX_LOCAL, index().filter((projet) => projet.id !== id));
    },
  };
}

export function creerStockageDeProjets(eleve) {
  return eleve === null ? stockageDuNavigateur() : stockageDuSite();
}
