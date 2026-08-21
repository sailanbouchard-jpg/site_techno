// ui/forceEditor.js
// ──────────────────
// Rôle : panneau "Éditeur de forces" — la bibliothèque de forces du projet.
// Permet de créer/régler/supprimer des forces sinusoïdales (F = A + B·sin(ωt+φ))
// et affiche un petit graphique F(t) par force. Expose aussi les deux sliders
// globaux qui règlent l'échelle d'affichage de TOUTES les flèches/graphiques
// du projet (norme des vecteurs, fenêtre de temps des graphiques).
//
// L'assignation d'une force à un nœud précis se fait depuis ui/inspector.js
// (liste à cocher), pas ici : ce panneau ne gère que la bibliothèque de
// forces elle-même, pas leur application.
//
// Désactivé (lecture seule) hors du mode édition, comme le reste de l'éditeur
// de structure : on ne crée/modifie/supprime jamais de force pendant que la
// simulation tourne (voir state.js MODES).
//
// Ne doit PAS contenir : de formule physique (le sinus reste dans
// model/Force.js ; ce fichier ne fait qu'échantillonner via
// render/forceGraphRenderer.js pour dessiner la courbe).
// Dépendances : state.js, model/Structure.js, render/forceGraphRenderer.js,
// render/styleConfig.js, ui/inspector.js (pour rafraîchir les cases à cocher
// quand la bibliothèque de forces change).

import { state, MODES } from "../state.js";
import { addForce, removeForce } from "../model/Structure.js";
import { drawForceGraph } from "../render/forceGraphRenderer.js";
import { renderInspector } from "./inspector.js";
import {
  FORCE_COLOR_PALETTE,
  FORCE_GRAPH_WIDTH,
  FORCE_GRAPH_HEIGHT,
  FORCE_VECTOR_SCALE_EXPONENT_MIN,
  FORCE_VECTOR_SCALE_EXPONENT_MAX,
  FORCE_GRAPH_TIME_WINDOW_EXPONENT_MIN,
  FORCE_GRAPH_TIME_WINDOW_EXPONENT_MAX,
} from "../render/styleConfig.js";

// Éléments stables, créés une seule fois par initForceEditor() et jamais
// recréés ensuite : un slider qu'on détruit et reconstruit à chaque "input"
// perdrait la prise de la souris en plein glissement (mauvaise UX). Seule la
// LISTE des forces (listContainerRef) est reconstruite à chaque changement.
let addButtonRef = null;
let listContainerRef = null;
// forceId -> élément <canvas> de son graphique, pour pouvoir le redessiner
// seul (sans reconstruire toute la ligne) quand un slider ou un paramètre change.
const forceCanvases = new Map();

export function initForceEditor() {
  const panel = document.getElementById("force-editor-panel");
  panel.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Éditeur de forces";
  panel.appendChild(title);

  panel.appendChild(buildSlidersSection());

  addButtonRef = document.createElement("button");
  addButtonRef.className = "force-add-button";
  addButtonRef.textContent = "+ Nouvelle force";
  addButtonRef.addEventListener("click", () => {
    const color = FORCE_COLOR_PALETTE[state.structure.forces.length % FORCE_COLOR_PALETTE.length];
    addForce(state.structure, { axis: "x", a: 0, b: 1000, period: 2, phase: 0, color });
    renderForceEditor();
    renderInspector();
  });
  panel.appendChild(addButtonRef);

  listContainerRef = document.createElement("div");
  listContainerRef.className = "force-list";
  panel.appendChild(listContainerRef);

  renderForceEditor();
}

// Reconstruit la liste des forces (et l'état activé/désactivé du bouton
// d'ajout) d'après l'état courant. Appelé après tout ajout/suppression de
// force, et après tout changement de mode édition/simulation.
export function renderForceEditor() {
  const editable = state.mode === MODES.EDIT;
  if (addButtonRef) addButtonRef.disabled = !editable;

  listContainerRef.innerHTML = "";
  forceCanvases.clear();

  if (state.structure.forces.length === 0) {
    const empty = document.createElement("p");
    empty.className = "force-list-empty";
    empty.textContent = "Aucune force définie.";
    listContainerRef.appendChild(empty);
    return;
  }

  for (const force of state.structure.forces) {
    listContainerRef.appendChild(buildForceRow(force, editable));
  }
}

