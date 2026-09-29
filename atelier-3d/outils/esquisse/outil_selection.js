/*
 * outils/esquisse/outil_selection.js
 * L'outil de départ d'une esquisse, et celui où ramène Échap. On clique un
 * tracé pour le choisir (Maj : en ajouter), on tire un cadre dans le vide
 * pour en choisir plusieurs. Suppr efface les tracés choisis ; les faire
 * glisser les déplace. Attraper un point le déplace seul : les traits qui le
 * partagent suivent, et lâché sur un autre point il s'y soude — c'est ainsi
 * qu'on referme un contour. Le centre d'un arc s'attrape de même : il emmène
 * l'arc avec lui, sauf les bouts déjà reliés à d'autres traits, qui restent
 * en place (l'arc change alors de rayon) ; lâché sur un point, il s'y soude.
 * Les contraintes restent satisfaites pendant le glisser : un point coté ne
 * suit la souris que là où ses cotes le permettent.
 */

import {
  deplacerPoint, fusionnerPoints, supprimerCourbes, poigneesDArc, centresDArc, memeArc, recalerLesArcs, recalerAutourDuCentre,
} from "../../noyau/esquisse/elements_esquisse.js";
import { pointSous, courbeSous, pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace, nombre } from "./options_esquisse.js";

const TOLERANCE_PX = 8;
// En dessous, un appui suivi d'un relâché est un clic, pas un glisser.
const SEUIL_DE_GLISSER_PX = 4;

let choisis = new Set();  // identifiants des tracés choisis
let geste = null;         // { genre: "point" | "tracés" | "cadre", depart, ecran, … }

const pointsDes = (courbe) => (courbe.genre === "cercle" ? [courbe.centre]
  : [courbe.a, courbe.b, courbe.m, courbe.c, ...(courbe.pts ?? [])].filter((id) => id !== undefined));

/* Tirer un centre : les points de ses arcs qui ne tiennent à rien d'autre le suivent. */
function avecLArcQuiSuit(contenu, idCentre, [u, v]) {
  const [u0, v0] = contenu.points[idCentre];
  const usages = new Map();
  for (const c of contenu.courbes) {
    for (const id of [c.a, c.b, c.m, c.c, c.centre]) if (id !== undefined) usages.set(id, (usages.get(id) ?? 0) + 1);
  }
  const suiveurs = new Set();
  for (const c of contenu.courbes) {
    if (c.genre !== "arc" || c.c !== idCentre) continue;
    for (const id of [c.a, c.b, c.m]) if (usages.get(id) === 1) suiveurs.add(id);
  }
  let resultat = contenu;
  for (const id of suiveurs) {
    const [pu, pv] = contenu.points[id];
    resultat = deplacerPoint(resultat, id, [pu + u - u0, pv + v - v0]);
  }
  return resultat;
}

/* Les tracés choisis qui existent encore : une annulation a pu en retirer. */
function choisisValides(contenu) {
  const existants = new Set(contenu.courbes.map((c) => c.id));
  choisis = new Set([...choisis].filter((id) => existants.has(id)));
  return choisis;
}

function montrerChoix(contexte, contenu, cadre = null, survole = null) {
  if (contenu === null) return;
  const ids = choisisValides(contenu);
  const traces = contenu.courbes
    .filter((c) => ids.has(c.id))
    .map((c) => ({ points: pointsDeCourbe(contenu, c), genre: "choisi" }));
  const survol = contenu.courbes.find((c) => c.id === survole && !ids.has(c.id));
  if (survol !== undefined) traces.push({ points: pointsDeCourbe(contenu, survol), genre: "apercu" });
  if (cadre !== null) {
    const [[u1, v1], [u2, v2]] = cadre;
    traces.push({ points: [[u1, v1], [u2, v1], [u2, v2], [u1, v2], [u1, v1]], genre: "apercu" });
  }
  contexte.esquisse.apercu(traces);
}

