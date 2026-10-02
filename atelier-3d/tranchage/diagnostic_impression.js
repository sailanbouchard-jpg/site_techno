/*
 * tranchage/diagnostic_impression.js
 * ──────────────────────────────────
 * Ce que le tranchage sait déjà dire de l'impression à venir, mis en phrases :
 * matière posée dans le vide, bords qui vont s'enrouler, parties qui débordent
 * trop d'une couche à l'autre, parois plus fines qu'une ligne, pied trop petit
 * pour tenir au plateau, pièce élancée, maillage troué, couches qu'il faut
 * ralentir pour qu'elles refroidissent.
 *
 * La mesure qui compte pour un surplomb est le DÉBORD : de combien une couche
 * dépasse, à l'horizontale, de ce qui la porte en dessous. Un cône qui s'ouvre
 * de 20° déborde de 0,07 mm par couche — il s'imprime très bien ; un rebord qui
 * s'avance de 5 mm dans le vide, non. Compter les lignes marquées « pont » ou
 * « surplomb » ne ferait pas la différence : il y en a partout dès qu'une face
 * est inclinée.
 *
 * Mais le débord d'une seule couche ne dit pas tout : un flanc qui ne déborde
 * que d'un dixième de millimètre à chaque couche ne déclenche aucun seuil, et se
 * retrousse quand même au bout de dix couches. C'est l'ENROULEMENT, que le
 * trancheur accumule de couche en couche (tranchage/enroulement.js) et que
 * chaque chemin rapporte ici.
 *
 * Tout se lit dans le résultat du tranchage (les contours de chaque couche, les
 * chemins et leurs champs) : aucun calcul de géométrie en plus.
 *
 * Chaque constat : { genre, gravite: "alerte" | "avis", titre, detail, types }
 * — types : les types de ligne à montrer dans l'aperçu pour voir le problème.
 */

import { TYPES_DE_LIGNE as T, CHAMPS_PAR_CHEMIN, ENROULEMENT_CRITIQUE } from "./protocole_tranchage.js";

// En deçà, le débord d'une couche sur l'autre s'imprime sans rien faire.
const DEBORD_NEGLIGEABLE_MM = 1.5;
// Au-delà, la matière pend franchement dans le vide.
const DEBORD_GRAVE_MM = 4;
// Des interstices sur cette longueur : la pièce a des parois plus fines qu'une ligne.
const INTERSTICES_NOTABLES_MM = 50;
// Un enroulement sur cette longueur mérite d'être signalé : en deçà, c'est un coin.
const ENROULEMENT_NOTABLE_MM = 15;
// Une pièce qui ne touche le plateau que par cette surface risque de se décoller.
const PIED_FRAGILE_MM2 = 120;
// Au-delà de ce rapport hauteur / plus petit côté au sol, la pièce est élancée.
const ELANCEMENT_NOTABLE = 8;
// Un îlot plus petit que ça est un reste de découpe, pas de la matière en l'air.
const ILOT_NEGLIGEABLE_MM2 = 2;
// Un ralentissement de refroidissement plus fort que ça pèse sur la durée.
const RALENTISSEMENT_NOTABLE = 3;
// Assez de points par couche pour mesurer juste, sans parcourir des maillages entiers.
const POINTS_PAR_COUCHE = 120;

const lisible = (x, decimales = 0) => x.toLocaleString("fr-FR", { maximumFractionDigits: decimales });

/*
 * Pour chaque type de ligne, sa longueur en millimètres ; et la longueur des
 * lignes dont le bord s'enroule, avec la couche la plus haute concernée.
 */