function buildForceRow(force, editable) {
  const row = document.createElement("div");
  row.className = "force-row";

  const header = document.createElement("div");
  header.className = "force-row-header";

  const swatch = document.createElement("span");
  swatch.className = "force-color-swatch";
  swatch.style.backgroundColor = force.color;
  header.appendChild(swatch);

  const title = document.createElement("span");
  title.className = "force-row-title";
  title.textContent = force.id;
  header.appendChild(title);

  const deleteButton = document.createElement("button");
  deleteButton.className = "force-delete-button";
  deleteButton.textContent = "✕";
  deleteButton.disabled = !editable;
  deleteButton.addEventListener("click", () => {
    removeForce(state.structure, force.id);
    forceCanvases.delete(force.id);
    renderForceEditor();
    renderInspector();
  });
  header.appendChild(deleteButton);

  row.appendChild(header);

  const fields = document.createElement("div");
  fields.className = "force-row-fields";
  fields.appendChild(buildAxisField(force, editable));
  // A et B sont stockés en Newtons en interne (cohérent avec le reste du
  // moteur physique), mais affichés/saisis en kN : plus lisible, des forces
  // structurelles se comptant vite en milliers de newtons.
  fields.appendChild(
    buildForceNumberField("A — constante (kN)", force.a / 1000, editable, (kilonewtons) => {
      force.a = kilonewtons * 1000;
      redrawForceGraph(force);
    })
  );
  fields.appendChild(
    buildForceNumberField("B — amplitude (kN)", force.b / 1000, editable, (kilonewtons) => {
      force.b = kilonewtons * 1000;
      redrawForceGraph(force);
    })
  );
  fields.appendChild(
    buildForceNumberField("Période (s)", force.period, editable, (value) => {
      force.period = value;
      redrawForceGraph(force);
    }, { min: 0.01 })
  );
  fields.appendChild(
    buildForceNumberField("Phase (rad)", force.phase, editable, (value) => {
      force.phase = value;
      redrawForceGraph(force);
    })
  );
  row.appendChild(fields);

  const canvas = document.createElement("canvas");
  canvas.className = "force-graph";
  canvas.width = FORCE_GRAPH_WIDTH;
  canvas.height = FORCE_GRAPH_HEIGHT;
  row.appendChild(canvas);

  forceCanvases.set(force.id, canvas);
  drawForceGraph(canvas, force, state.forceVectorScale, state.forceGraphTimeWindow);

  return row;
}

function buildAxisField(force, editable) {
  const wrapper = document.createElement("label");
  wrapper.className = "force-field";
  wrapper.textContent = "Axe";

  const select = document.createElement("select");
  select.disabled = !editable;
  for (const axis of ["x", "y"]) {
    const option = document.createElement("option");
    option.value = axis;
    option.textContent = axis;
    select.appendChild(option);
  }
  select.value = force.axis;
  select.addEventListener("change", () => {
    // L'axe ne change pas la forme de F(t) : pas besoin de redessiner le
    // graphique. Mais l'inspecteur affiche l'axe dans le libellé de chaque
    // force assignée : il doit se rafraîchir.
    force.axis = select.value;
    renderInspector();
  });

  wrapper.appendChild(select);
  return wrapper;
}

function buildForceNumberField(label, value, editable, onChange, opts = {}) {
  const wrapper = document.createElement("label");
  wrapper.className = "force-field";
  wrapper.textContent = label;

  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  if (opts.min !== undefined) input.min = String(opts.min);
  input.value = value;
  input.disabled = !editable;
  input.addEventListener("input", () => {
    let parsed = parseFloat(input.value);
    if (Number.isNaN(parsed)) return;
    if (opts.min !== undefined) parsed = Math.max(opts.min, parsed);
    onChange(parsed);
  });

  wrapper.appendChild(input);
  return wrapper;
}

function redrawForceGraph(force) {
  const canvas = forceCanvases.get(force.id);
  if (canvas) drawForceGraph(canvas, force, state.forceVectorScale, state.forceGraphTimeWindow);
}

function redrawAllForceGraphs() {
  for (const force of state.structure.forces) {
    redrawForceGraph(force);
  }
}

// ── Sliders globaux (norme des vecteurs, échelle de temps) ──
// Toujours actifs, même pendant la simulation : ce sont des réglages
// d'AFFICHAGE seulement, ils ne modifient ni la structure ni les forces.

function buildSlidersSection() {
  const section = document.createElement("div");
  section.className = "force-sliders";

  section.appendChild(
    buildLogSlider({
      label: "Norme des vecteurs (px par unité de force)",
      min: FORCE_VECTOR_SCALE_EXPONENT_MIN,
      max: FORCE_VECTOR_SCALE_EXPONENT_MAX,
      getValue: () => state.forceVectorScale,
      setValue: (value) => {
        state.forceVectorScale = value;
      },
    })
  );

  section.appendChild(
    buildLogSlider({
      label: "Échelle de temps des graphiques (s affichées)",
      min: FORCE_GRAPH_TIME_WINDOW_EXPONENT_MIN,
      max: FORCE_GRAPH_TIME_WINDOW_EXPONENT_MAX,
      getValue: () => state.forceGraphTimeWindow,
      setValue: (value) => {
        state.forceGraphTimeWindow = value;
      },
    })
  );

  return section;
}

// Slider "log" : la POSITION du curseur est un exposant (linéaire), la
// VALEUR réelle est 10^position. Indispensable ici puisque les forces d'un
// projet peuvent varier de plusieurs ordres de grandeur (une poutre vs un
// pont) — un slider linéaire classique serait soit trop grossier, soit trop
// limité en portée.
function buildLogSlider({ label, min, max, getValue, setValue }) {
  const wrapper = document.createElement("div");
  wrapper.className = "force-slider-field";

  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const row = document.createElement("div");
  row.className = "force-slider-row";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = "0.05";
  slider.value = String(Math.log10(getValue()));

  const valueLabel = document.createElement("span");
  valueLabel.className = "force-slider-value";
  valueLabel.textContent = formatScaleValue(getValue());

  slider.addEventListener("input", () => {
    const value = Math.pow(10, parseFloat(slider.value));
    setValue(value);
    valueLabel.textContent = formatScaleValue(value);
    redrawAllForceGraphs();
  });

  row.appendChild(slider);
  row.appendChild(valueLabel);
  wrapper.appendChild(row);

  return wrapper;
}

function formatScaleValue(value) {
  const abs = Math.abs(value);
  if (abs >= 1000 || (abs > 0 && abs < 0.01)) return value.toExponential(2);
  return value.toFixed(3);
}
