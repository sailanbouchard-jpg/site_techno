/*
 * noyau/types/type_noeud_revolution.js
 *
 * Un contour fermé qu'on fait tourner autour d'un axe de l'esquisse — son axe
 * vertical ou son axe horizontal, qui passent par l'origine, ou l'un de ses
 * segments (un côté du profil, un trait d'aide). Un demi-profil de vase donne
 * le vase. L'angle de départ fait pivoter le tout autour de l'axe : un quart
 * de tour balayé peut commencer où l'on veut.
 *
 * À ne pas confondre avec la répétition en cercle : une révolution balaie un
 * profil et donne un solide plein de révolution, pas des copies.
 *
 * Avec un pas, le profil avance le long de l'axe en tournant : ressort,
 * filetage, vis sans fin. L'angle peut alors dépasser un tour.
 *
 * Token attendu dans le document :
 *   { type: "revolution", parametres: { axe: "vertical", angle: 360, pas: 0, esquisse: "n4_…" } }
 *   { type: "revolution", parametres: { axe: "ligne", ligne: "7", angleDepart: 90, angle: 180, … } }
 */

import { PARAMETRE_ORIGINE, PARAMETRE_ESQUISSE, enColonnes } from "../esquisse/plans_esquisse.js";
import { contoursPourUnion, REGLE_DE_REMPLISSAGE } from "../esquisse/contours_esquisse.js";
import { cote } from "../format_cotes.js";
import { bouclesDuProfil, sectionsDeLHelice, solideParSections } from "../esquisse/solides_par_sections.js";

const TOUR = 360;
// Sans pas, un tour suffit : au-delà, le profil repasserait sur lui-même.
const angleEffectif = (p) => (p.pas > 0 ? p.angle : Math.min(p.angle, TOUR));

// Manifold fait tourner autour de son axe Y 2D, qui devient Z en 3D, et
// balaie depuis X. Ces matrices ramènent le résultat dans le repère du plan.
const VERS_LE_PLAN = {
  vertical: [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0],
  horizontal: [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0],
};

