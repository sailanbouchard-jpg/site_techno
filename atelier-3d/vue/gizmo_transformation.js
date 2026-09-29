/*
 * vue/gizmo_transformation.js
 * ───────────────────────────
 * Les poignées autour de l'objet sélectionné :
 *   - trois flèches (mode Axe) pour glisser le long de X, Y ou Z ; en Libre,
 *     la seule flèche Z, posée au-dessus de la pièce ;
 *   - trois anneaux pour tourner autour du centre de l'objet, selon SES axes :
 *     ils tournent avec lui, les flèches restent sur les axes du monde ;
 *   - quatre poignées aux coins du dessous pour la largeur et la profondeur,
 *     une au sommet pour la hauteur.
 *
 * Tout garde la même taille à l'écran quel que soit le zoom : une poignée qui
 * devient minuscule quand on s'éloigne est une poignée qu'on ne peut plus saisir.
 * Le gizmo dit ce qu'il y a sous la souris ; il ne déplace rien lui-même.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const LONGUEUR_FLECHE_PX = 70;
// Les anneaux gardent une taille fixe à l'écran : sur une pièce allongée, des
// anneaux à sa mesure couvraient la moitié de la vue.
const RAYON_ANNEAU_PX = 48;
const COTE_POIGNEE_PX = 9;
// Une pièce plus petite que ça à l'écran serait cachée par ses poignées de taille.
const TAILLE_MIN_POUR_POIGNEES_PX = 60;
// En Libre, la flèche Z part au-dessus de la pièce, au-delà de la poignée du
// sommet : un clic sur la pièce pour la glisser ne peut plus l'attraper.
const ECART_FLECHE_LIBRE_PX = 18;

/* devant : dessiné par-dessus tout. Les anneaux aussi : petits et fins, ils
   restent visibles et saisissables même au cœur d'une grande pièce. */
function materiauDeGizmo(couleur, visible = true, devant = true) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(couleur), depthTest: !devant, depthWrite: false, transparent: true, visible,
  });
}

/* Une partie visible et, par-dessus, une forme invisible plus épaisse : c'est
   elle que la souris attrape. Viser un trait de deux pixels est une punition. */
function partie(geometrieVisible, geometrieCible, couleur, description, devant = true) {
  const groupe = new THREE.Group();
  const visible = new THREE.Mesh(geometrieVisible, materiauDeGizmo(couleur, true, devant));
  const cible = new THREE.Mesh(geometrieCible, materiauDeGizmo(couleur, false));
  visible.renderOrder = 10;
  cible.userData.partie = description;
  groupe.add(visible, cible);
  groupe.userData = { visible, couleur, description };
  return groupe;
}

function fleche(axe, couleur) {
  const tige = new THREE.CylinderGeometry(0.018, 0.018, 0.78, 8).translate(0, 0.39, 0);
  const pointe = new THREE.ConeGeometry(0.07, 0.22, 12).translate(0, 0.89, 0);
  const forme = new THREE.BufferGeometry();
  const fusion = [tige, pointe].map((g) => g.toNonIndexed());
  const positions = new Float32Array(fusion[0].attributes.position.count * 3 + fusion[1].attributes.position.count * 3);
  positions.set(fusion[0].attributes.position.array, 0);
  positions.set(fusion[1].attributes.position.array, fusion[0].attributes.position.array.length);
  forme.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const cible = new THREE.CylinderGeometry(0.09, 0.09, 1, 6).translate(0, 0.5, 0);
  const groupe = partie(forme, cible, couleur, { genre: "fleche", axe });
  // Les géométries naissent le long de Y : on les couche sur l'axe voulu.
  if (axe === "x") groupe.rotation.z = -Math.PI / 2;
  if (axe === "z") groupe.rotation.x = Math.PI / 2;
  return groupe;
}

function anneau(axe, couleur) {
  const visible = new THREE.TorusGeometry(1, 0.012, 6, 72);
  const cible = new THREE.TorusGeometry(1, 0.045, 6, 36);
  const groupe = partie(visible, cible, couleur, { genre: "anneau", axe });
  // Un anneau qui tourne autour de X est couché dans le plan YZ.
  if (axe === "x") groupe.rotation.y = Math.PI / 2;
  if (axe === "y") groupe.rotation.x = Math.PI / 2;
  return groupe;
}

function poignee(coin, couleur) {
  return partie(new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1.8, 1.8, 1.8), couleur, { genre: "poignee", coin });
}

