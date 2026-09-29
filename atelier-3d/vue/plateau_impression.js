/*
 * vue/plateau_impression.js
 * ─────────────────────────
 * Le plateau de l'imprimante dans l'onglet Impression : la plaque à l'échelle,
 * sa grille, le contour du volume imprimable, et les boîtes des pièces à
 * signaler (hors du volume, qui se chevauchent). Centré sur l'origine du monde.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const EPAISSEUR_PLAQUE_MM = 2;
const PAS_GRILLE_MM = 10;
// Au-dessus de la plaque, pour que la grille ne scintille pas avec elle.
const DECOLLEMENT_MM = 0.05;

function segments(points, couleur, opacite = 1) {
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometrie, new THREE.LineBasicMaterial({
    color: new THREE.Color(couleur), transparent: opacite < 1, opacity: opacite,
  }));
}

/* Les douze arêtes d'une boîte. */
function aretesDeBoite([x0, y0, z0], [x1, y1, z1]) {
  const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const points = [];
  for (let i = 0; i < 4; i += 1) {
    const [a, b] = [c[i], c[(i + 1) % 4]];
    points.push(a[0], a[1], z0, b[0], b[1], z0, a[0], a[1], z1, b[0], b[1], z1, a[0], a[1], z0, a[0], a[1], z1);
  }
  return points;
}

function vider(groupe) {
  for (const enfant of [...groupe.children]) {
    groupe.remove(enfant);
    enfant.geometry?.dispose();
    enfant.material?.dispose();
  }
}

export function creerPlateauImpression(scene3d, couleurs) {
  const groupe = new THREE.Group();
  groupe.name = "plateau_impression";
  groupe.visible = false;
  const decor = new THREE.Group();
  const alertes = new THREE.Group();
  groupe.add(decor, alertes);
  scene3d.add(groupe);
  let machineAffichee = null;

  function construire(machine) {
    vider(decor);
    const [l, p, h] = [machine.largeur, machine.profondeur, machine.hauteur];
    const [x0, y0] = [-l / 2, -p / 2];

    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(l, p, EPAISSEUR_PLAQUE_MM),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(couleurs.plateau) }),
    );
    plaque.position.z = -EPAISSEUR_PLAQUE_MM / 2;
    decor.add(plaque);

    const grille = [];
    for (let x = PAS_GRILLE_MM; x < l; x += PAS_GRILLE_MM) grille.push(x0 + x, y0, DECOLLEMENT_MM, x0 + x, y0 + p, DECOLLEMENT_MM);
    for (let y = PAS_GRILLE_MM; y < p; y += PAS_GRILLE_MM) grille.push(x0, y0 + y, DECOLLEMENT_MM, x0 + l, y0 + y, DECOLLEMENT_MM);
    decor.add(segments(grille, couleurs.plateauGrille));

    decor.add(segments(aretesDeBoite([x0, y0, DECOLLEMENT_MM], [x0 + l, y0 + p, h]), couleurs.volumeImprimable, 0.6));

    // L'origine de la machine, coin avant gauche : deux traits le long des bords.
    const repere = Math.min(l, p) / 8;
    decor.add(segments([x0, y0, DECOLLEMENT_MM, x0 + repere, y0, DECOLLEMENT_MM], couleurs.axeX));
    decor.add(segments([x0, y0, DECOLLEMENT_MM, x0, y0 + repere, DECOLLEMENT_MM], couleurs.axeY));
    machineAffichee = machine;
  }

  return {
    objet: groupe,

    /* machine : { largeur, profondeur, hauteur }, ou null pour cacher le plateau. */
    afficher(machine) {
      groupe.visible = machine !== null;
      if (machine !== null && machine !== machineAffichee) construire(machine);
    },

    /* boites : [{ min, max }] dans le repère du monde. */
    signaler(boites) {
      vider(alertes);
      if (boites.length === 0) return;
      alertes.add(segments(boites.flatMap((b) => aretesDeBoite(b.min, b.max)), couleurs.alertePlateau));
    },

    visible: () => groupe.visible,

    /* La boîte du volume imprimable, pour cadrer la vue dessus. */
    boite() {
      const m = machineAffichee;
      if (m === null) return null;
      return new THREE.Box3(new THREE.Vector3(-m.largeur / 2, -m.profondeur / 2, 0), new THREE.Vector3(m.largeur / 2, m.profondeur / 2, m.hauteur / 3));
    },
  };
}
