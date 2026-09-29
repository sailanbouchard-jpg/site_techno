/*
 * interface/couleurs_de_la_vue.js
 * ───────────────────────────────
 * Les couleurs de la vue 3D viennent des jetons CSS : le JS n'en écrit aucune,
 * et la scène les reçoit toutes faites, sans lire le DOM elle-même.
 */

const JETONS = {
  objet: "--objet-3d",
  selection: "--selection-3d",
  survol: "--survol-3d",
  trou: "--trou",
  attente: "--texte-doux",
  guide: "--accent",
  poignee: "--texte",
  grilleGrosse: "--grille-grosse",
  grilleFine: "--grille-fine",
  axeX: "--axe-x",
  axeY: "--axe-y",
  axeZ: "--axe-z",
  esquisse: "--esquisse-trait",
  esquisseOuverte: "--accent",
  esquisseAplat: "--esquisse-aplat",
  silhouette: "--esquisse-silhouette",
  cote: "--esquisse-cote",
  reference: "--esquisse-reference",
  axesEsquisse: "--esquisse-axes",
  cubeFond: "--chrome-panneau",
  cubeSurvol: "--accent-fond",
  cubeTexte: "--texte",
  cubeBord: "--chrome-bordure",
  etanche: "--etanche",
  refletHaut: "--reflet-haut",
  refletBas: "--reflet-bas",
  refletLumiere: "--reflet-lumiere",
  lumiereCiel: "--lumiere-ciel",
  lumiereSol: "--lumiere-sol",
  areteSurClair: "--arete-sur-clair",
  areteSurSombre: "--arete-sur-sombre",
  plateau: "--plateau-3d",
  plateauGrille: "--plateau-grille",
  volumeImprimable: "--volume-imprimable",
  alertePlateau: "--alerte-plateau",
  ligneParoiExterieure: "--ligne-paroi-exterieure",
  ligneParoisInterieures: "--ligne-parois-interieures",
  ligneDessus: "--ligne-dessus",
  ligneDessous: "--ligne-dessous",
  lignePleinInterieur: "--ligne-plein-interieur",
  ligneRemplissage: "--ligne-remplissage",
  ligneJupe: "--ligne-jupe",
  ligneBordure: "--ligne-bordure",
  ligneSurplomb: "--ligne-surplomb",
  lignePont: "--ligne-pont",
  ligneInterstices: "--ligne-interstices",
  ligneRepassage: "--ligne-repassage",
  lignePontInterieur: "--ligne-pont-interieur",
  ligneCouture: "--ligne-couture",
  buse: "--buse-3d",
  degrade1: "--degrade-1",
  degrade2: "--degrade-2",
  degrade3: "--degrade-3",
  degrade4: "--degrade-4",
  degrade5: "--degrade-5",
};

/* Les couleurs proposées aux objets : --couleur-objet-1, -2… jusqu'au premier
   jeton absent. La première est la couleur par défaut. */
export function nuancierDesObjets() {
  const style = getComputedStyle(document.documentElement);
  const nuancier = [];
  for (let rang = 1; ; rang += 1) {
    const valeur = style.getPropertyValue("--couleur-objet-" + rang).trim();
    if (valeur === "") return nuancier;
    nuancier.push(valeur);
  }
}

export function couleursDeLaVue() {
  const style = getComputedStyle(document.documentElement);
  const couleurs = {};
  for (const [nom, jeton] of Object.entries(JETONS)) {
    const valeur = style.getPropertyValue(jeton).trim();
    // Un jeton oublié donnerait du noir sans que personne ne comprenne pourquoi.
    if (valeur === "") throw new Error("Jeton de couleur manquant dans la feuille de style : " + jeton);
    couleurs[nom] = valeur;
  }
  return couleurs;
}