function mesurerLesChemins(piece) {
  const longueurs = new Map();
  const { chemins, points } = piece;
  let enroulee = 0;
  let coucheEnroulee = -1;
  for (let c = 0; c < chemins.length; c += CHAMPS_PAR_CHEMIN) {
    const [couche, type, premier, nombre] = [chemins[c], chemins[c + 1], chemins[c + 2], chemins[c + 3]];
    const ferme = chemins[c + 5] === 1;
    let longueur = 0;
    for (let i = 1; i < nombre + (ferme ? 1 : 0); i += 1) {
      const a = (premier + i - 1) * 2;
      const b = (premier + (i % nombre)) * 2;
      longueur += Math.hypot(points[b] - points[a], points[b + 1] - points[a + 1]);
    }
    longueurs.set(type, (longueurs.get(type) ?? 0) + longueur);
    if (chemins[c + 8] / 1000 >= ENROULEMENT_CRITIQUE) {
      enroulee += longueur;
      if (couche > coucheEnroulee) coucheEnroulee = couche;
    }
  }
  return { longueurs, enroulee, coucheEnroulee };
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

/*
 * Les couches vides prises entre deux couches pleines. Une pièce ne peut pas
 * avoir de trou dans sa hauteur : si une couche n'a rien, c'est qu'un détail est
 * plus mince que la hauteur de couche et que le plan de coupe est passé à côté,
 * ou que la pièce est faite de morceaux séparés. Dans les deux cas, ce qui est
 * au-dessus sera imprimé dans le vide.
 */
function couchesVides(contours) {
  const vides = [];
  let derniere = -1;
  for (let k = contours.length - 1; k >= 0; k -= 1) {
    if ((contours[k] ?? []).length > 0) {
      derniere = k;
      break;
    }
  }
  let vuePleine = false;
  for (let k = 0; k <= derniere; k += 1) {
    if ((contours[k] ?? []).length > 0) vuePleine = true;
    else if (vuePleine) vides.push(k);
  }
  return vides;
}

/* L'aire posée sur le plateau : les contours de la première couche. */
function airePosee(contours) {
  return (contours[0] ?? []).reduce((somme, contour) => somme + aireDuContour(contour), 0);
}

/* Le plus petit côté de l'empreinte au sol, et le nombre de couches de la pièce. */
function elancement(contours, hauteurs) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const contour of contours[0] ?? []) {
    for (const [x, y] of contour) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) return null;
  let haute = 0;
  for (let k = 0; k < contours.length; k += 1) if ((contours[k] ?? []).length > 0) haute = k;
  const hauteur = hauteurs[haute] ?? 0;
  const cote = Math.min(x1 - x0, y1 - y0);
  return cote > 1e-6 ? { rapport: hauteur / cote, hauteur, cote } : null;
}

/*
 * etat : ce que rend tranchage.etat() — { pieces, couches, reglages, facteurs }.
 * nommer(rang) : le nom de la pièce, pour écrire de quoi on parle.
 * Rend la liste des constats, les plus graves d'abord.
 */
