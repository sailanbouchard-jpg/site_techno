/*
 * noyau/format_cotes.js
 * Une cote en millimètres, écrite à la française, au dixième.
 */

export const cote = (valeur) => (Math.round(valeur * 10) / 10).toLocaleString("fr-FR");
