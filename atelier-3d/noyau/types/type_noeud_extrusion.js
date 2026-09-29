/*
 * noyau/types/type_noeud_extrusion.js
 *
 * Un contour fermé, poussé hors de son plan sur une hauteur. L'esquisse est
 * désignée par son identifiant ; le calcul la reçoit en enfant.
 *
 * torsion : le contour tourne sur lui-même en montant (vis, colonne torse) ;
 * echelleHaut : sa taille au bout, en % (dépouille, pointe, évasement). Les
 * deux se font autour du centre du contour.
 *
 * Angle des côtés (dépouille) : les côtés s'inclinent en montant — la pièce
 * s'élargit vers le bout (angle positif) ou rétrécit (angle négatif). Le
 * contour est décalé de hauteur × tan(angle) au bout, ce qui garde ses angles
 * vifs : ce n'est pas une mise à l'échelle.
 *
 * Bords : un chanfrein ou un congé sur le bord côté esquisse et/ou au bout.
 * Coque : la pièce vidée, parois de l'épaisseur donnée, une face ouverte ou non.
 *
 * Jusqu'à un point : jusqua = { esquisse, point } désigne un point de référence ;
 * la hauteur est alors la distance de ce point au plan de l'esquisse, mesurée
 * le long de la normale (le point n'a pas besoin d'être en face du contour).
 * Elle est tenue à jour comme les autres références (references_esquisse.js).
 *
 * Token attendu dans le document :
 *   { type: "extrusion", parametres: { hauteur: 3, sens: "haut", torsion: 0, echelleHaut: 100,
 *                                      origine: { x: 0, y: 0, z: 0 }, esquisse: "n4_…" } }
 */

import { PARAMETRE_ORIGINE, PARAMETRE_ESQUISSE } from "../esquisse/plans_esquisse.js";
import { contoursPourUnion, REGLE_DE_REMPLISSAGE } from "../esquisse/contours_esquisse.js";
import { cote } from "../format_cotes.js";
import { sectionsDuLissage, solideParSections } from "../esquisse/solides_par_sections.js";

// Un congé se dessine en autant d'étages : assez pour paraître rond.
const ETAGES_DU_CONGE = 8;
// En rétrécissant le contour, les angles restent vifs jusqu'à ce rapport.
const ANGLE_VIF = 20;
const BORDS = [
  { valeur: "aucun", etiquette: "Aucun" },
  { valeur: "chanfrein", etiquette: "Chanfrein", aide: "L'arête est cassée par un pan incliné à 45°." },
  { valeur: "conge", etiquette: "Congé", aide: "L'arête est arrondie." },
];

// Une tranche tous les 5° de torsion : le contour tourne sans facettes visibles.
const DEGRES_PAR_TRANCHE = 5;

// « Vers moi » : vers l'élève qui dessine, la vue de l'esquisse regardant le plan
// de face. La fenêtre d'opération les traduit en « vers le haut », « vers l'avant »…
const SENS = [
  { valeur: "haut", etiquette: "Sens direct" },
  { valeur: "bas", etiquette: "Sens inverse" },
  { valeur: "symetrique", etiquette: "Des deux côtés" },
];

function horsDuPlan({ hauteur, sens }) {
  if (sens === "bas") return [-hauteur, 0];
  if (sens === "symetrique") return [-hauteur / 2, hauteur / 2];
  return [0, hauteur];
}

