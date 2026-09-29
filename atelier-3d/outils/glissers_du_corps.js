/*
 * outils/glissers_du_corps.js
 * ───────────────────────────
 * Ce qui se passe quand on attrape l'objet lui-même, selon le mode :
 *   - Poser : l'objet vient se coller à la face sous la souris, ou au sol, en
 *     gardant l'angle qu'on lui a donné — c'est le changement de repère entre
 *     son ancienne surface et la nouvelle qui s'applique ;
 *   - Libre : en 3D, il glisse à l'horizontale, à sa hauteur ; seules les
 *     flèches changent sa hauteur. En vue à plat (Face, Droite…), il glisse
 *     dans le plan de l'écran : il peut donc monter et descendre.
 * Même contrat que les glissers du gizmo : des transformations proposées,
 * jamais une écriture dans le document.
 *
 * Aimantation : au sol, la pièce s'aligne sur ses voisines ; la touche Alt la
 * coupe tant qu'elle est enfoncée.
 */

import { reposerSurNormale } from "../noyau/transformations.js";
import { aimanter, arrondirAuPas, deplacerBoite } from "./aimantation.js";

const NORMALE_DU_SOL = [0, 0, 1];
const SEUIL_AIMANTATION_PX = 8;
const PAS_DE_GRILLE_MM = 1;
const nombre = (valeur) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function boitesVoisines(contexte, exclus) {
  return contexte.objetsAffiches()
    .filter((id) => !exclus.has(id))
    .map((id) => contexte.scene.boiteMonde(id))
    .filter((boite) => boite !== null);
}

/* Décalage commun : tous les objets sélectionnés suivent le principal, seul à
   changer d'orientation. pose : ce que le mode réécrit sur lui, rotation et
   appui, ou rien du tout. */
function avecDecalage(depart, principal, positionDuPrincipal, pose) {
  const p0 = depart.get(principal).position;
  const [dx, dy, dz] = [positionDuPrincipal.x - p0.x, positionDuPrincipal.y - p0.y, positionDuPrincipal.z - p0.z];
  const resultat = new Map();
  for (const [id, t] of depart) {
    const position = {
      x: arrondirAuPas(t.position.x + dx, 1e-6),
      y: arrondirAuPas(t.position.y + dy, 1e-6),
      z: arrondirAuPas(t.position.z + dz, 1e-6),
    };
    resultat.set(id, id === principal ? { ...t, position, ...pose } : { ...t, position });
  }
  return resultat;
}

/* Au sol : pas d'un millimètre, puis alignement sur les voisines s'il y en a
   une assez proche. Rend le déplacement corrigé et les traits d'aide. */
function aimanterAuSol(contexte, boiteDepart, dx, dy, voisines, libre, point) {
  if (libre) return { dx, dy, guides: [] };
  let [cx, cy] = [arrondirAuPas(dx, PAS_DE_GRILLE_MM), arrondirAuPas(dy, PAS_DE_GRILLE_MM)];
  const seuil = SEUIL_AIMANTATION_PX * contexte.scene.millimetresParPixel(point);
  const aimant = aimanter(deplacerBoite(boiteDepart, cx, cy), voisines, seuil);
  cx += aimant.dx;
  cy += aimant.dy;
  return { dx: cx, dy: cy, guides: aimant.guides };
}

// ── Poser ───────────────────────────────────────────────────────────────────

