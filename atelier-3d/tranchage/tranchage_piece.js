/*
 * tranchage/tranchage_piece.js
 * ────────────────────────────
 * Une pièce, de son maillage posé sur le plateau à ses lignes d'impression.
 *
 * UNE SEULE passe montante, couche par couche — c'est ce qui permet à une
 * couche de savoir sur quoi elle s'appuie vraiment (tranchage/appuis.js) et de
 * transmettre à la suivante ce qu'elle a de stable :
 *
 *   1. les appuis       ce que la couche d'en dessous porte, en bandes de part
 *                       dans le vide (0, ¼, ½, ¾ … 1 de la largeur d'une ligne) ;
 *   2. les parois        la section rétrécie pas à pas (parois.js), leur couture,
 *                       et ce qui reste à remplir ; chaque morceau de paroi
 *                       reçoit sa part dans le vide et sa note d'enroulement ;
 *   3. le classement de l'intérieur, comme dans tous les trancheurs :
 *        dessous         ce qui n'a pas de matière juste en dessous : sur le
 *                        plateau, la surface du dessous ; ailleurs, un vide à
 *                        franchir, découpé en PORTÉES — chacune reçoit sa propre
 *                        direction de pont et son ancrage dans cette direction
 *        dessus          ce qui n'a plus de matière juste au-dessus, moins les
 *                        portées : au-dessus du vide, la tenue prime sur l'aspect
 *        plein intérieur ce qui est à moins de N couches d'un dessus ou d'un
 *                        dessous, élargi latéralement pour que la coque d'un
 *                        flanc incliné garde son épaisseur
 *        remplissage     le reste, rempli à la densité demandée ;
 *   4. le remplissage de chaque zone (remplissage.js), puis les interstices
 *      réduits à leur axe médian (axe_median.js) ;
 *   5. les chemins de la couche rangés ÎLE PAR ÎLE : on termine une région avant
 *      de passer à la suivante, au lieu d'alterner entre elles à chaque rang ;
 *   6. ce que la couche laisse de stable, pour la couche suivante.
 * Puis la bordure au pied de la pièce, complète ou en oreilles.
 *
 * Tourne dans l'ouvrier de tranchage ; « wasm » est le module Manifold démarré.
 * Toute CrossSection créée ici est libérée ici.
 */

import { decouperEnCouches } from "./decoupe_en_couches.js";
import { paroisDeLaCouche, rangsDansLOrdre, espacement, LIMITE_D_ONGLET, AIRE_MINIMALE_MM2 } from "./parois.js";
import { hachures, gyroide, relier, dansLaZone } from "./remplissage.js";
import { verserLesFiletsDansLesParois } from "./parois_variables.js";
import { placerLesCoutures } from "./couture.js";
import { cordonsDuFilet } from "./axe_median.js";
import { appuisDeLaCouche, cransDeSurplomb, partDansLeVide, matiereStable } from "./appuis.js";
import { vitesseDeSurplomb } from "./estimations.js";
import { nouvelEnroulement } from "./enroulement.js";
import { TYPES_DE_LIGNE as T, ENROULEMENT_CRITIQUE } from "./protocole_tranchage.js";

// Les couches pleines alternent leur direction d'un quart de tour.
const ANGLE_DES_COUCHES_PLEINES = 45;
// Une zone pleine plus étroite que ça est un reste de calcul, pas une surface à remplir.
const LARGEUR_MINIMALE_D_UNE_ZONE_MM = 0.2;
// Une zone pleine dont l'épaisseur moyenne descend sous ce nombre de largeurs de
// ligne est hachurée en moignons dont la plupart sont jetés : elle passe en
// concentrique, qui épouse sa forme (OrcaSlicer : detect_narrow_internal_solid_infill).
const LARGEURS_D_UNE_ZONE_ETROITE = 2;
/*
 * Avant de classer une paroi, on redécoupe son tracé en segments d'au plus ce
 * pas. Sans cela, la part dans le vide d'une arête DROITE de 30 mm serait lue
 * une seule fois, en son milieu : l'arête entière passerait en surplomb (ou n'y
 * passerait pas), selon ce qui se trouve sous son seul point du milieu. Une
 * pièce à faces planes — la plupart des pièces de techno — était donc classée
 * presque au hasard. Le pas est bien plus court que la longueur minimale d'un
 * morceau ci-dessous, qui reste la vraie résolution du classement.
 */
const PAS_DE_CLASSEMENT_MM = 0.5;
// Un morceau de paroi plus court que ça ne change pas de type : sans cette règle,
// une paroi qui longe le bord du soutien se hache en pointillé, et la buse passe son
// temps à changer de vitesse, ce qui laisse un bourrelet à chaque changement.
// Ce n'est qu'un PLANCHER : la vraie longueur minimale se calcule, voir
// longueurUtileDUnMorceau — un morceau plus court que sa propre transition de
// vitesse ne sert à rien, puisque la vitesse demandée n'y est jamais atteinte.
const LONGUEUR_MINIMALE_D_UN_MORCEAU_MM = PAS_DE_CLASSEMENT_MM * 2;
// Les directions essayées pour tendre un pont, en degrés. Cinq, comme PrusaSlicer :
// chaque portée est jugée séparément, il n'y a plus de raison d'être grossier.
const PAS_DES_DIRECTIONS_DE_PONT = 5;

