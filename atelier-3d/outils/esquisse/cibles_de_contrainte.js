/*
 * outils/esquisse/cibles_de_contrainte.js
 * ───────────────────────────────────────
 * Ce que visent les outils de contrainte : un point, un tracé (segment,
 * cercle, arc), l'origine de l'esquisse ou l'un de ses deux axes. Un point
 * passe avant le tracé qui le porte, l'origine avant les axes qui s'y croisent.
 */

import { pointSous, courbeSous, pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";

const TOLERANCE_PX = 8;
const DEMI_AXE_MM = 200;

/* Rend { genre: "point" | "segment" | "cercle" | "arc" | "origine" | "axe" | "reference", id?, axe?, uv, contenu } ou null.
   voulus : les genres attendus ; les points de référence des esquisses précédentes
   (genre "reference", avec esquisse et point) ne sont visés que si on les attend. */
export function viserCible(evenement, contexte, voulus = []) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  const tolerance = TOLERANCE_PX * vise.mmParPixel;
  const [u, v] = vise.uv;
  const commun = { uv: vise.uv, contenu };

  // Le point de référence le plus proche à l'écran — lui-même ou sa projection :
  // en 3D, des références confondues dans le plan se départagent ainsi.
  if (voulus.includes("reference")) {
    const r = contexte.esquisse.referenceSousLeCurseur(evenement.clientX, evenement.clientY, TOLERANCE_PX * 1.5);
    if (r !== null) return { ...commun, genre: "reference", uv: r.uv, esquisse: r.esquisse, point: r.point };
  }

  const point = pointSous(contenu, vise.uv, tolerance);
  if (point !== null) return { ...commun, genre: "point", id: point };
  const courbe = courbeSous(contenu, vise.uv, tolerance);
  if (courbe !== null) return { ...commun, genre: contenu.courbes.find((c) => c.id === courbe).genre, id: courbe };
  if (Math.hypot(u, v) < tolerance) return { ...commun, genre: "origine" };
  if (Math.abs(v) < tolerance) return { ...commun, genre: "axe", axe: "horizontal" };
  if (Math.abs(u) < tolerance) return { ...commun, genre: "axe", axe: "vertical" };
  return null;
}

/* Met en évidence les cibles : les tracés et les axes en surbrillance, les points et l'origine marqués. */
export function montrerCibles(contexte, cibles) {
  const traces = [];
  let marque = null;
  for (const cible of cibles) {
    if (cible === null) continue;
    if (cible.genre === "point") marque = cible.contenu.points[cible.id];
    else if (cible.genre === "origine") marque = [0, 0];
    else if (cible.genre === "reference") marque = cible.uv;
    else if (cible.genre === "axe") {
      traces.push({
        points: cible.axe === "horizontal" ? [[-DEMI_AXE_MM, 0], [DEMI_AXE_MM, 0]] : [[0, -DEMI_AXE_MM], [0, DEMI_AXE_MM]],
        genre: "choisi",
      });
    } else {
      const c = cible.contenu.courbes.find((k) => k.id === cible.id);
      if (c !== undefined) traces.push({ points: pointsDeCourbe(cible.contenu, c), genre: "choisi" });
    }
  }
  contexte.esquisse.apercu(traces);
  contexte.esquisse.montrer(marque === null ? null : { uv: marque, guides: [] });
}

export function effacerCibles(contexte) {
  contexte.esquisse.apercu([]);
  contexte.esquisse.montrer(null);
}