function viser(evenement, contexte) {
  const vise = contexte.esquisse.viser(evenement);
  const contenu = contexte.esquisse.contenu();
  if (vise === null || contenu === null) return null;
  const tolerance = TOLERANCE_PX * vise.mmParPixel;
  return {
    uv: vise.uv,
    contenu,
    point: pointSous(contenu, vise.uv, tolerance),
    courbe: courbeSous(contenu, vise.uv, tolerance),
  };
}

function choisir(ids, ajouter) {
  if (!ajouter) choisis = new Set();
  for (const id of ids) {
    if (ajouter && choisis.has(id)) choisis.delete(id);
    else choisis.add(id);
  }
}

function arreter(contexte) {
  geste = null;
  contexte.esquisse.apercuContenu(null);
  contexte.esquisse.montrer(null);
  contexte.mesurer(null);
}

/* Les tracés entièrement dans le cadre. */
function tracesDansLeCadre(contenu, [[u1, v1], [u2, v2]]) {
  const [umin, umax, vmin, vmax] = [Math.min(u1, u2), Math.max(u1, u2), Math.min(v1, v2), Math.max(v1, v2)];
  const dedans = ([u, v]) => u >= umin && u <= umax && v >= vmin && v <= vmax;
  return contenu.courbes.filter((c) => pointsDeCourbe(contenu, c).every(dedans)).map((c) => c.id);
}

function glisser(evenement, contexte) {
  const vise = contexte.esquisse.accrocher(evenement, { exclus: geste.genre === "point" ? geste.id : null });
  if (vise === null) return;
  const { contenu } = geste;

  if (geste.genre === "cadre") {
    geste.coin = contexte.esquisse.viser(evenement)?.uv ?? geste.coin;
    montrerChoix(contexte, contenu, [geste.depart, geste.coin]);
    return;
  }
  contexte.esquisse.montrer(vise);

  if (geste.genre === "point") {
    // Une poignée d'arc ne se soude à rien : elle glisse sur l'axe de l'arc et
    // en change la courbure. Tenue, elle ferait bouger les bouts à sa place.
    // Un point ne se soude pas à un autre point de son propre arc : l'arc s'écraserait.
    const poignees = poigneesDArc(contenu);
    const souder = vise.idPoint !== null && !poignees.has(vise.idPoint) && !poignees.has(geste.id)
      && !memeArc(contenu, vise.idPoint, geste.id);
    const centre = centresDArc(contenu).has(geste.id);
    let apres = deplacerPoint(centre ? avecLArcQuiSuit(contenu, geste.id, vise.uv) : contenu, geste.id, vise.uv);
    // Les arcs gardent leur forme pendant le calcul, sauf celle qu'on change à la
    // main : la poignée tirée de l'autre côté retourne l'arc, le centre aussi.
    if (poignees.has(geste.id)) apres = recalerLesArcs(apres);
    if (centre) apres = recalerAutourDuCentre(apres, geste.id);
    if (souder) apres = fusionnerPoints(apres, vise.idPoint, geste.id);
    geste.tenus = poignees.has(geste.id) ? [] : [souder ? vise.idPoint : geste.id];
    geste.proposition = contexte.esquisse.contraindre(apres, geste.tenus);
    contexte.mesurer((centre ? "Centre" : "Point") + " : " + nombre(vise.uv[0]) + " ; " + nombre(vise.uv[1]) + " mm" + (souder ? " — soudé" : ""));
  } else {
    const [du, dv] = [vise.uv[0] - geste.depart[0], vise.uv[1] - geste.depart[1]];
    const ids = new Set(contenu.courbes.filter((c) => choisis.has(c.id)).flatMap(pointsDes));
    let apres = contenu;
    for (const id of ids) {
      const [u, v] = contenu.points[id];
      apres = deplacerPoint(apres, id, [u + du, v + dv]);
    }
    geste.tenus = [...ids];
    geste.proposition = contexte.esquisse.contraindre(apres, geste.tenus);
    contexte.mesurer("Déplacement : " + nombre(du) + " ; " + nombre(dv) + " mm");
  }
  contexte.esquisse.apercuContenu(geste.proposition);
  montrerChoix(contexte, geste.proposition);
}

