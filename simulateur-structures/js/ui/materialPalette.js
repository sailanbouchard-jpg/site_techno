// ui/materialPalette.js
// ─────────────────────
// La barre des ÉLÉMENTS : un bouton par type de poutre (matériau × épaisseur),
// avec une vignette dessinée par le code même de la scène (memberRenderer.js) —
// on voit la vraie poutre, sa matière et son épaisseur relative. Cliquer choisit
// le type ET active la pose : pas de bouton « Poutre » séparé.
//
// À droite de la barre, les caractéristiques du type choisi : épaisseur, masse
// par mètre, longueur maximale d'un élément.
//
// Ne contient ni physique : ne fait que piloter state.js.

import { BEAM_TYPES, getMaterialById, getBeamTypeById } from "../model/materials.js";
import { state, setTool, TOOLS, MODES, typePoutreAutorise } from "../state.js";
import { drawMember, drawnWidth, edgeWidth } from "../render/memberRenderer.js";
import { formatInteger } from "../units.js";

let buttons = [];

export function initMaterialPalette(container, { onChange } = {}) {
  container.innerHTML = "";
  buttons = [];
  for (const beamType of BEAM_TYPES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "element";
    button.dataset.beamtype = beamType.id;
    button.title = `${beamType.label} : épaisseur ${thicknessMm(beamType)} mm, éléments de ${beamType.maxLength} m au plus`;

    const vignette = document.createElement("canvas");
    vignette.className = "element-vignette";
    const libelle = document.createElement("span");
    libelle.textContent = beamType.label;
    button.append(vignette, libelle);

    button.addEventListener("click", () => {
      if (button.disabled) return;
      state.currentBeamTypeId = beamType.id;
      setTool(TOOLS.ADD_BEAM);
      refreshMaterialPalette();
      if (onChange) onChange();
    });
    container.appendChild(button);
    buttons.push({ button, vignette, beamType });
  }
  // Vignettes dessinées dès que leur taille est connue, et redessinées si elle
  // change (zoom du navigateur, densité d'écran).
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const item = buttons.find((b) => b.vignette === entry.target);
      if (item) drawVignette(item.vignette, item.beamType);
    }
  });
  for (const b of buttons) {
    drawVignette(b.vignette, b.beamType);
    observer.observe(b.vignette);
  }
  refreshMaterialPalette();
}

function thicknessMm(beamType) {
  return Math.round(beamType.thickness * 1000);
}

// La poutre du type, couchée à l'horizontale, réduite si elle est plus épaisse
// que la vignette (le béton large reste ainsi le plus épais de la barre).
function drawVignette(canvas, beamType) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  const member = { materialId: beamType.materialId, sectionArea: beamType.thickness, isCable: !!beamType.cable, id: beamType.id };
  const width = drawnWidth(member);
  const scale = Math.min(1, (h - 1) / (width + 2 * edgeWidth(width)));
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, (dpr * h) / 2);
  drawMember(ctx, [{ x: 1 / scale, y: 0 }, { x: (w - 1) / scale, y: 0 }], member);
}

// Met en évidence le bouton actif (seulement quand l'outil courant est bien la
// pose de poutre), cache les matériaux que le niveau interdit, et affiche les
// caractéristiques du type choisi.
export function refreshMaterialPalette() {
  let famille = null; // le trait de séparation va au premier VISIBLE de chaque famille
  for (const { button, beamType } of buttons) {
    button.hidden = !typePoutreAutorise(beamType.id);
    const active = state.currentTool === TOOLS.ADD_BEAM && state.currentBeamTypeId === beamType.id;
    button.classList.toggle("active", active);
    button.classList.toggle("element-famille", !button.hidden && beamType.materialId !== famille);
    if (!button.hidden) famille = beamType.materialId;
  }
  refreshCharacteristics();
}

function refreshCharacteristics() {
  const zone = document.getElementById("caracteristiques-poutre");
  const beamType = getBeamTypeById(state.currentBeamTypeId);
  const visible = state.mode === MODES.EDIT && state.currentTool === TOOLS.ADD_BEAM && beamType;
  const key = visible ? beamType.id : "";
  if (zone.dataset.type === key) return;
  zone.dataset.type = key;
  zone.innerHTML = "";
  if (!visible) return;
  const material = getMaterialById(beamType.materialId);
  const items = [
    ["Épaisseur", `${thicknessMm(beamType)} mm`],
    ["Masse", `${formatInteger(material.density * beamType.thickness)} kg/m`],
    ["Longueur max", `${beamType.maxLength} m`],
  ];
  for (const [label, value] of items) {
    const item = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = value;
    item.append(`${label} `, b);
    zone.appendChild(item);
  }
}

export function setMaterialPaletteEnabled(enabled) {
  for (const { button } of buttons) button.disabled = !enabled;
}
