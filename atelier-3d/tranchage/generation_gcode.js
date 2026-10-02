/*
 * tranchage/generation_gcode.js
 * ─────────────────────────────
 * Le G-code d'un plateau tranché, pour les P1S et P1P.
 *
 *   début      le G-code de Bambu Studio (gcode_bambu.js) : chauffe, purge,
 *              essuyage, palpage de la zone de la première couche, ligne d'amorce ;
 *   couches    pour chaque couche, les chemins de toutes les pièces, jupe d'abord ;
 *   fin        le G-code de fin de Bambu Studio.
 *
 * Extrusion relative (M83) : chaque segment pousse sa propre longueur de
 * filament, section de la ligne × longueur × rapport de débit ÷ section du fil.
 * Les déplacements suivent la matière quand ils le peuvent (deplacements.js) :
 * un trajet qui reste dans la pièce ne rétracte pas et ne lève pas la buse ;
 * sinon la buse contourne, et ne rétracte que si aucun détour n'existe.
 *
 * Un déplacement qui sort de la matière, comme dans Bambu Studio :
 *   essuyage   la buse repasse sur les 2 derniers mm de la ligne en rétractant
 *              (95 % de la rétraction), puis rétracte le reste sur place ;
 *   levée      en rampe, pendant le début du déplacement, pas à la verticale :
 *              sur les P1, c'est le plateau qui bouge en Z ;
 *   descente   à l'arrivée, puis le filament est remis en pression.
 * Les essais de calibration modulent le G-code de deux façons : par COUCHE
 * (etat.modulations) — à partir de telle couche, d'autres réglages et au besoin
 * du G-code à passer — et par PIÈCE (etat.modulationsDePiece) — une valeur par
 * éprouvette, à la même hauteur, donc plusieurs essais dans un seul. Une
 * modulation de pièce l'emporte sur celle de la couche ; elle peut imposer une
 * vitesse et décaler la pièce en Z (decalageZ), ce qui met côte à côte plusieurs
 * écrasements de première couche.
 *
 * La vitesse de chaque chemin est celle de l'estimation (déjà plafonnée par le
 * débit, et tenant compte du surplomb, de l'enroulement et des petits contours),
 * divisée par le ralentissement de la couche.
 *
 * Trois choses se décident ici, et nulle part ailleurs :
 *   le JEU DE FERMETURE  le tour de paroi s'arrête un peu avant son départ ;
 *   le DÉBIT DES SURPLOMBS  réduit à proportion de la part de la ligne qui est
 *                        dans le vide, et non d'un bloc ;
 *   la VENTILATION ANTICIPÉE  le ventilateur d'un P1 met plus d'une seconde à
 *                        monter en régime : commandé au moment du surplomb, il ne
 *                        souffle qu'une fois le surplomb passé. Il est donc lancé
 *                        un chemin plus tôt, ce qui oblige à établir d'avance
 *                        l'ordre d'émission de la couche.
 */

import { TYPES_DE_LIGNE as T, CHAMPS_PAR_CHEMIN, ENROULEMENT_CRITIQUE } from "./protocole_tranchage.js";
import { vitesseVoulue, sectionDeLigne, sectionExtrudee } from "./estimations.js";
import { DEBUT_P1S, DEBUT_P1P, FIN_P1, LIMITES_P1 } from "./gcode_bambu.js";
import { PART_ESSUYAGE } from "../noyau/plateau.js";
import { creerNavigation } from "./deplacements.js";
import { regrouperEnArcs } from "./arcs_gcode.js";

// Les noms de types que Bambu Studio écrit en commentaire : les visionneuses de G-code les reconnaissent.
const NOMS_DE_TYPE = {
  [T.paroiExterieure]: "Outer wall",
  [T.paroisInterieures]: "Inner wall",
  [T.dessus]: "Top surface",
  [T.dessous]: "Bottom surface",
  [T.pleinInterieur]: "Internal solid infill",
  [T.remplissage]: "Sparse infill",
  [T.jupe]: "Skirt",
  [T.bordure]: "Brim",
  [T.paroiEnSurplomb]: "Overhang wall",
  [T.pont]: "Bridge",
  [T.interstices]: "Gap infill",
  [T.repassage]: "Ironing",
  [T.pontInterieur]: "Internal Bridge",
};
// Les types qui forment le tour de la pièce : eux seuls reçoivent un jeu de fermeture.
const EST_UNE_PAROI = new Set([T.paroiExterieure, T.paroisInterieures]);
// La ventilation propre à certains types de ligne : le réglage l'emporte sur celui
// de la couche, sauf s'il vaut 0 (« comme la couche »). Ponts et surplombs figent
// en l'air : c'est le seul cas où le réglage est à fond par défaut.
const VENTILATION_PAR_TYPE = {
  [T.pont]: "ventilateur_surplomb",
  [T.paroiEnSurplomb]: "ventilateur_surplomb",
  [T.paroiExterieure]: "ventilateur_paroi_exterieure",
  [T.dessus]: "ventilateur_dessus",
};

