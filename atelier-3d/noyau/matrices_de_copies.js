/*
 * noyau/matrices_de_copies.js
 * ───────────────────────────
 * Symétrie, répétition en ligne, répétition en cercle : chacune se résume à
 * une liste de matrices, une par exemplaire. Le moteur s'en sert pour
 * construire le solide, « Figer » pour poser les copies une à une — la même
 * liste, donc le même résultat.
 *
 * Tout est exprimé dans le repère de la répétition, où l'original est rangé.
 */

import { composer, appliquerAuPoint } from "./transformations.js";

export const IDENTITE = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
export const VECTEUR_D_AXE = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export function translation([x, y, z]) {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
}

/* Rotation autour d'une droite parallèle à X, Y ou Z passant par centre. */
export function rotationAutour(axe, degres, [cx, cy, cz]) {
  const a = (degres * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const r = {
    x: [1, 0, 0, 0, c, -s, 0, s, c],
    y: [c, 0, s, 0, 1, 0, -s, 0, c],
    z: [c, -s, 0, s, c, 0, 0, 0, 1],
  }[axe];
  const tourne = [r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0];
  return composer(translation([cx, cy, cz]), composer(tourne, translation([-cx, -cy, -cz])));
}

/* Symétrie par le plan perpendiculaire à l'axe, placé à « position » sur cet axe. */
export function miroir(axe, position) {
  const m = [...IDENTITE];
  const i = { x: 0, y: 1, z: 2 }[axe];
  m[i * 5] = -1;
  m[i * 4 + 3] = 2 * position;
  return m;
}

export function copiesEnLigne({ axe, nombre, ecart, deuxSens }) {
  const [dx, dy, dz] = VECTEUR_D_AXE[axe] ?? VECTEUR_D_AXE.x;
  const pas = (i) => translation([dx * ecart * i, dy * ecart * i, dz * ecart * i]);
  const n = Math.max(1, Math.round(nombre));
  const copies = [];
  for (let i = 0; i < n; i += 1) copies.push(pas(i));
  if (deuxSens) for (let i = 1; i < n; i += 1) copies.push(pas(-i));
  return copies;
}

/*
 * angle : 360 répartit les copies sur tout le tour ; moins, la première et la
 * dernière sont aux deux bouts de l'arc. tourner = false : les copies suivent
 * le cercle mais gardent l'orientation de l'original, repéré par son centre.
 */
export function copiesEnCercle({ axe, nombre, angle, tourner, centreX, centreY, centreZ, centreObjet }) {
  const n = Math.max(1, Math.round(nombre));
  const tourComplet = Math.abs(angle) >= 359.999;
  const pas = n === 1 ? 0 : tourComplet ? angle / n : angle / (n - 1);
  const centre = [centreX, centreY, centreZ];
  const objet = [centreObjet?.x ?? 0, centreObjet?.y ?? 0, centreObjet?.z ?? 0];
  const copies = [];
  for (let i = 0; i < n; i += 1) {
    const rotation = rotationAutour(axe, pas * i, centre);
    if (tourner) {
      copies.push(rotation);
    } else {
      const arrivee = appliquerAuPoint(rotation, objet);
      copies.push(translation([arrivee[0] - objet[0], arrivee[1] - objet[1], arrivee[2] - objet[2]]));
    }
  }
  return copies;
}

export function copiesSymetriques({ plan, position, garder }) {
  const axe = { YZ: "x", XZ: "y", XY: "z" }[plan] ?? "x";
  const reflet = miroir(axe, position);
  return garder ? [IDENTITE, reflet] : [reflet];
}
