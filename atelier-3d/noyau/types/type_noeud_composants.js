/*
 * noyau/types/type_noeud_composants.js
 *
 * Les composants du collège, aux cotes réelles : piles, cartes, moteurs,
 * afficheurs, boutons. Ils ne s'impriment pas — on les pose dans le projet
 * pour construire un boîtier autour, vérifier qu'il y a la place, et creuser
 * leur logement (les mettre en trou, touche T, puis les grouper avec la
 * pièce : le creux prend leur forme, jeu compris).
 *
 * Chaque composant a un jeu, ajouté tout autour : un logement dessiné aux
 * cotes exactes ne laisse jamais entrer la pièce.
 *
 * L'origine de chaque composant est le centre de son dessous, comme pour les
 * formes de base : posé sur une face, il repose dessus.
 *
 * Token attendu dans le document :
 *   { type: "pile_aa", parametres: { jeu: 0.4 } }
 */

const FACETTES = 48;
const PARAMETRE_JEU = {
  etiquette: "Jeu",
  unite: "mm",
  defaut: 0.4,
  min: 0,
  max: 5,
  aide: "Ajouté tout autour du composant. Sert quand on s'en sert pour creuser son logement : sans jeu, la pièce imprimée serre trop.",
};

/* Un pavé centré en x et y, posé sur z = 0. */
const boite = (atelier, [x, y, z], jeu = 0) =>
  atelier.Manifold.cube([x + 2 * jeu, y + 2 * jeu, z + 2 * jeu], true).translate([0, 0, (z + 2 * jeu) / 2 - jeu]);

/* Un cylindre debout, centré en x et y, de z = bas à z = haut. */
const cylindre = (atelier, diametre, bas, haut, jeu = 0) =>
  atelier.Manifold.cylinder(haut - bas + 2 * jeu, diametre / 2 + jeu, diametre / 2 + jeu, FACETTES, false).translate([0, 0, bas - jeu]);

/* Un cylindre couché le long de X, son axe à la hauteur z. */
const cylindreCouche = (atelier, diametre, longueur, z, jeu = 0) =>
  atelier.Manifold.cylinder(longueur + 2 * jeu, diametre / 2 + jeu, diametre / 2 + jeu, FACETTES, true)
    .rotate([0, 90, 0])
    .translate([0, 0, z]);

/*
 * Les composants, dans l'ordre du menu. cotes : ce que l'aide affiche ;
 * construire(atelier, jeu) : la forme, origine au centre du dessous.
 */
