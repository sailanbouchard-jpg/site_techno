/*
 * interface/signal_pres_du_curseur.js
 * ───────────────────────────────────
 * Un mot bref à côté de la souris (« Dupliqué »), qui s'efface seul : pour une
 * action qui ne change rien de visible dans la vue — la copie se superpose
 * exactement à l'original — on voit quand même qu'elle a eu lieu.
 */

import { creer } from "./elements.js";

const DUREE_MS = 1300;
const DECALAGE_PX = 14;

// La dernière position connue de la souris : le clic d'un bouton ou un Ctrl+D
// s'y rapportent, même si la souris n'est pas sur la vue.
let x = globalThis.innerWidth / 2;
let y = globalThis.innerHeight / 2;
globalThis.addEventListener("pointermove", (evenement) => {
  x = evenement.clientX;
  y = evenement.clientY;
}, { capture: true, passive: true });

let signal = null;
let minuterie = null;

export function signalerPresDuCurseur(texte) {
  if (signal === null) {
    signal = creer("div", { classe: "signal-curseur", attributs: { role: "status" } });
    document.body.append(signal);
  }
  signal.textContent = texte;
  signal.style.left = Math.round(Math.min(x + DECALAGE_PX, globalThis.innerWidth - 140)) + "px";
  signal.style.top = Math.round(Math.min(Math.max(4, y - DECALAGE_PX - 20), globalThis.innerHeight - 30)) + "px";
  // Relancer l'animation même si le signal précédent n'est pas fini.
  signal.classList.remove("visible");
  void signal.offsetWidth;
  signal.classList.add("visible");
  clearTimeout(minuterie);
  minuterie = setTimeout(() => signal.classList.remove("visible"), DUREE_MS);
}
