import test from "node:test";
import assert from "node:assert/strict";

import { CONTENU_VIDE, ajouterSegment, ajouterCercle, placerPoint } from "../atelier-3d/noyau/esquisse/elements_esquisse.js";
import { accrocher, sourcesDAccrochage } from "../atelier-3d/outils/esquisse/accrochages.js";
import { creerSaisie } from "../atelier-3d/outils/esquisse/saisie_au_clavier.js";

const contenu = ajouterCercle(ajouterSegment(CONTENU_VIDE, [0, 0], [20, 0]).contenu, [50, 0], 10).contenu;
const sources = sourcesDAccrochage(contenu, new Float32Array([100, -10, 100, 10]));
const options = { tolerance: 1, pasGrille: 1 };

test("une extremite l'emporte sur tout le reste, avec son identifiant", () => {
  const r = accrocher([19.6, 0.3], sources, options);
  assert.equal(r.genre, "extremite");
  assert.deepEqual(r.uv, [20, 0]);
  assert.equal(r.idPoint, placerPoint(contenu, [20, 0]).id);
});

test("le centre d'un cercle et le milieu d'un segment accrochent", () => {
  assert.equal(accrocher([50.4, 0.2], sources, options).genre, "centre");
  const milieu = accrocher([10.3, -0.4], sources, options);
  assert.equal(milieu.genre, "milieu");
  assert.deepEqual(milieu.uv, [10, 0]);
});

test("la tangente depuis le point precedent touche le cercle sans le couper", () => {
  const depuis = [50, 30];
  const r = accrocher([59.3, 3.6], sources, { ...options, depuis });
  assert.equal(r.genre, "tangente");
  const [x, y] = r.uv;
  assert.ok(Math.abs(Math.hypot(x - 50, y) - 10) < 1e-9, "sur le cercle");
  // Rayon et direction de la tangente sont perpendiculaires.
  assert.ok(Math.abs((x - 50) * (x - depuis[0]) + y * (y - depuis[1])) < 1e-9);
});

test("alignement sur un point existant, avec son trait d'aide", () => {
  const r = accrocher([20.4, 7.3], sources, options);
  assert.equal(r.genre, "alignement");
  assert.deepEqual(r.uv, [20, 7]);
  assert.equal(r.guides.length, 1);
});

test("la silhouette d'un solide accroche sommets et aretes", () => {
  assert.equal(accrocher([100.3, 9.8], sources, options).genre, "silhouette");
  const bord = accrocher([100.4, 3.3], sources, options);
  assert.equal(bord.genre, "silhouette");
  assert.equal(bord.uv[0], 100);
  assert.ok(Math.abs(bord.uv[1] - 3.3) < 1e-9);
});

test("loin de tout, la grille ; sans grille, le point libre ; le point deplace s'ignore", () => {
  assert.deepEqual(accrocher([33.4, 21.7], sources, options), { uv: [33, 22], genre: "grille", idPoint: null, guides: [] });
  assert.equal(accrocher([33.4, 21.7], sources, { tolerance: 1, pasGrille: 0 }).genre, "libre");
  const id = placerPoint(contenu, [20, 0]).id;
  assert.notEqual(accrocher([19.8, 0.1], sources, { ...options, exclus: id }).idPoint, id);
});

test("la saisie au clavier : chiffres, virgule, Tab, Entree, Echap", () => {
  const saisie = creerSaisie([{ cle: "longueur", etiquette: "Longueur", unite: "mm" }, { cle: "angle", etiquette: "Angle", unite: "°" }]);
  const touche = (key) => saisie.touche({ key });
  assert.equal(saisie.active(), false);
  for (const k of "12,5") assert.equal(touche(k), "pris");
  assert.equal(saisie.valeur("longueur"), 12.5);
  assert.equal(touche("Tab"), "pris");
  for (const k of "-30") touche(k);
  assert.equal(saisie.valeur("angle"), -30);
  assert.match(saisie.texte({ longueur: 0, angle: 0 }), /Longueur = 12,5 mm · Angle = -30▌/);
  assert.equal(touche("Enter"), "valider");
  assert.equal(touche("Escape"), "pris");
  assert.equal(saisie.active(), false);
  assert.equal(touche("Escape"), null, "sans saisie, Echap revient a l'outil");
  assert.equal(saisie.touche({ key: "z", ctrlKey: true }), null);
});
