/*
 * outils/esquisse/outil_arc_centre.js
 * Trois clics : le centre, le départ (qui donne le rayon), puis l'arrivée.
 * L'arc tourne dans le sens où la souris l'a mené. Le centre reste un point
 * de l'esquisse : on peut le tirer, le coter, ou le souder à un autre point.
 */

import { ajouterArc, distance } from "../../noyau/esquisse/elements_esquisse.js";
import { pointsDeCourbe } from "../../noyau/esquisse/contours_esquisse.js";
import { outilDeTrace, nombre, DEGRES } from "./options_esquisse.js";

const TOUR = Math.PI * 2;
// Un arc qui fait presque le tour a une bombe infinie : on s'arrête avant.
const BALAYAGE_MAX = TOUR - 0.01;

let centre = null;        // { uv, id }
let depart = null;        // { uv, id }
let balayage = 0;         // angle parcouru depuis le départ, signé, suivi pas à pas
let dernier = null;

const angleVers = (p) => Math.atan2(p[1] - centre.uv[1], p[0] - centre.uv[0]);

function terminer(contexte) {
  centre = null;
  depart = null;
  balayage = 0;
  contexte.esquisse.apercu([]);
  contexte.mesurer(null);
}

/* Suit la souris d'un petit angle à l'autre : on sait ainsi de quel côté elle tourne. */
function suivre(uv) {
  if (depart === null || distance(uv, centre.uv) < 1e-9) return;
  const avant = angleVers(depart.uv) + balayage;
  let pas = angleVers(uv) - avant;
  pas -= TOUR * Math.round(pas / TOUR);
  balayage = Math.max(-BALAYAGE_MAX, Math.min(BALAYAGE_MAX, balayage + pas));
}

function arrivee() {
  const rayon = distance(depart.uv, centre.uv);
  const angle = angleVers(depart.uv) + balayage;
  return [centre.uv[0] + rayon * Math.cos(angle), centre.uv[1] + rayon * Math.sin(angle)];
}

function montrer(contexte) {
  if (dernier === null) return;
  contexte.esquisse.montrer(dernier);
  if (centre === null) return;
  if (depart === null) {
    contexte.esquisse.apercu([{ points: [centre.uv, dernier.uv] }]);
    contexte.mesurer("Arc par le centre — rayon " + nombre(distance(centre.uv, dernier.uv)) + " mm : cliquer le départ.");
    return;
  }
  const fin = arrivee();
  const provisoire = { points: { a: depart.uv, b: fin }, courbes: [] };
  const trace = Math.abs(balayage) < 1e-6 ? [depart.uv, fin]
    : pointsDeCourbe(provisoire, { genre: "arc", a: "a", b: "b", bombe: Math.tan(balayage / 4) });
  contexte.esquisse.apercu([{ points: trace }, { points: [centre.uv, depart.uv] }, { points: [centre.uv, fin] }]);
  contexte.mesurer("Arc par le centre — " + nombre(Math.abs(balayage) * DEGRES) + " ° : cliquer l'arrivée.");
}

function poser(contexte) {
  const ici = { uv: dernier.uv, id: dernier.idPoint };
  if (centre === null) {
    centre = ici;
    return;
  }
  if (depart === null) {
    if (distance(ici.uv, centre.uv) > 1e-6) {
      depart = ici;
      balayage = 0;
    }
    return;
  }
  if (Math.abs(balayage) < 1e-3) return;
  const [c, a, bombe] = [centre, depart, Math.tan(balayage / 4)];
  // L'arrivée tombe sur le cercle ; un point visé à la souris la remplace (le solveur ajuste).
  const fin = ici.id !== null && ici.id !== a.id ? ici : { uv: arrivee(), id: null };
  contexte.esquisse.modifier((contenu) => {
    const point = (p) => (p.id !== null && p.id in contenu.points ? p.id : p.uv);
    return ajouterArc(contenu, point(a), point(fin), bombe, point(c)).contenu;
  }, "Arc par le centre");
  terminer(contexte);
}

export default outilDeTrace({
  nom: "arcCentre",
  etiquette: "Arc par le centre",
  termeDuProgramme: "arc de cercle",
  aide: "Un arc : le centre, le départ, puis l'arrivée. Le centre reste un point de l'esquisse : on peut le déplacer ou le souder à un autre point.",
  raccourci: "",

  desactiver: terminer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    dernier = contexte.esquisse.accrocher(evenement, { depuis: centre?.uv ?? null });
    if (dernier === null) return;
    suivre(dernier.uv);
    poser(contexte);
    montrer(contexte);
  },

  surDeplacement(evenement, contexte) {
    const vise = contexte.esquisse.accrocher(evenement, { depuis: centre?.uv ?? null });
    if (vise === null) return;
    dernier = vise;
    suivre(vise.uv);
    montrer(contexte);
  },

  surTouche(evenement, contexte) {
    if (centre !== null && evenement.key === "Escape") {
      terminer(contexte);
      return true;
    }
    return false;
  },
});
