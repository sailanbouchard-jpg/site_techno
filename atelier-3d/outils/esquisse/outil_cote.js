/*
 * outils/esquisse/outil_cote.js
 * Poser une cote, d'après ce qu'on clique :
 *   - un cercle : son diamètre ; un arc : son rayon ;
 *   - un segment : sa longueur, au clic suivant — sauf si ce clic vise un
 *     point (distance du point au segment, perpendiculaire) ou un second
 *     segment (l'angle entre les deux) ;
 *   - un point, puis un axe : sa distance à cet axe ;
 *   - un point, puis un segment : sa distance au segment ;
 *   - un point, puis un autre point ou l'origine : un dernier clic pose la
 *     cote, et c'est la place de la souris qui dit laquelle, comme dans les
 *     logiciels de CAO : au-dessus ou au-dessous des points, l'écart
 *     horizontal ; à gauche ou à droite, l'écart vertical ; en biais, la
 *     distance directe.
 * La cote prend la valeur du dessin, puis un champ s'ouvre pour la changer.
 */

import { outilDeTrace, nombre } from "./options_esquisse.js";
import { viserCible, montrerCibles, effacerCibles } from "./cibles_de_contrainte.js";

let premiere = null;   // la cible du premier clic, quand il en faut plusieurs
let entre = null;      // { a, b } : les deux points d'une distance à placer

const ATTENTE_POINT = "Cliquer un second point, l'origine, un axe ou un segment.";
const ATTENTE_SEGMENT = "Cliquer pour poser la longueur ; un point : sa distance au segment ; un autre segment : l'angle.";
const NOMS = { distanceH: "Distance horizontale", distanceV: "Distance verticale", distance: "Distance directe" };

function recommencer(contexte) {
  premiere = null;
  entre = null;
  effacerCibles(contexte);
  contexte.mesurer(null);
}

function poser(contexte, contrainte) {
  recommencer(contexte);
  const id = contexte.esquisse.poserContrainte(contrainte);
  if (id !== null) contexte.esquisse.editerContrainte(id);
}

const position = (cible) => (cible.genre === "origine" ? [0, 0] : cible.contenu.points[cible.id]);
const estBoutDe = (point, segment) => {
  const s = segment.contenu.courbes.find((c) => c.id === segment.id);
  return s.a === point.id || s.b === point.id;
};

/* La cote d'un point vers une seconde cible, null si ce couple ne se cote
   pas, ou « placer » quand il reste à choisir le genre de distance. */
function coteDuPoint(point, autre) {
  if (autre.genre === "axe") return { genre: autre.axe === "vertical" ? "distanceH" : "distanceV", a: point.id, b: null };
  if (autre.genre === "segment") return estBoutDe(point, autre) ? null : { genre: "distanceLigne", a: point.id, courbe: autre.id };
  if (autre.genre === "origine" || (autre.genre === "point" && autre.id !== point.id)) return "placer";
  return null;
}

/* Le genre de distance que désigne la souris m, autour des points a et b. */
function genreSelonLaSouris(a, b, m) {
  const entreLesU = m[0] >= Math.min(a[0], b[0]) && m[0] <= Math.max(a[0], b[0]);
  const entreLesV = m[1] >= Math.min(a[1], b[1]) && m[1] <= Math.max(a[1], b[1]);
  if (entreLesU && !entreLesV) return "distanceH";
  if (entreLesV && !entreLesU) return "distanceV";
  return "distance";
}

