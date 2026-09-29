/*
 * geometrie/construction_du_solide.js
 * ───────────────────────────────────
 * Transforme un sous-arbre de nœuds en maillage, avec Manifold. Aucun accès au
 * DOM, aucun postMessage : ce fichier ne sait pas qu'il tourne dans un ouvrier,
 * et c'est ce qui permet de le faire tourner aussi sous Node, avec le même
 * moteur, pour vérifier qu'un STL sort bien étanche sans ouvrir un navigateur.
 */

import { typeDeNoeud, parametresParDefaut, estNormalise, fournitUnProfil } from "../noyau/registre_types_de_noeuds.js";
import { contenuDe } from "../noyau/esquisse/elements_esquisse.js";
import { analyserEsquisse } from "../noyau/esquisse/contours_esquisse.js";
import { matriceDeLEsquisse, enColonnes } from "../noyau/esquisse/plans_esquisse.js";
import { matriceDOrigine, sourcesDesEsquisses } from "../noyau/esquisse/solides_d_esquisse.js";
import { composer } from "../noyau/transformations.js";
import { normalesAdoucies } from "./normales_du_maillage.js";

// ── Suivi de la mémoire WebAssembly ─────────────────────────────────────────

/*
 * Chaque solide Manifold et chaque section 2D tiennent de la mémoire dans le
 * tas WebAssembly, rendue seulement par un appel explicite à delete(). Un
 * booléen en fabrique des dizaines au passage : sans suivi, une séance de
 * classe finit par saturer l'onglet.
 *
 * Piège : les méthodes d'instance (translate, subtract…) ne sont pas sur
 * Manifold.prototype, qui est vide, mais sur le prototype de la classe native,
 * un cran plus haut. C'est là qu'il faut les envelopper.
 */
const METHODES_DE_BASE = new Set(["constructor", "isAliasOf", "clone", "delete", "isDeleted", "deleteLater"]);
const suivis = new Set();
const bilan = { crees: 0, liberes: 0 };

function suivre(resultat) {
  if (Array.isArray(resultat)) {
    resultat.forEach(suivre);
  } else if (resultat !== null && typeof resultat === "object"
    && typeof resultat.delete === "function" && typeof resultat.isDeleted === "function"
    && !suivis.has(resultat)) {
    suivis.add(resultat);
    bilan.crees += 1;
  }
  return resultat;
}

function envelopperLesMethodes(porteur) {
  for (const nom of Object.getOwnPropertyNames(porteur)) {
    if (METHODES_DE_BASE.has(nom) || nom === "prototype" || nom === "length" || nom === "name") continue;
    const descripteur = Object.getOwnPropertyDescriptor(porteur, nom);
    if (!descripteur || typeof descripteur.value !== "function" || !descripteur.writable) continue;

    const original = descripteur.value;
    porteur[nom] = function (...args) {
      return suivre(original.apply(this, args));
    };
  }
}

function classeSuivie(classe) {
  envelopperLesMethodes(classe);
  envelopperLesMethodes(Object.getPrototypeOf(classe.prototype));
  // « new » ne passe par aucune méthode : on l'intercepte à part.
  return new Proxy(classe, {
    construct: (cible, args) => suivre(Reflect.construct(cible, args)),
  });
}

const ateliers = new WeakMap();

/* Le module Manifold tel que le voient les types de nœuds : les mêmes classes,
   mais dont tout ce qui se crée est noté pour être libéré. Une seule
   préparation par module : les prototypes sont partagés. */
export function preparerAtelier(wasm) {
  if (!ateliers.has(wasm)) {
    ateliers.set(wasm, Object.create(wasm, {
      Manifold: { value: classeSuivie(wasm.Manifold) },
      CrossSection: { value: classeSuivie(wasm.CrossSection) },
    }));
  }
  return ateliers.get(wasm);
}

export function libererLesSolides() {
  for (const objet of suivis) {
    if (!objet.isDeleted()) objet.delete();
    bilan.liberes += 1;
  }
  suivis.clear();
}

export function bilanMemoire() {
  return { ...bilan, enCours: suivis.size };
}

// ── Transformations ─────────────────────────────────────────────────────────

