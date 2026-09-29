// ui/inspector.js
// ────────────────
// Fenêtre « Propriétés » (droite de la vue) : grille de propriétés de l'élément
// sélectionné — poutre, nœud, poids, véhicule ou sélection multiple. Lit la
// sélection dans state.js, affiche les champs et répercute toute modification
// sur le modèle. Champs en lecture seule hors conception.

import { state, estModifiable, MODES, clearSelection, captureUndo, deleteMultiSelection } from "../state.js";
import {
  findNodeById, findBeamById, findSegmentById, findLoadByJointId, removeLoad, removeMobileLoad,
  removeBeam, removeJoint, invalidateIndex,
} from "../model/Structure.js";
import { getMaterialById, getBeamTypeById, BEAM_TYPES } from "../model/materials.js";
import { TYPES_BATEAU, typeBateau, retirerBateau, bateauxDe, LARGEUR_BATEAU } from "../model/bateau.js";
import { puissanceNominale, masseAffichee, allegement } from "../model/vehiclePresets.js";
import { bumpTerrainVersion } from "../model/Structure.js";
import { computeAxialStiffness } from "../model/Beam.js";
import { computeNodeEffectiveMass, computeBeamMass } from "../physics/mass.js";
import { beamUtilization } from "../physics/rupture.js";
import { populateBeamTypeSelect } from "./beamTypeSelect.js";
import { categorie, ligne, remplirFenetre } from "./proprietes.js";
import { lookFor } from "../render/memberRenderer.js";
import {
  formatMass, formatKilograms, formatYoungModulus, formatStress, formatElongationPercent,
  formatPercent, formatDecimal, msToKmh, kmhToMs,
} from "../units.js";

const NOMS_VEHICULES = { car: "Voiture", van: "Camionnette", truck: "Camion" };

// Champ « Allongement » de la poutre sélectionnée, mis à jour EN DIRECT pendant
// l'essai par updateLiveInspector (sans reconstruire la fenêtre).
let liveElongationEl = null;
let liveBeamId = null;

export function renderInspector() {
  const panel = document.getElementById("inspector-panel");
  if (!panel) return;
  liveElongationEl = null;
  liveBeamId = null;
  const editable = state.mode === MODES.EDIT;

  if (state.multiSelection.length > 0) return show(panel, () => renderMultiSelection(panel, editable));
  const { type, id } = state.selection;
  if (type === "beam") {
    const beam = findBeamById(state.structure, id);
    if (beam) return show(panel, () => renderBeam(panel, beam, editable));
  } else if (type === "node") {
    const node = findNodeById(state.structure, id);
    if (node) return show(panel, () => renderJoint(panel, node, editable));
  } else if (type === "load") {
    const load = state.structure.loads.find((l) => l.id === id);
    if (load) return show(panel, () => renderLoad(panel, load, editable));
  } else if (type === "vehicle") {
    const v = state.structure.mobileLoads.find((x) => x.id === id);
    if (v) return show(panel, () => renderVehicle(panel, v, editable));
  } else if (type === "bateau") {
    const bateau = bateauxDe(state.structure).find((b) => b.id === id);
    if (bateau) return show(panel, () => renderBateau(panel, bateau, editable));
  }
  // Rien de sélectionné : la fenêtre disparaît, la vue reste dégagée.
  panel.hidden = true;
  panel.innerHTML = "";
}

function show(panel, render) {
  panel.hidden = false;
  render();
}

function open(panel, title) {
  return remplirFenetre(panel, title, () => { clearSelection(); renderInspector(); });
}

// Met à jour EN DIRECT (boucle d'affichage) le seul champ qui change tout seul :
// l'allongement de la poutre sélectionnée.
export function updateLiveInspector() {
  if (!liveElongationEl || liveBeamId === null) return;
  const beam = findBeamById(state.structure, liveBeamId);
  if (!beam) { liveElongationEl = null; liveBeamId = null; return; }
  liveElongationEl.textContent = formatElongationPercent(beamElongationPercent(beam));
}

// Allongement RELATIF de la poutre (%) : longueurs actuelles des segments vs
// longueurs de repos effectives (tension de base comprise pour un câble).
// + = traction (allongée), − = compression (raccourcie).
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

function beamLength(beam) {
  let total = 0;
  for (const segId of beam.segIds) {
    const seg = findSegmentById(state.structure, segId);
    if (seg) total += seg.restLength;
  }
  return total;
}

// ── Sélection multiple ───────────────────────────────────────────────────────
// Récapitulatif par type + suppression groupée, annulable en UN Ctrl+Z.
function renderMultiSelection(panel, editable) {
  const { grille, actions } = open(panel, "Sélection multiple");
  const counts = { beam: 0, load: 0, vehicle: 0 };
  for (const it of state.multiSelection) if (counts[it.type] !== undefined) counts[it.type] += 1;
  ligne(grille, "Éléments", String(state.multiSelection.length));
  if (counts.beam) ligne(grille, "Poutres", String(counts.beam));
  if (counts.load) ligne(grille, "Poids", String(counts.load));
  if (counts.vehicle) ligne(grille, "Véhicules", String(counts.vehicle));
  if (editable) {
    button(actions, `Supprimer (${state.multiSelection.length})`, () => {
      deleteMultiSelection();
      renderInspector();
    });
  }
}

