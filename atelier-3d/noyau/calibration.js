/*
 * noyau/calibration.js
 * ────────────────────
 * Les essais de calibration, transcrits d'OrcaSlicer.
 *
 * Rien ici n'est de notre invention. Chaque essai reprend son éprouvette, ses
 * valeurs par défaut, ses réglages forcés, sa coupe et ses validations de
 * `Plater::calib_*` (src/slic3r/GUI/Plater.cpp), de `calib_dlg.cpp` et de
 * `GCode::process_layer`. Quand un choix se pose, la réponse est chez eux :
 * ils ont les éprouvettes, les retours d'utilisateurs et les années de
 * corrections que nous n'avons pas.
 *
 * Ce que fait un essai, et ce qu'il ne fait pas. Il pose une éprouvette sur le
 * plateau, impose les réglages qui rendent la mesure lisible, et module le
 * G-code couche par couche ou pièce par pièce. Il ne conclut RIEN : c'est
 * l'utilisateur qui lit son impression et qui tape la valeur trouvée dans les
 * réglages, à gauche. Comme dans Orca.
 *
 * Les éprouvettes sont les maillages d'Orca, dans calibration/modeles/, au
 * format Draco (voir geometrie/lecture_draco.js).
 *
 * CE QU'UN ESSAI A LE DROIT D'IMPOSER
 * ───────────────────────────────────
 * Un essai s'imprime avec LES RÉGLAGES DE L'UTILISATEUR. Son `reglages()` ne
 * doit en écarter que trois choses, et rien d'autre :
 *
 *   1. CE QU'IL MESURE. La grandeur cherchée ne peut pas être bridée par
 *      ailleurs, ni partir d'une valeur qui fausse la lecture : le plafond de
 *      débit est levé pour l'essai de débit maximal, le décalage de plaque est
 *      remis à zéro pour l'essai d'écrasement.
 *   2. CE QUI REND LA MESURE ILLISIBLE. La forme de l'éprouvette (parois, peau,
 *      remplissage), ce qui la fait tomber (une tour haute sans bordure), et ce
 *      qui change le signal d'une bande à l'autre sans rapport avec l'essai —
 *      au premier chef le ralentissement des couches courtes, qui ferait varier
 *      la vitesse entre deux bandes qu'on compare.
 *   3. LE RÉGIME OÙ LA MESURE EXISTE. Un écho de vibration n'existe pas à
 *      50 mm/s : les essais de dynamique poussent donc la machine à sa limite,
 *      lue dans le préréglage d'imprimante (vitesse_max_machine,
 *      acceleration_max_machine). C'est ce que fait Orca.
 *
 * Tout le reste vient du plateau, et doit en venir : si l'utilisateur change un
 * préréglage, l'essai suivant doit le prendre en compte. Une valeur écrite ici
 * est une valeur qui ne suivra jamais — d'où la règle : quand c'est un MINIMUM
 * qui compte, on borne la valeur de l'utilisateur au lieu de la remplacer.
 */

import { reglageDe } from "./reglages_impression.js";

/*
 * « Plus de plafond » : le maximum que le catalogue accepte pour le débit. Trois
 * essais doivent lever cette borne — ce qu'ils mesurent (le débit lui-même, ou
 * une vitesse) ne peut pas être décidé par elle. On le lit du catalogue plutôt
 * que de l'écrire : une borne changée là-bas ne doit pas laisser ici un nombre
 * qui ne veut plus rien dire. Aucune buse n'approche cette valeur, c'est le but.
 */
const SANS_PLAFOND_DE_DEBIT = reglageDe("debit_maximal").max;

// Le dossier des éprouvettes, relatif à ce fichier.
export const DOSSIER_DES_MODELES = "../calibration/modeles/";

// Les éprouvettes sont dessinées pour une buse de 0,4 mm ; tout ce qui s'y
// rapporte se met à l'échelle de la buse réellement montée.
const BUSE_DE_REFERENCE = 0.4;
// Un cran de la tour de température vaut 10 mm et 5 °C, et le modèle part de
// 500 °C en bas. C'est ce qui permet de le couper à la plage demandée.
const CRAN_DE_TEMPERATURE_MM = 10;
const PAS_DE_TEMPERATURE = 5;
const TEMPERATURE_DU_BAS = 500;
// La tour VFA : chaque palier fait 25 couches, soit 5 mm à 0,2 mm de couche.
const COUCHES_PAR_PALIER_VFA = 25;
const PALIER_VFA_MM = 5;
// Les coupes tombent juste à côté d'une face plane, jamais dessus : couper
// exactement au niveau d'un dessus laisse une couche dégénérée.
const EPSILON = 1e-4;

const arrondi = (v) => Math.round(v * 1e6) / 1e6;

/*
 * La valeur à la couche k, répartie sur toute la hauteur de l'éprouvette.
 * Transcription de GCode::interpolate_value_across_layers :
 *   pas > 0  des bandes égales, la dernière bornée pour ne pas dépasser ;
 *   pas = 0  une montée continue d'une couche à l'autre.
 * Les deux premières couches gardent la valeur de départ.
 */
export function valeurALaCouche(couche, nombreDeCouches, debut, fin, pas = 0) {
  if (couche <= 1 || nombreDeCouches < 2) return debut;
  const part = couche / (nombreDeCouches - 1);
  if (pas > 0) {
    const bandes = Math.round(Math.abs(fin - debut) / pas) + 1;
    const bande = Math.min(bandes - 1, Math.trunc(part * bandes));
    return arrondi(debut + (fin >= debut ? 1 : -1) * bande * pas);
  }
  return arrondi(debut + part * (fin - debut));
}

/*
 * Les mêmes bandes, mais rendues comme le trancheur les attend : la première
 * couche de chaque palier et sa valeur. Un pas nul donne une valeur par couche.
 */
export function bandesDeValeurs(nombreDeCouches, debut, fin, pas = 0) {
  if (nombreDeCouches < 2) return [{ couche: 0, valeur: debut }];
  if (!(pas > 0)) {
    return Array.from({ length: nombreDeCouches }, (_v, k) => ({
      couche: k, valeur: valeurALaCouche(k, nombreDeCouches, debut, fin, 0),
    }));
  }
  const nombre = Math.round(Math.abs(fin - debut) / pas) + 1;
  const sens = fin >= debut ? 1 : -1;
  const bandes = [];
  for (let b = 0; b < nombre; b += 1) {
    const couche = b === 0 ? 0 : Math.ceil((b * (nombreDeCouches - 1)) / nombre);
    if (couche >= nombreDeCouches) break;
    bandes.push({ couche, valeur: arrondi(debut + sens * b * pas) });
  }
  return bandes;
}

