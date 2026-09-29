/*
 * noyau/bibliotheque_de_profils.js
 * ────────────────────────────────
 * Les formes de la bibliothèque : des profils 2D extrudés à la volée. L'élève
 * les utilise comme des primitives ; le logiciel les traite comme des
 * esquisses toutes faites.
 *
 * Ajouter une forme = ajouter une entrée ici. Pas de fichier de type, pas de
 * ligne d'import : le registre fabrique le type tout seul.
 *
 * contours(p) rend une liste de contours, chacun une liste de points [x, y].
 * L'échelle n'a aucune importance : la forme est ensuite ramenée au cube
 * unité, et ses dimensions en millimètres sont portées par l'échelle. Un
 * contour intérieur est un trou (règle pair-impair).
 */

const TOUR = Math.PI * 2;

function polygoneRegulier(rayon, cotes) {
  const points = [];
  for (let i = 0; i < cotes; i += 1) {
    const angle = (i * TOUR) / cotes;
    points.push([rayon * Math.cos(angle), rayon * Math.sin(angle)]);
  }
  return points;
}

export const BIBLIOTHEQUE = [
  {
    nom: "etoile",
    etiquette: "Étoile",
    dimensionsParDefaut: { x: 30, y: 30, z: 4 },
    parametres: {
      branches: { etiquette: "Branches", defaut: 5, min: 3, max: 24, entier: true },
      creux: { etiquette: "Creux", unite: "%", defaut: 40, min: 10, max: 90, pasFixe: 5, entier: true },
    },
    contours(p) {
      const points = [];
      for (let i = 0; i < 2 * p.branches; i += 1) {
        const angle = Math.PI / 2 + (i * Math.PI) / p.branches;
        const rayon = i % 2 === 0 ? 1 : p.creux / 100;
        points.push([rayon * Math.cos(angle), rayon * Math.sin(angle)]);
      }
      return [points];
    },
  },

  {
    nom: "coeur",
    etiquette: "Cœur",
    dimensionsParDefaut: { x: 30, y: 28, z: 4 },
    parametres: {},
    contours() {
      // La courbe classique du cœur, parcourue en 72 points.
      const points = [];
      for (let i = 0; i < 72; i += 1) {
        const t = (i * TOUR) / 72;
        points.push([
          16 * Math.sin(t) ** 3,
          13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
        ]);
      }
      return [points];
    },
  },

  {
    nom: "engrenage",
    etiquette: "Engrenage",
    dimensionsParDefaut: { x: 40, y: 40, z: 6 },
    parametres: {
      dents: { etiquette: "Dents", defaut: 12, min: 6, max: 60, entier: true },
      profondeur: { etiquette: "Profondeur des dents", unite: "%", defaut: 15, min: 5, max: 40, pasFixe: 5, entier: true },
      alesage: { etiquette: "Trou central", unite: "%", defaut: 20, min: 0, max: 60, pasFixe: 5, entier: true },
    },
    contours(p) {
      // Dent trapézoïdale : pied, flanc, sommet, flanc, sur un pas angulaire.
      const pas = TOUR / p.dents;
      const pied = 1 - p.profondeur / 100;
      const exterieur = [];
      for (let i = 0; i < p.dents; i += 1) {
        for (const [fraction, rayon] of [[0, pied], [0.25, 1], [0.5, 1], [0.75, pied]]) {
          const angle = (i + fraction) * pas;
          exterieur.push([rayon * Math.cos(angle), rayon * Math.sin(angle)]);
        }
      }
      if (p.alesage === 0) return [exterieur];
      return [exterieur, polygoneRegulier(p.alesage / 100, 48)];
    },
  },

  {
    nom: "fleche",
    etiquette: "Flèche",
    dimensionsParDefaut: { x: 40, y: 20, z: 4 },
    parametres: {},
    contours() {
      return [[[0, 0.3], [1.2, 0.3], [1.2, 0], [2, 0.5], [1.2, 1], [1.2, 0.7], [0, 0.7]]];
    },
  },

  {
    nom: "croix",
    etiquette: "Croix",
    dimensionsParDefaut: { x: 30, y: 30, z: 4 },
    parametres: {
      epaisseur: { etiquette: "Largeur des branches", unite: "%", defaut: 34, min: 10, max: 80, pasFixe: 5, entier: true },
    },
    contours(p) {
      const l = p.epaisseur / 100;
      const [a, b] = [(1 - l) / 2, (1 + l) / 2];
      return [[
        [a, 0], [b, 0], [b, a], [1, a], [1, b], [b, b],
        [b, 1], [a, 1], [a, b], [0, b], [0, a], [a, a],
      ]];
    },
  },
];