// ── Poutre ───────────────────────────────────────────────────────────────────
function renderBeam(panel, beam, editable) {
  const { grille, actions } = open(panel, "Poutre");
  const material = getMaterialById(beam.materialId);

  categorie(grille, "Élément");
  if (material) ligne(grille, "Matériau", swatch(material));
  const select = document.createElement("select");
  const current = BEAM_TYPES.find((t) => t.materialId === beam.materialId && t.thickness === beam.sectionArea);
  populateBeamTypeSelect(select, current ? current.id : null);
  select.disabled = !modifiable(editable, { type: "beam", id: beam.id });
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
    // Matériau/section changés → masses, raideurs de flexion et poids en cache périmés.
    invalidateIndex(state.structure);
    renderInspector();
  });
  ligne(grille, "Type", select);
  ligne(grille, "Épaisseur", `${Math.round(beam.sectionArea * 1000)} mm`);
  ligne(grille, "Longueur", `${formatDecimal(beamLength(beam), 2)} m`);
  ligne(grille, "Masse", formatKilograms(computeBeamMass(state.structure, beam)));
  if (beam.isCable) ligne(grille, "Comportement", "Traction seule");
  else if (beam.isRoad) ligne(grille, "Comportement", "Porte les véhicules");

  if (material) {
    categorie(grille, "Matériau");
    ligne(grille, "Module d'Young", formatYoungModulus(material.youngModulus));
    ligne(grille, "Résistance en traction", formatStress(material.tensileStrength));
    if (!beam.isCable) ligne(grille, "Résistance en compression", formatStress(material.compressiveStrength));
  }

  // Tension de base d'un CÂBLE (%) : > 0 = tendu au lancement, < 0 = mou.
  if (beam.isCable) {
    categorie(grille, "Câble");
    numberField(grille, "Tension initiale (%)", beam.pretension || 0, editable, (v) => {
      beam.pretension = Math.max(-50, Math.min(10, v));
    });
  }

  // Aucune contrainte affichée en conception : allongement (en direct), taux
  // de travail et rupture n'apparaissent que pendant l'essai.
  if (!editable) {
    categorie(grille, "Essai");
    liveBeamId = beam.id;
    liveElongationEl = ligne(grille, "Allongement", formatElongationPercent(beamElongationPercent(beam)));
    ligne(grille, "Taux de travail max", formatPercent(beamUtilization(state.structure, beam)));
    if (beam.broken) ligne(grille, "État", "Rompue");
  }

  if (modifiable(editable, { type: "beam", id: beam.id })) {
    button(actions, "Supprimer la poutre", () => {
      captureUndo();
      removeBeam(state.structure, beam.id);
      clearSelection();
      renderInspector();
    });
  }
}

// ── Nœud ─────────────────────────────────────────────────────────────────────
function renderJoint(panel, node, editable) {
  const { grille, actions } = open(panel, node.fixed ? "Appui" : "Nœud");
  categorie(grille, "Liaison");
  // Pour un appui, le TYPE de liaison au sol : pivot (rotation libre) ou
  // encastrement (orientation tenue → moment transmis). Voir bending.js.
  if (node.fixed) {
    selectField(grille, "Liaison au sol", node.clamped ? "clamped" : "pivot",
      [{ value: "pivot", label: "Pivot (rotation libre)" }, { value: "clamped", label: "Encastrement" }],
      modifiable(editable, { type: "node", id: node.id }),
      (v) => { node.clamped = v === "clamped"; invalidateIndex(state.structure); renderInspector(); });
  } else {
    ligne(grille, "Appui", "Non");
  }
  ligne(grille, "Masse effective", formatMass(computeNodeEffectiveMass(state.structure, node)));

  const load = findLoadByJointId(state.structure, node.id);
  if (load) {
    categorie(grille, "Poids");
    numberField(grille, "Masse (kg)", load.mass, editable, (v) => { load.mass = v; invalidateIndex(state.structure); }, 1);
    checkbox(grille, "Posé dessus", load.placement === "above", editable, (c) => { load.placement = c ? "above" : "below"; });
    if (editable) button(actions, "Retirer le poids", () => { removeLoad(state.structure, load.id); renderInspector(); });
  }

  if (modifiable(editable, { type: "node", id: node.id })) {
    button(actions, "Supprimer le nœud", () => {
      captureUndo();
      removeJoint(state.structure, node.id);
      clearSelection();
      renderInspector();
    });
  }
}

// ── Poids (atelier) ──────────────────────────────────────────────────────────
function renderLoad(panel, load, editable) {
  editable = modifiable(editable, { type: "load", id: load.id });
  const { grille, actions } = open(panel, "Poids");
  numberField(grille, "Masse (kg)", load.mass, editable, (v) => { load.mass = v; invalidateIndex(state.structure); }, 1);
  if (load.beamId != null) {
    // Poids posé sur une poutre : 0 % = au nœud A, 100 % = au nœud B.
    numberField(grille, "Position (%)", Math.round((load.fraction || 0) * 100), editable,
      (v) => { load.fraction = Math.max(0, Math.min(1, v / 100)); }, 0);
  }
  checkbox(grille, "Posé dessus", load.placement === "above", editable, (c) => { load.placement = c ? "above" : "below"; });
  if (editable) button(actions, "Supprimer", () => { removeLoad(state.structure, load.id); renderInspector(); });
}

