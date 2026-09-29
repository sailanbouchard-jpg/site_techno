/*
 * tranchage/estimations.js
 * ────────────────────────
 * Le temps d'impression et la matière, estimés ligne par ligne :
 *   - chaque ligne va à la vitesse de son type (celle de la première couche
 *     pour la première), plafonnée par le débit maximal du filament :
 *     vitesse ≤ débit / (largeur × hauteur) ;
 *   - la tête accélère et freine : sur chaque tronçon droit (les angles de
 *     moins de 30° ne l'arrêtent pas), temps d'un profil trapézoïdal ;
 *   - les déplacements d'une ligne à la suivante, dans la pièce, sont comptés.
 * Le temps est rendu couche par couche : le ralentissement des couches trop
 * courtes (refroidissement) se décide sur le plateau entier, pas pièce par
 * pièce, et c'est le fil principal qui l'applique.
 * Ne sont pas comptés : les changements de couche et les rétractions.
 */

import { TYPES_DE_LIGNE as T, NOMBRE_DE_TYPES } from "./protocole_tranchage.js";

const COS_ANGLE_SANS_ARRET = Math.cos(30 * Math.PI / 180);

// Pour chaque type de ligne : [réglage de vitesse, réglage d'accélération]. Le G-code s'en sert aussi.
export const VITESSES = {
  [T.paroiExterieure]: ["vitesse_paroi_exterieure", "acceleration_paroi_exterieure"],
  [T.paroisInterieures]: ["vitesse_parois_interieures", "acceleration_defaut"],
  [T.dessus]: ["vitesse_dessus", "acceleration_dessus"],
  [T.dessous]: ["vitesse_plein_interieur", "acceleration_defaut"],
  [T.pleinInterieur]: ["vitesse_plein_interieur", "acceleration_defaut"],
  [T.remplissage]: ["vitesse_remplissage", "acceleration_defaut"],
  [T.jupe]: ["vitesse_premiere_couche", "acceleration_premiere_couche"],
  [T.bordure]: ["vitesse_premiere_couche", "acceleration_premiere_couche"],
  [T.paroiEnSurplomb]: ["vitesse_surplomb_moyen", "acceleration_paroi_exterieure"],
  [T.pont]: ["vitesse_pont", "acceleration_defaut"],
  [T.interstices]: ["vitesse_interstices", "acceleration_defaut"],
  [T.repassage]: ["vitesse_repassage", "acceleration_dessus"],
  [T.pontInterieur]: ["vitesse_pont_interieur", "acceleration_defaut"],
};

/*
 * La vitesse et l'accélération voulues d'une ligne, avant le plafond du débit.
 * Première couche : ses propres valeurs. Les « couches de transition » qui
 * suivent montent par paliers réguliers jusqu'aux valeurs normales : passer
 * d'un coup de 50 à 250 mm/s arrache une première couche encore tendre.
 */
export function vitesseVoulue(couche, type, reglages, palier = 0) {
  const [cleVitesse, cleAcceleration] = VITESSES[type];
  // Les paliers de surplomb : plus la ligne est dans le vide, plus elle est lente.
  const cle = type === T.paroiEnSurplomb && reglages.strategie_surplomb !== "unique"
    ? ["vitesse_surplomb_leger", "vitesse_surplomb_moyen", "vitesse_surplomb_fort"][Math.min(2, Math.max(0, palier - 1))]
    : cleVitesse;
  const normale = { vitesse: reglages[cle], acceleration: reglages[cleAcceleration] };
  const premiere = { vitesse: reglages.vitesse_premiere_couche, acceleration: reglages.acceleration_premiere_couche };
  if (couche === 0) return premiere;
  const transition = reglages.couches_transition;
  if (couche > transition) return normale;
  const t = couche / (transition + 1);
  const entre = (a, b) => (b > a ? a + (b - a) * t : b);
  return { vitesse: entre(premiere.vitesse, normale.vitesse), acceleration: entre(premiere.acceleration, normale.acceleration) };
}

/* Temps pour parcourir l, en partant et en finissant à l'arrêt. */
function tempsTrapeze(l, v, a) {
  if (l <= 0) return 0;
  return l >= (v * v) / a ? l / v + v / a : 2 * Math.sqrt(l / a);
}

/* Section d'une ligne déposée : rectangle aux bords arrondis. */
export function sectionDeLigne(largeur, hauteur) {
  return (largeur - hauteur) * hauteur + Math.PI * (hauteur / 2) ** 2;
}

/*
 * La matière déposée par millimètre, en mm². Un repassage ne dépose pas un
 * cordon mais un film : la part demandée de ce que couvrirait une ligne pleine.
 */
export function sectionExtrudee(type, largeur, hauteur, reglages) {
  if (type === T.repassage) return largeur * hauteur * (reglages.debit_repassage / 100);
  return sectionDeLigne(largeur, hauteur);
}

/*
 * chemins : [{ couche, type, largeur, points, ferme, palier }] dans l'ordre d'impression
 * (palier : le cran de surplomb, 1 à 3, pour les parois en surplomb).
 * Chaque chemin reçoit sa vitesse réelle (chemin.vitesse, mm/s) : l'aperçu la colore.
 * Rend {
 *   volumes          Float64Array : mm³ par type
 *   temps            Float64Array : secondes par couche et par type (couche × NOMBRE_DE_TYPES + type)
 *   deplacements     Float64Array : secondes de déplacement par couche
 * }
 */
export function estimer(chemins, couches, reglages) {
  const n = couches.hauteurs.length;
  const volumes = new Float64Array(NOMBRE_DE_TYPES);
  const tempsParCouche = new Float64Array(n * NOMBRE_DE_TYPES);
  const deplacements = new Float64Array(n);
  let precedent = null;
  for (const chemin of chemins) {
    const hauteur = couches.epaisseurs[chemin.couche];
    const voulue = vitesseVoulue(chemin.couche, chemin.type, reglages, chemin.palier);
    const section = sectionExtrudee(chemin.type, chemin.largeur, hauteur, reglages);
    const vitesse = Math.min(voulue.vitesse, reglages.debit_maximal / section);
    const acceleration = voulue.acceleration;
    chemin.vitesse = vitesse;

    const points = chemin.ferme ? [...chemin.points, chemin.points[0]] : chemin.points;
    let longueur = 0;
    let temps = 0;
    let troncon = 0;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      longueur += l;
      troncon += l;
      const suivant = points[i + 2];
      if (suivant !== undefined) {
        const [ux, uy] = [points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]];
        const [vx, vy] = [suivant[0] - points[i + 1][0], suivant[1] - points[i + 1][1]];
        const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
        if (cos >= COS_ANGLE_SANS_ARRET) continue;
      }
      temps += tempsTrapeze(troncon, vitesse, acceleration);
      troncon = 0;
    }

    volumes[chemin.type] += longueur * section;
    tempsParCouche[chemin.couche * NOMBRE_DE_TYPES + chemin.type] += temps;

    if (precedent !== null) {
      const saut = Math.hypot(points[0][0] - precedent[0], points[0][1] - precedent[1]);
      deplacements[chemin.couche] += tempsTrapeze(saut, reglages.vitesse_deplacement, reglages.acceleration_deplacement);
    }
    precedent = points.at(-1);
  }
  return { volumes, temps: tempsParCouche, deplacements };
}
