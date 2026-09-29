/*
 * tranchage/diagnostic_impression.js
 * ──────────────────────────────────
 * Ce que le tranchage sait déjà dire de l'impression à venir, mis en phrases :
 * matière posée dans le vide, parties qui débordent trop d'une couche à
 * l'autre, parois plus fines qu'une ligne, pied trop petit pour tenir au
 * plateau.
 *
 * La mesure qui compte est le DÉBORD : de combien une couche dépasse, à
 * l'horizontale, de ce qui la porte en dessous. Un cône qui s'ouvre de 20°
 * déborde de 0,07 mm par couche — il s'imprime très bien ; un rebord qui
 * s'avance de 5 mm dans le vide, non. Compter les lignes marquées « pont »
 * ou « surplomb » ne ferait pas la différence : il y en a partout dès qu'une
 * face est inclinée.
 *
 * Tout se lit dans le résultat du tranchage (les contours de chaque couche,
 * les chemins et leur type) : aucun calcul de géométrie en plus.
 *
 * Chaque constat : { genre, gravite: "alerte" | "avis", titre, detail, types }
 * — types : les types de ligne à montrer dans l'aperçu pour voir le problème.
 */

import { TYPES_DE_LIGNE as T, CHAMPS_PAR_CHEMIN } from "./protocole_tranchage.js";

// En deçà, le débord d'une couche sur l'autre s'imprime sans rien faire.
const DEBORD_NEGLIGEABLE_MM = 1.5;
// Au-delà, la matière pend franchement dans le vide : supports conseillés.
const DEBORD_GRAVE_MM = 4;
// Des interstices sur cette longueur : la pièce a des parois plus fines qu'une ligne.
const INTERSTICES_NOTABLES_MM = 50;
// Une pièce qui ne touche le plateau que par cette surface risque de se décoller.
const PIED_FRAGILE_MM2 = 120;
// Un îlot plus petit que ça est un reste de découpe, pas de la matière en l'air.
const ILOT_NEGLIGEABLE_MM2 = 2;
// Assez de points par couche pour mesurer juste, sans parcourir des maillages entiers.
const POINTS_PAR_COUCHE = 120;

const lisible = (x, decimales = 0) => x.toLocaleString("fr-FR", { maximumFractionDigits: decimales });

/* La longueur de chaque type de ligne, en millimètres, pour une pièce. */
function longueursParType(piece) {
  const longueurs = new Map();
  const { chemins, points } = piece;
  for (let c = 0; c < chemins.length; c += CHAMPS_PAR_CHEMIN) {
    const [type, premier, nombre] = [chemins[c + 1], chemins[c + 2], chemins[c + 3]];
    const ferme = chemins[c + 5] === 1;
    let longueur = 0;
    for (let i = 1; i < nombre + (ferme ? 1 : 0); i += 1) {
      const a = (premier + i - 1) * 2;
      const b = (premier + (i % nombre)) * 2;
      longueur += Math.hypot(points[b] - points[a], points[b + 1] - points[a + 1]);
    }
    longueurs.set(type, (longueurs.get(type) ?? 0) + longueur);
  }
  return longueurs;
}

const aireDuContour = (contour) => {
  let aire = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const [p, q] = [contour[i], contour[(i + 1) % contour.length]];
    aire += p[0] * q[1] - q[0] * p[1];
  }
  return aire / 2;
};

