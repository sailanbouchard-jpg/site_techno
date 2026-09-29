/*
 * outils/outil_mesurer.js
 * Deux clics sur les pièces (ou au sol) : la distance s'affiche, avec son
 * détail en X, Y et Z. Le point visé s'aimante aux coins des faces. Un
 * troisième clic recommence une mesure. Rien n'est écrit dans le projet.
 */

const TOLERANCE_COIN_PX = 12;
const nombre = (valeur) => (Math.abs(valeur) < 0.005 ? 0 : valeur).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

let premier = null;     // point de départ, ou null
let second = null;      // point d'arrivée fixé, ou null

function viser(evenement, contexte) {
  const accroche = contexte.scene.pointAccroche(evenement.clientX, evenement.clientY, TOLERANCE_COIN_PX);
  if (accroche !== null) return accroche.point;
  return contexte.scene.pointAuSol(evenement.clientX, evenement.clientY);
}

function montrer(contexte, a, b) {
  const aides = [];
  if (a !== null) aides.push({ genre: "point", position: a });
  if (b !== null) aides.push({ genre: "point", position: b });
  if (a !== null && b !== null) {
    aides.push({ genre: "axe", de: a, a: b });
    const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    contexte.mesurer("Distance " + nombre(Math.hypot(dx, dy, dz)) + " mm · X " + nombre(Math.abs(dx))
      + "   Y " + nombre(Math.abs(dy)) + "   Z " + nombre(Math.abs(dz)) + " mm");
  } else {
    contexte.mesurer(a === null ? "Cliquer le premier point" : "Cliquer le second point");
  }
  contexte.scene.montrerAidesOutil(aides);
}

function recommencer(contexte) {
  premier = null;
  second = null;
  contexte.scene.montrerAidesOutil([]);
  contexte.mesurer(null);
}

export default {
  nom: "mesurer",
  etiquette: "Mesurer",
  termeDuProgramme: "distance entre deux points",
  aide: "Distance entre deux points cliqués. Les sommets attirent le curseur.",
  raccourci: "M",
  curseur: "crosshair",
  modeGizmo: null,
  optionsBandeau: [
    { cle: "aide", type: "texte", etiquette: "Cliquer deux points ; les sommets attirent le curseur. Échap : recommencer." },
  ],

  activer: recommencer,
  desactiver: recommencer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const point = viser(evenement, contexte);
    if (point === null) return;
    if (premier === null || second !== null) {
      premier = point;
      second = null;
    } else {
      second = point;
    }
    montrer(contexte, premier, second);
  },

  surDeplacement(evenement, contexte) {
    if (second !== null) return;
    const point = viser(evenement, contexte);
    if (point === null) return;
    montrer(contexte, premier ?? point, premier === null ? null : point);
  },

  surRelache() {},

  surTouche(evenement, contexte) {
    if (evenement.key !== "Escape" || premier === null) return false;
    recommencer(contexte);
    return true;
  },
};
