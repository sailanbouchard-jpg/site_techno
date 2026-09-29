import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTENU_VIDE, ajouterSegment, ajouterArc, ajouterCercle, ajouterPolyligne, supprimerCourbes,
  deplacerPoint, fusionnerPoints, arrondirAngle, arcDepuisBombe, bombeParTroisPoints, placerPoint,
} from "../atelier-3d/noyau/esquisse/elements_esquisse.js";
import {
  analyserEsquisse, bilanEsquisse, regionsPleines, courbeSous, pointSous, boiteDeLEsquisse,
} from "../atelier-3d/noyau/esquisse/contours_esquisse.js";
import { simplifierTrace } from "../atelier-3d/noyau/esquisse/simplification_trace.js";
import { polygonesDEpaisseur } from "../atelier-3d/noyau/esquisse/epaisseur_de_trait.js";

const presque = (a, b, message, tolerance = 1e-6) =>
  assert.ok(Math.abs(a - b) < tolerance, message + " : " + a + " au lieu de " + b);

const carre = (cote = 10, origine = [0, 0]) => ajouterPolyligne(CONTENU_VIDE, [
  { point: origine },
  { point: [origine[0] + cote, origine[1]] },
  { point: [origine[0] + cote, origine[1] + cote] },
  { point: [origine[0], origine[1] + cote] },
], true).contenu;

test("deux traits qui partagent un bout partagent le meme point", () => {
  let c = ajouterSegment(CONTENU_VIDE, [0, 0], [10, 0]).contenu;
  c = ajouterSegment(c, [10, 0], [10, 10]).contenu;
  assert.equal(Object.keys(c.points).length, 3);
  assert.equal(c.courbes.length, 2);
});

test("un trait de longueur nulle ou en double n'est pas ajoute", () => {
  let c = ajouterSegment(CONTENU_VIDE, [0, 0], [0, 0]).contenu;
  assert.equal(c.courbes.length, 0);
  c = ajouterSegment(CONTENU_VIDE, [0, 0], [5, 0]).contenu;
  c = ajouterSegment(c, [5, 0], [0, 0]).contenu;
  assert.equal(c.courbes.length, 1);
});

test("un carre se reconnait comme contour ferme", () => {
  const { fermes, ouverts } = analyserEsquisse(carre());
  assert.equal(fermes.length, 1);
  assert.equal(ouverts.length, 0);
  assert.equal(fermes[0].length, 4);
  assert.deepEqual(bilanEsquisse(carre()), { vide: false, fermee: true, ouverte: false });
});

test("un tracé non referme reste ouvert", () => {
  const c = ajouterPolyligne(CONTENU_VIDE, [{ point: [0, 0] }, { point: [10, 0] }, { point: [10, 10] }], false).contenu;
  const { fermes, ouverts } = analyserEsquisse(c);
  assert.equal(fermes.length, 0);
  assert.deepEqual(ouverts, [[[0, 0], [10, 0], [10, 10]]]);
});

test("fermer un tracé en lachant un bout sur l'autre le remplit", () => {
  let c = ajouterPolyligne(CONTENU_VIDE, [{ point: [0, 0] }, { point: [10, 0] }, { point: [10, 10] }, { point: [0.2, 0.1] }], false).contenu;
  assert.equal(bilanEsquisse(c).fermee, false);
  const [debut, fin] = [placerPoint(c, [0, 0]).id, placerPoint(c, [0.2, 0.1]).id];
  c = fusionnerPoints(c, debut, fin);
  assert.equal(bilanEsquisse(c).fermee, true);
  assert.equal(Object.keys(c.points).length, 3);
});

test("un carre avec une queue est un trace ouvert, dont rien ne se perd", () => {
  const c = ajouterSegment(carre(), [10, 10], [20, 20]).contenu;
  const { fermes, ouverts } = analyserEsquisse(c);
  assert.equal(fermes.length, 0);
  const longueur = ouverts.reduce((somme, trace) => somme + trace.length - 1, 0);
  assert.equal(longueur, 5, "cinq traits parcourus");
});

test("un cercle est toujours un contour ferme", () => {
  const c = ajouterCercle(CONTENU_VIDE, [5, 5], 3).contenu;
  const { fermes } = analyserEsquisse(c);
  assert.equal(fermes.length, 1);
  for (const p of fermes[0]) presque(Math.hypot(p[0] - 5, p[1] - 5), 3, "rayon");
});

test("un arc passe par ses deux bouts, et la bombe donne le sens", () => {
  const b = bombeParTroisPoints([1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1]);
  presque(b, Math.tan(Math.PI / 8), "quart de tour direct");
  const arc = arcDepuisBombe([1, 0], [0, 1], b);
  presque(arc.centre[0], 0, "centre x");
  presque(arc.centre[1], 0, "centre y");
  presque(arc.rayon, 1, "rayon");
  const inverse = bombeParTroisPoints([1, 0], [-1, 0], [0, 1]);
  assert.ok(inverse < 0, "par l'autre cote, l'arc tourne dans l'autre sens");
  assert.equal(bombeParTroisPoints([0, 0], [1, 1], [2, 2]), null);
});

test("un contour avec un arc suit bien l'arc", () => {
  let c = ajouterSegment(CONTENU_VIDE, [-10, 0], [10, 0]).contenu;
  c = ajouterArc(c, [10, 0], [-10, 0], 1).contenu;   // demi-cercle direct
  const [contour] = analyserEsquisse(c).fermes;
  const haut = Math.max(...contour.map((p) => p[1]));
  presque(haut, 10, "le demi-cercle monte a 10 mm", 1e-6);
});

