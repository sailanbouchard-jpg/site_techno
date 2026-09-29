/*
 * outils/glissers_du_gizmo.js
 * ───────────────────────────
 * Ce qui se passe quand on attrape une poignée : flèche, anneau ou coin.
 * Chaque glisser rend, à chaque mouvement, les nouvelles transformations des
 * objets concernés — sans rien écrire dans le document. C'est la manipulation
 * commune qui en fera UNE commande, au relâcher.
 *
 * Un glisser : { deplacer(evenement) → Map(id → transformation), mesure() → texte }
 */

import {
  tournerAutourDUnPoint, matriceDeTransformation, appliquerAuPoint, inverser, axeDeLObjet,
} from "../noyau/transformations.js";
import { arrondirAuPas } from "./aimantation.js";

const VECTEURS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const PAS_DE_DEPLACEMENT_MM = 1;
const PAS_DE_COTE_MM = 1;
const COTE_MINIMALE_MM = 0.1;
const DEGRES = 180 / Math.PI;

const signe = (valeur) => (valeur >= 0 ? "+" : "−") + Math.abs(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const nombre = (valeur) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const centreDe = (boite) => [0, 1, 2].map((i) => (boite.min[i] + boite.max[i]) / 2);
const scalaire = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

// ── Flèches : glisser le long d'un axe du monde ─────────────────────────────

/* Sous la sélection, pendant qu'elle monte ou descend : un trait jusqu'au sol
   et la hauteur de son point le plus bas. */
function montrerLaHauteur(contexte, boites, deplacement) {
  const bas = Math.min(...boites.map((b) => b.min[2])) + deplacement;
  const cx = boites.reduce((s, b) => s + (b.min[0] + b.max[0]) / 2, 0) / boites.length;
  const cy = boites.reduce((s, b) => s + (b.min[1] + b.max[1]) / 2, 0) / boites.length;
  contexte.scene.montrerAidesOutil([
    { genre: "axe", de: [cx, cy, bas], a: [cx, cy, 0] },
    { genre: "point", position: [cx, cy, 0] },
  ]);
  const texte = bas >= 0 ? "Hauteur au sol : " + nombre(Math.abs(bas)) + " mm" : "Sous le sol : " + nombre(Math.abs(bas)) + " mm";
  contexte.etiqueter([cx, cy, bas / 2], texte);
}

export function glisserFleche(axe, evenement, contexte, depart) {
  const [principal] = depart.keys();
  const { position } = depart.get(principal);
  const origine = [position.x, position.y, position.z];
  const t0 = contexte.scene.parametreSurAxe(evenement.clientX, evenement.clientY, origine, VECTEURS[axe]);
  let deplacement = 0;
  // Les boîtes de départ : la hauteur au sol se lit sous la pièce, en direct.
  const boites = axe === "z" ? [...depart.keys()].map((id) => contexte.scene.boiteMonde(id)).filter((b) => b !== null) : [];

  return {
    deplacer(ev) {
      const t = contexte.scene.parametreSurAxe(ev.clientX, ev.clientY, origine, VECTEURS[axe]);
      if (t === null || t0 === null) return null;
      const pas = contexte.options().pas ?? PAS_DE_DEPLACEMENT_MM;
      deplacement = ev.altKey ? t - t0 : arrondirAuPas(t - t0, pas);

      const resultat = new Map();
      for (const [id, transformation] of depart) {
        const nouvelle = { ...transformation.position };
        nouvelle[axe] = arrondirAuPas(nouvelle[axe] + deplacement, 1e-6);
        resultat.set(id, { ...transformation, position: nouvelle });
      }
      if (boites.length > 0) montrerLaHauteur(contexte, boites, deplacement);
      return resultat;
    },
    mesure: () => "Déplacement " + axe.toUpperCase() + " : " + signe(deplacement) + " mm",
  };
}

// ── Anneaux : tourner autour des axes de l'objet ────────────────────────────

// Les deux autres axes, dans l'ordre qui donne le sens direct autour du premier.
const PLAN_DE_L_AXE = { x: ["y", "z"], y: ["z", "x"], z: ["x", "y"] };

export function glisserAnneau(axe, evenement, contexte, depart) {
  const [principal] = depart.keys();
  const t0 = depart.get(principal);
  // Le centre de la pièce elle-même, pas celui de sa boîte dans le monde : il
  // ne bouge pas quand elle tourne, la boîte du monde, si.
  const centre = appliquerAuPoint(matriceDeTransformation(t0), centreDe(contexte.scene.boiteLocale(principal)));
  const normale = axeDeLObjet(t0.rotation, axe);
  const [u, v] = PLAN_DE_L_AXE[axe].map((autre) => axeDeLObjet(t0.rotation, autre));
  const angleDansLePlan = (point) => {
    const d = [point[0] - centre[0], point[1] - centre[1], point[2] - centre[2]];
    return Math.atan2(scalaire(d, v), scalaire(d, u));
  };
  const point0 = contexte.scene.pointSurPlan(evenement.clientX, evenement.clientY, centre, normale);
  const angle0 = point0 === null ? 0 : angleDansLePlan(point0);
  let precedent = 0;
  let cumul = 0;
  let affiche = 0;

  return {
    deplacer(ev) {
      const point = contexte.scene.pointSurPlan(ev.clientX, ev.clientY, centre, normale);
      if (point === null || point0 === null) return null;

      // On déroule l'angle : passer de 179° à −179° est un pas de 2°, pas de 358°.
      let brut = (angleDansLePlan(point) - angle0) * DEGRES;
      while (brut - precedent > 180) brut -= 360;
      while (brut - precedent < -180) brut += 360;
      cumul += brut - precedent;
      precedent = brut;

      const pas = contexte.options().pasDeRotation ?? 15;
      affiche = ev.shiftKey ? cumul : arrondirAuPas(cumul, pas);
      return new Map([[principal, tournerAutourDUnPoint(t0, axe, affiche, centre)]]);
    },
    mesure: () => "Rotation " + axe.toUpperCase() + " : " + signe(affiche) + "°",
  };
}

// ── Poignées de taille ──────────────────────────────────────────────────────

/* Le point opposé à la poignée reste fixe : on recale la position pour que ce
   point ne bouge pas malgré le changement d'échelle. */
function avecPointFixe(depart, nouvelleEchelle, pointLocal) {
  const avant = appliquerAuPoint(matriceDeTransformation(depart), pointLocal);
  const apres = appliquerAuPoint(matriceDeTransformation({ ...depart, echelle: nouvelleEchelle }), pointLocal);
  return {
    ...depart,
    echelle: nouvelleEchelle,
    position: {
      x: arrondirAuPas(depart.position.x + avant[0] - apres[0], 1e-6),
      y: arrondirAuPas(depart.position.y + avant[1] - apres[1], 1e-6),
      z: arrondirAuPas(depart.position.z + avant[2] - apres[2], 1e-6),
    },
  };
}

function echelleArrondie(echelleDepart, tailleLocale, rapport, libre) {
  const cote = Math.max(COTE_MINIMALE_MM, Math.abs(echelleDepart) * tailleLocale * rapport);
  const arrondi = libre ? cote : Math.max(PAS_DE_COTE_MM, arrondirAuPas(cote, PAS_DE_COTE_MM));
  return Math.sign(echelleDepart || 1) * (arrondi / tailleLocale);
}

export function glisserPoignee(coin, evenement, contexte, depart) {
  const [principal] = depart.keys();
  const t0 = depart.get(principal);
  const { min, max } = contexte.scene.boiteLocale(principal);
  const taille = [max[0] - min[0] || 1, max[1] - min[1] || 1, max[2] - min[2] || 1];
  const centreBase = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];

  // Le repère de DÉPART, figé : pendant le glisser, l'objet affiché est un
  // aperçu dont l'échelle change à chaque mouvement.
  const matrice = matriceDeTransformation(t0);
  const inverse = inverser(matrice);
  const baseMonde = appliquerAuPoint(matrice, centreBase);
  const axeZ = [matrice[2], matrice[6], matrice[10]];
  const longueurZ = Math.hypot(...axeZ) || 1;
  const normaleDeBase = axeZ.map((v) => v / longueurZ);
  const hauteur0 = coin === "haut"
    ? contexte.scene.parametreSurAxe(evenement.clientX, evenement.clientY, baseMonde, normaleDeBase)
    : null;
  let echelle = t0.echelle;

  const cotes = () => [echelle.x * taille[0], echelle.y * taille[1], echelle.z * taille[2]].map(Math.abs);

  return {
    deplacer(ev) {
      const libre = ev.altKey;

      if (coin === "haut") {
        const t = contexte.scene.parametreSurAxe(ev.clientX, ev.clientY, baseMonde, normaleDeBase);
        if (t === null || hauteur0 === null) return null;
        const rapport = 1 + (t - hauteur0) / (Math.abs(t0.echelle.z) * taille[2]);
        const rz = Math.max(rapport, 1e-3);
        echelle = ev.shiftKey
          ? { x: echelleArrondie(t0.echelle.x, taille[0], rz, libre), y: echelleArrondie(t0.echelle.y, taille[1], rz, libre), z: echelleArrondie(t0.echelle.z, taille[2], rz, libre) }
          : { ...t0.echelle, z: echelleArrondie(t0.echelle.z, taille[2], rz, libre) };
        return new Map([[principal, avecPointFixe(t0, echelle, centreBase)]]);
      }

      const point = contexte.scene.pointSurPlan(ev.clientX, ev.clientY, baseMonde, normaleDeBase);
      if (point === null || inverse === null) return null;
      const local = appliquerAuPoint(inverse, point);
      const fixe = [coin.sx < 0 ? max[0] : min[0], coin.sy < 0 ? max[1] : min[1], min[2]];
      const rx = Math.max(((local[0] - fixe[0]) * coin.sx) / taille[0], 1e-3);
      const ry = Math.max(((local[1] - fixe[1]) * coin.sy) / taille[1], 1e-3);

      if (ev.shiftKey) {
        const r = Math.max(rx, ry);
        echelle = {
          x: echelleArrondie(t0.echelle.x, taille[0], r, libre),
          y: echelleArrondie(t0.echelle.y, taille[1], r, libre),
          z: echelleArrondie(t0.echelle.z, taille[2], r, libre),
        };
      } else {
        echelle = {
          ...t0.echelle,
          x: echelleArrondie(t0.echelle.x, taille[0], rx, libre),
          y: echelleArrondie(t0.echelle.y, taille[1], ry, libre),
        };
      }
      return new Map([[principal, avecPointFixe(t0, echelle, fixe)]]);
    },
    mesure: () => "Dimensions : " + cotes().map(nombre).join(" × ") + " mm",
  };
}
