/*
 * noyau/types/type_noeud_fixations.js
 *
 * Trois objets pour visser des pièces imprimées entre elles, aux cotes des
 * normes (ISO 4762, 10642, 4032) et des inserts laiton courants :
 *   - trou de vis : passage simple, lamé (tête cylindrique noyée), fraisé
 *     (tête conique affleurante), taraudé (la vis fait son filet dans le
 *     plastique) ou logement d'insert à chaud ;
 *   - logement d'écrou : une empreinte hexagonale, avec le passage de la vis ;
 *   - vis : une vis lisse, pour voir l'assemblage (pas de filet).
 * Les trous naissent en mode « trou » : grouper les avec la pièce à percer.
 *
 * Les trous s'enfoncent SOUS leur origine (le point qu'on pose sur la face) et
 * dépassent d'un millimètre au-dessus : posés sur une face, ils percent la
 * pièce sans laisser de peau. Le jeu s'ajoute aux diamètres : un trou
 * imprimé sort toujours un peu plus petit que dessiné.
 *
 * Token attendu dans le document, par exemple :
 *   { type: "trou_de_vis", parametres: { vis: "M3", forme: "lame", profondeur: 10, jeu: 0.2 }, trou: true }
 */

// Les cotes par diamètre nominal, en mm.
//   passage : trou de passage moyen ; tete / hauteurTete : vis à tête cylindrique ;
//   fraisee : diamètre de tête fraisée (90°) ; taraude : avant-trou dans le plastique ;
//   insert / profondeurInsert : insert laiton à chaud ; ecrou / epaisseurEcrou : écrou hexagonal (sur plats).
const COTES = {
  M2: { d: 2, passage: 2.4, tete: 3.8, hauteurTete: 2, fraisee: 3.8, taraude: 1.6, insert: 3.2, profondeurInsert: 4, ecrou: 4, epaisseurEcrou: 1.6 },
  "M2.5": { d: 2.5, passage: 2.9, tete: 4.5, hauteurTete: 2.5, fraisee: 4.7, taraude: 2.1, insert: 3.6, profondeurInsert: 5, ecrou: 5, epaisseurEcrou: 2 },
  M3: { d: 3, passage: 3.4, tete: 5.5, hauteurTete: 3, fraisee: 5.6, taraude: 2.5, insert: 4, profondeurInsert: 5.7, ecrou: 5.5, epaisseurEcrou: 2.4 },
  M4: { d: 4, passage: 4.5, tete: 7, hauteurTete: 4, fraisee: 7.5, taraude: 3.3, insert: 5.6, profondeurInsert: 8.1, ecrou: 7, epaisseurEcrou: 3.2 },
  M5: { d: 5, passage: 5.5, tete: 8.5, hauteurTete: 5, fraisee: 9.2, taraude: 4.2, insert: 6.4, profondeurInsert: 9.5, ecrou: 8, epaisseurEcrou: 4.7 },
  M6: { d: 6, passage: 6.6, tete: 10, hauteurTete: 6, fraisee: 11, taraude: 5, insert: 8, profondeurInsert: 12.7, ecrou: 10, epaisseurEcrou: 5.2 },
  M8: { d: 8, passage: 9, tete: 13, hauteurTete: 8, fraisee: 14.5, taraude: 6.8, insert: 10, profondeurInsert: 12.7, ecrou: 13, epaisseurEcrou: 6.8 },
};
const TAILLES = Object.keys(COTES).map((valeur) => ({ valeur, etiquette: valeur }));
const DEPASSE_MM = 1;
const FACETTES = 48;

const PARAMETRE_VIS = { etiquette: "Vis", defaut: "M3", choix: TAILLES };
const PARAMETRE_JEU = { etiquette: "Jeu d'impression", unite: "mm", defaut: 0.2, min: 0, max: 2, aide: "Ajouté aux diamètres : un trou imprimé sort un peu plus petit que dessiné. 0,2 mm convient à la plupart des imprimantes." };

/* Un cylindre de diamètre d, de z = bas à z = haut. */
const cylindre = (atelier, d, bas, haut) => atelier.Manifold.cylinder(haut - bas, d / 2, d / 2, FACETTES, false).translate([0, 0, bas]);
/* Un cône tronqué : diamètre dBas en bas, dHaut en haut. */
const cone = (atelier, dBas, dHaut, bas, haut) => atelier.Manifold.cylinder(haut - bas, dBas / 2, dHaut / 2, FACETTES, false).translate([0, 0, bas]);
/* Un prisme hexagonal de s sur plats. */
function hexagone(atelier, s, bas, haut) {
  const r = s / Math.sqrt(3);
  const points = Array.from({ length: 6 }, (_, i) => [r * Math.cos(i * Math.PI / 3), r * Math.sin(i * Math.PI / 3)]);
  return new atelier.CrossSection([points], "Positive").extrude(haut - bas).translate([0, 0, bas]);
}

