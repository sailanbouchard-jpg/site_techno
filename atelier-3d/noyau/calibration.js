/*
 * noyau/calibration.js
 * ────────────────────
 * Les essais de calibration : des impressions que le logiciel dessine lui-même,
 * et ce qu'on en conclut.
 *
 * Ce qu'un essai a le droit d'être. Un essai ne sert qu'à une chose : donner sa
 * valeur à un réglage du trancheur. Ce qui aide à CONCEVOIR (le jeu qu'il faut
 * laisser entre deux pièces, le diamètre à dessiner pour qu'une vis passe) ne
 * règle rien ici et n'y a pas sa place : ce sont des informations de dessin, pas
 * des réglages d'impression. Chaque essai ci-dessous nomme donc les réglages
 * qu'il décide, et il n'y en a pas un qui ne décide rien — sauf le dernier, qui
 * ne conclut rien et dit seulement lequel refaire.
 *
 * Trois étages, dans l'ordre des préréglages :
 *   la bobine    ce qui dépend de la matière : diamètre, température, débit,
 *                avance de pression, débit maximal, rétraction. Se refait à
 *                chaque bobine, et tombe pareil sur n'importe quelle plaque.
 *   la plaque    ce qui se joue au contact du plateau : l'écrasement de la
 *                première couche. Il faut un débit juste pour le juger, d'où
 *                sa place après la bobine.
 *   les réglages cotes, surplombs et ponts, vitesse : ce qui dépend de la
 *                hauteur de couche et de l'intention.
 *
 * Comment un essai pousse un réglage à sa limite dans une seule impression.
 * Deux leviers, et ils se cumulent :
 *   par COUCHE (modulations)  à partir de telle couche, d'autres réglages et,
 *                             au besoin, une ligne de G-code (M104, M900).
 *                             L'éprouvette est une tour à bandes.
 *   par PIÈCE (variantes)     chaque éprouvette du plateau reçoit ses propres
 *                             réglages — et elle est TRANCHÉE avec eux, donc
 *                             même ce que le trancheur décide lui-même (une
 *                             stratégie de surplomb, une vitesse de paroi) se
 *                             compare côte à côte. Une variante peut aussi
 *                             décaler sa pièce en Z.
 * Le croisement des deux donne un essai à deux entrées : la rétraction essaie
 * six longueurs (bandes) sur trois vitesses (pièces) en une impression.
 *
 * Et deux principes de lecture :
 *   pousser jusqu'à l'échec   les bandes vont volontairement au-delà de ce qui
 *                             marche : une série où tout réussit n'apprend rien ;
 *   répéter                   chaque défaut est présenté plusieurs fois (deux
 *                             ponts, trois surplombs par angle, deux tubes, deux
 *                             languettes). Un morceau raté tout seul est un
 *                             accident ; raté deux fois, c'est le réglage.
 * D'où des impressions plus longues qu'ailleurs. C'est le prix d'une lecture
 * qui ne laisse pas de doute, et c'est un prix qu'on accepte.
 *
 * Ce que le logiciel ne peut pas faire : voir. Chaque essai se termine donc par
 * un dépouillement, qui déclare simplement ce qu'il demande :
 *   champs          des cotes relevées au pied à coulisse ;
 *   choixDeBande    la bande la plus réussie ;
 *   champsDeChoix   d'autres lectures, chacune dans sa liste ;
 *   constats        des cases à cocher, sans réglage à la clé.
 * Le panneau montre ce qui est déclaré, et rien d'autre.
 */

import {
  nouveauMaillage, maillageFini, ajouterBoite, ajouterTronc, ajouterPlaqueTrouee, ajouterTexte,
  rectangle, cercle, decale, tourne, boiteDe,
} from "./formes_de_calibration.js";
// La vraie section d'un cordon, celle que le G-code extrude : un rectangle aux
// bords arrondis, 10 % plus mince que largeur × hauteur. Une tour de débit qui
// annonce 20 mm³/s en calculant sur le rectangle en délivre 18 : elle mentirait.
import { sectionDeLigne } from "../tranchage/estimations.js";
// L'espacement de deux lignes voisines : deux cordons se recouvrent sur leurs
// bords arrondis. L'essai de débit s'en sert pour remonter de l'épaisseur
// mesurée à la largeur d'UNE ligne.
import { espacement } from "../tranchage/parois.js";

// Le centre du plateau : les éprouvettes y sont posées.
const CENTRE_X = 128;
const CENTRE_Y = 128;

// Les valeurs essayées sont écrites en relief sur chaque éprouvette : une pièce
// gardée sur l'étagère doit dire elle-même ce qu'elle montre.
const TAILLE_ETIQUETTE_MM = 5;
const RELIEF_ETIQUETTE_MM = 0.6;
// L'épaisseur des plaques verticales qui portent les chiffres.
const EPAISSEUR_PLAQUE_MM = 2.4;
// Le socle des éprouvettes à plusieurs pieds : assez épais pour tenir, assez
// mince pour ne pas peser sur la durée.
const SOCLE_MM = 1.2;
// Le pied de la tour de température. Il décale toutes les bandes d'autant : la
// géométrie ET les changements de température doivent partir de là, sinon le
// chiffre gravé ne dit pas la température imprimée en face de lui.
const PIED_DE_LA_TOUR_MM = 2.4;

/* Une éprouvette : son maillage, posé sur le plateau et centré sur son encombrement réel. */
function eprouvette(nom, dessiner, decalageX = 0, decalageY = 0) {
  const m = nouveauMaillage();
  dessiner(m);
  const { min, max } = boiteDe(m);
  const dx = CENTRE_X + decalageX - (min[0] + max[0]) / 2;
  const dy = CENTRE_Y + decalageY - (min[1] + max[1]) / 2;
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i] += dx;
    m.positions[i + 1] += dy;
    m.positions[i + 2] -= min[2];
  }
  return { nom, maillage: maillageFini(m) };
}

/* Un texte en relief sur une face tournée vers l'avant (vers les y décroissants). */
function etiquetteAvant(m, police, texte, x, z, taille = TAILLE_ETIQUETTE_MM, yFace = 0) {
  ajouterTexte(m, police, texte, taille, RELIEF_ETIQUETTE_MM, (u, v, w) => [x + u, yFace - w, z + v]);
}

/* Un texte en relief sur une face tournée vers l'arrière (vers les y croissants). */
function etiquetteArriere(m, police, texte, x, z, taille = TAILLE_ETIQUETTE_MM, yFace = 0) {
  ajouterTexte(m, police, texte, taille, RELIEF_ETIQUETTE_MM, (u, v, w) => [x - u, yFace + w, z + v]);
}

/* Un texte en relief sur une face tournée vers le haut. */
function etiquetteDessus(m, police, texte, x, y, taille = TAILLE_ETIQUETTE_MM, zFace = 0) {
  ajouterTexte(m, police, texte, taille, RELIEF_ETIQUETTE_MM, (u, v, w) => [x + u, y + v, zFace + w]);
}

/*
 * Le mât d'une tour : une plaque verticale, sur son socle, qui porte les valeurs
 * de chaque bande. Les chiffres ne sont jamais sur la surface qu'on mesure — un
 * relief fausserait la mesure.
 */
function matDesBandes(m, police, bandes, { x0, x1, y, epaisseur, hauteurDeBande, depart = 0, taille = 3.4 }) {
  // epaisseur : celle que epaisseurDeParoi donne pour le nombre de parois de
  // l'essai. Une valeur au hasard laisserait le mât creux, et un mât creux
  // de 40 mm se tord.
  ajouterBoite(m, x0, y, 0, x1, y + epaisseur, depart + bandes.length * hauteurDeBande);
  ajouterBoite(m, x0 - 2, y - 4, 0, x1 + 2, y + epaisseur + 4, SOCLE_MM);
  bandes.forEach((etiquette, i) => {
    etiquetteAvant(m, police, etiquette, (x0 + x1) / 2, depart + (i + 0.5) * hauteurDeBande - taille / 2, taille, y);
  });
}

/* La première couche de chaque bande : celle dont le haut dépasse le bas de la bande. */
function couchesDesBandes(couches, hauteurDeBande, nombre, depart = 0) {
  return Array.from({ length: nombre }, (_v, i) => {
    const z = depart + i * hauteurDeBande;
    const k = couches.hauteurs.findIndex((h) => h > z + 1e-6);
    return k < 0 ? Math.max(0, couches.hauteurs.length - 1) : k;
  });
}

const arrondi = (v) => Math.round(v * 1e6) / 1e6;
/* Les valeurs d'une série : depart, depart + pas, … */
const serie = (depart, pas, nombre) => Array.from({ length: nombre }, (_v, i) => arrondi(depart + i * pas));
const nombreFr = (v, d = 2) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });
const moyenne = (valeurs) => valeurs.reduce((s, v) => s + v, 0) / valeurs.length;

/*
 * Une tour à paroi unique se dessine PLEINE, et c'est le trancheur qui la creuse :
 * une paroi, aucun remplissage, aucun dessus. Dessiner l'anneau dans le modèle
 * ne marche pas — un anneau aussi mince que la ligne disparaît au décalage des
 * parois, et un anneau un peu plus épais donne deux lignes au lieu d'une.
 */
function prismePlein(m, contour, z0, z1) {
  ajouterTronc(m, contour, contour, z0, z1);
}

/*
 * L'épaisseur à donner à une paroi pour que le trancheur y pose exactement
 * « nombre » lignes, sans interstice à combler ni ligne manquante. La fenêtre
 * possible va de largeur + 2(n−1)·espacement (en dessous, la dernière ligne
 * n'a plus la place) à largeur + (2n−1)·espacement (au-dessus, il reste de quoi
 * remplir) : on se place au milieu.
 */
function epaisseurDeParoi(nombre, largeur, hauteurCouche) {
  const esp = espacement(largeur, hauteurCouche);
  return arrondi(largeur + (2 * nombre - 1.5) * esp);
}


/* Les décalages d'une grille de pièces, centrée : rangées de « colonnes » pièces. */
function grille(nombre, colonnes, pasX, pasY) {
  const rangs = Math.ceil(nombre / colonnes);
  return Array.from({ length: nombre }, (_v, i) => {
    const colonne = i % colonnes;
    const rang = Math.floor(i / colonnes);
    return [(colonne - (colonnes - 1) / 2) * pasX, ((rangs - 1) / 2 - rang) * pasY];
  });
}

// Les angles du peigne des surplombs et les portées des travées : l'éprouvette
// et le dépouillement lisent la même liste. Les derniers crans sont là pour
// rater : un essai dont tout réussit ne dit pas où est la limite.
const ANGLES_DE_SURPLOMB = Object.freeze([35, 45, 55, 65, 72]);
const PORTEES_DE_PONT = Object.freeze([15, 25, 35, 45, 55]);
// Chaque angle est présenté trois fois : deux fins planes et un poteau rond.
// Une paroi courbe ne se retrousse pas comme une paroi plane, et un morceau
// raté une fois sur trois est un accident, pas un réglage.
const REPETITIONS_DE_SURPLOMB = 3;

// Les quatre stratégies de surplomb, comparées côte à côte dans une seule
// impression : chaque peigne est tranché avec la sienne.
const STRATEGIES_DE_SURPLOMB = Object.freeze([
  { valeur: "paliers", etiquette: "Paliers de vitesse" },
  { valeur: "unique", etiquette: "Vitesse unique" },
  { valeur: "ponts", etiquette: "Ponts sur les débords" },
  { valeur: "appui", etiquette: "Appui maximal" },
]);

// ── Les étages ──────────────────────────────────────────────────────────────

