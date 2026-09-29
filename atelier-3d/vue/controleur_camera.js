/*
 * vue/controleur_camera.js
 * ────────────────────────
 * Caméra en orbite autour d'un point visé, axe Z vertical. Écrit à la main
 * plutôt que repris d'OrbitControls : il faut ici des vues normalisées qui
 * tombent juste, et une orbite qu'on peut verrouiller pendant une esquisse.
 * La caméra passe librement sous le sol (Z < 0) : on regarde un objet par en
 * dessous comme par au-dessus.
 *
 * Le clic gauche appartient d'abord aux outils. La caméra prend :
 *   - clic droit, ou barre d'espace + clic gauche : tourner ;
 *   - clic gauche dans le vide, clic du milieu, ou Maj + clic droit : glisser ;
 *   - molette : zoomer vers ce qui est sous la souris.
 * Le vide, seul l'outil ou l'opération le reconnaît : quand un appui gauche
 * ne touche rien avec quoi interagir, il le confie à translaterDepuis().
 * Quand la caméra prend un geste, elle l'arrête : l'outil ne le voit jamais.
 *
 * Deux projections. Une vue de référence (Dessus, Face…) et une esquisse se
 * regardent à plat, sans perspective : tout est plaqué sur le plan, les
 * cotes se lisent. Dès qu'on tourne la caméra à la souris, la perspective
 * revient. La caméra orthographique cadre exactement ce que cadrerait la
 * perspective à la même distance : on passe de l'une à l'autre sans saut.
 *
 * Pendant une esquisse, l'orbite est verrouillée : le clic droit fait glisser
 * la vue, qui reste à plat, face au plan.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const ELEVATION_LIMITE = THREE.MathUtils.degToRad(88);
// En dessous, un appui gauche dans le vide suivi d'un relâché est un clic, pas un glisser.
const SEUIL_DE_GLISSER_PX = 4;
// Les vues normalisées vont un rien plus loin que l'orbite à la souris.
const ELEVATION_LIMITE_VUE = THREE.MathUtils.degToRad(89.9);
const DISTANCE_MINIMALE_MM = 5;
const DISTANCE_MAXIMALE_MM = 3000;
const SENSIBILITE_ORBITE = 0.006;
const SENSIBILITE_ZOOM = 0.0015;
const BOUTON_GAUCHE = 0;
const BOUTON_MILIEU = 1;
const BOUTON_DROIT = 2;
// La caméra à plat se tient loin derrière la cible : rien ne passe derrière elle.
const RECUL_ORTHOGRAPHIQUE_MM = 4000;
// Part de l'écran qu'occupe ce qu'on cadre : le reste est une marge.
const REMPLISSAGE_DU_CADRE = 0.8;
const DISTANCE_DE_DEPART_MM = 120;
// Au-delà de cette part de l'écran (en coordonnées normalisées), une pièce est jugée hors de vue.
const MARGE_ECRAN = 0.95;

// Azimut mesuré depuis l'axe X, élévation depuis le sol, en degrés.
export const VUES = {
  iso: { azimut: -50, elevation: 30, etiquette: "Isométrique" },
  dessus: { azimut: -90, elevation: 89.9, etiquette: "Dessus", aPlat: true },
  dessous: { azimut: -90, elevation: -89.9, etiquette: "Dessous", aPlat: true },
  face: { azimut: -90, elevation: 0, etiquette: "Face", aPlat: true },
  dos: { azimut: 90, elevation: 0, etiquette: "Dos", aPlat: true },
  gauche: { azimut: 180, elevation: 0, etiquette: "Gauche", aPlat: true },
  droite: { azimut: 0, elevation: 0, etiquette: "Droite", aPlat: true },
};

function champDeSaisie(cible) {
  return cible instanceof HTMLElement && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName));
}

/* pointVise(x, y) : facultatif, rend le point du monde sous la souris ; la
   molette zoome alors vers lui plutôt que vers le centre de l'écran. */