const aireSignee = (contour) => {
  let a = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const [p, q] = [contour[i], contour[(i + 1) % contour.length]];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

const longueurDuTour = (contour) => contour.reduce(
  (s, p, i) => s + Math.hypot(p[0] - contour[(i + 1) % contour.length][0], p[1] - contour[(i + 1) % contour.length][1]), 0,
);

/* L'épaisseur moyenne d'une zone : 2 × aire ÷ périmètre. Dit si elle est étroite. */
function epaisseurMoyenne(polygones) {
  let aire = 0;
  let tour = 0;
  for (const polygone of polygones) {
    aire += aireSignee(polygone);
    tour += longueurDuTour(polygone);
  }
  return tour > 1e-9 ? (2 * Math.abs(aire)) / tour : 0;
}

/*
 * positions : le maillage déjà placé (repère machine) ; couches : { hauteurs, epaisseurs } ;
 * reglages : valeurs effectives ; surAvancement(part) : appelé au fil des couches,
 * part allant de 0 à 1 — une seule passe, donc une barre de progression linéaire.
 * Rend { chemins: [{ couche, type, largeur, points, ferme, surplomb, enroulement }],
 *         sol, coutures: [[x, y, couche]], contours: le bord utile de chaque couche,
 *         contoursOuverts: le nombre de contours que le maillage n'a pas permis de fermer }
 * où sol est le contour convexe de la première couche (pour la jupe). Les contours
 * servent aux déplacements : la buse peut passer dedans sans rétracter, et doit
 * contourner ce qui n'y est pas.
 */
export function trancherPiece(wasm, positions, indices, couches, reglages, surAvancement = () => {}) {
  const C = wasm.CrossSection;
  const n = couches.hauteurs.length;
  const milieux = couches.hauteurs.map((haut, k) => haut - couches.epaisseurs[k] / 2);
  const coupe = decouperEnCouches(positions, indices, milieux);
  const contours = coupe.couches;
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
    const bords = [];
    // Ce que chaque couche laisse de stable à la couche du dessus, et ce qu'elle
    // remplit de clairsemé (le pont intérieur de la couche suivante s'y appuie).
    const porteurs = [];
    const clairsemes = [];
    const enroulement = nouvelEnroulement(reglages.largeur_paroi_exterieure);
    const crans = cransDeSurplomb(reglages.strategie_surplomb);
    let couturesPrecedentes = [];
    let finDeLaCouche = [0, 0];

    // ── Préparations communes à toutes les couches ──
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
    // Ce qui, dans une zone, est plus large que « largeur » (ouverture morphologique).
    const ceQuiEstLarge = (zone, largeur) => garder(garder(zone.offset(-largeur / 2, "Miter", LIMITE_D_ONGLET))
      .offset(largeur / 2, "Miter", LIMITE_D_ONGLET));
    // Une zone trop étroite pour une ligne disparaît.
    const nettoyer = (zone) => ceQuiEstLarge(zone, LARGEUR_MINIMALE_D_UNE_ZONE_MM);
    // Une coque élargie latéralement : sur un flanc incliné, les N couches pleines
    // comptées à la verticale ne font qu'une peau très mince mesurée en travers.
    const elargirLaCoque = (zone, interieur) => {
      const marge = reglages.elargissement_coques;
      if (!(marge > 0) || zone.area() <= AIRE_MINIMALE_MM2) return zone;
      return garder(garder(zone.offset(marge, "Miter", LIMITE_D_ONGLET)).intersect(interieur));
    };

    for (let k = 0; k < n; k += 1) {
      surAvancement(k / n);
      if (sections[k] === null) {
        porteurs[k] = null;
        clairsemes[k] = null;
        bords[k] = [];
        enroulement.coucheSuivante();
        continue;
      }
      const section = sections[k];
      const hauteur = couches.epaisseurs[k];
      const premiere = k === 0;
      const largeurExterieure = premiere ? reglages.largeur_premiere_couche : reglages.largeur_paroi_exterieure;
      const cheminsDeLaCouche = [];
      const instables = [];

      // ── 1. Les appuis ──
      const appuis = appuisDeLaCouche(section, porteurs[k - 1] ?? null, largeurExterieure, crans, garder);

      // ── 2. Les parois ──
      // La surface du dessus, telle que les sections la donnent — connue AVANT les
      // parois, ce qui permet de n'en garder qu'une seule là où elle se verra.
      const dessusProche = reglages.une_paroi_sur_dessus === "oui" && reglages.nombre_parois > 1
        ? nettoyer(garder(section.subtract(k + 1 < n && sections[k + 1] !== null ? sections[k + 1] : vide())))
        : null;
      const parois = paroisDeLaCouche(wasm, section, {
        nombre: reglages.nombre_parois,
        largeurExterieure,
        largeurInterieure: premiere ? reglages.largeur_premiere_couche : reglages.largeur_parois_interieures,
        hauteur,
        zoneUneParoi: dessusProche !== null && dessusProche.area() > AIRE_MINIMALE_MM2 ? dessusProche : null,
      });
      const interieur = garder(parois.interieur);
      const interstices = garder(parois.interstices);

      // La couture : où chaque boucle commence.
      const placees = placerLesCoutures(parois.parRang, reglages.position_couture, couturesPrecedentes, k, largeurExterieure);
      couturesPrecedentes = placees.coutures;
      for (const [x, y] of placees.coutures) coutures.push([x, y, k]);

      // L'ordre des parois. Sur les seules couches qui débordent, les parois
      // intérieures peuvent passer d'abord pour que l'extérieure s'y appuie : les
      // autres couches gardent l'ordre choisi, donc la précision de cote.
      const ordre = reglages.parois_surplomb_dabord === "oui" && appuis.aUnSurplomb
        ? "interieures_puis_exterieure" : reglages.ordre_parois;
      const morceaux = rangsDansLOrdre(placees.parRang, ordre)
        .flatMap((rang) => placees.parRang[rang])
        .flatMap((chemin) => separerLesSurplombs(chemin, appuis, enroulement, reglages));

      // Les filets de vide trop étroits pour une ligne à part sont versés dans la paroi voisine.
      let lignesDeParoi = morceaux;
      let filetsRestants = null;
      if (reglages.parois_variables === "oui" && interstices !== null) {
        const verse = verserLesFiletsDansLesParois(morceaux, interstices.toPolygons(),
          espacement(largeurExterieure, hauteur));
        lignesDeParoi = verse.chemins;
        filetsRestants = verse.filetsRestants;
      }
      for (const morceau of lignesDeParoi) cheminsDeLaCouche.push({ couche: k, ...morceau });

      // ── 3. Le classement de l'intérieur ──
      let aDesSurfaces = false;
      if (interieur !== null) {
        const porteur = porteurs[k - 1] ?? null;
        const dessousBrut = garder(interieur.subtract(porteur === null ? vide() : porteur));
        // Les portées : chaque morceau de vide est jugé pour lui-même, avec sa
        // propre direction de pont et son ancrage dans cette direction.
        const portees = premiere ? [] : decouperEnPortees(wasm, nettoyer(dessousBrut), porteur, interieur, reglages, garder);
        const vides = portees.map((p) => p.zone);
        const pont = vides.length === 0 ? vide() : garder(C.union(vides));
        for (const portee of portees) if (portee.ancree <= 0) instables.push(portee.zone);
        // Au-dessus du vide, le pont l'emporte sur la surface du dessus. Une
        // plaque d'une seule couche est les deux à la fois ; la remplir comme
        // un dessus la hache en diagonales que rien ne tient, alors qu'un pont
        // la traverse de part en part. C'est la tenue qui prime sur l'aspect.
        const dessus = nettoyer(garder(garder(interieur.subtract(k + 1 < n && sections[k + 1] !== null ? sections[k + 1] : vide()))
          .subtract(pont)));
        const dessous = premiere ? nettoyer(garder(dessousBrut.subtract(dessus))) : pont;
        const pleinHaut = nDessus === 0 ? vide() : elargirLaCoque(garder(interieur.subtract(couvert(k + 1, k + nDessus))), interieur);
        const pleinBas = nDessous === 0 ? vide() : elargirLaCoque(garder(interieur.subtract(couvert(k - nDessous, k - 1))), interieur);
        const plein = garder(C.union([pleinHaut, pleinBas, dessus, dessous]));
        const pleinInterieur = nettoyer(garder(garder(plein.subtract(dessus)).subtract(dessous)));
        const clairseme = garder(interieur.subtract(plein));
        clairsemes[k] = clairseme;
        aDesSurfaces = dessus.area() > AIRE_MINIMALE_MM2 || dessous.area() > AIRE_MINIMALE_MM2;

        // ── 4. Le remplissage ──
        const angle = ANGLE_DES_COUCHES_PLEINES + (k % 2 === 1 ? 90 : 0);
        const largeurDessus = premiere ? reglages.largeur_premiere_couche : reglages.largeur_dessus;
        for (const p of remplirPlein(dessus, largeurDessus, hauteur, angle, reglages.motif_dessus, reglages, garder)) {
          cheminsDeLaCouche.push({ couche: k, type: T.dessus, largeur: largeurDessus, ...p });
        }
        if (reglages.repassage === "dessus" && dessus.area() > AIRE_MINIMALE_MM2) {
          // À peine de matière, des passages serrés, en travers des lignes qu'on lisse.
          const zone = garder(dessus.offset(-largeurDessus / 2, "Miter", LIMITE_D_ONGLET));
          const lignes = hachures(zone.toPolygons(), reglages.espacement_repassage, angle + 90);
          for (const points of relier(lignes, zone.toPolygons(), 3 * reglages.espacement_repassage)) {
            cheminsDeLaCouche.push({ couche: k, type: T.repassage, largeur: reglages.espacement_repassage, points, ferme: false });
          }
        }
        if (premiere) {
          const l = reglages.largeur_premiere_couche;
          for (const p of remplirPlein(dessous, l, hauteur, angle, reglages.motif_dessous, reglages, garder)) {
            cheminsDeLaCouche.push({ couche: k, type: T.dessous, largeur: l, ...p });
          }
        } else {
          // Au-dessus du vide : un pont par portée, tendu dans sa propre direction.
          const l = reglages.largeur_pont;
          for (const portee of portees) {
            for (const points of tendreLaPortee(portee, l)) {
              cheminsDeLaCouche.push({ couche: k, type: T.pont, largeur: l, points, ferme: false, surplomb: 1 });
            }
          }
        }
        const lPlein = reglages.largeur_plein_interieur;
        // Ce qui repose sur le remplissage clairsemé de la couche d'en dessous est tendu
        // par-dessus : quelques appuis seulement, et de la matière à traverser.
        const surDuVide = k > 0 && clairsemes[k - 1] !== undefined && clairsemes[k - 1] !== null
          ? nettoyer(garder(pleinInterieur.intersect(clairsemes[k - 1]))) : null;
        const pontInterieur = surDuVide !== null && surDuVide.area() > AIRE_MINIMALE_MM2 ? surDuVide : null;
        const pleinPose = pontInterieur === null ? pleinInterieur : nettoyer(garder(pleinInterieur.subtract(pontInterieur)));
        for (const p of remplirPlein(pleinPose, lPlein, hauteur, angle, "rectiligne", reglages, garder)) {
          cheminsDeLaCouche.push({ couche: k, type: T.pleinInterieur, largeur: lPlein, ...p });
        }
        if (pontInterieur !== null) {
          // L'appui, c'est ce qui était plein dessous : le reste de la couche, hors clairsemé.
          const appui = garder(sections[k - 1].subtract(clairsemes[k - 1]));
          for (const portee of decouperEnPortees(wasm, pontInterieur, appui, interieur, reglages, garder)) {
            for (const points of tendreLaPortee(portee, lPlein)) {
              cheminsDeLaCouche.push({ couche: k, type: T.pontInterieur, largeur: lPlein, points, ferme: false });
            }
          }
        }
        // Juste sous les couches pleines d'un dessus, le remplissage double de
        // densite : sans cela les lignes pleines franchissent de grands ecarts
        // entre deux lignes de remplissage et s'affaissent. Le pas est divise en
        // deux, donc une ligne sur deux retombe sur celle de la couche d'en
        // dessous : la zone dense s'empile avec la zone normale.
        const largeurClairseme = reglages.largeur_remplissage;
        const densification = reglages.couches_densification;
        const proche = densification > 0 && nDessus > 0
          ? nettoyer(garder(garder(interieur.subtract(couvert(k + 1, k + nDessus + densification))).intersect(clairseme)))
          : null;
        const dense = proche !== null && proche.area() > AIRE_MINIMALE_MM2 ? proche : null;
        const normal = dense === null ? clairseme : garder(clairseme.subtract(dense));
        const poser = (zone, densite) => {
          for (const points of remplirClairseme(zone, largeurClairseme, hauteur, couches.hauteurs[k], k, reglages, densite, garder)) {
            cheminsDeLaCouche.push({ couche: k, type: T.remplissage, largeur: largeurClairseme, points, ferme: false });
          }
        };
        poser(normal, reglages.densite_remplissage);
        // Jamais au-dela de 60 % : plus dense, le remplissage devient du plein
        // et le trancheur a deja un type de ligne pour ca.
        if (dense !== null) poser(dense, Math.min(60, reglages.densite_remplissage * 2));
      } else {
        clairsemes[k] = null;
      }

      // Les interstices, au choix partout ou seulement sur les couches de surface.
      const voulus = reglages.remplir_interstices === "partout"
        || (reglages.remplir_interstices === "dessus_dessous" && (aDesSurfaces || premiere || k === n - 1));
      if (interstices !== null && voulus) {
        // Ce que les parois élargies ont déjà pris n'est pas rempli une seconde fois.
        const zone = filetsRestants === null ? interstices
          : (filetsRestants.length === 0 ? null : garder(new C(filetsRestants, "Positive")));
        if (zone !== null) {
          const largeurMax = premiere ? reglages.largeur_premiere_couche : reglages.largeur_parois_interieures;
          for (const ligne of remplirInterstices(zone, largeurMax, hauteur, garder)) {
            cheminsDeLaCouche.push({ couche: k, type: T.interstices, ...ligne });
          }
        }
      }

      // ── 5. Île par île ──
      finDeLaCouche = rangerParIlot(cheminsDeLaCouche, section, finDeLaCouche, garder);
      chemins.push(...cheminsDeLaCouche);

      // ── 6. Ce que la couche laisse de stable, et par où la buse pourra circuler ──
      porteurs[k] = matiereStable(wasm, section, instables, garder);
      // Le bord utile pour circuler : la section rentrée d'une demi-largeur de paroi,
      // c'est-à-dire la ligne centrale de la paroi extérieure. Un bord qui s'enroule
      // en est retiré : la buse ne doit pas passer au-dessus de ce qui s'est retroussé.
      const recul = reglages.largeur_paroi_exterieure / 2;
      let libre = garder(section.offset(-recul, "Miter", LIMITE_D_ONGLET));
      const enroule = cheminsDeLaCouche.some((c) => (c.enroulement ?? 0) >= ENROULEMENT_CRITIQUE);
      if (enroule && appuis.debord !== null) libre = garder(libre.subtract(appuis.debord));
      bords[k] = libre.toPolygons();
      enroulement.coucheSuivante();
    }

    // ── Bordure, au pied de la pièce ──
    if (reglages.largeur_bordure > 0 && sections[0] !== null) {
      chemins.unshift(...tracerLaBordure(wasm, contours[0], couches.epaisseurs[0], reglages, garder));
    }

    const sol = sections[0] === null ? [] : garder(sections[0].hull()).toPolygons().flat();
    return { chemins, sol, coutures, contours: bords, contoursOuverts: coupe.ouverts };
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
 * Une boucle de paroi, coupée en morceaux de même part dans le vide. Chaque
 * morceau porte :
 *   surplomb      la part de sa largeur qui est dans le vide, de 0 à 1
 *   enroulement   sa note d'enroulement (enroulement.js), cumulée depuis le bas
 *   type          paroiEnSurplomb dès que la part n'est plus nulle
 * Les morceaux trop courts rejoignent leurs voisins : sans ça, une paroi qui
 * longe le bord du soutien changerait de vitesse tous les millimètres.
 * Avec « tendre les débords ancrés », un morceau dont les deux bouts reposent sur
 * la couche d'en dessous et qui n'est pas trop long devient un pont : une ligne
 * fine, tendue d'un appui à l'autre, plutôt qu'un cordon lent qui pend.
 */
function separerLesSurplombs(chemin, appuis, enroulement, reglages) {
  if (appuis.bandes === null) return [chemin];
  const { ferme } = chemin;
  const points = subdiviser(chemin.points, ferme, PAS_DE_CLASSEMENT_MM);
  const nombre = points.length;
  const segments = ferme ? nombre : nombre - 1;
  if (segments < 1) return [chemin];
  const suivant = (i) => points[(i + 1) % nombre];
  const exterieure = chemin.type === T.paroiExterieure;

  // La part dans le vide de chaque segment, lue au milieu du segment.
  const parts = new Array(segments);
  for (let i = 0; i < segments; i += 1) {
    const [p, q] = [points[i], suivant(i)];
    parts[i] = partDansLeVide((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, appuis);
  }
  // La note d'enroulement, portée par le bord visible : c'est lui qui se retrousse.
  // Elle est lue sur les parts BRUTES, avant tout lissage : le lissage sert à
  // éviter les changements de vitesse, et il ramène un court passage à la part de
  // ses voisins — ce qui effacerait justement l'accumulation qu'on cherche.
  const notes = new Array(segments).fill(0);
  if (reglages.detection_enroulement === "oui" && exterieure) {
    for (let i = 0; i < segments; i += 1) {
      const [p, q] = [points[i], suivant(i)];
      notes[i] = enroulement.noter((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, parts[i]);
    }
  }

  // Vaut pour toutes les stratégies : la longueur utile se calcule par
  // transition, donc la gradation fine du mode progressif n'est pas écrasée.
  lisserLesMorceaux(parts, points, segments, suivant, reglages);

  if (parts.every((v) => v === 0) && notes.every((v) => v === 0)) return [chemin];

  // On part d'un changement, pour que chaque morceau soit d'un seul tenant.
  const memeMorceau = (a, b) => parts[a] === parts[b]
    && (notes[a] >= ENROULEMENT_CRITIQUE) === (notes[b] >= ENROULEMENT_CRITIQUE);
  let depart = 0;
  if (ferme) {
    const change = [...parts.keys()].find((i) => !memeMorceau(i, (i - 1 + segments) % segments));
    if (change === undefined) {
      return [{ ...chemin, type: parts[0] === 0 ? chemin.type : T.paroiEnSurplomb, surplomb: parts[0], enroulement: notes[0] }];
    }
    depart = change;
  }

  const morceaux = [];
  let courant = null;
  for (let j = 0; j < segments; j += 1) {
    const i = ferme ? (depart + j) % segments : j;
    if (courant === null || !memeMorceau(courant.segment, i)) {
      courant = {
        ...chemin, ferme: false, segment: i, surplomb: parts[i], enroulement: notes[i],
        points: [points[i]], type: parts[i] === 0 ? chemin.type : T.paroiEnSurplomb,
      };
      morceaux.push(courant);
    }
    courant.points.push(suivant(i));
  }

  if (reglages.tendre_les_debords === "oui" && morceaux.length > 1) {
    // Un débord encadré par deux morceaux posés a ses deux bouts ancrés : on le
    // tend comme un pont, ligne fine et rapide, au lieu d'un cordon lent qui pend.
    // Passé une certaine longueur, en revanche, un brin tendu tombe : il repasse
    // alors en vitesse de surplomb.
    // Un morceau de bout de tracé ouvert n'a qu'un voisin : il n'est pas encadré.
    const premier = ferme ? 0 : 1;
    const dernier = ferme ? morceaux.length - 1 : morceaux.length - 2;
    morceaux.forEach((morceau, i) => {
      if (morceau.surplomb < 0.5 || i < premier || i > dernier) return;
      const avant = morceaux[(i - 1 + morceaux.length) % morceaux.length];
      const apres = morceaux[(i + 1) % morceaux.length];
      if (avant.surplomb >= 0.5 || apres.surplomb >= 0.5) return;
      if (longueurDuTrace(morceau.points) > reglages.longueur_debord_tendu) return;
      morceau.type = T.pont;
      morceau.largeur = reglages.largeur_pont;
    });
  }
  for (const morceau of morceaux) delete morceau.segment;
  return morceaux;
}

/*
 * Un tracé redonné avec des segments d'au plus « pas » millimètres. Les points
 * ajoutés sont alignés sur ceux d'origine : le G-code les recolle (simplifier),
 * et la forme ne change pas d'un micron.
 */
function subdiviser(points, ferme, pas) {
  const nombre = points.length;
  const segments = ferme ? nombre : nombre - 1;
  if (segments < 1) return points;
  const sortie = [];
  for (let i = 0; i < segments; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % nombre];
    sortie.push(a);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const morceaux = Math.ceil(l / pas);
    for (let j = 1; j < morceaux; j += 1) {
      const t = j / morceaux;
      sortie.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (!ferme) sortie.push(points.at(-1));
  return sortie;
}

const longueurDuTrace = (points) => points.reduce(
  (s, p, i) => (i === 0 ? 0 : s + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1])), 0,
);

/*
 * La longueur en dessous de laquelle un morceau de surplomb ne sert à rien.
 *
 * Passer de v1 à v2 occupe une DISTANCE : d = |v1² − v2²| / 2a. Si le morceau
 * est plus court que d, la vitesse demandée n'est jamais atteinte : la tête
 * passe tout le morceau à freiner puis à réaccélérer, et c'est justement le
 * régime qu'on cherche à éviter — la machine n'est jamais en régime établi.
 *
 * La longueur minimale n'est donc PAS une constante : elle suit les vitesses et
 * l'accélération choisies. Avec une paroi à 50 mm/s, un surplomb fort à 15 et
 * 1500 mm/s², la pire transition occupe 0,76 mm. Si la paroi remontait à
 * 100 mm/s, il faudrait 3,26 mm, et des morceaux de 1,5 mm deviendraient des
 * mensonges. C'est ce couplage que ce calcul rend automatique.
 */
function longueurUtileDUnMorceau(partDuMorceau, partDuVoisin, reglages) {
  const v1 = vitesseDeSurplomb(partDuVoisin, reglages);
  const v2 = vitesseDeSurplomb(partDuMorceau, reglages);
  const a = Math.max(1, reglages.acceleration_paroi_exterieure);
  return Math.max(LONGUEUR_MINIMALE_D_UN_MORCEAU_MM, Math.abs(v1 * v1 - v2 * v2) / (2 * a));
}

/*
 * Les morceaux francs : une suite de même part trop courte pour sa propre
 * transition de vitesse prend la part de sa voisine la plus prudente. Mieux
 * vaut ralentir un peu trop que demander une vitesse qui ne sera pas atteinte.
 *
 * Vaut pour TOUTES les stratégies de surplomb, y compris la progressive. Elle en
 * était exclue, au motif que ses huit crans font de petites marches : c'était
 * exact pour la marche, faux pour la distance — ses morceaux pouvaient faire un
 * demi-millimètre, trop court pour atteindre quoi que ce soit. Comme la longueur
 * utile se calcule maintenant par transition, deux crans voisins (petit écart,
 * donc petite distance) ne sont plus fusionnés pour rien : la gradation fine
 * survit, seuls les morceaux réellement inutiles disparaissent.
 */
function lisserLesMorceaux(parts, points, segments, suivant, reglages) {
  const longueur = new Array(segments);
  for (let i = 0; i < segments; i += 1) {
    const [p, q] = [points[i], suivant(i)];
    longueur[i] = Math.hypot(q[0] - p[0], q[1] - p[1]);
  }

  for (let garde = 0; garde < segments; garde += 1) {
    const depart = [...parts.keys()].find((i) => parts[i] !== parts[(i - 1 + segments) % segments]);
    if (depart === undefined) return;
    const suites = [];
    let courante = null;
    for (let j = 0; j < segments; j += 1) {
      const i = (depart + j) % segments;
      if (courante === null || parts[i] !== courante.part) {
        courante = { part: parts[i], indices: [], longueur: 0 };
        suites.push(courante);
      }
      courante.indices.push(i);
      courante.longueur += longueur[i];
    }
    if (suites.length <= 1) return;
    // La suite la plus en défaut, et non la plus courte : un long morceau qui
    // doit encaisser un gros saut de vitesse est plus gênant qu'un morceau court
    // dont la transition tient dans un cheveu. Le voisin qui compte est le PLUS
    // RAPIDE des deux, donc celui de plus petite part : c'est de lui que vient
    // la transition la plus coûteuse.
    const requis = suites.map((suite, i) => {
      const avant = suites[(i - 1 + suites.length) % suites.length].part;
      const apres = suites[(i + 1) % suites.length].part;
      return longueurUtileDUnMorceau(suite.part, Math.min(avant, apres), reglages);
    });
    let pire = 0;
    for (let i = 1; i < suites.length; i += 1) {
      if (suites[i].longueur - requis[i] < suites[pire].longueur - requis[pire]) pire = i;
    }
    if (suites[pire].longueur >= requis[pire]) return;
    const avant = suites[(pire - 1 + suites.length) % suites.length].part;
    const apres = suites[(pire + 1) % suites.length].part;
    for (const i of suites[pire].indices) parts[i] = Math.max(avant, apres);
  }
}

/* Une zone pleine : lignes parallèles, ou boucles concentriques. */
function remplirPlein(zone, largeur, hauteur, angle, motif, reglages, garder) {
  if (zone.area() <= AIRE_MINIMALE_MM2) return [];
  const pas = espacement(largeur, hauteur);
  const recul = largeur / 2 - (reglages.chevauchement_pleins / 100) * largeur;
  // Une zone étroite hachurée ne donne que des moignons, jetés faute de longueur :
  // les boucles concentriques épousent sa forme et la comblent vraiment.
  const etroite = motif !== "concentrique"
    && epaisseurMoyenne(zone.toPolygons()) < LARGEURS_D_UNE_ZONE_ETROITE * largeur;
  if (motif === "concentrique" || etroite) {
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
 * Le vide d'une couche, découpé en PORTÉES : un morceau de vide connexe à la
 * fois, avec sa propre direction de pont et son ancrage.
 *
 * Deux raisons de ne plus traiter la couche entière d'un bloc :
 *   - une pièce à deux fenêtres perpendiculaires n'a pas une bonne direction
 *     mais deux ; en n'en choisissant qu'une, l'autre fenêtre était mal tendue ;
 *   - l'ancrage doit venir APRÈS la direction. Un pont mord sur la matière qui
 *     le porte aux deux bouts de ses brins, et seulement là : élargir la portée
 *     tout autour, comme avant, recouvrait aussi ses côtés — qui ne portent rien —
 *     et faussait du même coup le choix de la direction, puisque les brins
 *     partaient alors tous du plein.
 *
 * Rend [{ zone, polygones, angle, ancree }] :
 *   zone      la CrossSection à remplir, ancrage compris
 *   polygones ses polygones, déjà rentrés d'un quart de largeur
 *   angle     la direction des brins, en degrés
 *   ancree    la part de la longueur des brins qui repose à ses deux bouts
 *             (0 : rien ne tient cette portée — la couche du dessus ne s'y appuiera pas)
 */
function decouperEnPortees(wasm, vides, porteur, interieur, reglages, garder) {
  if (vides.area() <= AIRE_MINIMALE_MM2) return [];
  const C = wasm.CrossSection;
  const largeur = reglages.largeur_pont;
  const appuis = porteur === null ? []
    : garder(porteur.offset(largeur, "Miter", LIMITE_D_ONGLET)).toPolygons();

  const portees = [];
  for (const morceau of vides.decompose()) {
    garder(morceau);
    if (morceau.area() <= AIRE_MINIMALE_MM2) continue;
    const nue = morceau.toPolygons();
    // La direction, choisie sur la portée NUE : c'est elle qu'il faut franchir.
    // Une portée trop petite pour recevoir un seul brin n'a pas de direction ; elle
    // reste tout de même une portée, sinon elle retomberait dans la surface du
    // dessus et serait remplie en diagonales au-dessus du vide.
    const choix = directionDuPont(nue, appuis, largeur) ?? { angle: 0, ancree: 0 };
    // Une portée plus étroite que ça n'est pas une travée mais le liseré que
    // laisse une paroi inclinée d'une couche à l'autre : rien à ancrer, sinon
    // chaque flanc en pente se couvrirait de brins de pont de part et d'autre.
    const large = garder(garder(morceau.offset(-reglages.portee_minimale_pont / 2, "Miter", LIMITE_D_ONGLET))
      .offset(reglages.portee_minimale_pont / 2, "Miter", LIMITE_D_ONGLET));
    let zone = morceau;
    if (large.area() > AIRE_MINIMALE_MM2 && reglages.ancrage_pont > 0 && porteur !== null) {
      const autour = garder(garder(morceau.offset(reglages.ancrage_pont, "Miter", LIMITE_D_ONGLET)).intersect(porteur));
      const bande = garder(new C([bandeDAncrage(nue, choix.angle, reglages.ancrage_pont)], "Positive"));
      const ancre = garder(garder(autour.intersect(bande)).intersect(interieur));
      if (ancre.area() > AIRE_MINIMALE_MM2) zone = garder(C.union([morceau, ancre]));
    }
    const polygones = garder(zone.offset(-largeur / 4, "Miter", LIMITE_D_ONGLET)).toPolygons();
    portees.push({ zone, polygones, angle: choix.angle, ancree: choix.ancree });
  }
  return portees;
}

/*
 * La direction des brins d'une portée. Parmi les directions essayées, celle dont
 * la plus grande LONGUEUR de brins a ses deux bouts posés sur la matière ; à
 * égalité, celle dont le plus long brin est le plus court, car un brin long pend
 * et casse. Le départage se fait en deux temps et non par une note mêlant les
 * deux : une pondération faisait perdre la bonne direction dès que la portée
 * était longue.
 */
function directionDuPont(polygones, appuis, largeur) {
  // Le pas d'essai : assez grossier pour que trente-six directions ne coûtent
  // rien, assez fin pour qu'une petite portée reçoive quand même une dizaine de
  // brins. La note (part ancrée, plus long brin) ne dépend pas du pas.
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygone of polygones) {
    for (const [x, y] of polygone) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) return null;
  const pas = Math.max(largeur, Math.hypot(x1 - x0, y1 - y0) / 24);
  let meilleur = null;
  for (let angle = 0; angle < 180; angle += PAS_DES_DIRECTIONS_DE_PONT) {
    const lignes = hachures(polygones, pas, angle);
    if (lignes.length === 0) continue;
    let ancree = 0;
    let totale = 0;
    let plusLong = 0;
    for (const [a, b] of lignes) {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      totale += l;
      plusLong = Math.max(plusLong, l);
      if (dansLaZone(a[0], a[1], appuis) && dansLaZone(b[0], b[1], appuis)) ancree += l;
    }
    if (totale <= 0) continue;
    const note = ancree / totale;
    if (meilleur === null || note > meilleur.note + 1e-9
      || (note > meilleur.note - 1e-9 && plusLong < meilleur.plusLong)) {
      meilleur = { note, plusLong, angle };
    }
  }
  return meilleur === null ? null : { angle: meilleur.angle, ancree: meilleur.note };
}

/*
 * Le rectangle qui couvre une portée, allongé de « ancrage » DANS LA DIRECTION
 * des brins et pas du tout en travers : c'est le seul endroit où un brin a
 * besoin de mordre sur la matière.
 */
function bandeDAncrage(polygones, angle, ancrage) {
  const a = (angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  const [vx, vy] = [-Math.sin(a), Math.cos(a)];
  let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const polygone of polygones) {
    for (const [x, y] of polygone) {
      const u = x * ux + y * uy;
      const v = x * vx + y * vy;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
  }
  u0 -= ancrage;
  u1 += ancrage;
  const point = (u, v) => [u * ux + v * vx, u * uy + v * vy];
  return [point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1)];
}

/* Les brins d'une portée, tous dans sa direction et d'un bord à l'autre. */
function tendreLaPortee(portee, largeur) {
  const lignes = hachures(portee.polygones, largeur, portee.angle);
  if (lignes.length === 0) return [];
  return relier(lignes, portee.polygones, 1.5 * largeur);
}

/*
 * Le remplissage clairsemé, au motif demandé et à la densité donnée (elle n'est
 * pas lue dans les réglages : une même couche en pose deux, la normale et celle,
 * doublée, qui soutient les couches pleines juste au-dessus).
 */
function remplirClairseme(zone, largeur, hauteur, z, k, reglages, pourcent, garder) {
  const densite = pourcent / 100;
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
 * Les interstices : chaque filet est réduit à son AXE MÉDIAN, un cordon posé au
 * milieu et dans sa longueur, de la largeur du filet en chaque point
 * (axe_median.js). Un filet qui n'est pas une bande — trois branches qui se
 * rejoignent — n'a pas d'axe simple : il est alors hachuré en travers, comme
 * avant, faute de mieux.
 */
function remplirInterstices(zone, largeurMax, hauteur, garder) {
  const lignes = [];
  for (const morceau of zone.decompose()) {
    garder(morceau);
    if (morceau.area() <= AIRE_MINIMALE_MM2) continue;
    const polygones = morceau.toPolygons();
    const cordons = cordonsDuFilet(polygones, {
      pas: largeurMax,
      largeurMin: 0.2,
      largeurMax,
    });
    if (cordons.length > 0) {
      lignes.push(...cordons);
      continue;
    }
    // Pas une bande : on retombe sur un zigzag en travers de son axe principal.
    for (const polygone of polygones) {
      const aire = aireSignee(polygone);
      if (aire <= AIRE_MINIMALE_MM2) continue;
      const largeur = Math.min(largeurMax, Math.max(0.2, (2 * aire) / longueurDuTour(polygone)));
      const trace = relier(hachures([polygone], espacement(largeur, hauteur), axePrincipal(polygone) + 90),
        [polygone], 3 * largeur);
      for (const points of trace) lignes.push({ largeur, points, ferme: false });
    }
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

/*
 * Les chemins d'une couche rangés île par île : on termine une région avant de
 * passer à la suivante.
 *
 * Avant, les parois arrivaient par RANG — toutes les parois intérieures de la
 * couche, puis toutes les extérieures — et les remplissages par TYPE. Sur une
 * couche à deux îles, la buse faisait donc l'aller-retour entre elles à chaque
 * rang et à chaque type : des déplacements pour rien, des fils entre les deux, et
 * chaque île laissée à refroidir au milieu de son propre cycle.
 *
 * L'ordre relatif des chemins d'une même île est conservé : il porte déjà le bon
 * enchaînement (parois, puis dessus, puis pleins, puis clairsemé).
 * Rend le dernier point tracé, pour que la couche suivante commence près de là.
 */
function rangerParIlot(chemins, section, depuis, garder) {
  const dernierPoint = () => {
    const dernier = chemins.at(-1);
    return dernier === undefined ? depuis : dernier.points.at(-1);
  };
  if (chemins.length < 2) return dernierPoint();
  const iles = section.decompose();
  for (const ile of iles) garder(ile);
  if (iles.length < 2) return dernierPoint();

  const polygones = iles.map((ile) => ile.toPolygons());
  // Un chemin appartient à l'île qui contient son premier point. Ce qui ne tombe
  // dans aucune (un point pile sur un bord) reste à la fin, dans son ordre.
  const paniers = polygones.map(() => []);
  const orphelins = [];
  for (const chemin of chemins) {
    const [x, y] = chemin.points[0];
    const i = polygones.findIndex((p) => dansLaZone(x, y, p));
    if (i < 0) orphelins.push(chemin);
    else paniers[i].push(chemin);
  }

  // Les îles dans l'ordre du plus proche voisin, depuis le dernier point tracé.
  const centres = paniers.map((panier) => {
    if (panier.length === 0) return null;
    const [x, y] = panier[0].points[0];
    return [x, y];
  });
  const restantes = centres.map((c, i) => (c === null ? -1 : i)).filter((i) => i >= 0);
  const rangees = [];
  let ici = depuis;
  while (restantes.length > 0) {
    let meilleur = 0;
    let mini = Infinity;
    restantes.forEach((i, rang) => {
      const d = Math.hypot(centres[i][0] - ici[0], centres[i][1] - ici[1]);
      if (d < mini) {
        mini = d;
        meilleur = rang;
      }
    });
    const i = restantes.splice(meilleur, 1)[0];
    rangees.push(...paniers[i]);
    ici = paniers[i].at(-1).points.at(-1);
  }
  rangees.push(...orphelins);
  chemins.length = 0;
  chemins.push(...rangees);
  return dernierPoint();
}

/*
 * La bordure, au pied de la pièce. Deux formes :
 *   complète  des tours entiers autour du pied, du plus loin au plus près ;
 *   oreilles  de petits disques dans les angles pointus seulement. C'est là que
 *             le décollement commence — un coin franc tire sur la matière des
 *             deux côtés — et il y a dix fois moins de matière à retirer après.
 * Dans les deux cas, pas de bordure dans les trous : seulement les contours
 * extérieurs de la première couche.
 */
function tracerLaBordure(wasm, contoursDuPied, hauteur, reglages, garder) {
  const C = wasm.CrossSection;
  const largeur = reglages.largeur_premiere_couche;
  const exterieurs = contoursDuPied.filter((c) => aireSignee(c) > 0);
  if (exterieurs.length === 0) return [];
  const pied = garder(new C(exterieurs, "Positive"));
  const pas = espacement(largeur, hauteur);
  const ecart = reglages.ecart_bordure;

  const tours = (zone, nombre) => {
    const boucles = [];
    for (let i = 0; i < nombre; i += 1) {
      const boucle = garder(zone.offset(ecart + largeur / 2 + i * pas, "Round", LIMITE_D_ONGLET, 32));
      boucles.push(boucle.toPolygons().map((points) => ({ couche: 0, type: T.bordure, largeur, points, ferme: true })));
    }
    // Du plus loin au plus près : la dernière boucle vient se coller à la pièce.
    return boucles.reverse().flat();
  };

  if (reglages.type_bordure !== "oreilles") {
    return tours(pied, Math.max(1, Math.round(reglages.largeur_bordure / pas)));
  }

  // Les angles assez fermés pour recevoir une oreille.
  const limite = (reglages.angle_des_oreilles * Math.PI) / 180;
  const pointes = [];
  for (const contour of exterieurs) {
    const n = contour.length;
    const sens = Math.sign(aireSignee(contour)) || 1;
    for (let i = 0; i < n; i += 1) {
      const p = contour[i];
      const a = contour[(i - 1 + n) % n];
      const b = contour[(i + 1) % n];
      const [ux, uy] = [p[0] - a[0], p[1] - a[1]];
      const [vx, vy] = [b[0] - p[0], b[1] - p[1]];
      const virage = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      // Un coin SAILLANT, et dont la pointe est plus fermée que la limite.
      if (virage * sens <= 0) continue;
      if (Math.PI - Math.abs(virage) > limite) continue;
      // Deux pointes voisines ne valent qu'une oreille.
      if (pointes.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < reglages.largeur_bordure)) continue;
      pointes.push(p);
    }
  }
  if (pointes.length === 0) return [];
  // Un disque par pointe, puis l'intersection avec ce qui entoure le pied : une
  // oreille ne recouvre jamais la pièce, et garde l'écart demandé.
  const rayon = reglages.largeur_bordure;
  const cotes = 24;
  const disques = pointes.map(([x, y]) => Array.from({ length: cotes }, (_v, i) => {
    const a = (2 * Math.PI * i) / cotes;
    return [x + rayon * Math.cos(a), y + rayon * Math.sin(a)];
  }));
  const zone = garder(new C(disques, "Positive"));
  const interdit = garder(pied.offset(ecart, "Round", LIMITE_D_ONGLET, 32));
  const oreilles = garder(zone.subtract(interdit));
  if (oreilles.area() <= AIRE_MINIMALE_MM2) return [];
  // Chaque oreille remplie de boucles concentriques, du bord vers son centre.
  const boucles = [];
  for (let d = largeur / 2; ; d += pas) {
    const boucle = garder(oreilles.offset(-d, "Miter", LIMITE_D_ONGLET));
    if (boucle.area() <= AIRE_MINIMALE_MM2) break;
    for (const points of boucle.toPolygons()) {
      boucles.push({ couche: 0, type: T.bordure, largeur, points, ferme: true });
    }
  }
  return boucles;
}