const moitieDeBuse = (r) => (r.diametre_buse ?? BUSE_DE_REFERENCE) / 2;
const echelleDeBuse = (r) => (r.diametre_buse ?? BUSE_DE_REFERENCE) / BUSE_DE_REFERENCE;

/* « début > 0, pas > 0, fin > début + pas » : la validation des trois tours. */
function plageCroissante(p, unite) {
  if (!(p.debut > 0) || !(p.pas > 0) || !(p.fin > p.debut + p.pas)) {
    return "Valeurs attendues : début > 0, pas > 0, fin > début + pas (en " + unite + ").";
  }
  return null;
}

// ── 1. La tour de température ────────────────────────────────────────────────

// Les plages conseillées par matière, reprises de Temp_Calibration_Dlg.
export const MATIERES_DE_LA_TOUR = Object.freeze([
  { valeur: "pla", etiquette: "PLA", debut: 230, fin: 190 },
  { valeur: "abs", etiquette: "ABS / ASA", debut: 270, fin: 230 },
  { valeur: "petg", etiquette: "PETG", debut: 250, fin: 230 },
  { valeur: "pctg", etiquette: "PCTG", debut: 280, fin: 240 },
  { valeur: "tpu", etiquette: "TPU", debut: 240, fin: 210 },
  { valeur: "pacf", etiquette: "PA-CF", debut: 320, fin: 280 },
  { valeur: "petcf", etiquette: "PET-CF", debut: 320, fin: 280 },
  { valeur: "autre", etiquette: "Autre", debut: 230, fin: 190 },
]);

const ESSAI_TEMPERATURE = {
  id: "temperature",
  nom: "Température",
  titre: "Température de la buse",
  wiki: "https://www.orcaslicer.com/wiki/temp_calib",
  but: "La tour descend par paliers de 5 °C, du plus chaud en bas au plus froid en haut. On garde le palier dont l'aspect, les ponts et les pointes sont les meilleurs ; au milieu si plusieurs se valent.",
  modele: () => "temperature_tower.drc",
  champs: [
    {
      genre: "choix", cle: "matiere", etiquette: "Matière",
      options: MATIERES_DE_LA_TOUR.map(({ valeur, etiquette }) => ({ valeur, etiquette })),
    },
    { genre: "nombre", cle: "debut", etiquette: "Première température", unite: "°C", min: 155, max: 500, pasFixe: 5, entier: true },
    { genre: "nombre", cle: "fin", etiquette: "Dernière température", unite: "°C", min: 155, max: 500, pasFixe: 5, entier: true },
    { genre: "case", cle: "echelleBuse", texte: "Mettre l'éprouvette à l'échelle de la buse" },
  ],
  defauts: () => ({ matiere: "pla", debut: 230, fin: 190, echelleBuse: true }),
  /* Changer de matière recharge la plage conseillée, comme dans Orca. */
  surChangement(cle, valeurs) {
    if (cle !== "matiere") return null;
    const m = MATIERES_DE_LA_TOUR.find((x) => x.valeur === valeurs.matiere);
    return m === undefined ? null : { debut: m.debut, fin: m.fin };
  },
  valider(p) {
    if (!(p.debut <= 500) || !(p.fin >= 155) || !(p.fin <= p.debut - PAS_DE_TEMPERATURE)) {
      return "Valeurs attendues : première ≤ 500 °C, dernière ≥ 155 °C, première ≥ dernière + 5 °C.";
    }
    return null;
  },
  /*
   * Le modèle fait 70 crans, de 500 °C en bas à 155 °C en haut. On enlève ce
   * qui est plus froid que la dernière température, puis ce qui est plus chaud
   * que la première : il reste exactement la plage demandée.
   */
  coupe: (p) => ({
    haut: ((TEMPERATURE_DU_BAS - p.fin) / PAS_DE_TEMPERATURE + 1) * CRAN_DE_TEMPERATURE_MM - EPSILON,
    bas: ((TEMPERATURE_DU_BAS - p.debut) / PAS_DE_TEMPERATURE) * CRAN_DE_TEMPERATURE_MM + EPSILON,
  }),
  echelle: (p, r) => (p.echelleBuse ? echelleDeBuse(r) : 1),
  reglages(p, r) {
    const impose = {
      // 1. CE QU'ON MESURE. La tour part à la première température : la buse ne
      // doit pas avoir à redescendre en arrivant sur le premier palier.
      temperature_buse: p.debut, temperature_buse_premiere: p.debut,
      // 2. SANS QUOI ON NE LIT RIEN. La tour est haute et mince : sans bordure
      // elle se couche. Et la couture en biseau module la matière le long de la
      // couture, ce qui brouille justement l'aspect qu'on vient juger.
      type_bordure: "complete", largeur_bordure: 5, ecart_bordure: 0,
      couture_biseau: "non",
    };
    if (p.echelleBuse) {
      impose.hauteur_couche = moitieDeBuse(r);
      impose.hauteur_premiere_couche = moitieDeBuse(r);
    }
    return impose;
  },
  modulations: (p, nombreDeCouches) =>
    bandesDeValeurs(nombreDeCouches, p.debut, p.fin, PAS_DE_TEMPERATURE).map(({ couche, valeur }) => ({
      couche,
      reglages: { temperature_buse: valeur, temperature_buse_premiere: valeur },
      gcode: ["M104 S" + valeur],
      etiquette: valeur + " °C",
    })),
};

// ── 2. Le débit volumétrique maximal ─────────────────────────────────────────

