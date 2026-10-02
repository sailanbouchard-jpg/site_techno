/*
 * noyau/registre_types_de_noeuds.js
 * ─────────────────────────────────
 * Ajouter une forme au logiciel = écrire un fichier dans types/ et ajouter une
 * ligne ici — ou, pour un profil extrudé, une entrée dans la bibliothèque.
 * Rien d'autre ne bouge : l'inspecteur engendre ses champs depuis
 * « parametres », la boîte à formes se construit depuis ce registre, et la
 * couche géométrie appelle « construire » ou « assembler » sans savoir de quoi
 * il s'agit.
 *
 * Aucun fichier en dehors de types/ n'a le droit de tester noeud.type === "…".
 *
 * Champs d'un type :
 *   nom, etiquette, termeDuProgramme, icone
 *   aide                 une phrase : ce que c'est, montrée au survol
 *   categorie            "primitive" | "bibliotheque" (boîte à formes) | "interne"
 *   parametres           { cle: { etiquette, defaut, unite?, min?, max?, pasFixe?, valeursUsuelles?,
 *                                 entier?, texte?, avance?, cache?, lectureSeule? } }
 *   dimensionsParDefaut  présent = forme ramenée au cube unité, dont les
 *                        dimensions en millimètres sont l'échelle
 *   cotes                les réglages de taille montrés en tête de
 *                        l'inspecteur (voir noyau/cotes_des_formes.js)
 *   tailleParReglages    sa taille se règle par ses paramètres : pas de
 *                        trio L × l × h dans l'inspecteur
 *   nomAuto(noeud, outils)   le nom affiché s'il n'en a pas (noms_automatiques.js)
 *   construire(atelier, p, ressources)   une forme seule
 *   assembler(atelier, enfants, p)       une forme faite de ses enfants
 *   fichiersRequis(p)                    clés des fichiers importés dont il a besoin
 *   degroupable          « Dégrouper » s'applique à lui
 *   trouParDefaut        il naît en mode « trou » (perçages normalisés)
 *   fournitUnProfil      c'est une esquisse : des tracés, aucun solide
 *   construireDepuisProfil(atelier, p, profil)   un solide tiré de l'esquisse enfant
 *   plusieursEsquisses   un solide tiré de plusieurs esquisses (balayage, lissage) :
 *     esquissesDe(p)                  les identifiants des esquisses, dans l'ordre
 *     roles(esquisses)                les esquisses sélectionnées → les paramètres
 *                                     qui les désignent, ou une erreur lisible
 *     boiteDepuisEsquisses(p, sources)    sa boîte dans le monde, avant calcul
 *     construireDepuisEsquisses(atelier, p, sources)   le solide, dans le monde
 *     (sources : [{ contenu, profil, matrice }], une par esquisse)
 *   verbe                le libellé du bouton qui le crée (« Extruder »)
 *   verbeCourt           ce libellé sous le nom de sa famille, dans le ruban (« En ligne »)
 *   profilRequis         "ferme" (contour fermé) ou "trace" (n'importe quel tracé)
 *   boiteDansLePlan(p, boite2d)          sa boîte avant calcul, dans le repère du plan
 *   transformable        false : ni position, ni rotation, ni dimensions
 *   copies(p)            une répétition : les matrices de chaque exemplaire
 *                        de son enfant (voir noyau/matrices_de_copies.js)
 *   reglagesDuModele     un objet de la bibliothèque : l'inspecteur montre les
 *                        variables de son modèle (noyau/bibliotheque_d_objets.js)
 *
 * Un paramètre peut aussi porter « choix » ([{ valeur, etiquette }]),
 * « libelle(valeur) » pour son affichage en lecture seule, ou « masque(p) » :
 * vrai quand les autres réglages le rendent sans objet (l'inspecteur le cache).
 */

import typeRacine from "./types/type_noeud_racine.js";
import typeInconnu from "./types/type_noeud_inconnu.js";
import typeGroupe from "./types/type_noeud_groupe.js";
import typeImporte from "./types/type_noeud_importe.js";
import typeEprouvette from "./types/type_noeud_eprouvette.js";
import typePave from "./types/type_noeud_pave.js";
import typeCylindre from "./types/type_noeud_cylindre.js";
import typeSphere from "./types/type_noeud_sphere.js";
import typeCone from "./types/type_noeud_cone.js";
import typeTore from "./types/type_noeud_tore.js";
import typePyramide from "./types/type_noeud_pyramide.js";
import typeTexte from "./types/type_noeud_texte.js";
import typeEsquisse from "./types/type_noeud_esquisse.js";
import typeExtrusion from "./types/type_noeud_extrusion.js";
import typeEpaississement from "./types/type_noeud_epaississement.js";
import typeRevolution from "./types/type_noeud_revolution.js";
import typeBalayage from "./types/type_noeud_balayage.js";
import typeLissage from "./types/type_noeud_lissage.js";
import typeAretes from "./types/type_noeud_aretes.js";
import typeDecoupe from "./types/type_noeud_decoupe.js";
import { typeTrouDeVis, typeLogementEcrou, typeVis } from "./types/type_noeud_fixations.js";
import { typesDesComposants } from "./types/type_noeud_composants.js";
import typeSymetrie from "./types/type_noeud_symetrie.js";
import typeRepetitionLigne from "./types/type_noeud_repetition_ligne.js";
import typeRepetitionCercle from "./types/type_noeud_repetition_cercle.js";
import typeObjetParametrique from "./types/type_noeud_objet_parametrique.js";
import { typeDepuisProfil } from "./types/type_noeud_profil_bibliotheque.js";
import { BIBLIOTHEQUE } from "./bibliotheque_de_profils.js";

