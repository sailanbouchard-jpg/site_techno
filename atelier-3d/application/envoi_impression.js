/*
 * application/envoi_impression.js
 * ───────────────────────────────
 * Du plateau tranché à l'imprimante : le G-code, le fichier .gcode.3mf à
 * télécharger (carte SD), et l'envoi aux imprimantes du réseau local.
 *
 * Le navigateur écrit le G-code ; le serveur l'emballe en .gcode.3mf et le
 * transmet à l'imprimante (il est seul à parler MQTT et FTPS). Hors du site
 * (atelier ouvert en fichiers locaux), l'export se replie sur le .gcode brut.
 *
 * Un seul préréglage d'imprimante couvre la P1P et la P1S : elles tranchent à
 * l'identique, seul l'en-tête du fichier diffère (la P1S a un ventilateur de
 * carte et un ventilateur de caisson). Le modèle est donc décidé au dernier
 * moment : à l'envoi par le réseau, c'est celui de l'imprimante choisie ; pour
 * le fichier qu'on met sur la carte SD, c'est « Machine visée », dans les
 * réglages de l'imprimante.
 */

import { genererGcode } from "../tranchage/generation_gcode.js";
import { prereglage, valeurEffective } from "../noyau/reglages_impression.js";
import { MACHINES } from "../noyau/plateau.js";
import { requete, requeteJson, corpsJson } from "../stockage/requetes.js";

const URL_3MF = "/api/cao/gcode3mf";
const URL_IMPRIMANTES = "/api/imprimantes";
const URL_ADMIN = "/api/admin/me";
const ATTENTE_MAX_MS = 180000;
const INTERVALLE_MS = 250;
const COULEUR_PAR_DEFAUT = "#FFFFFF";

const nomDeFichier = (nom) => (nom.trim() || "projet").replace(/[\\/:*?"<>|]+/g, "_");

/*
 * dependances : { tranchage, plateau, annoncer(texte, erreur), telecharger(contenu, nom, type), nomDuProjet(),
 *                 modulations(etat) → { modulations, modulationsDePiece } : ce qu'un essai de
 *                 calibration ajoute au G-code. Sans essai posé, deux listes vides. }
 */
export function creerEnvoiImpression({ tranchage, plateau, annoncer, telecharger, nomDuProjet, modulations = () => ({ modulations: [], modulationsDePiece: [] }) }) {
  /* Tranche le plateau s'il ne l'est pas déjà, et attend la fin (jupe comprise). */
  async function plateauTranche() {
    const resume = plateau.resume();
    if (resume.pieces.length === 0) throw new Error("Le plateau est vide.");
    if (resume.fautives > 0) throw new Error("Des pièces dépassent du plateau ou se chevauchent : les déplacer d'abord.");
    const debut = performance.now();
    let dernierePart = -1;
    for (;;) {
      if (plateau.resume().pieces.every((p) => !p.enCalcul)) {
        tranchage.mettreAJour(plateau.piecesATrancher(), plateau.impression());
        const etat = tranchage.etat();
        const jupeAttendue = etat.reglages.tours_jupe > 0;
        const jupePresente = etat.pieces.length > etat.total;
        if (etat.restantes === 0 && tranchage.enCours() === 0 && (!jupeAttendue || jupePresente)) return etat;
        // Sans l'aperçu ouvert, la barre d'état est le seul endroit où suivre le tranchage.
        const part = Math.round((etat.avancement ?? 0) * 100);
        if (part !== dernierePart) {
          annoncer("Tranchage : " + part + " %");
          dernierePart = part;
        }
      }
      if (performance.now() - debut > ATTENTE_MAX_MS) throw new Error("Le tranchage n'a pas abouti : réessayer.");
      await new Promise((fin) => setTimeout(fin, INTERVALLE_MS));
    }
  }

  /* modele : le code de la machine visée (C11, C12) ; par défaut celui des réglages. */
  async function preparer(modele = null) {
    const tranche = await plateauTranche();
    // Un essai de calibration module le G-code : d'autres réglages à partir de
    // telle couche, et d'autres pour telle pièce. C'est le seul endroit où la
    // calibration touche au tranchage.
    const etat = { ...tranche, ...modulations(tranche) };
    const impression = plateau.impression();
    const machine = modele === null ? plateau.machine()
      : (MACHINES.find((m) => m.modele === modele) ?? plateau.machine());
    const materiau = prereglage("materiau", impression.materiau);
    const resultat = genererGcode(etat, machine, materiau.matiere);
    return {
      nom: nomDuProjet(),
      gcode: resultat.texte,
      modele: machine.modele,
      matiere: materiau.matiere,
      buse: valeurEffective(impression, "diametre_buse"),
      couleur: COULEUR_PAR_DEFAUT,
      duree: resultat.duree,
      poids: resultat.poids,
      longueur: resultat.longueurFil,
    };
  }

  return {
    /* Le fichier à mettre sur la carte SD de l'imprimante. */
    async exporter() {
      annoncer("Préparation du G-code…");
      let fichier;
      try {
        fichier = await preparer();
      } catch (erreur) {
        annoncer(erreur.message, true);
        return;
      }
      const base = nomDeFichier(fichier.nom);
      try {
        const reponse = await requete(URL_3MF, corpsJson("POST", fichier));
        telecharger(await reponse.blob(), base + ".gcode.3mf", "application/octet-stream");
        annoncer("Fichier .gcode.3mf prêt : le copier sur la carte SD de l'imprimante.");
      } catch (_erreur) {
        telecharger(fichier.gcode, base + ".gcode", "text/plain");
        annoncer("Site injoignable : G-code brut téléchargé. Le .gcode.3mf demande l'atelier ouvert depuis le site.", true);
      }
    },

    /* Tranche, emballe et lance l'impression sur une imprimante du réseau.
       emplacement : la bobine de l'AMS (0 à 15), ou null pour la bobine externe.
       modele : le modèle de CETTE imprimante — le G-code s'y adapte tout seul. */
    async imprimer(id, emplacement, modele = null) {
      const fichier = await preparer(modele);
      await requeteJson(URL_IMPRIMANTES + "/" + encodeURIComponent(id) + "/impression", corpsJson("POST", { ...fichier, emplacement }));
    },

    async estAdministrateur() {
      try {
        const reponse = await fetch(URL_ADMIN, { credentials: "same-origin" });
        return reponse.ok && (await reponse.json()).admin === true;
      } catch (_erreur) {
        return false;
      }
    },

    lister: () => requeteJson(URL_IMPRIMANTES),
    enregistrer: (id, champs) => requeteJson(URL_IMPRIMANTES + "/" + encodeURIComponent(id), corpsJson("PUT", champs)),
    retirer: (id) => requeteJson(URL_IMPRIMANTES + "/" + encodeURIComponent(id), { method: "DELETE" }),
    commande: (id, action) => requeteJson(URL_IMPRIMANTES + "/" + encodeURIComponent(id) + "/commande", corpsJson("POST", { action })),
  };
}
