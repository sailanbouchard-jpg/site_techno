/*
 * outils/esquisse/outil_trait.js
 * Un segment, deux clics : le départ, puis l'arrivée. Le trait posé, l'outil
 * lâche son dernier point : le segment suivant se commence par un nouveau
 * clic, qui peut viser le bout du précédent pour les relier. Longueur et
 * angle s'affichent en continu et se tapent au clavier. Échap abandonne.
 */

import { ajouterSegment, distance } from "../../noyau/esquisse/elements_esquisse.js";
import { creerSaisie } from "./saisie_au_clavier.js";
import { outilDeTrace, DEGRES } from "./options_esquisse.js";

const saisie = creerSaisie([
  { cle: "longueur", etiquette: "Longueur", unite: "mm" },
  { cle: "angle", etiquette: "Angle", unite: "°" },
]);
let chaine = null;        // { uv, id } : le départ du trait en cours
let dernier = null;       // dernier point visé, pour Entrée

function proposer(vise) {
  if (chaine === null || !saisie.active()) return { uv: vise.uv, id: vise.idPoint };
  const [du, dv] = [vise.uv[0] - chaine.uv[0], vise.uv[1] - chaine.uv[1]];
  const longueur = saisie.valeur("longueur") ?? Math.hypot(du, dv);
  const angle = saisie.valeur("angle") !== undefined ? saisie.valeur("angle") / DEGRES : Math.atan2(dv, du);
  return { uv: [chaine.uv[0] + longueur * Math.cos(angle), chaine.uv[1] + longueur * Math.sin(angle)], id: null };
}

function terminer(contexte) {
  chaine = null;
  saisie.vider();
  contexte.esquisse.apercu([]);
  contexte.mesurer(null);
}

function montrer(contexte) {
  if (dernier === null) return;
  const fin = proposer(dernier);
  contexte.esquisse.apercu(chaine === null ? [] : [{ points: [chaine.uv, fin.uv] }]);
  contexte.esquisse.montrer(saisie.active() ? { ...dernier, uv: fin.uv, guides: [] } : dernier);
  if (chaine === null) return;
  const [du, dv] = [fin.uv[0] - chaine.uv[0], fin.uv[1] - chaine.uv[1]];
  contexte.mesurer(saisie.texte({ longueur: Math.hypot(du, dv), angle: Math.atan2(dv, du) * DEGRES }));
}

function poser(contexte) {
  const fin = proposer(dernier);
  if (chaine === null) {
    chaine = { uv: fin.uv, id: fin.id };
    return;
  }
  if (distance(fin.uv, chaine.uv) < 1e-6) return;
  const depart = chaine;
  contexte.esquisse.modifier((contenu) => {
    const a = depart.id !== null && depart.id in contenu.points ? depart.id : depart.uv;
    const b = fin.id !== null && fin.id in contenu.points ? fin.id : fin.uv;
    return ajouterSegment(contenu, a, b).contenu;
  }, "Trait");
  terminer(contexte);
}

export default outilDeTrace({
  nom: "trait",
  etiquette: "Trait",
  termeDuProgramme: "segments de droite",
  aide: "Un segment : un clic au départ, un clic à l'arrivée.",
  raccourci: "L",

  desactiver: terminer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    dernier = contexte.esquisse.accrocher(evenement, { depuis: chaine?.uv ?? null });
    if (dernier === null) return;
    poser(contexte);
    montrer(contexte);
  },

  surDeplacement(evenement, contexte) {
    const vise = contexte.esquisse.accrocher(evenement, { depuis: chaine?.uv ?? null });
    if (vise === null) return;
    dernier = vise;
    montrer(contexte);
  },

  surTouche(evenement, contexte) {
    const resultat = chaine === null ? null : saisie.touche(evenement);
    if (resultat === "valider" && dernier !== null) {
      poser(contexte);
      montrer(contexte);
      return true;
    }
    if (resultat === "pris") {
      montrer(contexte);
      return true;
    }
    if (chaine !== null && evenement.key === "Escape") {
      terminer(contexte);
      return true;
    }
    return false;
  },
});
