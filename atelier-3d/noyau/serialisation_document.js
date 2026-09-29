/*
 * noyau/serialisation_document.js
 * ───────────────────────────────
 * Aller-retour entre le document et son texte JSON. Deux règles :
 *
 *  1. Aucun maillage n'est jamais écrit. Un projet, c'est quelques kilo-octets
 *     de description, rejoués à l'ouverture.
 *  2. L'écriture omet tout ce qui vaut sa valeur par défaut — nom vide,
 *     transformation neutre, liste d'enfants vide. Le fichier reste lisible et
 *     léger, et la lecture remet les défauts en place. L'aller-retour rend donc
 *     un document identique, pas un document alourdi.
 */

import { creerDocument, FORMAT_DOCUMENT } from "./document.js";
import { creerNoeud, TRANSFORMATION_NEUTRE } from "./noeud.js";
import { migrer, versionLaPlusRecente } from "./migrations_document.js";
import { typeExiste } from "./registre_types_de_noeuds.js";
import { impressionDepuisBrut, impressionVersBrut, impressionEstVide } from "./plateau.js";

const TYPE_INCONNU = "inconnu";

function vecteurEstNeutre(vecteur, neutre) {
  return vecteur.x === neutre.x && vecteur.y === neutre.y && vecteur.z === neutre.z;
}

function transformationVersBrut(transformation) {
  const brut = {};
  if (!vecteurEstNeutre(transformation.position, TRANSFORMATION_NEUTRE.position)) {
    brut.position = { ...transformation.position };
  }
  if (!vecteurEstNeutre(transformation.rotation, TRANSFORMATION_NEUTRE.rotation)) {
    brut.rotation = { ...transformation.rotation };
  }
  if (!vecteurEstNeutre(transformation.echelle, TRANSFORMATION_NEUTRE.echelle)) {
    brut.echelle = { ...transformation.echelle };
  }
  if (!vecteurEstNeutre(transformation.appui, TRANSFORMATION_NEUTRE.appui)) {
    brut.appui = { ...transformation.appui };
  }
  return brut;
}

function noeudVersBrut(noeud) {
  // Un objet non reconnu est réenregistré tel qu'il est arrivé : ouvrir un
  // projet avec une version plus ancienne du logiciel ne doit rien détruire.
  if (noeud.type === TYPE_INCONNU) return { ...noeud.parametres.brut };
  const brut = { id: noeud.id, type: noeud.type };

  if (noeud.nom !== "") brut.nom = noeud.nom;
  if (Object.keys(noeud.parametres).length > 0) brut.parametres = { ...noeud.parametres };

  const transformation = transformationVersBrut(noeud.transformation);
  if (Object.keys(transformation).length > 0) brut.transformation = transformation;

  if (noeud.couleur !== null) brut.couleur = noeud.couleur;
  if (noeud.finition !== null) brut.finition = noeud.finition;
  if (Object.keys(noeud.formules).length > 0) brut.formules = { ...noeud.formules };
  if (noeud.trou) brut.trou = true;
  if (!noeud.visible) brut.visible = false;
  if (noeud.enfants.length > 0) brut.enfants = noeud.enfants.map(noeudVersBrut);

  return brut;
}

function noeudDepuisBrut(brut) {
  if (!typeExiste(brut.type)) {
    return creerNoeud({
      id: brut.id,
      type: TYPE_INCONNU,
      parametres: { typeOrigine: String(brut.type ?? "?"), brut },
      visible: false,
    });
  }
  return creerNoeud({
    ...brut,
    enfants: (brut.enfants ?? []).map(noeudDepuisBrut),
  });
}

/* Un fichier retouché à la main ne doit pas faire planter l'ouverture : ce
   qui n'a pas la forme d'une variable est laissé de côté. */
function variablesDepuisBrut(liste) {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((v) => v && typeof v.id === "string" && typeof v.nom === "string" && typeof v.formule === "string")
    .map((v) => {
      const propre = { id: v.id, nom: v.nom, formule: v.formule };
      // Bornes, unité et aide : facultatives, gardées seulement si elles ont la bonne forme.
      for (const cle of ["min", "max", "unite", "aide", "valeurs"]) {
        if (typeof v[cle] === "string" && v[cle] !== "") propre[cle] = v[cle];
      }
      return propre;
    });
}

export function documentVersBrut(document) {
  const brut = {
    format: document.format,
    version: document.version,
    nom: document.nom,
    racine: noeudVersBrut(document.racine),
  };
  if ((document.coupes ?? []).length > 0) brut.coupes = document.coupes.map((c) => ({ ...c }));
  if (document.variables.length > 0) brut.variables = document.variables.map((v) => ({ ...v }));
  // Un champ de plus, lu seulement s'il est là : les anciens projets s'ouvrent avec un plateau vide.
  if (!impressionEstVide(document.impression ?? null)) brut.impression = impressionVersBrut(document.impression);
  return brut;
}

export function documentVersTexte(document, indenter = false) {
  return JSON.stringify(documentVersBrut(document), null, indenter ? 2 : 0);
}

export function documentDepuisBrut(brut) {
  if (brut === null || typeof brut !== "object") {
    throw new Error("Ce fichier ne contient pas de projet.");
  }
  if (brut.format !== FORMAT_DOCUMENT) {
    throw new Error("Ce fichier n'est pas un projet de l'Atelier 3D.");
  }
  if (!Number.isInteger(brut.version) || brut.version < 1) {
    throw new Error("Ce projet n'indique pas sa version : impossible de l'ouvrir sans risque.");
  }
  if (brut.version > versionLaPlusRecente()) {
    throw new Error(
      "Ce projet a été enregistré par une version plus récente du logiciel. " +
      "Recharger la page avant de l'ouvrir."
    );
  }

  const migre = migrer(brut);
  return creerDocument({
    nom: migre.nom,
    racine: noeudDepuisBrut(migre.racine),
    coupes: migre.coupes ?? [],
    variables: variablesDepuisBrut(migre.variables),
    impression: impressionDepuisBrut(migre.impression ?? null),
  });
}

export function documentDepuisTexte(texte) {
  let brut;
  try {
    brut = JSON.parse(texte);
  } catch (_erreur) {
    throw new Error("Ce fichier est abîmé : son contenu n'est pas lisible.");
  }
  return documentDepuisBrut(brut);
}
