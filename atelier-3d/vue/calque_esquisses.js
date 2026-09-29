/*
 * vue/calque_esquisses.js
 * ───────────────────────
 * Les esquisses dans la vue : leurs traits, l'aplat des contours fermés, et,
 * pour l'esquisse ouverte, la grille de son plan, ses axes et son origine, ses
 * points, ses lignes de cote, la silhouette des solides et l'aperçu du tracé
 * en cours. Comme le reste de la vue, le
 * calque affiche ce qu'on lui donne et ne touche jamais au document.
 *
 * Chaque esquisse est dessinée dans son repère (u, v) : la matrice « repere »
 * (12 nombres, ligne majeure) la pose dans le monde.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { silhouettesSurPlan } from "./silhouettes_sur_plan.js";

// Les traits flottent un rien devant le plan pour ne pas scintiller avec la grille.
const DECOLLEMENT_MM = 0.03;
const COTE_GRILLE_MM = 400;
const DISTANCE_GRILLE_FINE_MM = 150;
const TAILLE_POINT_PX = 6;
const TAILLE_ACCROCHE_PX = 10;
const TAILLE_ACCROCHE_REPERE_PX = 18;
const TAILLE_BOUT_LIBRE_PX = 11;
const TAILLE_ORIGINE_PX = 9;
const TAILLE_CENTRE_PX = 11;
// Un point de référence se voit de loin : plus gros, et de sa couleur propre.
const TAILLE_REFERENCE_PX = 8;
const TAILLE_REFERENCE_EXTERNE_PX = 7;

function matrice4(repere) {
  return new THREE.Matrix4().set(...repere, 0, 0, 0, 1);
}

function traitsVersSegments(traces) {
  const positions = [];
  for (const trace of traces) {
    for (let i = 1; i < trace.length; i += 1) {
      positions.push(trace[i - 1][0], trace[i - 1][1], 0, trace[i][0], trace[i][1], 0);
    }
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
}

function forme(contour) {
  return new THREE.Shape(contour.map(([u, v]) => new THREE.Vector2(u, v)));
}

function vider(groupe) {
  for (const enfant of [...groupe.children]) {
    groupe.remove(enfant);
    enfant.geometry?.dispose();
  }
}

function grilleDuPlan(pas, couleur, opacite) {
  const grille = new THREE.GridHelper(COTE_GRILLE_MM, COTE_GRILLE_MM / pas, couleur, couleur);
  grille.rotation.x = Math.PI / 2;   // née dans XZ, couchée dans le plan (u, v)
  grille.material.transparent = true;
  grille.material.opacity = opacite;
  grille.material.depthWrite = false;
  return grille;
}

/* Une croix blanche sur fond transparent : la forme des centres d'arcs, teintée par le matériau. */
function textureCroix() {
  const cote = 32;
  const toile = document.createElement("canvas");
  toile.width = cote;
  toile.height = cote;
  const dessin = toile.getContext("2d");
  dessin.fillStyle = "#fff";
  dessin.fillRect(cote * 0.42, 0, cote * 0.16, cote);
  dessin.fillRect(0, cote * 0.42, cote, cote * 0.16);
  return new THREE.CanvasTexture(toile);
}