export const ETAGES = Object.freeze([
  {
    id: "matiere",
    nom: "La bobine",
    texte: "Ces essais décrivent le filament : ils se refont à chaque nouvelle bobine, et pas autrement. Ce qu'ils trouvent ne dépend pas de la plaque posée — c'est même ainsi qu'on les vérifie : la même bobine calibrée sur deux plaques doit donner deux fois les mêmes nombres.",
  },
  {
    id: "plaque",
    nom: "La plaque",
    texte: "Ce qui se joue au contact du plateau, et qui change d'une plaque à l'autre : la hauteur exacte de la première couche. Il faut un débit déjà juste pour la juger, donc cet essai vient après la bobine.",
  },
  {
    id: "reglages",
    nom: "Les réglages d'impression",
    texte: "Ces essais-là dépendent de la hauteur de couche, du nombre de parois et de ce que le préréglage cherche (aller vite, être étanche, être beau). À refaire pour chaque préréglage d'impression, une fois les deux étages du dessus terminés.",
  },
]);

// ── Les essais, dans l'ordre conseillé ──────────────────────────────────────

export const OUTILS = Object.freeze([

  // ── 1. Le diamètre du filament ──
  {
    id: "diametre", etage: "matiere", nom: "Diamètre du filament",
    but: "Combien de matière une longueur de filament contient vraiment.",
    pourquoi: "L'extrudeur pousse une LONGUEUR de fil ; le trancheur, lui, veut un VOLUME. Il passe de l'un à l'autre par le diamètre. Un fil annoncé 1,75 mm qui en fait 1,72 donne 3 % de matière en moins partout. Le rapport de débit, mesuré juste après, rattrape cette erreur — mais il la rattrape en se trompant : il devient propre à cette bobine-là et ne se transporte plus. Le fil n'étant jamais tout à fait rond, c'est le diamètre moyen qui décide du volume : mesurer en croisant les axes.",
    sansImpression: true,
    parametres: [],
    depouillement: {
      consigne: "Cinq mesures au pied à coulisse, espacées d'au moins 20 cm sur la bobine, en tournant le fil d'un quart de tour entre deux mesures. Cinq et pas trois : un fil ovale sur une seule mesure fausserait tout le reste.",
      champs: ["a", "b", "c", "d", "e"].map((cle, i) => ({
        cle, etiquette: "Mesure " + (i + 1), unite: "mm", defaut: 1.75, min: 1.4, max: 3.2,
      })),
      conclure(saisie) {
        const valeurs = [saisie.a, saisie.b, saisie.c, saisie.d, saisie.e];
        const moy = moyenne(valeurs);
        const ecart = Math.max(...valeurs) - Math.min(...valeurs);
        return {
          reglages: { diametre_filament: Math.round(moy * 1000) / 1000 },
          texte: "Diamètre moyen " + nombreFr(moy, 3) + " mm, écart entre mesures " + nombreFr(ecart, 3) + " mm."
            + (ecart > 0.05 ? " Cet écart est grand : la bobine est irrégulière, le débit le sera aussi, et aucun essai qui suit ne sera meilleur que ça." : ""),
        };
      },
    },
  },

  // ── 2. La température ──
  {
    id: "temperature", etage: "matiere", nom: "Température de la buse",
    but: "Le bord froid, en dessous duquel la buse ne suit plus, et le bord chaud, au-delà duquel ça file et ça pend.",
    pourquoi: "Elle passe avant le débit : plus chaude, la matière est plus fluide, s'écrase davantage et la ligne s'élargit. Calibrer le débit avant la température, c'est mesurer deux fois. Le défaut des tours de température du commerce est qu'à vitesse normale tout se ressemble : entre 195 et 215, le pont, les fils et les pointes sont les mêmes. Deux choses continuent pourtant de bouger, et cet essai les force. La tenue entre couches, qu'on ne voit pas : des languettes à casser à la main le disent. Et le débit que la buse sait fondre, qu'une vitesse normale ne demande jamais : un second tube monte à côté de la tour, imprimé bien au-delà du débit du préréglage, et il se troue tant que la buse est trop froide.",
    duree: "≈ 1 h 30",
    parametres: [
      { cle: "depart", etiquette: "Première bande", unite: "°C", defaut: 190, min: 150, max: 300, entier: true },
      { cle: "pas", etiquette: "Pas", unite: "°C", defaut: 5, min: 1, max: 20, entier: true },
      { cle: "nombre", etiquette: "Nombre de bandes", defaut: 10, min: 3, max: 12, entier: true },
      { cle: "hauteur", etiquette: "Hauteur d'une bande", unite: "mm", defaut: 10, min: 6, max: 16 },
      { cle: "vitesseRapide", etiquette: "Vitesse du tube à haut débit", unite: "mm/s", defaut: 200, min: 60, max: 400, entier: true },
    ],
    reglages: {
      nombre_parois: 2, densite_remplissage: 0, couches_dessus: 0, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      remplir_interstices: "partout", couture_biseau: "non", position_couture: "arriere",
      temps_couche_min: 0, arcs: "non",
    },
    variantes(p, r) {
      const debit = arrondi(sectionDeLigne(r.largeur_paroi_exterieure, r.hauteur_couche) * r.rapport_debit * p.vitesseRapide);
      return [
        { ecarts: {}, etiquette: "Tour de qualité" },
        {
          // Une paroi unique, poussée à un débit que le préréglage n'autorise
          // pas : c'est le seul moyen de voir la buse décrocher quand elle est
          // trop froide. Le plafond de débit est levé pour cette pièce seule.
          ecarts: { nombre_parois: 1, debit_maximal: 100 },
          vitesseImposee: p.vitesseRapide,
          etiquette: "Tube à " + p.vitesseRapide + " mm/s, soit " + nombreFr(debit, 1) + " mm³/s",
        },
      ];
    },
    geometrie(p, r, contexte) {
      const police = contexte.police;
      const e = EPAISSEUR_PLAQUE_MM;
      const h = p.hauteur;
      const valeurs = serie(p.depart, p.pas, p.nombre);
      const hauteurTotale = PIED_DE_LA_TOUR_MM + p.nombre * h;
      const debordGauche = h * Math.tan((35 * Math.PI) / 180);
      const debordDroit = h * Math.tan((45 * Math.PI) / 180);
      const hautCone = Math.max(3, h - 4);

      const tour = eprouvette("Tour de température", (m) => {
        // Le pied : sans lui, une plaque de 2,4 mm sur 96 bascule.
        ajouterBoite(m, 0, -5, 0, 96, e + 5, PIED_DE_LA_TOUR_MM);
        for (let i = 0; i < p.nombre; i += 1) {
          const z0 = PIED_DE_LA_TOUR_MM + i * h;
          const z1 = z0 + h;
          const linteau = z1 - 3;
          ajouterBoite(m, 0, 0, z0, 16, e, z1);            // colonne de gauche : le chiffre
          // Deux fenêtres identiques, donc deux ponts de 20 mm et deux paires de
          // pointes par bande : un pont qui pend une fois sur deux ne décide rien.
          for (const x of [16, 48]) {
            ajouterBoite(m, x, 0, z0, x + 4, e, linteau);          // pied gauche
            ajouterBoite(m, x + 24, 0, z0, x + 28, e, linteau);    // pied droit
            ajouterBoite(m, x, 0, linteau, x + 28, e, z1);         // linteau : un pont de 20 mm
            // La grosse pointe montre les fils, la fine montre jusqu'où la
            // matière tient quand il n'y a presque rien à poser.
            ajouterTronc(m, cercle(x + 10, e / 2, 1.2, 24), cercle(x + 10, e / 2, 0.25, 24), z0, z0 + hautCone);
            ajouterTronc(m, cercle(x + 18, e / 2, 0.7, 24), cercle(x + 18, e / 2, 0.15, 24), z0, z0 + 0.7 * hautCone);
          }
          ajouterBoite(m, 44, 0, z0, 48, e, z1);           // colonne du milieu
          ajouterBoite(m, 76, 0, z0, 96, e, z1);           // colonne de droite

          // Les deux pentes, une de chaque côté, comme sur les tours du commerce.
          const gauche = rectangle(0, 0, 9, e);
          ajouterTronc(m, gauche, decale(gauche, -debordGauche, 0), z0, z1);
          const droite = rectangle(87, 0, 96, e);
          ajouterTronc(m, droite, decale(droite, debordDroit, 0), z0, z1);

          // Deux languettes de rupture au dos, de même section pour toutes les
          // bandes, à casser à la main. C'est le seul critère qui sépare encore
          // deux températures quand l'aspect ne dit plus rien, et il y en a deux
          // pour qu'une cassure de travers ne compte pas. Leur support monte à
          // 45°, sinon elles s'imprimeraient dans le vide.
          const hautLanguette = Math.min(4.2, h - 3.8);
          for (const xb of [2, 84]) {
            ajouterTronc(m, rectangle(xb, e - 0.4, xb + 10, e + 0.2), rectangle(xb, e - 0.4, xb + 10, e + 3), z0, z0 + 2.8);
            ajouterBoite(m, xb + 2, e + 1, z0 + 2.8, xb + 8, e + 2.6, z0 + 2.8 + hautLanguette);
          }
          etiquetteAvant(m, police, String(valeurs[i]), 8, z0 + h / 2 - 2.5, 5);
        }
        etiquetteAvant(m, police, "35", 4.5, 0.4, 1.6);
        etiquetteAvant(m, police, "45", 91.5, 0.4, 1.6);
      }, -34, 0);

      // Le tube à haut débit : rond, pour que la buse ne ralentisse jamais dans
      // un coin — le débit demandé est alors vraiment atteint. Dessiné plein,
      // il sort creux : sa variante ne demande qu'une paroi et aucun remplissage.
      const tube = eprouvette("Tube à haut débit", (m) => {
        prismePlein(m, cercle(0, 0, 9, 72), 0, hauteurTotale);
      }, 46, 0);

      return [tour, tube];
    },
    modulations(p, couches) {
      const valeurs = serie(p.depart, p.pas, p.nombre);
      const bandes = couchesDesBandes(couches, p.hauteur, p.nombre, PIED_DE_LA_TOUR_MM).map((couche, i) => ({
        couche,
        reglages: { temperature_buse: valeurs[i], temperature_buse_premiere: valeurs[i] },
        gcode: ["M104 S" + valeurs[i]],
        etiquette: valeurs[i] + " °C",
      }));
      // Le pied de la tour est imprimé à la température de la PREMIÈRE bande, et
      // pas à celle du préréglage : une buse qui doit redescendre de 25 °C en
      // arrivant sur la bande 1 la fausserait sur ses premiers millimètres.
      return [{
        couche: 0,
        reglages: { temperature_buse: valeurs[0], temperature_buse_premiere: valeurs[0] },
        gcode: ["M104 S" + valeurs[0]],
        etiquette: "Pied, à " + valeurs[0] + " °C",
      }, ...bandes];
    },
    depouillement: {
      consigne: "Quatre lectures, deux qui demandent du chaud et deux qui demandent du froid. Sur le tube mince : à partir de quelle bande la paroi est-elle pleine et brillante ? Au dos de la tour : casser les languettes de bas en haut — une cassure plate et brillante est une séparation entre couches, une cassure blanche et arrachée est de la matière déchirée ; retenir la première bande qui s'arrache. Puis, en montant : la dernière bande sans aucun fil entre les quatre pointes, et la dernière dont les quatre linteaux restent tendus.",
      champsDeChoix: (p) => {
        const options = serie(p.depart, p.pas, p.nombre).map((t, i) => ({ valeur: i, etiquette: t + " °C" }));
        const aucune = { valeur: -1, etiquette: "Aucune" };
        return [
          { cle: "debit", etiquette: "Première bande où le tube est plein", options: [...options, aucune] },
          { cle: "rupture", etiquette: "Première languette qui s'arrache", options: [...options, aucune] },
          { cle: "fils", etiquette: "Dernière bande sans fil", options: [...options].reverse().concat([aucune]) },
          { cle: "ponts", etiquette: "Dernière bande aux linteaux tendus", options: [...options].reverse().concat([aucune]) },
          {
            cle: "intention", etiquette: "Ce que vise ce préréglage",
            options: [
              { valeur: 0, etiquette: "Détail et surplombs" },
              { valeur: 1, etiquette: "Résistance et vitesse" },
              { valeur: 2, etiquette: "Compromis" },
            ],
          },
        ];
      },
      conclure(saisie, p) {
        const valeurs = serie(p.depart, p.pas, p.nombre);
        const dernier = valeurs.length - 1;
        // Ce qui demande du chaud tire la borne basse vers le haut ; ce qui
        // demande du froid tire la borne haute vers le bas.
        const lu = (cle, defaut) => (saisie[cle] === undefined || saisie[cle] === -1 ? defaut : saisie[cle]);
        const froid = valeurs[Math.max(lu("debit", 0), lu("rupture", 0))];
        const chaud = valeurs[Math.min(lu("fils", dernier), lu("ponts", dernier))];
        if (froid > chaud) {
          return {
            reglages: {},
            texte: "Fenêtre vide : il faut au moins " + froid + " °C pour que la buse suive et que les couches soudent, mais dès "
              + chaud + " °C ça file ou les ponts pendent. Sécher le filament et refaire l'essai : un fil humide donne exactement ce tableau.",
          };
        }
        const intention = saisie.intention ?? 2;
        const t = intention === 0 ? froid : intention === 1 ? chaud : Math.round((froid + chaud) / 2);
        return {
          reglages: { temperature_buse: t, temperature_buse_premiere: Math.min(300, t + 5) },
          texte: "Fenêtre utile de " + froid + " à " + chaud + " °C. Buse retenue à " + t + " °C, première couche à "
            + Math.min(300, t + 5) + " °C."
            + (t < chaud ? " À cette température, le débit maximal sera plus bas qu'au bord chaud : les vitesses suivront." : "")
            + " Si le débit ou le débit maximal avaient déjà été mesurés à une autre température, les refaire.",
        };
      },
    },
  },

  // ── 3. Le rapport de débit ──
  {
    id: "debit", etage: "matiere", nom: "Rapport de débit",
    but: "Poser exactement la largeur de ligne demandée : c'est le réglage racine.",
    pourquoi: "Tout le reste en dépend. Tant qu'une ligne annoncée 0,42 mm en fait 0,45, les cotes sont fausses, le dessus est bosselé, les ponts sont lourds, et chaque autre essai mesure cette erreur-là plutôt que ce qu'il cherche. Le juger à l'œil sur un dessus lisse ne marche pas : entre 98 et 104 % les plaquettes se ressemblent, et c'est justement la plainte qu'on entend. Ici on ne regarde pas, on MESURE. Trois boîtes sont imprimées à trois débits connus, sans remplissage et à deux parois exactement : leur flanc ne contient donc que deux lignes, et l'écart entre la cote extérieure et la cote intérieure donne l'épaisseur de ces deux lignes au centième. Chaque boîte conclut alors toute seule au débit juste — et l'accord des trois dit si la mesure est fiable.",
    duree: "≈ 35 min",
    parametres: [
      {
        // Le centre part du rapport en vigueur : la mesure est la plus juste
        // autour du point de fonctionnement.
        cle: "centre", etiquette: "Débit de la boîte du milieu", unite: "%",
        defaut: (r) => Math.round((r.rapport_debit ?? 1) * 1000) / 10,
        min: 60, max: 140, decimales: 1,
      },
      { cle: "ecart", etiquette: "Écart des boîtes voisines", unite: "%", defaut: 8, min: 2, max: 15 },
      { cle: "cote", etiquette: "Côté d'une boîte", unite: "mm", defaut: 30, min: 20, max: 50, entier: true },
      { cle: "hauteur", etiquette: "Hauteur des boîtes", unite: "mm", defaut: 25, min: 15, max: 60, entier: true },
    ],
    reglages: {
      // Deux parois et rien d'autre : pas de remplissage, pas de dessus, pas de
      // largeur variable, pas d'interstices. Le flanc ne contient alors que deux
      // lignes, et son épaisseur ne dépend que d'elles.
      nombre_parois: 2, densite_remplissage: 0, couches_dessus: 0, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      parois_variables: "non", remplir_interstices: "nulle_part", couture_biseau: "non",
      // La couture au dos : les faces qu'on mesure restent nettes.
      position_couture: "arriere", arcs: "non", repassage: "non",
      compensation_contours: 0, compensation_premiere_couche: 0,
    },
    variantes: (p, r) => debitsDeLEssai(p).map((v) => ({
      // Les deux parois sont mises à la même largeur : sans cela l'épaisseur
      // mesurée mélangerait la ligne extérieure et l'intérieure, qui n'ont pas
      // la même largeur, et il n'y aurait plus rien à en tirer.
      ecarts: { rapport_debit: v, largeur_parois_interieures: r.largeur_paroi_exterieure },
      etiquette: nombreFr(v * 100, 1) + " %",
    })),
    geometrie(p, r, contexte) {
      const police = contexte.police;
      const places = grille(3, 3, p.cote + 14, 0);
      return debitsDeLEssai(p).map((v, i) => {
        const texte = nombreFr(v * 100, 1);
        return eprouvette("Débit " + texte + " %", (m) => {
          // Pleine dans le modèle, creuse à l'impression : c'est le trancheur
          // qui décide du nombre de lignes, et c'est lui qu'on mesure.
          ajouterBoite(m, 0, 0, 0, p.cote, p.cote, p.hauteur);
          // Le chiffre au dos, sur la face qu'on ne mesure pas.
          etiquetteArriere(m, police, texte, p.cote / 2, 4, 4.5, p.cote);
        }, places[i][0], places[i][1]);
      });
    },
    depouillement: {
      consigne: "Sur chaque boîte, deux cotes en X (la direction sans le chiffre gravé), à mi-hauteur : la largeur extérieure aux becs extérieurs, puis la largeur intérieure aux becs intérieurs. Serrer sans forcer, les flancs sont minces. Ne pas mesurer au ras du plateau, la première couche s'écrase. Les débits sont gravés au dos, de gauche à droite.",
      champs: [0, 1, 2].flatMap((i) => [
        { cle: "d" + i, etiquette: "Boîte " + (i + 1) + ", extérieur", unite: "mm", defaut: 30, min: 5, max: 60 },
        { cle: "i" + i, etiquette: "Boîte " + (i + 1) + ", intérieur", unite: "mm", defaut: 28.4, min: 5, max: 60 },
      ]),
      conclure(saisie, p, r) {
        const debits = debitsDeLEssai(p);
        const largeur = r.largeur_paroi_exterieure;
        const esp = espacement(largeur, r.hauteur_couche);
        const visee = sectionDeLigne(largeur, r.hauteur_couche);
        const lignes = [];
        const estimations = [];
        for (let i = 0; i < debits.length; i += 1) {
          const epaisseur = (saisie["d" + i] - saisie["i" + i]) / 2;
          // Deux lignes déposées font « largeur + espacement » : c'est la largeur
          // seule qu'on veut, on retire l'espacement, qui est une donnée du trancheur.
          const ligne = epaisseur - esp;
          lignes.push(ligne);
          if (ligne > 0.1 && ligne < 3 * largeur) {
            // Le débit est proportionnel à la matière poussée, donc à la SECTION
            // du cordon, pas à sa largeur : c'est la section qu'on met en rapport.
            estimations.push(debits[i] * visee / sectionDeLigne(ligne, r.hauteur_couche));
          }
        }
        if (estimations.length === 0) {
          return {
            reglages: {},
            texte: "Les cotes relevées ne donnent pas d'épaisseur de flanc plausible : vérifier qu'on mesure bien l'extérieur puis l'intérieur de la même boîte, dans la même direction, et refaire.",
          };
        }
        const retenu = Math.round(Math.max(0.5, Math.min(1.5, moyenne(estimations))) * 1000) / 1000;
        const dispersion = Math.max(...estimations) - Math.min(...estimations);
        return {
          reglages: { rapport_debit: retenu },
          texte: "Largeurs de ligne mesurées : " + lignes.map((v) => nombreFr(v, 3)).join(" / ") + " mm pour "
            + debits.map((v) => nombreFr(v * 100, 1)).join(" / ") + " % (visée " + nombreFr(largeur, 2) + " mm)."
            + " Chaque boîte conclut à " + estimations.map((v) => nombreFr(v * 100, 1)).join(" / ")
            + " % ; rapport de débit retenu " + nombreFr(retenu, 3) + "."
            + (dispersion > 0.03
              ? " Les trois boîtes s'écartent de " + nombreFr(dispersion * 100, 1)
                + " points : c'est beaucoup, reprendre les mesures avant de retenir."
              : " Les trois boîtes s'accordent à " + nombreFr(dispersion * 100, 1) + " point près : la mesure est bonne.")
            + (retenu < 0.9 || retenu > 1.1
              ? " Un rapport aussi éloigné de 100 % vient plutôt du diamètre du filament ou de l'extrudeur : refaire l'essai de diamètre."
              : ""),
        };
      },
    },
  },

  // ── 4. Le débit maximal ──
  {
    id: "debit_max", etage: "matiere", nom: "Débit volumétrique maximal",
    but: "Combien de matière la buse sait fondre par seconde. C'est le plafond de toutes les vitesses.",
    pourquoi: "On ne calibre pas « la vitesse de remplissage » : on calibre le débit, et le trancheur en déduit chaque vitesse, puisque largeur × hauteur × vitesse ne peut pas dépasser le débit. Un seul essai plafonne donc toutes les vitesses d'un coup. Les tours du commerce montent le débit en continu, et l'endroit où la paroi maigrit se cherche à la loupe. Ici le débit monte par PALIERS : chaque valeur tient sur une bande entière, une vingtaine de couches à l'identique, et la bande suivante change franchement. Deux tubes identiques montent côte à côte : si les deux décrochent à la même bande, c'est le débit ; si un seul décroche, c'est un accident.",
    duree: "≈ 50 min",
    parametres: [
      { cle: "depart", etiquette: "Débit de la première bande", unite: "mm³/s", defaut: 6, min: 1, max: 30, entier: true },
      { cle: "pas", etiquette: "Pas", unite: "mm³/s", defaut: 2, min: 1, max: 5, entier: true },
      { cle: "nombre", etiquette: "Nombre de bandes", defaut: 15, min: 5, max: 20, entier: true },
      { cle: "hauteur", etiquette: "Hauteur d'une bande", unite: "mm", defaut: 4, min: 2, max: 8 },
    ],
    reglages: {
      nombre_parois: 1, densite_remplissage: 0, couches_dessus: 0, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      parois_variables: "non", remplir_interstices: "partout", couture_biseau: "non",
      position_couture: "alignee", temps_couche_min: 0,
      // Le plafond est levé : c'est lui qu'on mesure, il ne peut pas se brider lui-même.
      debit_maximal: 100,
    },
    variantes: () => [
      { ecarts: {}, etiquette: "Tube A" },
      { ecarts: {}, etiquette: "Tube B" },
      // Le mât garde une vitesse raisonnable et trois parois : il porte les
      // chiffres, il n'a pas à décrocher avec les tubes.
      { ecarts: { nombre_parois: 3 }, vitesseImposee: 60, etiquette: "Mât des repères" },
    ],
    geometrie(p, r, contexte) {
      const hauteurTotale = p.nombre * p.hauteur;
      const tube = (nom, dx) => eprouvette(nom, (m) => {
        // Un tube rond : la buse ne ralentit jamais dans un coin, donc le débit
        // demandé est vraiment atteint. Plein dans le modèle, creusé à
        // l'impression : une paroi, aucun remplissage.
        prismePlein(m, cercle(0, 0, 10, 72), 0, hauteurTotale);
      }, dx, 0);
      const mat = eprouvette("Mât des repères", (m) => {
        matDesBandes(m, contexte.police, serie(p.depart, p.pas, p.nombre).map(String), {
          x0: 0, x1: 18, y: 0, epaisseur: epaisseurDeParoi(3, r.largeur_paroi_exterieure, r.hauteur_couche),
          hauteurDeBande: p.hauteur, taille: 3.2,
        });
      }, 40, 0);
      return [tube("Tube A", -40), tube("Tube B", 0), mat];
    },
    modulations(p, couches, r) {
      // Une paroi unique, à une vitesse imposée qui monte d'une bande à l'autre.
      // Le débit réellement poussé par la buse, c'est la section du cordon
      // multipliée par le rapport de débit : c'est cette section-là qu'il faut
      // inverser, sinon la graduation annonce un débit que la buse ne voit jamais.
      const section = sectionDeLigne(r.largeur_paroi_exterieure, r.hauteur_couche) * r.rapport_debit;
      const valeurs = serie(p.depart, p.pas, p.nombre);
      return couchesDesBandes(couches, p.hauteur, p.nombre).map((couche, i) => ({
        couche,
        vitesseImposee: valeurs[i] / section,
        etiquette: valeurs[i] + " mm³/s, soit " + Math.round(valeurs[i] / section) + " mm/s",
      }));
    },
    depouillement: {
      consigne: "Chercher, en montant, la bande où la paroi cesse d'être pleine : elle perd son brillant, devient translucide, puis se troue. Les débits sont gravés sur le mât, en face de chaque bande. Répondre pour chacun des deux tubes.",
      champsDeChoix: (p) => {
        const options = serie(p.depart, p.pas, p.nombre)
          .map((d, i) => ({ valeur: i, etiquette: d + " mm³/s" }))
          .reverse();
        const aucune = { valeur: -1, etiquette: "Aucune : maigre dès la première" };
        return [
          { cle: "tubeA", etiquette: "Tube A · dernière bande pleine", options: [...options, aucune] },
          { cle: "tubeB", etiquette: "Tube B · dernière bande pleine", options: [...options, aucune] },
        ];
      },
      conclure(saisie, p, r) {
        const valeurs = serie(p.depart, p.pas, p.nombre);
        const a = saisie.tubeA ?? valeurs.length - 1;
        const b = saisie.tubeB ?? valeurs.length - 1;
        if (a === -1 || b === -1) {
          return {
            reglages: {},
            texte: "Un tube au moins est maigre dès la première bande (" + p.depart
              + " mm³/s) : ce n'est pas le débit maximal qui est en cause mais le rapport de débit ou la température. Les reprendre avant de revenir ici.",
          };
        }
        // Le plus prudent des deux tubes décide : un tube qui tient plus haut que
        // l'autre a eu de la chance, il ne prouve rien.
        const atteint = Math.min(valeurs[a], valeurs[b]);
        const retenu = Math.round(atteint * 0.9 * 10) / 10;
        const section = sectionDeLigne(r.largeur_paroi_exterieure, r.hauteur_couche) * r.rapport_debit;
        return {
          reglages: { debit_maximal: retenu },
          texte: "Tube A plein jusqu'à " + valeurs[a] + " mm³/s, tube B jusqu'à " + valeurs[b]
            + " mm³/s. Retenu " + nombreFr(retenu, 1) + " mm³/s, avec 10 % de marge : on ne travaille jamais au ras du décrochage."
            + (a !== b ? " Les deux tubes ne sont pas d'accord : c'est le plus bas qui compte." : "")
            + " Les vitesses en découlent : une ligne de " + nombreFr(r.largeur_paroi_exterieure, 2) + " × "
            + nombreFr(r.hauteur_couche, 2) + " mm ne dépassera plus " + Math.round(retenu / section) + " mm/s."
            + (valeurs[a] === valeurs.at(-1) && valeurs[b] === valeurs.at(-1)
              ? " Les deux tubes ont tenu jusqu'à la dernière bande : la limite est plus haut, relancer l'essai en partant de là."
              : ""),
        };
      },
    },
  },

  // ── 5. L'avance de pression ──
  {
    id: "pression", etage: "matiere", nom: "Avance de pression",
    but: "Le coin qui gonfle à l'arrivée et le début de ligne qui manque de matière.",
    pourquoi: "La matière fondue est un ressort : quand la tête freine, l'extrudeur a de l'avance et continue de pousser. Le coefficient K dit de combien anticiper. Il dépend du débit et de la température, donc il vient après eux — et après le débit maximal, qui dit à quelle vitesse on a le droit de le mettre à l'épreuve. Son défaut est de ne rien montrer à vitesse douce : l'erreur de pression est proportionnelle au saut de vitesse, et un coin pris à 60 mm/s n'en fait aucun. L'éprouvette est donc imprimée à deux vitesses, une tour chacune, le plus vite possible, sur quatre formes de coins : droit, à 45°, à 60°, et rapprochés. Les deux tours doivent conclure au même K — si elles ne le font pas, c'est que le décrochage vient d'ailleurs.",
    duree: "≈ 40 min",
    parametres: [
      { cle: "depart", etiquette: "Première bande (K)", defaut: 0, min: 0, max: 0.2, pasFixe: 0.005, decimales: 3 },
      { cle: "pas", etiquette: "Pas (K)", defaut: 0.005, min: 0.002, max: 0.05, pasFixe: 0.001, decimales: 3 },
      { cle: "nombre", etiquette: "Nombre de bandes", defaut: 10, min: 4, max: 14, entier: true },
      { cle: "hauteur", etiquette: "Hauteur d'une bande", unite: "mm", defaut: 4, min: 2, max: 10 },
      // Les deux vitesses suivent le plafond du débit maximal : demander 300 mm/s
      // à une buse qui n'en délivre que 159 ne donnerait pas deux vitesses mais
      // deux fois la même, et l'essai perdrait son second axe.
      {
        cle: "vitesseBasse", etiquette: "Vitesse de la tour A", unite: "mm/s",
        defaut: (r) => Math.round(plafondDeVitesse(r) / 2), min: 40, max: 600, entier: true,
      },
      {
        cle: "vitesseHaute", etiquette: "Vitesse de la tour B", unite: "mm/s",
        defaut: (r) => Math.round(plafondDeVitesse(r)), min: 40, max: 600, entier: true,
      },
    ],
    reglages: {
      nombre_parois: 1, densite_remplissage: 0, couches_dessus: 0, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      parois_variables: "non", remplir_interstices: "partout", couture_biseau: "non",
      position_couture: "alignee", temps_couche_min: 0,
      // Les arcs arrondiraient les coins : c'est précisément eux qu'on juge.
      arcs: "non",
    },
    variantes: (p) => [p.vitesseBasse, p.vitesseHaute].map((v, i) => ({
      // La vitesse entre dans le tranchage, pas seulement dans le G-code : les
      // parois de cette tour sont calculées à cette vitesse-là.
      ecarts: { vitesse_paroi_exterieure: v, vitesse_interstices: Math.min(v, 150) },
      etiquette: "Tour " + "AB"[i] + " · " + v + " mm/s",
    })),
    geometrie(p, r, contexte) {
      const police = contexte.police;
      const hauteurTotale = p.nombre * p.hauteur;
      const valeurs = serie(p.depart, p.pas, p.nombre).map((k) => nombreFr(k, 3));
      const places = grille(2, 2, 118, 0);
      return [p.vitesseBasse, p.vitesseHaute].map((v, i) => eprouvette("Tour " + "AB"[i] + " · " + v + " mm/s", (m) => {
        // Quatre sortes de coins, et rien que des parois : la tour monte vite et
        // chaque coin est vu dix fois, une par bande. Les formes sont pleines
        // dans le modèle, le trancheur les creuse (une paroi, aucun remplissage).
        prismePlein(m, rectangle(0, 0, 22, 22), 0, hauteurTotale);
        prismePlein(m, decale(tourne(rectangle(-8, -8, 8, 8), 45), 36, 11), 0, hauteurTotale);
        prismePlein(m, triangleEquilateral(60, 11, 13), 0, hauteurTotale);
        prismePlein(m, rectangle(76, 6, 85, 15), 0, hauteurTotale);
        matDesBandes(m, police, valeurs, {
          x0: 90, x1: 106, y: 9, epaisseur: epaisseurDeParoi(1, r.largeur_paroi_exterieure, r.hauteur_couche),
          hauteurDeBande: p.hauteur, taille: 3,
        });
      }, places[i][0], places[i][1]));
    },
    modulations(p, couches) {
      const valeurs = serie(p.depart, p.pas, p.nombre);
      return couchesDesBandes(couches, p.hauteur, p.nombre).map((couche, i) => ({
        couche,
        reglages: { pression_avance: valeurs[i] },
        gcode: ["M900 K" + valeurs[i].toFixed(4)],
        etiquette: "K " + nombreFr(valeurs[i], 3),
      }));
    },
    depouillement: {
      consigne: "Regarder les coins de profil, en lumière rasante, sur les quatre formes de chaque tour. Trop peu de K : le coin gonfle et la ligne juste après est maigre. Trop de K : le coin se creuse et un point de matière apparaît un peu plus loin. Retenir, pour chaque tour, la bande dont les coins sont les plus droits sur les quatre formes à la fois.",
      champsDeChoix: (p) => {
        const options = serie(p.depart, p.pas, p.nombre)
          .map((k, i) => ({ valeur: i, etiquette: "K " + nombreFr(k, 3) }));
        return [
          { cle: "basse", etiquette: "Tour A (" + p.vitesseBasse + " mm/s)", options },
          { cle: "haute", etiquette: "Tour B (" + p.vitesseHaute + " mm/s)", options },
        ];
      },
      conclure(saisie, p) {
        const valeurs = serie(p.depart, p.pas, p.nombre);
        const a = valeurs[saisie.basse ?? 0];
        const b = valeurs[saisie.haute ?? 0];
        if (a === b) {
          return {
            reglages: { pression_avance: a },
            texte: "Les deux tours concluent au même K = " + nombreFr(a, 3) + " : la valeur est sûre.",
          };
        }
        // Deux vitesses qui ne s'accordent pas : la moyenne, ramenée sur un cran
        // de la série, et on le dit.
        const vise = (a + b) / 2;
        const retenu = valeurs.reduce((x, y) => (Math.abs(y - vise) <= Math.abs(x - vise) ? y : x));
        return {
          reglages: { pression_avance: retenu },
          texte: "La tour A conclut K = " + nombreFr(a, 3) + " et la tour B K = " + nombreFr(b, 3)
            + " : elles ne s'accordent pas. K retenu à " + nombreFr(retenu, 3)
            + ", entre les deux. Un écart de plus de deux crans vient d'ailleurs : reprendre le débit,"
            + " puis refaire cet essai avec un pas plus fin.",
        };
      },
    },
  },

  // ── 6. La rétraction ──
  {
    id: "retraction", etage: "matiere", nom: "Rétraction",
    but: "Les fils tirés entre deux pièces, et les trous au redémarrage.",
    pourquoi: "Après la température : c'est elle la première responsable des fils. Une rétraction trop courte laisse filer ; trop longue, elle creuse le début de la ligne suivante et finit par ronger le filament. Le piège de cet essai est qu'il ne prouve rien quand rien ne file : à 300 mm/s un saut de 40 mm dure 130 ms, et il ne suinte rien en 130 ms. La vitesse du saut est donc réglable, et on la baisse jusqu'à faire apparaître les fils : ce qui ne file pas à 60 mm/s ne filera pas en production. Second piège : longueur et vitesse de rétraction sont liées, et les essayer l'une après l'autre demande deux impressions. Ici les deux varient ensemble — trois tours, une vitesse chacune, et six longueurs en bandes : dix-huit essais dans une impression.",
    duree: "≈ 1 h",
    parametres: [
      { cle: "depart", etiquette: "Première bande", unite: "mm", defaut: 0, min: 0, max: 5, pasFixe: 0.1, decimales: 2 },
      { cle: "pas", etiquette: "Pas", unite: "mm", defaut: 0.3, min: 0.05, max: 1, pasFixe: 0.05, decimales: 2 },
      { cle: "nombre", etiquette: "Nombre de bandes", defaut: 6, min: 3, max: 8, entier: true },
      { cle: "hauteur", etiquette: "Hauteur d'une bande", unite: "mm", defaut: 6, min: 4, max: 12 },
      { cle: "ecart", etiquette: "Écart entre les piliers", unite: "mm", defaut: 40, min: 20, max: 70, entier: true },
      { cle: "vitesseSaut", etiquette: "Vitesse du saut", unite: "mm/s", defaut: 60, min: 15, max: 400, entier: true },
      { cle: "vitesseA", etiquette: "Vitesse de rétraction, tour A", unite: "mm/s", defaut: 20, min: 5, max: 80, entier: true },
      { cle: "vitesseB", etiquette: "Vitesse de rétraction, tour B", unite: "mm/s", defaut: 35, min: 5, max: 80, entier: true },
      { cle: "vitesseC", etiquette: "Vitesse de rétraction, tour C", unite: "mm/s", defaut: 50, min: 5, max: 80, entier: true },
    ],
    // La vitesse de déplacement de l'essai remplace celle de l'imprimante : c'est
    // elle qui décide du temps passé en l'air, donc de ce qui a le temps de suinter.
    reglagesDe: (p) => ({
      nombre_parois: 2, densite_remplissage: 0, couches_dessus: 0, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      remplir_interstices: "partout", couture_biseau: "non", position_couture: "alignee",
      deplacement_sans_retraction: 1, vitesse_deplacement: p.vitesseSaut, temps_couche_min: 0,
    }),
    variantes: (p) => vitessesDeRetraction(p).map((v, i) => ({
      ecarts: { vitesse_retraction: v },
      etiquette: "Tour " + "ABC"[i] + " · rétraction à " + v + " mm/s",
    })),
    geometrie(p, r, contexte) {
      const police = contexte.police;
      const hauteurTotale = p.nombre * p.hauteur;
      const valeurs = serie(p.depart, p.pas, p.nombre).map((v) => nombreFr(v, 2));
      const cote = 7;
      const milieu = cote / 2;
      const largeurTotale = 3 * p.ecart + cote;
      return vitessesDeRetraction(p).map((v, i) => eprouvette("Tour " + "ABC"[i] + " · " + v + " mm/s", (m) => {
        // Quatre piliers éloignés : à chaque couche la buse traverse le vide six
        // fois. Le carré, le rond, la pointe et la lame mince ne filent pas
        // pareil, et la couture étant alignée, les redémarrages forment une
        // colonne qui se lit d'un coup.
        ajouterBoite(m, 0, 0, 0, cote, cote, hauteurTotale);
        const rond = cercle(p.ecart + milieu, milieu, 3.5, 32);
        ajouterTronc(m, rond, rond, 0, hauteurTotale);
        ajouterTronc(m, cercle(2 * p.ecart + milieu, milieu, 3, 24), cercle(2 * p.ecart + milieu, milieu, 0.8, 24), 0, hauteurTotale);
        ajouterBoite(m, 3 * p.ecart + 2.5, 0, 0, 3 * p.ecart + 4.5, cote, hauteurTotale);
        // Un socle mince les relie : une seule pièce à garder, et pas de bascule.
        ajouterBoite(m, 0, 0, 0, largeurTotale, cote, SOCLE_MM);
        matDesBandes(m, police, valeurs, {
          x0: -18, x1: -4, y: 2.5, epaisseur: epaisseurDeParoi(2, r.largeur_paroi_exterieure, r.hauteur_couche),
          hauteurDeBande: p.hauteur, taille: 3.2,
        });
      }, 0, (1 - i) * 34));
    },
    modulations(p, couches) {
      const valeurs = serie(p.depart, p.pas, p.nombre);
      return couchesDesBandes(couches, p.hauteur, p.nombre).map((couche, i) => ({
        couche,
        reglages: { longueur_retraction: valeurs[i] },
        etiquette: "Longueur " + nombreFr(valeurs[i], 2) + " mm",
      }));
    },
    depouillement: {
      consigne: "Trois tours, une vitesse de rétraction chacune, gravée sur son mât. Pour chaque tour : la première bande, en montant, qui ne tire plus aucun fil entre les quatre piliers. Puis, sur n'importe quelle tour, la colonne des redémarrages du pilier carré, en lumière rasante : la dernière bande dont le départ de ligne est franc, avant que la colonne ne se creuse.",
      champsDeChoix: (p) => {
        const bandes = serie(p.depart, p.pas, p.nombre)
          .map((v, i) => ({ valeur: i, etiquette: "Bande " + (i + 1) + " · " + nombreFr(v, 2) + " mm" }));
        const aucune = { valeur: -1, etiquette: "Aucune : des fils partout" };
        return [
          ...vitessesDeRetraction(p).map((v, i) => ({
            cle: "tour" + i,
            etiquette: "Tour " + "ABC"[i] + " (" + v + " mm/s) · première bande sans fil",
            options: [...bandes, aucune],
          })),
          {
            cle: "redemarrage", etiquette: "Dernière bande qui redémarre net",
            // La dernière d'abord : « toutes franches » est le cas courant, il doit être le défaut.
            options: [...bandes].reverse().concat([{ valeur: -2, etiquette: "Aucune : creux dès la première" }]),
          },
        ];
      },
      conclure(saisie, p) {
        const valeurs = serie(p.depart, p.pas, p.nombre);
        const vitesses = vitessesDeRetraction(p);
        const dit = (v) => nombreFr(v, 2) + " mm";
        const lus = vitesses.map((v, i) => ({ vitesse: v, bande: saisie["tour" + i] ?? 0 }));
        const utiles = lus.filter((l) => l.bande >= 0);
        const iRedemarrage = saisie.redemarrage ?? p.nombre - 1;

        if (utiles.length === 0) {
          return {
            reglages: {},
            texte: "Des fils sur les trois tours, à toutes les longueurs : allonger la rétraction n'y changera plus rien. Sécher le filament, redescendre la température vers le bord froid, puis refaire l'essai.",
          };
        }
        if (iRedemarrage === -2) {
          return {
            reglages: {},
            texte: "Aucune bande ne redémarre franchement, pas même la plus courte : le défaut vient du débit ou de l'avance de pression, pas de la rétraction.",
          };
        }
        // La meilleure vitesse est celle qui demande la longueur la plus courte ;
        // à égalité, la plus lente, qui use moins le filament.
        const meilleur = utiles.reduce((a, b) => (b.bande < a.bande || (b.bande === a.bande && b.vitesse < a.vitesse) ? b : a));
        const bas = valeurs[meilleur.bande];
        const haut = valeurs[iRedemarrage];
        if (haut < bas) {
          return {
            reglages: {},
            texte: "Fenêtre vide : il faut " + dit(bas) + " pour ne plus filer, mais au-delà de " + dit(haut)
              + " le redémarrage se creuse. Redescendre la température avant de revenir ici.",
          };
        }
        const accord = utiles.every((l) => l.bande === utiles[0].bande);
        if (meilleur.bande === 0) {
          // Rien n'a filé, pas même sans rétraction : le critère n'a rien
          // départagé. On se place au milieu de la fenêtre connue plutôt que de
          // retenir une valeur qu'aucun examen n'a validée.
          const vise = (bas + haut) / 2;
          const retenu = valeurs.reduce((a, b) => (Math.abs(b - vise) <= Math.abs(a - vise) ? b : a));
          return {
            reglages: { longueur_retraction: retenu, vitesse_retraction: meilleur.vitesse },
            texte: "Aucune bande n'a filé, pas même " + dit(bas) + " : le critère n'a rien départagé. Longueur posée à "
              + dit(retenu) + ", au milieu de la fenêtre " + dit(bas) + " à " + dit(haut) + ", vitesse à "
              + meilleur.vitesse + " mm/s. Pour que l'essai tranche, le relancer avec une vitesse du saut plus basse : c'est le temps passé en l'air qui fait les fils.",
          };
        }
        return {
          reglages: { longueur_retraction: bas, vitesse_retraction: meilleur.vitesse },
          texte: "Rétraction de " + dit(bas) + " à " + meilleur.vitesse + " mm/s : c'est la combinaison qui cesse de filer avec le moins de matière rappelée. Le redémarrage reste franc jusqu'à "
            + dit(haut) + "."
            + (accord
              ? " Les trois vitesses cessent de filer à la même longueur : la vitesse de rétraction ne change rien ici, garder la plus lente."
              : " Les trois tours ne cessent pas de filer à la même longueur : c'est bien la vitesse qui compte, celle retenue est la plus économe."),
        };
      },
    },
  },

  // ── 7. L'écrasement de la première couche ──
  {
    id: "premiere_couche", etage: "plaque", nom: "Écrasement de la première couche",
    but: "La hauteur exacte à laquelle la buse doit poser la première couche SUR CETTE PLAQUE.",
    pourquoi: "Deux plaques n'ont ni la même épaisseur ni le même relief, et le palpeur ne touche pas la surface qui reçoit la matière : sur une plaque texturée, il touche le sommet des grains. D'où un décalage Z propre à chaque plaque — c'est le seul réglage que la plaque décide vraiment, et c'est pour cela qu'il faut refaire cet essai à chaque plaque, sans rien refaire d'autre. Aucun essai ne montre mieux sa limite que celui-là, à condition de la franchir : les plaquettes vont de trop écrasé (translucide, débordant, impossible à décoller) à pas assez (sillons entre les lignes, coins qui se soulèvent), et le bon décalage est celui du milieu. Chaque décalage est imprimé deux fois, à deux vitesses : la rangée rapide dit du même coup jusqu'où on peut pousser la première couche.",
    duree: "≈ 15 min",
    parametres: [
      { cle: "depart", etiquette: "Décalage de la première plaquette", unite: "mm", defaut: -0.09, min: -0.3, max: 0, pasFixe: 0.01, decimales: 3 },
      { cle: "pas", etiquette: "Pas", unite: "mm", defaut: 0.03, min: 0.01, max: 0.06, pasFixe: 0.01, decimales: 3 },
      { cle: "nombre", etiquette: "Nombre de plaquettes", defaut: 7, min: 3, max: 11, entier: true },
      { cle: "cote", etiquette: "Côté d'une plaquette", unite: "mm", defaut: 20, min: 12, max: 30, entier: true },
      { cle: "vitesseLente", etiquette: "Vitesse de la rangée avant", unite: "mm/s", defaut: 50, min: 10, max: 200, entier: true },
      { cle: "vitesseRapide", etiquette: "Vitesse de la rangée arrière", unite: "mm/s", defaut: 100, min: 10, max: 300, entier: true },
    ],
    reglages: {
      nombre_parois: 2, couches_dessus: 1, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      densite_remplissage: 100,
      motif_dessous: "monotone", couture_biseau: "non", arcs: "non", temps_couche_min: 0,
      // Les deux compensations sont mises à zéro : ce sont les bords des
      // plaquettes qu'on juge, une rentrée les fausserait. Et le décalage lu est
      // alors absolu, pas relatif à ce que la plaque portait déjà.
      compensation_premiere_couche: 0, compensation_contours: 0, decalage_z_plaque: 0,
      largeur_bordure: 0, tours_jupe: 1,
    },
    variantes(p) {
      const decalages = decalagesDeLEssai(p);
      return [p.vitesseLente, p.vitesseRapide].flatMap((v, rang) => decalages.map((z) => ({
        ecarts: { vitesse_premiere_couche: v },
        decalageZ: z,
        etiquette: (rang === 0 ? "Avant" : "Arrière") + " · Z " + nombreFr(z, 3) + " mm à " + v + " mm/s",
      })));
    },
    geometrie(p, r, contexte) {
      const police = contexte.police;
      const decalages = decalagesDeLEssai(p);
      const languette = 8;
      const pasX = p.cote + 6;
      const pasY = p.cote + languette + 6;
      // Une plaquette fait exactement une couche : c'est la seule façon de voir
      // la première couche par-dessus. Le chiffre, lui, est en relief sur une
      // languette posée devant, hors de la surface jugée.
      const epaisseur = r.hauteur_premiere_couche;
      return [p.vitesseLente, p.vitesseRapide].flatMap((v, rang) => decalages.map((z, i) => eprouvette(
        "Z " + nombreFr(z, 3) + " mm · " + v + " mm/s",
        (m) => {
          ajouterBoite(m, 0, 0, 0, p.cote, p.cote, epaisseur);
          ajouterBoite(m, 0, -languette, 0, p.cote, 0, epaisseur);
          etiquetteDessus(m, police, nombreFr(z * 100, 0), p.cote / 2, -languette + 2, 4, epaisseur);
        },
        (i - (decalages.length - 1) / 2) * pasX,
        (rang === 0 ? -1 : 1) * pasY / 2,
      )));
    },
    depouillement: {
      consigne: "Les décalages sont gravés en centièmes de millimètre devant chaque plaquette (« -12 » vaut -0,12 mm), les mêmes sur les deux rangées ; la rangée avant est imprimée lentement, celle du fond vite. En lumière rasante, sur la rangée avant : les plaquettes trop écrasées sont translucides, leur bord fait un bourrelet et la matière a été poussée entre les lignes ; les plaquettes pas assez écrasées laissent voir des sillons, et leurs coins se décollent à l'ongle. Les deux lectures se font en montant, du plus écrasé au moins écrasé.",
      champsDeChoix: (p) => {
        const options = decalagesDeLEssai(p)
          .map((z, i) => ({ valeur: i, etiquette: nombreFr(z, 3) + " mm" }));
        return [
          {
            cle: "bourrelet", etiquette: "Dernière plaquette à bourrelet",
            options: [...options].reverse().concat([{ valeur: -1, etiquette: "Aucune" }]),
          },
          {
            cle: "sillons", etiquette: "Première plaquette à sillons",
            options: [...options, { valeur: -1, etiquette: "Aucune" }],
          },
          {
            cle: "rapide", etiquette: "La rangée du fond est aussi bien collée",
            options: [{ valeur: 1, etiquette: "Oui" }, { valeur: 0, etiquette: "Non" }],
          },
        ];
      },
      conclure(saisie, p) {
        const decalages = decalagesDeLEssai(p);
        const dernier = decalages.length - 1;
        // La fenêtre est OUVERTE : la plaquette à bourrelet et celle à sillons
        // sont toutes deux ratées, le bon décalage est strictement entre elles.
        const bas = (saisie.bourrelet ?? -1) === -1 ? 0 : Math.min(dernier, saisie.bourrelet + 1);
        const haut = (saisie.sillons ?? -1) === -1 ? dernier : Math.max(0, saisie.sillons - 1);
        const vitesse = (saisie.rapide ?? 1) === 1 ? p.vitesseRapide : p.vitesseLente;
        if (bas > haut) {
          return {
            reglages: {},
            texte: "Fenêtre vide : la plaquette " + nombreFr(decalages[saisie.sillons], 3)
              + " mm montre déjà des sillons alors que " + nombreFr(decalages[saisie.bourrelet], 3)
              + " mm bave encore. Relancer avec un pas deux fois plus fin autour de "
              + nombreFr((decalages[saisie.bourrelet] + decalages[saisie.sillons]) / 2, 3) + " mm.",
          };
        }
        const retenu = decalages[Math.round((bas + haut) / 2)];
        const large = haut - bas;
        return {
          reglages: { decalage_z_plaque: retenu, vitesse_premiere_couche: vitesse },
          texte: "Plaquettes réussies de " + nombreFr(decalages[bas], 3) + " à " + nombreFr(decalages[haut], 3)
            + " mm : décalage Z de la plaque retenu à " + nombreFr(retenu, 3) + " mm, au milieu de la fenêtre."
            + " Première couche à " + vitesse + " mm/s."
            + (large === 0
              ? " Une seule plaquette réussie : la fenêtre est étroite, relancer avec un pas plus fin pour la retrouver plus sûrement."
              : " La fenêtre couvre " + (large + 1) + " plaquettes : la valeur est confortable.")
            + (bas === 0 ? " Aucune plaquette n'a fait de bourrelet : la vraie limite basse est plus bas, relancer en partant plus négatif si l'on veut la connaître." : "")
            + (haut === dernier ? " Aucune plaquette n'a montré de sillons : la limite haute est au-delà de la série." : "")
            + " Ce décalage ne vaut que pour cette plaque : le refaire à chaque plaque, sans refaire les essais de bobine.",
        };
      },
    },
  },

  // ── 8. Les cotes ──
  {
    id: "cotes", etage: "reglages", nom: "Cotes et compensations",
    but: "Une pièce de 30 mm qui mesure 30 mm, un trou de 20 mm qui en fait 20, un pied qui n'est pas plus large que le corps.",
    pourquoi: "Trois erreurs différentes se superposent, et il faut trois corrections différentes : la ligne extérieure déborde vers le dehors (compensation des contours), la matière se contracte vers l'intérieur d'une courbe, donc un trou sort toujours trop petit (compensation des trous), et la première couche s'écrase en galette (patte d'éléphant). Les corriger d'un même décalage ne corrigerait rien. L'essai les sépare, et il les MESURE : deux blocs, un cylindre et deux trous, relevés au pied à coulisse, chaque cote deux fois. Ce qu'il ne fait pas : dire quel jeu laisser entre deux pièces qui s'emboîtent. C'est une information de dessin, elle ne règle aucun réglage du trancheur, elle n'a rien à faire ici.",
    duree: "≈ 30 min",
    parametres: [],
    reglages: {
      nombre_parois: 3, densite_remplissage: 25, couches_dessus: 4, couches_dessous: 3,
      couture_biseau: "non", repassage: "non", position_couture: "arriere",
      // Les trois compensations à zéro : ce qu'on mesure est alors l'erreur
      // brute, et la conclusion donne des valeurs absolues, pas des retouches.
      compensation_contours: 0, compensation_trous: 0, compensation_premiere_couche: 0,
    },
    geometrie(_p, _r, contexte) {
      const police = contexte.police;
      const bloc = (nom, dx) => eprouvette(nom, (m) => {
        ajouterBoite(m, 0, 0, 0, 30, 30, 10);
        etiquetteDessus(m, police, "30", 15, 12, 5, 10);
      }, dx, 0);
      const cylindre = eprouvette("Cylindre 20", (m) => {
        const rond = cercle(0, 0, 10, 64);
        ajouterTronc(m, rond, rond, 0, 10);
        etiquetteDessus(m, police, "20", 0, -2.5, 4, 10);
      }, 8, 0);
      const perce = eprouvette("Plaque à deux trous", (m) => {
        ajouterPlaqueTrouee(m, [
          rectangle(0, 0, 62, 32),
          cercle(16, 16, 10, 64),
          cercle(46, 16, 10, 64),
        ], 0, 5);
        etiquetteDessus(m, police, "20", 31, 2, 4, 5);
      }, 55, 0);
      // Chaque pièce touche le plateau par elle-même : un socle commun
      // empêcherait de mesurer la patte d'éléphant au ras de la première couche.
      return [bloc("Bloc A 30", -62), bloc("Bloc B 30", -24), cylindre, perce];
    },
    depouillement: {
      consigne: "Cinq cotes à mi-hauteur, une au ras du plateau, deux dans les trous. À mi-hauteur : le bloc A en X puis en Y, le bloc B en X puis en Y, le cylindre. Au ras du plateau : le bloc A en X, mors posés sur le plateau. Les deux trous : au pied à coulisse, becs intérieurs, en croisant deux directions et en gardant la plus grande valeur.",
      champs: [
        { cle: "aX", etiquette: "Bloc A, X à mi-hauteur", unite: "mm", defaut: 30, min: 25, max: 35 },
        { cle: "aY", etiquette: "Bloc A, Y à mi-hauteur", unite: "mm", defaut: 30, min: 25, max: 35 },
        { cle: "aBase", etiquette: "Bloc A, X au ras du plateau", unite: "mm", defaut: 30, min: 25, max: 35 },
        { cle: "bX", etiquette: "Bloc B, X à mi-hauteur", unite: "mm", defaut: 30, min: 25, max: 35 },
        { cle: "bY", etiquette: "Bloc B, Y à mi-hauteur", unite: "mm", defaut: 30, min: 25, max: 35 },
        { cle: "cylindre", etiquette: "Cylindre, diamètre", unite: "mm", defaut: 20, min: 15, max: 25 },
        { cle: "trou1", etiquette: "Trou 1, diamètre", unite: "mm", defaut: 20, min: 15, max: 25 },
        { cle: "trou2", etiquette: "Trou 2, diamètre", unite: "mm", defaut: 20, min: 15, max: 25 },
      ],
      conclure(saisie) {
        // Un décalage de d change une cote de 2 d : la correction vaut la moitié
        // de l'écart. Les plats et le rond comptent pour moitié chacun : une
        // seule valeur sert aux deux, autant qu'elle ne favorise ni l'un ni l'autre.
        const plats = moyenne([saisie.aX, saisie.aY, saisie.bX, saisie.bY]);
        const ecartPlat = plats - 30;
        const ecartRond = saisie.cylindre - 20;
        const contours = -(ecartPlat + ecartRond) / 4;
        const ecartTrou = moyenne([saisie.trou1, saisie.trou2]) - 20;
        const trous = -ecartTrou;
        const debord = Math.max(0, (saisie.aBase - saisie.aX) / 2);
        const dispersion = Math.max(saisie.aX, saisie.aY, saisie.bX, saisie.bY) - Math.min(saisie.aX, saisie.aY, saisie.bX, saisie.bY);
        return {
          reglages: {
            compensation_contours: Math.round(contours * 1000) / 1000,
            compensation_trous: Math.round(Math.max(-0.5, Math.min(0.5, trous)) * 1000) / 1000,
            compensation_premiere_couche: Math.round(Math.min(0.5, debord) * 1000) / 1000,
          },
          texte: "Contours : " + nombreFr(ecartPlat, 3) + " mm d'erreur sur les plats, " + nombreFr(ecartRond, 3)
            + " mm sur le rond, compensation " + nombreFr(contours, 3) + " mm. "
            + "Trous : " + nombreFr(ecartTrou, 3) + " mm d'erreur, compensation " + nombreFr(trous, 3) + " mm. "
            + "Patte d'éléphant : " + nombreFr(debord, 3) + " mm par côté, compensation " + nombreFr(debord, 3) + " mm."
            + (dispersion > 0.1
              ? " Les quatre cotes des deux blocs se dispersent de " + nombreFr(dispersion, 3)
                + " mm : c'est plus que l'erreur qu'on corrige. Reprendre les mesures, et si la dispersion persiste, l'essai de vitesse (la machine vibre)."
              : "")
            + (Math.abs(ecartPlat) > 0.3 ? " Un écart aussi grand vient plutôt du débit : le recalibrer d'abord." : ""),
        };
      },
    },
  },

  // ── 9. Les surplombs et les ponts ──
  {
    id: "surplombs", etage: "reglages", nom: "Surplombs et ponts",
    but: "Jusqu'à quelle pente la matière tient sans support, par quel procédé, et jusqu'à quelle portée une ligne tient toute seule.",
    pourquoi: "Ce n'est pas seulement une valeur, c'est un procédé : les quatre stratégies du trancheur ne traitent pas le débord de la même façon, et rien ne dit laquelle gagne sur cette machine avec cette matière. Les comparer demandait autrefois quatre impressions, et comparer de mémoire quatre pièces sorties à des heures différentes ne prouve rien. Ici les quatre peignes sont sur le même plateau, tranchés chacun avec sa stratégie, imprimés dans la même minute. Chaque angle est présenté trois fois — deux fins planes et un poteau rond — et la série monte jusqu'à 72°, où tout doit rater : une série où tout réussit ne dit pas où est la limite. Les ponts sont du même voyage : ils dépendent des mêmes réglages de vitesse et de ventilation, mais de la portée et non de la pente, d'où l'échelle de travées à côté, chaque portée doublée.",
    duree: "≈ 1 h 15",
    parametres: [
      { cle: "hauteur", etiquette: "Hauteur des fins", unite: "mm", defaut: 10, min: 6, max: 20 },
      { cle: "hauteurPile", etiquette: "Hauteur des piles", unite: "mm", defaut: 8, min: 5, max: 20 },
    ],
    reglages: {
      nombre_parois: 2, densite_remplissage: 15, couches_dessus: 3, couches_dessous: 3,
      couture_biseau: "non", position_couture: "arriere",
    },
    variantes: () => [
      ...STRATEGIES_DE_SURPLOMB.map((s) => ({
        // La stratégie entre dans le TRANCHAGE : c'est lui qui classe les
        // débords et leur donne leur vitesse. Une variante de pièce est tranchée
        // avec ses propres réglages, c'est ce qui rend la comparaison possible.
        ecarts: { strategie_surplomb: s.valeur },
        etiquette: "Peigne · " + s.etiquette,
      })),
      { ecarts: {}, etiquette: "Échelle des ponts" },
    ],
    geometrie(p, _r, contexte) {
      const police = contexte.police;
      const largeurFin = 4;
      const pas = 7;
      const nombre = ANGLES_DE_SURPLOMB.length * REPETITIONS_DE_SURPLOMB;
      const total = nombre * pas - (pas - largeurFin);
      // Deux rangées de peignes à l'avant, l'échelle des ponts derrière : le
      // tout recalé pour rester dans les 256 mm du plateau.
      const places = grille(4, 2, total + 8, 50).map(([x, y]) => [x, y - 41]);

      const peigne = (strategie, i) => eprouvette("Peigne · " + strategie.etiquette, (m) => {
        ajouterBoite(m, 0, -7, 0, total, 4, 3);
        ANGLES_DE_SURPLOMB.forEach((angle, a) => {
          const debord = p.hauteur * Math.tan((angle * Math.PI) / 180);
          for (let j = 0; j < REPETITIONS_DE_SURPLOMB; j += 1) {
            const x0 = (a * REPETITIONS_DE_SURPLOMB + j) * pas;
            if (j < REPETITIONS_DE_SURPLOMB - 1) {
              // Une fin plane : c'est elle qui décide.
              const bas = rectangle(x0, 0, x0 + largeurFin, 3);
              ajouterTronc(m, bas, decale(bas, 0, debord), 3, 3 + p.hauteur);
            } else {
              // Un poteau rond penché du même angle : une paroi courbe ne se
              // retrousse pas comme une paroi plane, et c'est le cas le plus courant.
              const rond = cercle(x0 + largeurFin / 2, 1.5, 1.7, 24);
              ajouterTronc(m, rond, decale(rond, 0, debord), 3, 3 + p.hauteur);
            }
          }
          const centre = (a * REPETITIONS_DE_SURPLOMB + (REPETITIONS_DE_SURPLOMB - 1) / 2) * pas + largeurFin / 2;
          etiquetteDessus(m, police, String(angle), centre, -5.5, 3.6, 3);
        });
      }, places[i][0], places[i][1]);

      const profondeur = 10;
      const ecartY = 6;
      const echelle = eprouvette("Échelle des ponts", (m) => {
        const hp = p.hauteurPile;
        PORTEES_DE_PONT.forEach((portee, i) => {
          const y0 = i * (profondeur + ecartY);
          const y1 = y0 + profondeur;
          // Chaque portée deux fois, côte à côte : un pont qui pend une fois sur
          // deux n'est pas une limite, c'est un accident.
          for (let j = 0; j < 2; j += 1) {
            const x0 = j * (portee + 22);
            ajouterBoite(m, x0, y0, 0, x0 + 8, y1, hp);
            ajouterBoite(m, x0 + 8 + portee, y0, 0, x0 + 16 + portee, y1, hp);
            // Le tablier : deux couches pleines tendues, puis un dessus par-dessus,
            // pour voir aussi ce que le pont laisse à la surface visible.
            ajouterBoite(m, x0, y0, hp, x0 + 16 + portee, y1, hp + 1.2);
          }
          etiquetteAvant(m, police, String(portee), 4, hp / 2 - 2, 3.5, y0);
        });
        // Un socle qui relie les cinq travées : une seule pièce à garder.
        ajouterBoite(m, 0, 0, 0, 8, PORTEES_DE_PONT.length * (profondeur + ecartY) - ecartY, SOCLE_MM);
      }, 0, 46);

      return [...STRATEGIES_DE_SURPLOMB.map(peigne), echelle];
    },
    depouillement: {
      consigne: "Quatre peignes, une stratégie chacune, dans l'ordre : " + STRATEGIES_DE_SURPLOMB.map((s) => s.etiquette).join(", ")
        + ". Sur chacun, les angles sont gravés sur le socle et chaque angle a trois fins : deux planes, une ronde. Passer l'ongle sous chacune et chercher le dernier angle dont les TROIS dessous sont encore lisses, sans boucles retombées — deux sur trois ne suffisent pas. Puis l'échelle des ponts : regarder le dessous des dix tabliers, chercher la dernière portée dont les deux exemplaires sont tendus, sans ventre ni ligne tombée ; le dessus d'un pont qui pend se voit encore deux couches plus haut.",
      champsDeChoix: () => {
        const angles = [...ANGLES_DE_SURPLOMB].reverse().map((a) => ({ valeur: a, etiquette: a + "°" }));
        const aucun = { valeur: 0, etiquette: "Aucun : raté dès le premier" };
        return [
          ...STRATEGIES_DE_SURPLOMB.map((s) => ({
            cle: "s_" + s.valeur, etiquette: s.etiquette + " · dernier angle propre",
            options: [...angles, aucun],
          })),
          {
            cle: "portee", etiquette: "Dernière portée tendue",
            options: [...PORTEES_DE_PONT].reverse().map((v) => ({ valeur: v, etiquette: v + " mm" }))
              .concat([{ valeur: 0, etiquette: "Aucune" }]),
          },
        ];
      },
      conclure(saisie, _p, r) {
        const lus = STRATEGIES_DE_SURPLOMB.map((s) => ({ ...s, angle: saisie["s_" + s.valeur] ?? 0 }));
        // À égalité, la première de la liste : « paliers » est la plus sobre, et
        // rien ne justifie de préférer un procédé plus intrusif sans gain mesuré.
        const meilleure = lus.reduce((a, b) => (b.angle > a.angle ? b : a));
        const portee = saisie.portee ?? 0;
        const reglages = { strategie_surplomb: meilleure.valeur };
        const notes = [];

        if (meilleure.angle === 0) {
          return {
            reglages: {},
            texte: "Aucune stratégie ne tient, même à " + ANGLES_DE_SURPLOMB[0]
              + "° : le défaut n'est pas dans le traitement des surplombs mais avant. Reprendre le débit, puis la température vers le bord froid, et pousser la ventilation.",
          };
        }

        notes.push("Meilleure stratégie : « " + meilleure.etiquette + " », propre jusqu'à " + meilleure.angle + "° de la verticale.");
        const classement = [...lus].sort((a, b) => b.angle - a.angle)
          .map((s) => s.etiquette + " " + (s.angle === 0 ? "—" : s.angle + "°")).join(", ");
        notes.push("Classement : " + classement + ".");

        if (meilleure.angle >= 65) {
          notes.push("Au-delà de 65° ce n'est plus un surplomb mais un pont : rien à ralentir.");
        } else {
          // Les surplombs ne tiennent pas : on ralentit les trois paliers et on
          // ventile à fond. C'est le seul levier qui reste au trancheur.
          const lent = (v, part) => Math.max(5, Math.round(v * part));
          reglages.vitesse_surplomb_leger = lent(r.vitesse_surplomb_leger, 0.7);
          reglages.vitesse_surplomb_moyen = lent(r.vitesse_surplomb_moyen, 0.6);
          reglages.vitesse_surplomb_fort = lent(r.vitesse_surplomb_fort, 0.5);
          reglages.ventilateur_surplomb = 100;
          notes.push("Les trois vitesses de surplomb sont ramenées à "
            + reglages.vitesse_surplomb_leger + " / " + reglages.vitesse_surplomb_moyen + " / "
            + reglages.vitesse_surplomb_fort + " mm/s et la ventilation des surplombs à fond : la matière doit figer avant d'avoir le temps de pendre. Relancer l'essai pour voir jusqu'où cela porte.");
        }

        if (portee === 0) {
          reglages.vitesse_pont = Math.max(10, Math.round(r.vitesse_pont * 0.5));
          reglages.ventilateur_surplomb = 100;
          notes.push("Aucune travée n'est tendue, pas même " + PORTEES_DE_PONT[0]
            + " mm : vitesse des ponts ramenée à " + reglages.vitesse_pont + " mm/s et ventilation à fond.");
        } else if (portee >= 45) {
          notes.push("Ponts tenus jusqu'à " + portee + " mm : rien à changer de ce côté.");
        } else {
          reglages.vitesse_pont = Math.max(10, Math.round(r.vitesse_pont * 0.7));
          reglages.ventilateur_surplomb = 100;
          notes.push("Ponts propres seulement jusqu'à " + portee + " mm : vitesse des ponts ramenée à "
            + reglages.vitesse_pont + " mm/s et ventilation des ponts à fond.");
        }

        return { reglages, texte: notes.join(" ") };
      },
    },
  },

  // ── 10. La vitesse et l'état de surface ──
  {
    id: "vitesse", etage: "reglages", nom: "Vitesse et vibrations",
    but: "Jusqu'où pousser sans que la machine vibre et marque la pièce.",
    pourquoi: "Le débit maximal dit ce que la buse sait fondre ; il ne dit rien de ce que la mécanique encaisse. Passé une certaine vitesse, les changements de direction font onduler les faces, et l'onde se voit plusieurs millimètres après le coin. Cet essai vient donc après le débit maximal, et c'est lui qui fixe les vitesses de paroi. Pour que l'onde soit visible, il faut la provoquer : la tour porte une marche sur chacune de ses quatre faces — l'onde se lit alors deux fois en X et deux fois en Y —, un flanc arrondi, et une colonne satellite à 45 mm qui force un aller-retour à chaque couche. Les bandes vont volontairement au-delà de ce que la buse peut nourrir : le dépouillement demande donc deux lectures, une pour les ondulations (la mécanique) et une pour la paroi maigre (la buse), et ne retient que la plus basse.",
    duree: "≈ 40 min",
    parametres: [
      { cle: "depart", etiquette: "Première bande", unite: "mm/s", defaut: 100, min: 20, max: 300, entier: true },
      { cle: "pas", etiquette: "Pas", unite: "mm/s", defaut: 40, min: 10, max: 100, entier: true },
      { cle: "nombre", etiquette: "Nombre de bandes", defaut: 8, min: 3, max: 12, entier: true },
      { cle: "hauteur", etiquette: "Hauteur d'une bande", unite: "mm", defaut: 6, min: 4, max: 12 },
    ],
    reglages: {
      nombre_parois: 2, densite_remplissage: 10, couches_dessus: 0, couches_dessous: 1, epaisseur_dessus: 0, epaisseur_dessous: 0,
      remplir_interstices: "partout", couture_biseau: "non", position_couture: "alignee",
      temps_couche_min: 0, arcs: "oui",
    },
    variantes: () => [
      { ecarts: {}, etiquette: "Tour" },
      { ecarts: {}, vitesseImposee: 60, etiquette: "Mât des repères" },
    ],
    geometrie(p, r, contexte) {
      const hauteurTotale = p.nombre * p.hauteur;
      const tour = eprouvette("Tour à vitesse croissante", (m) => {
        ajouterBoite(m, 0, 0, 0, 25, 25, hauteurTotale);
        // Une marche sur chacune des quatre faces : c'est juste après un
        // changement de direction brutal que l'onde de vibration se voit, et
        // elle ne se voit pas pareil selon l'axe qui l'a produite.
        ajouterBoite(m, 9, 25, 0, 16, 28, hauteurTotale);
        ajouterBoite(m, 9, -3, 0, 16, 0, hauteurTotale);
        ajouterBoite(m, -3, 9, 0, 0, 16, hauteurTotale);
        ajouterBoite(m, 25, 9, 0, 28, 16, hauteurTotale);
        // Un flanc arrondi au coin : une courbe montre les à-coups autrement
        // qu'une face plane, et c'est là que les arcs se jugent.
        const flanc = cercle(0, 0, 6, 48);
        ajouterTronc(m, flanc, flanc, 0, hauteurTotale);
        // Une colonne à distance : à chaque couche la tête fait l'aller-retour,
        // donc deux accélérations pleines de plus.
        ajouterBoite(m, 45, 7.5, 0, 55, 17.5, hauteurTotale);
      }, -22, 0);
      const mat = eprouvette("Mât des repères", (m) => {
        matDesBandes(m, contexte.police, serie(p.depart, p.pas, p.nombre).map(String), {
          x0: 0, x1: 18, y: 0, epaisseur: epaisseurDeParoi(2, r.largeur_paroi_exterieure, r.hauteur_couche),
          hauteurDeBande: p.hauteur, taille: 3.2,
        });
      }, 46, 0);
      return [tour, mat];
    },
    modulations(p, couches) {
      const valeurs = serie(p.depart, p.pas, p.nombre);
      return couchesDesBandes(couches, p.hauteur, p.nombre).map((couche, i) => ({
        couche, vitesseImposee: valeurs[i], etiquette: valeurs[i] + " mm/s",
      }));
    },
    depouillement: {
      consigne: "En lumière rasante, regarder la face qui suit chacune des quatre marches, puis le flanc arrondi. Des ondulations régulières qui s'estompent en s'éloignant du coin sont des vibrations. Première lecture : la dernière bande sans ondulation sur les quatre faces. Seconde lecture, sur la paroi elle-même : la dernière bande dont la paroi reste pleine et brillante — au-dessus, ce n'est plus la mécanique qu'on voit mais la buse qui ne suit plus.",
      champsDeChoix: (p) => {
        const options = serie(p.depart, p.pas, p.nombre)
          .map((v, i) => ({ valeur: i, etiquette: v + " mm/s" })).reverse();
        return [
          {
            cle: "ondulations", etiquette: "Dernière bande sans ondulation",
            options: [...options, { valeur: -1, etiquette: "Aucune : ondulé dès la première" }],
          },
          {
            cle: "paroi", etiquette: "Dernière bande à paroi pleine",
            options: [...options, { valeur: -1, etiquette: "Aucune : maigre dès la première" }],
          },
        ];
      },
      conclure(saisie, p, r) {
        const valeurs = serie(p.depart, p.pas, p.nombre);
        const dernier = valeurs.length - 1;
        const iOndulations = saisie.ondulations ?? dernier;
        const iParoi = saisie.paroi ?? dernier;
        if (iOndulations === -1) {
          return {
            reglages: {},
            texte: "La face ondule dès " + p.depart + " mm/s : relancer l'essai en partant plus bas. Si l'ondulation reste, c'est la machine qu'il faut regarder (courroies, galets, pièce mal collée), pas un réglage.",
          };
        }
        const vibration = valeurs[iOndulations];
        const section = sectionDeLigne(r.largeur_paroi_exterieure, r.hauteur_couche) * r.rapport_debit;
        const plafondDebit = Math.round(r.debit_maximal / section);
        const plafondParoi = iParoi === -1 ? p.depart : valeurs[iParoi];
        const retenu = Math.min(vibration, plafondParoi, plafondDebit);
        const interieures = Math.min(Math.round(retenu * 1.5), plafondDebit);
        return {
          reglages: { vitesse_paroi_exterieure: retenu, vitesse_parois_interieures: interieures },
          texte: "Sans ondulation jusqu'à " + vibration + " mm/s, paroi pleine jusqu'à " + plafondParoi
            + " mm/s, plafond du débit maximal " + plafondDebit + " mm/s à cette largeur de ligne. Paroi extérieure retenue à "
            + retenu + " mm/s, parois intérieures à " + interieures + " mm/s."
            + (plafondParoi < vibration
              ? " C'est la buse qui limite, pas la mécanique : remonter le débit maximal (ou la température) fera gagner de la vitesse."
              : plafondDebit <= vibration
                ? " C'est le débit maximal qui limite : la mécanique, elle, en accepterait plus."
                : " C'est la mécanique qui limite : la buse suivrait plus vite.")
            + (iOndulations === dernier ? " Aucune bande n'a ondulé : la limite est au-delà de la série, relancer plus haut pour la trouver." : ""),
        };
      },
    },
  },

  // ── 11. Le contrôle final ──
  {
    id: "controle", etage: "reglages", nom: "Contrôle final",
    but: "Une seule impression qui met à l'épreuve tout ce qui précède.",
    pourquoi: "Aucun réglage ne sort de cet essai, et c'est voulu : il ne calibre rien, il vérifie. Chaque essai précédent a été jugé sur une éprouvette faite pour lui, dans des conditions qui lui étaient favorables ; une pièce ordinaire les fait tous travailler ensemble. Ce qui rate ici désigne l'essai à refaire.",
    duree: "≈ 25 min",
    parametres: [],
    reglages: {},
    geometrie(_p, _r, contexte) {
      const police = contexte.police;
      return [eprouvette("Pièce de contrôle", (m) => {
        // Un corps à fenêtre : deux pieds et un linteau, donc un pont de 20 mm.
        ajouterBoite(m, 0, 0, 0, 8, 22, 12);
        ajouterBoite(m, 28, 0, 0, 36, 22, 12);
        // Le dessus, percé d'un trou rond : il ferme la fenêtre par un pont et
        // le trou montre du même coup la rondeur et la cote.
        ajouterPlaqueTrouee(m, [rectangle(0, 0, 36, 22), cercle(18, 11, 5, 48)], 12, 16);
        // Une fin à 45° : le surplomb.
        ajouterTronc(m, rectangle(4, 22, 18, 24), rectangle(4, 34, 18, 36), 0, 12);
        // Une nervure mince : la paroi à largeur variable et les interstices.
        ajouterBoite(m, 22, 22, 0, 23, 29, 16);
        // Une pointe : les fils et la fin des petits détails.
        ajouterTronc(m, cercle(31, 27, 2.5, 24), cercle(31, 27, 0.3, 24), 0, 14);
        // Un gradin de 20 mm de côté : une cote à vérifier au pied à coulisse.
        ajouterBoite(m, 0, -10, 0, 20, 0, 5);
        etiquetteDessus(m, police, "20", 10, -5.5, 4.5, 5);
      })];
    },
    depouillement: {
      consigne: "Cocher ce qui est réussi. Ce qui reste décoché renvoie à l'essai à refaire.",
      constats: [
        { cle: "premiere", etiquette: "La première couche est régulière et bien collée", outil: "premiere_couche" },
        { cle: "cotes", etiquette: "Le gradin mesure 20 mm et le trou 10 mm", outil: "cotes" },
        { cle: "pied", etiquette: "Le pied n'est pas plus large que le corps", outil: "cotes" },
        { cle: "pont", etiquette: "Le pont de 20 mm est tendu", outil: "surplombs" },
        { cle: "surplomb", etiquette: "La fin à 45° a un dessous propre", outil: "surplombs" },
        { cle: "dessus", etiquette: "Le dessus est lisse, sans creux ni bourrelet", outil: "debit" },
        { cle: "fils", etiquette: "Aucun fil entre le corps, la nervure et la pointe", outil: "retraction" },
        { cle: "coins", etiquette: "Les coins sont droits, sans gonflement", outil: "pression" },
        { cle: "faces", etiquette: "Les faces sont sans ondulation", outil: "vitesse" },
      ],
      conclure(saisie) {
        const rates = this.constats.filter((c) => saisie[c.cle] !== true);
        return {
          reglages: {},
          texte: rates.length === 0
            ? "Tous les points passent : la combinaison est bonne, elle peut être exportée en préréglages."
            : "À revoir : " + rates.map((c) => c.etiquette.toLowerCase() + " → essai « " + nomDOutil(c.outil) + " »").join(" ; ") + ".",
        };
      },
    },
  },
]);