export default {
  nom: "extrusion",
  etiquette: "Extrusion",
  termeDuProgramme: "extrusion d'un contour",
  aide: "Donne de l'épaisseur à un contour fermé, en le tirant perpendiculairement à son plan.",
  verbe: "Extruder",
  icone: "extrusion",
  categorie: "interne",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  profilRequis: "ferme",

  nomAuto: (n) => "Extrusion " + cote(n.parametres.hauteur) + " mm",

  parametres: {
    hauteur: { etiquette: "Hauteur", unite: "mm", defaut: 10, min: 0.1, max: 1000, masque: (p) => p.jusqua != null },
    jusqua: { etiquette: "Jusqu'au point", defaut: null, cache: true },
    sens: { etiquette: "Sens", defaut: "haut", choix: SENS },
    depouille: {
      etiquette: "Angle des côtés", unite: "°", defaut: 0, min: -60, max: 60, pasFixe: 5,
      aide: "Incline les côtés en montant : positif, la pièce s'élargit vers le bout ; négatif, elle rétrécit. Sert aux pièces qui s'emboîtent et aux surplombs imprimables.",
    },
    torsion: { etiquette: "Torsion", unite: "°", defaut: 0, min: -3600, max: 3600, pasFixe: 15 },
    echelleHaut: { etiquette: "Taille au bout", unite: "%", defaut: 100, min: 0, max: 1000, pasFixe: 5 },
    bordDepart: { etiquette: "Bord côté esquisse", defaut: "aucun", choix: BORDS },
    tailleDepart: { etiquette: "Taille du bord côté esquisse", unite: "mm", defaut: 1, min: 0.1, max: 500, masque: (p) => (p.bordDepart ?? "aucun") === "aucun" },
    bordArrivee: { etiquette: "Bord au bout", defaut: "aucun", choix: BORDS },
    tailleArrivee: { etiquette: "Taille du bord au bout", unite: "mm", defaut: 1, min: 0.1, max: 500, masque: (p) => (p.bordArrivee ?? "aucun") === "aucun" },
    coque: { etiquette: "Coque (paroi)", unite: "mm", defaut: 0, min: 0, max: 500, aide: "0 : plein. Sinon, la pièce est vidée en gardant des parois de cette épaisseur." },
    faceOuverte: {
      etiquette: "Face ouverte", defaut: "arrivee", masque: (p) => !(p.coque > 0),
      choix: [
        { valeur: "arrivee", etiquette: "Au bout" },
        { valeur: "depart", etiquette: "Côté esquisse" },
        { valeur: "aucune", etiquette: "Aucune (creux fermé)" },
      ],
    },
    origine: PARAMETRE_ORIGINE,
    esquisse: PARAMETRE_ESQUISSE,
  },

  /* La boîte du solide dans le repère du plan, avant tout calcul. */
  boiteDansLePlan(p, boite) {
    const [bas, haut] = horsDuPlan(p);
    // Des côtés qui s'écartent débordent du contour : la boîte s'élargit d'autant.
    const marge = Math.max(0, -retraitDeDepouille(p, p.hauteur));
    return {
      min: [boite.min[0] - marge, boite.min[1] - marge, bas],
      max: [boite.max[0] + marge, boite.max[1] + marge, haut],
    };
  },

  construireDepuisProfil(atelier, p, profil) {
    if (profil.fermes.length === 0) {
      throw new Error("l'esquisse n'a aucun contour fermé. Refermer le tracé, ou choisir Épaissir.");
    }
    const section = new atelier.CrossSection(contoursPourUnion(profil.fermes), REGLE_DE_REMPLISSAGE);
    const avecBords = (p.bordDepart ?? "aucun") !== "aucun" || (p.bordArrivee ?? "aucun") !== "aucun";
    const parEtages = avecBords || (p.depouille ?? 0) !== 0;
    if (parEtages && ((p.torsion ?? 0) !== 0 || (p.echelleHaut ?? 100) !== 100)) {
      throw new Error("l'angle des côtés, les chanfreins et les congés des bords ne se combinent pas avec une torsion ou un changement de taille.");
    }
    let solide = parEtages ? avecSesBords(atelier, p, section) : pousser(section, p);
    const epaisseur = p.coque ?? 0;
    if (epaisseur > 0) solide = solide.subtract(interieurDeLaCoque(atelier, section, p, epaisseur));
    return solide;
  },
};

/* Le contour poussé sur toute la hauteur, avec sa torsion et sa taille au bout. */
function pousser(section, p, [debut, fin] = [0, p.hauteur]) {
  const [bas] = horsDuPlan(p);
  const hauteur = fin - debut;
  const torsion = p.torsion ?? 0;
  const echelle = (p.echelleHaut ?? 100) / 100;
  // Mesuré depuis l'esquisse : en sens inverse, le départ est en haut.
  const place = (solide) => (p.sens === "bas" ? solide.mirror([0, 0, 1]).translate([0, 0, -debut]) : solide.translate([0, 0, bas + debut]));
  if (torsion === 0 && echelle === 1) return place(section.extrude(hauteur));
  // Torsion et taille se font autour du centre du contour, et à partir de l'esquisse.
  const { min, max } = section.bounds();
  const [cx, cy] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const tranches = Math.ceil(Math.abs(torsion) / DEGRES_PAR_TRANCHE);
  return place(section.translate([-cx, -cy]).extrude(hauteur, tranches, torsion, [echelle, echelle])).translate([cx, cy, 0]);
}

/* De combien le contour se décale à la hauteur s, par l'angle des côtés :
   positif, il rétrécit ; négatif, il s'élargit. */
const retraitDeDepouille = (p, s) => -s * Math.tan(((p.depouille ?? 0) * Math.PI) / 180);

/*
 * Les étages empilés en un solide : chacun est le contour décalé de r (positif :
 * rétréci), posé à la hauteur que donne hauteurDe. Le décalage garde les angles
 * vifs du contour ; s'il en fait disparaître une partie, on le dit.
 */