export function creerCalqueEsquisses(scene3d, couleurs, { rayons, objets, demanderRendu }) {
  const racine = new THREE.Group();
  racine.name = "esquisses";
  scene3d.add(racine);

  const trait = (couleur, devant) => new THREE.LineBasicMaterial({ color: new THREE.Color(couleur), depthTest: !devant, transparent: true });
  const materiaux = {
    normale: trait(couleurs.esquisse, false),
    choisie: trait(couleurs.selection, true),
    ouverte: trait(couleurs.esquisseOuverte, true),
    // Entièrement contrainte : le dessin est figé, il ne bougera plus tout seul.
    contrainte: trait(couleurs.etanche, true),
    gomme: trait(couleurs.trou, true),
    silhouette: new THREE.LineBasicMaterial({ color: new THREE.Color(couleurs.silhouette), depthTest: false, transparent: true, opacity: 0.8 }),
    apercu: new THREE.LineDashedMaterial({ color: new THREE.Color(couleurs.guide), dashSize: 1.5, gapSize: 1, depthTest: false, transparent: true }),
    // Deux formes qui se chevauchent s'additionnent : l'aplat du second ne
    // repasse pas sur le premier (test de profondeur strict), il ne fonce pas.
    aplat: new THREE.MeshBasicMaterial({
      color: new THREE.Color(couleurs.esquisseAplat), transparent: true, opacity: 0.35, side: THREE.DoubleSide,
      depthWrite: true, depthFunc: THREE.LessDepth,
    }),
    boutLibre: new THREE.PointsMaterial({ color: new THREE.Color(couleurs.trou), size: TAILLE_BOUT_LIBRE_PX, sizeAttenuation: false, depthTest: false }),
    point: new THREE.PointsMaterial({ color: new THREE.Color(couleurs.esquisseOuverte), size: TAILLE_POINT_PX, sizeAttenuation: false, depthTest: false }),
    centre: new THREE.PointsMaterial({
      color: new THREE.Color(couleurs.esquisseOuverte), size: TAILLE_CENTRE_PX, sizeAttenuation: false, depthTest: false,
      alphaMap: textureCroix(), transparent: true,
    }),
    cote: trait(couleurs.cote, true),
    reference: new THREE.PointsMaterial({ color: new THREE.Color(couleurs.reference), size: TAILLE_REFERENCE_PX, sizeAttenuation: false, depthTest: false }),
    referenceExterne: new THREE.PointsMaterial({
      color: new THREE.Color(couleurs.reference), size: TAILLE_REFERENCE_EXTERNE_PX, sizeAttenuation: false, depthTest: false, transparent: true, opacity: 0.75,
    }),
    projection: new THREE.LineDashedMaterial({ color: new THREE.Color(couleurs.reference), dashSize: 1.5, gapSize: 1.5, depthTest: false, transparent: true, opacity: 0.8 }),
    axes: new THREE.LineDashedMaterial({ color: new THREE.Color(couleurs.axesEsquisse), dashSize: 3, gapSize: 1.5, depthTest: false, transparent: true, opacity: 0.9 }),
    origine: new THREE.PointsMaterial({ color: new THREE.Color(couleurs.axesEsquisse), size: TAILLE_ORIGINE_PX, sizeAttenuation: false, depthTest: false }),
    // Un trait d'aide : pointillé fin, effacé — il ne doit pas se confondre avec un tracé.
    traitAide: new THREE.LineDashedMaterial({ color: new THREE.Color(couleurs.silhouette), dashSize: 2, gapSize: 1.5, depthTest: false, transparent: true, opacity: 0.9 }),
    accroche: new THREE.PointsMaterial({ color: new THREE.Color(couleurs.selection), size: TAILLE_ACCROCHE_PX, sizeAttenuation: false, depthTest: false }),
    // Sur l'origine ou sur un axe : une marque plus grosse, et les axes en évidence.
    accrocheRepere: new THREE.PointsMaterial({ color: new THREE.Color(couleurs.selection), size: TAILLE_ACCROCHE_REPERE_PX, sizeAttenuation: false, depthTest: false }),
    axesActifs: new THREE.LineDashedMaterial({ color: new THREE.Color(couleurs.selection), dashSize: 3, gapSize: 1.5, depthTest: false, transparent: true, opacity: 1 }),
  };

  const dessins = new Map();   // id → { groupe, donnees }
  const plan = new THREE.Group();   // tout ce qui n'existe que pendant l'édition
  plan.matrixAutoUpdate = false;
  plan.visible = false;
  racine.add(plan);
  const grosse = grilleDuPlan(10, couleurs.grilleGrosse, 0.8);
  const fine = grilleDuPlan(1, couleurs.grilleFine, 0.45);
  const silhouette = new THREE.LineSegments(new THREE.BufferGeometry(), materiaux.silhouette);
  const apercu = new THREE.Group();
  const guides = new THREE.Group();
  const accroche = new THREE.Points(new THREE.BufferGeometry(), materiaux.accroche);
  const cotes = new THREE.Group();
  const externes = new THREE.Group();   // les références des esquisses précédentes, projetées
  // Les axes de l'esquisse et son origine : on s'y réfère pour coter.
  const demi = COTE_GRILLE_MM / 2;
  const axes = new THREE.LineSegments(traitsVersSegments([[[-demi, 0], [demi, 0]], [[0, -demi], [0, demi]]]), materiaux.axes);
  axes.computeLineDistances();
  const origine = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3)), materiaux.origine);
  for (const objet of [silhouette, apercu, accroche, cotes, axes, origine]) objet.renderOrder = 6;
  plan.add(fine, grosse, axes, origine, silhouette, cotes, externes, apercu, guides, accroche);

  let ouverte = null;           // { repere, inverse, segments }
  let enveloppe = new THREE.Matrix4();

  function dessiner(donnees) {
    const groupe = new THREE.Group();
    groupe.matrixAutoUpdate = false;
    groupe.matrix.copy(matrice4(donnees.repere));
    const contenu = new THREE.Group();
    contenu.position.z = DECOLLEMENT_MM;
    groupe.add(contenu);

    if (donnees.regions.length > 0) {
      const formes = donnees.regions.map(({ contour, trous }) => {
        const f = forme(contour);
        f.holes = trous.map(forme);
        return f;
      });
      const aplat = new THREE.Mesh(new THREE.ShapeGeometry(formes), materiaux.aplat);
      aplat.renderOrder = 3;
      contenu.add(aplat);
    }
    const lignes = new THREE.LineSegments(traitsVersSegments(donnees.traces), materiaux[donnees.etat] ?? materiaux.normale);
    lignes.renderOrder = 4;
    contenu.add(lignes);
    if ((donnees.tracesAide ?? []).length > 0) {
      const aides = new THREE.LineSegments(traitsVersSegments(donnees.tracesAide), materiaux.traitAide);
      aides.computeLineDistances();
      aides.renderOrder = 4;
      contenu.add(aides);
    }
    if (donnees.etat === "ouverte" || donnees.etat === "contrainte") {
      const points = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
        new THREE.Float32BufferAttribute(donnees.points.flatMap(([u, v]) => [u, v, 0]), 3)), materiaux.point);
      points.renderOrder = 5;
      contenu.add(points);
      if ((donnees.centres ?? []).length > 0) {
        const centres = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
          new THREE.Float32BufferAttribute(donnees.centres.flatMap(([u, v]) => [u, v, 0]), 3)), materiaux.centre);
        centres.renderOrder = 5;
        contenu.add(centres);
      }
      // Les bouts qui ne rejoignent rien : c'est là que le contour reste ouvert.
      if (donnees.bouts.length > 0) {
        const bouts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
          new THREE.Float32BufferAttribute(donnees.bouts.flatMap(([u, v]) => [u, v, 0]), 3)), materiaux.boutLibre);
        bouts.renderOrder = 6;
        contenu.add(bouts);
      }
    }
    // Les points de référence se voient toujours, esquisse ouverte ou non : c'est
    // par eux que les autres esquisses s'y accrochent.
    if ((donnees.references ?? []).length > 0) {
      const references = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
        new THREE.Float32BufferAttribute(donnees.references.flatMap(([u, v]) => [u, v, 0]), 3)), materiaux.reference);
      references.renderOrder = 7;
      contenu.add(references);
    }
    racine.add(groupe);
    return groupe;
  }

  function retirer(id) {
    const { groupe } = dessins.get(id);
    vider(groupe.children[0]);
    racine.remove(groupe);
    dessins.delete(id);
  }

  /* Le point (u, v) du plan sous la souris, et l'échelle écran à cet endroit. */
  function viserLePlan(x, y, repere, inverse) {
    const m = matrice4(repere);
    const origine = new THREE.Vector3().setFromMatrixPosition(m);
    const normale = new THREE.Vector3(repere[2], repere[6], repere[10]).normalize();
    const plan3d = new THREE.Plane().setFromNormalAndCoplanarPoint(normale, origine);
    const monde = rayons.rayonDepuisEcran(x, y).ray.intersectPlane(plan3d, new THREE.Vector3());
    if (monde === null) return null;
    const local = monde.clone().applyMatrix4(inverse ?? m.clone().invert());
    const echelle = new THREE.Vector3().setFromMatrixColumn(m, 0).length() || 1;
    return { uv: [local.x, local.y], mmParPixel: rayons.millimetresParPixel([monde.x, monde.y, monde.z]) / echelle, monde };
  }

  return {
    /*
     * liste : [{ id, repere, traces, regions, points, bouts, etat, cle }]
     * etat : "normale" | "choisie" | "ouverte" | "gomme" ; cle change quand le dessin change.
     */
    afficher(liste) {
      const vus = new Set();
      for (const donnees of liste) {
        vus.add(donnees.id);
        const actuel = dessins.get(donnees.id);
        if (actuel !== undefined && actuel.donnees.cle === donnees.cle) continue;
        if (actuel !== undefined) retirer(donnees.id);
        dessins.set(donnees.id, { groupe: dessiner(donnees), donnees });
      }
      for (const id of [...dessins.keys()]) if (!vus.has(id)) retirer(id);
      demanderRendu();
    },

    /* exclus : les objets à ne pas projeter (le solide de l'esquisse elle-même). */
    ouvrir(repere, exclus) {
      const m = matrice4(repere);
      enveloppe = m.clone().invert();
      objets.estomper(true);
      const aProjeter = objets.maillages3d().filter((m3d) => !exclus.has(m3d.userData.idNoeud));
      const segments = silhouettesSurPlan(aProjeter, enveloppe);
      const positions = [];
      for (let i = 0; i < segments.length; i += 4) positions.push(segments[i], segments[i + 1], 0, segments[i + 2], segments[i + 3], 0);
      silhouette.geometry.dispose();
      silhouette.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      plan.matrix.copy(m);
      plan.visible = true;
      ouverte = { repere, inverse: enveloppe, segments };
      demanderRendu();
      return segments;
    },

    fermer() {
      objets.estomper(false);
      plan.visible = false;
      ouverte = null;
      this.apercu([]);
      this.accroche(null);
      this.cotes([]);
      this.referencesExternes([]);
      demanderRendu();
    },

    /* liste : [{ uv, local }] — local : le point de référence dans le repère
       de l'esquisse ouverte (w : sa distance au plan). Sa projection se marque
       sur le plan, reliée au point lui-même par un pointillé. */
    referencesExternes(liste) {
      vider(externes);
      if (liste.length > 0) {
        const marques = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
          new THREE.Float32BufferAttribute(liste.flatMap(({ uv }) => [uv[0], uv[1], DECOLLEMENT_MM * 2]), 3)), materiaux.referenceExterne);
        marques.renderOrder = 6;
        externes.add(marques);
        for (const { uv, local } of liste) {
          if (Math.abs(local[2]) < 1e-6) continue;
          const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(uv[0], uv[1], 0), new THREE.Vector3(...local),
          ]), materiaux.projection);
          ligne.computeLineDistances();
          ligne.renderOrder = 6;
          externes.add(ligne);
        }
      }
      demanderRendu();
    },

    silhouettes: () => ouverte?.segments ?? new Float32Array(0),

    ajusterAuZoom(distanceCamera) {
      fine.visible = distanceCamera < DISTANCE_GRILLE_FINE_MM;
    },

    /* traces : [{ points: [[u, v], …], genre: "apercu" | "gomme" | "choisi" }] */
    apercu(traces) {
      vider(apercu);
      for (const { points, genre } of traces) {
        const geometrie = new THREE.BufferGeometry().setFromPoints(points.map(([u, v]) => new THREE.Vector3(u, v, DECOLLEMENT_MM * 2)));
        const materiau = { gomme: materiaux.gomme, choisi: materiaux.choisie }[genre] ?? materiaux.apercu;
        const ligne = new THREE.Line(geometrie, materiau);
        ligne.computeLineDistances();
        apercu.add(ligne);
      }
      demanderRendu();
    },

    /* traits : [{ points: [[u, v], …], conflit }] : les lignes de cote de l'esquisse ouverte. */
    /* traits : [{ points, conflit, fort? }] — « fort » : le tracé que l'étiquette survolée désigne. */
    cotes(traits) {
      vider(cotes);
      for (const { points, conflit, fort } of traits) {
        const geometrie = new THREE.BufferGeometry().setFromPoints(points.map(([u, v]) => new THREE.Vector3(u, v, DECOLLEMENT_MM * 2)));
        const materiau = conflit ? materiaux.gomme : (fort ? materiaux.choisie : materiaux.cote);
        cotes.add(new THREE.Line(geometrie, materiau));
      }
      demanderRendu();
    },

    /*
     * point : [u, v] ou null ; guides : [[de, a], …] en pointillés ; genre :
     * ce sur quoi on est accroché. Sur l'origine ou sur un axe, la marque
     * grossit et les axes s'allument : aucun doute sur ce qu'on va viser.
     */
    accroche(point, traits = [], genre = null) {
      vider(guides);
      const surLeRepere = genre === "origine" || genre === "axe";
      accroche.visible = point !== null;
      accroche.material = surLeRepere ? materiaux.accrocheRepere : materiaux.accroche;
      axes.material = point !== null && surLeRepere ? materiaux.axesActifs : materiaux.axes;
      if (point !== null) {
        accroche.geometry.dispose();
        accroche.geometry = new THREE.BufferGeometry().setAttribute("position",
          new THREE.Float32BufferAttribute([point[0], point[1], DECOLLEMENT_MM * 2], 3));
      }
      for (const [de, a] of traits) {
        const ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(de[0], de[1], DECOLLEMENT_MM), new THREE.Vector3(a[0], a[1], DECOLLEMENT_MM),
        ]), materiaux.apercu);
        ligne.computeLineDistances();
        ligne.renderOrder = 6;
        guides.add(ligne);
      }
      demanderRendu();
    },

    pointSur(x, y) {
      return ouverte === null ? null : viserLePlan(x, y, ouverte.repere, ouverte.inverse);
    },

    /* L'esquisse dont un trait ou un aplat est sous la souris, ou null.
       estSous(donnees, uv, tolerance) est fourni par l'appelant. */
    sous(x, y, estSous) {
      let meilleure = null;
      let plusPres = Infinity;
      for (const [id, { donnees }] of dessins) {
        const vise = viserLePlan(x, y, donnees.repere);
        if (vise === null || !estSous(id, vise.uv, 6 * vise.mmParPixel)) continue;
        const d = rayons.rayonDepuisEcran(x, y).ray.origin.distanceTo(vise.monde);
        if (d < plusPres) {
          plusPres = d;
          meilleure = id;
        }
      }
      return meilleure;
    },

    cacherPendant(action) {
      const visible = racine.visible;
      racine.visible = false;
      try {
        return action();
      } finally {
        racine.visible = visible;
      }
    },
  };
}