/*
 * La vitesse qu'une ligne de paroi ne peut pas dépasser sans manquer de
 * matière : le débit maximal divisé par la section du cordon. C'est le plafond
 * que le trancheur applique partout, et il ne sert à rien de demander plus.
 */
function plafondDeVitesse(r) {
  const section = sectionDeLigne(r.largeur_paroi_exterieure ?? 0.42, r.hauteur_couche ?? 0.2) * (r.rapport_debit ?? 1);
  return (r.debit_maximal ?? 12) / section;
}

/* Les trois rapports de débit de l'essai de débit, du plus faible au plus fort. */
function debitsDeLEssai(p) {
  return [-1, 0, 1].map((i) => arrondi((p.centre + i * p.ecart) / 100));
}

/* Les trois vitesses de rétraction, une par tour. */
function vitessesDeRetraction(p) {
  return [p.vitesseA, p.vitesseB, p.vitesseC];
}

/* Les décalages Z essayés par l'essai de première couche. */
function decalagesDeLEssai(p) {
  return serie(p.depart, p.pas, p.nombre);
}

/* Un triangle équilatéral centré, décrit par le rayon de son cercle circonscrit. */
function triangleEquilateral(cx, cy, rayon) {
  return [90, 210, 330].map((a) => {
    const r = (a * Math.PI) / 180;
    return [cx + rayon * Math.cos(r), cy + rayon * Math.sin(r)];
  });
}

