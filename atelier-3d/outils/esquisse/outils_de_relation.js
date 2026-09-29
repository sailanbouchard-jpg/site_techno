/*
 * outils/esquisse/outils_de_relation.js
 * ─────────────────────────────────────
 * Les contraintes sans valeur : horizontal ou vertical, sur un axe, fixé,
 * parallèle, perpendiculaire, égal. Chaque outil attend une suite de cibles
 * (un segment, un point puis un axe…) ; la dernière posée, la contrainte naît.
 * Ils partagent tout, sauf la liste des cibles et la contrainte qu'elles
 * donnent : d'où une fabrique plutôt que six fichiers identiques.
 */

import { outilDeTrace } from "./options_esquisse.js";
import { viserCible, montrerCibles, effacerCibles } from "./cibles_de_contrainte.js";
import { ajouterContrainte } from "../../noyau/esquisse/contraintes_esquisse.js";

/*
 * description : { nom, etiquette, termeDuProgramme, aide, raccourci,
 *   etapes: [{ genres: [...], consigne }],
 *   contrainte(cibles, contenu) → la contrainte, ou une chaîne : ce qui ne va pas,
 *   agir?(cibles, contexte) : à la place de poser une contrainte }
 */
function outilDeRelation(description) {
  let cibles = [];

  function recommencer(contexte) {
    cibles = [];
    effacerCibles(contexte);
    contexte.mesurer(null);
  }

  const etape = () => description.etapes[cibles.length];

  return outilDeTrace({
    nom: description.nom,
    etiquette: description.etiquette,
    termeDuProgramme: description.termeDuProgramme,
    aide: description.aide,
    raccourci: description.raccourci ?? "",
    groupe: "contrainte",
    optionsBandeau: [],

    activer: recommencer,
    desactiver: recommencer,

    surAppui(evenement, contexte) {
      if (evenement.button !== 0) return;
      const cible = viserCible(evenement, contexte, etape().genres);
      if (cible === null || !etape().genres.includes(cible.genre)) {
        contexte.annoncer(description.etiquette + " : " + etape().consigne.toLowerCase(), true);
        return;
      }
      if (cibles.some((c) => c.genre === cible.genre && c.id === cible.id)) return;
      cibles.push(cible);
      if (cibles.length < description.etapes.length) {
        montrerCibles(contexte, cibles);
        contexte.mesurer(etape().consigne);
        return;
      }
      if (description.agir) {
        const choisies = cibles;
        recommencer(contexte);
        description.agir(choisies, contexte);
        return;
      }
      const contrainte = description.contrainte(cibles, cible.contenu);
      recommencer(contexte);
      if (typeof contrainte === "string") contexte.annoncer(contrainte, true);
      else contexte.esquisse.poserContrainte(contrainte);
    },

    surDeplacement(evenement, contexte) {
      const cible = viserCible(evenement, contexte, etape().genres);
      montrerCibles(contexte, [...cibles, cible !== null && etape().genres.includes(cible.genre) ? cible : null]);
      if (cibles.length === 0) contexte.mesurer(etape().consigne);
    },

    surTouche(evenement, contexte) {
      if (evenement.key !== "Escape" || cibles.length === 0) return false;
      recommencer(contexte);
      return true;
    },
  });
}

const UN_SEGMENT = { genres: ["segment"], consigne: "Cliquer un segment." };
const UN_ROND = { genres: ["cercle", "arc"], consigne: "Cliquer un cercle ou un arc." };
const SECOND_SEGMENT = { genres: ["segment"], consigne: "Cliquer le second segment." };

export const outilHorizontalVertical = outilDeRelation({
  nom: "horizontal_vertical",
  etiquette: "H / V",
  termeDuProgramme: "horizontal ou vertical",
  aide: "Rend un segment horizontal ou vertical, selon la direction dont il est le plus proche.",
  raccourci: "H",
  etapes: [UN_SEGMENT],
  contrainte([segment], contenu) {
    const s = contenu.courbes.find((c) => c.id === segment.id);
    const [a, b] = [contenu.points[s.a], contenu.points[s.b]];
    return { genre: Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? "horizontal" : "vertical", courbe: segment.id };
  },
});

export const outilSurAxe = outilDeRelation({
  nom: "sur_axe",
  etiquette: "Sur un axe",
  termeDuProgramme: "point sur un axe ou sur l'origine",
  aide: "Place un point sur un axe de l'esquisse, ou sur son origine : cliquer le point, puis l'axe ou l'origine.",
  etapes: [
    { genres: ["point"], consigne: "Cliquer un point." },
    { genres: ["axe", "origine"], consigne: "Cliquer un axe ou l'origine." },
  ],
  contrainte([point, repere]) {
    return repere.genre === "origine" ? { genre: "origine", a: point.id } : { genre: "surAxe", a: point.id, axe: repere.axe };
  },
});

