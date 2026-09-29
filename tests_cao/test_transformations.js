import test from "node:test";
import assert from "node:assert/strict";

import {
  matriceDeTransformation, composer, inverser, decomposer, appliquerAuPoint,
  tournerAutourDUnAxe, rotationVersNormale, tournerAutourDUnPoint, orientationSurNormale, axeDeLObjet,
} from "../atelier-3d/noyau/transformations.js";
import { Euler, Matrix4 } from "../atelier-3d/vendor/three-0.186.0/three.module.js";
import { placer } from "../atelier-3d/vue/objets_de_la_scene.js";

const T = (position, rotation = { x: 0, y: 0, z: 0 }, echelle = { x: 1, y: 1, z: 1 }) =>
  ({ position, rotation, echelle });

function presque(a, b, message, tolerance = 1e-6) {
  assert.ok(Math.abs(a - b) < tolerance, message + " : " + a + " au lieu de " + b);
}

function memePoint(p, q, message) {
  for (let i = 0; i < 3; i += 1) presque(p[i], q[i], message + " [" + i + "]", 1e-6);
}

test("une translation seule deplace un point", () => {
  const m = matriceDeTransformation(T({ x: 10, y: -2, z: 5 }));
  assert.deepEqual(appliquerAuPoint(m, [1, 1, 1]), [11, -1, 6]);
});

test("l'ordre est echelle, puis rotation X, Y, Z, puis translation", () => {
  // Un point sur X, etire x2, tourne de 90 degres autour de Z : il part sur Y.
  const m = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 90 }, { x: 2, y: 1, z: 1 }));
  memePoint(appliquerAuPoint(m, [1, 0, 0]), [0, 2, 0], "etire puis tourne");

  // X d'abord puis Z : un point sur Y monte sur Z (rotation X), puis Z ne bouge plus.
  const xz = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, { x: 90, y: 0, z: 90 }));
  memePoint(appliquerAuPoint(xz, [0, 1, 0]), [0, 0, 1], "X puis Z");
});

test("decomposer une matrice rend la transformation d'origine", () => {
  const cas = [
    T({ x: 1, y: 2, z: 3 }),
    T({ x: -5, y: 0, z: 12 }, { x: 30, y: 0, z: 0 }),
    T({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, { x: 2, y: 3, z: 4 }),
    T({ x: 7, y: -7, z: 0 }, { x: -45, y: 60, z: 170 }, { x: 0.5, y: 0.5, z: 8 }),
  ];
  for (const t of cas) {
    const d = decomposer(matriceDeTransformation(t));
    for (const cle of ["position", "rotation", "echelle"]) {
      for (const axe of ["x", "y", "z"]) presque(d[cle][axe], t[cle][axe], cle + "." + axe);
    }
  }
});

test("au blocage de cardan (Y = 90), l'orientation reste juste meme si les angles changent", () => {
  const t = T({ x: 0, y: 0, z: 0 }, { x: 25, y: 90, z: 0 });
  const d = decomposer(matriceDeTransformation(t));
  const avant = matriceDeTransformation(t);
  const apres = matriceDeTransformation(d);
  for (let i = 0; i < 12; i += 1) presque(apres[i], avant[i], "coefficient " + i);
});

test("composer puis inverser revient au point de depart", () => {
  const a = matriceDeTransformation(T({ x: 3, y: 4, z: 5 }, { x: 10, y: -20, z: 30 }, { x: 2, y: 2, z: 2 }));
  const inverse = inverser(a);
  memePoint(appliquerAuPoint(composer(inverse, a), [7, -1, 2]), [7, -1, 2], "inverse · a");
  memePoint(appliquerAuPoint(composer(a, inverse), [7, -1, 2]), [7, -1, 2], "a · inverse");
});

test("une echelle nulle ne s'inverse pas, et le dit", () => {
  assert.equal(inverser(matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, undefined, { x: 0, y: 1, z: 1 }))), null);
});

test("un cisaillement est refuse au lieu d'etre arrondi en silence", () => {
  // Un groupe etire en X contenant un objet tourne de 45 degres : pas de
  // position / rotation / echelle qui decrive le resultat.
  const groupe = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, undefined, { x: 3, y: 1, z: 1 }));
  const enfant = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 45 }));
  assert.equal(decomposer(composer(groupe, enfant)), null);

  // Etire uniformement, en revanche, tout va bien.
  const uniforme = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, undefined, { x: 3, y: 3, z: 3 }));
  assert.notEqual(decomposer(composer(uniforme, enfant)), null);
});

test("une symetrie se range dans l'echelle en X", () => {
  const miroir = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const d = decomposer(miroir);
  presque(d.echelle.x, -1, "echelle x");
  memePoint(appliquerAuPoint(matriceDeTransformation(d), [2, 3, 4]), [-2, 3, 4], "miroir");
});

test("les valeurs sortent propres : 30 et non 29.999999999", () => {
  const d = decomposer(matriceDeTransformation(T({ x: 0.1 + 0.2, y: 0, z: 0 }, { x: 0, y: 0, z: 30 })));
  assert.equal(d.rotation.z, 30);
  assert.equal(d.position.x, 0.3);
});

test("la vue place les objets avec le meme ordre de rotation que le noyau", () => {
  // Sans cela, deux rotations combinees montrent une autre piece que celle exportee.
  const rotation = { x: 30, y: 40, z: 50 };
  const objet = { position: { set() {} }, scale: { set() {} }, rotation: new Euler() };
  placer(objet, T({ x: 0, y: 0, z: 0 }, rotation));
  const vue = new Matrix4().makeRotationFromEuler(objet.rotation).elements;
  const noyau = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, rotation));
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) presque(vue[j * 4 + i], noyau[i * 4 + j], "case " + i + "," + j);
  }
});