export function glisserEnPosant(appui, contexte, depart) {
  const principal = appui.cible.id;
  const t0 = depart.get(principal);
  const exclus = new Set(depart.keys());
  const voisines = boitesVoisines(contexte, exclus);
  const boiteDepart = contexte.scene.boiteMonde(principal);

  // Au sol, on garde l'écart entre le point saisi et le pied de l'objet : sinon
  // l'objet sauterait sous la souris dès le premier mouvement.
  const solDepart = contexte.scene.pointAuSol(appui.x, appui.y) ?? [t0.position.x, t0.position.y, 0];
  const ecart = [t0.position.x - solDepart[0], t0.position.y - solDepart[1]];
  let texte = "";

  return {
    deplacer(ev) {
      const { orienter = true, enfoncement = 0 } = contexte.options();
      const touche = contexte.scene.objetSous(ev.clientX, ev.clientY, exclus);

      if (touche !== null) {
        // Sur une face : le pied de l'objet vient au point touché, puis
        // s'enfonce le long de la normale.
        const [nx, ny, nz] = touche.normale;
        const pose = orienter
          ? { rotation: reposerSurNormale(t0.rotation, t0.appui, touche.normale), appui: { x: nx, y: ny, z: nz } }
          : {};
        const position = {
          x: touche.point[0] - nx * enfoncement,
          y: touche.point[1] - ny * enfoncement,
          z: touche.point[2] - nz * enfoncement,
        };
        contexte.scene.montrerGuides([]);
        contexte.scene.montrerContact(touche.point);
        texte = "Posé sur « " + contexte.nomDe(touche.id) + " »";
        return avecDecalage(depart, principal, position, pose);
      }

      const sol = contexte.scene.pointAuSol(ev.clientX, ev.clientY);
      if (sol === null) return null;
      const pose = orienter
        ? { rotation: reposerSurNormale(t0.rotation, t0.appui, NORMALE_DU_SOL), appui: { x: 0, y: 0, z: 1 } }
        : {};
      const brut = { dx: sol[0] + ecart[0] - t0.position.x, dy: sol[1] + ecart[1] - t0.position.y };
      const aimante = aimanterAuSol(contexte, boiteDepart, brut.dx, brut.dy, voisines, ev.altKey, sol);
      contexte.scene.montrerGuides(aimante.guides);
      contexte.scene.montrerContact(null);

      const position = { x: t0.position.x + aimante.dx, y: t0.position.y + aimante.dy, z: -enfoncement };
      texte = "X " + nombre(position.x) + "   Y " + nombre(position.y) + " mm";
      return avecDecalage(depart, principal, position, pose);
    },
    mesure: () => texte,
  };
}

// ── Libre ───────────────────────────────────────────────────────────────────

export function glisserLibrement(appui, contexte, depart) {
  const principal = appui.cible.id;
  const t0 = depart.get(principal);
  const saisie = appui.cible.point;
  const voisines = boitesVoisines(contexte, new Set(depart.keys()));
  const boiteDepart = contexte.scene.boiteMonde(principal);
  // Vue de face, de dos ou de côté : le plan de l'écran est vertical.
  const normaleEcran = contexte.scene.normaleDeLaVueAPlat();
  const dansLePlanDeLEcran = normaleEcran !== null && normaleEcran[2] === 0;
  let texte = "";

  const ecrire = (position) => {
    texte = "X " + nombre(position.x) + "   Y " + nombre(position.y) + "   Z " + nombre(position.z) + " mm";
    return avecDecalage(depart, principal, position, {});
  };

  return {
    deplacer(ev) {
      if (dansLePlanDeLEcran) {
        // La pièce suit la souris dans le plan de l'écran, au millimètre (Alt : sans pas).
        const point = contexte.scene.pointSurPlan(ev.clientX, ev.clientY, saisie, normaleEcran);
        if (point === null) return null;
        const d = [0, 1, 2].map((i) => (normaleEcran[i] !== 0 ? 0
          : (ev.altKey ? point[i] - saisie[i] : arrondirAuPas(point[i] - saisie[i], PAS_DE_GRILLE_MM))));
        return ecrire({ x: t0.position.x + d[0], y: t0.position.y + d[1], z: t0.position.z + d[2] });
      }

      // Le plan horizontal du point saisi : la pièce suit la souris sans changer de hauteur.
      const point = contexte.scene.pointSurPlan(ev.clientX, ev.clientY, saisie, NORMALE_DU_SOL);
      if (point === null) return null;
      const aimante = aimanterAuSol(contexte, boiteDepart, point[0] - saisie[0], point[1] - saisie[1], voisines, ev.altKey, point);
      contexte.scene.montrerGuides(aimante.guides, boiteDepart.min[2]);

      return ecrire({ x: t0.position.x + aimante.dx, y: t0.position.y + aimante.dy, z: t0.position.z });
    },
    mesure: () => texte,
  };
}
