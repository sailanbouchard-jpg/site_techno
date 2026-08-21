// ui/testCasePanel.js
// ────────────────────
// Barre latérale : démonstrations prêtes à charger + structures sauvegardées par
// l'utilisateur (persistées CÔTÉ SERVEUR, voir model/savedStructures.js).
// Charger remplace la structure courante et repasse en édition (comme
// « Réinitialiser »). « Sauvegarder » enregistre l'état courant sur le serveur.
// Aucune formule physique, aucune persistance directe ici (déléguée à
// model/savedStructures.js).

import { state, loadStructure } from "../state.js";
import { buildDemos } from "../model/demos.js";
import {
  listSavedStructures,
  getSavedStructure,
  saveStructure,
  deleteSavedStructure,
} from "../model/savedStructures.js";
import { refreshAfterModeChange } from "./toolbar.js";

let savedListRef = null;

export function initTestCasePanel() {
  const panel = document.getElementById("test-case-panel");
  if (!panel) return;

  const title = document.createElement("h3");
  title.textContent = "Démonstrations";
  panel.appendChild(title);

  for (const demo of buildDemos()) {
    const button = document.createElement("button");
    button.className = "test-case-button";
    button.textContent = demo.label;
    button.addEventListener("click", () => { loadStructure(demo.structure); refreshAfterModeChange(); });
    panel.appendChild(button);
  }

  const sep = document.createElement("div");
  sep.className = "test-case-separator";
  panel.appendChild(sep);

  const savedTitle = document.createElement("h3");
  savedTitle.textContent = "Mes structures";
  panel.appendChild(savedTitle);

  const saveButton = document.createElement("button");
  saveButton.className = "test-case-save-button";
  saveButton.textContent = "Sauvegarder";
  saveButton.addEventListener("click", handleSave);
  panel.appendChild(saveButton);

  savedListRef = document.createElement("div");
  savedListRef.className = "saved-structure-list";
  panel.appendChild(savedListRef);
  renderSavedList();
}

async function handleSave() {
  const label = window.prompt("Nom de la sauvegarde :", "Ma structure");
  if (!label) return;
  const saved = await saveStructure(label, state.structure);
  if (!saved) {
    window.alert("Sauvegarde impossible : connecte-toi pour enregistrer tes structures.");
    return;
  }
  renderSavedList();
}

async function renderSavedList() {
  savedListRef.innerHTML = "";
  const saved = await listSavedStructures();

  // null = élève non connecté : on invite à se connecter (≠ liste vide).
  if (saved === null) {
    const hint = document.createElement("p");
    hint.className = "saved-structure-hint";
    hint.textContent = "Connecte-toi pour sauvegarder tes structures.";
    savedListRef.appendChild(hint);
    return;
  }

  for (const entry of saved) {
    const row = document.createElement("div");
    row.className = "test-case-row";

    const load = document.createElement("button");
    load.className = "test-case-button";
    load.textContent = entry.label;
    load.addEventListener("click", async () => {
      const structure = await getSavedStructure(entry.id);
      if (structure) { loadStructure(structure); refreshAfterModeChange(); }
    });
    row.appendChild(load);

    const del = document.createElement("button");
    del.className = "test-case-delete-button";
    del.textContent = "✕";
    del.title = "Supprimer cette sauvegarde";
    del.addEventListener("click", async () => { await deleteSavedStructure(entry.id); renderSavedList(); });
    row.appendChild(del);

    savedListRef.appendChild(row);
  }
}
