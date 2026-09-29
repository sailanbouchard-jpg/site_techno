/*
 * outils/esquisse/trace_depuis_un_centre.js
 * Le cercle et le polygone se tracent pareil : un clic au centre, un second
 * pour la taille. La cote se tape au clavier ; la souris donne l'orientation.
 */

import { distance } from "../../noyau/esquisse/elements_esquisse.js";
import { creerSaisie } from "./saisie_au_clavier.js";
import { outilDeTrace } from "./options_esquisse.js";

/*
 * description : { nom, etiquette, termeDuProgramme, aide, raccourci, optionsBandeau?,
 *   champ: { cle, etiquette, unite, versRayon(valeur), depuisRayon(rayon) },
 *   contour(centre, rayon, angle, options) → [[u, v], …] pour l'aperçu,
 *   ajouter(contenu, centre, rayon, angle, options) → contenu }
 * centre, dans ajouter : l'identifiant d'un point existant, ou [u, v].
 */
export function outilDepuisUnCentre(description) {
  const { champ } = description;
  const saisie = creerSaisie([champ]);
  let centre = null;       // { uv, id }
  let dernier = null;

  function mesurer() {
    const tapee = saisie.valeur(champ.cle);
    const rayon = tapee !== undefined ? champ.versRayon(tapee) : distance(centre.uv, dernier.uv);
    const angle = Math.atan2(dernier.uv[1] - centre.uv[1], dernier.uv[0] - centre.uv[0]) || 0;
    return { rayon, angle };
  }

  function terminer(contexte) {
    centre = null;
    saisie.vider();
    contexte.esquisse.apercu([]);
    contexte.mesurer(null);
  }

  function montrer(contexte) {
    if (dernier === null) return;
    contexte.esquisse.montrer(dernier);
    if (centre === null) return;
    const { rayon, angle } = mesurer();
    const contour = description.contour(centre.uv, rayon, angle, contexte.options());
    contexte.esquisse.apercu([{ points: [...contour, contour[0]] }, { points: [centre.uv, dernier.uv] }]);
    contexte.mesurer(saisie.texte({ [champ.cle]: champ.depuisRayon(rayon) }));
  }

  function poser(contexte) {
    if (centre === null) {
      centre = { uv: dernier.uv, id: dernier.idPoint };
      return;
    }
    const { rayon, angle } = mesurer();
    if (!(rayon > 1e-6)) return;
    const c = centre;
    const options = contexte.options();
    contexte.esquisse.modifier((contenu) => {
      const point = c.id !== null && c.id in contenu.points ? c.id : c.uv;
      return description.ajouter(contenu, point, rayon, angle, options);
    }, description.etiquette);
    terminer(contexte);
  }

  return outilDeTrace({
    nom: description.nom,
    etiquette: description.etiquette,
    termeDuProgramme: description.termeDuProgramme,
    aide: description.aide,
    raccourci: description.raccourci,
    ...(description.optionsBandeau ? { optionsBandeau: description.optionsBandeau } : {}),

    desactiver: terminer,

    surAppui(evenement, contexte) {
      if (evenement.button !== 0) return;
      dernier = contexte.esquisse.accrocher(evenement, { depuis: centre?.uv ?? null });
      if (dernier === null) return;
      poser(contexte);
      montrer(contexte);
    },

    surDeplacement(evenement, contexte) {
      const vise = contexte.esquisse.accrocher(evenement, { depuis: centre?.uv ?? null });
      if (vise === null) return;
      dernier = vise;
      montrer(contexte);
    },

    surTouche(evenement, contexte) {
      const resultat = centre === null ? null : saisie.touche(evenement);
      if (resultat === "valider" && dernier !== null) poser(contexte);
      if (resultat !== null) {
        montrer(contexte);
        return true;
      }
      if (centre !== null && evenement.key === "Escape") {
        terminer(contexte);
        return true;
      }
      return false;
    },
  });
}