/*
 * La droite des moindres carrés y = ordonnee + pente × x. null quand les x sont
 * tous égaux : il n'y a alors pas de droite à tirer.
 */
function regressionLineaire(xs, ys) {
  const n = xs.length;
  const mx = moyenne(xs);
  const my = moyenne(ys);
  let haut = 0;
  let bas = 0;
  for (let i = 0; i < n; i += 1) {
    haut += (xs[i] - mx) * (ys[i] - my);
    bas += (xs[i] - mx) ** 2;
  }
  if (bas < 1e-12) return null;
  const pente = haut / bas;
  return { pente, ordonnee: my - pente * mx };
}

export const outilDe = (id) => OUTILS.find((o) => o.id === id) ?? null;
const nomDOutil = (id) => outilDe(id)?.nom ?? id;

/*
 * Les valeurs par défaut des paramètres d'un outil. Un défaut peut être une
 * fonction des réglages en vigueur : l'essai de débit se centre alors de
 * lui-même sur le rapport en vigueur, sans empêcher d'en taper un autre.
 */
export function parametresParDefaut(outil, reglages = null) {
  const valeurs = {};
  for (const p of outil.parametres) {
    valeurs[p.cle] = typeof p.defaut === "function" ? p.defaut(reglages ?? {}) : p.defaut;
  }
  return valeurs;
}

/* Les réglages que l'essai impose à tout le plateau, fixes ou calculés depuis ses paramètres. */
export function reglagesDeLEssai(outil, parametres) {
  return outil.reglagesDe ? outil.reglagesDe(parametres) : (outil.reglages ?? {});
}

/*
 * Les variantes de l'essai : une par éprouvette, dans l'ordre où la géométrie
 * les rend. Chacune porte les écarts avec lesquels SA pièce est tranchée, et
 * que le G-code applique ensuite ; elle peut aussi imposer une vitesse ou
 * décaler la pièce en Z. Un essai sans variantes rend un tableau vide : toutes
 * ses éprouvettes sont alors identiques.
 */
export function variantesDeLEssai(outil, parametres, reglages) {
  return outil.variantes ? outil.variantes(parametres, reglages) : [];
}
