/*
 * tranchage/protocole_tranchage.js
 * ────────────────────────────────
 * Ce que le fil principal et l'ouvrier de tranchage ont en commun. Importé des
 * deux côtés : rien que des constantes.
 */

export const TYPES_DE_LIGNE = Object.freeze({
  paroiExterieure: 0,
  paroisInterieures: 1,
  dessus: 2,
  dessous: 3,
  pleinInterieur: 4,
  remplissage: 5,
  jupe: 6,
  bordure: 7,
  paroiEnSurplomb: 8,
  pont: 9,
  interstices: 10,
  repassage: 11,
  pontInterieur: 12,
});
export const NOMBRE_DE_TYPES = 13;

/*
 * Un chemin, dans la réponse. Neuf entiers, dans cet ordre :
 *   0  couche
 *   1  type de ligne
 *   2  premier point (indice dans le tableau des points)
 *   3  nombre de points
 *   4  largeur, en micromètres
 *   5  fermé (1) ou ouvert (0)
 *   6  vitesse réelle, en centièmes de mm/s, avant le ralentissement des
 *      couches courtes (que le fil principal applique)
 *   7  surplomb : la part de la largeur qui est dans le vide, en millièmes
 *      (0 pour une ligne entièrement posée). Le G-code en tire le débit.
 *   8  enroulement : la note d'enroulement du bord, en millièmes (voir
 *      tranchage/enroulement.js). Le G-code en tire la ventilation.
 * Les champs s'AJOUTENT en fin de liste : un lecteur qui ne connaît que les
 * sept premiers continue de fonctionner.
 */
export const CHAMPS_PAR_CHEMIN = 9;

/*
 * Au-delà de cette note d'enroulement, le bord est jugé instable : ventilation à
 * fond, vitesse de surplomb fort, et les déplacements ne passent plus au-dessus.
 * La valeur est choisie pour qu'UNE couche ne suffise jamais (une ligne
 * entièrement en l'air note 1 à elle seule, et c'est le cas normal d'un pont) :
 * il faut deux couches de suite entièrement dans le vide, ou quatre à moitié.
 * Voir tranchage/enroulement.js pour le calcul.
 */
export const ENROULEMENT_CRITIQUE = 1.2;