const ESSAI_DEBIT_MAX = {
  id: "debit_max",
  nom: "Débit maximal",
  titre: "Débit volumétrique maximal",
  wiki: "https://www.orcaslicer.com/wiki/volumetric_speed_calib",
  but: "Le débit monte avec la hauteur. On mesure au réglet la hauteur à laquelle la paroi commence à maigrir ou à perdre son brillant : débit = début + hauteur × pas.",
  modele: () => "SpeedTestStructure.drc",
  modeVase: true,
  champs: [
    { genre: "nombre", cle: "debut", etiquette: "Débit de départ", unite: "mm³/s", min: 1, max: 60, pasFixe: 1 },
    { genre: "nombre", cle: "fin", etiquette: "Débit d'arrivée", unite: "mm³/s", min: 2, max: 80, pasFixe: 1 },
    { genre: "nombre", cle: "pas", etiquette: "Pas", unite: "mm³/s", min: 0.1, max: 5, pasFixe: 0.1, decimales: 1 },
  ],
  defauts: () => ({ debut: 5, fin: 20, pas: 0.5 }),
  valider: (p) => plageCroissante(p, "mm³/s"),
  coupe: (p) => ({ haut: (p.fin - p.debut + 1) / p.pas, bas: null }),
  echelle: () => 1,
  reglages(p, r) {
    const buse = r.diametre_buse ?? BUSE_DE_REFERENCE;
    return {
      // 1. CE QU'ON MESURE. Le plafond est levé : c'est lui qu'on cherche, il ne
      // peut pas se brider lui-même. Et une ligne large sur une couche haute
      // atteint le débit visé à une vitesse que la mécanique tient vraiment —
      // sinon on mesurerait la limite du moteur, pas celle de la buse.
      debit_maximal: Math.max(r.debit_maximal ?? 0, SANS_PLAFOND_DE_DEBIT),
      largeur_paroi_exterieure: arrondi(buse * 1.75),
      hauteur_couche: arrondi(buse * 0.8),
      hauteur_premiere_couche: arrondi(buse * 0.8),
      // 2. SANS QUOI ON NE LIT RIEN. Une bande ralentie parce que sa couche est
      // courte ne serait plus au débit gravé en face d'elle.
      temps_couche_min: 0,
      // Un mur d'une seule ligne, creux : tout ce qui est posé l'est au débit
      // qu'on teste. Et une bordure, parce que la structure est mince et haute.
      nombre_parois: 1, couches_dessus: 0, couches_dessous: 0, densite_remplissage: 0,
      type_bordure: "complete", largeur_bordure: 5, ecart_bordure: 0,
    };
  },
  /* Le débit demandé croît avec la hauteur ; le trancheur en tire la vitesse. */
  modulations: (p, _nombreDeCouches, _r, couches) =>
    (couches?.hauteurs ?? []).map((z, k) => {
      const debit = arrondi(p.debut + z * p.pas);
      return { couche: k, debitImpose: debit, etiquette: debit + " mm³/s" };
    }),
};

// ── 3. L'avance de pression ──────────────────────────────────────────────────

export const METHODES_DE_PRESSION = Object.freeze([
  { valeur: "tour", etiquette: "Tour", fichier: "tower_with_seam.drc" },
  { valeur: "ligne", etiquette: "Ligne", fichier: "pressure_advance_test.drc" },
]);

const ESSAI_PRESSION = {
  id: "pression",
  nom: "Avance de pression",
  titre: "Avance de pression (K)",
  wiki: "https://www.orcaslicer.com/wiki/pressure_advance_calib",
  but: "K monte avec la hauteur. On mesure la hauteur du coin le plus net : K = début + hauteur × pas. Un coin bombé et arrondi veut dire K trop bas ; un coin creusé, K trop haut.",
  modele: (p) => (METHODES_DE_PRESSION.find((m) => m.valeur === p.methode) ?? METHODES_DE_PRESSION[0]).fichier,
  champs: [
    {
      genre: "choix", cle: "extrudeur", etiquette: "Extrudeur",
      options: [{ valeur: "direct", etiquette: "Direct (DDE)" }, { valeur: "bowden", etiquette: "Bowden" }],
    },
    {
      genre: "choix", cle: "methode", etiquette: "Méthode",
      options: METHODES_DE_PRESSION.map(({ valeur, etiquette }) => ({ valeur, etiquette })),
    },
    { genre: "nombre", cle: "debut", etiquette: "K de départ", min: 0, max: 1, pasFixe: 0.002, decimales: 3 },
    { genre: "nombre", cle: "fin", etiquette: "K d'arrivée", min: 0.002, max: 2, pasFixe: 0.002, decimales: 3 },
    { genre: "nombre", cle: "pas", etiquette: "Pas", min: 0.001, max: 0.1, pasFixe: 0.001, decimales: 3 },
  ],
  defauts: () => ({ extrudeur: "direct", methode: "tour", debut: 0, fin: 0.1, pas: 0.002 }),
  /* Les plages d'Orca : un Bowden demande des K dix fois plus grands. */
  surChangement(cle, valeurs) {
    if (cle !== "extrudeur") return null;
    return valeurs.extrudeur === "bowden"
      ? { debut: 0, fin: 1.0, pas: 0.05 }
      : { debut: 0, fin: 0.1, pas: 0.002 };
  },
  valider(p) {
    if (!(p.debut >= 0) || !(p.fin > p.debut) || !(p.pas >= 0.001)) {
      return "Valeurs attendues : K de départ ≥ 0, K d'arrivée > K de départ, pas ≥ 0,001.";
    }
    return null;
  },
  coupe: () => null,
  echelle: () => 1,
  /*
   * Rien ici ne touche à la VITESSE ni à l'ACCÉLÉRATION, et c'est voulu : K
   * compense le retard de pression aux changements de régime, donc il se mesure
   * dans le régime où l'on imprimera vraiment. Orca fait pareil pour la tour.
   * Changer ses vitesses demande de refaire cet essai, pas l'inverse.
   */
  reglages: () => ({
    // 2. SANS QUOI ON NE LIT RIEN. Le coin qu'on juge est celui qui suit la
    // couture : elle doit être au même endroit à chaque couche, et à l'arrière,
    // pour qu'on compare des coins comparables. Le biseau, lui, module la
    // matière le long de cette couture — exactement ce qu'on vient mesurer.
    position_couture: "arriere",
    couture_biseau: "non",
    // Une bande ralentie parce que sa couche est courte ne serait pas imprimée à
    // la même vitesse que les autres : les K ne seraient plus comparables.
    temps_couche_min: 0,
    // La tour est creuse et haute : deux parois, aucune peau, aucun remplissage,
    // et des oreilles pour qu'elle tienne debout. C'est l'éprouvette d'Orca.
    nombre_parois: 2, couches_dessus: 0, couches_dessous: 0, densite_remplissage: 0,
    type_bordure: "oreilles", largeur_bordure: 6, ecart_bordure: 0, angle_des_oreilles: 135,
  }),
  modulations: (p, nombreDeCouches) =>
    bandesDeValeurs(nombreDeCouches, p.debut, p.fin, p.pas).map(({ couche, valeur }) => ({
      couche,
      reglages: { pression_avance: valeur },
      gcode: ["M900 K" + valeur.toFixed(4)],
      etiquette: "K " + valeur.toFixed(3),
    })),
};