const COMPOSANTS = [
  {
    nom: "pile_aa",
    etiquette: "Pile AA",
    icone: "pile",
    cotes: "⌀14,5 × 50,5 mm",
    aide: "Pile bâton AA (LR6), couchée : ⌀14,5 × 50,5 mm, plot compris.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      cylindreCouche(atelier, 14.5, 50.5, 7.25 + jeu, jeu),
      cylindreCouche(atelier, 5.5, 52.5, 7.25 + jeu, jeu),
    ]),
  },
  {
    nom: "pile_aaa",
    etiquette: "Pile AAA",
    icone: "pile",
    cotes: "⌀10,5 × 44,5 mm",
    aide: "Pile bâton AAA (LR03), couchée : ⌀10,5 × 44,5 mm, plot compris.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      cylindreCouche(atelier, 10.5, 44.5, 5.25 + jeu, jeu),
      cylindreCouche(atelier, 3.8, 46.5, 5.25 + jeu, jeu),
    ]),
  },
  {
    nom: "pile_9v",
    etiquette: "Pile 9 V",
    icone: "pile",
    cotes: "26,5 × 17,5 × 48,5 mm",
    aide: "Pile 9 V (6LR61), debout, ses deux bornes sur le dessus.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [26.5, 17.5, 48.5], jeu),
      cylindre(atelier, 12, 48.5, 54, jeu).translate([0, 0, 0]),
    ]),
  },
  {
    nom: "coupleur_piles",
    etiquette: "Coupleur 3 × AA",
    icone: "pile",
    cotes: "58 × 46 × 15 mm",
    aide: "Boîtier de trois piles AA avec fils, du type des projets d'électronique.",
    construire: (atelier, jeu) => boite(atelier, [58, 46, 15], jeu),
  },
  {
    nom: "carte_microbit",
    etiquette: "Carte micro:bit",
    icone: "carte",
    cotes: "51,6 × 42 × 11 mm",
    aide: "Carte micro:bit V2, composants et connecteur de bord compris. Les cinq anneaux se trouvent sur le bord bas.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [51.6, 42, 1.6], jeu),
      boite(atelier, [43, 30, 9], jeu).translate([0, 3, 1.6]),
    ]),
  },
  {
    nom: "carte_arduino",
    etiquette: "Carte Arduino Uno",
    icone: "carte",
    cotes: "68,6 × 53,4 × 15 mm",
    aide: "Carte Arduino Uno, prise USB et prise d'alimentation comprises. Prévoir l'accès aux prises sur le côté.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [68.6, 53.4, 1.6], jeu),
      boite(atelier, [60, 48, 9], jeu).translate([0, 0, 1.6]),
      // Prise USB et prise d'alimentation, qui dépassent d'un côté.
      boite(atelier, [16, 12, 11], jeu).translate([-34, 14, 1.6]),
      boite(atelier, [14, 9, 11], jeu).translate([-33, -16, 1.6]),
    ]),
  },
  {
    nom: "servomoteur",
    etiquette: "Servomoteur SG90",
    icone: "moteur",
    cotes: "23 × 12,2 × 29 mm",
    aide: "Micro-servomoteur SG90, pattes de fixation et axe compris. Les pattes se vissent en M2.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [22.8, 12.2, 22.5], jeu),
      boite(atelier, [32.2, 12.2, 2.5], jeu).translate([0, 0, 15.9]),
      cylindre(atelier, 11.8, 22.5, 26.5, jeu).translate([-5.9, 0, 0]),
      cylindre(atelier, 4.8, 26.5, 29.5, jeu).translate([-5.9, 0, 0]),
    ]),
  },
  {
    nom: "moteur_reducteur",
    etiquette: "Motoréducteur (roue)",
    icone: "moteur",
    cotes: "70 × 22,5 × 18,7 mm",
    aide: "Motoréducteur jaune à deux axes, celui des voitures et robots de classe.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [70, 22.5, 18.7], jeu),
      cylindreCouche(atelier, 5.4, 78, 9.35 + jeu, jeu),
    ]),
  },
  {
    nom: "led",
    etiquette: "LED 5 mm",
    icone: "led",
    cotes: "⌀5 × 8,6 mm",
    aide: "Diode de 5 mm, debout, avec ses pattes. Le trou de passage se perce au diamètre 5 plus le jeu.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      cylindre(atelier, 5.8, 0, 1, jeu),
      cylindre(atelier, 5, 1, 7.4, jeu),
      atelier.Manifold.sphere(2.5 + jeu, FACETTES).translate([0, 0, 7.4]),
      cylindre(atelier, 0.6, -25, 0, jeu).translate([1.27, 0, 0]),
      cylindre(atelier, 0.6, -25, 0, jeu).translate([-1.27, 0, 0]),
    ]),
  },
  {
    nom: "interrupteur",
    etiquette: "Interrupteur à bascule",
    icone: "interrupteur",
    cotes: "21 × 15 × 23 mm",
    aide: "Interrupteur à bascule KCD1. La découpe du panneau mesure 19,2 × 13 mm : le poser en trou donne directement la fenêtre.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [19.2, 13, 15], jeu),
      boite(atelier, [21, 15, 2], jeu).translate([0, 0, 15]),
      boite(atelier, [15, 11, 6], jeu).translate([0, 0, 17]),
    ]),
  },
  {
    nom: "bouton_poussoir",
    etiquette: "Bouton poussoir",
    icone: "interrupteur",
    cotes: "12 × 12 × 12 mm",
    aide: "Bouton poussoir de 12 mm sur circuit, avec son capuchon. Le passage du capuchon mesure 8 mm.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [12, 12, 7.3], jeu),
      cylindre(atelier, 8, 7.3, 12, jeu),
    ]),
  },
  {
    nom: "ecran_oled",
    etiquette: "Écran OLED 0,96 \"",
    icone: "carte",
    cotes: "27,5 × 27,8 × 4 mm",
    aide: "Petit écran OLED à quatre fils. La fenêtre à découper mesure 24,5 × 14,5 mm, centrée sur le haut de la carte.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [27.5, 27.8, 1.6], jeu),
      boite(atelier, [26, 15.5, 2.4], jeu).translate([0, 4.5, 1.6]),
    ]),
  },
  {
    nom: "buzzer",
    etiquette: "Buzzer",
    icone: "composant",
    cotes: "⌀12 × 9,5 mm",
    aide: "Buzzer rond de 12 mm, avec ses deux pattes.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      cylindre(atelier, 12, 0, 9.5, jeu),
      cylindre(atelier, 0.6, -20, 0, jeu).translate([3.5, 0, 0]),
      cylindre(atelier, 0.6, -20, 0, jeu).translate([-3.5, 0, 0]),
    ]),
  },
  {
    nom: "capteur_ultrason",
    etiquette: "Capteur à ultrasons",
    icone: "composant",
    cotes: "45 × 20 × 18 mm",
    aide: "Capteur de distance HC-SR04, ses deux yeux compris. Les deux fenêtres font 16 mm de diamètre, à 26 mm l'une de l'autre.",
    construire: (atelier, jeu) => atelier.Manifold.union([
      boite(atelier, [45, 20, 1.6], jeu),
      cylindre(atelier, 16, 1.6, 13.6, jeu).translate([-13, 1, 0]),
      cylindre(atelier, 16, 1.6, 13.6, jeu).translate([13, 1, 0]),
      boite(atelier, [45, 6, 8], jeu).translate([0, -7, 1.6]),
    ]),
  },
];

/* Les types de nœuds des composants : même fabrique pour tous. */
export const typesDesComposants = COMPOSANTS.map((composant) => ({
  nom: composant.nom,
  etiquette: composant.etiquette,
  termeDuProgramme: "composant du commerce",
  aide: composant.aide + " Cotes : " + composant.cotes + ". Le mettre en trou (T) et le grouper avec une pièce creuse son logement.",
  icone: composant.icone,
  categorie: "bibliotheque",
  tailleParReglages: true,

  nomAuto: () => composant.etiquette,

  parametres: {
    jeu: PARAMETRE_JEU,
  },

  construire: (atelier, p) => composant.construire(atelier, p.jeu ?? 0),
}));
