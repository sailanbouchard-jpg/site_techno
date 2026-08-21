// model/savedStructures.js
// ─────────────────────────
// Sauvegarde / liste / suppression des structures construites par l'utilisateur,
// PERSISTÉES CÔTÉ SERVEUR (plus de localStorage). Le simulateur est servi par le
// serveur Flask du projet (server.py à la racine), donc ces requêtes partent sur
// la MÊME origine : le cookie de session élève est envoyé automatiquement et
// chaque élève ne voit que ses propres sauvegardes (routes /api/sim-structures).
//
// La SÉRIALISATION PROPRE est déléguée à model/Structure.js::exportStructure : on
// n'envoie jamais l'état déformé d'un test ni les caches internes (index, forces)
// — c'était la cause des sauvegardes « qui revenaient buggées ». Le rechargement
// d'une sauvegarde passe ensuite par state.js::loadStructure (qui recale les ids).
//
// Ne contient PAS : de formule physique, de dessin, de gestion d'événements DOM
// (-> ui/testCasePanel.js, qui appelle ces fonctions).

import { exportStructure } from "./Structure.js";

const API = "/api/sim-structures";

// Liste { id, label } des sauvegardes de l'élève connecté (sans le contenu).
// Renvoie null si l'élève n'est PAS connecté (401) — l'interface affiche alors
// une invite à se connecter, ce qui est différent d'une liste vide.
export async function listSavedStructures() {
  let res;
  try {
    res = await fetch(API, { headers: { Accept: "application/json" } });
  } catch {
    return []; // réseau indisponible : ne pas bloquer le reste de l'app
  }
  if (res.status === 401) return null;
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Charge UNE sauvegarde (structure complète prête à passer à loadStructure), ou
// null si introuvable / erreur.
export async function getSavedStructure(id) {
  let res;
  try {
    res = await fetch(`${API}/${id}`, { headers: { Accept: "application/json" } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json();
  return data.structure || null;
}

// Sauvegarde (ou ÉCRASE si même nom) l'état courant sous le nom `label`. Renvoie
// { id, label } en cas de succès, sinon null (ex. élève non connecté → 401).
export async function saveStructure(label, structure) {
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, structure: exportStructure(structure) }),
    });
  } catch {
    return null;
  }
  return res.ok ? res.json() : null;
}

export async function deleteSavedStructure(id) {
  try {
    await fetch(`${API}/${id}`, { method: "DELETE" });
  } catch {
    // Best effort : en cas d'échec réseau, la liste se resynchronisera au
    // prochain rendu (renderSavedList relit toujours le serveur).
  }
}
