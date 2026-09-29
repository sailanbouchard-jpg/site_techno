/*
 * outils/esquisse/outil_arc.js
 * Trois clics : le départ, l'arrivée, puis un point par lequel l'arc passe.
 * L'arc posé garde une poignée à son sommet : la déplacer change sa courbure,
 * la coter (outil Cote, clic sur l'arc) fixe son rayon.
 */

import { ajouterArc, bombeParTroisPoints, distance } from "../../noyau/esquisse/elements_esquisse.js";
import { pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace } from "./options_esquisse.js";

let bouts = [];           // [{ uv, id }] : le départ, puis l'arrivée
let dernier = null;

function terminer(contexte) {
  bouts = [];
  contexte.esquisse.apercu([]);
  contexte.mesurer(null);
}

function tracerArc(a, b, passage) {
  const bombe = bombeParTroisPoints(a, passage, b) ?? 0;
  const provisoire = { points: { a, b }, courbes: [] };
  return { bombe, points: pointsDeCourbe(provisoire, { genre: "arc", a: "a", b: "b", bombe }) };
}

function montrer(contexte) {
  if (dernier === null) return;
  contexte.esquisse.montrer(dernier);
  if (bouts.length === 1) {
    contexte.esquisse.apercu([{ points: [bouts[0].uv, dernier.uv] }]);
    contexte.mesurer("Arc : cliquer le point d'arrivée.");
  } else if (bouts.length === 2) {
    contexte.esquisse.apercu([{ points: tracerArc(bouts[0].uv, bouts[1].uv, dernier.uv).points }]);
    contexte.mesurer("Arc : cliquer un point de passage.");
  }
}

function poser(contexte) {
  const ici = { uv: dernier.uv, id: dernier.idPoint };
  if (bouts.length < 2) {
    if (bouts.length === 0 || distance(ici.uv, bouts[0].uv) > 1e-6) bouts.push(ici);
    return;
  }
  const [a, b] = bouts;
  const { bombe } = tracerArc(a.uv, b.uv, ici.uv);
  contexte.esquisse.modifier((contenu) => {
    const extremite = (bout) => (bout.id !== null && bout.id in contenu.points ? bout.id : bout.uv);
    return ajouterArc(contenu, extremite(a), extremite(b), bombe).contenu;
  }, "Arc");
  terminer(contexte);
}

export default outilDeTrace({
  nom: "arc",
  etiquette: "Arc",
  termeDuProgramme: "arc de cercle",
  aide: "Un arc : départ, arrivée, puis un point de passage. Le point au sommet de l'arc reste : le déplacer change la courbure. Le centre, marqué d'une croix, se déplace ou se soude à un autre point.",
  raccourci: "A",

  desactiver: terminer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    dernier = contexte.esquisse.accrocher(evenement, { depuis: bouts.at(-1)?.uv ?? null });
    if (dernier === null) return;
    poser(contexte);
    montrer(contexte);
  },

  surDeplacement(evenement, contexte) {
    const vise = contexte.esquisse.accrocher(evenement, { depuis: bouts.at(-1)?.uv ?? null });
    if (vise === null) return;
    dernier = vise;
    montrer(contexte);
  },

  surTouche(evenement, contexte) {
    if (bouts.length > 0 && evenement.key === "Escape") {
      terminer(contexte);
      return true;
    }
    return false;
  },
});
