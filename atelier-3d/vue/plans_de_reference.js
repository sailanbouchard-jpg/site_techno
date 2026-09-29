/*
 * vue/plans_de_reference.js
 * ─────────────────────────
 * Les trois plans de base, montrés quand on commence une esquisse : l'élève
 * clique celui sur lequel il veut dessiner. Chaque plan prend la couleur de
 * l'axe qui lui est perpendiculaire, comme dans les logiciels de CAO.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { matriceDeLEsquisse } from "../noyau/esquisse/plans_esquisse.js";

const COTE_MM = 100;
const OPACITE = 0.16;
const OPACITE_SURVOL = 0.4;

/* nom → couleur de la normale */
const COULEURS = { XY: "axeZ", XZ: "axeY", YZ: "axeX" };

/* Pose un plan comme le serait une esquisse avec ces réglages (décalage, inclinaison). */
function poser(plan, nom, reglages) {
  const m = matriceDeLEsquisse({ ...reglages, plan: nom });
  plan.matrix.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);
  plan.matrixWorldNeedsUpdate = true;
}

export function creerPlansDeReference(scene3d, couleurs) {
  const groupe = new THREE.Group();
  groupe.name = "plans_de_reference";
  groupe.visible = false;
  scene3d.add(groupe);

  const plans = Object.entries(COULEURS).map(([nom, jeton]) => {
    const couleur = new THREE.Color(couleurs[jeton]);
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(COTE_MM, COTE_MM),
      new THREE.MeshBasicMaterial({ color: couleur, transparent: true, opacity: OPACITE, side: THREE.DoubleSide, depthWrite: false }),
    );
    const bord = new THREE.LineSegments(
      new THREE.EdgesGeometry(surface.geometry),
      new THREE.LineBasicMaterial({ color: couleur }),
    );
    const plan = new THREE.Group();
    plan.add(surface, bord);
    plan.matrixAutoUpdate = false;
    poser(plan, nom, {});
    plan.renderOrder = 8;
    surface.userData.plan = nom;
    groupe.add(plan);
    return { nom, surface, plan };
  });

  let survole = null;

  return {
    afficher(visible) {
      groupe.visible = visible;
      if (!visible) this.surligner(null);
    },

    visible: () => groupe.visible,

    /* reglages : { decalage, inclinaison, pivot } : les plans montrent où
       tomberait l'esquisse, pour qu'on choisisse en voyant. */
    orienter(reglages) {
      for (const { nom, plan } of plans) poser(plan, nom, reglages);
    },

    /* Le plan le plus proche sous le rayon : { nom, distance }, ou null. */
    sous(rayon) {
      if (!groupe.visible) return null;
      const touche = rayon.intersectObjects(plans.map((p) => p.surface), false)[0];
      return touche === undefined ? null : { nom: touche.object.userData.plan, distance: touche.distance };
    },

    /* Rend true si l'affichage a changé. */
    surligner(nom) {
      if (nom === survole) return false;
      survole = nom;
      for (const { nom: sien, surface } of plans) {
        surface.material.opacity = sien === nom ? OPACITE_SURVOL : OPACITE;
      }
      return true;
    },
  };
}