function empiler(atelier, section, etages, hauteurDe, quoi) {
  const nombreDeContours = section.toPolygons().length;
  const sources = etages.map(([s, r]) => {
    const boucles2D = Math.abs(r) < 1e-9 ? section.toPolygons() : section.offset(-r, "Miter", ANGLE_VIF).toPolygons();
    if (boucles2D.length !== nombreDeContours) {
      throw new Error(quoi + " trop grand : une partie du contour disparaîtrait. Réduire sa valeur.");
    }
    return { boucles2D, matrice: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, hauteurDe(s)] };
  });
  let sections;
  try {
    sections = sectionsDuLissage(sources, "droit");
  } catch {
    throw new Error(quoi + " trop grand pour ce contour : réduire sa valeur.");
  }
  return solideParSections(atelier, sections, false);
}

/* Le retrait du contour à une distance s du bord, pour un chanfrein ou un congé de taille t. */
function retrait(genre, t, s) {
  if (genre === "chanfrein") return t - s;
  return t - Math.sqrt(Math.max(0, t * t - (t - s) * (t - s)));
}

/*
 * Chanfrein ou congé sur le bord de départ (côté esquisse) et/ou d'arrivée :
 * le contour rétréci d'autant à chaque étage, les étages reliés comme un
 * lissage à faces droites. Le rétrécissement garde les angles vifs du
 * contour ; s'il fait disparaître un détail, le bord est refusé.
 */
function avecSesBords(atelier, p, section) {
  const h = p.hauteur;
  const bords = [
    { genre: p.bordDepart ?? "aucun", taille: p.tailleDepart ?? 1 },
    { genre: p.bordArrivee ?? "aucun", taille: p.tailleArrivee ?? 1 },
  ].map((b) => (b.genre === "aucun" ? { ...b, taille: 0 } : b));
  if (bords[0].taille + bords[1].taille > h - 1e-6) {
    throw new Error("les chanfreins et congés des bords dépassent la hauteur de l'extrusion.");
  }
  // Les étages : [distance depuis l'esquisse, retrait du contour].
  const etages = [];
  const pas = (b) => (b.genre === "conge" ? ETAGES_DU_CONGE : 1);
  if (bords[0].taille > 0) for (let k = 0; k <= pas(bords[0]); k += 1) etages.push([bords[0].taille * k / pas(bords[0]), retrait(bords[0].genre, bords[0].taille, bords[0].taille * k / pas(bords[0]))]);
  else etages.push([0, 0]);
  if (bords[1].taille > 0) for (let k = pas(bords[1]); k >= 0; k -= 1) etages.push([h - bords[1].taille * k / pas(bords[1]), retrait(bords[1].genre, bords[1].taille, bords[1].taille * k / pas(bords[1]))]);
  else etages.push([h, 0]);
  // L'angle des côtés s'ajoute au retrait des bords, à chaque étage.
  const propres = etages
    .filter((e, i) => i === 0 || e[0] - etages[i - 1][0] > 1e-6)
    .map(([s, r]) => [s, r + retraitDeDepouille(p, s)]);

  const [bas] = horsDuPlan(p);
  const hauteurDe = (s) => (p.sens === "bas" ? -s : bas + s);
  return empiler(atelier, section, propres, hauteurDe, "chanfrein, congé ou angle des côtés");
}

/*
 * L'intérieur à retirer pour une coque : le contour rétréci de l'épaisseur,
 * poussé entre les deux fonds — qui restent pleins, sauf la face ouverte, que
 * l'intérieur traverse.
 */
function interieurDeLaCoque(atelier, section, p, epaisseur) {
  const interieur = section.offset(-epaisseur, "Miter", ANGLE_VIF);
  if (interieur.isEmpty()) throw new Error("coque trop épaisse pour ce contour : réduire l'épaisseur de paroi.");
  const ouverte = p.faceOuverte ?? "arrivee";
  const debut = ouverte === "depart" ? -1 : epaisseur;
  const fin = ouverte === "arrivee" ? p.hauteur + 1 : p.hauteur - epaisseur;
  if (fin - debut < 1e-3) throw new Error("coque trop épaisse pour la hauteur : réduire l'épaisseur de paroi.");
  // Les côtés inclinés : l'intérieur suit la même pente, pour une paroi d'épaisseur constante.
  if ((p.depouille ?? 0) === 0) return pousser(interieur, p, [debut, fin]);
  const [bas] = horsDuPlan(p);
  const hauteurDe = (s) => (p.sens === "bas" ? -s : bas + s);
  const etages = [[debut, retraitDeDepouille(p, debut)], [fin, retraitDeDepouille(p, fin)]];
  return empiler(atelier, interieur, etages, hauteurDe, "angle des côtés");
}
