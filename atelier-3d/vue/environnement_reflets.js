/*
 * vue/environnement_reflets.js
 * ────────────────────────────
 * Ce que reflètent les objets brillants et métalliques : un petit décor
 * fabriqué sur place — un ciel clair, un sol plus sombre, quelques panneaux
 * lumineux pour les reflets nets — converti une fois en carte de reflets.
 * Aucune image à télécharger. Les objets mats ne le voient pas.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const RAYON_DU_DECOR = 10;
// Des panneaux lumineux autour de la scène, comme les boîtes à lumière d'un
// studio photo : un grand au-dessus, et de hautes bandes tout autour, à
// hauteur de pièce. Ce sont elles qui tracent sur un cylindre ou une sphère
// en métal les traits clairs qui en font lire la courbure.
// Les bandes descendent sous l'horizon : vue d'en haut, une pièce reflète
// surtout le sol, qui sans elles serait d'un gris uniforme.
const PANNEAUX = [
  { position: [0, 0, 9], largeur: 7, hauteur: 7 },
  { position: [8, -5, 0], largeur: 1.6, hauteur: 16 },
  { position: [-6, -7, 0], largeur: 1.1, hauteur: 16 },
  { position: [-8, 5, 0], largeur: 2.2, hauteur: 16 },
  { position: [4, 8.5, 0], largeur: 1.1, hauteur: 16 },
];
const FLOU = 0.04;

/* rendu : le WebGLRenderer ; couleurs : { refletHaut, refletBas, refletLumiere }. Rend une texture. */
export function creerEnvironnementDeReflets(rendu, couleurs) {
  const decor = new THREE.Scene();

  // Une sphère vue de l'intérieur, en dégradé du sol (bas) au ciel (haut), Z en haut.
  const sphere = new THREE.SphereGeometry(RAYON_DU_DECOR, 32, 16).rotateX(Math.PI / 2);
  const [haut, bas] = [new THREE.Color(couleurs.refletHaut), new THREE.Color(couleurs.refletBas)];
  const positions = sphere.getAttribute("position");
  const teintes = new Float32Array(positions.count * 3);
  const teinte = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const t = (positions.getZ(i) / RAYON_DU_DECOR + 1) / 2;
    teinte.copy(bas).lerp(haut, Math.sqrt(t)).toArray(teintes, i * 3);
  }
  sphere.setAttribute("color", new THREE.BufferAttribute(teintes, 3));
  decor.add(new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  const lumiere = new THREE.MeshBasicMaterial({ color: new THREE.Color(couleurs.refletLumiere), side: THREE.DoubleSide });
  for (const { position, largeur, hauteur } of PANNEAUX) {
    const panneau = new THREE.Mesh(new THREE.PlaneGeometry(largeur, hauteur), lumiere);
    panneau.position.set(...position);
    // Debout (Z en haut) et tourné vers le centre de la scène.
    panneau.up.set(0, 0, 1);
    panneau.lookAt(0, 0, position[2] > 6 ? 0 : position[2]);
    decor.add(panneau);
  }

  const generateur = new THREE.PMREMGenerator(rendu);
  const carte = generateur.fromScene(decor, FLOU).texture;
  generateur.dispose();
  decor.traverse((objet) => {
    objet.geometry?.dispose();
    objet.material?.dispose();
  });
  return carte;
}
