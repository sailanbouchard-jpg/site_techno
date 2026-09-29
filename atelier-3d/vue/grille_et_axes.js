/*
 * vue/grille_et_axes.js
 * ─────────────────────
 * Le sol et les trois axes. Deux grilles superposées : une au centimètre,
 * toujours là, et une au millimètre qui n'apparaît qu'une fois la caméra assez
 * près. Sans ce seuil, la grille fine se transforme en aplat gris dès qu'on
 * s'éloigne, et le sol devient illisible.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const COTE_DU_SOL_MM = 400;
const PAS_GROS_MM = 10;
const PAS_FIN_MM = 1;

// En dessous de cette distance de caméra, le millimètre devient lisible.
const DISTANCE_GRILLE_FINE_MM = 80;

function grille(pas, couleur, opacite) {
  const divisions = COTE_DU_SOL_MM / pas;
  const objet = new THREE.GridHelper(COTE_DU_SOL_MM, divisions, couleur, couleur);

  // GridHelper naît dans le plan XZ (three.js est en Y-haut) : on la couche
  // dans le plan XY, qui est le sol de ce logiciel.
  objet.rotation.x = Math.PI / 2;
  objet.material.transparent = true;
  objet.material.opacity = opacite;
  objet.material.depthWrite = false;
  return objet;
}

/* Les trois axes, chacun dans sa couleur habituelle : X rouge, Y vert, Z
   bleu. C'est la convention de tous les logiciels de CAO, et les élèves la
   retrouveront ailleurs. Des tubes plutôt que des lignes (WebGL dessine les
   lignes sur un pixel) : leur épaisseur suit le zoom pour rester la même à
   l'écran. Le côté positif est franc, le côté négatif plus pâle. */
const DEMI_LONGUEUR_AXE_MM = COTE_DU_SOL_MM / 2;
const EPAISSEUR_PAR_MM_DE_RECUL = 0.0022;
const OPACITE_COTE_NEGATIF = 0.4;
const TOURNER_VERS = {
  x: new THREE.Euler(0, 0, -Math.PI / 2),
  y: new THREE.Euler(0, 0, 0),
  z: new THREE.Euler(Math.PI / 2, 0, 0),
};

function demiAxe(couleur, axe, sens) {
  // Un cylindre three.js est dressé le long de Y, centré : on le décale d'une demi-longueur.
  const forme = new THREE.CylinderGeometry(1, 1, DEMI_LONGUEUR_AXE_MM, 8, 1, true);
  forme.translate(0, (sens * DEMI_LONGUEUR_AXE_MM) / 2, 0);
  const matiere = new THREE.MeshBasicMaterial({
    color: new THREE.Color(couleur),
    transparent: sens < 0,
    opacity: sens < 0 ? OPACITE_COTE_NEGATIF : 1,
    depthWrite: sens > 0,
  });
  const tube = new THREE.Mesh(forme, matiere);
  tube.rotation.copy(TOURNER_VERS[axe]);
  tube.renderOrder = 1;
  return tube;
}

function axes(couleurs) {
  const groupe = new THREE.Group();
  const tubes = [];
  for (const [axe, couleur] of [["x", couleurs.axeX], ["y", couleurs.axeY], ["z", couleurs.axeZ]]) {
    for (const sens of [1, -1]) {
      const tube = demiAxe(couleur, axe, sens);
      tubes.push(tube);
      groupe.add(tube);
    }
  }
  return {
    objet: groupe,
    epaissir(rayon) {
      // Le tube est couché par sa rotation : son épaisseur est sur ses X et Z propres.
      for (const tube of tubes) tube.scale.set(rayon, 1, rayon);
    },
  };
}

export function creerGrilleEtAxes(couleurs) {
  const groupe = new THREE.Group();
  groupe.name = "grille_et_axes";

  const grosse = grille(PAS_GROS_MM, couleurs.grilleGrosse, 0.75);
  const fine = grille(PAS_FIN_MM, couleurs.grilleFine, 0.35);
  fine.visible = false;

  const lesAxes = axes(couleurs);
  groupe.add(fine, grosse, lesAxes.objet);

  return {
    objet: groupe,

    /* Appelé à chaque image : le seuil se règle sur la distance de la caméra,
       pas sur un niveau de zoom abstrait. */
    ajusterAuZoom(distanceCamera) {
      fine.visible = distanceCamera < DISTANCE_GRILLE_FINE_MM;
      lesAxes.epaissir(distanceCamera * EPAISSEUR_PAR_MM_DE_RECUL);
    },
  };
}
