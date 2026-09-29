/*
 * vue/cube_de_vue.js
 * ──────────────────
 * Le cube d'orientation, dans le coin de la vue : il tourne avec la caméra,
 * et chaque face porte le nom de la vue qu'elle donne. Un clic sur « Dessus »
 * regarde la pièce de dessus. C'est plus parlant que huit boutons.
 *
 * Il a son propre petit canvas : il ne dépend pas de la scène principale.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const TAILLE_TEXTURE_PX = 128;
const RECUL = 4;
const DEMI_CHAMP = 1.05;

// Le cube est construit à la façon de three.js (Y en haut), puis couché d'un
// quart de tour : ses faces locales +Y et +Z deviennent le dessus et la face
// avant du monde, et chaque texte se lit à l'endroit. Ordre des faces d'un
// BoxGeometry : +X, −X, +Y, −Y, +Z, −Z (repère local).
const FACES = [
  { vue: "droite", texte: "Droite" },
  { vue: "gauche", texte: "Gauche" },
  { vue: "dessus", texte: "Dessus" },
  { vue: "dessous", texte: "Dessous" },
  { vue: "face", texte: "Face" },
  { vue: "dos", texte: "Dos" },
];

function textureDeFace(texte, couleurs, survolee) {
  const canvas = document.createElement("canvas");
  canvas.width = TAILLE_TEXTURE_PX;
  canvas.height = TAILLE_TEXTURE_PX;
  const c = canvas.getContext("2d");
  c.fillStyle = survolee ? couleurs.cubeSurvol : couleurs.cubeFond;
  c.fillRect(0, 0, TAILLE_TEXTURE_PX, TAILLE_TEXTURE_PX);
  c.strokeStyle = couleurs.cubeBord;
  c.lineWidth = 6;
  c.strokeRect(3, 3, TAILLE_TEXTURE_PX - 6, TAILLE_TEXTURE_PX - 6);
  c.fillStyle = couleurs.cubeTexte;
  c.font = "600 26px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(texte, TAILLE_TEXTURE_PX / 2, TAILLE_TEXTURE_PX / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/*
 * canvas : le petit canvas du cube ; controleur : celui de la caméra
 * principale ; surChoix(nomDeVue) : appelé au clic sur une face.
 */
export function creerCubeDeVue(canvas, couleurs, controleur, surChoix) {
  const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  rendu.setClearColor(0x000000, 0);
  rendu.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-DEMI_CHAMP, DEMI_CHAMP, DEMI_CHAMP, -DEMI_CHAMP, 0.1, 10);
  camera.up.set(0, 0, 1);

  const materiaux = FACES.map((face) => new THREE.MeshBasicMaterial({ map: textureDeFace(face.texte, couleurs, false) }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), materiaux);
  cube.rotation.x = Math.PI / 2;
  scene.add(cube);

  const rayon = new THREE.Raycaster();
  let survolee = -1;

  function dessiner() {
    const { azimut, elevation } = controleur.orientation();
    const c = Math.cos(elevation);
    camera.position.set(RECUL * c * Math.cos(azimut), RECUL * c * Math.sin(azimut), RECUL * Math.sin(elevation));
    camera.lookAt(0, 0, 0);
    rendu.render(scene, camera);
  }

  function redimensionner() {
    const { clientWidth: l, clientHeight: h } = canvas;
    if (l === 0 || h === 0) return;
    rendu.setSize(l, h, false);
    dessiner();
  }

  function faceSous(evenement) {
    const cadre = canvas.getBoundingClientRect();
    const pointeur = new THREE.Vector2(
      ((evenement.clientX - cadre.left) / cadre.width) * 2 - 1,
      -((evenement.clientY - cadre.top) / cadre.height) * 2 + 1,
    );
    rayon.setFromCamera(pointeur, camera);
    const touche = rayon.intersectObject(cube, false)[0];
    return touche === undefined ? -1 : touche.face.materialIndex;
  }

  function surligner(indice) {
    if (indice === survolee) return;
    for (const i of [survolee, indice]) {
      if (i < 0) continue;
      materiaux[i].map.dispose();
      materiaux[i].map = textureDeFace(FACES[i].texte, couleurs, i === indice);
      materiaux[i].needsUpdate = true;
    }
    survolee = indice;
    canvas.style.cursor = indice < 0 ? "" : "pointer";
    dessiner();
  }

  canvas.addEventListener("pointermove", (evenement) => surligner(faceSous(evenement)));
  canvas.addEventListener("pointerleave", () => surligner(-1));
  canvas.addEventListener("click", (evenement) => {
    const indice = faceSous(evenement);
    if (indice >= 0) surChoix(FACES[indice].vue);
  });

  controleur.surChangement(dessiner);
  new ResizeObserver(redimensionner).observe(canvas);
  redimensionner();

  return { dessiner };
}
