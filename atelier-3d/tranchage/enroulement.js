/*
 * tranchage/enroulement.js
 * ────────────────────────
 * Prédire quel bord va s'enrouler vers le haut.
 *
 * Le cas qu'aucun autre critère n'attrape : un dôme, un cône renversé, une
 * lettre en relief. Chaque couche ne déborde que d'un ou deux dixièmes de
 * millimètre — aucun palier de surplomb ne se déclenche, le diagnostic ne voit
 * qu'un porte-à-faux négligeable — mais le débord se REPÈTE, et au bout de
 * quelques couches le bord s'est retroussé vers le haut. La buse finit par
 * taper dedans : c'est la première cause de pièce arrachée en cours
 * d'impression, et elle est invisible couche par couche.
 *
 * PrusaSlicer en a fait un modèle de prédiction, repris par OrcaSlicer. Le
 * principe, repris ici : chaque bout de ligne reçoit une NOTE qui ne dépend pas
 * seulement de son propre débord, mais aussi de la note de ce qui est juste en
 * dessous — un bord qui s'enroule porte mal, donc ce qu'il porte s'enroule plus
 * encore.
 *
 *   note = 0                                        si la ligne repose assez
 *   note = part dans le vide + 0,7 × note du dessous sinon
 *
 * « Repose assez » veut dire moins de la moitié de la largeur dans le vide :
 * c'est le cran du surplomb moyen, et en dessous la matière reste franchement
 * soudée à celle d'en dessous (un chanfrein à 45° est à 48 % et s'imprime très
 * bien).
 *
 * La note d'une seule couche ne dépasse donc jamais 1, et la note critique est
 * au-dessus : un pont d'une couche, dont la paroi est entièrement en l'air, n'est
 * pas un enroulement. Avec une mémoire de 0,7 la note tend vers 3,33 × la part :
 * deux couches de suite entièrement dans le vide, ou quatre à moitié, passent la
 * note critique — et c'est bien là que le bord commence à se retrousser.
 *
 * Les notes ne sont pas rangées par segment — d'une couche à l'autre, les
 * segments ne se correspondent pas — mais dans une GRILLE de la taille d'une
 * ligne : une ligne lit la note là où elle passe, et y écrit la sienne.
 */

// Ce qu'une couche retient de la note d'en dessous.
const MEMOIRE = 0.7;
// En deçà de cette part dans le vide, la ligne repose assez : la note repart de zéro.
const PART_QUI_COMPTE = 0.5;
// La note ne monte pas indéfiniment : au-delà, c'est pareil (et les nombres restent sains).
const PLAFOND = 3;

/*
 * largeur : la largeur d'une ligne, qui donne la maille de la grille.
 * Rend un accumulateur à utiliser couche par couche, de bas en haut :
 *   noter(x, y, part) → la note de ce point, et elle est retenue pour la couche d'au-dessus
 *   coucheSuivante()  → la couche en cours devient la couche d'en dessous
 */
export function nouvelEnroulement(largeur) {
  const maille = Math.max(0.4, largeur);
  let dessous = new Map();
  let courante = new Map();
  const cle = (cx, cy) => cx + ":" + cy;

  return {
    noter(x, y, part) {
      const cx = Math.floor(x / maille);
      const cy = Math.floor(y / maille);
      if (part < PART_QUI_COMPTE) {
        // La ligne repose : elle n'enroule rien, et n'a rien à transmettre.
        return 0;
      }
      // Ce qui est en dessous, au plus près : la ligne a pu se décaler d'une case.
      let avant = 0;
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const note = dessous.get(cle(cx + dx, cy + dy));
          if (note !== undefined && note > avant) avant = note;
        }
      }
      const note = Math.min(PLAFOND, part + MEMOIRE * avant);
      const k = cle(cx, cy);
      const deja = courante.get(k);
      if (deja === undefined || note > deja) courante.set(k, note);
      return note;
    },
    coucheSuivante() {
      dessous = courante;
      courante = new Map();
    },
  };
}