// ── Véhicule ─────────────────────────────────────────────────────────────────
// La PUISSANCE ne se saisit pas : elle découle de la masse et de la vitesse
// visée (voir model/vehiclePresets.js). La régler à la main donnait des
// véhicules qui n'atteignaient jamais leur vitesse annoncée.
function renderVehicle(panel, v, editable) {
  editable = modifiable(editable, { type: "vehicle", id: v.id });
  const { grille, actions } = open(panel, NOMS_VEHICULES[v.presetId] || "Véhicule");
  const motoriser = () => { v.powerHp = puissanceNominale(v.mass, v.referenceSpeed); renderInspector(); };
  // On règle la masse ANNONCÉE ; la charge réellement encaissée suit, allégée du
  // même rapport que le modèle d'origine (voir model/vehiclePresets.js).
  numberField(grille, "Masse (kg)", masseAffichee(v), editable, (x) => {
    v.masseAffichee = x;
    v.mass = Math.round(x * allegement(v.presetId));
    motoriser();
  }, 1);
  numberField(grille, "Vitesse (km/h)", Math.round(msToKmh(v.referenceSpeed)), editable,
    (x) => { v.referenceSpeed = kmhToMs(x); motoriser(); }, 1);
  ligne(grille, "Puissance", `${Math.round(v.powerHp)} ch`).title =
    "Déduite de la masse et de la vitesse : de quoi tenir cette vitesse sur le pont.";
  if (editable) button(actions, "Supprimer", () => { removeMobileLoad(state.structure, v.id); renderInspector(); });
}

// ── Bateau ───────────────────────────────────────────────────────────────────
// Le bateau n'est pas une pièce de structure : il ne pèse rien et ne bouge pas.
// Il matérialise le gabarit à laisser libre, d'où les deux seuls réglages qui
// comptent — où il est, et quelle hauteur il impose.
function renderBateau(panel, bateau, editable) {
  editable = modifiable(editable, { type: "bateau", id: bateau.id });
  const { grille, actions } = open(panel, "Bateau");
  const redessiner = () => { bumpTerrainVersion(state.structure); renderInspector(); };

  categorie(grille, "Gabarit");
  selectField(grille, "Modèle", bateau.type,
    TYPES_BATEAU.map((t) => ({ value: t.id, label: t.label })), editable,
    (id) => { bateau.type = id; redessiner(); });
  ligne(grille, "Tirant d'air", `${formatDecimal(typeBateau(bateau.type).hauteur, 1)} m`).title =
    "Hauteur au-dessus de l'eau : c'est ce qu'il faut dégager sous le pont.";
  ligne(grille, "Largeur", `${formatDecimal(LARGEUR_BATEAU, 1)} m`);

  categorie(grille, "Position");
  numberField(grille, "x (m)", bateau.x, editable, (x) => {
    bateau.x = Math.round(x * 2) / 2;
    bumpTerrainVersion(state.structure);
  }, 0);

  if (editable) {
    button(actions, "Supprimer", () => {
      captureUndo();
      retirerBateau(state.structure, bateau.id);
      bumpTerrainVersion(state.structure);
      clearSelection();
      renderInspector();
    });
  }
}

// Une pièce de l'ÉNONCÉ d'un niveau (route d'accès, appui, véhicule) se
// consulte mais ne se modifie pas. En mode dev, tout reste modifiable.
function modifiable(editable, item) {
  return editable && estModifiable(item);
}

// ── Champs ───────────────────────────────────────────────────────────────────

// Pastille de matériau (même couleur que la poutre dessinée) + nom.
function swatch(material) {
  const look = lookFor(material.id);
  const val = document.createElement("span");
  val.className = "pastille-valeur";
  const dot = document.createElement("span");
  dot.className = "mat-swatch";
  dot.style.background = look.body;
  dot.style.borderColor = look.edge;
  const name = document.createElement("span");
  name.textContent = material.name;
  val.append(dot, name);
  return val;
}

function selectField(grille, label, value, options, editable, onChange) {
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
  ligne(grille, label, select);
}

function checkbox(grille, label, checked, editable, onChange) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = !editable;
  input.addEventListener("change", () => onChange(input.checked));
  ligne(grille, label, input);
}

function numberField(grille, label, value, editable, onChange, min) {
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.value = value;
  input.disabled = !editable;
  if (min !== undefined) input.min = String(min);
  input.addEventListener("input", () => {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) return;
    if (min !== undefined) v = Math.max(min, v);
    onChange(v);
  });
  ligne(grille, label, input);
}

function button(actions, label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "bouton bouton-danger";
  b.textContent = label;
  b.addEventListener("click", onClick);
  actions.appendChild(b);
}
