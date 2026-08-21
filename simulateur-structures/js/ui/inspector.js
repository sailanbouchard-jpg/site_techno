// ui/inspector.js
// ────────────────
// Panneau latéral : propriétés de l'élément sélectionné (poutre, point/joint,
// poids, véhicule). Lit la sélection dans state.js, affiche les champs, et
// répercute toute modification sur le modèle. Champs en lecture seule hors
// du mode édition.

import { state, MODES, clearSelection, captureUndoBeforeDelete, deleteMultiSelection } from "../state.js";
import { findNodeById, findBeamById, findSegmentById, findLoadByJointId, removeLoad, removeMobileLoad, removeBeam, removeJoint, invalidateIndex } from "../model/Structure.js";
import { getMaterialById, getBeamTypeById, BEAM_TYPES } from "../model/materials.js";
import { computeAxialStiffness } from "../model/Beam.js";
import { computeNodeEffectiveMass, computeBeamMass } from "../physics/mass.js";
import { beamUtilization } from "../physics/rupture.js";
import { populateBeamTypeSelect } from "./beamTypeSelect.js";
import { formatForce, formatMass, formatKilograms, formatYoungModulus, formatStress, formatElongationPercent, msToKmh, kmhToMs } from "../units.js";

// Référence vers le champ "Allongement" affiché pour la poutre sélectionnée, mis
// à jour EN DIRECT (chaque image) par updateLiveInspector pendant la simulation.
let liveElongationEl = null;
let liveBeamId = null;

export function renderInspector() {
  const panel = document.getElementById("inspector-panel");
  if (!panel) return;
  panel.innerHTML = "";
  panel.hidden = false; // remasqué plus bas si rien n'est sélectionné
  liveElongationEl = null; // (ré)attaché par renderBeam si une poutre est affichée en simulation
  liveBeamId = null;
  const editable = state.mode === MODES.EDIT;

  // Sélection MULTIPLE (rectangle élastique) : panneau dédié, avant les cas simples.
  if (state.multiSelection.length > 0) return renderMultiSelection(panel, editable);

  if (state.selection.type === "beam") {
    const beam = findBeamById(state.structure, state.selection.id);
    if (beam) return renderBeam(panel, beam, editable);
  } else if (state.selection.type === "node") {
    const node = findNodeById(state.structure, state.selection.id);
    if (node) return renderJoint(panel, node, editable);
  } else if (state.selection.type === "load") {
    const load = state.structure.loads.find((l) => l.id === state.selection.id);
    if (load) return renderLoad(panel, load, editable);
  } else if (state.selection.type === "vehicle") {
    const v = state.structure.mobileLoads.find((x) => x.id === state.selection.id);
    if (v) return renderVehicle(panel, v, editable);
  }
  // Rien de sélectionné : le panneau disparaît, le canvas reste dégagé.
  panel.hidden = true;
}

// Met à jour EN DIRECT (appelé à chaque image par la boucle d'animation) le seul
// champ qui change tout seul : l'allongement de la poutre sélectionnée. On ne
// re-rend PAS tout le panneau (cela casserait la saisie des champs).
export function updateLiveInspector() {
  if (!liveElongationEl || liveBeamId === null) return;
  const beam = findBeamById(state.structure, liveBeamId);
  if (!beam) { liveElongationEl = null; liveBeamId = null; return; }
  liveElongationEl.textContent = formatElongationPercent(beamElongationPercent(beam));
}

// Allongement RELATIF de la poutre (%) : somme des longueurs actuelles des
// segments vs leurs longueurs de repos EFFECTIVES (tension de base comprise pour
// un câble). + = traction (allongée), − = compression (raccourcie). La flexion
// (rotation aux nœuds) ne change pas les longueurs : c'est donc bien l'axial.
function beamElongationPercent(beam) {
  let cur = 0;
  let rest = 0;
  const p = beam.isCable ? beam.pretension || 0 : 0;
  for (const segId of beam.segIds) {
    const seg = findSegmentById(state.structure, segId);
    if (!seg) continue;
    const a = findNodeById(state.structure, seg.nodeAId);
    const b = findNodeById(state.structure, seg.nodeBId);
    if (!a || !b) continue;
    cur += Math.hypot(b.x - a.x, b.y - a.y);
    rest += seg.restLength * (1 - p / 100);
  }
  return rest > 0 ? ((cur - rest) / rest) * 100 : 0;
}

// ── Sélection MULTIPLE (rectangle élastique) ─────────────────────────────────
// Récapitulatif par type + suppression groupée (annulable en UN Ctrl+Z : un
// seul instantané est pris pour tout le lot — voir state.js).
function renderMultiSelection(panel, editable) {
  title(panel, "Sélection multiple");
  const counts = { beam: 0, load: 0, vehicle: 0 };
  for (const it of state.multiSelection) if (counts[it.type] !== undefined) counts[it.type] += 1;
  readonly(panel, "Éléments", String(state.multiSelection.length));
  if (counts.beam) readonly(panel, "Poutres", String(counts.beam));
  if (counts.load) readonly(panel, "Poids", String(counts.load));
  if (counts.vehicle) readonly(panel, "Véhicules", String(counts.vehicle));

  if (editable) {
    button(panel, `Tout supprimer (${state.multiSelection.length})`, () => {
      deleteMultiSelection();
      renderInspector();
    });
    readonly(panel, "Astuce", "Suppr : tout supprimer · Ctrl+Z : annuler");
  }
}

