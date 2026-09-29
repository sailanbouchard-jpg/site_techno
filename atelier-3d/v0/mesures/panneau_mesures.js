/*
 * mesures/panneau_mesures.js
 * ──────────────────────────
 * Le tableau de droite : tout ce que V0 doit rapporter d'un poste du collège.
 * Il vit avec le reste des mesures plutôt que dans interface/, parce qu'il
 * disparaîtra avec elles à la fin du jalon.
 */

import { poidsDuChargement, requetesExterieures, enKilooctets } from "./rapport_performance.js";

const SEPARATEUR = "separateur";

/*
 * releve : { ressourcesDeLOuvrier, dureeDemarrageMoteur, premierCalculMs, froid }
 * statsDuCache et statsDuRendu viennent des couches concernées : ce fichier ne
 * mesure rien lui-même, il met en page.
 */
export function lignesDeMesures(releve, statsDuCache, statsDuRendu, images) {
  const poids = poidsDuChargement(releve.ressourcesDeLOuvrier);
  const externes = requetesExterieures();

  const lignes = [
    ["Fichiers chargés", String(poids.nombreDeRequetes)],
    ["Poids décompressé", enKilooctets(poids.decompresse)],
    ["Reçu du réseau", enKilooctets(poids.reseau)],
    ["Dont déjà en cache", poids.enCache + " fichiers"],
    ["Requêtes hors du site", externes.length === 0 ? "aucune" : String(externes.length)],
  ];

  if (releve.froid !== null) {
    lignes.push(
      [SEPARATEUR],
      ["À froid — réseau", enKilooctets(releve.froid.reseau)],
      ["À froid — décompressé", enKilooctets(releve.froid.decompresse)],
      ["À froid — durée", releve.froid.dureeMs.toFixed(0) + " ms"],
    );
  }

  lignes.push(
    [SEPARATEUR],
    ["Démarrage du moteur", releve.dureeDemarrageMoteur.toFixed(0) + " ms"],
    ["Premier calcul", releve.premierCalculMs === 0 ? "—" : releve.premierCalculMs.toFixed(0) + " ms"],
    ["Calculs effectués", String(statsDuCache.calculs)],
    ["Durée moyenne", statsDuCache.calculs === 0 ? "—" : statsDuCache.dureeMoyenneMs.toFixed(0) + " ms"],
    ["Maillages en cache", String(statsDuCache.entrees)],
    [SEPARATEUR],
    ["Triangles affichés", String(statsDuRendu.triangles)],
    ["Appels de dessin", String(statsDuRendu.appelsDeDessin)],
    ["Images par seconde", images.enPause ? "fenêtre en arrière-plan" : images.courant.toFixed(0)],
    ["Minimum observé", images.minimum === 0 ? "—" : images.minimum.toFixed(0)],
  );

  if (poids.lourdes.length > 0) {
    lignes.push([SEPARATEUR]);
    for (const fichier of poids.lourdes.slice(0, 5)) {
      lignes.push([fichier.nom, enKilooctets(fichier.decompresse)]);
    }
  }

  return lignes;
}

export function dessinerMesures(lignes) {
  const corps = document.getElementById("tableau-mesures");
  corps.textContent = "";

  for (const ligne of lignes) {
    const rangee = document.createElement("tr");
    if (ligne[0] === SEPARATEUR) {
      rangee.className = SEPARATEUR;
      const cellule = document.createElement("td");
      cellule.colSpan = 2;
      rangee.appendChild(cellule);
    } else {
      const libelle = document.createElement("td");
      libelle.textContent = ligne[0];
      const valeur = document.createElement("td");
      valeur.textContent = ligne[1];
      rangee.append(libelle, valeur);
    }
    corps.appendChild(rangee);
  }
}

/* Le rapport que le professeur colle dans un tableur après le passage sur les
   quinze postes. Le navigateur est dedans : sans lui, un chiffre lent ne dit
   pas s'il vient de la machine ou du logiciel. */
export function rapportEnTexte(lignes) {
  const corps = lignes
    .filter((ligne) => ligne[0] !== SEPARATEUR)
    .map((ligne) => ligne[0] + " : " + ligne[1]);
  return ["Atelier 3D — mesures V0", new Date().toISOString(), navigator.userAgent, "", ...corps].join("\n");
}