export function diagnostiquer(etat, nommer = () => "") {
  const constats = [];
  const hauteurs = etat.couches?.hauteurs ?? [];
  const pieces = (etat.pieces ?? []).filter((piece) => !piece.jupe);
  if (pieces.length === 0) return constats;

  let interstices = 0;
  let ouverts = 0;
  let debord = { valeur: 0, couche: 0, rang: 0 };
  let enroulement = { longueur: 0, couche: -1, rang: 0 };
  const enLAir = [];
  const pieds = [];
  const elances = [];
  const vides = [];

  pieces.forEach((piece, rang) => {
    const mesures = mesurerLesChemins(piece);
    interstices += mesures.longueurs.get(T.interstices) ?? 0;
    ouverts += piece.contoursOuverts ?? 0;
    if (mesures.enroulee > enroulement.longueur) {
      enroulement = { longueur: mesures.enroulee, couche: mesures.coucheEnroulee, rang };
    }
    const contours = piece.contours ?? [];
    const porte = porteAFaux(contours);
    if (porte.debord.valeur > debord.valeur) debord = { ...porte.debord, rang };
    for (const ilot of porte.ilots) enLAir.push({ ...ilot, rang });
    pieds.push({ rang, aire: airePosee(contours) });
    for (const k of couchesVides(contours)) vides.push({ couche: k, rang });
    const forme = elancement(contours, hauteurs);
    if (forme !== null && forme.rapport > ELANCEMENT_NOTABLE) elances.push({ ...forme, rang });
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
        + ". Elle sera déposée dans le vide et tombera. Le trancheur ne sait pas poser de supports :"
        + " retourner la pièce, la couper en deux morceaux à coller, ou ajouter de la matière jusqu'au plateau.",
      types: [T.dessous, T.pont],
    });
  }

  if (vides.length > 0) {
    constats.push({
      genre: "couches_vides",
      gravite: "alerte",
      titre: vides.length > 1 ? vides.length + " couches vides dans la pièce" : "Une couche vide dans la pièce",
      detail: "À " + hauteurDe(vides[0].couche) + " mm" + nom(vides[0].rang) + ", la couche ne contient rien,"
        + " alors que la pièce continue au-dessus. Soit un détail y est plus mince que la hauteur de couche et le"
        + " plan de coupe est passé à côté, soit la pièce est faite de morceaux séparés : ce qui est au-dessus"
        + " sera posé dans le vide. Épaissir ce détail — au moins une hauteur de couche et demie — ou relier les morceaux.",
      types: [T.paroiExterieure, T.dessous],
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
          ? "Autant de matière ne tient pas toute seule : poser la pièce autrement, ou revoir la forme."
          : "Cela s'imprime, mais la surface du dessous sera irrégulière. Un chanfrein ou un angle des côtés arrangerait la chose."),
      types: [T.pont, T.paroiEnSurplomb, T.dessous],
    });
  }

  if (enroulement.longueur > ENROULEMENT_NOTABLE_MM) {
    constats.push({
      genre: "enroulement",
      gravite: "avis",
      titre: "Bord qui va s'enrouler",
      detail: "Sur " + lisible(enroulement.longueur / 10, 1) + " cm" + nom(enroulement.rang)
        + ", jusqu'à " + hauteurDe(enroulement.couche) + " mm, le bord déborde de plus de la moitié d'une ligne"
        + " à chaque couche, et plusieurs couches de suite : il se retrousse vers le haut, et la buse finit par taper dedans."
        + " Le trancheur y ralentit et ventile à fond, et n'y passe plus en déplacement — mais le vrai remède est dans la forme :"
        + " chanfreiner ce bord, ou poser la pièce autrement.",
      types: [T.paroiEnSurplomb, T.paroiExterieure],
    });
  }

  if (interstices > INTERSTICES_NOTABLES_MM) {
    constats.push({
      genre: "finesse",
      gravite: "avis",
      titre: "Parois plus fines qu'une ligne",
      detail: "Sur " + lisible(interstices / 10, 1) + " cm, la pièce est trop étroite pour une paroi entière :"
        + " le trancheur y pose un cordon unique, posé au milieu et de l'épaisseur de la matière."
        + " Cela s'imprime, mais une paroi d'une seule ligne reste fragile. Épaissir ces parties — au moins deux largeurs de ligne.",
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

  if (elances.length > 0) {
    const pire = elances.reduce((m, p) => (p.rapport > m.rapport ? p : m));
    constats.push({
      genre: "elancement",
      gravite: "avis",
      titre: "Pièce élancée",
      detail: "La pièce" + nom(pire.rang) + " fait " + lisible(pire.hauteur) + " mm de haut pour "
        + lisible(pire.cote, 1) + " mm de large. La buse la fait vibrer à chaque passage, et peut finir par la coucher :"
        + " une bordure, et des vitesses en retrait, valent mieux ici.",
      types: [T.bordure, T.paroiExterieure],
    });
  }

  const facteurs = etat.facteurs ?? [];
  let pireFacteur = 1;
  let coucheLente = 0;
  let lentes = 0;
  for (let k = 0; k < facteurs.length; k += 1) {
    if (facteurs[k] > RALENTISSEMENT_NOTABLE) lentes += 1;
    if (facteurs[k] > pireFacteur) {
      pireFacteur = facteurs[k];
      coucheLente = k;
    }
  }
  if (lentes > 0) {
    constats.push({
      genre: "refroidissement",
      gravite: "avis",
      titre: lentes + (lentes > 1 ? " couches ralenties" : " couche ralentie") + " pour refroidir",
      detail: "À cette hauteur la pièce est si fine qu'une couche serait posée en moins que le temps de couche minimal :"
        + " l'imprimante ralentit jusqu'à " + lisible(pireFacteur, 1) + " fois, vers " + hauteurDe(coucheLente) + " mm."
        + " C'est normal et voulu, mais c'est aussi ce qui fait l'essentiel de la durée. Le ralentissement s'arrête à la"
        + " vitesse minimale de refroidissement (Matière) : au-delà, la matière n'a plus le temps de figer même ralentie.",
      types: [T.paroiExterieure],
    });
  }

  if (ouverts > 0) {
    constats.push({
      genre: "maillage",
      gravite: "alerte",
      titre: "Maillage troué",
      detail: ouverts + (ouverts > 1 ? " contours de coupe n'ont pas pu être refermés" : " contour de coupe n'a pas pu être refermé")
        + " : le modèle a des trous ou des faces en trop. Ces contours ne délimitent rien et ont été abandonnés,"
        + " donc il manquera de la matière à ces endroits. Un modèle importé en est la cause la plus fréquente :"
        + " le réparer, ou le refaire dans l'atelier.",
      types: [T.paroiExterieure],
    });
  }

  return constats.sort((a, b) => (a.gravite === b.gravite ? 0 : a.gravite === "alerte" ? -1 : 1));
}
