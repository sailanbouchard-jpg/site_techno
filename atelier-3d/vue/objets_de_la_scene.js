/*
 * vue/objets_de_la_scene.js
 * ─────────────────────────
 * Les objets du document tels que la scène les montre. On lui remet une liste,
 * elle crée, met à jour ou retire les maillages three.js correspondants.
 *
 * Chaque objet reçu : { id, maillage, empreinteDuMaillage, transformation,
 * couleur, finition, apparencesDesParties(parties), trou, enAttente }. Un
 * groupe garde la couleur et la finition de ses pièces : un matériau par
 * pièce, sur les plages de triangles que l'ouvrier a notées. Le maillage est construit à l'origine ; la
 * transformation est appliquée ici. C'est pour ça que déplacer ou redimensionner
 * un objet ne recalcule rien.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { creerMateriau } from "./materiaux.js";
import { normalesAdoucies, souderSommets } from "../geometrie/normales_du_maillage.js";

const DEGRE = Math.PI / 180;

function liberer(materiau) {
  for (const m of [materiau].flat()) m?.dispose();
}

export function placer(objet3d, { position, rotation, echelle }) {
  objet3d.position.set(position.x, position.y, position.z);
  // « ZYX » pour three.js veut dire Rz·Ry·Rx : X appliqué en premier, comme
  // dans le noyau et dans Manifold. « XYZ » montrerait une autre pièce que
  // celle qu'on exporte dès que deux rotations se combinent.
  objet3d.rotation.set(rotation.x * DEGRE, rotation.y * DEGRE, rotation.z * DEGRE, "ZYX");
  // Une échelle nulle rendrait la matrice non inversible et casserait le lancer
  // de rayons : on la garde infime à l'affichage.
  objet3d.scale.set(echelle.x || 1e-6, echelle.y || 1e-6, echelle.z || 1e-6);
}

/* Les proportions de l'étirement (la plus grande dimension vaut 1), ou null
   quand l'objet est agrandi également dans les trois sens : ses angles ne
   changent pas, les normales de l'ouvrier sont justes. */
function rapportsDEchelle(echelle) {
  const e = [Math.abs(echelle.x), Math.abs(echelle.y), Math.abs(echelle.z)];
  const plusGrande = Math.max(...e);
  if (!(plusGrande > 0)) return null;
  const r = e.map((v) => Math.round((v / plusGrande) * 1000) / 1000);
  return r.every((v) => v === 1) ? null : r;
}

const cleDeGeometrie = (empreinte, rapports) => (rapports === null ? empreinte : empreinte + "|" + rapports.join(","));

function normalesADesProportions(maillage, rapports) {
  const soude = souderSommets(maillage.positions, maillage.indices);
  return normalesAdoucies(soude.positions, soude.indices, rapports);
}

// Sous cette luminance (linéaire), un trait foncé ne se verrait plus : il s'éclaircit.
const LUMINANCE_SOMBRE = 0.12;
function couleurSombre(css) {
  const c = new THREE.Color(css);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < LUMINANCE_SOMBRE;
}

