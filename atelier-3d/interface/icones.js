/*
 * interface/icones.js
 * ───────────────────
 * Le jeu d'icônes de l'atelier : SVG 16 × 16, monochromes, trait de 1,5 px,
 * dans la couleur du texte. Aucune bibliothèque, aucun emoji.
 *
 * Une icône est une liste de tracés : { d } pour un chemin, { cercle: [cx, cy, r] },
 * { points } pour un polygone fermé.
 */

const SVG = "http://www.w3.org/2000/svg";

function polygoneEnEtoile(branches, rayonExterieur, rayonInterieur, cx, cy) {
  const points = [];
  for (let i = 0; i < branches * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / branches;
    const rayon = i % 2 === 0 ? rayonExterieur : rayonInterieur;
    points.push((cx + rayon * Math.cos(angle)).toFixed(2) + "," + (cy + rayon * Math.sin(angle)).toFixed(2));
  }
  return points.join(" ");
}

function roueDentee(dents, rayonExterieur, rayonInterieur, cx, cy) {
  const points = [];
  for (let i = 0; i < dents; i += 1) {
    for (const [fraction, rayon] of [[0, rayonInterieur], [0.25, rayonExterieur], [0.5, rayonExterieur], [0.75, rayonInterieur]]) {
      const angle = ((i + fraction) * 2 * Math.PI) / dents;
      points.push((cx + rayon * Math.cos(angle)).toFixed(2) + "," + (cy + rayon * Math.sin(angle)).toFixed(2));
    }
  }
  return points.join(" ");
}