export default {
  nom: "revolution",
  etiquette: "Révolution",
  termeDuProgramme: "solide de révolution",
  aide: "Fait tourner un contour fermé autour d'un axe : vase, roue, bouchon…",
  verbe: "Faire tourner",
  icone: "revolution",
  categorie: "interne",
  // Sa taille se règle par ses paramètres : pas de trio L × l × h dans l'inspecteur.
  tailleParReglages: true,
  profilRequis: "ferme",

  nomAuto: (n) => (n.parametres.pas > 0
    ? "Hélice " + cote(n.parametres.angle / TOUR) + " tours"
    : "Révolution " + cote(Math.min(n.parametres.angle, TOUR)) + "°"),

  parametres: {
    axe: {
      etiquette: "Axe",
      defaut: "vertical",
      choix: [
        { valeur: "vertical", etiquette: "Axe vertical de l'esquisse" },
        { valeur: "horizontal", etiquette: "Axe horizontal de l'esquisse" },
        { valeur: "ligne", etiquette: "Un segment de l'esquisse", aide: "Cliquer ensuite, dans la vue, le segment autour duquel tourner." },
      ],
    },
    // Le segment choisi comme axe, quand axe vaut « ligne ».
    ligne: { etiquette: "Segment de l'axe", defaut: null, cache: true },
    angleDepart: {
      etiquette: "Angle de départ", unite: "°", defaut: 0, min: -360, max: 360, pasFixe: 15,
      aide: "D'où part le balayage, autour de l'axe : 0° part du plan de l'esquisse.",
    },
    angle: { etiquette: "Angle balayé", unite: "°", defaut: 360, min: 1, max: 36000, pasFixe: 15 },
    pas: { etiquette: "Pas (hélice)", unite: "mm", defaut: 0, min: 0, max: 1000 },
    sensHelice: {
      etiquette: "Sens de l'hélice",
      defaut: "droite",
      masque: (p) => !(p.pas > 0),
      choix: [
        { valeur: "droite", etiquette: "À droite", aide: "Le sens des vis ordinaires : on visse en tournant dans le sens des aiguilles d'une montre." },
        { valeur: "gauche", etiquette: "À gauche", aide: "Filetage inversé (pédale gauche de vélo, bouteille de gaz)." },
      ],
    },
    facettes: { etiquette: "Facettes", defaut: 48, min: 8, max: 128, pasFixe: 4, entier: true, avance: true },
    origine: PARAMETRE_ORIGINE,
    esquisse: PARAMETRE_ESQUISSE,
  },

  boiteDansLePlan(p, boite) {
    // Une hélice monte d'un pas par tour.
    const montee = p.pas > 0 ? p.pas * p.angle / TOUR : 0;
    // Autour d'un segment : une boîte large, qui contient toutes les positions possibles.
    if (p.axe === "ligne") {
      const r = Math.hypot(boite.max[0] - boite.min[0], boite.max[1] - boite.min[1]) + montee;
      return { min: [boite.min[0] - r, boite.min[1] - r, -r], max: [boite.max[0] + r, boite.max[1] + r, r] };
    }
    if (p.axe === "horizontal") {
      const r = Math.max(Math.abs(boite.min[1]), Math.abs(boite.max[1]));
      return { min: [boite.min[0], -r, -r], max: [boite.max[0] + montee, r, r] };
    }
    const r = Math.max(Math.abs(boite.min[0]), Math.abs(boite.max[0]));
    return { min: [-r, boite.min[1], -r], max: [r, boite.max[1] + montee, r] };
  },

  construireDepuisProfil(atelier, p, profil, contenu) {
    if (profil.fermes.length === 0) {
      throw new Error("la révolution demande un contour fermé. Refermer le tracé.");
    }
    // Autour d'un segment : on se ramène à l'axe vertical, puis on revient.
    if (p.axe === "ligne") {
      const repere = repereDuSegment(contenu, p.ligne);
      const versLeSegment = ([u, v]) => {
        const d = [u - repere[3], v - repere[7]];
        return [d[0] * repere[0] + d[1] * repere[4], d[0] * repere[1] + d[1] * repere[5]];
      };
      const autour = { ...profil, fermes: profil.fermes.map((c) => c.map(versLeSegment)) };
      return this.construireDepuisProfil(atelier, { ...p, axe: "vertical" }, autour, contenu).transform(enColonnes(repere));
    }
    const depart = p.angleDepart ?? 0;
    if (p.pas > 0) {
      const sections = sectionsDeLHelice(bouclesDuProfil(profil.fermes, atelier), p);
      const helice = solideParSections(atelier, sections, false);
      if (depart === 0) return helice;
      return helice.rotate(p.axe === "horizontal" ? [-depart, 0, 0] : [0, -depart, 0]);
    }
    // Le profil est lu avec l'axe de rotation en ordonnée.
    let contours = p.axe === "horizontal"
      ? profil.fermes.map((c) => c.map(([u, v]) => [v, u]))
      : profil.fermes;
    // Tracé de l'autre côté de l'axe : on le retourne plutôt que de ne rien rendre.
    if (contours.every((c) => c.every(([x]) => x <= 1e-9))) {
      contours = contours.map((c) => c.map(([x, y]) => [-x, y]));
    }
    let solide = new atelier.CrossSection(contoursPourUnion(contours), REGLE_DE_REMPLISSAGE).revolve(p.facettes, angleEffectif(p));
    if (solide.isEmpty()) {
      throw new Error("le profil ne s'écarte pas de l'axe : rien à faire tourner.");
    }
    if (depart !== 0) solide = solide.rotate([0, 0, depart]);
    return solide.transform(enColonnes(VERS_LE_PLAN[p.axe] ?? VERS_LE_PLAN.vertical));
  },
};

/* Le repère (12 nombres) dont l'axe vertical est le segment choisi, d'un bout
   à l'autre, et l'axe horizontal sa perpendiculaire : il renvoie dans le plan
   de l'esquisse ce qui a tourné autour de l'axe vertical. */
function repereDuSegment(contenu, idLigne) {
  const s = (contenu?.courbes ?? []).find((c) => c.id === idLigne && c.genre === "segment");
  if (s === undefined) throw new Error("le segment choisi comme axe n'existe plus : choisir un autre axe.");
  const [a, b] = [contenu.points[s.a], contenu.points[s.b]];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (l < 1e-9) throw new Error("le segment choisi comme axe n'a pas de longueur.");
  const d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const r = [d[1], -d[0]];
  return [r[0], d[0], 0, a[0], r[1], d[1], 0, a[1], 0, 0, 1, 0];
}
