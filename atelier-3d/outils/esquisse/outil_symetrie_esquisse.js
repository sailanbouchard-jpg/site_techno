/*
 * outils/esquisse/outil_symetrie_esquisse.js
 * Symétrie dans l'esquisse : on choisit d'abord le miroir — un axe de
 * l'esquisse ou un segment déjà tracé — puis on clique les tracés à refléter,
 * un par un. Chaque clic pose son reflet tout de suite : on voit le résultat
 * avant d'en demander un autre.
 */

import { refleterCourbes } from "../../noyau/esquisse/elements_esquisse.js";
import { outilDeTrace } from "./options_esquisse.js";
import { viserCible, montrerCibles, effacerCibles } from "./cibles_de_contrainte.js";

let miroir = null;      // { genre: "axe", axe } ou { genre: "segment", id }, et sa cible pour l'affichage
let cibleMiroir = null;

const CONSIGNE_MIROIR = "Cliquer le miroir : un axe de l'esquisse, ou un segment.";
const CONSIGNE_TRACES = "Cliquer les tracés à refléter. Échap : choisir un autre miroir.";

function recommencer(contexte) {
  miroir = null;
  cibleMiroir = null;
  effacerCibles(contexte);
  contexte.mesurer(null);
}

export default outilDeTrace({
  nom: "symetrie_esquisse",
  etiquette: "Symétrie",
  termeDuProgramme: "symétrie d'un tracé",
  aide: "Reflète des tracés de l'autre côté d'un miroir : d'abord le miroir (un axe ou un segment), puis les tracés à refléter.",
  raccourci: "Y",
  groupe: "modification",

  activer(contexte) {
    recommencer(contexte);
    contexte.mesurer(CONSIGNE_MIROIR);
  },
  desactiver: recommencer,

  surAppui(evenement, contexte) {
    if (evenement.button !== 0) return;
    const cible = viserCible(evenement, contexte);
    if (cible === null) return;

    if (miroir === null) {
      if (cible.genre === "axe") miroir = { genre: "axe", axe: cible.axe };
      else if (cible.genre === "segment") miroir = { genre: "segment", id: cible.id };
      else {
        contexte.annoncer("Le miroir est un axe de l'esquisse ou un segment.", true);
        return;
      }
      cibleMiroir = cible;
      montrerCibles(contexte, [cible]);
      contexte.mesurer(CONSIGNE_TRACES);
      return;
    }

    if (cible.genre === "origine" || cible.genre === "axe" || cible.genre === "point") {
      contexte.annoncer("Cliquer un tracé à refléter (un segment, un arc, un cercle).", true);
      return;
    }
    if (miroir.genre === "segment" && miroir.id === cible.id) {
      contexte.annoncer("Le miroir ne peut pas se refléter lui-même.", true);
      return;
    }
    contexte.esquisse.modifier((contenu) => refleterCourbes(contenu, [cible.id], miroir), "Symétrie");
    montrerCibles(contexte, [cibleMiroir]);
    contexte.mesurer(CONSIGNE_TRACES);
  },

  surDeplacement(evenement, contexte) {
    const cible = viserCible(evenement, contexte);
    const apercu = cible !== null && (miroir === null
      ? cible.genre === "axe" || cible.genre === "segment"
      : cible.genre !== "point" && cible.genre !== "origine" && cible.genre !== "axe");
    montrerCibles(contexte, [cibleMiroir, apercu ? cible : null]);
  },

  surTouche(evenement, contexte) {
    if (evenement.key !== "Escape" || miroir === null) return false;
    recommencer(contexte);
    contexte.mesurer(CONSIGNE_MIROIR);
    return true;
  },
});