const ICONES = {
  // ── Formes ──
  pave: [{ d: "M2.5 5.2 8 2.5l5.5 2.7v6L8 13.9l-5.5-2.7z M2.5 5.2 8 7.9l5.5-2.7 M8 7.9v6" }],
  cylindre: [{ d: "M3 4.3c0-1 2.2-1.8 5-1.8s5 .8 5 1.8-2.2 1.8-5 1.8-5-.8-5-1.8z M3 4.3v7.4c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4.3" }],
  sphere: [{ cercle: [8, 8, 5.7] }, { d: "M2.3 8c0 1.3 2.6 2.3 5.7 2.3s5.7-1 5.7-2.3" }],
  cone: [{ d: "M3 11.6 8 2.3l5 9.3 M3 11.6c0 1 2.2 1.8 5 1.8s5-.8 5-1.8-2.2-1.8-5-1.8-5 .8-5 1.8" }],
  tore: [{ d: "M1.5 8.2c0-2.1 2.9-3.7 6.5-3.7s6.5 1.6 6.5 3.7-2.9 3.7-6.5 3.7-6.5-1.6-6.5-3.7z M5.2 7.9c.7.6 1.7.9 2.8.9s2.1-.3 2.8-.9 M6.1 8.4c.5-.4 1.2-.6 1.9-.6s1.4.2 1.9.6" }],
  pyramide: [{ d: "M8 2.3 2.3 12.4 8 13.9l5.7-1.5z M8 2.3v11.6" }],
  etoile: [{ points: polygoneEnEtoile(5, 6, 2.5, 8, 8.6) }],
  coeur: [{ d: "M8 13.6S2.3 10.1 2.3 6.2A2.9 2.9 0 0 1 8 5a2.9 2.9 0 0 1 5.7 1.2c0 3.9-5.7 7.4-5.7 7.4z" }],
  engrenage: [{ points: roueDentee(8, 6.3, 4.8, 8, 8) }, { cercle: [8, 8, 1.8] }],
  fleche: [{ d: "M2.3 6.3h6.5V3.6L13.7 8l-4.9 4.4V9.7H2.3z" }],
  croix: [{ d: "M6.1 2.3h3.8v3.8h3.8v3.8H9.9v3.8H6.1V9.9H2.3V6.1h3.8z" }],
  importe: [{ d: "M4 2.5h5.2L12 5.3v8.2H4z M9 2.5v3h3 M8 7.2v4.4 M6.1 9.8 8 11.7l1.9-1.9" }],
  groupe: [{ d: "M2.5 2.5h7v7h-7z M6.5 6.5h7v7h-7z" }],
  construction: [{ d: "M3 3.5v9 M3 4.5h2 M3 8h2 M3 11.5h2 M7 4.5h6.5 M7 8h6.5 M7 11.5h6.5" }],

  // ── Actions ──
  annuler: [{ d: "M5.6 3.4 2.5 6.5l3.1 3.1 M2.5 6.5h6.8a4.2 4.2 0 0 1 0 8.4H7" }],
  refaire: [{ d: "M10.4 3.4 13.5 6.5l-3.1 3.1 M13.5 6.5H6.7a4.2 4.2 0 0 0 0 8.4H9" }],
  importer: [{ d: "M8 2.5v8 M4.8 7.3 8 10.5l3.2-3.2 M2.5 10.8v2.7h11v-2.7" }],
  exporter: [{ d: "M8 10.5v-8 M4.8 5.7 8 2.5l3.2 3.2 M2.5 10.8v2.7h11v-2.7" }],
  // Grouper : deux pièces différentes, réunies dans un cadre. Dégrouper : le
  // cadre s'ouvre, les pièces s'écartent. Dupliquer : une feuille et sa copie,
  // marquée d'un +. Trois dessins qu'on ne confond pas d'un coup d'œil.
  grouper: [{ d: "M1.5 4.5v-3h3 M11.5 1.5h3v3 M14.5 11.5v3h-3 M4.5 14.5h-3v-3 M4 4.5h4v4H4z" }, { cercle: [10.5, 10.5, 2.3] }],
  degrouper: [{ d: "M1.5 4.5v-3h3 M14.5 11.5v3h-3 M3.5 3.5h4v4h-4z" }, { cercle: [11.5, 11.5, 2.3] }],
  dupliquer: [{ d: "M5.5 5.5h8v8h-8z M2.5 10.5v-8h8 M9.5 7.5v4 M7.5 9.5h4" }],
  supprimer: [{ d: "M3 4.5h10 M6.2 4.5V2.8h3.6v1.7 M4.4 4.5l.7 9h5.8l.7-9 M7 7v4.4 M9 7v4.4" }],
  trou: [{ d: "M2.5 2.5h11v11h-11z M2.5 7.8 7.8 2.5 M2.5 13.5 13.5 2.5 M8.2 13.5l5.3-5.3" }],
  oeil: [{ d: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" }, { cercle: [8, 8, 2] }],
  "oeil-barre": [{ d: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z M2.5 13.5l11-11" }],
  "cadenas-ferme": [{ d: "M3.8 7.2h8.4v6.3H3.8z M5.5 7.2V5.3a2.5 2.5 0 0 1 5 0v1.9" }],
  "cadenas-ouvert": [{ d: "M3.8 7.2h8.4v6.3H3.8z M5.5 7.2V5.3a2.5 2.5 0 0 1 4.8-.9" }],
  menu: [{ d: "M4.5 6.3 8 9.8l3.5-3.5" }],
  plus: [{ d: "M8 3v10 M3 8h10" }],
  cadrer: [{ d: "M2.5 6V2.5H6 M10 2.5h3.5V6 M13.5 10v3.5H10 M6 13.5H2.5V10" }],

  texte: [{ d: "M3 3.5h10 M3 3.5v1.8 M13 3.5v1.8 M8 3.5v9.5 M6 13h4" }],

  // ── Dessin ──
  esquisse: [{ d: "M2.5 13.5l.9-3.4 7.6-7.6 2.5 2.5-7.6 7.6z M9.8 3.7l2.5 2.5" }],
  extrusion: [{ d: "M2.5 11 8 8.5l5.5 2.5L8 13.5z M8 8.5V2.5 M5.8 4.7 8 2.5l2.2 2.2" }],
  epaississement: [{ d: "M2.5 10c2-3 4-3 5.5 0s3.5 3 5.5 0 M2.5 6c2-3 4-3 5.5 0s3.5 3 5.5 0 M2.5 6v4 M13.5 6v4" }],
  // Un tuyau qui suit une courbe : son profil au départ, le chemin en pointillé.
  balayage: [{ d: "M2.5 13.5c0-5 3-8 8-8 M5.5 13.5c0-3.3 1.7-5 5-5 M10.5 5.5v3" }, { cercle: [4, 13.5, 1.5] }],
  // Un carré en bas, un rond en haut, reliés.
  lissage: [{ d: "M3 13.5h10 M3 13.5 5 4.5 M13 13.5 11 4.5 M5 4.5c0-1.4 1.3-2 3-2s3 .6 3 2-1.3 2-3 2-3-.6-3-2" }],
  chanfreinEsquisse: [{ d: "M2.5 13.5V7l4.5-4.5h6.5" }, { cercle: [7, 2.5, 1] }, { cercle: [2.5, 7, 1] }],
  // Une arête cassée en biais, et une arête arrondie.
  // Un pavé dont la face du dessus monte, poussée par une flèche.
  extrusion_face: [{ d: "M2.5 13.5h8v-5h-8z M10.5 13.5l3-3v-5l-3 3 M2.5 8.5l3-3h8" }, { d: "M8 5V1.5 M6.5 3 8 1.5 9.5 3" }],
  aretes: [{ d: "M2 13.5h7l4.5-4.5V2.5 M2 13.5V9 M2 9h7v4.5 M9 9l4.5-4.5" }],
  coque: [{ d: "M2.5 5.5v8h11v-8 M4.5 5.5v6h7v-6 M2.5 5.5h2 M11.5 5.5h2" }],
  decoupe: [{ d: "M3 3h10v10H3z M1.5 8.5h13" }, { d: "M5 6.5h6" }],
  analyse: [{ d: "M2.5 13.5h11 M4 11V7 M7 11V4 M10 11V8.5 M13 11V5.5" }],
  // Coupe d'un trou lamé : la tête noyée, puis le passage de la vis.
  trou_de_vis: [{ d: "M2 3.5h3.5v4h1.5v6 M14 3.5h-3.5v4H9v6 M2 3.5h12" }],
  logement_ecrou: [{ d: "M8 2l5.2 3v6L8 14l-5.2-3V5z" }, { cercle: [8, 8, 2] }],
  // Les composants du collège : pile, carte électronique, moteur, diode, interrupteur.
  pile: [{ d: "M2.5 5.5h9v5h-9z M11.5 7h1.5v2h-1.5" }, { d: "M4.5 7.2v1.6" }],
  carte: [{ d: "M2.5 3.5h11v9h-11z M5 6h6v4h-6z" }, { d: "M2.5 6h-1 M2.5 9h-1 M13.5 6h1 M13.5 9h1" }],
  moteur: [{ d: "M3 5h8v6h-8z M11 7h3v2h-3" }, { d: "M5.5 5V3.5 M8.5 5V3.5" }],
  led: [{ d: "M5 9.5a3 3 0 0 1 6 0z M5 9.5h6 M6.5 11v3 M9.5 11v3" }, { d: "M8 6.5V3.5" }],
  interrupteur: [{ d: "M2.5 6.5h11v5h-11z" }, { d: "M8 6.5V3.5" }],
  composant: [{ d: "M4.5 4.5h7v7h-7z" }, { d: "M4.5 6.5h-2 M4.5 9.5h-2 M11.5 6.5h2 M11.5 9.5h2" }],
  fixation: [{ d: "M5.5 2.5h5v2.5h-5z M6.8 5v8.5 M9.2 5v8.5 M6.8 7l2.4 1 M6.8 9.5l2.4 1 M6.8 12l2.4 1" }],
  courbe: [{ d: "M2 12c2-8 5-8 6-4s4 4 6-4" }, { cercle: [2, 12, 1] }, { cercle: [14, 4, 1] }],
  decaler: [{ d: "M4 12V6.5L8 3l4 3.5V12z M1.8 13.8V5.6L8 .8l6.2 4.8v8.2z" }],
  echanger: [{ d: "M3 5.5h9.5 M10.5 3.5l2 2-2 2 M13 10.5H3.5 M5.5 8.5l-2 2 2 2" }],
  revolution: [{ d: "M8 1.8v12.4 M3 9.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5-2.2-2.5-5-2.5c-1.2 0-2.3.2-3.1.6 M5.6 5.9l-.7 1.2 1.4.4" }],
  // Un triangle d'avertissement.
  attention: [{ d: "M8 2.2l6.2 11H1.8z M8 6.4v3.4 M8 11.4v0.4" }],
  valider: [{ d: "M3 8.5l3.2 3.2L13 4.8" }],

  // ── Répéter ──
  symetrie: [{ d: "M8 1.8v12.4 M6 4 2.5 12h3.5z M10 4l3.5 8H10z" }],
  repetition_ligne: [{ d: "M1.8 6h3.4v4H1.8z M6.3 6h3.4v4H6.3z M10.8 6h3.4v4h-3.4z" }],
  repetition_cercle: [{ cercle: [8, 3.2, 1.4] }, { cercle: [12.2, 10.4, 1.4] }, { cercle: [3.8, 10.4, 1.4] }, { d: "M4.4 6.5a4.8 4.8 0 0 1 2-2.3 M9.6 4.2a4.8 4.8 0 0 1 2 2.3 M10.6 12.4a4.8 4.8 0 0 1-5.2 0" }],
  figer: [{ d: "M2.5 2.5h4.5v4.5H2.5z M9 2.5h4.5v4.5H9z M2.5 9h4.5v4.5H2.5z M9 9h4.5v4.5H9z" }],

  // ── Outils de tracé ──
  pinceau: [{ d: "M13.5 2.5 7.2 8.8 M7.2 8.8c-2 0-3 1.2-3 2.8 0 1.2-.9 1.7-1.7 1.9 3.2.9 6.2-.1 6.2-2.9z" }],
  trait: [{ d: "M2.5 12.5 6 5l4 5.5 3.5-7" }, { cercle: [2.5, 12.5, 1] }, { cercle: [13.5, 3.5, 1] }],
  arc: [{ d: "M2.5 12.5a8 8 0 0 1 11-8.5" }, { cercle: [2.5, 12.5, 1] }, { cercle: [13.5, 4, 1] }],
  arcCentre: [{ d: "M13.5 10a5.5 5.5 0 0 0-11 0 M6.5 10h3 M8 8.5v3" }, { cercle: [13.5, 10, 1] }, { cercle: [2.5, 10, 1] }],
  cercle: [{ cercle: [8, 8, 5.5] }, { d: "M8 7.3v1.4 M7.3 8h1.4" }],
  rectangle: [{ d: "M2.5 4h11v8h-11z" }],
  polygone: [{ points: "8,2.3 13,5.2 13,10.8 8,13.7 3,10.8 3,5.2" }],
  gomme: [{ d: "M9.5 2.8l3.7 3.7L7 12.7H4.3l-1.5-1.5z M6.4 5.9l3.7 3.7 M7 12.7h6.5" }],
  selection: [{ d: "M3.5 2.2v10.2l2.8-2.7 1.9 4.2 1.9-.9-1.9-4.1h3.9z" }],
  arrondi: [{ d: "M2.5 13.5V9a6.5 6.5 0 0 1 6.5-6.5h4.5" }],
  contour: [{ d: "M3 12.5 3 4.5 9 2.5 13 7 9.5 13z" }, { cercle: [3, 12.5, 1] }, { cercle: [3, 4.5, 1] }, { cercle: [9, 2.5, 1] }, { cercle: [13, 7, 1] }],

  // ── Contraintes d'esquisse ──
  cote: [{ d: "M2 11.5v-7 M14 11.5v-7 M2 8h12 M2 8l2.2-1.6 M2 8l2.2 1.6 M14 8l-2.2-1.6 M14 8l-2.2 1.6" }],
  // La symétrie d'esquisse reprend l'icône de la symétrie des solides.
  symetrie_esquisse: [{ d: "M8 1.5v13 M2 4.5l4 3.5-4 3.5z M14 4.5l-4 3.5 4 3.5z" }],
  // Ajuster : un trait coupé net entre deux croisements.
  ajuster: [{ d: "M1.5 11h5 M9.5 11h5 M5 3.5v11 M11 3.5v11" }, { d: "M6.5 8.8l3 4.4 M9.5 8.8l-3 4.4" }],
  // Trait d'aide : le même trait, en pointillé.
  trait_aide: [{ d: "M1.5 12.5h3 M6.5 12.5h3 M11.5 12.5h3 M2.5 3.5h3 M7.5 3.5h3 M12.5 3.5h1" }],
  // Tangent : une droite qui effleure un cercle.
  tangente: [{ cercle: [8, 10, 4.5] }, { d: "M1.5 4.5h13" }],
  // Même centre : deux cercles autour du même point.
  concentrique: [{ cercle: [8, 8, 6] }, { cercle: [8, 8, 2.5] }, { d: "M8 7.6v0.8" }],
  // Angle : deux segments partant d'un même sommet, et l'arc entre eux.
  angle: [{ d: "M2.5 13.5h11 M2.5 13.5L11 3.5" }, { d: "M9.5 13.5a7 7 0 0 0-2.1-5" }],
  // Les lettres H et V, celles qui marquent la contrainte sur le tracé, au-dessus d'un segment de niveau.
  horizontal_vertical: [{ d: "M2 2v6.5 M6 2v6.5 M2 5.25h4 M9 2l2.5 6.5L14 2 M3 13.5h10" }, { cercle: [3, 13.5, 1.2] }, { cercle: [13, 13.5, 1.2] }],
  sur_axe: [{ d: "M1.5 12.5h13 M4 15V1.5" }, { cercle: [10, 12.5, 1.8] }],
  // Un point cerclé, marqué d'une croix de visée.
  point_reference: [{ cercle: [8, 8, 2.2] }, { d: "M8 1.5v3.5 M8 11v3.5 M1.5 8h3.5 M11 8h3.5" }],
  // Un point qui rejoint, par un pointillé, la référence d'un autre plan.
  sur_reference: [{ cercle: [4.5, 11.5, 1.8] }, { cercle: [11.5, 4.5, 2.2] }, { d: "M5.8 10.2l1.2-1.2 M8.3 7.7l1.2-1.2" }],
  fixer: [{ d: "M5 7.5V5.3a3 3 0 0 1 6 0v2.2 M3.5 7.5h9v6h-9z" }],
  parallele: [{ d: "M3 13.5 9 2.5 M7.5 13.5l6-11" }],
  perpendiculaire: [{ d: "M2.5 13.5h11 M8 13.5V2.5 M8 10.5h3v3" }],
  egal: [{ d: "M3 6h10 M3 10h10" }],

  // ── Modes de déplacement ──
  poser: [{ d: "M2 13.5h12 M8 2.5v7.2 M5.4 7.2 8 9.8l2.6-2.6" }],
  libre: [{ d: "M8 2v12 M2 8h12 M6.2 3.8 8 2l1.8 1.8 M6.2 12.2 8 14l1.8-1.8 M3.8 6.2 2 8l1.8 1.8 M12.2 6.2 14 8l-1.8 1.8" }],
  axe: [{ d: "M4 12.5V2.8 M4 12.5h9.7 M4 12.5l-2.2 2.2 M2.4 4.6 4 2.8l1.6 1.8 M11.9 10.9l1.8 1.6-1.8 1.6" }],
  mesurer: [{ d: "M1.8 10.8 10.8 1.8l3.4 3.4-9 9z M4.3 8.3l1.4 1.4 M6.3 6.3l1.9 1.9 M8.3 4.3l1.4 1.4" }],
  aligner: [{ d: "M2.5 1.8v12.4 M4.5 3.5h9v3h-9z M4.5 9.5h5.5v3H4.5z" }],
  // Croiser : deux pièces qui se chevauchent, et la lentille commune tracée au milieu.
  // (x) : une valeur nommée, comme en algèbre.
  variables: [{ d: "M3.4 3c-1.3 1.3-2 3.1-2 5s.7 3.7 2 5 M12.6 3c1.3 1.3 2 3.1 2 5s-.7 3.7-2 5 M5.6 5.4l4.8 5.2 M10.4 5.4l-4.8 5.2" }],
  // Deux crochets autour d'une valeur : l'intervalle permis.
  borne: [{ d: "M4.5 3H2.5v10h2 M11.5 3h2v10h-2 M5.8 8h4.4" }],
  bibliotheque: [{ d: "M2.5 2.5h2.6v11H2.5z M6.2 2.5h2.6v11H6.2z M10 3.3l2.4-.6 2 10.6-2.4.6z" }],
  palette: [{ d: "M8 2.2c-3.4 0-6 2.5-6 5.7 0 3.1 2.4 5.9 5.3 5.9 1.1 0 1.6-.7 1.3-1.6-.4-1 .2-1.9 1.3-1.9h1.6c1.6 0 2.7-1.1 2.7-2.6 0-3.1-2.8-5.5-6.2-5.5z" }, { cercle: [5.2, 7.2, 0.9] }, { cercle: [7.6, 4.9, 0.9] }, { cercle: [10.6, 5.9, 0.9] }],
  croiser: [{ cercle: [6, 8, 4.5] }, { cercle: [10, 8, 4.5] }, { d: "M8 4.2 A4.5 4.5 0 0 1 8 11.8 A4.5 4.5 0 0 1 8 4.2 Z" }],
  // Une pièce tranchée : le plan de coupe, et la matière coupée hachurée.
  coupe: [{ d: "M2.5 4.5h11v8h-11z M8 1.5v14 M2.5 9l4.5-4.5 M4 12.5l4-4" }],
  vue: [{ d: "M8 1.8 13.5 5v6L8 14.2 2.5 11V5z M2.5 5 8 8.2 13.5 5 M8 8.2v6" }],
  // Le plateau de l'imprimante, vu en perspective, une pièce posée dessus.
  plateau: [{ d: "M1.5 12.5 3.5 9h9l2 3.5z M6 9V5.5h4V9" }],
  // Des pièces rangées en rangées.
  disposer: [{ d: "M2 2.5h5v5H2z M9 2.5h5v5H9z M2 9.5h5v4H2z M9 9.5h5v4H9z" }],
  // Un quart de tour autour de la verticale.
  tourner: [{ d: "M12.8 8.5A4.8 4.8 0 1 1 11.4 5 M11.6 1.8V5H8.4" }],
  // Un objet qui se sépare en deux pièces.
  eclater: [{ d: "M1.8 4.5h4.5v7H1.8z M9.7 4.5h4.5v7H9.7z M7.1 8h1.8" }],
  // Des couches empilées : l'aperçu du tranchage.
  couches: [{ d: "M2 12.5h12 M2 9.5h12 M2 6.5h12 M2 3.5h12" }],
  imprimante: [{ d: "M2.5 2.5h11v11h-11z M2.5 5.5h11 M6.5 5.5v2.5L8 9.5l1.5-1.5V5.5 M5 11.5h6" }],
  pause: [{ d: "M5.5 3.5v9 M10.5 3.5v9" }],
  arret: [{ d: "M4 4h8v8H4z" }],
  fermer: [{ d: "M4 4l8 8 M12 4l-8 8" }],
  // La règle graduée : les essais de calibration se concluent au pied à coulisse.
  regle: [{ d: "M1.5 5h13v6h-13z M4 5v2.5 M6.5 5v3.5 M9 5v2.5 M11.5 5v3.5" }],
  // Des pièces qui se rejoignent.
  rassembler: [{ d: "M2.5 4.5h4.5v7H2.5z M9 4.5h4.5v7H9z M7 8h2" }],
};

export function icone(nom) {
  const traces = ICONES[nom];
  if (traces === undefined) throw new Error("Icône inconnue : « " + nom + " ».");

  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "icone");
  svg.setAttribute("aria-hidden", "true");
  for (const trace of traces) {
    let element;
    if (trace.d !== undefined) {
      element = document.createElementNS(SVG, "path");
      element.setAttribute("d", trace.d);
    } else if (trace.cercle !== undefined) {
      element = document.createElementNS(SVG, "circle");
      const [cx, cy, r] = trace.cercle;
      element.setAttribute("cx", cx);
      element.setAttribute("cy", cy);
      element.setAttribute("r", r);
    } else {
      element = document.createElementNS(SVG, "polygon");
      element.setAttribute("points", trace.points);
    }
    svg.appendChild(element);
  }
  return svg;
}

export function iconeExiste(nom) {
  return nom in ICONES;
}