const TYPES = [
  typeRacine,
  typeInconnu,
  typeGroupe,
  typeImporte,
  typeEprouvette,
  typePave,
  typeCylindre,
  typeSphere,
  typeCone,
  typeTore,
  typePyramide,
  typeTexte,
  typeEsquisse,
  typeExtrusion,
  typeEpaississement,
  typeRevolution,
  typeBalayage,
  typeLissage,
  typeAretes,
  typeDecoupe,
  typeSymetrie,
  typeRepetitionLigne,
  typeRepetitionCercle,
  typeObjetParametrique,
  ...BIBLIOTHEQUE.map(typeDepuisProfil),
  typeTrouDeVis,
  typeLogementEcrou,
  typeVis,
  ...typesDesComposants,
];

const PAR_NOM = new Map(TYPES.map((type) => [type.nom, type]));

export function typeDeNoeud(nomDuType) {
  const type = PAR_NOM.get(nomDuType);
  if (type === undefined) {
    throw new Error("Type de noeud inconnu : « " + nomDuType + " ».");
  }
  return type;
}

export function typeExiste(nomDuType) {
  return PAR_NOM.has(nomDuType);
}

/* Ce que la boîte à formes propose, dans l'ordre : les primitives, puis la
   bibliothèque. Le groupe, la racine et l'objet importé n'en font pas partie :
   ils naissent d'une action, pas d'un clic sur une forme. */
export function formesCreables() {
  return TYPES.filter((type) => type.categorie === "primitive" || type.categorie === "bibliotheque");
}

/* Un conteneur ne produit pas de solide : il porte des enfants qui, eux, se
   construisent et s'affichent séparément. C'est le cas de la racine. Ne pas
   confondre avec le groupe, qui fond ses enfants en un seul solide. */
export function estConteneur(nomDuType) {
  const type = typeDeNoeud(nomDuType);
  return typeof type.construire !== "function" && typeof type.assembler !== "function"
    && typeof type.construireDepuisProfil !== "function" && typeof type.construireDepuisEsquisses !== "function"
    && type.fournitUnProfil !== true
    && typeof type.copies !== "function";
}

export function estRepetition(nomDuType) {
  return typeof typeDeNoeud(nomDuType).copies === "function";
}

/* Les répétitions, pour les boutons de la colonne de gauche. */
export function repetitions() {
  return TYPES.filter((type) => typeof type.copies === "function");
}

export function fournitUnProfil(nomDuType) {
  return typeDeNoeud(nomDuType).fournitUnProfil === true;
}

export function consommeUnProfil(nomDuType) {
  const type = typeDeNoeud(nomDuType);
  return typeof type.construireDepuisProfil === "function" || typeof type.construireDepuisEsquisses === "function";
}

/* Les esquisses dont un nœud est tiré, dans l'ordre (aucune s'il n'en consomme pas). */
export function esquissesDuNoeud(noeud) {
  if (!consommeUnProfil(noeud.type)) return [];
  const type = typeDeNoeud(noeud.type);
  const parametres = noeud.parametres ?? {};
  const ids = typeof type.esquissesDe === "function" ? type.esquissesDe(parametres) : [parametres.esquisse];
  return ids.filter((id) => typeof id === "string");
}

/* Les solides tirés de plusieurs esquisses, pour les boutons « Balayer », « Lisser ». */
export function solidesMultiEsquisses() {
  return TYPES.filter((type) => typeof type.construireDepuisEsquisses === "function");
}

/* Les solides qu'on sait tirer d'une esquisse, pour les boutons « Extruder »… */
export function solidesDEsquisse() {
  return TYPES.filter((type) => typeof type.construireDepuisProfil === "function");
}

export function estTransformable(nomDuType) {
  return typeDeNoeud(nomDuType).transformable !== false;
}

/* Une forme normalisée tient dans le cube unité : ses dimensions sont son
   échelle. Les autres (le groupe) ont la taille de ce qu'elles contiennent. */
export function estNormalise(nomDuType) {
  return typeDeNoeud(nomDuType).dimensionsParDefaut !== undefined;
}

/* Une éprouvette de calibration, posée par un essai et non par l'élève. */
export function estUneEprouvette(nomDuType) {
  return typeDeNoeud(nomDuType).eprouvette === true;
}

export function estDegroupable(nomDuType) {
  return typeDeNoeud(nomDuType).degroupable === true;
}

export function parametresParDefaut(nomDuType) {
  const type = typeDeNoeud(nomDuType);
  const valeurs = {};
  for (const [cle, description] of Object.entries(type.parametres)) {
    valeurs[cle] = description.defaut;
  }
  return valeurs;
}

/* Les fichiers importés dont un sous-arbre a besoin pour être construit : un
   groupe qui contient un boîtier importé a besoin du boîtier. */
export function fichiersDuSousArbre(noeud) {
  const cles = new Set();
  const visiter = (n) => {
    const type = typeDeNoeud(n.type);
    if (typeof type.fichiersRequis === "function") {
      for (const cle of type.fichiersRequis({ ...parametresParDefaut(n.type), ...n.parametres })) cles.add(cle);
    }
    for (const enfant of n.enfants ?? []) visiter(enfant);
  };
  visiter(noeud);
  return [...cles];
}

export function etiquetteDuType(nomDuType) {
  return typeExiste(nomDuType) ? PAR_NOM.get(nomDuType).etiquette : nomDuType;
}
