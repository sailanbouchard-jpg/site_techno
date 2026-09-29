/*
 * outils/esquisse/options_esquisse.js
 * Les réglages communs à tous les outils de tracé, et le contrat qu'ils
 * partagent. Réglages partagés : les changer dans un outil les change partout.
 */

export const OPTION_ACCROCHER = {
  cle: "accrocher", etiquette: "Accrocher", type: "case", defaut: true, partage: true,
  aide: "Le curseur s'accroche aux points et aux lignes des tracés existants.",
};

export const OPTION_GRILLE = {
  cle: "grille", etiquette: "Grille", type: "nombre", unite: "mm", defaut: 1, min: 0, max: 50, valeursUsuelles: [0, 0.5, 1, 2, 5, 10], partage: true,
  aide: "Pas de la grille sur laquelle les points se placent. 0 : points libres.",
};

export const OPTION_REFERENCES = {
  cle: "accrocherReferences", etiquette: "Références", type: "case", defaut: true, partage: true,
  aide: "Le curseur s'accroche aussi aux points de référence des esquisses précédentes (marques jaunes) ; un point posé dessus les suit. Décocher pour ne travailler qu'avec cette esquisse.",
};

export const OPTIONS_DE_TRACE = [OPTION_ACCROCHER, OPTION_REFERENCES, OPTION_GRILLE];

export const DEGRES = 180 / Math.PI;
export const nombre = (valeur) => (Math.abs(valeur) < 0.05 ? 0 : valeur).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/* Les champs communs d'un outil de tracé. */
export function outilDeTrace(champs) {
  return {
    famille: "esquisse",
    curseur: "crosshair",
    modeGizmo: null,
    optionsBandeau: OPTIONS_DE_TRACE,
    activer() {},
    surRelache() {},
    ...champs,
  };
}