export const outilFixer = outilDeRelation({
  nom: "fixer",
  etiquette: "Fixer",
  termeDuProgramme: "point fixe",
  aide: "Bloque un point à sa place : les autres contraintes ne le déplacent plus.",
  etapes: [{ genres: ["point"], consigne: "Cliquer le point à fixer." }],
  contrainte([point], contenu) {
    const [u, v] = contenu.points[point.id];
    return { genre: "fixe", a: point.id, u, v };
  },
});

export const outilParallele = outilDeRelation({
  nom: "parallele",
  etiquette: "Parallèle",
  termeDuProgramme: "droites parallèles",
  aide: "Rend deux segments parallèles : cliquer l'un, puis l'autre.",
  etapes: [UN_SEGMENT, SECOND_SEGMENT],
  contrainte: ([a, b]) => ({ genre: "parallele", courbes: [a.id, b.id] }),
});

export const outilPerpendiculaire = outilDeRelation({
  nom: "perpendiculaire",
  etiquette: "Perpendiculaire",
  termeDuProgramme: "droites perpendiculaires",
  aide: "Rend deux segments perpendiculaires : cliquer l'un, puis l'autre.",
  etapes: [UN_SEGMENT, SECOND_SEGMENT],
  contrainte: ([a, b]) => ({ genre: "perpendiculaire", courbes: [a.id, b.id] }),
});

export const outilTangente = outilDeRelation({
  nom: "tangente",
  etiquette: "Tangent",
  termeDuProgramme: "droite tangente",
  aide: "Fait effleurer un cercle ou un arc par un segment, sans le couper : cliquer le segment, puis le rond.",
  etapes: [UN_SEGMENT, { genres: ["cercle", "arc"], consigne: "Cliquer le cercle ou l'arc." }],
  contrainte: ([segment, rond]) => ({ genre: "tangente", courbes: [segment.id, rond.id] }),
});

export const outilConcentrique = outilDeRelation({
  nom: "concentrique",
  etiquette: "Même centre",
  termeDuProgramme: "cercles concentriques",
  aide: "Donne le même centre à deux cercles ou arcs : cliquer l'un, puis l'autre.",
  etapes: [UN_ROND, { genres: ["cercle", "arc"], consigne: "Cliquer le second cercle ou arc." }],
  contrainte: ([a, b]) => ({ genre: "concentrique", courbes: [a.id, b.id] }),
});

/* Marquer un point comme référence, ou le démarquer : il passe en jaune, et
   les esquisses suivantes peuvent le viser. */
export const outilReference = outilDeRelation({
  nom: "point_reference",
  etiquette: "Référence",
  termeDuProgramme: "point de référence",
  aide: "Fait d'un point une référence (en jaune) : les esquisses placées après celle-ci dans la liste peuvent s'y accrocher, ou faire passer leur plan par lui. Cliquer à nouveau le point le retire.",
  etapes: [{ genres: ["point"], consigne: "Cliquer le point à prêter aux esquisses suivantes." }],
  agir([point], contexte) {
    contexte.esquisse.modifier((contenu) => {
      const marque = contenu.contraintes.find((c) => c.genre === "reference" && c.a === point.id);
      if (marque !== undefined) return { ...contenu, contraintes: contenu.contraintes.filter((c) => c !== marque) };
      return ajouterContrainte(contenu, { genre: "reference", a: point.id }).contenu;
    }, "Point de référence");
  },
});

/* Poser un point sur la projection d'un point de référence d'une esquisse précédente. */
export const outilSurReference = outilDeRelation({
  nom: "sur_reference",
  etiquette: "Sur une référence",
  termeDuProgramme: "point sur un point de référence",
  aide: "Place un point de l'esquisse sur un point de référence d'une esquisse précédente, projeté sur ce plan (marques jaunes). Modifier l'esquisse de référence fait suivre ce point.",
  etapes: [
    { genres: ["point"], consigne: "Cliquer un point de l'esquisse." },
    { genres: ["reference"], consigne: "Cliquer un point de référence (marque jaune)." },
  ],
  contrainte: ([point, reference]) => ({
    genre: "surReference", a: point.id, esquisse: reference.esquisse, point: reference.point, u: reference.uv[0], v: reference.uv[1],
  }),
});

export const outilEgal = outilDeRelation({
  nom: "egal",
  etiquette: "Égal",
  termeDuProgramme: "longueurs égales",
  aide: "Donne à deux segments la même longueur : cliquer l'un, puis l'autre.",
  etapes: [UN_SEGMENT, SECOND_SEGMENT],
  contrainte: ([a, b]) => ({ genre: "egal", courbes: [a.id, b.id] }),
});
