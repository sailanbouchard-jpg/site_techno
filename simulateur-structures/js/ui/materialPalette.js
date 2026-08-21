// ui/materialPalette.js
// ─────────────────────
// La PALETTE de matériaux (bas gauche de l'écran). Les types sont GROUPÉS par
// famille de matériau — les déclinaisons (fin / large) côte à côte, le nom de
// la famille dessous, un léger séparateur entre familles (style.css). Chaque
// bouton montre la BARRE du matériau : sa vraie couleur, sa hauteur figure
// l'épaisseur relative. Cliquer fait DEUX choses d'un coup : sélectionner ce
// type ET activer le placement de poutre — plus besoin d'un bouton « Poutre »
// séparé (si on a choisi un matériau, c'est qu'on veut évidemment construire).
//
// Ne contient ni physique ni dessin : ne fait que piloter state.js.

import { BEAM_TYPES, getMaterialById } from "../model/materials.js";
import { state, setTool, TOOLS } from "../state.js";

let chips = [];

export function initMaterialPalette(container, { onChange } = {}) {
  container.innerHTML = "";
  chips = [];

  // Groupes par matériau, dans l'ordre du catalogue (bois, acier, béton, ...).
  const groups = new Map();
  for (const beamType of BEAM_TYPES) {
    if (!groups.has(beamType.materialId)) groups.set(beamType.materialId, []);
    groups.get(beamType.materialId).push(beamType);
  }

  for (const [materialId, types] of groups) {
    const material = getMaterialById(materialId);

    const group = document.createElement("div");
    group.className = "mat-group";

    const row = document.createElement("div");
    row.className = "mat-row";
    for (const beamType of types) {
      row.appendChild(buildChip(beamType, material, onChange));
    }

    const label = document.createElement("span");
    label.className = "mat-group-label";
    label.textContent = material.name;

    group.append(row, label);
    container.appendChild(group);
  }

  refreshMaterialPalette();
}

// Hauteur (px) de la barre témoin : figure l'épaisseur RELATIVE du type, pas
// une échelle exacte (un béton large de 40 cm écraserait tout le reste).
function barHeightFor(beamType) {
  if (beamType.cable) return 3;
  if (beamType.road) return 8;
  return beamType.id.includes("large") ? 10 : 5;
}

// « Bois fin » → « fin » (le nom de la famille est déjà le libellé du groupe).
function variantLabel(beamType, material) {
  return beamType.label.replace(material.name, "").trim();
}

function buildChip(beamType, material, onChange) {
  const chip = document.createElement("button");
  chip.className = "mat-chip";
  chip.dataset.beamtype = beamType.id;
  const maxTxt = beamType.maxLength ? ` — éléments de ${beamType.maxLength} m max (cliquer plus loin en pose plusieurs à la suite)` : "";
  chip.title = `${beamType.label}${maxTxt}`;

  const bar = document.createElement("span");
  bar.className = "mat-bar";
  bar.style.height = `${barHeightFor(beamType)}px`;
  bar.style.background = `linear-gradient(180deg, ${material.colorHi}, ${material.color} 55%, ${material.colorEdge})`;

  const variant = document.createElement("span");
  variant.className = "mat-variant";
  variant.textContent = variantLabel(beamType, material) || " ";

  chip.append(bar, variant);
  chip.addEventListener("click", () => {
    if (chip.disabled) return;
    state.currentBeamTypeId = beamType.id;
    setTool(TOOLS.ADD_BEAM);
    refreshMaterialPalette();
    if (onChange) onChange();
  });
  chips.push(chip);
  return chip;
}

// Met en évidence la pastille active (uniquement quand l'outil courant est bien
// le placement de poutre — sinon aucune pastille n'est « active »).
export function refreshMaterialPalette() {
  for (const chip of chips) {
    const active = state.currentTool === TOOLS.ADD_BEAM && state.currentBeamTypeId === chip.dataset.beamtype;
    chip.classList.toggle("active", active);
  }
}

export function setMaterialPaletteEnabled(enabled) {
  for (const chip of chips) chip.disabled = !enabled;
}