/* La cote en aperçu, sa ligne passant par la souris, et ce qu'elle mesure. */
function apercuDeLaDistance(contexte, m) {
  const [a, b] = [position(entre.a), position(entre.b)];
  const genre = genreSelonLaSouris(a, b, m);
  let ligne;
  let valeur;
  if (genre === "distanceH") {
    ligne = [[a[0], m[1]], [b[0], m[1]]];
    valeur = Math.abs(b[0] - a[0]);
  } else if (genre === "distanceV") {
    ligne = [[m[0], a[1]], [m[0], b[1]]];
    valeur = Math.abs(b[1] - a[1]);
  } else {
    // Parallèle à AB, décalée jusqu'à la souris.
    valeur = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [-(b[1] - a[1]) / (valeur || 1), (b[0] - a[0]) / (valeur || 1)];
    const recul = (m[0] - a[0]) * n[0] + (m[1] - a[1]) * n[1];
    ligne = [[a[0] + n[0] * recul, a[1] + n[1] * recul], [b[0] + n[0] * recul, b[1] + n[1] * recul]];
  }
  contexte.esquisse.apercu([
    { points: [a, ligne[0]], genre: "apercu" },
    { points: [b, ligne[1]], genre: "apercu" },
    { points: ligne, genre: "choisi" },
  ]);
  contexte.mesurer(NOMS[genre] + " : " + nombre(valeur) + " mm. Cliquer pour poser ; la place de la souris choisit la direction.");
  return genre;
}

export default outilDeTrace({
  nom: "cote",
  etiquette: "Cote",
  termeDuProgramme: "cotation",
  aide: "Fixe une dimension : longueur d'un segment, angle entre deux segments, diamètre d'un cercle, rayon d'un arc, distance d'un point à un axe, à un segment, à l'origine ou à un autre point.",
  raccourci: "D",
  groupe: "contrainte",
  optionsBandeau: [],

  activer: recommencer,
  desactiver: recommencer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const cible = viserCible(evenement, contexte);

    // Troisième clic d'une distance entre deux points : la souris a choisi le genre.
    if (entre !== null) {
      const vise = contexte.esquisse.viser(evenement);
      if (vise === null) return;
      const genre = genreSelonLaSouris(position(entre.a), position(entre.b), vise.uv);
      const [a, b] = entre.a.genre === "point" ? [entre.a, entre.b] : [entre.b, entre.a];
      poser(contexte, { genre, a: a.id, b: b.genre === "point" ? b.id : null });
      return;
    }

    // Un segment est déjà choisi : un point donne sa distance au segment, un
    // second segment l'angle entre les deux, tout autre clic sa longueur.
    if (premiere?.genre === "segment") {
      if (cible?.genre === "point" && !estBoutDe(cible, premiere)) {
        poser(contexte, { genre: "distanceLigne", a: cible.id, courbe: premiere.id });
      } else if (cible?.genre === "segment" && cible.id !== premiere.id) {
        poser(contexte, { genre: "angle", courbes: [premiere.id, cible.id] });
      } else {
        poser(contexte, { genre: "longueur", courbe: premiere.id });
      }
      return;
    }

    if (cible === null) return;

    if (premiere === null) {
      if (cible.genre === "cercle") poser(contexte, { genre: "diametre", courbe: cible.id });
      else if (cible.genre === "arc") poser(contexte, { genre: "rayon", courbe: cible.id });
      else {
        premiere = cible;
        montrerCibles(contexte, [cible]);
        const consignes = { point: ATTENTE_POINT, segment: ATTENTE_SEGMENT };
        contexte.mesurer(consignes[cible.genre] ?? "Cliquer le point à coter.");
      }
      return;
    }

    const [point, autre] = premiere.genre === "point" ? [premiere, cible] : [cible, premiere];
    const cote = point.genre === "point" ? coteDuPoint(point, autre) : null;
    if (cote === null) {
      contexte.annoncer("Coter un point avec un autre point, l'origine, un axe ou un segment qui ne le porte pas.", true);
      recommencer(contexte);
    } else if (cote === "placer") {
      entre = { a: point, b: autre };
      montrerCibles(contexte, [point, autre]);
      apercuDeLaDistance(contexte, contexte.esquisse.viser(evenement)?.uv ?? position(point));
    } else {
      poser(contexte, cote);
    }
  },

  surDeplacement(evenement, contexte) {
    if (entre !== null) {
      const vise = contexte.esquisse.viser(evenement);
      if (vise !== null) apercuDeLaDistance(contexte, vise.uv);
      return;
    }
    montrerCibles(contexte, [premiere, viserCible(evenement, contexte)]);
  },

  surTouche(evenement, contexte) {
    if (evenement.key !== "Escape" || premiere === null) return false;
    recommencer(contexte);
    return true;
  },
});