// ── 4. Le rapport de débit ───────────────────────────────────────────────────

/*
 * Quatre jeux de plaquettes, repris d'Orca. Les deux passes historiques
 * appliquent un POURCENTAGE au rapport en vigueur ; les deux jeux « YOLO »
 * ajoutent un ÉCART ABSOLU. Les plaquettes et leurs places viennent de
 * calibration/modeles/plaques_de_debit.json.
 */
export const JEUX_DE_DEBIT = Object.freeze([
  { valeur: "yolo", etiquette: "YOLO (recommandé)", dossier: "debit_yolo", absolu: true },
  { valeur: "yolo_fin", etiquette: "YOLO (perfectionniste)", dossier: "debit_yolo_fin", absolu: true },
  { valeur: "passe1", etiquette: "Passe 1 (grossière)", dossier: "debit_passe1", absolu: false },
  { valeur: "passe2", etiquette: "Passe 2 (fine)", dossier: "debit_passe2", absolu: false },
]);

const ESSAI_DEBIT = {
  id: "debit",
  nom: "Rapport de débit",
  titre: "Rapport de débit",
  wiki: "https://www.orcaslicer.com/wiki/flow_ratio_calib",
  but: "Chaque plaquette porte un rapport de débit différent, gravé devant elle. On garde celle dont le dessus est le plus lisse, en regardant le CENTRE : les départs et les fins de ligne paraissent toujours un peu sur-extrudés, c'est normal. Ne jamais retenir une plaquette qui montre le moindre manque.",
  modele: () => null,   // plusieurs pièces : voir plaques()
  champs: [
    {
      genre: "choix", cle: "jeu", etiquette: "Méthode",
      options: JEUX_DE_DEBIT.map(({ valeur, etiquette }) => ({ valeur, etiquette })),
    },
    {
      genre: "choix", cle: "motifDessus", etiquette: "Motif du dessus",
      options: [{ valeur: "monotone", etiquette: "Monotone" }],
    },
  ],
  defauts: () => ({ jeu: "yolo", motifDessus: "monotone" }),
  valider: () => null,
  coupe: () => null,
  jeuDe: (p) => JEUX_DE_DEBIT.find((j) => j.valeur === p.jeu) ?? JEUX_DE_DEBIT[0],
  /*
   * L'échelle Z vise dix couches : deux de dessous, cinq de dessus, trois de
   * remplissage. En XY, l'éprouvette ne grossit que pour les grosses buses.
   */
  echelle(p, r) {
    const buse = r.diametre_buse ?? BUSE_DE_REFERENCE;
    const couche = buse / 2;
    const premiere = Math.max(r.hauteur_premiere_couche ?? couche, couche);
    const z = (premiere + 9 * couche) / 2;
    const xy = buse / 0.6;
    return xy > 1.2 ? [xy, xy, z] : [1, 1, z];
  },
  reglages(p, r) {
    const buse = r.diametre_buse ?? BUSE_DE_REFERENCE;
    return {
      // 2. SANS QUOI ON NE LIT RIEN. Tout ici sert la SURFACE DU DESSUS, qui est
      // la seule chose qu'on regarde.
      // Une paroi unique, et aucune boucle au milieu du dessus : la surface
      // lisible ne doit pas être mangée par des tours de paroi.
      nombre_parois: 1, une_paroi_sur_dessus: "oui",
      // Un appui régulier et identique sous chaque plaquette : un dessus qui
      // s'affaisse entre deux lignes de remplissage se lit comme un manque de
      // matière, et on comparerait des affaissements au lieu de débits.
      densite_remplissage: 35, motif_remplissage: "rectiligne",
      couches_dessous: 2, couches_dessus: 5, epaisseur_dessus: 0, epaisseur_dessous: 0,
      // Des lignes un peu larges, posées dans un seul sens : c'est entre elles
      // que le manque ou l'excès se voit.
      motif_dessus: p.motifDessus,
      largeur_dessus: arrondi(buse * 1.2),
      largeur_plein_interieur: arrondi(buse * 1.2),
      // Trois façons de maquiller la surface, qu'on interdit : le repassage la
      // lisse, le biseau module la matière, et les interstices y ajoutent des
      // filets fins qui ressemblent à de la sur-extrusion.
      repassage: "non", couture_biseau: "non", remplir_interstices: "nulle_part",
    };
  },
  /* Une pièce par plaquette, chacune tranchée avec son propre rapport de débit. */
  plaques(p, r, registre) {
    const jeu = this.jeuDe(p);
    const base = r.rapport_debit ?? 1;
    return (registre[p.jeu] ?? []).map((plaque) => ({
      fichier: jeu.dossier + "/" + plaque.fichier + ".drc",
      nom: (plaque.ecart > 0 ? "+" : "") + plaque.ecart + (jeu.absolu ? "" : " %"),
      x: plaque.x, y: plaque.y,
      ecarts: {
        rapport_debit: arrondi(jeu.absolu ? base + plaque.ecart : (base * (100 + plaque.ecart)) / 100),
      },
    }));
  },
};

// ── 5. La rétraction ─────────────────────────────────────────────────────────

