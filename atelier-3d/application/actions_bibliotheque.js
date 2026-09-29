/*
 * application/actions_bibliotheque.js
 * ───────────────────────────────────
 * La bibliothèque d'objets paramétriques : poser un objet dans le projet,
 * régler ses paramètres, et créer ou modifier un modèle.
 *
 * Créer un modèle ouvre une scène vide, avec ses propres variables, à la
 * place du projet — mis de côté tel quel, annulations comprises. On y
 * construit l'objet ; ses variables deviennent ses paramètres. « Enregistrer
 * dans la bibliothèque » vérifie qu'il est entièrement contraint, l'écrit
 * dans le logiciel et rend le projet d'avant, où tous les objets tirés de ce
 * modèle se mettent à jour. Pendant ce temps, rien n'est enregistré dans le
 * projet : l'enregistrement automatique continue de ranger le projet mis de côté.
 */

import { creerDocument, trouverNoeud, trouverParent, indexDansParent } from "../noyau/document.js";
import { nouvelObjet } from "../noyau/fabrique_de_noeuds.js";
import { typeDeNoeud } from "../noyau/registre_types_de_noeuds.js";
import { documentDepuisBrut, documentVersBrut } from "../noyau/serialisation_document.js";
import { commandeAjouterNoeud } from "../noyau/commandes/commande_ajouter_noeud.js";
import { commandeModifierParametre } from "../noyau/commandes/commande_modifier_parametre.js";
import { commandeSupprimerNoeud } from "../noyau/commandes/commande_supprimer_noeud.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import {
  connaitreLesModeles, modeleDe, listeDesModeles, parametresDuModele, problemeDesReglages, problemesDuModele,
  identifiantDepuisNom, versionDeLaBibliotheque, piecesDetachees,
} from "../noyau/bibliotheque_d_objets.js";

const NOM_D_UN_NOUVEAU_MODELE = "Nouvel objet";
// Avant son premier calcul, on ne connaît pas la taille de l'objet : une place de cette largeur.
const EMPRISE_SUPPOSEE_MM = 30;

const arrondi = (v) => Math.round(v * 10) / 10;

/* Un fichier de modèle → le modèle tel que le noyau le connaît. */
function modeleDepuisFichier(fichier) {
  return {
    id: fichier.id,
    nom: fichier.nom,
    description: fichier.description ?? "",
    modifie_le: fichier.modifie_le ?? "",
    document: documentDepuisBrut(fichier.document),
  };
}

/*
 * dependances : { etat, stockage, annoncer(texte, erreur), rafraichir(),
 *                 placeLibre(largeur, profondeur), garderEnVue(id), fermerEsquisse() }
 */
