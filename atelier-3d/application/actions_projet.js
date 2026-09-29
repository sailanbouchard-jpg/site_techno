/*
 * application/actions_projet.js
 * ─────────────────────────────
 * Ouvrir, créer, supprimer un projet ; importer un STL ; exporter le résultat.
 * Pas de menu « Fichier » : l'enregistrement est permanent et automatique.
 */

import { creerDocument, compterNoeuds } from "../noyau/document.js";
import { nouvelObjet } from "../noyau/fabrique_de_noeuds.js";
import { objetsAffichables } from "../noyau/objets_affichables.js";
import { documentDepuisBrut } from "../noyau/serialisation_document.js";
import { commandeAjouterNoeud } from "../noyau/commandes/commande_ajouter_noeud.js";
import { commandeRenommerDocument } from "../noyau/commandes/commande_renommer_document.js";
import { stlBinaire, morceauAExporter } from "../geometrie/export_stl.js";

const PARAMETRE_D_URL = "projet";

function nomDeFichier(nom) {
  const propre = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
  return (propre.replace(/^_+|_+$/g, "") || "projet") + ".stl";
}

function noterDansLAdresse(id) {
  const adresse = new URL(globalThis.location.href);
  if (id === null) adresse.searchParams.delete(PARAMETRE_D_URL);
  else adresse.searchParams.set(PARAMETRE_D_URL, id);
  globalThis.history.replaceState(null, "", adresse);
}

/*
 * dependances : { etat, scene, affichage, fichiers, stockage, enregistrement,
 *                 annoncer(texte, erreur), telecharger(contenu, nom, type) }
 */
export function creerActionsProjet(dependances) {
  const { etat, scene, affichage, fichiers, stockage, enregistrement, annoncer } = dependances;

  async function ouvrirDocument(id, document) {
    etat.remplacerDocument(document);
    enregistrement.suivreProjet(id, document);
    noterDansLAdresse(id);
    affichage.oublierLesEchecs();
  }

  return {
    projetDansLAdresse: () => new URL(globalThis.location.href).searchParams.get(PARAMETRE_D_URL),
    noterProjet: noterDansLAdresse,
    listerProjets: () => stockage.lister(),

    renommer(nom) {
      try {
        etat.executer(commandeRenommerDocument.creer(etat.document().nom, nom));
      } catch (erreur) {
        annoncer(erreur.message, true);
      }
    },

    async ouvrir(id) {
      try {
        await enregistrement.enregistrerMaintenant();
        const projet = await stockage.ouvrir(id);
        await ouvrirDocument(projet.id, documentDepuisBrut(projet.document));
        annoncer("Projet « " + etat.document().nom + " » ouvert.");
        return true;
      } catch (erreur) {
        annoncer("Impossible d'ouvrir ce projet : " + erreur.message, true);
        return false;
      }
    },

    /* Un projet neuf n'existe sur le stockage qu'à son premier enregistrement :
       ouvrir le logiciel pour regarder ne crée rien. */
    async nouveau() {
      await enregistrement.enregistrerMaintenant();
      await ouvrirDocument(null, creerDocument());
      annoncer("Nouveau projet.");
    },

    async supprimer(id) {
      try {
        await stockage.supprimer(id);
        if (enregistrement.projetCourant() === id) {
          const vide = creerDocument();
          etat.remplacerDocument(vide);
          enregistrement.suivreProjet(null, vide);
          noterDansLAdresse(null);
        }
        annoncer("Projet supprimé.");
      } catch (erreur) {
        annoncer("Suppression impossible : " + erreur.message, true);
      }
    },

    async importer(listeDeFichiers) {
      for (const fichier of listeDeFichiers) {
        annoncer("Lecture de « " + fichier.name + " »…");
        try {
          const infos = await fichiers.importer(fichier);
          const vise = dependances.placeLibre(infos.taille[0], infos.taille[1]);
          const objet = nouvelObjet("importe", {
            nom: fichier.name.replace(/\.stl$/i, ""),
            parametres: { fichier: infos.cle, nomDuFichier: fichier.name, triangles: infos.triangles },
            transformation: {
              position: { x: Math.round(vise[0]), y: Math.round(vise[1]), z: 0 },
              echelle: { x: infos.taille[0] || 1, y: infos.taille[1] || 1, z: infos.taille[2] || 1 },
            },
          });
          etat.executer(commandeAjouterNoeud.creer(etat.document().racine.id, objet));
          annoncer(infos.avertissement ?? "« " + fichier.name + " » importé : " +
            infos.triangles.toLocaleString("fr-FR") + " triangles.", infos.avertissement !== null);
          dependances.cadrerQuandPret();
        } catch (erreur) {
          annoncer(erreur.message, true);
        }
      }
    },

    exporter() {
      const document = etat.document();
      // Un trou seul ne creuse rien : il ne part pas à l'impression.
      const objets = objetsAffichables(document).filter((noeud) => !noeud.trou);
      if (objets.length === 0) {
        annoncer(compterNoeuds(document) === 0
          ? "Le projet est vide : ajoute une forme avant d'exporter."
          : "Le projet ne contient que des trous : les grouper avec une pièce pleine pour qu'ils creusent.", true);
        return;
      }
      const maillages = objets.map((noeud) => affichage.maillageDe(noeud));
      if (maillages.some((m) => m === null)) {
        annoncer("Un calcul est en cours : réessayer dans un instant.", true);
        return;
      }

      const morceaux = objets.map((noeud, i) => morceauAExporter(maillages[i], noeud.transformation));
      dependances.telecharger(stlBinaire(morceaux, document.nom), nomDeFichier(document.nom), "model/stl");

      const triangles = maillages.reduce((total, m) => total + m.triangles, 0);
      if (maillages.every((m) => m.etanche)) {
        annoncer("STL exporté : " + triangles.toLocaleString("fr-FR") + " triangles, maillage étanche.");
      } else {
        annoncer("STL exporté, mais un objet n'est pas étanche : l'impression risque d'échouer.", true);
      }
    },
  };
}