test("tourner autour d'un axe de l'objet suit l'objet deja tourne", () => {
  const depart = T({ x: 5, y: 0, z: 0 }, { x: 90, y: 0, z: 0 });
  const tourne = tournerAutourDUnAxe(depart, "z", 90);
  assert.deepEqual(tourne.position, depart.position, "la position ne bouge pas");

  // Couche par la rotation X, le Z de l'objet regarde vers -Y : c'est autour de lui qu'on tourne.
  const m = matriceDeTransformation({ ...tourne, position: { x: 0, y: 0, z: 0 } });
  memePoint(appliquerAuPoint(m, [0, 0, 1]), [0, -1, 0], "l'axe de rotation ne bouge pas");
  memePoint(appliquerAuPoint(m, [1, 0, 0]), [0, 0, 1], "X local");
  memePoint(appliquerAuPoint(m, [0, 1, 0]), [-1, 0, 0], "Y local");
});

test("sur un objet droit, tourner autour de son axe revient a ajouter l'angle", () => {
  for (const axe of ["x", "y", "z"]) {
    const tourne = tournerAutourDUnAxe(T({ x: 0, y: 0, z: 0 }), axe, 35);
    presque(tourne.rotation[axe], 35, "axe " + axe);
  }
  presque(tournerAutourDUnAxe(T({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }), "x", 15).rotation.x, 35, "X sur X");
});

test("l'axe de l'objet est la colonne de sa rotation", () => {
  memePoint(axeDeLObjet({ x: 90, y: 0, z: 0 }, "z"), [0, -1, 0], "Z couche");
  memePoint(axeDeLObjet({ x: 0, y: 0, z: 90 }, "x"), [0, 1, 0], "X pivote");
});

test("tourner une piece couchee autour de son centre garde ce centre en place", () => {
  const depart = T({ x: 3, y: -7, z: 4 }, { x: 25, y: -40, z: 70 }, { x: 30, y: 10, z: 6 });
  const avant = appliquerAuPoint(matriceDeTransformation(depart), [0, 0, 0.5]);
  for (const axe of ["x", "y", "z"]) {
    const tourne = tournerAutourDUnPoint(depart, axe, 60, avant);
    memePoint(appliquerAuPoint(matriceDeTransformation(tourne), [0, 0, 0.5]), avant, "centre, axe " + axe);
    assert.deepEqual(tourne.echelle, depart.echelle, "l'echelle ne change pas");
    const axeAvant = axeDeLObjet(depart.rotation, axe);
    memePoint(axeDeLObjet(tourne.rotation, axe), axeAvant, "l'axe " + axe + " reste en place");
  }
});

test("la rotation vers une normale couche l'objet sur la face touchee", () => {
  const cas = [
    [0, 0, 1],
    [1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
    [0.3, -0.4, 0.866],
    [-1, 1, 0],
  ];
  for (const normale of cas) {
    const rotation = rotationVersNormale(normale);
    const m = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, rotation));
    const norme = Math.hypot(...normale);
    memePoint(appliquerAuPoint(m, [0, 0, 1]), normale.map((v) => v / norme), "normale " + normale.join(","));
  }
});

test("posee sur une face horizontale, la piece ne tourne pas", () => {
  assert.deepEqual(rotationVersNormale([0, 0, 5]), { x: 0, y: 0, z: 0 });
});

test("tourner autour du centre de la boite garde ce centre en place", () => {
  // Un pave de 20 mm pose au sol : son centre est a 10 mm de haut.
  const depart = T({ x: 5, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 20 });
  const centre = [5, 5, 10];
  const tourne = tournerAutourDUnPoint(depart, "x", 90, centre);

  // Le centre local (0, 0, 0,5) doit rester au meme endroit du monde.
  const m = matriceDeTransformation(tourne);
  memePoint(appliquerAuPoint(m, [0, 0, 0.5]), centre, "centre");
  presque(tourne.rotation.x, 90, "rotation");
});

test("tourner autour de Z depuis le centre ne deplace pas un objet droit", () => {
  const depart = T({ x: 12, y: -4, z: 0 }, { x: 0, y: 0, z: 10 }, { x: 30, y: 10, z: 5 });
  const tourne = tournerAutourDUnPoint(depart, "z", 45, [12, -4, 2.5]);
  memePoint([tourne.position.x, tourne.position.y, tourne.position.z], [12, -4, 0], "position");
  presque(tourne.rotation.z, 55, "rotation");
});

test("poser au sol garde le pivotement propre d'un objet droit", () => {
  assert.deepEqual(orientationSurNormale([0, 0, 1], { x: 0, y: 0, z: 30 }), { x: 0, y: 0, z: 30 });
});

test("poser sur un flanc couche l'objet, pivot compris", () => {
  const rotation = orientationSurNormale([1, 0, 0], { x: 0, y: 0, z: 30 });
  const m = matriceDeTransformation(T({ x: 0, y: 0, z: 0 }, rotation));
  memePoint(appliquerAuPoint(m, [0, 0, 1]), [1, 0, 0], "le dessus regarde vers la normale");
});

test("un objet deja couche se repose proprement, sans pivot parasite", () => {
  const rotation = orientationSurNormale([0, 0, 1], { x: 90, y: 0, z: 30 });
  assert.deepEqual(rotation, { x: 0, y: 0, z: 0 });
});