export function creerObjetsDeLaScene(scene3d, couleurs, surbrillance) {
  const affiches = new Map();       // id → { maillage3d, cle, apparence, transformation, genre }
  const geometries = new Map();     // cle → { geometrie, utilisations, rapports }
  const apercus = new Set();
  let survol = null;
  // Les objets liés à la sélection : { utilisateurs, sources } (voir marquerLiens).
  let liens = { utilisateurs: new Set(), sources: new Set() };
  let estompe = false;
  let coupe = null;           // le THREE.Plane de la vue en coupe, ou null
  let caches = false;         // l'aperçu du tranchage remplace les pièces
  let triangles = 0;

  // Quarante cylindres identiques partagent une seule géométrie sur la carte
  // graphique : c'est la même empreinte, donc le même maillage. cle : voir cleDeGeometrie.
  function prendreGeometrie(cle, maillage, rapports) {
    let entree = geometries.get(cle);
    if (entree === undefined) {
      // Les normales arrivent de l'ouvrier, lissées sur les surfaces courbes
      // et franches aux arêtes ; une forme étirée les refait à ses proportions.
      const lisse = rapports === null ? maillage : normalesADesProportions(maillage, rapports);
      const geometrie = new THREE.BufferGeometry();
      geometrie.setAttribute("position", new THREE.BufferAttribute(lisse.positions, 3));
      if (lisse.normales) geometrie.setAttribute("normal", new THREE.BufferAttribute(lisse.normales, 3));
      geometrie.setIndex(new THREE.BufferAttribute(lisse.indices, 1));
      for (const g of maillage.groupes ?? []) geometrie.addGroup(g.debut, g.nombre, g.partie);
      geometrie.computeBoundingBox();
      geometrie.computeBoundingSphere();
      entree = { geometrie, utilisations: 0, triangles: maillage.indices.length / 3, parties: maillage.parties ?? null, rapports };
      geometries.set(cle, entree);
    }
    entree.utilisations += 1;
    return entree;
  }

  function rendreGeometrie(cle) {
    const entree = geometries.get(cle);
    if (entree === undefined) return;
    entree.utilisations -= 1;
    if (entree.utilisations === 0) {
      entree.geometrie.dispose();
      geometries.delete(cle);
    }
  }

  function genreDeContour(id, affiche) {
    if (affiche.selectionne) return "selection";
    if (affiche.enAttente) return "attente";
    if (id === survol) return "survol";
    if (liens.utilisateurs.has(id)) return "dependance";
    if (liens.sources.has(id)) return "source";
    // Un trou est déjà hachuré, une esquisse ouverte veut des solides discrets.
    if (affiche.objet.trou || estompe) return null;
    return couleurSombre(affiche.objet.couleur ?? couleurs.objet) ? "areteClaire" : "arete";
  }

  function mettreAJourContour(id, affiche) {
    const genre = genreDeContour(id, affiche);
    if (genre === affiche.genre) return;
    surbrillance.appliquer(affiche.maillage3d, affiche.cle, genre, geometries.get(affiche.cle)?.rapports ?? null);
    affiche.genre = genre;
  }

  function habiller(affiche) {
    const { couleur, finition, trou, apparencesDesParties } = affiche.objet;
    const parties = geometries.get(affiche.cle)?.parties ?? null;
    const apparences = parties === null || trou ? [{ couleur, finition }] : apparencesDesParties(parties);
    const cles = apparences.map((a) => a.couleur + "/" + a.finition);
    const apparence = [cles.join(","), trou, affiche.selectionne, affiche.enAttente, estompe, coupe !== null].join("|");
    if (apparence === affiche.apparence) return;
    liberer(affiche.maillage3d.material);
    const etat = { trou, selectionne: affiche.selectionne, enAttente: affiche.enAttente, estompe, coupe };
    // Sans tableau de matériaux, three.js ignore les plages : l'objet prend un seul aspect.
    affiche.maillage3d.material = new Set(cles).size === 1
      ? creerMateriau(couleurs, { ...etat, ...apparences[0] })
      : apparences.map((a) => creerMateriau(couleurs, { ...etat, ...a }));
    // Les trous et le translucide se dessinent après la matière, pour qu'on la voie au travers.
    affiche.maillage3d.renderOrder = trou || apparences.some((a) => a.finition === "translucide") ? 1 : 0;
    affiche.apparence = apparence;
  }

  function retirer(id) {
    const affiche = affiches.get(id);
    scene3d.remove(affiche.maillage3d);
    liberer(affiche.maillage3d.material);
    rendreGeometrie(affiche.cle);
    affiches.delete(id);
    apercus.delete(id);
  }

  return {
    synchroniser(objets, selection) {
      const vus = new Set();
      triangles = 0;

      for (const objet of objets) {
        let affiche = affiches.get(objet.id);
        if (objet.maillage === null && affiche === undefined) continue;   // rien à montrer encore
        vus.add(objet.id);

        const rapports = rapportsDEchelle(objet.transformation.echelle);
        const cle = cleDeGeometrie(objet.empreinteDuMaillage, rapports);
        if (affiche === undefined) {
          const entree = prendreGeometrie(cle, objet.maillage, rapports);
          const maillage3d = new THREE.Mesh(entree.geometrie);
          maillage3d.userData.idNoeud = objet.id;
          maillage3d.visible = !caches;
          scene3d.add(maillage3d);
          affiche = { maillage3d, cle, apparence: null, genre: undefined };
          affiches.set(objet.id, affiche);
        } else if (objet.maillage !== null && affiche.cle !== cle) {
          // Nouveau maillage arrivé, ou nouvelles proportions : on remplace.
          // Tant qu'il n'est pas là, l'objet garde sa forme précédente, avec
          // un contour d'attente.
          const entree = prendreGeometrie(cle, objet.maillage, rapports);
          rendreGeometrie(affiche.cle);
          affiche.maillage3d.geometry = entree.geometrie;
          affiche.cle = cle;
          affiche.genre = undefined;
        }

        affiche.selectionne = selection.has(objet.id);
        affiche.enAttente = objet.maillage === null || objet.enAttente;
        affiche.transformation = objet.transformation;

        affiche.objet = objet;
        habiller(affiche);

        if (!apercus.has(objet.id)) placer(affiche.maillage3d, objet.transformation);
        mettreAJourContour(objet.id, affiche);
        triangles += geometries.get(affiche.cle)?.triangles ?? 0;
      }

      for (const id of [...affiches.keys()]) {
        if (!vus.has(id)) retirer(id);
      }
    },

    /* Pendant une esquisse, les solides passent en transparence : on voit le
       plan et ses traits au travers. */
    estomper(actif) {
      estompe = actif;
      for (const [id, affiche] of affiches) {
        habiller(affiche);
        mettreAJourContour(id, affiche);
      }
    },

    /* plan : le THREE.Plane de la vue en coupe, ou null pour la quitter. Le
       plan est partagé : le décaler ne demande pas de refaire les matériaux. */
    couper(plan) {
      coupe = plan;
      surbrillance.couper(plan);
      for (const affiche of affiches.values()) habiller(affiche);
    },

    cacher(actif) {
      caches = actif;
      for (const affiche of affiches.values()) affiche.maillage3d.visible = !actif;
    },

    /* Les objets liés à la sélection : ceux qui en dépendent, et ceux dont elle
       dépend. Ils prennent un contour jaune, plein ou pointillé. */
    marquerLiens(utilisateurs, sources) {
      const memes = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));
      if (memes(utilisateurs, liens.utilisateurs) && memes(sources, liens.sources)) return false;
      const touches = new Set([...liens.utilisateurs, ...liens.sources, ...utilisateurs, ...sources]);
      liens = { utilisateurs, sources };
      for (const id of touches) {
        const affiche = affiches.get(id);
        if (affiche !== undefined) mettreAJourContour(id, affiche);
      }
      return true;
    },

    marquerSurvol(id) {
      if (id === survol) return false;
      const ancien = survol;
      survol = id;
      for (const cible of [ancien, id]) {
        const affiche = affiches.get(cible);
        if (affiche !== undefined) mettreAJourContour(cible, affiche);
      }
      return true;
    },

    /* Un aperçu déplace l'objet à l'écran sans toucher au document : c'est ce
       que voit l'élève pendant un glisser, avant la commande du relâcher. */
    apercu(id, transformation) {
      const affiche = affiches.get(id);
      if (affiche === undefined) return;
      apercus.add(id);
      placer(affiche.maillage3d, transformation);
    },

    finirApercus() {
      for (const id of apercus) {
        const affiche = affiches.get(id);
        if (affiche !== undefined) placer(affiche.maillage3d, affiche.transformation);
      }
      apercus.clear();
    },

    /* Les triangles d'un objet affiché, dans le repère du monde : { positions, indices }, ou null. */
    maillageMonde(id) {
      const affiche = affiches.get(id);
      if (affiche === undefined) return null;
      const geometrie = affiche.maillage3d.geometry;
      const source = geometrie.getAttribute("position");
      if (source === undefined || geometrie.index === null) return null;
      affiche.maillage3d.updateWorldMatrix(true, false);
      const m = affiche.maillage3d.matrixWorld;
      const positions = new Float32Array(source.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < source.count; i += 1) {
        v.fromBufferAttribute(source, i).applyMatrix4(m);
        positions[i * 3] = v.x;
        positions[i * 3 + 1] = v.y;
        positions[i * 3 + 2] = v.z;
      }
      return { positions, indices: geometrie.index.array };
    },

    maillages3d() {
      return [...affiches.values()].map((affiche) => affiche.maillage3d);
    },

    boiteMonde(id) {
      const affiche = affiches.get(id);
      if (affiche === undefined) return null;
      affiche.maillage3d.updateWorldMatrix(true, false);
      const boite = new THREE.Box3().setFromObject(affiche.maillage3d);
      return boite.isEmpty() ? null : boite;
    },

    boiteDes(ids) {
      const boite = new THREE.Box3();
      for (const id of ids) {
        const une = this.boiteMonde(id);
        if (une !== null) boite.union(une);
      }
      return boite;
    },

    identifiants: () => [...affiches.keys()],
    nombreDeTriangles: () => triangles,
  };
}