export function creerControleurCamera(camera, canvas, pointVise = () => null) {
  const cible = new THREE.Vector3(0, 0, 10);
  let distance = DISTANCE_DE_DEPART_MM;
  let azimut = THREE.MathUtils.degToRad(VUES.iso.azimut);
  let elevation = THREE.MathUtils.degToRad(VUES.iso.elevation);

  const aPlat = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, RECUL_ORTHOGRAPHIQUE_MM * 2);
  let projection = "perspective";   // "perspective" | "orthographique"
  let geste = null;          // "orbite" | "translation" | null
  let clic = null;           // { x, y, surClic } : un appui dans le vide qui n'a pas encore bougé
  let dernier = { x: 0, y: 0 };
  let espaceEnfoncee = false;
  let orbiteVerrouillee = false;
  const abonnes = [];

  const active = () => (projection === "orthographique" ? aPlat : camera);

  function appliquer() {
    const cosinus = Math.cos(elevation);
    const direction = new THREE.Vector3(cosinus * Math.cos(azimut), cosinus * Math.sin(azimut), Math.sin(elevation));
    for (const [appareil, recul] of [[camera, distance], [aPlat, RECUL_ORTHOGRAPHIQUE_MM]]) {
      appareil.position.copy(cible).addScaledVector(direction, recul);
      appareil.up.set(0, 0, 1);
      appareil.lookAt(cible);
    }
    const demiHauteur = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    aPlat.top = demiHauteur;
    aPlat.bottom = -demiHauteur;
    aPlat.left = -demiHauteur * camera.aspect;
    aPlat.right = demiHauteur * camera.aspect;
    aPlat.updateProjectionMatrix();
    camera.updateMatrixWorld();
    aPlat.updateMatrixWorld();
    for (const abonne of abonnes) abonne();
  }

  function surAppui(evenement) {
    if (evenement.button === BOUTON_DROIT && (evenement.shiftKey || orbiteVerrouillee)) geste = "translation";
    else if (evenement.button === BOUTON_DROIT) geste = "orbite";
    else if (evenement.button === BOUTON_MILIEU) geste = "translation";
    else if (evenement.button === BOUTON_GAUCHE && espaceEnfoncee) geste = orbiteVerrouillee ? "translation" : "orbite";
    else return;

    evenement.preventDefault();
    evenement.stopImmediatePropagation();
    dernier = { x: evenement.clientX, y: evenement.clientY };
    canvas.setPointerCapture(evenement.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function surDeplacement(evenement) {
    if (geste === null) return;
    evenement.stopImmediatePropagation();
    if (clic !== null) {
      if (Math.hypot(evenement.clientX - clic.x, evenement.clientY - clic.y) < SEUIL_DE_GLISSER_PX) return;
      clic = null;
      canvas.style.cursor = "grabbing";
    }

    const dx = evenement.clientX - dernier.x;
    const dy = evenement.clientY - dernier.y;
    dernier = { x: evenement.clientX, y: evenement.clientY };

    if (geste === "orbite") {
      projection = "perspective";   // on se balade en 3D : la profondeur revient
      azimut -= dx * SENSIBILITE_ORBITE;
      elevation = THREE.MathUtils.clamp(elevation + dy * SENSIBILITE_ORBITE, -ELEVATION_LIMITE, ELEVATION_LIMITE);
    } else {
      // Le sol défile à la vitesse du curseur, quel que soit le zoom.
      const hauteurVue = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const parPixel = hauteurVue / canvas.clientHeight;
      const droite = new THREE.Vector3().setFromMatrixColumn(active().matrixWorld, 0);
      const haut = new THREE.Vector3().setFromMatrixColumn(active().matrixWorld, 1);
      cible.addScaledVector(droite, -dx * parPixel).addScaledVector(haut, dy * parPixel);
    }
    appliquer();
  }

  function surRelache(evenement) {
    if (geste === null) return;
    evenement.stopImmediatePropagation();
    const clicSimple = clic;
    clic = null;
    geste = null;
    canvas.style.cursor = "";
    if (canvas.hasPointerCapture(evenement.pointerId)) canvas.releasePointerCapture(evenement.pointerId);
    clicSimple?.surClic?.();
  }

  function surMolette(evenement) {
    evenement.preventDefault();
    const facteur = Math.exp(evenement.deltaY * SENSIBILITE_ZOOM);
    const nouvelleDistance = THREE.MathUtils.clamp(distance * facteur, DISTANCE_MINIMALE_MM, DISTANCE_MAXIMALE_MM);

    // Zoomer vers ce qu'on regarde : la cible glisse vers le point visé.
    const vise = pointVise(evenement.clientX, evenement.clientY);
    if (vise !== null) {
      const fraction = 1 - nouvelleDistance / distance;
      cible.lerp(new THREE.Vector3(...vise), fraction);
    }
    distance = nouvelleDistance;
    appliquer();
  }

  function surTouche(evenement) {
    if (evenement.code !== "Space" || champDeSaisie(evenement.target)) return;
    espaceEnfoncee = evenement.type === "keydown";
    if (espaceEnfoncee) evenement.preventDefault();   // sinon la page « défile »
    canvas.style.cursor = espaceEnfoncee ? "grab" : "";
  }

  canvas.addEventListener("pointerdown", surAppui);
  canvas.addEventListener("pointermove", surDeplacement);
  canvas.addEventListener("pointerup", surRelache);
  canvas.addEventListener("pointercancel", surRelache);
  canvas.addEventListener("wheel", surMolette, { passive: false });
  canvas.addEventListener("contextmenu", (evenement) => evenement.preventDefault());
  globalThis.addEventListener("keydown", surTouche);
  globalThis.addEventListener("keyup", surTouche);
  globalThis.addEventListener("blur", () => { espaceEnfoncee = false; });

  appliquer();

  return {
    distance: () => distance,
    camera: active,
    aPlat: () => projection === "orthographique",

    ajusterAuCadre(rapport) {
      camera.aspect = rapport;
      camera.updateProjectionMatrix();
      appliquer();
    },
    cible: () => [cible.x, cible.y, cible.z],
    orientation: () => ({ azimut, elevation }),
    enGeste: () => geste !== null || espaceEnfoncee,

    /* Un appui gauche dans le vide : la vue glisse avec la souris. Relâché
       sans avoir bougé, c'est un clic, et surClic() est appelé (désélectionner). */
    translaterDepuis(evenement, surClic = null) {
      geste = "translation";
      clic = { x: evenement.clientX, y: evenement.clientY, surClic };
      dernier = { x: evenement.clientX, y: evenement.clientY };
      canvas.setPointerCapture(evenement.pointerId);
    },

    /* Pendant une esquisse : ni orbite ni changement de vue, seulement glisser et zoomer. */
    verrouillerOrbite(verrou) {
      orbiteVerrouillee = verrou;
    },
    orbiteVerrouillee: () => orbiteVerrouillee,

    surChangement(fonction) {
      abonnes.push(fonction);
    },

    /* Ce qu'il faut pour revenir exactement à cette vue après une esquisse. */
    photographier: () => ({ cible: cible.clone(), distance, azimut, elevation, projection }),

    restaurer(photo) {
      cible.copy(photo.cible);
      ({ distance, azimut, elevation, projection } = photo);
      appliquer();
    },

    /* Regarder un plan de face : la caméra se place le long de sa normale. Un
       plan couché se regarde d'en haut, le haut de l'écran vers +Y. */
    regarderSelon([nx, ny, nz]) {
      const longueur = Math.hypot(nx, ny, nz) || 1;
      const vertical = nz / longueur;
      elevation = THREE.MathUtils.clamp(Math.asin(vertical), -ELEVATION_LIMITE_VUE, ELEVATION_LIMITE_VUE);
      azimut = Math.abs(vertical) > 0.99 ? THREE.MathUtils.degToRad(-90) : Math.atan2(ny, nx);
      projection = "orthographique";
      appliquer();
    },

    placerSurVue(nom) {
      if (orbiteVerrouillee) return false;
      const vue = VUES[nom] ?? VUES.iso;
      azimut = THREE.MathUtils.degToRad(vue.azimut);
      elevation = THREE.MathUtils.degToRad(vue.elevation);
      projection = vue.aPlat ? "orthographique" : "perspective";
      appliquer();
      return true;
    },

    /* Si la boîte sort de l'écran, on la cadre ; sinon la vue ne bouge pas. */
    garderEnVue(boite) {
      if (boite.isEmpty()) return;
      const appareil = active();
      appareil.updateMatrixWorld();
      for (const x of [boite.min.x, boite.max.x]) {
        for (const y of [boite.min.y, boite.max.y]) {
          for (const z of [boite.min.z, boite.max.z]) {
            const p = new THREE.Vector3(x, y, z).project(appareil);
            if (Math.abs(p.x) > MARGE_ECRAN || Math.abs(p.y) > MARGE_ECRAN || p.z > 1) {
              this.cadrer(boite);
              return;
            }
          }
        }
      }
    },

    /* Cadre une boîte au plus juste, sans changer l'angle : on mesure ses
       huit coins dans le repère de la caméra. Une boîte vide ramène au
       départ, autour de l'origine. */
    cadrer(boite) {
      if (boite.isEmpty()) {
        cible.set(0, 0, 10);
        distance = DISTANCE_DE_DEPART_MM;
        appliquer();
        return;
      }
      const centre = boite.getCenter(new THREE.Vector3());
      const droite = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const haut = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const recul = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2);
      const tangenteV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * REMPLISSAGE_DU_CADRE;
      const tangenteH = tangenteV * camera.aspect;
      const aPlatActif = projection === "orthographique";
      let requise = DISTANCE_MINIMALE_MM;
      for (const x of [boite.min.x, boite.max.x]) {
        for (const y of [boite.min.y, boite.max.y]) {
          for (const z of [boite.min.z, boite.max.z]) {
            const coin = new THREE.Vector3(x, y, z).sub(centre);
            // À plat, la profondeur ne compte pas ; en perspective, un coin proche paraît plus grand.
            const profondeur = aPlatActif ? 0 : coin.dot(recul);
            requise = Math.max(requise,
              profondeur + Math.abs(coin.dot(droite)) / tangenteH,
              profondeur + Math.abs(coin.dot(haut)) / tangenteV);
          }
        }
      }
      cible.copy(centre);
      distance = THREE.MathUtils.clamp(requise, DISTANCE_MINIMALE_MM, DISTANCE_MAXIMALE_MM);
      appliquer();
    },
  };
}
