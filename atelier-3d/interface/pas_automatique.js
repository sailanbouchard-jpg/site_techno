/*
 * interface/pas_automatique.js
 * ────────────────────────────
 * De combien une flèche fait varier une valeur. Une seule règle pour tous les
 * champs de l'atelier, pour qu'ils se comportent tous de la même façon :
 *
 *   - le pas est le dernier chiffre écrit : 0,6 → 0,7 ; 0,42 → 0,43 ; 15 → 16 ;
 *   - mais jamais moins d'un centième de l'ordre de grandeur : 1800 → 1810,
 *     personne ne règle un module d'élasticité au MPa près ;
 *   - une valeur nulle prend un dixième de l'étendue permise (bornes 0 à 3 → 0,1),
 *     ou 1 sans bornes ;
 *   - un champ qui compte des objets avance d'au moins 1.
 *
 * Le champ garde ce pas tant qu'on ne retape pas la valeur : de 0,9 à 1, la
 * flèche suivante mène à 1,1 et non à 2. Et chaque position est
 * « départ + n × pas » : monter puis redescendre revient toujours exactement
 * au point de départ, sans erreur d'arrondi qui s'accumule.
 */

const DECIMALES_MAX = 6;

/* Le nombre de décimales qu'on écrirait pour ce nombre (0,420 → 2). */
export function decimalesDe(v) {
  if (!Number.isFinite(v)) return 0;
  const texte = Math.abs(v).toFixed(DECIMALES_MAX).replace(/0+$/, "");
  const point = texte.indexOf(".");
  return point < 0 || point === texte.length - 1 ? 0 : texte.length - point - 1;
}

/* bornes : { min, max } (null : aucune) ; entier : le champ compte des objets. */
export function pasPour(valeur, { min = null, max = null, entier = false } = {}) {
  let pas;
  if (!Number.isFinite(valeur) || Math.abs(valeur) < 1e-12) {
    const etendue = min !== null && max !== null ? max - min : 0;
    pas = etendue > 0 ? 10 ** Math.floor(Math.log10(etendue / 10)) : 1;
  } else {
    const dernierChiffre = 10 ** -decimalesDe(valeur);
    const centiemeDeLOrdre = 10 ** (Math.floor(Math.log10(Math.abs(valeur))) - 2);
    pas = Math.max(dernierChiffre, centiemeDeLOrdre);
  }
  return entier ? Math.max(1, Math.round(pas)) : pas;
}

/* La valeur au rang n, écrite sans poussière d'arrondi (0,1 + 0,2 = 0,3).
   finesse : le plus petit pas employé (Ctrl en fait un dixième). */
export function valeurAuRang(depart, rang, pas, finesse = pas) {
  const decimales = Math.min(DECIMALES_MAX, Math.max(decimalesDe(depart), decimalesDe(finesse)));
  return Number((depart + rang * pas).toFixed(decimales));
}

/* La valeur usuelle suivante dans ce sens, ou null s'il n'y en a plus. */
export function valeurUsuelleSuivante(valeurs, actuelle, sens) {
  const triees = [...valeurs].sort((a, b) => a - b);
  const tolerance = 1e-9 * Math.max(1, Math.abs(actuelle));
  if (sens > 0) return triees.find((v) => v > actuelle + tolerance) ?? null;
  return [...triees].reverse().find((v) => v < actuelle - tolerance) ?? null;
}
