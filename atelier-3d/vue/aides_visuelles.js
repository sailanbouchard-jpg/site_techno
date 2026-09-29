/*
 * vue/aides_visuelles.js
 * ──────────────────────
 * Ce que la scène dessine pour aider sans faire partie du projet : les traits
 * d'aimantation pendant un glisser, le point de contact du mode « Poser », et
 * ce qu'une opération en cours veut montrer (le plan d'une symétrie, l'axe
 * d'une répétition, un centre).
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

// Les traits flottent un rien au-dessus du sol pour ne pas scintiller avec la grille.
const DECOLLEMENT_MM = 0.05;
const TAILLE_DU_POINT_DE_CONTACT_PX = 7;
const TAILLE_DU_POINT_D_OPERATION_PX = 12;
// Les points de référence à choisir : à peine plus gros que dans l'esquisse, et un peu plus sous la souris.
const TAILLE_REFERENCE_PX = 8;
const TAILLE_REFERENCE_SURVOLEE_PX = 11;
const OPACITE_PLAN_D_OPERATION = 0.22;
const SEGMENTS_DU_CERCLE = 96;

/* Une base (u, v) perpendiculaire à la normale n. */
function baseDuPlan(normale) {
  const n = new THREE.Vector3(...normale).normalize();
  const appui = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(appui, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  return { n, u, v };
}

export function creerAidesVisuelles(scene3d, couleurs) {
  const groupe = new THREE.Group();
  groupe.name = "aides_visuelles";
  scene3d.add(groupe);

  const materiauGuide = new THREE.LineDashedMaterial({
    color: new THREE.Color(couleurs.guide), dashSize: 2, gapSize: 1.2, depthTest: false, transparent: true,
  });
  const materiauContact = new THREE.PointsMaterial({
    color: new THREE.Color(couleurs.selection), size: TAILLE_DU_POINT_DE_CONTACT_PX,
    sizeAttenuation: false, depthTest: false, transparent: true,
  });

  const contact = new THREE.Points(new THREE.BufferGeometry(), materiauContact);
  contact.geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  contact.renderOrder = 5;
  contact.visible = false;
  groupe.add(contact);

  let traits = [];

  // ── Aides d'une opération, ou d'un outil (la mesure) ──
  const canaux = { operation: new THREE.Group(), outil: new THREE.Group() };
  groupe.add(canaux.operation, canaux.outil);
  const couleurOperation = new THREE.Color(couleurs.guide);
  const materiaux = {
    plan: new THREE.MeshBasicMaterial({
      color: couleurOperation, transparent: true, opacity: OPACITE_PLAN_D_OPERATION, side: THREE.DoubleSide, depthWrite: false,
    }),
    trait: new THREE.LineBasicMaterial({ color: couleurOperation, depthTest: false, transparent: true }),
    pointille: new THREE.LineDashedMaterial({ color: couleurOperation, dashSize: 2, gapSize: 1.5, depthTest: false, transparent: true }),
    point: new THREE.PointsMaterial({
      color: couleurOperation, size: TAILLE_DU_POINT_D_OPERATION_PX, sizeAttenuation: false, depthTest: false, transparent: true,
    }),
    reference: new THREE.PointsMaterial({
      color: new THREE.Color(couleurs.reference), size: TAILLE_REFERENCE_PX, sizeAttenuation: false, depthTest: false, transparent: true,
    }),
    referenceForte: new THREE.PointsMaterial({
      color: new THREE.Color(couleurs.reference), size: TAILLE_REFERENCE_SURVOLEE_PX, sizeAttenuation: false, depthTest: false, transparent: true,
    }),
  };

  function ligne(points, materiau) {
    const objet = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), materiau);
    objet.computeLineDistances();
    objet.renderOrder = 6;
    return objet;
  }

  const DESSINS = {
    /* { centre, normale, taille } : un carré translucide et son contour. */
    plan({ centre, normale, taille }) {
      const { u, v } = baseDuPlan(normale);
      const c = new THREE.Vector3(...centre);
      const coins = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) =>
        c.clone().addScaledVector(u, (a * taille) / 2).addScaledVector(v, (b * taille) / 2));
      const surface = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([coins[0], coins[1], coins[2], coins[0], coins[2], coins[3]]), materiaux.plan);
      surface.renderOrder = 5;
      return [surface, ligne([...coins, coins[0]], materiaux.trait)];
    },
    /* { depart, arrivee } : une flèche en trait plein. */
    fleche({ depart, arrivee }) {
      const a = new THREE.Vector3(...depart);
      const b = new THREE.Vector3(...arrivee);
      const longueur = a.distanceTo(b);
      if (longueur < 1e-6) return [];
      const direction = b.clone().sub(a).normalize();
      const { u } = baseDuPlan(direction.toArray());
      const pointe = Math.min(longueur * 0.3, 6);
      const recul = b.clone().addScaledVector(direction, -pointe);
      return [ligne([a, b], materiaux.trait),
        ligne([recul.clone().addScaledVector(u, pointe / 2), b, recul.clone().addScaledVector(u, -pointe / 2)], materiaux.trait)];
    },
    /* { centre, normale, rayon } : le chemin des copies, en pointillés. */
    cercle({ centre, normale, rayon }) {
      const { u, v } = baseDuPlan(normale);
      const c = new THREE.Vector3(...centre);
      const points = [];
      for (let i = 0; i <= SEGMENTS_DU_CERCLE; i += 1) {
        const angle = (i / SEGMENTS_DU_CERCLE) * Math.PI * 2;
        points.push(c.clone().addScaledVector(u, rayon * Math.cos(angle)).addScaledVector(v, rayon * Math.sin(angle)));
      }
      return [ligne(points, materiaux.pointille)];
    },
    /* { points, ferme?, fort? } : une arête choisie (fort : celle sous la souris). */
    arete({ points, ferme, fort }) {
      const sommets = points.map((p) => new THREE.Vector3(...p));
      if (ferme) sommets.push(sommets[0]);
      const trait = ligne(sommets, fort ? materiaux.trait : materiaux.pointille);
      trait.renderOrder = 8;
      return [trait];
    },
    /* { position } : un gros point. */
    point({ position }) {
      const objet = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
        new THREE.Float32BufferAttribute(position, 3)), materiaux.point);
      objet.renderOrder = 7;
      return [objet];
    },
    /* { triangles } : une face de pièce, peinte pour la désigner. */
    surface({ triangles }) {
      const sommets = triangles.flatMap((t) => t.map((p) => new THREE.Vector3(...p)));
      const objet = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(sommets), materiaux.plan);
      objet.renderOrder = 5;
      return [objet];
    },
    /* { position, fort? } : un point de référence d'esquisse (fort : celui sous la souris). */
    reference({ position, fort }) {
      const objet = new THREE.Points(new THREE.BufferGeometry().setAttribute("position",
        new THREE.Float32BufferAttribute(position, 3)), fort ? materiaux.referenceForte : materiaux.reference);
      objet.renderOrder = 7;
      return [objet];
    },
    /* { de, a } : un trait en pointillés (un axe). */
    axe({ de, a }) {
      return [ligne([new THREE.Vector3(...de), new THREE.Vector3(...a)], materiaux.pointille)];
    },
  };

  return {
    montrerGuides(guides, hauteur = 0) {
      for (const trait of traits) {
        groupe.remove(trait);
        trait.geometry.dispose();
      }
      traits = guides.map(({ de, a }) => {
        const geometrie = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(de[0], de[1], hauteur + DECOLLEMENT_MM),
          new THREE.Vector3(a[0], a[1], hauteur + DECOLLEMENT_MM),
        ]);
        const trait = new THREE.Line(geometrie, materiauGuide);
        trait.computeLineDistances();
        trait.renderOrder = 4;
        groupe.add(trait);
        return trait;
      });
    },

    montrerContact(point) {
      contact.visible = point !== null;
      if (point !== null) contact.position.set(point[0], point[1], point[2]);
    },

    /* aides : [{ genre: "plan" | "fleche" | "cercle" | "point" | "axe", … }] ; canal : "operation" | "outil" */
    montrerOperation(aides, canal) {
      const cible = canaux[canal];
      for (const objet of [...cible.children]) {
        cible.remove(objet);
        objet.geometry.dispose();
      }
      for (const aide of aides) cible.add(...DESSINS[aide.genre](aide));
    },

    effacer() {
      this.montrerGuides([]);
      this.montrerContact(null);
    },

    // Les aides ne doivent jamais apparaître dans une vignette de projet.
    cacherPendant(action) {
      const visible = groupe.visible;
      groupe.visible = false;
      try {
        return action();
      } finally {
        groupe.visible = visible;
      }
    },
  };
}
