/*
 * outils/esquisse/outil_rectangle.js
 * Deux coins opposés. Longueur et largeur se tapent au clavier ; la souris
 * dit de quel côté du premier coin le rectangle s'étend. Ses côtés naissent
 * contraints horizontaux et verticaux, comme tout segment tracé ainsi : coté
 * ensuite, il reste un rectangle.
 */

import { ajouterPolyligne } from "../../noyau/esquisse/elements_esquisse.js";
import { creerSaisie } from "./saisie_au_clavier.js";
import { outilDeTrace } from "./options_esquisse.js";

const saisie = creerSaisie([
  { cle: "longueur", etiquette: "Longueur", unite: "mm" },
  { cle: "largeur", etiquette: "Largeur", unite: "mm" },
]);
let coin = null;
let dernier = null;

function oppose(vise) {
  const [du, dv] = [vise.uv[0] - coin[0], vise.uv[1] - coin[1]];
  const l = saisie.valeur("longueur");
  const h = saisie.valeur("largeur");
  return [
    coin[0] + (l === undefined ? du : Math.abs(l) * (Math.sign(du) || 1)),
    coin[1] + (h === undefined ? dv : Math.abs(h) * (Math.sign(dv) || 1)),
  ];
}

const sommets = (a, b) => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];

function terminer(contexte) {
  coin = null;
  saisie.vider();
  contexte.esquisse.apercu([]);
  contexte.mesurer(null);
}

function montrer(contexte) {
  if (dernier === null) return;
  if (coin === null) {
    contexte.esquisse.montrer(dernier);
    return;
  }
  const b = oppose(dernier);
  const s = sommets(coin, b);
  contexte.esquisse.apercu([{ points: [...s, s[0]] }]);
  contexte.esquisse.montrer(saisie.active() ? { ...dernier, uv: b, guides: [] } : dernier);
  contexte.mesurer(saisie.texte({ longueur: Math.abs(b[0] - coin[0]), largeur: Math.abs(b[1] - coin[1]) }));
}

function poser(contexte) {
  if (coin === null) {
    coin = dernier.uv;
    return;
  }
  const b = oppose(dernier);
  if (Math.abs(b[0] - coin[0]) < 1e-6 || Math.abs(b[1] - coin[1]) < 1e-6) return;
  const a = coin;
  contexte.esquisse.modifier((contenu) => ajouterPolyligne(contenu, sommets(a, b).map((point) => ({ point })), true).contenu, "Rectangle");
  terminer(contexte);
}

export default outilDeTrace({
  nom: "rectangle",
  etiquette: "Rectangle",
  termeDuProgramme: "rectangle",
  aide: "Un rectangle par deux coins opposés. Longueur et largeur peuvent se saisir au clavier.",
  raccourci: "R",

  desactiver: terminer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    dernier = contexte.esquisse.accrocher(evenement, { depuis: coin });
    if (dernier === null) return;
    poser(contexte);
    montrer(contexte);
  },

  surDeplacement(evenement, contexte) {
    const vise = contexte.esquisse.accrocher(evenement, { depuis: coin });
    if (vise === null) return;
    dernier = vise;
    montrer(contexte);
  },

  surTouche(evenement, contexte) {
    const resultat = coin === null ? null : saisie.touche(evenement);
    if (resultat === "valider" && dernier !== null) poser(contexte);
    if (resultat !== null) {
      montrer(contexte);
      return true;
    }
    if (coin !== null && evenement.key === "Escape") {
      terminer(contexte);
      return true;
    }
    return false;
  },
});