const ESSAI_RETRACTION = {
  id: "retraction",
  nom: "Rétraction",
  titre: "Rétraction",
  wiki: "https://www.orcaslicer.com/wiki/retraction_calib",
  but: "La longueur de rétraction monte d'un cran par millimètre de hauteur. On garde la plus COURTE qui ne laisse plus de fils. Si la tour est propre dès le bas, 0,2 à 0,4 mm suffit ; si elle file encore en haut, sécher le filament avant de recommencer.",
  modele: () => "retraction_tower.drc",
  champs: [
    { genre: "nombre", cle: "debut", etiquette: "Longueur de départ", unite: "mm", min: 0, max: 6, pasFixe: 0.1, decimales: 2 },
    { genre: "nombre", cle: "fin", etiquette: "Longueur d'arrivée", unite: "mm", min: 0.2, max: 10, pasFixe: 0.1, decimales: 2 },
    { genre: "nombre", cle: "pas", etiquette: "Pas", unite: "mm", min: 0.02, max: 1, pasFixe: 0.02, decimales: 2 },
  ],
  // Les valeurs d'Orca pour un extrudeur direct ; en Bowden, 1 → 6 mm par 0,2.
  defauts: () => ({ debut: 0, fin: 2, pas: 0.1 }),
  valider(p) {
    if (!(p.debut >= 0) || !(p.pas > 0) || !(p.fin > p.debut + p.pas)) {
      return "Valeurs attendues : début ≥ 0, pas > 0, fin > début + pas (en mm).";
    }
    return null;
  },
  coupe: (p) => ({ haut: 1.0 + 0.4 + (p.fin - p.debut) / p.pas - EPSILON, bas: null }),
  echelle: () => 1,
  reglages(p, r) {
    const buse = r.diametre_buse ?? BUSE_DE_REFERENCE;
    const couche = buse <= 0.1 ? 0.05 : buse <= 0.2 ? 0.1 : 0.2;
    return {
      // 2. SANS QUOI ON NE LIT RIEN. Les piliers sont creux : le seul déplacement
      // d'une couche est le saut d'un pilier à l'autre, donc le seul fil visible
      // vient de la rétraction qu'on teste.
      nombre_parois: 2, couches_dessus: 0, couches_dessous: 3, densite_remplissage: 0,
      hauteur_couche: couche, hauteur_premiere_couche: couche,
      // La lecture se fait sur la COLONNE de coutures : elle doit être droite,
      // au même endroit à chaque couche, et ne pas être fondue par un biseau.
      position_couture: "alignee", ordre_parois: "interieures_puis_exterieure",
      couture_biseau: "non",
    };
  },
  /* Un cran par millimètre au-dessus des 0,4 mm de socle, la formule d'Orca. */
  modulations(p, _nombreDeCouches, _r, couches) {
    let precedente = null;
    const sortie = [];
    (couches?.hauteurs ?? []).forEach((z, k) => {
      const valeur = arrondi(p.debut + Math.floor(Math.max(0, z - 0.4)) * p.pas);
      if (valeur === precedente) return;
      precedente = valeur;
      sortie.push({ couche: k, reglages: { longueur_retraction: valeur }, etiquette: valeur + " mm" });
    });
    return sortie;
  },
};

// ── 6. Le passage des coins ──────────────────────────────────────────────────

export const MODELES_DE_CORNERING = Object.freeze([
  { valeur: "resonance", etiquette: "Tour à ondulations", fichier: "ringing_tower.drc" },
  { valeur: "rapide", etiquette: "Tour rapide", fichier: "fast_tower_test.drc" },
  { valeur: "scv", etiquette: "SCV-V2", fichier: "SCV-V2.drc" },
]);

/*
 * Les réglages communs aux trois essais de DYNAMIQUE — passage des coins et
 * lissage d'entrée. Ce sont les seuls à toucher la vitesse et l'accélération, et
 * ils y sont obligés : l'écho qu'ils mesurent n'existe pas à 50 mm/s. Il faut
 * secouer la machine pour le voir.
 *
 * Les valeurs ne sont pas écrites ici : elles viennent du PRÉRÉGLAGE
 * D'IMPRIMANTE (vitesse_max_machine, acceleration_max_machine), là où sont déjà
 * les limites de la machine. Changer de machine les change ; rien à retoucher
 * dans les essais. C'est ce que fait Orca, qui lit machine_max_speed_x et
 * machine_max_acceleration_extruding de son profil d'imprimante.
 *
 * L'éprouvette est un mur d'une ligne, creux : ce qu'on regarde est la trace que
 * la mécanique laisse sur une paroi, et rien d'autre ne doit la marquer.
 */
function reglagesDeDynamique(r) {
  const vitesse = r.vitesse_max_machine ?? 500;
  const acceleration = r.acceleration_max_machine ?? 20000;
  return {
    // 3. LE RÉGIME OÙ LA MESURE EXISTE.
    vitesse_paroi_exterieure: vitesse,
    acceleration_defaut: acceleration,
    acceleration_paroi_exterieure: acceleration,
    // 2. SANS QUOI ON NE LIT RIEN. Un ralentissement de couche courte ferait
    // varier la vitesse d'une bande à l'autre : on ne saurait plus si l'écho
    // change à cause du réglage testé ou de la vitesse.
    temps_couche_min: 0,
    // Un mur d'une seule ligne, creux, et une bordure : la tour est haute.
    nombre_parois: 1, couches_dessus: 0, couches_dessous: 1, densite_remplissage: 0,
    type_bordure: "complete", largeur_bordure: 3, ecart_bordure: 0,
    couture_biseau: "non",
  };
}

const ESSAI_CORNERING = {
  id: "cornering",
  nom: "Passage des coins",
  titre: "Passage des coins (jerk)",
  wiki: "https://www.orcaslicer.com/wiki/cornering_calib",
  but: "Le jerk monte avec la hauteur. On mesure la hauteur à laquelle les coins cessent d'être nets, et on lit la valeur correspondante. Une matière opaque et brillante rend les ondulations bien plus visibles.",
  modele: (p) => (MODELES_DE_CORNERING.find((m) => m.valeur === p.modele) ?? MODELES_DE_CORNERING[0]).fichier,
  champs: [
    {
      genre: "choix", cle: "modele", etiquette: "Éprouvette",
      options: MODELES_DE_CORNERING.map(({ valeur, etiquette }) => ({ valeur, etiquette })),
    },
    { genre: "nombre", cle: "debut", etiquette: "Jerk de départ", unite: "mm/s", min: 1, max: 40, pasFixe: 1, decimales: 1 },
    { genre: "nombre", cle: "fin", etiquette: "Jerk d'arrivée", unite: "mm/s", min: 2, max: 60, pasFixe: 1, decimales: 1 },
    { genre: "nombre", cle: "pas", etiquette: "Pas", unite: "mm/s", min: 0.1, max: 10, pasFixe: 0.5, decimales: 1 },
  ],
  defauts: () => ({ modele: "resonance", debut: 1, fin: 20, pas: 1 }),
  valider: (p) => plageCroissante(p, "mm/s"),
  coupe: () => null,
  echelle: () => 1,
  /*
   * 1. CE QU'ON MESURE. Le jerk ne limite la vitesse dans un coin que si la
   * vitesse d'arrivée est haute : à 50 mm/s, tous les jerks se valent et la tour
   * sort identique du bas au haut. D'où la dynamique poussée au maximum. Le
   * plafond de débit est levé pour la même raison qu'à l'essai de débit maximal :
   * sinon c'est lui, et non le jerk, qui déciderait de la vitesse réelle.
   */
  reglages: (p, r) => ({
    ...reglagesDeDynamique(r),
    debit_maximal: Math.max(r.debit_maximal ?? 0, SANS_PLAFOND_DE_DEBIT),
  }),
  modulations: (p, nombreDeCouches) =>
    bandesDeValeurs(nombreDeCouches, p.debut, p.fin, p.pas).map(({ couche, valeur }) => ({
      couche,
      gcode: ["M205 X" + valeur + " Y" + valeur],
      etiquette: "Jerk " + valeur + " mm/s",
    })),
};