function renderBeam(panel, beam, editable) {
  title(panel, "Poutre");
  const material = getMaterialById(beam.materialId);
  if (material) swatchRow(panel, material);

  // Type (matériau + section) : changer recalcule la raideur de tous les segments.
  const wrap = document.createElement("label");
  wrap.className = "inspector-field";
  wrap.textContent = "Type de poutre";
  const select = document.createElement("select");
  populateBeamTypeSelect(select);
  select.disabled = !editable;
  const current = BEAM_TYPES.find((t) => t.materialId === beam.materialId && t.thickness === beam.sectionArea);
  if (current) select.value = current.id;
  select.addEventListener("change", () => {
    const bt = getBeamTypeById(select.value);
    beam.materialId = bt.materialId;
    beam.sectionArea = bt.thickness;
    // Les drapeaux suivent STRICTEMENT le type : seule une ROUTE porte les
    // véhicules, seul un CÂBLE travaille en traction seule.
    beam.isCable = !!bt.cable;
    beam.isRoad = !!bt.road;
    for (const segId of beam.segIds) {
      const seg = state.structure.segments.find((s) => s.id === segId);
      if (seg) seg.stiffness = computeAxialStiffness(beam.materialId, beam.sectionArea, seg.restLength);
    }
    // Matériau/section changés → masses, raideurs de flexion et poids total en
    // cache ne sont plus valables.
    invalidateIndex(state.structure);
    renderInspector();
  });
  wrap.appendChild(select);
  panel.appendChild(wrap);

  readonly(panel, "Poids", formatKilograms(computeBeamMass(state.structure, beam)));
  if (material) {
    readonly(panel, "Module de Young", formatYoungModulus(material.youngModulus));
    readonly(panel, "Résistance traction", formatStress(material.tensileStrength));
    if (!beam.isCable) readonly(panel, "Résistance compression", formatStress(material.compressiveStrength));
  }
  // Comportement spécial du matériau (lecture seule — c'est le type qui décide).
  if (beam.isCable) readonly(panel, "Comportement", "câble (traction seule)");
  else if (beam.isRoad) readonly(panel, "Comportement", "route (charges mobiles)");

  // Tension de base d'un CÂBLE (%) : > 0 = tendu au lancement, < 0 = mou.
  if (beam.isCable) {
    numberField(panel, "Tension initiale (%)", beam.pretension || 0, editable, (v) => {
      beam.pretension = Math.max(-50, Math.min(10, v));
    });
  }

  // Aucune CONTRAINTE affichée en édition : taux de travail, état rompu et
  // ALLONGEMENT (en direct) n'apparaissent qu'en simulation. En édition,
  // l'utilisateur n'a pas d'info de charge — il la découvre au lancement du test.
  if (!editable) {
    liveBeamId = beam.id;
    liveElongationEl = readonlyLive(panel, "Allongement", formatElongationPercent(beamElongationPercent(beam)));
    readonly(panel, "Taux de travail max", `${Math.round(beamUtilization(state.structure, beam) * 100)} %`);
    if (beam.broken) readonly(panel, "État", "rompue");
  }

  if (editable) {
    button(panel, "Supprimer la poutre", () => {
      captureUndoBeforeDelete();
      removeBeam(state.structure, beam.id);
      clearSelection();
      renderInspector();
    });
  }
}

function renderJoint(panel, node, editable) {
  title(panel, node.fixed ? "Point ancré (appui)" : "Point / assemblage");
  // L'ancrage est une propriété du POINT (posé avec l'outil Ancrer). Pour un
  // point ancré, on choisit ici le TYPE de liaison au sol : pivot (rotation
  // libre) ou encastrement (orientation tenue → moment transmis). Voir bending.js.
  if (node.fixed) {
    selectField(panel, "Liaison au sol", node.clamped ? "clamped" : "pivot",
      [{ value: "pivot", label: "Pivot (rotation libre)" }, { value: "clamped", label: "Encastrement" }],
      editable, (v) => { node.clamped = v === "clamped"; invalidateIndex(state.structure); renderInspector(); });
  } else {
    readonly(panel, "Appui ancré", "non");
  }
  readonly(panel, "Masse effective", formatMass(computeNodeEffectiveMass(state.structure, node)));

  const load = findLoadByJointId(state.structure, node.id);
  if (load) {
    numberField(panel, "Poids posé (kg)", load.mass, editable, (v) => { load.mass = v; invalidateIndex(state.structure); }, 1);
    checkbox(panel, "Posé dessus", load.placement === "above", editable, (c) => { load.placement = c ? "above" : "below"; });
    if (editable) button(panel, "Retirer le poids", () => { removeLoad(state.structure, load.id); renderInspector(); });
  }

  if (editable) {
    button(panel, "Supprimer le point", () => {
      captureUndoBeforeDelete();
      removeJoint(state.structure, node.id);
      clearSelection();
      renderInspector();
    });
  }
}