export function creerActionsBibliotheque(dependances) {
  const { etat, stockage, annoncer } = dependances;
  let modeles = [];
  let ecriturePermise = false;
  // L'édition d'un modèle en cours : { id (null : nouveau), description, projet (mis de côté) }.
  let session = null;

  function connaitre(liste) {
    modeles = liste;
    connaitreLesModeles(liste);
    dependances.rafraichir();
  }

  /* Un identifiant de fichier libre : deux modèles de même nom ne s'écrasent pas. */
  function identifiantLibre(nom) {
    const base = identifiantDepuisNom(nom);
    let essai = base;
    for (let n = 2; modeles.some((m) => m.id === essai); n += 1) essai = base + "_" + n;
    return essai;
  }

  function ouvrirSession(document, id, description) {
    if (session !== null) {
      annoncer("Un objet paramétrique est déjà en cours d'édition : l'enregistrer ou l'abandonner d'abord.", true);
      return false;
    }
    dependances.fermerEsquisse();
    session = { id, description, projet: etat.mettreDeCote() };
    etat.remplacerDocument(document);
    return true;
  }

  function fermerSession() {
    const projet = session.projet;
    session = null;
    etat.reprendre(projet);
  }

  return {
    async charger() {
      const [lus, permis] = await Promise.all([stockage.toutCharger(), stockage.peutEcrire()]);
      ecriturePermise = permis;
      const valides = [];
      for (const fichier of lus.modeles) {
        try {
          valides.push(modeleDepuisFichier(fichier));
        } catch (_erreur) {
          lus.illisibles.push(fichier.nom ?? fichier.id);
        }
      }
      connaitre(valides);
      if (lus.illisibles.length > 0) annoncer("Bibliothèque : " + lus.illisibles.join(", ") + " illisible(s), laissé(s) de côté.", true);
    },

    modeles: () => listeDesModeles(),
    version: () => versionDeLaBibliotheque(),
    ecriturePermise: () => ecriturePermise,
    enSession: () => session !== null,
    session: () => session,

    /* Le document du projet, même pendant l'édition d'un modèle : c'est lui
       que l'enregistrement automatique range. */
    documentDuProjet: () => (session === null ? etat.document() : session.projet.edition.document),

    poser(idModele) {
      const modele = modeleDe(idModele);
      if (modele === null) return;
      const [x, y] = dependances.placeLibre(EMPRISE_SUPPOSEE_MM, EMPRISE_SUPPOSEE_MM);
      const noeud = nouvelObjet("objet_parametrique", {
        parametres: { modele: modele.id, nomDuModele: modele.nom, reglages: {} },
        transformation: { position: { x: arrondi(x), y: arrondi(y), z: 0 } },
      });
      etat.executer(commandeAjouterNoeud.creer(etat.document().racine.id, noeud));
      dependances.garderEnVue(noeud.id);
      annoncer("« " + modele.nom + " » posé : ses paramètres se règlent dans l'inspecteur.");
    },

    /* Les paramètres d'un objet posé, pour l'inspecteur ; null si son modèle a disparu. */
    parametresDe(noeud) {
      const modele = modeleDe(noeud.parametres.modele);
      return modele === null ? null : parametresDuModele(modele, noeud.parametres.reglages ?? {});
    },

    /* Ce qui distingue les champs à montrer : le modèle et sa version. */
    signatureDe(noeud) {
      return typeDeNoeud(noeud.type).reglagesDuModele ? noeud.parametres.modele + "@" + versionDeLaBibliotheque() : "";
    },

    /* Un paramètre tapé ou réglé. Rend true, ou la raison du refus : une
       borne du modèle l'interdit, directement ou par une autre valeur. */
    regler(idNoeud, idVariable, valeur) {
      const noeud = trouverNoeud(etat.document(), idNoeud);
      const modele = noeud === null ? null : modeleDe(noeud.parametres.modele);
      if (modele === null) return "Le modèle de cet objet n'est plus dans la bibliothèque.";
      const avant = noeud.parametres.reglages ?? {};
      const apres = { ...avant, [idVariable]: valeur };
      const probleme = problemeDesReglages(modele, apres);
      if (probleme !== null) {
        annoncer(probleme, true);
        return probleme;
      }
      etat.executer(commandeModifierParametre.creer(idNoeud, "reglages", avant, apres));
      return true;
    },

    /* Dégrouper les objets paramétriques sélectionnés : chacun laisse place à
       ses pièces, sélectionnées, prêtes à être placées une à une. Rend false
       s'il n'y en avait aucun (le dégroupage ordinaire s'en charge alors). */
    degrouper() {
      const objets = etat.noeudsSelectionnes().filter((n) => typeDeNoeud(n.type).reglagesDuModele);
      if (objets.length === 0) return false;
      try {
        const document = etat.document();
        const commandes = [];
        const nouvelles = [];
        for (const objet of objets) {
          const { esquisses, pieces } = piecesDetachees(objet);
          const parent = trouverParent(document, objet.id);
          const rang = indexDansParent(document, objet.id);
          commandes.push(commandeSupprimerNoeud.creer(document, objet.id));
          for (const esquisse of esquisses) commandes.push(commandeAjouterNoeud.creer(document.racine.id, esquisse));
          pieces.forEach((piece, i) => commandes.push(commandeAjouterNoeud.creer(parent.id, piece, rang + i)));
          nouvelles.push(...pieces.map((p) => p.id));
        }
        etat.executer(commandeLot.creer(commandes, "Dégrouper"));
        etat.selectionner(nouvelles, "remplacer");
        annoncer(nouvelles.length + " pièces séparées : elles se placent maintenant une à une (elles ne suivent plus le modèle).");
      } catch (erreur) {
        annoncer(erreur.message, true);
      }
      return true;
    },

    /* Revenir aux valeurs du modèle. */
    reinitialiser(idNoeud) {
      const noeud = trouverNoeud(etat.document(), idNoeud);
      if (noeud === null || Object.keys(noeud.parametres.reglages ?? {}).length === 0) return;
      etat.executer(commandeModifierParametre.creer(idNoeud, "reglages", noeud.parametres.reglages, {}));
    },

    // ── Créer, modifier un modèle ────────────────────────────────────────

    nouveauModele() {
      if (!ecriturePermise) {
        annoncer("Créer un objet de la bibliothèque est réservé à l'administrateur du site (connexion sur la page d'administration).", true);
        return;
      }
      if (ouvrirSession(creerDocument({ nom: NOM_D_UN_NOUVEAU_MODELE }), null, "")) {
        annoncer("Scène vide de l'objet paramétrique : ses variables deviendront ses paramètres. Enregistrer dans la bibliothèque une fois l'objet entièrement contraint.");
      }
    },

    modifierModele(idModele) {
      const modele = modeleDe(idModele);
      if (modele === null) return;
      if (!ecriturePermise) {
        annoncer("Modifier un objet de la bibliothèque est réservé à l'administrateur du site.", true);
        return;
      }
      if (ouvrirSession(modele.document, modele.id, modele.description)) {
        annoncer("Modification de « " + modele.nom + " » : les projets qui l'utilisent suivront à l'enregistrement.");
      }
    },

    decrire(texte) {
      if (session !== null) session.description = texte.trim();
    },

    /* Rend la liste des problèmes (vide si l'objet est enregistré). */
    async enregistrerModele() {
      if (session === null) return [];
      const document = etat.document();
      const problemes = problemesDuModele(document, session.id);
      if (problemes.length > 0) {
        annoncer("Objet non enregistré : " + problemes[0] + (problemes.length > 1 ? " (et " + (problemes.length - 1) + " autre(s) point(s))" : ""), true);
        return problemes;
      }
      const modification = session.id !== null;
      const id = session.id ?? identifiantLibre(document.nom);
      try {
        const reponse = await stockage.enregistrer(id, document.nom, session.description, documentVersBrut(document));
        const modele = { id, nom: document.nom, description: session.description, modifie_le: reponse.modifie_le ?? "", document };
        connaitre([...modeles.filter((m) => m.id !== id), modele]);
        fermerSession();
        annoncer("« " + document.nom + " » enregistré dans la bibliothèque" + (modification ? " : les objets qui en sont tirés sont à jour." : "."));
        return [];
      } catch (erreur) {
        annoncer("Enregistrement dans la bibliothèque impossible : " + erreur.message, true);
        return [erreur.message];
      }
    },

    /* Retirer de la bibliothèque le modèle en cours d'édition. Les objets déjà
       posés le signalent comme absent ; son fichier reste sur le disque. */
    async retirerModele() {
      if (session === null || session.id === null) return;
      const { id } = session;
      const nom = modeleDe(id)?.nom ?? id;
      try {
        await stockage.supprimer(id);
        connaitre(modeles.filter((m) => m.id !== id));
        fermerSession();
        annoncer("« " + nom + " » retiré de la bibliothèque.");
      } catch (erreur) {
        annoncer("Retrait impossible : " + erreur.message, true);
      }
    },

    abandonnerModele() {
      if (session === null) return;
      fermerSession();
      annoncer("Édition de l'objet abandonnée : le projet est revenu tel qu'il était.");
    },

    /* Les boutons propres à un objet posé, sous ses paramètres. */
    actionsDe(noeud) {
      if (!typeDeNoeud(noeud.type).reglagesDuModele) return [];
      const modele = modeleDe(noeud.parametres.modele);
      const liste = [{
        icone: "annuler", texte: "Valeurs du modèle", actif: Object.keys(noeud.parametres.reglages ?? {}).length > 0,
        titre: "Remet tous les paramètres à leur valeur par défaut.",
        action: () => this.reinitialiser(noeud.id),
      }];
      if (ecriturePermise && modele !== null) {
        liste.push({
          icone: "esquisse", texte: "Modifier le modèle", actif: session === null,
          titre: "Ouvre le modèle dans sa propre scène. À l'enregistrement, tous les objets qui en sont tirés suivent, dans tous les projets.",
          action: () => this.modifierModele(modele.id),
        });
      }
      return liste;
    },
  };
}
