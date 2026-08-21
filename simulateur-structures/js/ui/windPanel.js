// ui/windPanel.js
// ───────────────
// Barre de réglage du VENT : bouton d'activation, champs (vitesse, rafales,
// nervosité, graine, particules, longueur) et PRÉVISUALISATION de la courbe de
// vent sur 30 s. Met à jour state.wind et redessine l'aperçu à chaque changement.
// N'affiche l'aperçu qu'en ÉDITION (en simulation, ce sont les particules sur le
// canvas qui parlent). Aucune formule physique ici.

import { state, MODES } from "../state.js";
import { drawWindCurvePreview } from "../render/windCurve.js";
import { windSpeedAt } from "../physics/wind.js";

let els = null;
let curveCtx = null;

export function initWindPanel() {
  const toggle = document.getElementById("wind-toggle-button");
  els = {
    toggle,
    bar: document.getElementById("wind-bar"),
    speed: document.getElementById("wind-speed"),
    gustAmp: document.getElementById("wind-gust-amp"),
    gustRate: document.getElementById("wind-gust-rate"),
    seed: document.getElementById("wind-seed"),
    count: document.getElementById("wind-count"),
    length: document.getElementById("wind-length"),
    canvas: document.getElementById("wind-curve-canvas"),
    display: document.getElementById("wind-display"),
  };
  if (!toggle || !els.bar) return;
  curveCtx = els.canvas ? els.canvas.getContext("2d") : null;

  syncInputsFromState();

  toggle.addEventListener("click", () => {
    state.wind.enabled = !state.wind.enabled;
    refreshWindPanel();
  });

  // Champs → state.wind (avec bornes), puis redessin de l'aperçu.
  bindNumber(els.speed, (v) => { state.wind.speed = v; });
  bindNumber(els.gustAmp, (v) => { state.wind.gustAmplitude = Math.max(0, v); });
  bindNumber(els.gustRate, (v) => { state.wind.gustRate = Math.max(0.02, v); });
  bindNumber(els.seed, (v) => { state.wind.seed = Math.max(0, Math.round(v)); });
  bindNumber(els.count, (v) => { state.wind.particleCount = Math.max(0, Math.min(2000, Math.round(v))); });
  bindNumber(els.length, (v) => { state.wind.particleSeconds = Math.max(0.2, Math.min(6, v)); });

  window.addEventListener("resize", () => { if (!els.bar.hidden) redrawPreview(); });

  refreshWindPanel();
}

function bindNumber(input, apply) {
  if (!input) return;
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    if (Number.isNaN(v)) return;
    apply(v);
    redrawPreview();
  });
}

function syncInputsFromState() {
  const w = state.wind;
  if (els.speed) els.speed.value = String(w.speed);
  if (els.gustAmp) els.gustAmp.value = String(w.gustAmplitude);
  if (els.gustRate) els.gustRate.value = String(w.gustRate);
  if (els.seed) els.seed.value = String(w.seed);
  if (els.count) els.count.value = String(w.particleCount);
  if (els.length) els.length.value = String(w.particleSeconds);
}

// Affiche/masque le panneau (à droite du canvas) selon l'activation du vent, et
// redessine l'aperçu. Le panneau reste utilisable en édition ET en simulation :
// on peut ainsi ajuster le vent en direct et voir son effet. Appelée à l'init,
// au changement de mode et à chaque bascule du vent.
export function refreshWindPanel() {
  if (!els) return;
  els.toggle.classList.toggle("active", state.wind.enabled);
  els.toggle.setAttribute("aria-pressed", String(state.wind.enabled));

  els.bar.hidden = !state.wind.enabled;
  if (state.wind.enabled) redrawPreview();
}

function redrawPreview() {
  if (!curveCtx || !els.canvas || els.bar.hidden) return;
  // Ajuste la résolution du canvas à sa taille CSS (net, sans déformation).
  const cssW = els.canvas.clientWidth || 480;
  const cssH = els.canvas.clientHeight || 96;
  if (els.canvas.width !== cssW) els.canvas.width = cssW;
  if (els.canvas.height !== cssH) els.canvas.height = cssH;
  drawWindCurvePreview(curveCtx, els.canvas, state.wind);
}

// Vitesse de vent en direct dans la barre d'état (uniquement en simulation, vent
// actif). Appelée à chaque image par la boucle d'animation.
export function updateWindDisplay() {
  if (!els || !els.display) return;
  if (state.mode !== MODES.SIMULATION || !state.wind.enabled) {
    els.display.textContent = "";
    return;
  }
  const v = windSpeedAt(state.wind, state.simulationTime);
  const arrow = v >= 0 ? "→" : "←";
  els.display.textContent = `Vent : ${Math.abs(v).toFixed(1)} m/s ${arrow}`;
}
