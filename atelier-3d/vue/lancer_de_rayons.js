/*
 * vue/lancer_de_rayons.js
 * ───────────────────────
 * Ce qu'il y a sous la souris. Les outils posent des questions simples — quel
 * objet, quel point du sol, où sur cet axe — et reçoivent des nombres, jamais
 * des objets three.js.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { chainesDAretes } from "./aretes_du_maillage.js";

const enTableau = (v) => [v.x, v.y, v.z];

/* camera() : la caméra active, perspective ou à plat ; coupe() : le
   THREE.Plane de la vue en coupe, ou null. */
export function creerLancerDeRayons(camera, canvas, coupe = () => null) {
  const rayon = new THREE.Raycaster();
  const pointeur = new THREE.Vector2();
  const matriceNormale = new THREE.Matrix3();

  function viser(xEcran, yEcran) {
    const cadre = canvas.getBoundingClientRect();
    pointeur.set(
      ((xEcran - cadre.left) / cadre.width) * 2 - 1,
      -((yEcran - cadre.top) / cadre.height) * 2 + 1,
    );
    rayon.setFromCamera(pointeur, camera());
    return rayon.ray;
  }

  /* Les objets touchés, sans ce que la vue en coupe a retiré : on clique au
     travers, sur ce qui se voit. */
  function touches(maillages3d) {
    const plan = coupe();
    const toutes = rayon.intersectObjects(maillages3d, false);
    return plan === null ? toutes : toutes.filter((t) => plan.distanceToPoint(t.point) >= -1e-6);
  }

  return {
    /*
     * L'arête vive sous la souris, sur l'objet visé : { id, arete: { points,
     * n1, n2, ferme }, saillante } dans le repère du monde, ou null. On ne
     * prend que les arêtes visibles — pas celles cachées derrière la pièce.
     */
    areteSous(xEcran, yEcran, maillages3d, tolerancePx) {
      viser(xEcran, yEcran);
      const touche = touches(maillages3d).find((t) => t.face && t.object.userData.idNoeud !== undefined);
      if (touche === undefined) return null;
      const objet = touche.object;
      const cadre = canvas.getBoundingClientRect();
      const cam = camera();
      const versEcran = (p) => {
        const v = new THREE.Vector3(...p).project(cam);
        return [(v.x + 1) / 2 * cadre.width + cadre.left, (1 - v.y) / 2 * cadre.height + cadre.top];
      };
      objet.updateWorldMatrix(true, false);
      matriceNormale.getNormalMatrix(objet.matrixWorld);
      const monde = (p) => enTableau(new THREE.Vector3(...p).applyMatrix4(objet.matrixWorld));
      const normaleMonde = (n) => enTableau(new THREE.Vector3(...n).applyMatrix3(matriceNormale).normalize());
      const oeil = cam.getWorldPosition(new THREE.Vector3());
      let meilleure = null;
      let ecart = tolerancePx;
      for (const chaine of chainesDAretes(objet.geometry)) {
        const pts = chaine.points.map(monde);
        const nombre = chaine.ferme ? pts.length : pts.length - 1;
        for (let i = 0; i < nombre; i += 1) {
          const [a, b] = [pts[i], pts[(i + 1) % pts.length]];
          const [ea, eb] = [versEcran(a), versEcran(b)];
          const [dx, dy] = [eb[0] - ea[0], eb[1] - ea[1]];
          const l2 = dx * dx + dy * dy;
          const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((xEcran - ea[0]) * dx + (yEcran - ea[1]) * dy) / l2));
          const d = Math.hypot(xEcran - ea[0] - t * dx, yEcran - ea[1] - t * dy);
          if (d > ecart) continue;
          // Cachée derrière la face touchée ? Alors ce n'est pas celle qu'on voit.
          const point = new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
          if (point.distanceTo(oeil) > touche.distance * 1.02 + 0.5) continue;
          ecart = d;
          meilleure = { chaine, pts };
        }
      }
      if (meilleure === null) return null;
      return {
        id: objet.userData.idNoeud,
        saillante: meilleure.chaine.saillante,
        arete: {
          points: meilleure.pts,
          n1: meilleure.chaine.n1.map(normaleMonde),
          n2: meilleure.chaine.n2.map(normaleMonde),
          ferme: meilleure.chaine.ferme,
        },
      };
    },

    rayonDepuisEcran(xEcran, yEcran) {
      viser(xEcran, yEcran);
      return rayon;
    },

    /*
     * Le premier objet touché, hors des identifiants exclus (l'objet qu'on
     * déplace ne doit pas se poser sur lui-même). La normale est celle de la
     * face touchée, dans le repère du monde, tournée vers la caméra.
     */
    objetSous(xEcran, yEcran, maillages3d, exclus = new Set()) {
      const direction = viser(xEcran, yEcran).direction;
      for (const touche of touches(maillages3d)) {
        const id = touche.object.userData.idNoeud;
        if (id === undefined || exclus.has(id) || !touche.face) continue;

        // Une échelle non uniforme déforme les normales : il faut la matrice
        // normale, pas la matrice de l'objet.
        matriceNormale.getNormalMatrix(touche.object.matrixWorld);
        const normale = touche.face.normal.clone().applyMatrix3(matriceNormale).normalize();
        if (normale.dot(direction) > 0) normale.negate();   // face vue de dos

        return { id, point: enTableau(touche.point), normale: enTableau(normale), distance: touche.distance };
      }
      return null;
    },

    /*
     * Le centre de la face plate touchée : les triangles de même plan, reliés
     * au triangle touché par leurs sommets : le milieu du côté visé, pas celui
     * de toute la pièce. Rend [x, y, z], ou null si ce milieu n'est pas sur la
     * face (une face en L) : l'appelant garde alors le point cliqué.
     */
    centreDeLaFaceSous(xEcran, yEcran, maillages3d, exclus = new Set()) {
      viser(xEcran, yEcran);
      const touche = touches(maillages3d)
        .find((t) => t.face && t.object.userData.idNoeud !== undefined && !exclus.has(t.object.userData.idNoeud));
      if (touche === undefined || touche.object.geometry.index === null) return null;
      const geometrie = touche.object.geometry;
      const positions = geometrie.getAttribute("position");
      const indices = geometrie.index.array;
      const sommet = (i) => new THREE.Vector3().fromBufferAttribute(positions, i);
      const normale = touche.face.normal;
      const niveau = normale.dot(sommet(touche.face.a));
      const cle = (i) => sommet(i).toArray().map((c) => c.toFixed(4)).join(",");

      // Les triangles du même plan, rangés par sommet (repéré par sa position).
      const parSommet = new Map();
      const coplanaires = new Set();
      const triangle = new THREE.Triangle();
      const n = new THREE.Vector3();
      for (let t = 0; t < indices.length / 3; t += 1) {
        const [a, b, c] = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
        triangle.set(sommet(a), sommet(b), sommet(c)).getNormal(n);
        if (n.dot(normale) < 0.999 || Math.abs(normale.dot(triangle.a) - niveau) > 1e-3) continue;
        coplanaires.add(t);
        for (const i of [a, b, c]) {
          const k = cle(i);
          if (!parSommet.has(k)) parSommet.set(k, []);
          parSommet.get(k).push(t);
        }
      }

      // De proche en proche depuis le triangle touché.
      const vus = new Set([touche.faceIndex]);
      const pile = [touche.faceIndex];
      const boite = new THREE.Box3();
      while (pile.length > 0) {
        const t = pile.pop();
        for (const i of [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]]) {
          boite.expandByPoint(sommet(i));
          for (const voisin of parSommet.get(cle(i)) ?? []) {
            if (!vus.has(voisin) && coplanaires.has(voisin)) {
              vus.add(voisin);
              pile.push(voisin);
            }
          }
        }
      }
      // Sur une face en L, le centre de sa boîte tombe dans le vide : on ne le garde que s'il est sur la face.
      const centre = boite.getCenter(new THREE.Vector3());
      const proche = new THREE.Vector3();
      const surLaFace = [...vus].some((t) => triangle
        .set(sommet(indices[t * 3]), sommet(indices[t * 3 + 1]), sommet(indices[t * 3 + 2]))
        .closestPointToPoint(centre, proche)
        .distanceTo(centre) < 1e-3);
      return surLaFace ? enTableau(centre.applyMatrix4(touche.object.matrixWorld)) : null;
    },

    /* Un point du monde, en pixels de la page. */
    versEcran([x, y, z]) {
      const cadre = canvas.getBoundingClientRect();
      const p = new THREE.Vector3(x, y, z).project(camera());
      return [cadre.left + ((p.x + 1) / 2) * cadre.width, cadre.top + ((1 - p.y) / 2) * cadre.height];
    },

    /*
     * Le point visé sur un objet, aimanté au coin de la face touchée s'il est
     * à moins de tolerancePx : on mesure d'un coin à l'autre sans trembler.
     * Rend { point, sommet: bool, id } ou null.
     */
    pointAccroche(xEcran, yEcran, maillages3d, tolerancePx) {
      viser(xEcran, yEcran);
      const touche = touches(maillages3d).find((t) => t.face && t.object.userData.idNoeud !== undefined);
      if (touche === undefined) return null;
      const positions = touche.object.geometry.getAttribute("position");
      let meilleur = null;
      for (const indice of [touche.face.a, touche.face.b, touche.face.c]) {
        const sommet = new THREE.Vector3().fromBufferAttribute(positions, indice).applyMatrix4(touche.object.matrixWorld);
        const [sx, sy] = this.versEcran(enTableau(sommet));
        const ecart = Math.hypot(sx - xEcran, sy - yEcran);
        if (ecart <= tolerancePx && (meilleur === null || ecart < meilleur.ecart)) meilleur = { ecart, sommet };
      }
      const id = touche.object.userData.idNoeud;
      return meilleur === null
        ? { point: enTableau(touche.point), sommet: false, id }
        : { point: enTableau(meilleur.sommet), sommet: true, id };
    },

    pointSurPlan(xEcran, yEcran, [px, py, pz], [nx, ny, nz]) {
      const plan = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(nx, ny, nz).normalize(), new THREE.Vector3(px, py, pz));
      const point = viser(xEcran, yEcran).intersectPlane(plan, new THREE.Vector3());
      return point === null ? null : enTableau(point);
    },

    pointAuSol(xEcran, yEcran, hauteur = 0) {
      return this.pointSurPlan(xEcran, yEcran, [0, 0, hauteur], [0, 0, 1]);
    },

    /* Le plan qui passe par un point et fait face à l'écran : celui du mode Libre. */
    pointFaceAEcran(xEcran, yEcran, point) {
      const face = camera().getWorldDirection(new THREE.Vector3()).negate();
      return this.pointSurPlan(xEcran, yEcran, point, enTableau(face));
    },

    /*
     * Où, le long d'une droite (origine + t·direction), se trouve le point le
     * plus proche du rayon de la souris. Rend t en millimètres, ou null si la
     * droite est vue exactement de face.
     */
    parametreSurAxe(xEcran, yEcran, [ox, oy, oz], [dx, dy, dz]) {
      const r = viser(xEcran, yEcran);
      const u = new THREE.Vector3(dx, dy, dz).normalize();
      const w0 = new THREE.Vector3(ox, oy, oz).sub(r.origin);
      const b = u.dot(r.direction);
      const denominateur = 1 - b * b;
      if (denominateur < 1e-6) return null;
      return (b * w0.dot(r.direction) - w0.dot(u)) / denominateur;
    },

    /* Combien de millimètres couvre un pixel à cette distance de la caméra :
       sert à régler l'aimantation et la taille des poignées sur le zoom. */
    millimetresParPixel(point) {
      const appareil = camera();
      // À plat, l'échelle est la même partout, quelle que soit la profondeur.
      if (appareil.isOrthographicCamera) return (appareil.top - appareil.bottom) / appareil.zoom / canvas.clientHeight;
      const distance = appareil.position.distanceTo(new THREE.Vector3(...point));
      const hauteurVue = 2 * distance * Math.tan(THREE.MathUtils.degToRad(appareil.fov) / 2);
      return hauteurVue / canvas.clientHeight;
    },
  };
}