/*
 * Un nœud sérialisé omet tout ce qui vaut sa valeur par défaut, y compris
 * CHAQUE COMPOSANTE d'une transformation prise séparément : un objet seulement
 * déplacé arrive ici avec une position et rien d'autre.
 */
const NEUTRE = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  echelle: { x: 1, y: 1, z: 1 },
};

function transformationComplete(brute) {
  return {
    position: { ...NEUTRE.position, ...(brute?.position ?? {}) },
    rotation: { ...NEUTRE.rotation, ...(brute?.rotation ?? {}) },
    echelle: { ...NEUTRE.echelle, ...(brute?.echelle ?? {}) },
  };
}

/* Échelle, puis rotation X-Y-Z, puis translation : le même ordre que dans
   noyau/transformations.js et dans la vue. Les trois doivent rester d'accord. */
function placer(solide, transformationBrute) {
  const { position, rotation, echelle } = transformationComplete(transformationBrute);
  return solide
    .scale([echelle.x, echelle.y, echelle.z])
    .rotate([rotation.x, rotation.y, rotation.z])
    .translate([position.x, position.y, position.z]);
}

/* Ramène un solide dans le cube unité : centré en X et Y, posé sur Z = 0. Les
   types n'ont donc pas à soigner la taille de ce qu'ils construisent. */
function normaliser(solide) {
  const { min, max } = solide.boundingBox();
  const taille = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (taille.some((cote) => !(cote > 0))) {
    throw new Error("la forme obtenue est plate ou vide : vérifie ses paramètres.");
  }
  return solide
    .translate([-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]])
    .scale([1 / taille[0], 1 / taille[1], 1 / taille[2]]);
}

function normaliserBrut({ positions, indices }) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 1) {
    const axe = i % 3;
    if (positions[i] < min[axe]) min[axe] = positions[i];
    if (positions[i] > max[axe]) max[axe] = positions[i];
  }
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  const taille = [0, 1, 2].map((axe) => (max[axe] - min[axe]) || 1);

  const normalisees = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 1) {
    const axe = i % 3;
    normalisees[i] = (positions[i] - centre[axe]) / taille[axe];
  }
  return { positions: normalisees, indices: new Uint32Array(indices) };
}

// ── Construction ────────────────────────────────────────────────────────────

/* Les valeurs manquantes retombent sur les défauts du type : un projet
   enregistré avant l'ajout d'un paramètre doit continuer à s'ouvrir. */
function parametresComplets(noeud) {
  return { ...parametresParDefaut(noeud.type), ...noeud.parametres };
}

/* Chaque pièce reçoit son propre identifiant Manifold, que les booléens
   conservent face par face : c'est ce qui rend à chaque face d'un groupe la
   couleur de la pièce d'où elle vient. */
function marquer(solide, chemin, parties) {
  const original = solide.asOriginal();
  parties.set(original.originalID(), chemin);
  return original;
}

/*
 * Rend un solide Manifold, null (rien à construire), ou { maillageBrut } pour
 * un maillage importé qui n'est pas étanche : il s'affiche, mais ne peut
 * entrer dans aucun calcul booléen.
 *
 * chemin : les rangs des enfants, du nœud calculé jusqu'à celui-ci ;
 * parties : identifiant Manifold → chemin de la pièce, rempli au passage.
 */
