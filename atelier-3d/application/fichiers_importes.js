/*
 * application/fichiers_importes.js
 * ────────────────────────────────
 * Le trajet d'un fichier STL : du disque de l'élève à l'ouvrier (qui le lit)
 * et au stockage (qui le garde). À la réouverture d'un projet, le trajet
 * inverse : du stockage à l'ouvrier, avant tout calcul qui en a besoin.
 */

import { TRIANGLES_CONSEILLES } from "../geometrie/lecture_stl.js";
import { estUneCleDePolice, policeDeLaCle } from "../noyau/polices.js";
import { estUneCleDEprouvette, modeleDeLaCle } from "../noyau/eprouvettes.js";
import { DOSSIER_DES_MODELES } from "../noyau/calibration.js";

const DOSSIER_DES_POLICES = new URL("../vendor/polices/", import.meta.url);
const DOSSIER_DES_EPROUVETTES = new URL(DOSSIER_DES_MODELES, import.meta.url);

const TAILLE_MAXIMALE_OCTETS = 20 * 1024 * 1024;

export function creerFichiersImportes(ouvrier, stockage) {
  const enChargement = new Map();

  return {
    /* Charge dans l'ouvrier les fichiers qui n'y sont pas encore. */
    garantir(cles) {
      return Promise.all(cles.map((cle) => {
        if (ouvrier.fichierCharge(cle)) return null;
        if (!enChargement.has(cle)) {
          // Une police et une éprouvette viennent avec le logiciel, pas du
          // stockage de l'élève : l'ouvrier va les chercher lui-même.
          const trajet = (estUneCleDePolice(cle)
            ? ouvrier.chargerPolice(cle, new URL(policeDeLaCle(cle).fichier, DOSSIER_DES_POLICES).href)
            : estUneCleDEprouvette(cle)
              ? ouvrier.chargerEprouvette(cle, new URL(modeleDeLaCle(cle), DOSSIER_DES_EPROUVETTES).href)
              : stockage.lire(cle).then((octets) => ouvrier.chargerFichier(octets)))
            .finally(() => enChargement.delete(cle));
          enChargement.set(cle, trajet);
        }
        return enChargement.get(cle);
      }));
    },

    /* Rend { cle, triangles, boite, avertissement } pour un fichier choisi par
       l'élève. L'avertissement est à afficher, pas à cacher : un fichier trop
       lourd ou à une échelle étrange se découvre maintenant ou à l'impression. */
    async importer(fichier) {
      if (!/\.stl$/i.test(fichier.name)) {
        throw new Error("« " + fichier.name + " » n'est pas un fichier STL. Seuls les .stl s'importent pour l'instant.");
      }
      if (fichier.size > TAILLE_MAXIMALE_OCTETS) {
        throw new Error("« " + fichier.name + " » dépasse 20 Mo : réduire le fichier avant de l'importer.");
      }

      const octets = await fichier.arrayBuffer();
      const aGarder = octets.slice(0);   // l'original part en transférable vers l'ouvrier
      const infos = await ouvrier.chargerFichier(octets);
      await stockage.deposer(infos.cle, aGarder, fichier.name);

      const taille = [0, 1, 2].map((i) => infos.boite.max[i] - infos.boite.min[i]);
      const plusGrand = Math.max(...taille);
      let avertissement = null;
      if (infos.triangles > TRIANGLES_CONSEILLES) {
        avertissement = "Fichier très détaillé (" + infos.triangles.toLocaleString("fr-FR") + " triangles) : l'affichage peut ralentir.";
      } else if (plusGrand < 1) {
        avertissement = "Ce fichier mesure moins d'un millimètre : il a sans doute été enregistré en mètres. Vérifier ses dimensions.";
      } else if (plusGrand > 1000) {
        avertissement = "Ce fichier dépasse un mètre : il a peut-être été enregistré dans une autre unité. Vérifier ses dimensions.";
      }
      return { ...infos, taille, avertissement };
    },
  };
}