function renderLoad(panel, load, editable) {
  title(panel, "Poids");
  numberField(panel, "Masse (kg)", load.mass, editable, (v) => { load.mass = v; invalidateIndex(state.structure); }, 1);
  if (load.beamId != null) {
    // Poids posé sur une poutre : position réglable le long de la poutre (0 = au
    // point A, 100 = au point B).
    numberField(panel, "Position (%)", Math.round((load.fraction || 0) * 100), editable,
      (v) => { load.fraction = Math.max(0, Math.min(1, v / 100)); }, 0);
  }
  checkbox(panel, "Posé dessus", load.placement === "above", editable, (c) => { load.placement = c ? "above" : "below"; });
  if (editable) button(panel, "Supprimer", () => { removeLoad(state.structure, load.id); renderInspector(); });
}

function renderVehicle(panel, v, editable) {
  title(panel, v.presetId === "truck" ? "Camion" : "Voiture");
  numberField(panel, "Masse (kg)", v.mass, editable, (x) => { v.mass = x; }, 1);
  numberField(panel, "Puissance (ch)", v.powerHp, editable, (x) => { v.powerHp = x; }, 0);
  numberField(panel, "Vitesse (km/h)", Math.round(msToKmh(v.referenceSpeed)), editable, (x) => { v.referenceSpeed = kmhToMs(x); }, 1);
  if (editable) button(panel, "Supprimer", () => { removeMobileLoad(state.structure, v.id); renderInspector(); });
}

// ── Petits constructeurs de champs ──
function title(panel, text) {
  const h = document.createElement("h3");
  h.textContent = text;
  panel.appendChild(h);
}
function readonly(panel, label, value) {
  const w = document.createElement("div");
  w.className = "inspector-field";
  const a = document.createElement("span"); a.textContent = label;
  const b = document.createElement("span"); b.className = "inspector-readonly-value"; b.textContent = value;
  w.append(a, b); panel.appendChild(w);
}
// Variante qui RENVOIE le span de valeur, pour le mettre à jour en direct.
function readonlyLive(panel, label, value) {
  const w = document.createElement("div");
  w.className = "inspector-field";
  const a = document.createElement("span"); a.textContent = label;
  const b = document.createElement("span"); b.className = "inspector-readonly-value"; b.textContent = value;
  w.append(a, b); panel.appendChild(w);
  return b;
}
// Ligne « Matériau » avec une pastille de couleur (même code couleur que la
// palette et que la poutre dessinée).
function swatchRow(panel, material) {
  const w = document.createElement("div");
  w.className = "inspector-field";
  const a = document.createElement("span"); a.textContent = "Matériau";
  const val = document.createElement("span");
  val.className = "inspector-swatch-value";
  const dot = document.createElement("span");
  dot.className = "mat-swatch";
  dot.style.background = material.color;
  dot.style.borderColor = material.colorEdge;
  const name = document.createElement("span"); name.textContent = material.name;
  val.append(dot, name);
  w.append(a, val); panel.appendChild(w);
}
// Liste déroulante (label + <select>) : options = [{ value, label }].
function selectField(panel, label, value, options, editable, onChange) {
  const w = document.createElement("label");
  w.className = "inspector-field";
  w.textContent = label;
  const select = document.createElement("select");
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
  select.value = value;
  select.disabled = !editable;
  select.addEventListener("change", () => onChange(select.value));
  w.appendChild(select);
  panel.appendChild(w);
}
function checkbox(panel, label, checked, editable, onChange) {
  const w = document.createElement("label");
  w.className = "inspector-field";
  const input = document.createElement("input");
  input.type = "checkbox"; input.checked = checked; input.disabled = !editable;
  input.addEventListener("change", () => onChange(input.checked));
  w.append(document.createTextNode(label), input); panel.appendChild(w);
}
function numberField(panel, label, value, editable, onChange, min) {
  const w = document.createElement("label");
  w.className = "inspector-field"; w.textContent = label;
  const input = document.createElement("input");
  input.type = "number"; input.step = "any"; input.value = value; input.disabled = !editable;
  if (min !== undefined) input.min = String(min);
  input.addEventListener("input", () => {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) return;
    if (min !== undefined) v = Math.max(min, v);
    onChange(v);
  });
  w.appendChild(input); panel.appendChild(w);
}
function button(panel, label, onClick) {
  const b = document.createElement("button");
  b.className = "inspector-button"; b.textContent = label;
  b.addEventListener("click", onClick);
  panel.appendChild(b);
}