export const typeTrouDeVis = {
  nom: "trou_de_vis",
  etiquette: "Trou de vis",
  termeDuProgramme: "perçage normalisé",
  aide: "Un trou aux cotes d'une vis : passage, lamé, fraisé, taraudé ou insert laiton. Se pose sur la face à percer, puis se groupe avec la pièce.",
  icone: "trou_de_vis",
  categorie: "bibliotheque",
  tailleParReglages: true,
  trouParDefaut: true,

  nomAuto: (n) => "Trou " + (n.parametres.vis ?? "M3") + " " + ({ passage: "de passage", lame: "lamé", fraise: "fraisé", taraude: "taraudé", insert: "pour insert" })[n.parametres.forme ?? "passage"],

  parametres: {
    vis: PARAMETRE_VIS,
    forme: {
      etiquette: "Forme",
      defaut: "lame",
      choix: [
        { valeur: "passage", etiquette: "Passage", aide: "La vis traverse sans accrocher." },
        { valeur: "lame", etiquette: "Lamé", aide: "La tête cylindrique s'enfonce dans la pièce." },
        { valeur: "fraise", etiquette: "Fraisé", aide: "La tête conique affleure la surface." },
        { valeur: "taraude", etiquette: "Taraudé", aide: "Trou plus petit : la vis creuse son filet dans le plastique." },
        { valeur: "insert", etiquette: "Insert laiton", aide: "Logement d'un insert fileté posé au fer à souder." },
      ],
    },
    profondeur: { etiquette: "Profondeur", unite: "mm", defaut: 10, min: 1, max: 500 },
    jeu: PARAMETRE_JEU,
  },

  construire(atelier, p) {
    const c = COTES[p.vis] ?? COTES.M3;
    const j = p.jeu ?? 0.2;
    const bas = -p.profondeur;
    const haut = DEPASSE_MM;
    if (p.forme === "taraude") return cylindre(atelier, c.taraude, bas, haut);
    if (p.forme === "insert") {
      const logement = cylindre(atelier, c.insert, -Math.min(c.profondeurInsert, p.profondeur), haut);
      return atelier.Manifold.union([logement, cylindre(atelier, c.passage + j, bas, haut)]);
    }
    const passage = cylindre(atelier, c.passage + j, bas, haut);
    if (p.forme === "lame") {
      const tete = cylindre(atelier, c.tete + 2 * j + 0.4, -Math.min(c.hauteurTete + 0.2, p.profondeur), haut);
      return atelier.Manifold.union([passage, tete]);
    }
    if (p.forme === "fraise") {
      const dTete = c.fraisee + 2 * j;
      const hauteurCone = Math.min((dTete - c.passage) / 2, p.profondeur);
      return atelier.Manifold.union([passage, cone(atelier, dTete - 2 * hauteurCone, dTete, -hauteurCone, 0), cylindre(atelier, dTete, 0, haut)]);
    }
    return passage;
  },
};

export const typeLogementEcrou = {
  nom: "logement_ecrou",
  etiquette: "Logement d'écrou",
  termeDuProgramme: "empreinte d'écrou hexagonal",
  aide: "L'empreinte d'un écrou hexagonal, avec le passage de sa vis : l'écrou s'y emboîte et ne tourne plus.",
  icone: "logement_ecrou",
  categorie: "bibliotheque",
  tailleParReglages: true,
  trouParDefaut: true,

  nomAuto: (n) => "Logement d'écrou " + (n.parametres.vis ?? "M3"),

  parametres: {
    vis: PARAMETRE_VIS,
    profondeur: { etiquette: "Profondeur du passage", unite: "mm", defaut: 10, min: 1, max: 500, aide: "Longueur du trou de vis sous l'écrou." },
    jeu: PARAMETRE_JEU,
  },

  construire(atelier, p) {
    const c = COTES[p.vis] ?? COTES.M3;
    const j = p.jeu ?? 0.2;
    const empreinte = hexagone(atelier, c.ecrou + 2 * j, -(c.epaisseurEcrou + j), DEPASSE_MM);
    return atelier.Manifold.union([empreinte, cylindre(atelier, c.passage + j, -p.profondeur, DEPASSE_MM)]);
  },
};

export const typeVis = {
  nom: "vis",
  etiquette: "Vis",
  termeDuProgramme: "vis (sans filet)",
  aide: "Une vis lisse, aux cotes normalisées, pour voir un assemblage. La tête est au-dessus de l'origine, la tige dessous.",
  icone: "fixation",
  categorie: "bibliotheque",
  tailleParReglages: true,

  nomAuto: (n) => "Vis " + (n.parametres.vis ?? "M3") + " × " + (n.parametres.longueur ?? 10),

  parametres: {
    vis: PARAMETRE_VIS,
    longueur: { etiquette: "Longueur", unite: "mm", defaut: 10, min: 2, max: 200 },
    tete: {
      etiquette: "Tête",
      defaut: "cylindrique",
      choix: [
        { valeur: "cylindrique", etiquette: "Cylindrique" },
        { valeur: "fraisee", etiquette: "Fraisée" },
        { valeur: "hexagonale", etiquette: "Hexagonale" },
      ],
    },
  },

  construire(atelier, p) {
    const c = COTES[p.vis] ?? COTES.M3;
    if (p.tete === "fraisee") {
      const h = (c.fraisee - c.d) / 2;
      return atelier.Manifold.union([cylindre(atelier, c.d, -p.longueur, -h), cone(atelier, c.d, c.fraisee, -h, 0)]);
    }
    const tige = cylindre(atelier, c.d, -p.longueur, 0);
    const tete = p.tete === "hexagonale" ? hexagone(atelier, c.ecrou, 0, c.epaisseurEcrou * 0.9) : cylindre(atelier, c.tete, 0, c.hauteurTete);
    return atelier.Manifold.union([tige, tete]);
  },
};
