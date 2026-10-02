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
 *
 * Trois cas pèsent sur la vitesse en plus du type de ligne, et sont traités ici
 * parce que c'est ici qu'on sait tout d'un chemin :
 *   le SURPLOMB      la part de la largeur qui est dans le vide, de 0 à 1 ;
 *   l'ENROULEMENT    la note cumulée d'un bord qui se retrousse ;
 *   le PETIT CONTOUR une boucle si courte que l'accélération ne laisse jamais
 *                    atteindre la vitesse demandée.
 */

import { TYPES_DE_LIGNE as T, NOMBRE_DE_TYPES, ENROULEMENT_CRITIQUE } from "./protocole_tranchage.js";

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

// Les types qui forment le tour de la pièce : eux seuls peuvent être un « petit contour ».
const PAROIS = new Set([T.paroiExterieure, T.paroisInterieures]);

/*
 * La vitesse d'une paroi en surplomb, selon la part de sa largeur qui est dans
 * le vide. Les quatre points de repère sont la vitesse de paroi normale (part 0)
 * et les trois vitesses de surplomb (¼, ½, ¾ et au-delà).
 *   paliers     la part ne vaut que ¼, ½ ou ¾ : on retombe exactement sur les
 *               trois réglages, comme dans OrcaSlicer ;
 *   progressive la part est mesurée plus fin et la vitesse est interpolée : plus
 *               de marche d'un morceau au suivant, donc plus de bourrelet ;
 *   unique      tout débord passe à la vitesse du surplomb moyen.
 * Le repère de la part nulle est la vitesse de la paroi EXTÉRIEURE : c'est elle
 * qui déborde dans la très grande majorité des cas, et c'est la plus lente des
 * deux — se tromper du bon côté ne coûte que du temps.
 */
export function vitesseDeSurplomb(part, reglages) {
  if (reglages.strategie_surplomb === "unique") return reglages.vitesse_surplomb_moyen;
  const parts = [0, 0.25, 0.5, 0.75];
  const vitesses = [
    reglages.vitesse_paroi_exterieure,
    reglages.vitesse_surplomb_leger,
    reglages.vitesse_surplomb_moyen,
    reglages.vitesse_surplomb_fort,
  ];
  if (!(part > 0)) return vitesses[0];
  if (part >= parts[3]) return vitesses[3];
  for (let i = 1; i < parts.length; i += 1) {
    if (part > parts[i]) continue;
    const t = (part - parts[i - 1]) / (parts[i] - parts[i - 1]);
    return vitesses[i - 1] + (vitesses[i] - vitesses[i - 1]) * t;
  }
  return vitesses[3];
}

/*
 * La vitesse et l'accélération voulues d'une ligne, avant le plafond du débit.
 * ligne : { surplomb, enroulement, longueur, ferme } — ce que le tranchage sait
 * du chemin. Un appelant qui n'a besoin que de l'accélération peut l'omettre.
 * Première couche : ses propres valeurs. Les « couches de transition » qui
 * suivent montent par paliers réguliers jusqu'aux valeurs normales : passer
 * d'un coup de 50 à 250 mm/s arrache une première couche encore tendre.
 */
export function vitesseVoulue(couche, type, reglages, ligne = {}) {
  const [cleVitesse, cleAcceleration] = VITESSES[type];
  let vitesse = type === T.paroiEnSurplomb
    ? vitesseDeSurplomb(ligne.surplomb ?? 1, reglages)
    : reglages[cleVitesse];
  // Un bord qui s'est retroussé : au plus lent, quel que soit son propre débord —
  // ce qui l'a mis dans cet état, c'est l'accumulation, pas la couche en cours.
  if ((ligne.enroulement ?? 0) >= ENROULEMENT_CRITIQUE) {
    vitesse = Math.min(vitesse, reglages.vitesse_surplomb_fort);
  }
  // Un petit contour (un trou de quelques millimètres) n'atteint jamais la
  // vitesse demandée : la tête passe son temps à accélérer et à freiner, l'avance
  // de pression s'affole, et le trou sort ovale et trop petit.
  if (PAROIS.has(type) && ligne.ferme === true && reglages.seuil_petits_contours > 0
    && ligne.longueur > 0 && ligne.longueur < reglages.seuil_petits_contours) {
    vitesse = Math.min(vitesse, reglages.vitesse_petits_contours);
  }

  const normale = { vitesse, acceleration: reglages[cleAcceleration] };
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
 * La matière déposée par millimètre, en mm².
 *   repassage  ne dépose pas un cordon mais un film : la part demandée de ce que
 *              couvrirait une ligne pleine ;
 *   pont       un brin tendu dans le vide ne s'écrase sur rien : il reste ROND,
 *              du diamètre de la largeur des ponts. C'est bien plus de matière
 *              qu'une ligne posée de même largeur (π/4 × d² contre ≈ d × h), et
 *              c'est ce qu'il faut : les brins sont espacés de leur diamètre, et
 *              sous-alimentés ils pendent, s'écartent, et finissent par casser.
 *              Le pont INTÉRIEUR, lui, repose de place en place sur le
 *              remplissage : il s'écrase, et garde la section ordinaire.
 *   le reste   la section d'une ligne déposée.
 */
export function sectionExtrudee(type, largeur, hauteur, reglages) {
  if (type === T.repassage) return largeur * hauteur * (reglages.debit_repassage / 100);
  if (type === T.pont) return Math.PI * (largeur / 2) ** 2 * (reglages.debit_pont / 100);
  return sectionDeLigne(largeur, hauteur);
}

/*
 * chemins : [{ couche, type, largeur, points, ferme, surplomb, enroulement }]
 * dans l'ordre d'impression.
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
    const points = chemin.ferme ? [...chemin.points, chemin.points[0]] : chemin.points;

    // La longueur d'abord : c'est elle qui dit si la boucle est un petit contour.
    let longueur = 0;
    for (let i = 0; i + 1 < points.length; i += 1) {
      longueur += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    }

    const voulue = vitesseVoulue(chemin.couche, chemin.type, reglages, {
      surplomb: chemin.surplomb, enroulement: chemin.enroulement, longueur, ferme: chemin.ferme,
    });
    const section = sectionExtrudee(chemin.type, chemin.largeur, hauteur, reglages);
    const vitesse = Math.min(voulue.vitesse, reglages.debit_maximal / section);
    const acceleration = voulue.acceleration;
    chemin.vitesse = vitesse;

    let temps = 0;
    let troncon = 0;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const l = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
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
