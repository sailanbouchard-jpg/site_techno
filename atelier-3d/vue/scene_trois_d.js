/*
 * vue/scene_trois_d.js
 * ────────────────────
 * La scène three.js. Elle ne connaît ni le document, ni le cache, ni l'ouvrier :
 * on lui remet une liste d'objets à afficher, elle l'affiche ; on lui pose des
 * questions sur ce qui est sous la souris, elle répond par des nombres. Elle ne
 * peut pas modifier le document : elle n'y a pas accès.
 *
 * Le rendu se fait à la demande : une vue immobile ne dessine rien, et un
 * portable de collège ne chauffe pas pour une image qui ne change pas.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { creerControleurCamera, VUES } from "./controleur_camera.js";
import { creerGrilleEtAxes } from "./grille_et_axes.js";
import { creerObjetsDeLaScene } from "./objets_de_la_scene.js";
import { creerSurbrillance } from "./surbrillance_selection.js";
import { creerLancerDeRayons } from "./lancer_de_rayons.js";
import { creerGizmo } from "./gizmo_transformation.js";
import { creerEnvironnementDeReflets } from "./environnement_reflets.js";
import { creerAidesVisuelles } from "./aides_visuelles.js";
import { creerCalqueEsquisses } from "./calque_esquisses.js";
import { creerPlansDeReference } from "./plans_de_reference.js";
import { creerPlateauImpression } from "./plateau_impression.js";
import { creerApercuTranchage } from "./apercu_tranchage.js";
import { TYPES_DE_LIGNE } from "../tranchage/protocole_tranchage.js";

const enTableau = (v) => [v.x, v.y, v.z];
// Au-delà de ce nombre de fois la distance de la caméra, le sol touché ne vaut plus comme cible de zoom.
const PORTEE_DU_SOL_EN_DISTANCES = 4;
const boiteEnTableaux = (boite) => (boite === null || boite.isEmpty() ? null : { min: enTableau(boite.min), max: enTableau(boite.max) });

function enEnsemble(selection) {
  if (selection instanceof Set) return selection;
  return new Set(selection === null || selection === undefined ? [] : [selection]);
}

// Réglées à l'œil sur le nuancier entier, du blanc au noir, mat et métal.
const INTENSITE_CIEL = 1.1;
const INTENSITE_SOLEIL = 1.1;
const INTENSITE_FRONTALE = 1.9;
// Vers le haut et la gauche de l'écran, en proportion de la direction du regard.
const DECALAGE_FRONTALE = 0.45;

export function creerScene({ canvas, couleurs }) {
  // Z vertical, forcé à la racine : three.js est en Y-haut par défaut, et tout
  // le reste du logiciel — document, Manifold, STL — travaille en Z-haut.
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

  // Fond transparent : c'est le dégradé CSS de la vue qu'on voit derrière.
  const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  rendu.setClearColor(0x000000, 0);

  const scene3d = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 8000);
  camera.up.set(0, 0, 1);

  // L'éclairage d'un logiciel de CAO : il doit faire lire la forme, pas faire
  // joli. Peu de lumière uniforme (elle aplatit tout, surtout les couleurs
  // sombres), un ciel plus clair que le sol pour savoir où est le haut, et une
  // lampe qui suit l'œil, un peu au-dessus et à gauche : quelle que soit la
  // vue, une surface courbe passe du clair au sombre sous le regard.
  scene3d.add(new THREE.HemisphereLight(new THREE.Color(couleurs.lumiereCiel), new THREE.Color(couleurs.lumiereSol), INTENSITE_CIEL));
  const soleil = new THREE.DirectionalLight(new THREE.Color(couleurs.lumiereCiel), INTENSITE_SOLEIL);
  soleil.position.set(60, -80, 120);
  const frontale = new THREE.DirectionalLight(new THREE.Color(couleurs.lumiereCiel), INTENSITE_FRONTALE);
  scene3d.add(soleil, frontale, frontale.target);
  const placerLaFrontale = (appareil) => {
    const droite = new THREE.Vector3().setFromMatrixColumn(appareil.matrixWorld, 0);
    const haut = new THREE.Vector3().setFromMatrixColumn(appareil.matrixWorld, 1);
    const devant = appareil.getWorldDirection(new THREE.Vector3());
    frontale.position.copy(appareil.position).addScaledVector(droite, -DECALAGE_FRONTALE).addScaledVector(haut, DECALAGE_FRONTALE);
    frontale.target.position.copy(appareil.position).addScaledVector(devant, 1);
    frontale.target.updateMatrixWorld();
  };
  // Ce que reflètent les finitions brillante et métal ; les objets mats l'ignorent.
  scene3d.environment = creerEnvironnementDeReflets(rendu, couleurs);

  const grille = creerGrilleEtAxes(couleurs);
  scene3d.add(grille.objet);
  const plateau = creerPlateauImpression(scene3d, couleurs);
  const tranchage = creerApercuTranchage(scene3d, {
    parType: {
      [TYPES_DE_LIGNE.paroiExterieure]: couleurs.ligneParoiExterieure,
      [TYPES_DE_LIGNE.paroisInterieures]: couleurs.ligneParoisInterieures,
      [TYPES_DE_LIGNE.dessus]: couleurs.ligneDessus,
      [TYPES_DE_LIGNE.dessous]: couleurs.ligneDessous,
      [TYPES_DE_LIGNE.pleinInterieur]: couleurs.lignePleinInterieur,
      [TYPES_DE_LIGNE.remplissage]: couleurs.ligneRemplissage,
      [TYPES_DE_LIGNE.jupe]: couleurs.ligneJupe,
      [TYPES_DE_LIGNE.bordure]: couleurs.ligneBordure,
      [TYPES_DE_LIGNE.paroiEnSurplomb]: couleurs.ligneSurplomb,
      [TYPES_DE_LIGNE.pont]: couleurs.lignePont,
      [TYPES_DE_LIGNE.interstices]: couleurs.ligneInterstices,
      [TYPES_DE_LIGNE.repassage]: couleurs.ligneRepassage,
      [TYPES_DE_LIGNE.pontInterieur]: couleurs.lignePontInterieur,
      defaut: couleurs.objet,
    },
    degrade: [couleurs.degrade1, couleurs.degrade2, couleurs.degrade3, couleurs.degrade4, couleurs.degrade5],
    couture: couleurs.ligneCouture,
    buse: couleurs.buse,
  });

  const objets = creerObjetsDeLaScene(scene3d, couleurs, creerSurbrillance(couleurs));
  // La caméra active change (à plat ou en perspective) : on la demande au contrôleur.
  let controleur = null;
  // La vue en coupe : un seul plan, partagé par les matériaux et le lancer de rayons.
  const planDeCoupe = new THREE.Plane();
  let coupeActive = false;
  rendu.localClippingEnabled = true;
  const rayons = creerLancerDeRayons(() => controleur.camera(), canvas, () => (coupeActive ? planDeCoupe : null));
  const gizmo = creerGizmo(scene3d, couleurs);
  const aides = creerAidesVisuelles(scene3d, couleurs);

  let renduDemande = false;
  let gizmoSuit = null;       // { id, mode }

  /* Ce que la molette vise : l'objet sous la souris ; sinon le sol, s'il est
     à portée ; sinon le plan face à l'écran qui passe par le centre de la vue.
     Vue de face, le sol est vu par la tranche : un rayon presque parallèle le
     toucherait à l'infini, et la vue partirait avec lui. */
  function pointVise(x, y) {
    const touche = rayons.objetSous(x, y, objets.maillages3d());
    if (touche !== null) return touche.point;
    const centre = controleur.cible();
    const sol = rayons.pointAuSol(x, y);
    const portee = PORTEE_DU_SOL_EN_DISTANCES * controleur.distance();
    if (sol !== null && Math.hypot(sol[0] - centre[0], sol[1] - centre[1], sol[2] - centre[2]) < portee) return sol;
    return rayons.pointFaceAEcran(x, y, centre);
  }
  controleur = creerControleurCamera(camera, canvas, pointVise);
  const esquisses = creerCalqueEsquisses(scene3d, couleurs, { rayons, objets, demanderRendu });
  const plansDeReference = creerPlansDeReference(scene3d, couleurs);

  function recollerGizmo() {
    if (gizmoSuit === null) return;
    const boite = objets.boiteMonde(gizmoSuit.id);
    const maillage3d = objets.maillages3d().find((m) => m.userData.idNoeud === gizmoSuit.id);
    if (boite === null || maillage3d === undefined) {
      gizmo.afficher(null);
      return;
    }
    gizmo.afficher({
      maillage3d,
      mode: gizmoSuit.mode,
      ancre: enTableau(maillage3d.position),
      centre: enTableau(boite.getCenter(new THREE.Vector3())),
    });
  }

  function rendre() {
    renduDemande = false;
    grille.ajusterAuZoom(controleur.distance());
    esquisses.ajusterAuZoom(controleur.distance());
    recollerGizmo();
    gizmo.ajuster((point) => rayons.millimetresParPixel(point));
    placerLaFrontale(controleur.camera());
    rendu.render(scene3d, controleur.camera());
  }

  function demanderRendu() {
    if (renduDemande) return;
    renduDemande = true;
    requestAnimationFrame(rendre);
  }

  controleur.surChangement(demanderRendu);

  return {
    controleur,
    rendre,
    demanderRendu,
    esquisses,

    redimensionner() {
      const [largeur, hauteur] = [canvas.clientWidth, canvas.clientHeight];
      if (largeur === 0 || hauteur === 0) return;
      // Densité plafonnée : rendre en 3x divise la fluidité par neuf pour un gain invisible.
      rendu.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      rendu.setSize(largeur, hauteur, false);
      controleur.ajusterAuCadre(largeur / hauteur);
      demanderRendu();
    },

    // ── Objets ────────────────────────────────────────────────────────────
    synchroniser(liste, selection) {
      objets.synchroniser(liste, enEnsemble(selection));
      demanderRendu();
    },
    marquerLiens(utilisateurs, sources) {
      if (objets.marquerLiens(utilisateurs, sources)) demanderRendu();
    },

    marquerSurvol(id) {
      if (objets.marquerSurvol(id)) demanderRendu();
    },
    apercu(id, transformation) {
      objets.apercu(id, transformation);
      demanderRendu();
    },
    finirApercus() {
      objets.finirApercus();
      aides.effacer();
      demanderRendu();
    },

    // ── Questions ─────────────────────────────────────────────────────────
    objetSous: (x, y, exclus) => rayons.objetSous(x, y, objets.maillages3d(), exclus),
    areteSous: (x, y, tolerancePx = 10) => rayons.areteSous(x, y, objets.maillages3d(), tolerancePx),
    maillageMonde: (id) => objets.maillageMonde(id),
    pointAuSol: (x, y, hauteur) => rayons.pointAuSol(x, y, hauteur),
    // Le point du sol que la caméra regarde : là où une forme neuve apparaît.
    pointAuSolAuCentre: () => [controleur.cible()[0], controleur.cible()[1], 0],
    pointSurPlan: (x, y, point, normale) => rayons.pointSurPlan(x, y, point, normale),
    /* En vue à plat (Dessus, Face…), l'axe du monde qui pointe vers l'écran, tel
       [0, 1, 0] ; null en perspective. */
    normaleDeLaVueAPlat() {
      if (!controleur.aPlat()) return null;
      const direction = enTableau(controleur.camera().getWorldDirection(new THREE.Vector3()));
      const axe = direction.map(Math.abs).indexOf(Math.max(...direction.map(Math.abs)));
      const normale = [0, 0, 0];
      normale[axe] = 1;
      return normale;
    },
    centreDeLaFaceSous: (x, y, exclus) => rayons.centreDeLaFaceSous(x, y, objets.maillages3d(), exclus),
    pointAccroche: (x, y, tolerancePx) => rayons.pointAccroche(x, y, objets.maillages3d(), tolerancePx),
    versEcran: (point) => rayons.versEcran(point),
    pointFaceAEcran: (x, y, point) => rayons.pointFaceAEcran(x, y, point),
    parametreSurAxe: (x, y, origine, direction) => rayons.parametreSurAxe(x, y, origine, direction),
    millimetresParPixel: (point) => rayons.millimetresParPixel(point),

    boiteMonde: (id) => boiteEnTableaux(objets.boiteMonde(id)),
    boiteDes: (ids) => boiteEnTableaux(objets.boiteDes(ids)),
    boiteDeLaScene: () => objets.boiteDes(objets.identifiants()),
    // boite : { min: [x, y, z], max: [x, y, z] }
    garderEnVue: ({ min, max }) => controleur.garderEnVue(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))),
    cadrerSur: (points) => controleur.cadrer(new THREE.Box3().setFromPoints(points.map((p) => new THREE.Vector3(...p)))),
    tailleDeLObjet(id) {
      const boite = objets.boiteMonde(id);
      return boite === null ? null : enTableau(boite.getSize(new THREE.Vector3()));
    },

    /* La boîte du maillage dans son propre repère, avant toute transformation :
       les poignées de taille mesurent par rapport à elle. */
    boiteLocale(id) {
      const maillage3d = objets.maillages3d().find((m) => m.userData.idNoeud === id);
      if (maillage3d === undefined) return null;
      const { min, max } = maillage3d.geometry.boundingBox;
      return { min: enTableau(min), max: enTableau(max) };
    },

    nombreDeTriangles: () => objets.nombreDeTriangles(),
    informationsDuRendu: () => ({ appelsDeDessin: rendu.info.render.calls, triangles: rendu.info.render.triangles }),

    // ── Plateau d'impression : il remplace la grille du sol ─────────────────
    /* machine : { largeur, profondeur, hauteur }, ou null pour revenir à la grille. */
    montrerPlateau(machine) {
      plateau.afficher(machine);
      grille.objet.visible = machine === null;
      demanderRendu();
    },
    signalerSurLePlateau(boites) {
      plateau.signaler(boites);
      demanderRendu();
    },
    /* Le tranchage à la place des pièces : donnees (voir vue/apercu_tranchage.js),
       ou null pour revenir aux pièces. decalage : du repère machine au monde. */
    montrerTranchage(donnees, decalage = [0, 0]) {
      tranchage.afficher(donnees, decalage);
      demanderRendu();
    },
    cacherLesPieces(actif) {
      objets.cacher(actif);
      tranchage.montrer(actif);
      demanderRendu();
    },
    montrerLesCouches(bas, haut) {
      tranchage.montrerLesCouches(bas, haut);
      demanderRendu();
    },
    /* Rend l'échelle de la coloration en cours ({ min, max }), ou null en mode type de ligne. */
    typesDeLigneVisibles(types) {
      const echelle = tranchage.typesVisibles(types);
      demanderRendu();
      return echelle;
    },
    colorerTranchage(mode) {
      const echelle = tranchage.colorer(mode);
      demanderRendu();
      return echelle;
    },
    segmentsDeLaCouche: (couche) => tranchage.segmentsDeLaCouche(couche),
    avancerDansLaCouche(rang) {
      const info = tranchage.avancer(rang);
      demanderRendu();
      return info;
    },
    montrerLesCoutures(visible) {
      tranchage.montrerLesCoutures(visible);
      demanderRendu();
    },
    cadrerLePlateau() {
      const boite = plateau.boite();
      if (boite !== null) controleur.cadrer(boite);
    },

    // ── Plans de référence : on clique celui où l'on veut dessiner ─────────
    montrerPlansDeReference(visibles) {
      plansDeReference.afficher(visibles);
      demanderRendu();
    },
    planDeReferenceSous: (x, y) => plansDeReference.sous(rayons.rayonDepuisEcran(x, y)),
    orienterPlansDeReference(reglages) {
      plansDeReference.orienter(reglages);
      demanderRendu();
    },
    surlignerPlanDeReference(nom) {
      if (plansDeReference.surligner(nom)) demanderRendu();
    },

    // ── Gizmo et aides ────────────────────────────────────────────────────
    suivreAvecLeGizmo(id, mode) {
      gizmoSuit = id === null ? null : { id, mode };
      if (gizmoSuit === null) gizmo.afficher(null);
      demanderRendu();
    },
    /* coupe : { normale: [x, y, z], constante } (voir noyau/vues_en_coupe.js), ou null. */
    definirCoupe(coupe) {
      if (coupe !== null) planDeCoupe.set(new THREE.Vector3(...coupe.normale), coupe.constante);
      if ((coupe !== null) !== coupeActive) {
        coupeActive = coupe !== null;
        objets.couper(coupeActive ? planDeCoupe : null);
      }
      demanderRendu();
    },

    /* Les points de la scène que le gizmo occupe (bouts des flèches, des anneaux). */
    empriseDuGizmo() {
      recollerGizmo();
      return gizmo.visible() ? gizmo.emprise((point) => rayons.millimetresParPixel(point)) : [];
    },
    partieDuGizmoSous(x, y) {
      if (!gizmo.visible()) return null;
      return gizmo.partieSous(rayons.rayonDepuisEcran(x, y));
    },
    surlignerGizmo(partie) {
      if (gizmo.surligner(partie)) demanderRendu();
    },
    montrerGuides(guides, hauteur) {
      aides.montrerGuides(guides, hauteur);
      demanderRendu();
    },
    montrerContact(point) {
      aides.montrerContact(point);
      demanderRendu();
    },
    montrerAidesOperation(liste) {
      aides.montrerOperation(liste, "operation");
      demanderRendu();
    },
    montrerAidesOutil(liste) {
      aides.montrerOperation(liste, "outil");
      demanderRendu();
    },

    placerSurVue: (nom) => controleur.placerSurVue(nom),
    vues: () => Object.entries(VUES).map(([nom, vue]) => ({ nom, etiquette: vue.etiquette })),

    /*
     * Une petite image du projet pour la liste des projets, prise avec une
     * caméra à part : la vue de l'élève n'est pas touchée. Sans grille, sans
     * poignées, sans aides.
     */
    capturerVignette(largeur = 240, hauteur = 180) {
      const boite = objets.boiteDes(objets.identifiants());
      if (boite.isEmpty()) return null;

      const sphere = boite.getBoundingSphere(new THREE.Sphere());
      const appareil = new THREE.PerspectiveCamera(35, largeur / hauteur, 0.5, 8000);
      appareil.up.set(0, 0, 1);
      const azimut = THREE.MathUtils.degToRad(VUES.iso.azimut);
      const elevation = THREE.MathUtils.degToRad(VUES.iso.elevation);
      const recul = (Math.max(sphere.radius, 1) / Math.sin(THREE.MathUtils.degToRad(35) / 2)) * 1.05;
      appareil.position.set(
        sphere.center.x + recul * Math.cos(elevation) * Math.cos(azimut),
        sphere.center.y + recul * Math.cos(elevation) * Math.sin(azimut),
        sphere.center.z + recul * Math.sin(elevation),
      );
      appareil.lookAt(sphere.center);

      const [largeurAvant, hauteurAvant] = [canvas.width, canvas.height];
      const densite = rendu.getPixelRatio();
      const [grilleVisible, plateauVisible] = [grille.objet.visible, plateau.objet.visible];
      grille.objet.visible = false;
      plateau.objet.visible = false;
      try {
        return gizmo.cacherPendant(() => aides.cacherPendant(() => esquisses.cacherPendant(() => {
          rendu.setPixelRatio(1);
          rendu.setSize(largeur, hauteur, false);
          appareil.updateMatrixWorld();
          placerLaFrontale(appareil);
          rendu.render(scene3d, appareil);
          return canvas.toDataURL("image/png");
        })));
      } finally {
        grille.objet.visible = grilleVisible;
        plateau.objet.visible = plateauVisible;
        rendu.setPixelRatio(densite);
        rendu.setSize(largeurAvant / densite, hauteurAvant / densite, false);
        rendre();
      }
    },

    surPerteDuContexte(fonction) {
      canvas.addEventListener("webglcontextlost", (evenement) => {
        evenement.preventDefault();
        fonction();
      });
    },
  };
}