// Écart toléré en simplifiant un tracé : bien en dessous de ce que la buse reproduit.
// Sans elle, le gyroïde, échantillonné finement, donne des centaines de milliers de segments minuscules.
const TOLERANCE_MM = 0.01;
// Le pas des petits segments dans une couture en biseau : assez court pour un fondu régulier.
const PAS_DU_BISEAU_MM = 0.8;

/*
 * La couture en biseau : au lieu de s'arrêter net, le tour de paroi repart sur
 * son propre début et s'éteint en fondu, pendant que le début, lui, est monté
 * en fondu. Les deux moitiés s'additionnent : la matière est complète partout,
 * mais il n'y a plus ni départ ni arrêt francs.
 * Rend le tracé rallongé et, pour chaque segment, la part de matière à pousser.
 */
function biseauterLaCouture(trace, longueur) {
  const neutre = { trace, parts: new Array(Math.max(0, trace.length - 1)).fill(1) };
  const tour = longueurDuTrace(trace);
  // Il faut de quoi faire le biseau sans mordre sur lui-même.
  if (tour < 3 * longueur) return neutre;

  // Le début du tour, repris à la fin : c'est lui qui reçoit le fondu descendant.
  const rallonge = decouperAuDebut(trace, longueur);
  const points = [...trace, ...rallonge.slice(1)];
  // Des pas courts dans les deux zones de fondu : sinon un long segment reçoit une seule valeur.
  const fins = subdiviserLesBouts(points, longueur, PAS_DU_BISEAU_MM);

  const parts = [];
  let parcouru = 0;
  const totale = longueurDuTrace(fins);
  for (let j = 0; j + 1 < fins.length; j += 1) {
    const l = Math.hypot(fins[j + 1][0] - fins[j][0], fins[j + 1][1] - fins[j][1]);
    const milieu = parcouru + l / 2;
    const montee = Math.min(1, milieu / longueur);
    const descente = Math.min(1, (totale - milieu) / longueur);
    parts.push(Math.max(0, Math.min(montee, descente)));
    parcouru += l;
  }
  return { trace: fins, parts };
}

const longueurDuTrace = (points) => points.reduce(
  (somme, p, i) => (i === 0 ? 0 : somme + Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1])), 0,
);