// ── 7 et 8. Le lissage d'entrée ──────────────────────────────────────────────

const AVERTISSEMENT_SHAPING = "Le lissage d'entrée est un réglage du firmware (M593, Marlin ou Klipper). Les P1 font leur propre compensation de vibrations, lancée depuis l'écran de l'imprimante : cet essai ne les concerne pas.";

const ESSAI_SHAPING_FREQUENCE = {
  id: "shaping_frequence",
  nom: "Lissage — fréquence",
  titre: "Lissage d'entrée : fréquence",
  wiki: "https://www.orcaslicer.com/wiki/input_shaping_calib",
  but: "La fréquence monte avec la hauteur. On garde celle où les ondulations disparaissent.",
  avertissement: AVERTISSEMENT_SHAPING,
  modele: () => "ringing_tower.drc",
  champs: [
    { genre: "nombre", cle: "debutX", etiquette: "Fréquence X de départ", unite: "Hz", min: 5, max: 200, pasFixe: 5, entier: true },
    { genre: "nombre", cle: "finX", etiquette: "Fréquence X d'arrivée", unite: "Hz", min: 10, max: 300, pasFixe: 5, entier: true },
    { genre: "nombre", cle: "debutY", etiquette: "Fréquence Y de départ", unite: "Hz", min: 5, max: 200, pasFixe: 5, entier: true },
    { genre: "nombre", cle: "finY", etiquette: "Fréquence Y d'arrivée", unite: "Hz", min: 10, max: 300, pasFixe: 5, entier: true },
  ],
  defauts: () => ({ debutX: 15, finX: 110, debutY: 15, finY: 110 }),
  valider: (p) => ((p.finX > p.debutX && p.finY > p.debutY) ? null : "L'arrivée doit dépasser le départ, sur X comme sur Y."),
  coupe: () => null,
  echelle: () => 1,
  /*
   * 3. LE RÉGIME OÙ LA MESURE EXISTE. L'écho qu'on vient juger est la réponse de
   * la machine à une secousse : sans secousse, la tour est lisse à toutes les
   * fréquences et l'essai ne dit rien. Le plafond de débit, lui, n'est PAS levé —
   * comme chez Orca : la buse ne peut pas fondre ce qu'il faudrait à 500 mm/s, et
   * c'est l'accélération, pas la vitesse, qui fait l'écho.
   */
  reglages: (p, r) => reglagesDeDynamique(r),
  modulations(p, nombreDeCouches) {
    const memesAxes = p.debutX === p.debutY && p.finX === p.finY;
    return Array.from({ length: nombreDeCouches }, (_v, k) => {
      const x = valeurALaCouche(k, nombreDeCouches, p.debutX, p.finX);
      const y = valeurALaCouche(k, nombreDeCouches, p.debutY, p.finY);
      return {
        couche: k,
        gcode: memesAxes ? ["M593 F" + x] : ["M593 X F" + x, "M593 Y F" + y],
        etiquette: memesAxes ? x + " Hz" : "X " + x + " · Y " + y + " Hz",
      };
    });
  },
};

const ESSAI_SHAPING_AMORTISSEMENT = {
  id: "shaping_amortissement",
  nom: "Lissage — amortissement",
  titre: "Lissage d'entrée : amortissement",
  wiki: "https://www.orcaslicer.com/wiki/input_shaping_calib",
  but: "L'amortissement monte avec la hauteur, à fréquence fixée. On garde celui où les ondulations disparaissent.",
  avertissement: AVERTISSEMENT_SHAPING,
  modele: () => "ringing_tower.drc",
  champs: [
    { genre: "nombre", cle: "frequenceX", etiquette: "Fréquence X", unite: "Hz", min: 5, max: 300, pasFixe: 5, entier: true },
    { genre: "nombre", cle: "frequenceY", etiquette: "Fréquence Y", unite: "Hz", min: 5, max: 300, pasFixe: 5, entier: true },
    { genre: "nombre", cle: "debut", etiquette: "Amortissement de départ", min: 0, max: 1, pasFixe: 0.05, decimales: 2 },
    { genre: "nombre", cle: "fin", etiquette: "Amortissement d'arrivée", min: 0.05, max: 1, pasFixe: 0.05, decimales: 2 },
  ],
  defauts: () => ({ frequenceX: 30, frequenceY: 30, debut: 0, fin: 0.5 }),
  valider: (p) => (p.fin > p.debut ? null : "L'amortissement d'arrivée doit dépasser celui de départ."),
  coupe: () => null,
  echelle: () => 1,
  // Même régime que l'essai de fréquence : sans secousse, rien à amortir.
  reglages: (p, r) => reglagesDeDynamique(r),
  modulations: (p, nombreDeCouches) => Array.from({ length: nombreDeCouches }, (_v, k) => {
    const d = valeurALaCouche(k, nombreDeCouches, p.debut, p.fin);
    return {
      couche: k,
      gcode: ["M593 X F" + p.frequenceX, "M593 Y F" + p.frequenceY, "M593 D" + d],
      etiquette: "Amortissement " + d,
    };
  }),
};

// ── 9. Le VFA ────────────────────────────────────────────────────────────────

