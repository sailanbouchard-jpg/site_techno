/*
 * tranchage/tranchage_piece.js
 * ────────────────────────────
 * Une pièce, de son maillage posé sur le plateau à ses lignes d'impression,
 * couche par couche :
 *   1. les sections (decoupe_en_couches.js) ;
 *   2. les parois, leur couture, et ce qui reste à remplir (parois.js) ;
 *      une paroi qui dépasse de la couche d'en dessous devient « en surplomb » ;
 *   3. le classement de l'intérieur, comme dans tous les trancheurs :
 *        dessus          ce qui n'a plus de matière juste au-dessus
 *        dessous         ce qui n'a pas de matière juste en dessous : sur le
 *                        plateau, la surface du dessous ; ailleurs, un pont
 *        plein intérieur ce qui est à moins de N couches d'un dessus ou d'un dessous
 *        remplissage     le reste, rempli à la densité demandée ;
 *   4. le remplissage de chaque zone (remplissage.js), des interstices, et la bordure au pied.
 *
 * Tourne dans l'ouvrier de tranchage ; « wasm » est le module Manifold démarré.
 * Toute CrossSection créée ici est libérée ici.
 */

import { decouperEnCouches } from "./decoupe_en_couches.js";
import { paroisDeLaCouche, espacement, LIMITE_D_ONGLET, AIRE_MINIMALE_MM2 } from "./parois.js";
import { hachures, gyroide, relier, dansLaZone } from "./remplissage.js";
import { verserLesFiletsDansLesParois } from "./parois_variables.js";
import { placerLesCoutures } from "./couture.js";
import { TYPES_DE_LIGNE as T } from "./protocole_tranchage.js";

// Les couches pleines alternent leur direction d'un quart de tour.
const ANGLE_DES_COUCHES_PLEINES = 45;
// Chevauchement des couches pleines sur la dernière paroi, en part de largeur (OrcaSlicer : 25 %).
const CHEVAUCHEMENT_DES_PLEINS = 0.25;
// Une zone pleine plus étroite que ça est un reste de calcul, pas une surface à remplir.
const LARGEUR_MINIMALE_D_UNE_ZONE_MM = 0.2;
// Les paliers de surplomb : la part de la largeur d'une ligne qui est dans le vide.
// Mêmes crans que dans OrcaSlicer (25 %, 50 %, 75 %).
const PALIERS_DE_SURPLOMB = [0.25, 0.5, 0.75];
// Un morceau de paroi plus court que ça ne change pas de type : sans cette règle,
// une paroi qui longe le bord du soutien se hache en pointillé, et la buse passe son
// temps à changer de vitesse, ce qui laisse un bourrelet à chaque changement.
const LONGUEUR_MINIMALE_D_UN_MORCEAU_MM = 1.5;
// La part du temps que prennent les parois, le reste allant au classement et
// au remplissage (mesuré sur des pièces courantes : le remplissage domine).
const PART_DES_PAROIS = 0.35;
// Les directions essayées pour tendre un pont, en degrés.
const PAS_DES_DIRECTIONS_DE_PONT = 15;

