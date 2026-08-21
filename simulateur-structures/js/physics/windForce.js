// physics/windForce.js
// ────────────────────
// COUPLAGE fluide → structure : la force du VENT sur les poutres. Traînée
// aérodynamique appliquée SEGMENT par segment, ajoutée aux forces nodales du pas
// (comme la gravité ou un poids posé). Voir la calibration dans physics/config.js.
//
// Modèle (léger, sens physique) : pour un segment de normale n̂, la composante
// du vent normale à la poutre (relative à la vitesse du segment) est
//   v_n = w·n̂ₓ − (v_segment·n̂)
// et la force vaut  ½·ρ·Cd·(profondeur·longueur)·v_n·|v_n|  dans la direction n̂.
// Conséquence voulue : une planche PERPENDICULAIRE au vent est fortement poussée,
// une planche DANS L'AXE ne l'est presque pas. La force est répartie à parts
// égales sur les deux nœuds du segment (segments courts ≈ 1 m).
//
// On utilise le vent de BASE non dévié (w, 0) — pas le champ de particules : c'est
// le plus léger, et l'effet dominant (orientation des poutres) est déjà là. Le
// masquage d'une poutre par une autre (ombre aérodynamique) pourra venir ensuite.

import { AIR_DENSITY, WIND_DRAG_CD, WIND_BEAM_DEPTH_M, WIND_FORCE_GAIN } from "./config.js";
import { findNodeById } from "../model/Structure.js";

// Ajoute la force du vent aux forces nodales. `windSpeed` = vitesse de base signée
// (m/s, > 0 → droite). `ramp` = montée en douceur au lancement (mêmes 0→1 que la
// gravité), pour ne pas cogner la structure à t = 0.
export function addWindForces(forces, structure, windSpeed, ramp) {
  const w = windSpeed * ramp;
  if (!w) return;
  const coef = 0.5 * AIR_DENSITY * WIND_DRAG_CD * WIND_BEAM_DEPTH_M * WIND_FORCE_GAIN;

  for (const seg of structure.segments) {
    const a = findNodeById(structure, seg.nodeAId);
    const b = findNodeById(structure, seg.nodeBId);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;

    // Normale unitaire à la poutre.
    const nx = -dy / len;
    const ny = dx / len;

    // Composante NORMALE de la vitesse relative du vent (vent (w,0) − vitesse du
    // segment). La traînée s'auto-amortit ainsi quand la poutre bouge avec le vent.
    const vmx = (a.vx + b.vx) * 0.5;
    const vmy = (a.vy + b.vy) * 0.5;
    const vn = w * nx - (vmx * nx + vmy * ny);

    // F = coef · longueur · v_n·|v_n|, dans la direction n̂ ; moitié à chaque nœud.
    const f = coef * seg.restLength * vn * Math.abs(vn);
    const fx = f * nx * 0.5;
    const fy = f * ny * 0.5;

    if (!a.fixed) {
      const fa = forces.get(a.id);
      if (fa) { fa.fx += fx; fa.fy += fy; }
    }
    if (!b.fixed) {
      const fb = forces.get(b.id);
      if (fb) { fb.fx += fx; fb.fy += fy; }
    }
  }
}
