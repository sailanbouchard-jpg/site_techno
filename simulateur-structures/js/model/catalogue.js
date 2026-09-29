// model/catalogue.js
// ──────────────────
// D'où viennent les NIVEAUX, et qui a le droit de les changer.
//
// Le catalogue livré avec le code (levels.js::CATALOGUE_DEFAUT) n'est que les
// quatre catégories, VIDES : tous les niveaux se créent depuis l'interface et
// vivent côté serveur. Au démarrage, on demande au serveur le sien.
// Seul l'ADMINISTRATEUR (session admin du site, voir server.py) peut enregistrer
// un catalogue : c'est lui qui crée, modifie et supprime les niveaux depuis le
// dialogue « Niveaux ».
//
// Ne contient ni géométrie ni règle de jeu : juste le transport des fiches.

import { appliquerCatalogue, CATALOGUE_DEFAUT } from "./levels.js";

const API = "/api/sim-catalogue";
const API_ADMIN = "/api/admin/me";

let administrateur = false;

export function estAdmin() {
  return administrateur;
}

async function demanderAdmin() {
  try {
    const res = await fetch(API_ADMIN, { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const data = await res.json();
    return data.admin === true;
  } catch {
    return false; // pas de serveur : on joue, on n'administre pas
  }
}

// Charge le catalogue du serveur s'il y en a un, et détermine si l'utilisateur
// est administrateur. À appeler une fois au démarrage, avant de bâtir la liste.
export async function chargerCatalogue() {
  administrateur = await demanderAdmin();
  try {
    const res = await fetch(API, { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.catalogue)) appliquerCatalogue(data.catalogue);
  } catch {
    // Simulateur servi sans le serveur Flask : le catalogue par défaut fait foi.
  }
}

// Enregistre le catalogue sur le serveur. Renvoie un message d'erreur, ou null
// si tout s'est bien passé.
export async function enregistrerCatalogue(fiches) {
  let res;
  try {
    res = await fetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogue: fiches }),
    });
  } catch {
    return "Serveur injoignable : rien n'a été enregistré.";
  }
  if (res.status === 403) return "Session administrateur expirée : reconnecte-toi.";
  if (!res.ok) return "Le serveur a refusé l'enregistrement.";
  return null;
}

// Remet le catalogue livré avec le code (sans l'enregistrer pour autant).
export function revenirAuCatalogueDefaut() {
  appliquerCatalogue(CATALOGUE_DEFAUT);
}