const aireSignee = (contour) => {
  let a = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const [p, q] = [contour[i], contour[(i + 1) % contour.length]];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

/*
 * positions : le maillage déjà placé (repère machine) ; couches : { hauteurs, epaisseurs } ;
 * reglages : valeurs effectives ; surAvancement(part) : appelé au fil des couches,
 * part allant de 0 à 1. Les parois et le remplissage prennent chacun leur part
 * du temps : c'est ce partage qui rend la barre de progression honnête.
 * Rend { chemins: [{ couche, type, largeur, points, ferme }], sol, coutures: [[x, y, couche]],
 *         contours: le bord de chaque couche, [[[x, y], …], …] par couche }
 * où sol est le contour convexe de la première couche (pour la jupe). Les contours
 * servent aux déplacements : la buse peut passer dedans sans rétracter, et doit
 * contourner ce qui n'y est pas.
 */
export function trancherPiece(wasm, positions, indices, couches, reglages, surAvancement = () => {}) {
  const C = wasm.CrossSection;
  const n = couches.hauteurs.length;
  const milieux = couches.hauteurs.map((haut, k) => haut - couches.epaisseurs[k] / 2);
  const contours = decouperEnCouches(positions, indices, milieux);
  const aLiberer = [];
  const garder = (section) => {
    if (section !== null) aLiberer.push(section);
    return section;
  };
  // Manifold refuse une liste vide : un triangle aplati donne une section vide.
  const vide = () => garder(new C([[[0, 0], [0, 0], [0, 0]]]));

  try {
    const sections = contours.map((c, k) => (c.length === 0 ? null : compenser(wasm, c, k, reglages, garder)));
    const chemins = [];
    const coutures = [];
    const interieurs = [];
    const interstices = [];
    const clairsemes = [];   // le remplissage clairsemé de chaque couche : ce qui ne porte presque rien
    const filetsRestants = [];   // les interstices qu'aucune paroi n'a absorbés
    let couturesPrecedentes = [];

    // ── Parois ──
    for (let k = 0; k < n; k += 1) {
      surAvancement(PART_DES_PAROIS * (k / n));
      if (sections[k] === null) {
        interieurs.push(null);
        interstices.push(null);
        continue;
      }
      const premiere = k === 0;
      const largeurExterieure = premiere ? reglages.largeur_premiere_couche : reglages.largeur_paroi_exterieure;
      const parois = paroisDeLaCouche(wasm, sections[k], {
        nombre: reglages.nombre_parois,
        largeurExterieure,
        largeurInterieure: premiere ? reglages.largeur_premiere_couche : reglages.largeur_parois_interieures,
        hauteur: couches.epaisseurs[k],
        exterieureDAbord: reglages.ordre_parois === "exterieure_puis_interieures",
      });
      interieurs.push(garder(parois.interieur));
      interstices.push(garder(parois.interstices));

      // La couture : où chaque boucle commence.
      const placees = placerLesCoutures(parois.chemins, reglages.position_couture, couturesPrecedentes, k, largeurExterieure);
      couturesPrecedentes = placees.coutures;
      for (const [x, y] of placees.coutures) coutures.push([x, y, k]);

      // Une paroi qui sort de la couche d'en dessous est en surplomb.
      // Un jeu de zones de soutien, une par palier : une ligne descend d'un cran
      // chaque fois qu'elle sort de la zone suivante, plus étroite.
      const soutiens = k === 0 ? null : zonesDeSoutien(sections[k], sections[k - 1], largeurExterieure, garder);
      // « Appui maximal » : les parois intérieures d'abord, pour que l'extérieure s'y appuie.
      const exterieureDAbord = parois.exterieureDAbord && reglages.strategie_surplomb !== "appui";
      const ordre = exterieureDAbord ? placees.parRang : [...placees.parRang].reverse();
      const morceaux = ordre.flat().flatMap((chemin) => separerLesSurplombs(chemin, soutiens, reglages));

      // Les filets de vide trop étroits pour une ligne à part sont versés dans la paroi voisine.
      let lignesDeParoi = morceaux;
      if (reglages.parois_variables === "oui" && interstices[k] !== null) {
        const filets = interstices[k] === null ? [] : interstices[k].toPolygons();
        const verse = verserLesFiletsDansLesParois(morceaux, filets, espacement(largeurExterieure, couches.epaisseurs[k]));
        lignesDeParoi = verse.chemins;
        filetsRestants[k] = verse.filetsRestants;
      }
      for (const morceau of lignesDeParoi) chemins.push({ couche: k, ...morceau });
    }

    // ── Classement de l'intérieur ──
    const h = reglages.hauteur_couche;
    const nDessus = Math.max(reglages.couches_dessus, Math.ceil(reglages.epaisseur_dessus / h - 1e-6));
    const nDessous = Math.max(reglages.couches_dessous, Math.ceil(reglages.epaisseur_dessous / h - 1e-6));
    // Ce qui est couvert sur toutes les couches de j1 à j2 : leur intersection (vide si l'une manque).
    const couvert = (j1, j2) => {
      if (j1 < 0 || j2 >= n) return vide();
      const liste = [];
      for (let j = j1; j <= j2; j += 1) {
        if (sections[j] === null) return vide();
        liste.push(sections[j]);
      }
      // Une seule couche : c'est sa propre section, déjà gardée (ne pas la libérer deux fois).
      return liste.length === 1 ? liste[0] : garder(C.intersection(liste));
    };
    // Une zone trop étroite pour une ligne disparaît (ouverture morphologique).
    const nettoyer = (zone) => garder(garder(zone.offset(-LARGEUR_MINIMALE_D_UNE_ZONE_MM / 2, "Miter", LIMITE_D_ONGLET))
      .offset(LARGEUR_MINIMALE_D_UNE_ZONE_MM / 2, "Miter", LIMITE_D_ONGLET));

    for (let k = 0; k < n; k += 1) {
      surAvancement(PART_DES_PAROIS + (1 - PART_DES_PAROIS) * (k / n));
      const interieur = interieurs[k];
      const hauteur = couches.epaisseurs[k];
      const premiere = k === 0;
      let aDesSurfaces = false;

      if (interieur !== null) {
        const dessus = nettoyer(garder(interieur.subtract(k + 1 < n && sections[k + 1] !== null ? sections[k + 1] : vide())));
        const dessousBrut = garder(interieur.subtract(k > 0 && sections[k - 1] !== null ? sections[k - 1] : vide()));
        const dessous = nettoyer(garder(dessousBrut.subtract(dessus)));
        const pleinHaut = nDessus === 0 ? vide() : garder(interieur.subtract(couvert(k + 1, k + nDessus)));
        const pleinBas = nDessous === 0 ? vide() : garder(interieur.subtract(couvert(k - nDessous, k - 1)));
        const plein = garder(C.union([pleinHaut, pleinBas, dessus, dessous]));
        const pleinInterieur = nettoyer(garder(garder(plein.subtract(dessus)).subtract(dessous)));
        const clairseme = garder(interieur.subtract(plein));
        clairsemes[k] = clairseme;
        aDesSurfaces = dessus.area() > AIRE_MINIMALE_MM2 || dessous.area() > AIRE_MINIMALE_MM2;

        const angle = ANGLE_DES_COUCHES_PLEINES + (k % 2 === 1 ? 90 : 0);
        const largeurDessus = premiere ? reglages.largeur_premiere_couche : reglages.largeur_dessus;
        for (const p of remplirPlein(dessus, largeurDessus, hauteur, angle, reglages.motif_dessus, garder)) chemins.push({ couche: k, type: T.dessus, largeur: largeurDessus, ...p });
        if (reglages.repassage === "dessus" && dessus.area() > AIRE_MINIMALE_MM2) {
          // À peine de matière, des passages serrés, en travers des lignes qu'on lisse.
          const zone = garder(dessus.offset(-largeurDessus / 2, "Miter", LIMITE_D_ONGLET));
          const lignes = hachures(zone.toPolygons(), reglages.espacement_repassage, angle + 90);
          for (const points of relier(lignes, zone.toPolygons(), 3 * reglages.espacement_repassage)) {
            chemins.push({ couche: k, type: T.repassage, largeur: reglages.espacement_repassage, points, ferme: false });
          }
        }
        if (premiere) {
          const l = reglages.largeur_premiere_couche;
          for (const p of remplirPlein(dessous, l, hauteur, angle, reglages.motif_dessous, garder)) chemins.push({ couche: k, type: T.dessous, largeur: l, ...p });
        } else {
          // Au-dessus du vide : un pont, tendu dans la direction la mieux accrochée.
          const l = reglages.largeur_pont;
          for (const points of remplirPont(dessous, sections[k - 1], l, garder)) chemins.push({ couche: k, type: T.pont, largeur: l, points, ferme: false });
        }
        const lPlein = reglages.largeur_plein_interieur;
        // Ce qui repose sur le remplissage clairsemé de la couche d'en dessous est tendu
        // par-dessus : quelques appuis seulement, et de la matière à traverser.
        const surDuVide = k > 0 && clairsemes[k - 1] !== undefined && clairsemes[k - 1] !== null
          ? nettoyer(garder(pleinInterieur.intersect(clairsemes[k - 1]))) : null;
        const pontInterieur = surDuVide !== null && surDuVide.area() > AIRE_MINIMALE_MM2 ? surDuVide : null;
        const pleinPose = pontInterieur === null ? pleinInterieur : nettoyer(garder(pleinInterieur.subtract(pontInterieur)));
        for (const p of remplirPlein(pleinPose, lPlein, hauteur, angle, "rectiligne", garder)) chemins.push({ couche: k, type: T.pleinInterieur, largeur: lPlein, ...p });
        if (pontInterieur !== null) {
          // L'appui, c'est ce qui était plein dessous : le reste de la couche, hors clairsemé.
          const appui = garder(sections[k - 1].subtract(clairsemes[k - 1]));
          for (const points of remplirPont(pontInterieur, appui, lPlein, garder)) {
            chemins.push({ couche: k, type: T.pontInterieur, largeur: lPlein, points, ferme: false });
          }
        }
        const largeurClairseme = reglages.largeur_remplissage;
        for (const points of remplirClairseme(clairseme, largeurClairseme, hauteur, couches.hauteurs[k], k, reglages, garder)) {
          chemins.push({ couche: k, type: T.remplissage, largeur: largeurClairseme, points, ferme: false });
        }
      }

      // Les interstices, au choix partout ou seulement sur les couches de surface.
      const voulus = reglages.remplir_interstices === "partout"
        || (reglages.remplir_interstices === "dessus_dessous" && (aDesSurfaces || premiere || k === n - 1));
      if (interstices[k] !== null && voulus) {
        // Ce que les parois élargies ont déjà pris n'est pas rempli une seconde fois.
        const restants = filetsRestants[k];
        const zone = restants === undefined ? interstices[k]
          : (restants.length === 0 ? null : garder(new C(restants, "Positive")));
        if (zone !== null) {
          for (const ligne of remplirInterstices(zone, reglages.largeur_parois_interieures, hauteur)) chemins.push({ couche: k, type: T.interstices, ...ligne });
        }
      }
    }

    // ── Bordure, au pied de la pièce ──
    if (reglages.largeur_bordure > 0 && sections[0] !== null) {
      const largeur = reglages.largeur_premiere_couche;
      // Seulement autour des contours extérieurs : pas de bordure dans les trous.
      const exterieurs = contours[0].filter((c) => aireSignee(c) > 0);
      const pied = garder(new C(exterieurs, "Positive"));
      const pas = espacement(largeur, couches.epaisseurs[0]);
      const tours = Math.max(1, Math.round(reglages.largeur_bordure / pas));
      const boucles = [];
      for (let i = 0; i < tours; i += 1) {
        const boucle = garder(pied.offset(reglages.ecart_bordure + largeur / 2 + i * pas, "Round", LIMITE_D_ONGLET, 32));
        boucles.push(boucle.toPolygons().map((points) => ({ couche: 0, type: T.bordure, largeur, points, ferme: true })));
      }
      // Du plus loin au plus près : la dernière boucle vient se coller à la pièce.
      chemins.unshift(...boucles.reverse().flat());
    }

    const sol = sections[0] === null ? [] : garder(sections[0].hull()).toPolygons().flat();
    // Le bord utile pour circuler : la section rentrée d'une demi-largeur de paroi,
    // c'est-à-dire la ligne centrale de la paroi extérieure.
    const recul = reglages.largeur_paroi_exterieure / 2;
    const bords = sections.map((section) => (section === null ? []
      : garder(section.offset(-recul, "Miter", LIMITE_D_ONGLET)).toPolygons()));
    return { chemins, sol, coutures, contours: bords };
  } finally {
    for (const section of aLiberer) section.delete();
  }
}

/*
 * La section d'une couche, corrigée de ce que la machine ajoute ou retire :
 *   patte d'éléphant  la première couche s'écrase et déborde : on la rentre ;
 *   trous             un trou sort trop petit : on l'agrandit de la valeur demandée ;
 *   contours          rattrape une cote extérieure systématiquement fausse.
 * Les trous sont traités à part des contours extérieurs : les agrandir tous les
 * deux du même décalage reviendrait à ne rien corriger.
 */
function compenser(wasm, contours, k, reglages, garder) {
  const C = wasm.CrossSection;
  let section = garder(new C(contours, "Positive"));
  const rentree = (k === 0 ? reglages.compensation_premiere_couche : 0) - reglages.compensation_contours;
  if (Math.abs(rentree) > 1e-6) section = garder(section.offset(-rentree, "Miter", LIMITE_D_ONGLET));
  if (Math.abs(reglages.compensation_trous) > 1e-6) {
    // Les contours de trous, pris à l'endroit : la matière qu'on retire autour d'eux.
    const trous = contours.filter((c) => aireSignee(c) < 0).map((c) => [...c].reverse());
    if (trous.length > 0) {
      const zone = garder(new C(trous, "Positive"));
      section = garder(section.subtract(garder(zone.offset(reglages.compensation_trous / 2, "Miter", LIMITE_D_ONGLET))));
    }
  }
  return section;
}

/*
 * Les zones de soutien de la couche, une par palier de surplomb : la première
 * est le soutien élargi d'un quart de largeur (une ligne qui en sort a déjà le
 * quart de sa largeur dans le vide), puis le soutien nu, puis rétréci d'autant.
 * Rend null si la couche d'en dessous soutient déjà tout.
 */
function zonesDeSoutien(section, dessous, largeur, garder) {
  if (dessous === null) return [];
  const debord = garder(section.subtract(dessous));
  if (debord.area() <= AIRE_MINIMALE_MM2) return null;
  return PALIERS_DE_SURPLOMB.map((part) => {
    const marge = (part - 0.5) * largeur;
    if (Math.abs(marge) < 1e-6) return dessous.toPolygons();
    return garder(dessous.offset(marge, "Miter", LIMITE_D_ONGLET)).toPolygons();
  });
}

/*
 * Une boucle de paroi, coupée en morceaux de même palier de surplomb :
 *   0  posée sur la couche d'en dessous          paroi ordinaire
 *   1  un quart de sa largeur dans le vide       surplomb léger
 *   2  la moitié                                 surplomb moyen
 *   3  les trois quarts ou plus                  surplomb fort
 * Les morceaux trop courts rejoignent leurs voisins : sans ça, une paroi qui
 * longe le bord du soutien changerait de vitesse tous les millimètres.
 * Avec « ponts sur les débords », un morceau dont les deux bouts reposent sur
 * la couche d'en dessous devient un pont : une ligne fine, tendue d'un appui à
 * l'autre, plutôt qu'un cordon lent qui pend.
 * soutiens : null si toute la couche est soutenue.
 */
function separerLesSurplombs(chemin, soutiens, reglages) {
  if (soutiens === null) return [chemin];
  const { points } = chemin;
  const nombre = points.length;
  // Le palier d'un segment : le nombre de zones dont son milieu est sorti.
  const paliers = points.map((p, i) => {
    const q = points[(i + 1) % nombre];
    const [x, y] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let palier = 0;
    for (const zone of soutiens) {
      if (zone.length > 0 && dansLaZone(x, y, zone)) break;
      palier += 1;
    }
    return palier;
  });
  lisserLesMorceaux(paliers, points);
  if (paliers.every((v) => v === 0)) return [chemin];

  // On part d'un changement de palier, pour que chaque morceau soit d'un seul tenant.
  const depart = paliers.findIndex((v, i) => v !== paliers[(i - 1 + nombre) % nombre]);
  if (depart < 0) return [{ ...chemin, type: T.paroiEnSurplomb, palier: paliers[0] }];
  const morceaux = [];
  let courant = null;
  for (let j = 0; j < nombre; j += 1) {
    const i = (depart + j) % nombre;
    const palier = paliers[i];
    if (courant === null || courant.palier !== palier) {
      courant = {
        ...chemin, palier, ferme: false, points: [points[i]],
        type: palier === 0 ? chemin.type : T.paroiEnSurplomb,
      };
      morceaux.push(courant);
    }
    courant.points.push(points[(i + 1) % nombre]);
  }

  if (reglages.strategie_surplomb === "ponts" && morceaux.length > 1) {
    // Un débord encadré par deux morceaux posés a ses deux bouts ancrés : on le
    // tend comme un pont, ligne fine et rapide, au lieu d'un cordon lent qui pend.
    morceaux.forEach((morceau, i) => {
      if (morceau.palier < 2) return;
      const avant = morceaux[(i - 1 + morceaux.length) % morceaux.length];
      const apres = morceaux[(i + 1) % morceaux.length];
      if (avant.palier > 1 || apres.palier > 1) return;
      morceau.type = T.pont;
      morceau.largeur = reglages.largeur_pont;
    });
  }
  return morceaux;
}

/*
 * Les morceaux francs : tant qu'une suite de même palier est plus courte que
 * « LONGUEUR_MINIMALE_D_UN_MORCEAU_MM », elle prend le palier de sa voisine la
 * plus prudente. Mieux vaut ralentir un peu trop que changer de vitesse tous
 * les millimètres : chaque changement laisse un bourrelet.
 */
function lisserLesMorceaux(paliers, points) {
  const nombre = paliers.length;
  const longueur = points.map((p, i) => {
    const q = points[(i + 1) % nombre];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });

  for (let garde = 0; garde < nombre; garde += 1) {
    const depart = paliers.findIndex((v, i) => v !== paliers[(i - 1 + nombre) % nombre]);
    if (depart < 0) return;
    const suites = [];
    let courante = null;
    for (let j = 0; j < nombre; j += 1) {
      const i = (depart + j) % nombre;
      if (courante === null || paliers[i] !== courante.palier) {
        courante = { palier: paliers[i], indices: [], longueur: 0 };
        suites.push(courante);
      }
      courante.indices.push(i);
      courante.longueur += longueur[i];
    }
    if (suites.length <= 1) return;
    let pire = 0;
    for (let i = 1; i < suites.length; i += 1) {
      if (suites[i].longueur < suites[pire].longueur) pire = i;
    }
    if (suites[pire].longueur >= LONGUEUR_MINIMALE_D_UN_MORCEAU_MM) return;
    const avant = suites[(pire - 1 + suites.length) % suites.length].palier;
    const apres = suites[(pire + 1) % suites.length].palier;
    for (const i of suites[pire].indices) paliers[i] = Math.max(avant, apres);
  }
}

/* Une zone pleine : lignes parallèles, ou boucles concentriques. */
function remplirPlein(zone, largeur, hauteur, angle, motif, garder) {
  if (zone.area() <= AIRE_MINIMALE_MM2) return [];
  const pas = espacement(largeur, hauteur);
  const recul = largeur / 2 - CHEVAUCHEMENT_DES_PLEINS * largeur;
  if (motif === "concentrique") {
    const boucles = [];
    for (let d = recul; ; d += pas) {
      const boucle = garder(zone.offset(-d, "Miter", LIMITE_D_ONGLET));
      if (boucle.area() <= AIRE_MINIMALE_MM2) break;
      for (const points of boucle.toPolygons()) boucles.push({ points, ferme: true });
    }
    return boucles;
  }
  const retrecie = garder(zone.offset(-recul, "Miter", LIMITE_D_ONGLET));
  const polygones = retrecie.toPolygons();
  const lignes = hachures(polygones, pas, angle);
  // Lignes séparées : aucun raccord, donc aucun demi-tour extrudé contre la
  // paroi. Essayé comme remède aux flancs qui gonflent, et abandonné par
  // défaut : à l'impression, le bourrelet du bord disparaît mais chaque départ
  // et chaque arrêt de ligne marque le milieu de la surface. Le défaut était
  // donc dans l'avance de pression, pas dans la forme du parcours. Le motif
  // reste disponible : il redevient intéressant une fois K calibré.
  if (motif === "monotone_lignes") {
    return lignesMonotones(lignes, angle).map((points) => ({ points, ferme: false }));
  }
  // Les lignes voisines sont reliées en zigzag. Monotone comme chez Bambu et Orca :
  // chaque ligne est posée contre la précédente, sans revenir en arrière.
  const reliees = relier(lignes, polygones, motif === "monotone" ? 1.5 * pas : 3 * pas);
  return reliees.map((points) => ({ points, ferme: false }));
}

/*
 * Les lignes d'un plein rangées dans l'ordre du balayage, toutes orientées dans
 * le même sens. La buse les pose l'une après l'autre en se déplaçant entre
 * elles : plus de raccord extrudé, donc plus de bourrelet au bord.
 */
function lignesMonotones(lignes, angle) {
  const a = (angle * Math.PI) / 180;
  const leLong = [Math.cos(a), Math.sin(a)];       // le long d'une ligne
  const auTravers = [-Math.sin(a), Math.cos(a)];   // d'une ligne à la suivante
  const projeter = (p, v) => p[0] * v[0] + p[1] * v[1];
  return lignes
    .map((ligne) => (projeter(ligne[0], leLong) <= projeter(ligne.at(-1), leLong) ? ligne : ligne.slice().reverse()))
    .sort((p, q) => projeter(p[0], auTravers) - projeter(q[0], auTravers)
      || projeter(p[0], leLong) - projeter(q[0], leLong));
}

/*
 * Un pont : des lignes jointives tendues au-dessus du vide. Parmi les
 * directions essayées, celle dont le plus de lignes ont leurs deux bouts posés
 * sur la couche d'en dessous (à la longueur la plus courte, à égalité).
 */
function remplirPont(zone, dessous, largeur, garder) {
  if (zone.area() <= AIRE_MINIMALE_MM2) return [];
  const polygones = garder(zone.offset(-largeur / 4, "Miter", LIMITE_D_ONGLET)).toPolygons();
  if (polygones.length === 0) return [];
  const appuis = dessous === null ? [] : garder(dessous.offset(largeur, "Miter", LIMITE_D_ONGLET)).toPolygons();
  let meilleur = null;
  for (let angle = 0; angle < 180; angle += PAS_DES_DIRECTIONS_DE_PONT) {
    const lignes = hachures(polygones, largeur, angle);
    if (lignes.length === 0) continue;
    let accrochees = 0;
    let longueur = 0;
    for (const [a, b] of lignes) {
      if (dansLaZone(a[0], a[1], appuis) && dansLaZone(b[0], b[1], appuis)) accrochees += 1;
      longueur += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const note = accrochees / lignes.length - longueur / lignes.length / 1e4;
    if (meilleur === null || note > meilleur.note) meilleur = { note, lignes };
  }
  return meilleur === null ? [] : relier(meilleur.lignes, polygones, 1.5 * largeur);
}

/* Le remplissage clairsemé, au motif et à la densité demandés. */
function remplirClairseme(zone, largeur, hauteur, z, k, reglages, garder) {
  const densite = reglages.densite_remplissage / 100;
  if (densite <= 0 || zone.area() <= AIRE_MINIMALE_MM2) return [];
  const recul = largeur / 2 - (reglages.chevauchement_remplissage / 100) * largeur;
  const polygones = garder(zone.offset(-recul, "Miter", LIMITE_D_ONGLET)).toPolygons();
  if (polygones.length === 0) return [];
  const pas = espacement(largeur, hauteur) / densite;
  const angle = reglages.angle_remplissage;
  // Deux lignes voisines se relient si le raccord longe le bord sur moins de deux écarts.
  // Aucun motif ne repasse deux fois au même endroit dans une couche : le
  // bourrelet d'un croisement fait taper la buse à la couche suivante.
  switch (reglages.motif_remplissage) {
    case "gyroide":
      return relier(gyroide(polygones, pas, z), polygones, 2 * pas);
    default:
      return relier(hachures(polygones, pas, angle + (k % 2 === 1 ? 90 : 0)), polygones, 2 * pas);
  }
}

/*
 * Les interstices : chaque espace étroit est comblé par un zigzag en travers
 * de sa longueur, d'une ligne aussi large que l'espace (plafonnée à la largeur
 * des parois). La longueur d'un espace se lit sur ses sommets (axe principal).
 */
function remplirInterstices(zone, largeurMax, hauteur) {
  const lignes = [];
  for (const polygone of zone.toPolygons()) {
    const aire = aireSignee(polygone);
    if (aire <= AIRE_MINIMALE_MM2) continue;
    let perimetre = 0;
    for (let i = 0; i < polygone.length; i += 1) {
      const [p, q] = [polygone[i], polygone[(i + 1) % polygone.length]];
      perimetre += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    const largeur = Math.min(largeurMax, Math.max(0.2, (2 * aire) / perimetre));
    const trace = relier(hachures([polygone], espacement(largeur, hauteur), axePrincipal(polygone) + 90), [polygone], 3 * largeur);
    for (const points of trace) lignes.push({ largeur, points, ferme: false });
  }
  return lignes;
}

/* L'angle (degrés) selon lequel un contour s'étend le plus. */
function axePrincipal(polygone) {
  const n = polygone.length;
  const [mx, my] = [polygone.reduce((s, p) => s + p[0], 0) / n, polygone.reduce((s, p) => s + p[1], 0) / n];
  let [sxx, syy, sxy] = [0, 0, 0];
  for (const [x, y] of polygone) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  return (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI);
}