export function creerGizmo(scene3d, couleurs) {
  const racine = new THREE.Group();
  racine.name = "gizmo";
  racine.visible = false;
  scene3d.add(racine);

  const fleches = new THREE.Group();
  const anneaux = new THREE.Group();
  const poignees = new THREE.Group();
  racine.add(fleches, anneaux, poignees);

  const couleurAxe = { x: couleurs.axeX, y: couleurs.axeY, z: couleurs.axeZ };
  for (const axe of Object.keys(AXES)) {
    fleches.add(fleche(axe, couleurAxe[axe]));
    anneaux.add(anneau(axe, couleurAxe[axe]));
  }
  const coins = [{ sx: -1, sy: -1 }, { sx: 1, sy: -1 }, { sx: 1, sy: 1 }, { sx: -1, sy: 1 }, "haut"];
  for (const coin of coins) poignees.add(poignee(coin, couleurs.poignee));

  let cible = null;
  let surlignee = null;

  function toutesLesParties() {
    return [...fleches.children, ...anneaux.children, ...poignees.children];
  }

  return {
    /*
     * cible : { maillage3d, ancre, centre, mode } ou null.
     * ancre : où l'objet se tient (sa position) ; centre : celui de sa boîte.
     */
    afficher(nouvelle) {
      cible = nouvelle;
      racine.visible = cible !== null;
      if (cible === null) return;
      // Seul le mode Axe fait tourner : ailleurs, les anneaux gêneraient la
      // saisie de la pièce. En Libre, elle glisse à plat : seule la flèche Z
      // reste, pour changer sa hauteur.
      const libre = cible.mode === "libre";
      fleches.visible = cible.mode === "axe" || libre;
      for (const f of fleches.children) f.visible = !libre || f.userData.description.axe === "z";
      anneaux.visible = cible.mode === "axe";
      poignees.visible = true;
    },

    /* À chaque image : tailles constantes à l'écran, poignées recollées aux
       coins de l'objet (qui a pu bouger pendant un aperçu). */
    ajuster(millimetresParPixel) {
      if (cible === null) return;
      const echelleEcran = millimetresParPixel(cible.centre);

      const boite = cible.maillage3d.geometry.boundingBox;
      cible.maillage3d.updateWorldMatrix(true, false);

      if (cible.mode === "libre") {
        const sommet = boite.clone().applyMatrix4(cible.maillage3d.matrixWorld).max.z;
        fleches.position.set(cible.centre[0], cible.centre[1], sommet + ECART_FLECHE_LIBRE_PX * echelleEcran);
      } else {
        fleches.position.set(...cible.ancre);
      }
      fleches.scale.setScalar(LONGUEUR_FLECHE_PX * echelleEcran);

      // Centre et rayon pris sur la pièce elle-même : ils ne changent pas quand
      // elle tourne. Seule la rotation est reprise, jamais l'échelle, qui
      // écraserait les anneaux en ellipses.
      const centreLocal = boite.getCenter(new THREE.Vector3());
      anneaux.position.copy(cible.maillage3d.localToWorld(centreLocal.clone()));
      anneaux.quaternion.copy(cible.maillage3d.getWorldQuaternion(new THREE.Quaternion()));
      anneaux.scale.setScalar(RAYON_ANNEAU_PX * echelleEcran);
      const diagonale = boite.getSize(new THREE.Vector3()).multiply(cible.maillage3d.scale).length();
      poignees.visible = diagonale / echelleEcran >= TAILLE_MIN_POUR_POIGNEES_PX;

      for (const groupe of poignees.children) {
        const { coin } = groupe.userData.description;
        const local = coin === "haut"
          ? new THREE.Vector3((boite.min.x + boite.max.x) / 2, (boite.min.y + boite.max.y) / 2, boite.max.z)
          : new THREE.Vector3(coin.sx < 0 ? boite.min.x : boite.max.x, coin.sy < 0 ? boite.min.y : boite.max.y, boite.min.z);
        groupe.position.copy(cible.maillage3d.localToWorld(local));
        groupe.scale.setScalar(COTE_POIGNEE_PX * echelleEcran);
        groupe.quaternion.copy(cible.maillage3d.getWorldQuaternion(new THREE.Quaternion()));
      }
    },

    /* Les bouts des flèches et des anneaux affichés, dans la scène : la barre
       d'actions se pose au-delà, pour ne jamais couvrir une flèche. */
    emprise(millimetresParPixel) {
      if (cible === null) return [];
      const echelleEcran = millimetresParPixel(cible.centre);
      const points = [];
      if (fleches.visible) {
        for (const f of fleches.children) {
          if (!f.visible) continue;
          const direction = AXES[f.userData.description.axe];
          const depart = fleches.position.toArray();
          points.push(depart.map((c, i) => c + direction[i] * LONGUEUR_FLECHE_PX * echelleEcran));
        }
      }
      if (anneaux.visible) {
        const rayon = RAYON_ANNEAU_PX * echelleEcran;
        for (const direction of Object.values(AXES)) {
          for (const signe of [-1, 1]) points.push(cible.centre.map((c, i) => c + signe * direction[i] * rayon));
        }
      }
      return points;
    },

    /* La partie du gizmo sous la souris, ou null. Le gizmo passe avant les
       objets : il est dessiné par-dessus, il doit être saisi en premier. */
    partieSous(rayon) {
      if (cible === null) return null;
      const cibles = toutesLesParties().filter((g) => g.visible && g.parent.visible).map((g) => g.children[1]);
      const touche = rayon.intersectObjects(cibles, false)[0];
      // La distance sert à départager un anneau et l'objet qu'il traverse.
      return touche === undefined ? null : { ...touche.object.userData.partie, distance: touche.distance };
    },

    surligner(description) {
      const cle = description === null ? null : description.genre + ":" + (description.axe ?? JSON.stringify(description.coin));
      if (cle === surlignee) return false;
      surlignee = cle;
      for (const groupe of toutesLesParties()) {
        const d = groupe.userData.description;
        const sienne = d.genre + ":" + (d.axe ?? JSON.stringify(d.coin));
        groupe.userData.visible.material.color.set(sienne === cle ? couleurs.survol : groupe.userData.couleur);
      }
      return true;
    },

    visible: () => racine.visible,

    cacherPendant(action) {
      const etait = racine.visible;
      racine.visible = false;
      try {
        return action();
      } finally {
        racine.visible = etait;
      }
    },
  };
}
