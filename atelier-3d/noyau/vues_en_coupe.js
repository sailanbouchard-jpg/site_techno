/*
 * noyau/vues_en_coupe.js
 * ──────────────────────
 * Les vues en coupe du projet : un plan de base (XY, XZ ou YZ) décalé le long
 * de l'axe qui lui est perpendiculaire. Activée, une coupe retire la moitié
 * des pièces tournée vers la caméra : on voit l'intérieur, et on continue d'y
 * travailler normalement.
 *
 * Une coupe : { id, plan: "XY" | "XZ" | "YZ", position (mm), inverse (bool) }.
 * inverse : on regarde depuis l'autre côté, et c'est l'autre moitié qui reste.
 * Les coupes sont rangées dans le document : elles s'enregistrent avec le
 * projet et s'annulent comme le reste.
 */

/*
 * axe : l'indice de l'axe perpendiculaire au plan ; vue : la vue du cube qui
 * regarde le plan de face ; garde : le signe du côté conservé (+1 : les
 * coordonnées au-delà de la position), celui qui s'éloigne de la caméra.
 */
export const PLANS_DE_COUPE = {
  XY: { axe: 2, nomDeLAxe: "Z", vue: "dessus", vueInverse: "dessous", garde: -1, etiquette: "Horizontal (XY)" },
  XZ: { axe: 1, nomDeLAxe: "Y", vue: "face", vueInverse: "dos", garde: 1, etiquette: "Face (XZ)" },
  YZ: { axe: 0, nomDeLAxe: "X", vue: "droite", vueInverse: "gauche", garde: -1, etiquette: "Côté (YZ)" },
};

export function nouvelleCoupe(coupes, plan, position) {
  let plusGrand = 0;
  for (const c of coupes) plusGrand = Math.max(plusGrand, Number(c.id.slice(1)) || 0);
  return { id: "c" + (plusGrand + 1), plan, position, inverse: false };
}

/* Le plan de coupe à la façon de three.js : les points p tels que
   normale · p + constante ≥ 0 restent visibles. */
export function planDeLaCoupe(coupe) {
  const { axe, garde } = PLANS_DE_COUPE[coupe.plan];
  const signe = coupe.inverse ? -garde : garde;
  const normale = [0, 0, 0];
  normale[axe] = signe;
  return { normale, constante: -signe * coupe.position };
}

/* La vue du cube qui fait face à la coupe, du côté retiré. */
export function vueDeLaCoupe(coupe) {
  const plan = PLANS_DE_COUPE[coupe.plan];
  return coupe.inverse ? plan.vueInverse : plan.vue;
}

const nombre = (v) => (Math.round(v * 10) / 10).toLocaleString("fr-FR");

/* « XZ · Y 12 » : court, pour tenir sous le cube d'orientation. */
export function nomCourtDeLaCoupe(coupe) {
  return coupe.plan + " · " + PLANS_DE_COUPE[coupe.plan].nomDeLAxe + " " + nombre(coupe.position);
}

export function descriptionDeLaCoupe(coupe) {
  const plan = PLANS_DE_COUPE[coupe.plan];
  return "Coupe par le plan " + coupe.plan + ", à " + plan.nomDeLAxe + " = " + nombre(coupe.position) + " mm" +
    (coupe.inverse ? ", vue de l'autre côté." : ".");
}