export function construireSousArbre(atelier, noeud, ressources, chemin = [], parties = new Map()) {
  const type = typeDeNoeud(noeud.type);

  if (typeof type.construire === "function") {
    const resultat = type.construire(atelier, parametresComplets(noeud), ressources);
    if (resultat === null || resultat.maillageBrut !== undefined) return resultat;
    if (resultat.isEmpty()) return null;
    return marquer(estNormalise(noeud.type) ? normaliser(resultat) : resultat, chemin, parties);
  }

  if (typeof type.construireDepuisProfil === "function") {
    const solide = construireDepuisEsquisse(atelier, noeud, type);
    return solide === null ? null : marquer(solide, chemin, parties);
  }

  if (typeof type.construireDepuisEsquisses === "function") {
    const solide = construireDepuisPlusieursEsquisses(atelier, noeud, type);
    return solide === null ? null : marquer(solide, chemin, parties);
  }

  if (typeof type.copies === "function") {
    return construireLesCopies(atelier, noeud, type, ressources, chemin, parties);
  }

  if (typeof type.assembler === "function") {
    // Une erreur préparée avant le calcul (modèle absent, réglage hors bornes) : on la dit.
    if (typeof noeud.parametres?.erreurDePreparation === "string") throw new Error(noeud.parametres.erreurDePreparation);
    const enfants = [];
    for (const [rang, enfant] of (noeud.enfants ?? []).entries()) {
      if (enfant.visible === false) continue;
      const solide = construireSousArbre(atelier, enfant, ressources, [...chemin, rang], parties);
      if (solide === null) continue;
      if (solide.maillageBrut !== undefined) {
        throw new Error("« " + (enfant.nom || enfant.parametres?.nomDuFichier || "un objet importé") +
          " » n'est pas étanche : il ne peut pas être groupé. Réparer le fichier avant de l'importer.");
      }
      enfants.push({ trou: enfant.trou === true, solide: placer(solide, enfant.transformation) });
    }
    return enfants.length === 0 ? null : type.assembler(atelier, enfants, parametresComplets(noeud));
  }

  // Ni l'un ni l'autre : c'est un conteneur, la couche au-dessus construit ses
  // enfants un par un. Voir noyau/types/type_noeud_racine.js.
  return null;
}

/* Chaque exemplaire est le solide de l'enfant, déplacé par sa matrice ; on
   les soude, comme un groupe. */
function construireLesCopies(atelier, noeud, type, ressources, chemin, parties) {
  const rang = (noeud.enfants ?? []).findIndex((e) => e.visible !== false);
  if (rang === -1) return null;
  const enfant = noeud.enfants[rang];
  const solide = construireSousArbre(atelier, enfant, ressources, [...chemin, rang], parties);
  if (solide === null) return null;
  if (solide.maillageBrut !== undefined) {
    throw new Error("un objet importé non étanche ne peut pas être répété. Réparer le fichier avant de l'importer.");
  }
  const place = placer(solide, enfant.transformation);
  const exemplaires = type.copies(parametresComplets(noeud)).map((m) => place.transform(enColonnes(m)));
  return exemplaires.length === 1 ? exemplaires[0] : atelier.Manifold.union(exemplaires);
}

/* Le solide est calculé dans le repère du plan, puis posé à l'endroit où
   l'esquisse a été dessinée, recentré sur son origine. L'esquisse est lue même
   masquée : la cacher ne doit pas faire disparaître le solide. */
function construireDepuisEsquisse(atelier, noeud, type) {
  const esquisse = (noeud.enfants ?? []).find((enfant) => fournitUnProfil(enfant.type));
  if (esquisse === undefined) {
    throw new Error("« " + (noeud.nom || type.etiquette) + " » a perdu son esquisse : annuler la dernière action.");
  }
  const profil = analyserEsquisse(contenuDe(esquisse.parametres ?? {}));
  const p = parametresComplets(noeud);
  const solide = type.construireDepuisProfil(atelier, p, profil, contenuDe(esquisse.parametres ?? {}));
  if (solide === null || solide.isEmpty()) return null;
  return solide.transform(enColonnes(composer(matriceDOrigine(p), matriceDeLEsquisse(parametresComplets(esquisse)))));
}

/* Balayage, lissage : les esquisses arrivent en enfants, dans l'ordre que le
   type attend. Le solide est calculé directement dans le monde, puis recentré
   sur son origine. */
function construireDepuisPlusieursEsquisses(atelier, noeud, type) {
  const p = parametresComplets(noeud);
  const esquisses = (noeud.enfants ?? []).filter((enfant) => fournitUnProfil(enfant.type));
  if (esquisses.length !== type.esquissesDe(p).length) {
    throw new Error("« " + (noeud.nom || type.etiquette) + " » a perdu une de ses esquisses : annuler la dernière action.");
  }
  const solide = type.construireDepuisEsquisses(atelier, p, sourcesDesEsquisses(esquisses.map((e) => ({ ...e, parametres: parametresComplets(e) }))));
  if (solide === null || solide.isEmpty()) return null;
  return solide.transform(enColonnes(matriceDOrigine(p)));
}

// ── Extraction du maillage ──────────────────────────────────────────────────