const ESSAI_VFA = {
  id: "vfa",
  nom: "VFA",
  titre: "Vitesses à éviter (VFA)",
  wiki: "https://www.orcaslicer.com/wiki/vfa_calib",
  but: "La vitesse monte par paliers. On cherche les paliers où la surface se gâte : ce sont des résonances du moteur, et ce qu'on en tire n'est pas une vitesse maximale mais une PLAGE À ÉVITER — en dessous comme au-dessus, la surface est meilleure.",
  modele: () => "vfa.drc",
  modeVase: true,
  champs: [
    { genre: "nombre", cle: "debut", etiquette: "Vitesse de départ", unite: "mm/s", min: 10, max: 400, pasFixe: 10, entier: true },
    { genre: "nombre", cle: "fin", etiquette: "Vitesse d'arrivée", unite: "mm/s", min: 20, max: 600, pasFixe: 10, entier: true },
    { genre: "nombre", cle: "pas", etiquette: "Pas", unite: "mm/s", min: 1, max: 50, pasFixe: 5, entier: true },
    { genre: "case", cle: "echelleBuse", texte: "Mettre l'éprouvette à l'échelle de la buse" },
    { genre: "case", cle: "ajusterAuDebit", texte: "Baisser la hauteur de couche si le débit ne suit pas" },
  ],
  defauts: () => ({ debut: 40, fin: 200, pas: 10, echelleBuse: true, ajusterAuDebit: true }),
  valider(p) {
    if (!(p.debut > 10) || !(p.pas > 0) || !(p.fin > p.debut + p.pas)) {
      return "Valeurs attendues : début > 10, pas > 0, fin > début + pas (en mm/s).";
    }
    return null;
  },
  coupe: (p) => ({ haut: PALIER_VFA_MM * ((p.fin - p.debut) / p.pas + 1) - EPSILON, bas: null }),
  /*
   * En XY l'éprouvette suit la buse ; en Z elle suit la hauteur de couche, pour
   * qu'un palier fasse toujours exactement 25 couches.
   */
  echelle(p, r) {
    if (!p.echelleBuse) return 1;
    const couche = p.hauteurCouche ?? moitieDeBuse(r);
    const xy = echelleDeBuse(r);
    return [xy, xy, (COUCHES_PAR_PALIER_VFA * couche) / PALIER_VFA_MM];
  },
  /*
   * La hauteur de couche que l'essai peut se permettre : s'il faut 200 mm/s et
   * que le débit maximal du filament ne suit pas, on amincit la couche plutôt
   * que de laisser le plafond rogner la vitesse en silence. C'est le
   * « Auto-adjust to max volumetric speed » d'Orca.
   */
  hauteurTenable(p, r) {
    const couche = moitieDeBuse(r);
    if (!p.ajusterAuDebit) return { couche, atteinte: p.fin };
    const largeur = r.largeur_paroi_exterieure ?? (r.diametre_buse ?? BUSE_DE_REFERENCE);
    const debitMax = r.debit_maximal ?? Infinity;
    const vitessePour = (h) => debitMax / (largeur * h);
    if (vitessePour(couche) >= p.fin) return { couche, atteinte: p.fin };
    for (const essai of [0.16, 0.12, 0.1, 0.08, 0.06]) {
      if (essai <= couche && vitessePour(essai) >= p.fin) return { couche: essai, atteinte: p.fin };
    }
    const plusFine = 0.06;
    return { couche: plusFine, atteinte: arrondi(vitessePour(plusFine)) };
  },
  reglages(p, r) {
    const impose = {
      // 1. CE QU'ON MESURE est la VITESSE elle-même, imposée bande par bande. Le
      // plafond de débit doit donc être levé : sinon le trancheur écrête les
      // bandes rapides, toutes celles du haut sortent à la même vitesse, et on
      // ne verrait jamais la résonance qu'on cherche. Les bandes les plus
      // rapides peuvent manquer de matière : c'est normal, on y regarde la
      // trace laissée par la mécanique, pas le remplissage de la ligne.
      debit_maximal: Math.max(r.debit_maximal ?? 0, SANS_PLAFOND_DE_DEBIT),
      // 2. SANS QUOI ON NE LIT RIEN. Un mur d'une ligne, creux ; aucune bande
      // ralentie pour cause de couche courte, sinon sa vitesse n'est plus celle
      // qui est gravée en face ; une bordure, parce que la tour est haute.
      nombre_parois: 1, couches_dessus: 0, couches_dessous: 1, densite_remplissage: 0,
      temps_couche_min: 0,
      type_bordure: "complete", largeur_bordure: 3, ecart_bordure: 0,
    };
    if (p.echelleBuse) {
      const couche = p.hauteurCouche ?? moitieDeBuse(r);
      impose.hauteur_couche = couche;
      impose.hauteur_premiere_couche = couche;
    }
    return impose;
  },
  modulations: (p, nombreDeCouches) =>
    bandesDeValeurs(nombreDeCouches, p.debut, p.fin, p.pas).map(({ couche, valeur }) => ({
      couche, vitesseImposee: valeur, etiquette: valeur + " mm/s",
    })),
};

// ── 10. L'écrasement de la première couche ──────────────────────────────────

/*
 * Les deux jeux de plaquettes gravées d'OrcaSlicer, repris tels quels : ce sont
 * ceux de leur essai de débit « YOLO », et leurs gravures tombent juste pour un
 * décalage en Z. Onze plaquettes de −0,05 à +0,05 par pas de 0,01, ou seize de
 * −0,04 à +0,035 par pas de 0,005. Un pas de 0,01 mm est déjà le vingtième d'une
 * couche : le jeu fin ne sert que si le grossier laisse hésiter entre deux voisines.
 */
export const JEUX_D_ECRASEMENT = Object.freeze([
  { valeur: "yolo", etiquette: "Pas de 0,01 mm (11 plaquettes)", dossier: "debit_yolo" },
  { valeur: "yolo_fin", etiquette: "Pas de 0,005 mm (16 plaquettes)", dossier: "debit_yolo_fin" },
]);

/*
 * Le seul essai qui ne vienne pas d'OrcaSlicer : ils n'en ont pas. La raison
 * n'est pas qu'il serait inutile, c'est qu'ils ne sauraient pas quoi en faire —
 * Orca n'a pas de profil de plaque, donc nulle part où ranger un décalage Z
 * propre à une plaque. Nous, oui, et c'est même le seul profil qui nous soit
 * propre. La référence est donc Ellis' Print Tuning Guide (« First Layer
 * Squish »), qui est la méthode de référence sur le sujet : on imprime des
 * plaquettes et on retient celle dont les lignes restent visibles au centre
 * sans laisser de trou entre elles.
 *
 * Là où Ellis règle le Z en direct, pendant l'impression, nous posons une
 * plaquette PAR décalage : rien à ajuster à la volée, et le résultat reste sur
 * le plateau, comparable et conservable. C'est ce que permet le `decalageZ` par
 * pièce de generation_gcode.
 *
 * L'ÉPROUVETTE est celle de leur essai de débit « YOLO » : onze plaquettes
 * gravées de −0,05 à +0,05 par pas de 0,01. Gravées en centièmes de millimètre,
 * elles font exactement l'échelle qu'il nous faut — le nombre lu sur la
 * plaquette retenue est la valeur à taper, telle quelle, dans le décalage Z de
 * la plaque. D'où le choix de ne rien redessiner.
 */