test("un contour dans un contour est un trou, et dedans encore redevient plein", () => {
  let c = carre(30, [0, 0]);
  c = ajouterPolyligne(c, [{ point: [5, 5] }, { point: [25, 5] }, { point: [25, 25] }, { point: [5, 25] }], true).contenu;
  c = ajouterCercle(c, [15, 15], 3).contenu;
  const regions = regionsPleines(analyserEsquisse(c).fermes);
  assert.equal(regions.length, 2);
  assert.equal(regions[0].trous.length, 1);
  assert.equal(regions[1].trous.length, 0);
});

test("arrondir un coin pose un arc tangent", () => {
  const c = arrondirAngle(carre(20), placerPoint(carre(20), [20, 20]).id, 5);
  assert.equal(c.courbes.filter((x) => x.genre === "arc").length, 1);
  assert.equal(bilanEsquisse(c).fermee, true);
  assert.equal(Object.values(c.points).some((p) => p[0] === 20 && p[1] === 20), false, "le coin a disparu");
  const [contour] = analyserEsquisse(c).fermes;
  // Le point de l'arc le plus proche de l'ancien coin est à 5·(√2 − 1) du carré intérieur.
  const coin = Math.min(...contour.map((p) => Math.hypot(p[0] - 20, p[1] - 20)));
  presque(coin, 5 * Math.SQRT2 - 5, "distance au coin", 0.05);
});

test("arrondir refuse ce qui n'est pas un coin, ou un rayon trop grand", () => {
  const c = carre(10);
  assert.throws(() => arrondirAngle(c, placerPoint(c, [10, 10]).id, 20), /trop grand/);
  const ligne = ajouterPolyligne(CONTENU_VIDE, [{ point: [0, 0] }, { point: [5, 0] }, { point: [10, 0] }], false).contenu;
  assert.throws(() => arrondirAngle(ligne, placerPoint(ligne, [5, 0]).id, 1), /alignés/);
  assert.throws(() => arrondirAngle(ligne, placerPoint(ligne, [0, 0]).id, 1), /deux traits/);
});

test("supprimer un trait retire les points qui ne servent plus", () => {
  const c = ajouterSegment(ajouterSegment(CONTENU_VIDE, [0, 0], [5, 0]).contenu, [5, 0], [5, 5]).contenu;
  const reste = supprimerCourbes(c, [c.courbes[1].id]);
  assert.equal(Object.keys(reste.points).length, 2);
});

test("deplacer un point deplace les deux traits qui le partagent", () => {
  const c = carre(10);
  const id = placerPoint(c, [10, 10]).id;
  const [contour] = analyserEsquisse(deplacerPoint(c, id, [15, 12])).fermes;
  assert.ok(contour.some((p) => p[0] === 15 && p[1] === 12));
});

test("viser : le trait et le point les plus proches", () => {
  const c = carre(10);
  assert.notEqual(courbeSous(c, [5, 0.3], 0.5), null);
  assert.equal(courbeSous(c, [5, 5], 0.5), null);
  assert.equal(pointSous(c, [9.8, 10.1], 0.5), placerPoint(c, [10, 10]).id);
  assert.deepEqual(boiteDeLEsquisse(c), { min: [0, 0], max: [10, 10] });
});

test("le pinceau simplifie une droite en un seul segment", () => {
  const points = Array.from({ length: 50 }, (_, i) => [i, 0.02 * Math.sin(i)]);
  const { sommets, fermee } = simplifierTrace(points, 0.2);
  assert.equal(fermee, false);
  assert.equal(sommets.length, 2);
});

test("le pinceau reconnait un cercle trace a la main et le referme", () => {
  const points = Array.from({ length: 120 }, (_, i) => {
    const a = (i / 119) * Math.PI * 2;
    return [20 * Math.cos(a) + 0.05 * Math.sin(7 * a), 20 * Math.sin(a)];
  });
  const { sommets, fermee } = simplifierTrace(points, 0.3);
  assert.equal(fermee, true);
  assert.ok(sommets.length <= 6, sommets.length + " sommets pour un cercle");
  assert.ok(sommets.some((s) => s.bombe !== 0), "des arcs, pas une poussiere de segments");
  const c = ajouterPolyligne(CONTENU_VIDE, sommets, true).contenu;
  const [contour] = analyserEsquisse(c).fermes;
  for (const p of contour) presque(Math.hypot(...p), 20, "reste sur le cercle", 0.5);
});

test("epaissir un trait donne des morceaux tous dans le sens direct", () => {
  const morceaux = polygonesDEpaisseur([{ points: [[0, 0], [10, 0], [10, 10]], fermee: false }], 2, "centre");
  assert.equal(morceaux.length, 2 + 3, "deux rectangles, trois disques");
  const aire = (p) => p.reduce((s, q, i) => s + (p[(i + p.length - 1) % p.length][0] * q[1] - q[0] * p[(i + p.length - 1) % p.length][1]), 0) / 2;
  assert.ok(morceaux.every((p) => aire(p) > 0));
  const gauche = polygonesDEpaisseur([{ points: [[0, 0], [10, 0]], fermee: false }], 2, "gauche");
  const ys = gauche[0].map((p) => p[1]);
  assert.deepEqual([Math.min(...ys), Math.max(...ys)], [0, 2], "a gauche en suivant le trace : cote Y positif");
});
