/*
 * tranchage/ouvrier_tranchage.js
 * ──────────────────────────────
 * Tourne dans un Web Worker à part, avec sa propre instance de Manifold : un
 * tranchage long ne retarde jamais le calcul des formes, et l'interface ne se
 * fige pas.
 *
 * « trancher » { id, positions, indices, matrice, couches, reglages }
 *   positions, indices  le maillage de la pièce, construit à l'origine
 *   matrice             12 nombres : la pièce posée sur le plateau (repère machine)
 *   couches             { hauteurs: [haut de chaque couche], epaisseurs: […] }
 *   reglages            les valeurs effectives (noyau/reglages_impression.js)
 * « jupe » { id, sols, couches, reglages }
 *   sols                les contours au sol de toutes les pièces : la jupe les entoure
 * Réponse  { id, ok, points: Float32Array (x, y…), chemins: Uint32Array
 *            (voir protocole_tranchage.js), bilan, sol, coutures: Float32Array (x, y, couche…),
 *            contours: le bord de chaque couche, pour les déplacements,
 *            contoursOuverts: le nombre de contours qu'un maillage troué n'a pas
 *            permis de refermer }
 * « annuler » { id } : la pièce a changé, ce tranchage ne sert plus.
 * Pendant le travail, l'ouvrier envoie { id, avancement } (0 à 1) : le fil
 * principal en fait la barre de progression.
 */

import chargerManifold from "../vendor/manifold-3.5.3/manifold.js";
import { trancherPiece } from "./tranchage_piece.js";
import { estimer } from "./estimations.js";
import { espacement, LIMITE_D_ONGLET } from "./parois.js";
import { TYPES_DE_LIGNE, CHAMPS_PAR_CHEMIN } from "./protocole_tranchage.js";

let wasm = null;
const enAttente = [];
const annulees = new Set();

function placer(positions, m) {
  const placees = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    placees[i] = m[0] * x + m[1] * y + m[2] * z + m[3];
    placees[i + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
    placees[i + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
  }
  return placees;
}

/* Les chemins en deux tableaux transférables. */
function emballer(chemins) {
  let nombreDePoints = 0;
  for (const c of chemins) nombreDePoints += c.points.length;
  const points = new Float32Array(nombreDePoints * 2);
  const table = new Uint32Array(chemins.length * CHAMPS_PAR_CHEMIN);
  let p = 0;
  chemins.forEach((c, i) => {
    table.set([
      c.couche, c.type, p / 2, c.points.length, Math.round(c.largeur * 1000),
      c.ferme ? 1 : 0, Math.round(c.vitesse * 100),
      Math.round(Math.max(0, Math.min(1, c.surplomb ?? 0)) * 1000),
      Math.round(Math.max(0, c.enroulement ?? 0) * 1000),
    ], i * CHAMPS_PAR_CHEMIN);
    for (const [x, y] of c.points) {
      points[p++] = x;
      points[p++] = y;
    }
  });
  return { points, chemins: table };
}

function trancher({ id, positions, indices, matrice, couches, reglages }) {
  // Un message par dixième de seconde au plus : de quoi animer la barre sans inonder le fil principal.
  let dernierEnvoi = 0;
  const surAvancement = (part) => {
    const maintenant = performance.now();
    if (maintenant - dernierEnvoi < 100) return;
    dernierEnvoi = maintenant;
    postMessage({ id, avancement: part });
  };
  const tranche = trancherPiece(wasm, placer(positions, matrice), indices, couches, reglages, surAvancement);
  const { chemins, sol, coutures, contours, contoursOuverts } = tranche;
  // L'estimation d'abord : elle donne à chaque chemin sa vitesse réelle, que l'emballage garde.
  const bilan = estimer(chemins, couches, reglages);
  return {
    ...emballer(chemins), bilan, sol, coutures: new Float32Array(coutures.flat()), contours, contoursOuverts,
  };
}

/* La jupe : des boucles autour de l'enveloppe de toutes les pièces, sur la première couche. */
function jupe({ sols, couches, reglages }) {
  const points = sols.flat();
  const chemins = [];
  if (points.length >= 3 && reglages.tours_jupe > 0) {
    const largeur = reglages.largeur_premiere_couche;
    const pas = espacement(largeur, couches.epaisseurs[0]);
    const enveloppe = wasm.CrossSection.hull(points);
    try {
      const boucles = [];
      for (let i = 0; i < reglages.tours_jupe; i += 1) {
        const boucle = enveloppe.offset(reglages.distance_jupe + largeur / 2 + i * pas, "Round", LIMITE_D_ONGLET, 64);
        boucles.push(...boucle.toPolygons().map((contour) => ({ couche: 0, type: TYPES_DE_LIGNE.jupe, largeur, points: contour, ferme: true })));
        boucle.delete();
      }
      // De l'extérieur vers les pièces.
      chemins.push(...boucles.reverse());
    } finally {
      enveloppe.delete();
    }
  }
  const bilan = estimer(chemins, couches, reglages);
  return { ...emballer(chemins), bilan, sol: [], coutures: new Float32Array(0), contours: [], contoursOuverts: 0 };
}

/* Une tâche, puis on rend la main : les annulations arrivées entre-temps sont lues avant la suivante. */
function traiter() {
  if (wasm === null || enAttente.length === 0) return;
  const requete = enAttente.shift();
  if (!annulees.delete(requete.id)) {
    try {
      const resultat = requete.type === "jupe" ? jupe(requete) : trancher(requete);
      postMessage({ id: requete.id, ok: true, ...resultat }, [resultat.points.buffer, resultat.chemins.buffer]);
    } catch (erreur) {
      postMessage({ id: requete.id, ok: false, erreur: "Le tranchage a échoué : " + erreur.message });
    }
  }
  setTimeout(traiter);
}

self.onmessage = (evenement) => {
  const message = evenement.data;
  if (message.type === "annuler") {
    annulees.add(message.id);
    return;
  }
  enAttente.push(message);
  if (enAttente.length === 1) setTimeout(traiter);
};

chargerManifold().then((module) => {
  module.setup();
  wasm = module;
  traiter();
}).catch((erreur) => postMessage({ id: null, ok: false, erreur: "Le moteur de tranchage n'a pas démarré : " + erreur.message }));