/* Le début du tracé, coupé à « longueur » ; le premier point est celui du tracé. */
function decouperAuDebut(points, longueur) {
  const morceau = [points[0]];
  let parcouru = 0;
  for (let j = 1; j < points.length && parcouru < longueur; j += 1) {
    const [a, b] = [points[j - 1], points[j]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    if (parcouru + l >= longueur) {
      const t = (longueur - parcouru) / l;
      morceau.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return morceau;
    }
    morceau.push(b);
    parcouru += l;
  }
  return morceau;
}

/* Le tracé privé de ses « longueur » derniers millimètres. */
function raccourcirLaFin(points, longueur) {
  const totale = longueurDuTrace(points);
  if (!(longueur > 0) || totale <= 2 * longueur) return points;
  const cible = totale - longueur;
  const garde = [points[0]];
  let parcouru = 0;
  for (let j = 1; j < points.length; j += 1) {
    const [a, b] = [points[j - 1], points[j]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    if (parcouru + l >= cible) {
      const t = (cible - parcouru) / l;
      garde.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return garde;
    }
    garde.push(b);
    parcouru += l;
  }
  return garde;
}

/* Les segments des deux premiers et deux derniers « longueur » millimètres, coupés en pas courts. */
function subdiviserLesBouts(points, longueur, pas) {
  const totale = longueurDuTrace(points);
  const sortie = [points[0]];
  let parcouru = 0;
  for (let j = 1; j < points.length; j += 1) {
    const [a, b] = [points[j - 1], points[j]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dansLeFondu = parcouru < longueur || totale - (parcouru + l) < longueur;
    const morceaux = dansLeFondu ? Math.max(1, Math.ceil(l / pas)) : 1;
    for (let m = 1; m <= morceaux; m += 1) {
      const t = m / morceaux;
      sortie.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    parcouru += l;
  }
  return sortie;
}

/* Douglas-Peucker : les points qui s'écartent de moins de la tolérance de la corde disparaissent. */
function simplifier(points) {
  if (points.length <= 2) return points;
  const garder = new Uint8Array(points.length);
  garder[0] = 1;
  garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length > 0) {
    const [a, b] = pile.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const longueur = Math.hypot(bx - ax, by - ay);
    let pire = -1;
    let ecart = TOLERANCE_MM;
    for (let i = a + 1; i < b; i += 1) {
      const [x, y] = points[i];
      const d = longueur < 1e-9 ? Math.hypot(x - ax, y - ay) : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / longueur;
      if (d > ecart) { ecart = d; pire = i; }
    }
    if (pire < 0) continue;
    garder[pire] = 1;
    pile.push([a, pire], [pire, b]);
  }
  return points.filter((_p, i) => garder[i] === 1);
}

const nombre = (v, decimales) => {
  const fixe = v.toFixed(decimales);
  const texte = fixe.includes(".") ? fixe.replace(/\.?0+$/, "") : fixe;
  return texte === "-0" ? "0" : texte;
};
const mm = (v) => nombre(v, 3);
const pwm = (pourcent) => Math.round(Math.max(0, Math.min(100, pourcent)) * 2.55);

function remplir(modele, champs) {
  return modele.replace(/\{([a-z_]+)\}/g, (tout, nom) => (nom in champs ? String(champs[nom]) : tout));
}

/* Le ventilateur de pièce d'une couche, en % : minimal sur une couche longue, maximal sur une couche courte. */
function ventilateurDeLaCouche(k, duree, r) {
  if (k < r.couches_sans_ventilateur) return 0;
  if (duree >= r.temps_couche_ventilateur) return r.ventilateur_min;
  if (duree <= r.temps_couche_min) return r.ventilateur_max;
  const t = (r.temps_couche_ventilateur - duree) / Math.max(1e-6, r.temps_couche_ventilateur - r.temps_couche_min);
  return r.ventilateur_min + t * (r.ventilateur_max - r.ventilateur_min);
}

/* Les chemins de chaque pièce rangés par couche : couche → [indices]. */
function cheminsParCouche(piece, nombreDeCouches) {
  const parCouche = Array.from({ length: nombreDeCouches }, () => []);
  const n = piece.chemins.length / CHAMPS_PAR_CHEMIN;
  for (let i = 0; i < n; i += 1) {
    const couche = piece.chemins[i * CHAMPS_PAR_CHEMIN];
    if (couche < nombreDeCouches) parCouche[couche].push(i);
  }
  return parCouche;
}

/* Le rectangle couvert par la première couche : l'imprimante ne palpe que là. */
function zoneDeLaPremiereCouche(pieces, rangees) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  pieces.forEach((piece, p) => {
    for (const i of rangees[p][0] ?? []) {
      const premier = piece.chemins[i * CHAMPS_PAR_CHEMIN + 2];
      const nombreDePoints = piece.chemins[i * CHAMPS_PAR_CHEMIN + 3];
      for (let j = premier; j < premier + nombreDePoints; j += 1) {
        const [x, y] = [piece.points[j * 2], piece.points[j * 2 + 1]];
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
  });
  if (!Number.isFinite(x0)) return { x: 128, y: 128, largeur: 1, profondeur: 1 };
  return { x: x0, y: y0, largeur: x1 - x0, profondeur: y1 - y0 };
}

/*
 * etat : ce que rend tranchageEnDirect.etat() — { couches, pieces, facteurs, durees, reglages }
 * machine : une entrée de MACHINES ; matiere : "PLA", "PETG"…
 * Rend { texte, duree (s, préparation comprise), poids (g), longueurFil (m), hauteur (mm) }.
 */
/*
 * Le ventilateur de caisson (M106 P3) du G-code de démarrage, repris du profil
 * filament PLA de Bambu Lab : il souffle sur le tube pour que le PLA ne
 * ramollisse pas au-dessus d'un plateau chaud. Rien en dessous de 35 °C — il
 * n'y a alors plus rien à empêcher.
 */
function ventilationDuCaisson(matiere, r) {
  if (matiere !== "PLA") return "";
  const plateau = Math.max(r.temperature_plateau_premiere, r.temperature_plateau);
  if (plateau > 45) return "    M106 P3 S255 ;Prevent PLA from jamming";
  if (plateau > 35) return "    M106 P3 S180 ;Prevent PLA from jamming";
  return "";
}

export function genererGcode(etat, machine, matiere) {
  const reglagesDeBase = etat.reglages;
  // Les modulations d'un essai de calibration : à partir de telle couche, d'autres
  // réglages et, au besoin, du G-code à passer (M104, M900…). Hors calibration, vide.
  const modulations = (etat.modulations ?? []).slice().sort((a, b) => a.couche - b.couche);
  // Une modulation qui commence à la première couche vaut déjà pour la chauffe
  // du début : sinon l'imprimante chaufferait à la température du préréglage.
  const modulationInitiale = modulations.find((m) => m.couche === 0) ?? null;
  // Les modulations attachées à une pièce plutôt qu'à une couche, rangées dans
  // l'ordre des éprouvettes — la jupe, qui n'en est pas une, est sautée.
  let rangDePiece = -1;
  const modulationDePiece = etat.pieces.map((piece) => {
    if (piece.jupe === true) return null;
    rangDePiece += 1;
    return (etat.modulationsDePiece ?? [])[rangDePiece] ?? null;
  });
  let r = modulationInitiale === null ? reglagesDeBase : { ...reglagesDeBase, ...(modulationInitiale.reglages ?? {}) };
  let modulationCourante = null;
  // Les réglages qui valent pour ce qui s'imprime en ce moment : ceux de la
  // couche, ou ceux de la pièce en cours. La rétraction, l'essuyage, la levée et
  // la ventilation s'y réfèrent — un saut qui quitte une pièce rétracte comme
  // cette pièce-là le demande, pas comme le plateau en général.
  let rActif = r;
  const { hauteurs, epaisseurs } = etat.couches;
  const nombreDeCouches = hauteurs.length;
  const rangees = etat.pieces.map((piece) => cheminsParCouche(piece, nombreDeCouches));
  const aireDuFil = Math.PI * (r.diametre_filament / 2) ** 2;
  const hauteurMax = hauteurs.at(-1) ?? 0;
  const dureeImpression = etat.durees.reduce((s, d) => s + d, 0);
  const lignes = [];
  const ecrire = (ligne) => lignes.push(ligne);

  // ── Début ──
  const zone = zoneDeLaPremiereCouche(etat.pieces, rangees);
  const debitParoi = Math.min(r.debit_maximal, r.vitesse_paroi_exterieure * sectionDeLigne(r.largeur_paroi_exterieure, r.hauteur_couche));
  const debut = remplir(machine.caisson ? DEBUT_P1S : DEBUT_P1P, {
    plateau_premiere: r.temperature_plateau_premiere,
    buse_premiere: r.temperature_buse_premiere,
    buse_reduite: r.temperature_buse_premiere - 20,
    // Le ventilateur de caisson qui empêche le PLA de ramollir dans le tube au
    // voisinage d'un plateau chaud. Deux crans, et sur la PLUS HAUTE des deux
    // températures de plateau : c'est l'échelle du profil filament PLA de Bambu
    // ({if bed > 45} S255 {elsif bed > 35} S180). On avait un seul cran, à la
    // mauvaise valeur et sur la seule première couche — donc rien du tout dès
    // que le plateau descend, alors que c'est justement là qu'on l'envoie.
    ventilation_pla: ventilationDuCaisson(matiere, r),
    // Bambu Studio purge à la température haute de la matière : 10 °C au-dessus de l'impression.
    purge_f: nombre(r.debit_maximal / 2.4053 * 60, 3),
    purge_temperature: Math.max(r.temperature_buse_premiere, r.temperature_buse) + 10,
    zone_x: mm(zone.x), zone_y: mm(zone.y), zone_largeur: mm(zone.largeur), zone_profondeur: mm(zone.profondeur),
    amorce_f: nombre(debitParoi / (0.3 * 0.5) * 60, 0),
    amorce_f_lente: nombre(debitParoi / (0.3 * 0.5) / 4 * 60, 0),
    decalage_plaque: r.decalage_z_plaque === 0 ? "" : `G29.1 Z${mm(r.decalage_z_plaque)} ; decalage de la plaque`,
  });

  ecrire("; HEADER_BLOCK_START");
  ecrire("; Atelier 3D");
  ecrire(`; total estimated time: ${Math.round(dureeImpression + machine.preparation)} s`);
  ecrire(`; total layer number: ${nombreDeCouches}`);
  ecrire(`; max_z_height: ${mm(hauteurMax)}`);
  ecrire("; HEADER_BLOCK_END");
  ecrire("");
  ecrire(`M73 P0 R${Math.round((dureeImpression + machine.preparation) / 60)}`);
  ecrire(LIMITES_P1);
  ecrire("M106 S0");
  ecrire("M106 P2 S0");
  ecrire(debut);
  ecrire("; MACHINE_START_GCODE_END");
  ecrire("G90");
  ecrire("G21");
  ecrire("M83 ; extrusion relative");
  // L'avance de pression : l'extrudeur anticipe les accélérations. 0 la laisse au firmware.
  if (r.pression_avance > 0) ecrire(`M900 K${nombre(r.pression_avance, 4)} ; pressure advance`);

  // ── Couches ──
  // La ligne d'amorce laisse la buse à Z 0,2 près de l'avant du plateau, filament en place.
  let position = { x: 18, y: 1.5, z: 0.2 };
  let retracte = false;
  let derniereLigne = null;     // les points de la dernière ligne extrudée : l'essuyage repasse dessus
  let acceleration = null;
  let vitesse = null;
  let ventilateur = null;
  let filament = 0;
  let ecoule = 0;

  const accelerer = (a) => {
    if (a !== acceleration) ecrire(`M204 S${Math.round(a)}`);
    acceleration = a;
  };
  const retracter = () => {
    if (retracte || rActif.longueur_retraction <= 0) return;
    let reste = rActif.longueur_retraction;
    if (derniereLigne !== null && rActif.longueur_essuyage > 0) {
      // En arrière le long de la ligne : le filament qui suinte est déposé sur elle, pas en fil dans le vide.
      const aRetracter = rActif.longueur_retraction * PART_ESSUYAGE;
      let parcouru = 0;
      ecrire("; WIPE_START");
      ecrire(`G1 F${Math.round(rActif.vitesse_deplacement * 0.8 * 60)}`);
      for (let j = derniereLigne.length - 2; j >= 0 && parcouru < rActif.longueur_essuyage; j -= 1) {
        const [xa, ya] = [position.x, position.y];
        let [x, y] = derniereLigne[j];
        let l = Math.hypot(x - xa, y - ya);
        if (l < 1e-4) continue;
        if (parcouru + l > rActif.longueur_essuyage) {
          const t = (rActif.longueur_essuyage - parcouru) / l;
          [x, y] = [xa + (x - xa) * t, ya + (y - ya) * t];
          l = rActif.longueur_essuyage - parcouru;
        }
        parcouru += l;
        const e = aRetracter * l / rActif.longueur_essuyage;
        reste -= e;
        ecrire(`G1 X${mm(x)} Y${mm(y)} E-${nombre(e, 5)}`);
        position = { ...position, x, y };
      }
      ecrire("; WIPE_END");
      vitesse = null;
    }
    if (reste > 1e-4) ecrire(`G1 E-${nombre(reste, 5)} F${rActif.vitesse_retraction * 60}`);
    retracte = true;
    derniereLigne = null;
  };
  const ventiler = (pourcent) => {
    const valeur = pwm(pourcent);
    if (valeur === ventilateur) return;
    ecrire(`M106 S${valeur}`);
    if (machine.caisson) ecrire(`M106 P2 S${valeur > 0 ? pwm(rActif.ventilateur_auxiliaire) : 0}`);
    ventilateur = valeur;
  };
  const allerA = (x, y, z, navigation) => {
    const distance = Math.hypot(x - position.x, y - position.y);
    const f = Math.round(rActif.vitesse_deplacement * 60);

    // D'abord : peut-on y aller sans sortir de la pièce ? Alors ni rétraction ni levée.
    if (z === position.z && distance > 0 && navigation !== null) {
      const depart = [position.x, position.y];
      const arrivee = [x, y];
      const detour = navigation.contourner(depart, arrivee);
      if (detour !== null) {
        if (distance > rActif.deplacement_sans_retraction) accelerer(rActif.acceleration_deplacement);
        for (const [dx, dy] of [...detour, arrivee]) ecrire(`G1 X${mm(dx)} Y${mm(dy)} F${f}`);
        vitesse = null;
        position = { x, y, z };
        return;
      }
    }

    const long = distance > rActif.deplacement_sans_retraction || z !== position.z;
    // Un saut court garde l'accélération de la ligne : changer de réglage pour 1 mm donnerait un à-coup.
    if (long) accelerer(rActif.acceleration_deplacement);
    if (long) {
      retracter();
      const zHaut = Math.max(z, position.z) + rActif.levee_buse;
      const reste = Math.hypot(x - position.x, y - position.y);
      const f = Math.round(rActif.vitesse_deplacement * 60);
      if (reste > 2 * rActif.levee_buse) {
        // La buse monte pendant le premier bout du trajet, sur une longueur égale à deux fois la levée.
        const t = 2 * rActif.levee_buse / reste;
        ecrire(`G1 X${mm(position.x + (x - position.x) * t)} Y${mm(position.y + (y - position.y) * t)} Z${mm(zHaut)} F${f}`);
      } else {
        ecrire(`G1 Z${mm(zHaut)} F${f}`);
      }
      ecrire(`G1 X${mm(x)} Y${mm(y)}`);
      ecrire(`G1 Z${mm(z)}`);
    } else if (distance > 0) {
      ecrire(`G1 X${mm(x)} Y${mm(y)} F${Math.round(rActif.vitesse_deplacement * 60)}`);
    }
    vitesse = null;
    position = { x, y, z };
  };

  for (let k = 0; k < nombreDeCouches; k += 1) {
    const z = hauteurs[k];
    const epaisseur = epaisseurs[k];
    // La matière de cette couche, toutes pièces réunies : la route des déplacements.
    const contoursDeLaCouche = etat.pieces.flatMap((piece) => piece.contours?.[k] ?? []);
    const navigation = contoursDeLaCouche.length > 0 ? creerNavigation(contoursDeLaCouche) : null;
    // La modulation en vigueur à cette couche : la dernière qui a commencé.
    const voulueIci = modulations.filter((m) => m.couche <= k).at(-1) ?? null;
    if (voulueIci !== modulationCourante) {
      modulationCourante = voulueIci;
      r = voulueIci === null ? reglagesDeBase : { ...reglagesDeBase, ...(voulueIci.reglages ?? {}) };
      rActif = r;
    }
    const ventilateurDeBase = ventilateurDeLaCouche(k, etat.durees[k], r);
    ecrire("; CHANGE_LAYER");
    ecrire(`; Z_HEIGHT: ${mm(z)}`);
    ecrire(`; LAYER_HEIGHT: ${mm(epaisseur)}`);
    retracter();
    // Le changement de couche de Bambu Studio : l'écran de l'imprimante suit la progression.
    ecrire(`; layer num/total_layer_count: ${k + 1}/${nombreDeCouches}`);
    ecrire(`M73 L${k + 1}`);
    ecrire(`M991 S0 P${k} ;notify layer change`);
    const restant = dureeImpression - ecoule;
    ecrire(`M73 P${Math.floor(100 * ecoule / Math.max(1, dureeImpression))} R${Math.round(restant / 60)}`);
    if (voulueIci !== null && voulueIci.couche === k) {
      if (voulueIci.etiquette) ecrire(`; CALIBRATION: ${voulueIci.etiquette}`);
      for (const ligne of voulueIci.gcode ?? []) ecrire(ligne);
    }
    ventiler(ventilateurDeBase);
    if (k === 1) {
      ecrire(`M104 S${r.temperature_buse} ; set nozzle temperature`);
      ecrire(`M140 S${r.temperature_plateau} ; set bed temperature`);
    }

    // ── L'ordre d'émission de la couche : pièce par pièce, chemin par chemin ──
    // La liste est établie d'avance pour deux raisons : la ventilation doit
    // pouvoir regarder LE CHEMIN SUIVANT (voir plus bas), et la rétraction qui
    // quitte une pièce doit se faire avec les réglages de celle qu'on quitte.
    const aEmettre = [];
    for (let p = 0; p < etat.pieces.length; p += 1) {
      for (const i of rangees[p][k]) aEmettre.push({ p, i });
    }
    const reglagesDe = (p) => {
      const surPiece = modulationDePiece[p];
      return surPiece === null ? r : { ...r, ...(surPiece.reglages ?? {}) };
    };

    /*
     * La ventilation voulue par un chemin : son réglage propre s'il en a un
     * (ponts et surplombs figent en l'air, paroi extérieure, surface du dessus),
     * sinon celle de la couche. Un bord qui s'est retroussé prend la ventilation
     * des surplombs, même si sa propre couche ne débordait pas.
     */
    const ventilationVoulue = ({ p, i }) => {
      const rp = reglagesDe(p);
      const chemins = etat.pieces[p].chemins;
      const type = chemins[i * CHAMPS_PAR_CHEMIN + 1];
      const enroule = chemins[i * CHAMPS_PAR_CHEMIN + 8] / 1000 >= ENROULEMENT_CRITIQUE;
      const cle = enroule ? "ventilateur_surplomb" : VENTILATION_PAR_TYPE[type];
      const propre = cle === undefined ? 0 : (rp[cle] ?? 0);
      return propre > 0 && k >= rp.couches_sans_ventilateur ? propre : ventilateurDeBase;
    };
    // Le ventilateur d'un P1 met plus d'une seconde à monter en régime : commandé
    // AU MOMENT du surplomb, il ne souffle vraiment qu'une fois le surplomb passé.
    // On le lance donc un chemin plus tôt, comme Bambu Studio. Un seul chemin
    // d'avance, et seulement vers le haut : la ventilation ne redescend jamais
    // avant l'heure.
    const voulues = aEmettre.map(ventilationVoulue);
    const ventilations = voulues.map((v, e) => Math.max(v, voulues[e + 1] ?? v));

    let piecePrecedente = -1;
    aEmettre.forEach(({ p, i }, e) => {
      const piece = etat.pieces[p];
      // Une modulation par pièce : plusieurs valeurs d'un même réglage dans une
      // seule impression, côte à côte et à la même hauteur. C'est ce qui permet
      // à l'escalier des débits de devenir une rangée de plaquettes basses.
      const surPiece = modulationDePiece[p];
      const rp = reglagesDe(p);
      if (p !== piecePrecedente) {
        // La rétraction qui quitte la pièce précédente lui appartient : elle se
        // fait AVANT de passer aux réglages de celle-ci. Sans cela, un essai de
        // rétraction donnerait à chaque tour la vitesse de sa voisine.
        if (rp !== rActif) retracter();
        rActif = rp;
        if (surPiece !== null && surPiece.etiquette) ecrire(`; CALIBRATION: ${surPiece.etiquette}`);
        piecePrecedente = p;
      }
      // Une éprouvette peut être posée plus haut ou plus bas que les autres :
      // c'est ainsi qu'un même plateau montre plusieurs écrasements de première couche.
      const zPiece = z + (surPiece?.decalageZ ?? 0);

      const champ = (c) => piece.chemins[i * CHAMPS_PAR_CHEMIN + c];
      const type = champ(1);
      const premier = champ(2);
      const nombreDePoints = champ(3);
      const largeur = champ(4) / 1000;
      const ferme = champ(5) === 1;
      const surplomb = champ(7) / 1000;
      if (nombreDePoints < 2) return;
      const bruts = Array.from({ length: nombreDePoints + (ferme ? 1 : 0) },
        (_v, j) => [piece.points[(premier + j % nombreDePoints) * 2], piece.points[(premier + j % nombreDePoints) * 2 + 1]]);
      // La couture en biseau ne vaut que pour la face visible, sur une boucle entière.
      const enBiseau = rp.couture_biseau === "oui" && ferme && type === T.paroiExterieure;
      let simplifie = simplifier(bruts);
      // Le jeu de fermeture : le tour s'arrête un peu avant son départ, et la
      // matière encore sous pression dans la buse comble le reste. Sans lui, la
      // fin du tour s'ajoute au début et la couture fait un bourrelet. Inutile
      // avec la couture en biseau, qui règle le même problème autrement.
      if (ferme && !enBiseau && rp.jeu_couture > 0 && EST_UNE_PAROI.has(type)) {
        simplifie = raccourcirLaFin(simplifie, rp.jeu_couture);
      }
      if (simplifie.length < 2) return;
      const { trace, parts } = enBiseau
        ? biseauterLaCouture(simplifie, rp.longueur_biseau)
        : { trace: simplifie, parts: null };

      const [x0, y0] = trace[0];
      allerA(x0, y0, zPiece, navigation);
      ventiler(ventilations[e]);
      accelerer(vitesseVoulue(k, type, rp).acceleration);
      if (retracte) {
        ecrire(`G1 E${nombre(rp.longueur_retraction, 3)} F${rp.vitesse_retraction * 60}`);
        retracte = false;
      }
      ecrire(`; FEATURE: ${NOMS_DE_TYPE[type]}`);
      ecrire(`; LINE_WIDTH: ${mm(largeur)}`);
      // Un essai de calibration impose sa vitesse (débit maximal) ou l'étire (tour de vitesse).
      const brute = champ(6) / 100;
      // La pièce l'emporte sur la couche : un mât de repères garde sa vitesse
      // pendant que la tour à côté monte en régime.
      const imposee = surPiece?.vitesseImposee ?? modulationCourante?.vitesseImposee ?? null;
      const facteur = (surPiece?.facteurVitesse ?? 1) * (modulationCourante?.facteurVitesse ?? 1);
      const voulue = imposee ?? brute * facteur;
      const ralentie = voulue / etat.facteurs[k];
      const v = Math.max(Math.min(voulue, rp.vitesse_min_refroidissement), ralentie);
      const f = Math.round(v * 60);
      if (f !== vitesse) ecrire(`G1 F${f}`);
      vitesse = f;

      // Un surplomb reçoit un peu moins de matière : la ligne pend moins et se
      // retrousse moins. La réduction suit la part de la ligne qui est dans le
      // vide — une ligne posée au quart dans le vide n'en perd qu'un quart.
      const reduction = type === T.paroiEnSurplomb ? (1 - rp.debit_surplomb / 100) * surplomb : 0;
      const debit = rp.rapport_debit * (1 - reduction);
      const parMm = sectionExtrudee(type, largeur, epaisseur, rp) * debit / aireDuFil;
      // Les arcs ne valent que pour un débit constant : une couture en biseau
      // module la matière segment par segment, on la laisse en droites.
      const morceaux = rp.arcs === "oui" && parts === null
        ? regrouperEnArcs(trace, rp.tolerance_arcs)
        : [{ arc: false, points: trace }];
      let [xa, ya] = [x0, y0];
      let j = 0;
      for (const morceau of morceaux) {
        if (morceau.arc) {
          const [x, y] = morceau.points.at(-1);
          const pousse = morceau.longueur * parMm;
          filament += pousse;
          ecoule += morceau.longueur / v;
          // I et J : le centre, compté depuis le point de départ de l'arc.
          const ci = morceau.centre[0] - xa;
          const cj = morceau.centre[1] - ya;
          ecrire(`${morceau.sens > 0 ? "G3" : "G2"} X${mm(x)} Y${mm(y)} I${mm(ci)} J${mm(cj)} E${nombre(pousse, 5)}`);
          [xa, ya] = [x, y];
          j += morceau.points.length - 1;
          continue;
        }
        for (let m = 1; m < morceau.points.length; m += 1) {
          const [x, y] = morceau.points[m];
          const l = Math.hypot(x - xa, y - ya);
          j += 1;
          if (l < 1e-4) continue;
          const pousse = l * parMm * (parts === null ? 1 : parts[j - 1]);
          filament += pousse;
          ecoule += l / v;
          ecrire(`G1 X${mm(x)} Y${mm(y)} E${nombre(pousse, 5)}`);
          [xa, ya] = [x, y];
        }
      }
      position = { x: xa, y: ya, z: zPiece };
      derniereLigne = trace;
    });
  }

  // ── Fin ──
  ecrire("M106 S0");
  if (machine.caisson) ecrire("M106 P2 S0");
  ecrire("; MACHINE_END_GCODE_START");
  const zBas = Math.min(hauteurMax + 100, 250);
  ecrire(remplir(FIN_P1, { z_degagement: mm(hauteurMax + 0.5), z_bas: mm(zBas), z_bas_retour: mm(zBas - 2) }));
  ecrire("");

  const volume = filament * aireDuFil;
  return {
    texte: lignes.join("\n"),
    duree: dureeImpression + machine.preparation,
    poids: volume / 1000 * r.densite_filament,
    longueurFil: filament / 1000,
    hauteur: hauteurMax,
  };
}