/*
 * Les faces sortent rangées par pièce d'origine. On en tire les chemins des
 * pièces et des plages de triangles { debut, nombre, partie } — debut et
 * nombre comptés en indices, comme les groupes de three.js. Rien si tout vient
 * d'une seule pièce : le cas de tout objet qui n'est pas un groupe.
 */
function partiesDuMaillage(brut, parties) {
  const chemins = [];
  const rangs = new Map();      // identifiant Manifold → rang dans chemins
  const groupes = [];
  for (let r = 0; r < brut.runOriginalID.length; r += 1) {
    const id = brut.runOriginalID[r];
    if (!rangs.has(id)) {
      rangs.set(id, chemins.length);
      chemins.push(parties.get(id) ?? null);   // null : d'origine inconnue
    }
    const debut = brut.runIndex[r];
    const fin = brut.runIndex[r + 1] ?? brut.triVerts.length;
    const partie = rangs.get(id);
    const dernier = groupes[groupes.length - 1];
    if (dernier !== undefined && dernier.partie === partie && dernier.debut + dernier.nombre === debut) {
      dernier.nombre += fin - debut;
    } else if (fin > debut) {
      groupes.push({ debut, nombre: fin - debut, partie });
    }
  }
  return chemins.length < 2 ? { parties: null, groupes: null } : { parties: chemins, groupes };
}

function maillageDepuisSolide(solide, parties) {
  const brut = solide.getMesh();
  const nombreDeProprietes = brut.numProp;
  const nombreDeSommets = brut.vertProperties.length / nombreDeProprietes;

  // Toujours une copie : ces tableaux partiront en transférables, et les
  // originaux appartiennent au moteur.
  const positions = new Float32Array(nombreDeSommets * 3);
  for (let i = 0; i < nombreDeSommets; i += 1) {
    positions[i * 3] = brut.vertProperties[i * nombreDeProprietes];
    positions[i * 3 + 1] = brut.vertProperties[i * nombreDeProprietes + 1];
    positions[i * 3 + 2] = brut.vertProperties[i * nombreDeProprietes + 2];
  }

  const boite = solide.boundingBox();
  const lisse = normalesAdoucies(positions, new Uint32Array(brut.triVerts));
  return {
    positions: lisse.positions,
    normales: lisse.normales,
    indices: lisse.indices,
    boite: { min: [...boite.min], max: [...boite.max] },
    etanche: solide.status() === "NoError",
    triangles: brut.triVerts.length / 3,
    ...partiesDuMaillage(brut, parties),
  };
}

function maillageDepuisBrut(brut) {
  const normalise = normaliserBrut(brut);
  const lisse = normalesAdoucies(normalise.positions, normalise.indices);
  return {
    positions: lisse.positions,
    normales: lisse.normales,
    indices: lisse.indices,
    boite: { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 1] },
    etanche: false,
    triangles: indices.length / 3,
    parties: null,
    groupes: null,
  };
}

/* Un solide vide n'est pas une erreur : un groupe qui ne contient que des trous
   ne produit rien, et l'élève doit le voir dans la vue, pas dans un message. */
function maillageVide() {
  return {
    positions: new Float32Array(0),
    normales: new Float32Array(0),
    indices: new Uint32Array(0),
    boite: { min: [0, 0, 0], max: [0, 0, 0] },
    etanche: true,
    triangles: 0,
    parties: null,
    groupes: null,
  };
}

const SANS_RESSOURCES = {
  maillageImporte: () => null,
  texte: () => { throw new Error("aucune police n'est chargée."); },
};

/* Le point d'entrée : un nœud sérialisé, un maillage et le temps que ça a pris.
   Libère la mémoire WebAssembly même si le calcul échoue. */
export function construireMaillage(atelier, noeud, ressources = SANS_RESSOURCES, chrono = () => 0) {
  const debut = chrono();
  try {
    const parties = new Map();
    const resultat = construireSousArbre(atelier, noeud, ressources, [], parties);
    let maillage;
    if (resultat === null) maillage = maillageVide();
    else if (resultat.maillageBrut !== undefined) maillage = maillageDepuisBrut(resultat.maillageBrut);
    else maillage = maillageDepuisSolide(resultat, parties);
    return { maillage, dureeMs: chrono() - debut };
  } finally {
    libererLesSolides();
  }
}