export default outilDeTrace({
  nom: "selection",
  etiquette: "Sélection",
  termeDuProgramme: "choisir, déplacer, effacer",
  aide: "Choisir des tracés ou des points pour les déplacer ou les effacer.",
  raccourci: "S",
  curseur: "default",

  activer(contexte) {
    choisis = new Set();
    montrerChoix(contexte, contexte.esquisse.contenu());
  },

  desactiver(contexte) {
    arreter(contexte);
    choisis = new Set();
    contexte.esquisse.apercu([]);
  },

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const cible = viser(evenement, contexte);
    if (cible === null) return;
    const commun = { contenu: cible.contenu, depart: cible.uv, ecran: [evenement.clientX, evenement.clientY], proposition: null, glisse: false };
    if (cible.point !== null) {
      geste = { ...commun, genre: "point", id: cible.point, courbe: cible.courbe, depart: cible.contenu.points[cible.point] };
    } else if (cible.courbe !== null) {
      // Un tracé pas encore choisi le devient : on peut le choisir et le faire glisser d'un seul geste.
      if (!choisis.has(cible.courbe)) choisir([cible.courbe], evenement.shiftKey);
      else if (evenement.shiftKey) geste = { ...commun, genre: "retirer", courbe: cible.courbe };
      geste ??= { ...commun, genre: "tracés" };
      montrerChoix(contexte, cible.contenu);
    } else {
      geste = { ...commun, genre: "cadre", coin: cible.uv, ajouter: evenement.shiftKey };
    }
    contexte.capturer(evenement.pointerId);
  },

  surDeplacement(evenement, contexte) {
    if (geste === null) {
      const cible = viser(evenement, contexte);
      if (cible === null) return;
      contexte.esquisse.montrer(cible.point !== null ? { uv: cible.contenu.points[cible.point], guides: [] } : null);
      montrerChoix(contexte, cible.contenu, null, cible.point === null ? cible.courbe : null);
      return;
    }
    const ecart = Math.hypot(evenement.clientX - geste.ecran[0], evenement.clientY - geste.ecran[1]);
    if (!geste.glisse && ecart < SEUIL_DE_GLISSER_PX) return;
    if (geste.genre === "retirer") geste.genre = "tracés";
    geste.glisse = true;
    glisser(evenement, contexte);
  },

  surRelache(evenement, contexte) {
    if (geste === null) return;
    const { genre, glisse, proposition, contenu, tenus = [] } = geste;
    if (genre === "cadre") {
      const ids = glisse ? tracesDansLeCadre(contenu, [geste.depart, geste.coin]) : [];
      if (glisse || !geste.ajouter) choisir(ids, geste.ajouter);
    } else if (genre === "retirer") {
      choisis.delete(geste.courbe);
    } else if (genre === "point" && !glisse) {
      // Un clic sur un bout de trait choisit le trait.
      if (geste.courbe !== null) choisir([geste.courbe], evenement.shiftKey);
    }
    arreter(contexte);
    if (glisse && proposition !== null && genre !== "cadre") {
      contexte.esquisse.modifier(() => proposition, genre === "point" ? "Déplacer un point" : "Déplacer", tenus);
    }
    montrerChoix(contexte, contexte.esquisse.contenu());
  },

  surTouche(evenement, contexte) {
    const contenu = contexte.esquisse.contenu();
    if (geste !== null && evenement.key === "Escape") {
      arreter(contexte);
      montrerChoix(contexte, contenu);
      return true;
    }
    if (contenu === null) return false;
    const ids = [...choisisValides(contenu)];
    if ((evenement.key === "Delete" || evenement.key === "Backspace") && ids.length > 0) {
      choisis = new Set();
      contexte.esquisse.modifier((c) => supprimerCourbes(c, ids), ids.length > 1 ? "Effacer " + ids.length + " tracés" : "Effacer");
      montrerChoix(contexte, contexte.esquisse.contenu());
      return true;
    }
    if (evenement.key === "Escape" && ids.length > 0) {
      choisis = new Set();
      montrerChoix(contexte, contenu);
      return true;
    }
    if ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === "a") {
      choisis = new Set(contenu.courbes.map((c) => c.id));
      montrerChoix(contexte, contenu);
      return true;
    }
    return false;
  },
});