/* Dans la matière d'une couche : règle pair-impair, les trous comptent comme dehors. */
function dansLaCouche([x, y], contours) {
  let dedans = false;
  for (const contour of contours) {
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i, i += 1) {
      const [xi, yi] = contour[i];
      const [xj, yj] = contour[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

/* La distance d'un point au bord le plus proche d'une couche. */
function distanceAuBord([x, y], contours) {
  let plusPres = Infinity;
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += 1) {
      const [ax, ay] = contour[i];
      const [bx, by] = contour[(i + 1) % contour.length];
      const [dx, dy] = [bx - ax, by - ay];
      const carre = dx * dx + dy * dy;
      const t = carre === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / carre));
      plusPres = Math.min(plusPres, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return plusPres;
}

/* Un point sur N, pour ne pas parcourir dix mille sommets par couche. */
function echantillon(contour) {
  const pas = Math.max(1, Math.ceil(contour.length / POINTS_PAR_COUCHE));
  return contour.filter((_, i) => i % pas === 0);
}

/*
 * Ce qui, d'une couche à l'autre, ne repose sur rien :
 *   debord  { valeur, couche } : le plus grand porte-à-faux mesuré ;
 *   ilots   [{ couche, aire }] : les contours entièrement en l'air.
 */
function porteAFaux(contours) {
  let debord = { valeur: 0, couche: 0 };
  const ilots = [];
  for (let k = 1; k < contours.length; k += 1) {
    const dessous = contours[k - 1] ?? [];
    if (dessous.length === 0) continue;
    const exterieursDessous = dessous.filter((c) => aireDuContour(c) > 0);
    for (const contour of contours[k] ?? []) {
      const aire = aireDuContour(contour);
      if (aire <= ILOT_NEGLIGEABLE_MM2) continue;
      const points = echantillon(contour);
      let enLAir = true;
      for (const point of points) {
        if (dansLaCouche(point, dessous)) {
          enLAir = false;
          continue;
        }
        const ecart = distanceAuBord(point, dessous);
        if (ecart > debord.valeur) debord = { valeur: ecart, couche: k };
      }
      // Un îlot ne pose rien sur la couche d'en dessous, et rien de la couche
      // d'en dessous ne se trouve sous lui : sinon, c'est un simple débord.
      if (enLAir && !exterieursDessous.some((autre) => echantillon(autre).some((point) => dansLaCouche(point, [contour])))) {
        ilots.push({ couche: k, aire });
      }
    }
  }
  return { debord, ilots };
}

/* L'aire posée sur le plateau : les contours de la première couche. */
function airePosee(contours) {
  return (contours[0] ?? []).reduce((somme, contour) => somme + aireDuContour(contour), 0);
}

/*
 * etat : ce que rend tranchage.etat() — { pieces, couches, reglages }.
 * nommer(rang) : le nom de la pièce, pour écrire de quoi on parle.
 * Rend la liste des constats, les plus graves d'abord.
 */
export function diagnostiquer(etat, nommer = () => "") {
  const constats = [];
  const hauteurs = etat.couches?.hauteurs ?? [];
  const pieces = (etat.pieces ?? []).filter((piece) => !piece.jupe);
  if (pieces.length === 0) return constats;

  let interstices = 0;
  let debord = { valeur: 0, couche: 0, rang: 0 };
  const enLAir = [];
  const pieds = [];

  pieces.forEach((piece, rang) => {
    interstices += longueursParType(piece).get(T.interstices) ?? 0;
    const contours = piece.contours ?? [];
    const mesures = porteAFaux(contours);
    if (mesures.debord.valeur > debord.valeur) debord = { ...mesures.debord, rang };
    for (const ilot of mesures.ilots) enLAir.push({ ...ilot, rang });
    pieds.push({ rang, aire: airePosee(contours) });
  });

  const nom = (rang) => {
    const texte = nommer(rang);
    return texte ? " (« " + texte + " »)" : "";
  };
  const hauteurDe = (couche) => lisible(hauteurs[couche] ?? 0, 1);

  if (enLAir.length > 0) {
    const plusHaut = enLAir.reduce((m, i) => (i.couche > m.couche ? i : m));
    constats.push({
      genre: "ilots",
      gravite: "alerte",
      titre: enLAir.length > 1 ? enLAir.length + " morceaux commencent en l'air" : "Un morceau commence en l'air",
      detail: "De la matière démarre sans rien dessous — la plus haute à " + hauteurDe(plusHaut.couche) + " mm" + nom(plusHaut.rang)
        + ". Sans supports, elle tombe. Retourner la pièce, la couper en deux morceaux à coller, ou activer les supports.",
      types: [T.dessous, T.pont],
    });
  }

  if (debord.valeur > DEBORD_NEGLIGEABLE_MM) {
    const grave = debord.valeur > DEBORD_GRAVE_MM;
    constats.push({
      genre: "surplombs",
      gravite: grave ? "alerte" : "avis",
      titre: "Porte-à-faux de " + lisible(debord.valeur, 1) + " mm",
      detail: "À " + hauteurDe(debord.couche) + " mm" + nom(debord.rang) + ", la pièce s'avance de "
        + lisible(debord.valeur, 1) + " mm au-dessus du vide. "
        + (grave
          ? "Autant de matière ne tient pas toute seule : prévoir des supports, ou poser la pièce autrement."
          : "Cela s'imprime, mais la surface du dessous sera irrégulière. Un chanfrein ou un angle des côtés arrangerait la chose."),
      types: [T.pont, T.paroiEnSurplomb, T.dessous],
    });
  }

  if (interstices > INTERSTICES_NOTABLES_MM) {
    constats.push({
      genre: "finesse",
      gravite: "avis",
      titre: "Parois plus fines qu'une ligne",
      detail: "Sur " + lisible(interstices / 10, 1) + " cm, la pièce est trop étroite pour une paroi entière :"
        + " le trancheur y met des lignes de bouchage, plus fragiles. Épaissir ces parties — au moins deux largeurs de ligne.",
      types: [T.interstices],
    });
  }

  const fragile = pieds.filter((p) => p.aire > 0 && p.aire < PIED_FRAGILE_MM2);
  if (fragile.length > 0) {
    constats.push({
      genre: "pied",
      gravite: "avis",
      titre: fragile.length > 1 ? fragile.length + " pièces à faible appui" : "Faible appui sur le plateau",
      detail: "La pièce" + nom(fragile[0].rang) + " ne touche le plateau que par " + lisible(fragile[0].aire)
        + " mm². Elle risque de se décoller en cours d'impression : ajouter une bordure (Adhérence), ou la poser sur une face plus large.",
      types: [T.bordure, T.paroiExterieure],
    });
  }

  return constats.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "alerte" ? -1 : 1));
}