const ESSAI_ECRASEMENT = {
  id: "ecrasement",
  nom: "Première couche",
  titre: "Écrasement de la première couche",
  wiki: "https://ellis3dp.com/Print-Tuning-Guide/articles/first_layer_squish.html",
  but: "Chaque plaquette est posée à une hauteur de buse différente, gravée devant elle, en millimètres. On retient la MOINS écrasée qui ne laisse aucun trou entre ses lignes : les lignes doivent rester visibles au centre, sans que l'on voie à travers. Trop écrasée, les lignes disparaissent et la surface ondule. Le nombre gravé se tape tel quel dans « Décalage Z de la plaque ». Si les pièces s'arrachent mal, c'est du côté des valeurs POSITIVES qu'il faut regarder : moins écrasée, la première couche s'ancre moins dans la surface.",
  modele: () => null,   // plusieurs pièces : voir plaques()
  champs: [
    {
      genre: "choix", cle: "jeu", etiquette: "Finesse",
      options: JEUX_D_ECRASEMENT.map(({ valeur, etiquette }) => ({ valeur, etiquette })),
    },
  ],
  defauts: () => ({ jeu: "yolo" }),
  valider: () => null,
  coupe: () => null,
  jeuDe: (p) => JEUX_D_ECRASEMENT.find((j) => j.valeur === p.jeu) ?? JEUX_D_ECRASEMENT[0],
  /* Dix couches, comme l'essai de débit : la plaquette doit tenir pour être décollée. */
  echelle(p, r) {
    const buse = r.diametre_buse ?? BUSE_DE_REFERENCE;
    const couche = buse / 2;
    const premiere = Math.max(r.hauteur_premiere_couche ?? couche, couche);
    const z = (premiere + 9 * couche) / 2;
    const xy = buse / 0.6;
    return xy > 1.2 ? [xy, xy, z] : [1, 1, z];
  },
  reglages(p, r) {
    return {
      // 1. CE QU'ON MESURE. Le décalage de la plaque repart de zéro : le nombre
      // gravé sur la plaquette retenue doit se lire en ABSOLU, sinon ce n'est
      // qu'un écart à une valeur qu'on cherche encore.
      decalage_z_plaque: 0,
      // 2. SANS QUOI ON NE LIT RIEN. La patte d'éléphant rentre le contour de la
      // première couche : on lirait une correction, pas un écrasement.
      compensation_premiere_couche: 0,
      // La surface qu'on lit est la PREMIÈRE COUCHE : il lui faut au moins une
      // couche pleine, posée en lignes parallèles — c'est entre ces lignes qu'on
      // cherche les trous. On BORNE le réglage de l'utilisateur au lieu de le
      // remplacer : trois couches de dessous restent trois couches de dessous.
      couches_dessous: Math.max(1, r.couches_dessous ?? 1),
      motif_dessous: "monotone",
      // La jupe est posée au Z du plateau, pas à celui des plaquettes : elle
      // donnerait un écrasement de plus, qui n'est à personne.
      tours_jupe: 0,
    };
  },
  /* Une plaquette par décalage, chacune posée à sa propre hauteur. */
  plaques(p, r, registre) {
    const jeu = this.jeuDe(p);
    return (registre[jeu.valeur] ?? []).map((plaque) => ({
      fichier: jeu.dossier + "/" + plaque.fichier + ".drc",
      nom: (plaque.ecart > 0 ? "+" : "") + plaque.ecart + " mm",
      x: plaque.x, y: plaque.y,
      ecarts: null,
      decalageZ: plaque.ecart,
    }));
  },
};

// ── Le menu, dans l'ordre d'OrcaSlicer ───────────────────────────────────────

export const ESSAIS = Object.freeze([
  ESSAI_ECRASEMENT,
  ESSAI_TEMPERATURE,
  ESSAI_DEBIT_MAX,
  ESSAI_PRESSION,
  ESSAI_DEBIT,
  ESSAI_RETRACTION,
  ESSAI_CORNERING,
  ESSAI_SHAPING_FREQUENCE,
  ESSAI_SHAPING_AMORTISSEMENT,
  ESSAI_VFA,
]);

export const essaiDe = (id) => ESSAIS.find((e) => e.id === id) ?? null;

/* Les valeurs de départ d'un essai, qui peuvent dépendre des réglages en vigueur. */
export function parametresParDefaut(essai, reglages = {}) {
  return { ...essai.defauts(reglages) };
}

/*
 * Toutes les clés qu'un essai peut imposer au plateau.
 *
 * Poser une éprouvette écrit ces réglages dans les ÉCARTS du plateau : c'est
 * ainsi que l'essai se fait trancher comme il l'entend. Les retirer est la
 * moitié qui manquait — sans cette liste, une seule paroi, l'absence de jupe ou
 * un décalage de plaque remis à zéro restaient sur le plateau après le retrait
 * de l'éprouvette, et la pièce suivante s'imprimait avec, sans que rien ne le
 * dise. Retirer l'essai rend donc le plateau à ses préréglages, y compris sur
 * un réglage que l'utilisateur aurait lui-même écarté avant de poser l'essai :
 * c'est la règle la plus simple à retenir, et la seule qui laisse un plateau
 * propre.
 *
 * Les valeurs ne servent pas, seules les clés comptent : les paramètres passés
 * ici sont donc n'importe quels paramètres valides.
 */
const REGLAGES_TEMOINS = Object.freeze({
  diametre_buse: 0.4, hauteur_couche: 0.2, hauteur_premiere_couche: 0.2,
});

export const CLES_IMPOSEES_PAR_LES_ESSAIS = Object.freeze([...new Set(
  ESSAIS.flatMap((essai) => Object.keys(
    essai.reglages(parametresParDefaut(essai, REGLAGES_TEMOINS), REGLAGES_TEMOINS) ?? {},
  )),
)]);

/* Les trois échelles d'un essai, toujours sous la forme [x, y, z]. */
export function echelleDeLEssai(essai, parametres, reglages) {
  const e = essai.echelle ? essai.echelle(parametres, reglages) : 1;
  return Array.isArray(e) ? e : [e, e, e];
}
