/*
 * vue/materiaux.js
 * ────────────────
 * Les matériaux de la scène. Aucune couleur n'est écrite ici : elles arrivent
 * des jetons CSS, par l'objet « couleurs » que reçoit la scène.
 *
 * Un trou s'affiche transparent et hachuré, comme dans un dessin technique :
 * les hachures sont tracées dans le shader, en coordonnées d'écran, pour
 * rester lisibles quelle que soit la taille de l'objet.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";

const PERIODE_HACHURES_PX = 9;
const EPAISSEUR_HACHURES_PX = 3;
const OPACITE_TROU = 0.55;
const OPACITE_ENTRE_HACHURES = 0.25;
const OPACITE_EN_ATTENTE = 0.6;
const OPACITE_ESTOMPEE = 0.28;

/* Le rendu de chaque finition (noyau/finitions.js), y compris la mate par
   défaut : toutes reflètent un peu l'environnement (vue/environnement_reflets.js)
   et portent un léger reflet de lumière. Ce reflet s'ajoute à la couleur au
   lieu de la multiplier : c'est lui qui fait lire le galbe d'une pièce noire
   ou gris foncé, que l'ombre seule ne peut plus assombrir. */
// reflets : la part de l'environnement. Faible pour le plastique, sinon il
// s'éclaircit deux fois (lumières et décor) ; pleine pour le métal, qui n'a
// pas d'autre couleur que ce qu'il reflète.
const MAT = { rugosite: 0.58, metal: 0, reflets: 0.35 };
const FINITIONS = {
  brillant: { rugosite: 0.12, metal: 0, reflets: 0.6 },
  // eclaircir : un métal n'a pas de couleur propre, il teinte ce qu'il reflète ;
  // sans ça, le gris du nuancier donnerait un métal presque noir.
  metal: { rugosite: 0.22, metal: 1, reflets: 1.6, eclaircir: 0.3 },
  translucide: { rugosite: 0.08, metal: 0, reflets: 0.5, opacite: 0.4 },
};
// Un objet sélectionné prend près de la moitié de la couleur de sélection :
// assez pour le repérer d'un coup d'œil, pas au point de perdre sa couleur.
const PART_DE_LA_SELECTION = 0.45;
// La matière coupée : la teinte de la pièce assombrie, rayée de traits plus foncés.
const TEINTE_DE_LA_COUPE = 0.62;
const PERIODE_COUPE_PX = 7;
const EPAISSEUR_COUPE_PX = 1.5;
const TEINTE_DES_TRAITS_DE_COUPE = 0.7;

const flottant = (v) => v.toFixed(2);

/* Les hachures d'un trou : un pixel sur trois garde son opacité. */
const HACHURES_DU_TROU = `
      if (mod(gl_FragCoord.x + gl_FragCoord.y, ${flottant(PERIODE_HACHURES_PX)}) > ${flottant(EPAISSEUR_HACHURES_PX)}) {
        gl_FragColor.a *= ${flottant(OPACITE_ENTRE_HACHURES)};
      }`;

/* En coupe, on voit l'intérieur de la pièce par le plan coupé : ce sont ses
   faces vues de dos. Peintes sombres et hachurées, elles se lisent comme la
   matière coupée d'un dessin technique, sans calculer de couvercle. */
const MATIERE_COUPEE = `
      if (!gl_FrontFacing) {
        // La couleur de sortie est déjà convertie : on convertit la nôtre de même.
        gl_FragColor.rgb = linearToOutputTexel(vec4(diffuseColor.rgb * ${flottant(TEINTE_DE_LA_COUPE)}, 1.0)).rgb;
        if (mod(gl_FragCoord.x - gl_FragCoord.y, ${flottant(PERIODE_COUPE_PX)}) < ${flottant(EPAISSEUR_COUPE_PX)}) {
          gl_FragColor.rgb *= ${flottant(TEINTE_DES_TRAITS_DE_COUPE)};
        }
      }`;

function personnaliser(materiau, { trou, coupe }) {
  const ajouts = (coupe ? MATIERE_COUPEE : "") + (trou ? HACHURES_DU_TROU : "");
  if (ajouts === "") return materiau;
  materiau.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", "#include <dithering_fragment>" + ajouts);
  };
  // Sans clé distincte, three.js réutiliserait le programme d'un matériau
  // ordinaire et les hachures disparaîtraient au hasard.
  materiau.customProgramCacheKey = () => "atelier" + (trou ? "-trou" : "") + (coupe ? "-coupe" : "");
  return materiau;
}

/*
 * etat : { couleur, finition, trou, selectionne, enAttente, estompe, coupe }
 * coupe : le THREE.Plane de la vue en coupe active, ou null.
 * Un matériau par objet : ils sont légers, et partager un matériau entre
 * objets de couleurs différentes obligerait à le cloner de toute façon.
 */
export function creerMateriau(couleurs, etat) {
  const couleur = new THREE.Color(etat.trou ? couleurs.trou : (etat.couleur ?? couleurs.objet));
  if (etat.selectionne) couleur.lerp(new THREE.Color(couleurs.selection), PART_DE_LA_SELECTION);
  const commun = {
    color: couleur,
    side: THREE.DoubleSide,            // un STL mal orienté reste visible
    polygonOffset: true,               // les contours de sélection passent devant
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  };
  // Un trou garde son rendu hachuré, quelle que soit la finition de la pièce.
  const finition = etat.trou ? MAT : (FINITIONS[etat.finition] ?? MAT);
  if (finition.eclaircir) couleur.lerp(new THREE.Color(couleurs.refletLumiere), finition.eclaircir);
  // Les normales sont lissées sur les surfaces courbes et franches aux arêtes
  // (geometrie/normales_du_maillage.js) : un cylindre se dégrade, un cube reste net.
  const materiau = new THREE.MeshStandardMaterial({
    ...commun, roughness: finition.rugosite, metalness: finition.metal, envMapIntensity: finition.reflets,
  });
  if (finition.opacite !== undefined) {
    materiau.transparent = true;
    materiau.opacity = finition.opacite;
    materiau.depthWrite = false;
  }
  const coupe = (etat.coupe ?? null) !== null;
  if (coupe) materiau.clippingPlanes = [etat.coupe];

  if (etat.trou) {
    materiau.transparent = true;
    materiau.opacity = OPACITE_TROU;
    materiau.depthWrite = false;
    return personnaliser(materiau, { trou: true, coupe });
  }
  personnaliser(materiau, { trou: false, coupe });

  if (etat.estompe) {
    materiau.transparent = true;
    materiau.opacity = Math.min(materiau.opacity, OPACITE_ESTOMPEE);
    materiau.depthWrite = false;
  } else if (etat.enAttente) {
    materiau.transparent = true;
    materiau.opacity = Math.min(materiau.opacity, OPACITE_EN_ATTENTE);
  }
  return materiau;
}

export function materiauDeContour(couleur, pointille = false, opacite = 1) {
  const options = { color: new THREE.Color(couleur), transparent: true, depthTest: true, opacity: opacite };
  return pointille
    ? new THREE.LineDashedMaterial({ ...options, dashSize: 1.5, gapSize: 1 })
    : new THREE.LineBasicMaterial(options);
}
