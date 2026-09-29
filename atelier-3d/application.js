/*
 * application.js
 * ──────────────
 * Le câblage, et lui seul : il crée la vue, l'ouvrier, le stockage et les
 * panneaux, et les relie à l'état. Les règles vivent dans les commandes, les
 * actions dans application/, l'affichage dans vue/ et interface/.
 */

import { creerDocument, trouverNoeud } from "./noyau/document.js";
import { objetsAffichables } from "./noyau/objets_affichables.js";
import { documentVersBrut } from "./noyau/serialisation_document.js";
import {
  typeDeNoeud, formesCreables, estDegroupable, solidesDEsquisse, solidesMultiEsquisses, repetitions, estRepetition, consommeUnProfil,
} from "./noyau/registre_types_de_noeuds.js";
import { demarrerOuvrier } from "./geometrie/client_ouvrier.js";
import { creerActionsFinitions } from "./application/actions_finitions.js";
import { creerCacheDeMaillages } from "./geometrie/cache_de_maillages.js";
import { creerScene } from "./vue/scene_trois_d.js";
import { FAMILLES, listeDesOutils } from "./outils/registre_outils.js";
import { eleveConnecte } from "./stockage/requetes.js";
import { creerStockageDeProjets } from "./stockage/stockage_projets.js";
import { creerStockageDeFichiers } from "./stockage/stockage_fichiers.js";
import { creerEnregistrementAutomatique } from "./stockage/enregistrement_automatique.js";
import { creerEtatApplication } from "./application/etat_application.js";
import { creerAffichageDuDocument } from "./application/affichage_du_document.js";
import { creerFichiersImportes } from "./application/fichiers_importes.js";
import { creerActionsEdition } from "./application/actions_edition.js";
import { creerActionsProjet } from "./application/actions_projet.js";
import { creerActionsEsquisse } from "./application/actions_esquisse.js";
import { creerActionsRepetition } from "./application/actions_repetition.js";
import { creerActionsTexte } from "./application/actions_texte.js";
import { creerChoixDansLaVue } from "./application/choix_dans_la_vue.js";
import { creerOperationEnCours } from "./application/operation_en_cours.js";
import { brancherLesOutils } from "./application/contexte_des_outils.js";
import { activerRaccourcis } from "./application/raccourcis_clavier.js";
import { couleursDeLaVue, nuancierDesObjets } from "./interface/couleurs_de_la_vue.js";
import { creerBarreHaute } from "./interface/barre_haute.js";
import { creerMenuProjets } from "./interface/menu_projets.js";
import { creerRuban } from "./interface/ruban.js";
import { brancherLesBullesDAide } from "./interface/bulle_d_aide.js";
import { creerFenetreOperation } from "./interface/fenetre_operation.js";
import { creerBulleDeMesure } from "./interface/bulle_de_mesure.js";
import { creerBarreContextuelle } from "./interface/barre_contextuelle.js";
import { creerCubeDeVue } from "./vue/cube_de_vue.js";
import { creerEtiquettesContraintes } from "./interface/etiquettes_contraintes.js";
import { creerEtiquetteDeVue } from "./interface/etiquette_de_vue.js";
import { creerCartoucheEsquisse } from "./interface/cartouche_esquisse.js";
import { creerBandeauOutil } from "./interface/bandeau_outil.js";
import { creerPanneauInspecteur } from "./interface/panneau_inspecteur.js";
import { creerPanneauArbre } from "./interface/panneau_arbre_de_construction.js";
import { creerBarreEtat } from "./interface/barre_etat.js";
import {
  creerBoutonsDeVue, activerDepotSurLaVue, activerPoigneesDeColonnes, afficherPanneDeLaVue,
} from "./interface/commandes_de_vue.js";
import { telecharger } from "./interface/telechargement.js";
import { creerPanneauImprimantes } from "./interface/panneau_imprimantes.js";
import { creerEnvoiImpression } from "./application/envoi_impression.js";
import { brancherLaNavbarDuSite } from "./interface/navbar_du_site.js";
import { creerListeDesCoupes } from "./interface/liste_des_coupes.js";
import { creerFicheRaccourcis } from "./interface/fiche_raccourcis.js";
import { creerActionsCoupes } from "./application/actions_coupes.js";
import { creerActionsVariables } from "./application/actions_variables.js";
import { creerPanneauVariables } from "./interface/panneau_variables.js";
import { creerFenetreFlottante } from "./interface/fenetre_flottante.js";
import { signalerPresDuCurseur } from "./interface/signal_pres_du_curseur.js";

/* « Dupliqué », ou « 3 objets dupliqués », à côté de la souris. */
function signalerCopies(nombre, seul, pluriel) {
  if (nombre === 1) signalerPresDuCurseur(seul);
  else if (nombre > 1) signalerPresDuCurseur(nombre + " objets " + pluriel);
}
import { connaitreLesVariables } from "./interface/saisie_de_formules.js";
import { creerStockageBibliotheque } from "./stockage/stockage_bibliotheque.js";
import { creerActionsBibliotheque } from "./application/actions_bibliotheque.js";
import { creerMenuBibliotheque } from "./interface/menu_bibliotheque.js";
import { creerBandeauModele } from "./interface/bandeau_modele.js";
import { creerEspaceImpression, ESPACES } from "./application/espace_impression.js";
import { objetsImprimables } from "./noyau/plateau.js";
import { listeDesPrereglages } from "./noyau/reglages_impression.js";
import { creerRubanImpression } from "./interface/ruban_impression.js";
import { creerPanneauPlateau } from "./interface/panneau_plateau.js";
import { creerInspecteurPlateau } from "./interface/inspecteur_plateau.js";
import { creerTranchageEnDirect } from "./application/tranchage_en_direct.js";
import { creerApercuCouches } from "./interface/apercu_couches.js";
import { creerPanneauDiagnostic } from "./interface/panneau_diagnostic.js";
import { diagnostiquer } from "./tranchage/diagnostic_impression.js";
import { creerPanneauReglagesImpression } from "./interface/panneau_reglages_impression.js";
import { TYPES_DE_LIGNE } from "./tranchage/protocole_tranchage.js";
import { creerCalibration } from "./application/calibration_en_cours.js";
import { creerPanneauCalibration } from "./interface/panneau_calibration.js";
import { creerRubanCalibration } from "./interface/ruban_calibration.js";

const element = (id) => document.getElementById(id);

async function demarrer() {
  // La navbar prend sa place avant la vue 3D : celle-ci se dimensionne sur ce qui reste.
  brancherLaNavbarDuSite(element("bascule-navbar"));
  brancherLesBullesDAide();
  const canvas = element("vue-3d");
  const barreEtat = creerBarreEtat(element("barre-etat"));
  const annoncer = (texte, erreur = false) => barreEtat.annoncer(texte, erreur);

  let scene;
  try {
    scene = creerScene({ canvas, couleurs: couleursDeLaVue() });
  } catch (erreur) {
    afficherPanneDeLaVue(element("vue"), "Ce poste n'arrive pas à afficher la 3D (" + erreur.message + "). Essayer un autre navigateur, " +
      "ou prévenir le professeur : la carte graphique ou son pilote est peut-être désactivé.");
    return;
  }
  scene.surPerteDuContexte(() => annoncer("L'affichage 3D s'est interrompu. Recharger la page : le travail est enregistré.", true));

  const etat = creerEtatApplication(creerDocument());
  const eleve = await eleveConnecte();
  const stockageProjets = creerStockageDeProjets(eleve);
  const ouvrier = demarrerOuvrier();
  const cache = creerCacheDeMaillages(ouvrier);
  const fichiers = creerFichiersImportes(ouvrier, creerStockageDeFichiers(eleve));
  let moteurPret = false;
  let cadrerDesQuePret = false;
  let rafraichirPanneaux = () => {};

  const cadrer = () => {
    if (plateau.enImpression()) scene.cadrerLePlateau();
    else scene.controleur.cadrer(scene.boiteDeLaScene());
  };

  // L'onglet Impression : le plateau et ses pièces. Ce dont il a besoin plus
  // bas (noms, panneaux, esquisse ouverte) n'est appelé qu'à l'usage.
  const plateau = creerEspaceImpression({
    etat, scene, annoncer, telecharger,
    nommer: (noeud) => edition.nommer(noeud),
    maillageConnu: (noeud) => cache.maillageConnu(noeud),
    rafraichir: () => {
      affichage.rafraichir();
      rafraichirPanneaux();
    },
    mesurer: (texte) => barreEtat.mesurer(texte),
    refusDEntrer: () => {
      if (bibliotheque.enSession()) return "Enregistrer ou abandonner d'abord l'objet paramétrique en cours d'édition.";
      if (etat.esquisseOuverte() !== null) return "Valider d'abord l'esquisse en cours.";
      if (etat.operationEnCours()) return "Valider ou annuler d'abord l'opération en cours.";
      return null;
    },
    surChangementDEspace: (nom) => changerDEspace(nom),
    surApercu: (actif) => {
      scene.cacherLesPieces(actif);
      apercuCouches.montrer(actif);
    },
    changerDeCouche: (pas) => apercuCouches.deplacerHaut(pas),
    avancerDansLaCouche: (pas) => apercuCouches.deplacerParcours(pas),
  });

  const affichage = creerAffichageDuDocument({
    etat, scene, cache, fichiers, annoncer, plateau,
    moteurPret: () => moteurPret,
    surCalculs: (enCours, long) => barreEtat.calculs(enCours, long),
    surMiseAJour: () => {
      if (cadrerDesQuePret && affichage.bilan().complet) {
        cadrerDesQuePret = false;
        cadrer();
      }
      montrerLesNouvelles();
      // Les aides d'une opération (la flèche de hauteur) suivent la forme recalculée.
      operationsEnCours.rafraichir();
      rafraichirPanneaux();
    },
  });
  // Les pièces qui viennent de naître : dès que leur forme est calculée, la vue s'assure qu'on les voit.
  const aMontrer = new Set();
  const garderEnVue = (id) => aMontrer.add(id);
  function montrerLesNouvelles() {
    for (const id of aMontrer) {
      const boite = scene.boiteMonde(id);
      if (boite === null) continue;
      aMontrer.delete(id);
      scene.garderEnVue(boite);
    }
  }

  const choix = creerChoixDansLaVue(annoncer);
  const fenetre = creerFenetreOperation(element("atelier"));
  // variables est créé plus bas : la formule n'est posée qu'à la validation, bien après.
  const operationsEnCours = creerOperationEnCours({
    etat, scene, fenetre, choix, annoncer,
    poserFormule: (id, cle, formule) => variables.poserFormule(id, cle, formule),
  });
  const edition = creerActionsEdition({ etat, scene, affichage, annoncer, operations: operationsEnCours, garderEnVue });
  const variables = creerActionsVariables({
    etat, annoncer,
    // La taille d'un groupe dépend de son maillage : seule l'application la connaît.
    dimensions: {
      lire: (noeud, axe) => edition.dimensionsDe(noeud)?.[axe] ?? null,
      ecrire: (noeud, axe, valeur) => edition.transformationPourDimension(noeud, axe, valeur, false),
    },
  });
  const etiquettes = creerEtiquettesContraintes(element("vue"), {
    editer: (id) => esquisses.editerContrainte(id),
    supprimer: (id) => esquisses.retirerContrainte(id),
    deplacer: (id, evenement, phase) => esquisses.deplacerEtiquette(id, evenement, phase),
    survoler: (id) => esquisses.survolerContrainte(id),
  });
  const esquisses = creerActionsEsquisse({
    etat, scene, annoncer, nommer: edition.nommer, choix, operations: operationsEnCours, garderEnVue, etiquettes,
  });
  const repetition = creerActionsRepetition({ etat, scene, annoncer, edition, operations: operationsEnCours, choix, garderEnVue });
  const finitions = creerActionsFinitions({ etat, scene, annoncer, edition, operations: operationsEnCours, affichage });
  const textes = creerActionsTexte({ etat, scene, annoncer, choix, operations: operationsEnCours, garderEnVue });
  const bibliotheque = creerActionsBibliotheque({
    etat, annoncer, garderEnVue,
    stockage: creerStockageBibliotheque(),
    rafraichir: () => {
      affichage.rafraichir();
      rafraichirPanneaux();
    },
    placeLibre: (largeur, profondeur) => edition.placeLibre(largeur, profondeur),
    fermerEsquisse: () => esquisses.fermer(),
  });
  const menuBibliotheque = creerMenuBibliotheque({
    modeles: () => bibliotheque.modeles(),
    ecriturePermise: () => bibliotheque.ecriturePermise(),
    enSession: () => bibliotheque.enSession(),
    poser: (id) => bibliotheque.poser(id),
    modifier: (id) => bibliotheque.modifierModele(id),
    nouveau: () => bibliotheque.nouveauModele(),
  });
  const bandeauModele = creerBandeauModele(element("vue"), {
    enregistrer: () => bibliotheque.enregistrerModele(),
    abandonner: () => bibliotheque.abandonnerModele(),
    retirer: () => bibliotheque.retirerModele(),
    decrire: (texte) => bibliotheque.decrire(texte),
  });
  /* Pendant l'édition d'un objet paramétrique, le projet est mis de côté : on n'en ouvre pas un autre. */
  const horsEditionDeModele = (action) => (...args) => {
    if (bibliotheque.enSession()) {
      annoncer("Enregistrer ou abandonner d'abord l'objet paramétrique en cours d'édition.", true);
      return undefined;
    }
    return action(...args);
  };

  /* Double-clic (vue ou arbre) : on rouvre ce qui a fait l'objet. */
  function reprendre(id) {
    const noeud = trouverNoeud(etat.document(), id);
    if (noeud === null) return;
    if (estRepetition(noeud.type)) repetition.modifier(id);
    else if (consommeUnProfil(noeud.type)) esquisses.modifierSolide(id);
    else if (typeDeNoeud(noeud.type).collable) textes.coller(id);
    else esquisses.ouvrir(id);
  }

  const barreHaute = creerBarreHaute(element("barre-haute"), {
    renommer: (nom) => projet.renommer(nom),
    annuler: () => annulerOuExpliquer(),
    refaire: () => etat.refaire(),
    importer: (liste) => projet.importer(liste),
    exporter: () => (plateau.enImpression() ? plateau.actions.exporter() : projet.exporter()),
    ouvrirMenuProjets: (ancre) => menuProjets.ouvrir(ancre),
    changerEspace: (nom) => plateau.changer(nom),
    ouvrirLesRaccourcis: () => fiche.basculer(),
  });

  const enregistrement = creerEnregistrementAutomatique(stockageProjets, {
    // Pendant l'édition d'un objet paramétrique, c'est toujours le projet qu'on range.
    lireDocument: () => bibliotheque.documentDuProjet(),
    versBrut: documentVersBrut,
    vignette: () => scene.capturerVignette(),
    surEtat: (etatEnregistrement, message) => {
      barreHaute.afficherEnregistrement(etatEnregistrement, message, !stockageProjets.surLeSite);
      if (etatEnregistrement === "erreur") annoncer("Enregistrement impossible : " + message, true);
    },
    surIdentifiant: (id) => projet.noterProjet(id),
  });

  const projet = creerActionsProjet({
    etat, scene, affichage, fichiers, enregistrement, annoncer, telecharger,
    stockage: stockageProjets,
    placeLibre: (largeur, profondeur) => edition.placeLibre(largeur, profondeur),
    cadrerQuandPret: () => { cadrerDesQuePret = true; },
  });

  const menuProjets = creerMenuProjets({
    surLeSite: stockageProjets.surLeSite,
    lister: () => projet.listerProjets(),
    ouvrir: horsEditionDeModele(async (id) => { if (await projet.ouvrir(id)) cadrerDesQuePret = true; }),
    nouveau: horsEditionDeModele(() => projet.nouveau()),
    supprimer: horsEditionDeModele((id) => projet.supprimer(id)),
    projetCourant: () => enregistrement.projetCourant(),
  });

  function annulerOuExpliquer() {
    if (!etat.annuler()) annoncer("L'annulation s'arrête à l'ouverture de l'esquisse. Valider l'esquisse pour annuler au-delà.", true);
  }

  // ── Opérations du ruban, de la barre contextuelle et des raccourcis ─────
  const operations = {
    grouper: () => edition.grouper(),
    croiser: () => edition.grouper("commun"),
    degrouper: () => {
      if (!bibliotheque.degrouper()) edition.degrouper();
    },
    trou: () => edition.basculerTrou(),
    // La copie se superpose à l'original : rien ne bouge dans la vue, un mot le dit.
    dupliquer: () => signalerCopies(edition.dupliquer(), "Dupliqué", "dupliqués"),
    supprimer: () => edition.supprimer(),
    figer: () => repetition.figer(),
    aligner: () => edition.aligner(),
    copier: () => edition.copier(),
    coller: () => signalerCopies(edition.coller(), "Collé", "collés"),
    tourner: (axe, degres) => edition.tourner(axe, degres),
  };

  const ruban = creerRuban(element("ruban"), formesCreables(), {
    solides: solidesDEsquisse(),
    solidesMulti: solidesMultiEsquisses(),
    repetitions: repetitions(),
  }, {
    ajouter: (nomDuType) => edition.ajouterForme(nomDuType),
    operation: (nom) => operations[nom](),
    nouvelleEsquisse: () => esquisses.choisirPlan(),
    consommer: (nomDuType) => esquisses.consommer(nomDuType),
    consommerPlusieurs: (nomDuType) => esquisses.consommerPlusieurs(nomDuType),
    repeter: (nomDuType) => repetition.creer(nomDuType),
    aligner: () => edition.aligner(),
    ouvrirBibliotheque: (ancre) => menuBibliotheque.basculer(ancre),
    finition: (nom) => ({ extrusion_face: () => esquisses.extruderUneFace(), aretes: finitions.aretes, decoupe: finitions.couper, analyse: finitions.analyser })[nom](),
  });

  const familles = Object.fromEntries(Object.entries(FAMILLES)
    .map(([nom, famille]) => [nom, { etiquette: famille.etiquette, outils: listeDesOutils(nom) }]));
  const bandeau = creerBandeauOutil(element("bandeau-outil"), familles, {
    choisir: (nom) => etat.choisirOutil(nom),
    regler: (cle, valeur) => etat.regler(cle, valeur),
  });
  const cartouche = creerCartoucheEsquisse(element("vue"), () => esquisses.fermer());
  const panneauVariables = creerPanneauVariables(element("bandeau-outil"), {
    ajouter: (nom) => variables.ajouter(nom),
    renommer: (id, nom) => variables.renommer(id, nom),
    changerValeur: (id, valeur, formule) => variables.changerValeur(id, valeur, formule),
    supprimer: (id) => variables.supprimer(id),
    borner: (id, bornes) => variables.borner(id, bornes),
    decrire: (id, description) => variables.decrire(id, description),
  });

  const apercu = (id, transformation) => { if (transformation !== null) scene.apercu(id, transformation); };
  const inspecteur = creerPanneauInspecteur(element("inspecteur"), {
    nuancier: nuancierDesObjets(),
    typeDe: (noeud) => typeDeNoeud(noeud.type),
    nommer: edition.nommer,
    dimensionsDe: (noeud) => edition.dimensionsDe(noeud),
    cotesDe: (noeud) => edition.cotesDe(noeud),
    formuleDe: (noeud, cle) => variables.formuleDe(noeud, cle),
    erreurDe: (noeud) => affichage.erreursParObjet().get(noeud.id) ?? null,
    parametresDe: (noeud) => bibliotheque.parametresDe(noeud),
    signatureDe: (noeud) => bibliotheque.signatureDe(noeud),
    actionsDe: (noeud) => [
      ...esquisses.actionsDe(noeud), ...repetition.actionsDe(noeud), ...finitions.actionsDe(noeud), ...textes.actionsDe(noeud), ...bibliotheque.actionsDe(noeud),
      ...actionsDImpression(noeud),
    ],
    actions: {
      propriete: (id, cle, valeur) => edition.modifierPropriete(id, cle, valeur),
      proprietes: (cle, valeur) => edition.modifierProprieteSelection(cle, valeur),
      transformation: (id, champ, axe, valeur, formule) => variables.valider(id, champ + "." + axe, formule,
        () => edition.modifierTransformation(id, champ, { [axe]: valeur })),
      apercuTransformation: (id, champ, valeurs) => {
        const t = trouverNoeud(etat.document(), id)?.transformation;
        if (t) apercu(id, { ...t, [champ]: { ...t[champ], ...valeurs } });
      },
      dimension: (id, axe, valeur, verrouille, formule) => variables.valider(id, "dimension." + axe, formule,
        () => edition.modifierDimension(id, axe, valeur, verrouille)),
      apercuDimension: (id, axe, valeur, verrouille) => {
        const noeud = trouverNoeud(etat.document(), id);
        if (noeud) apercu(id, edition.transformationPourDimension(noeud, axe, valeur, verrouille));
      },
      cote: (id, cle, valeur, formule) => variables.valider(id, "cote." + cle, formule, () => edition.modifierCote(id, cle, valeur)),
      apercuCote: (id, cle, valeur) => {
        const noeud = trouverNoeud(etat.document(), id);
        if (noeud) apercu(id, edition.apercuCote(noeud, cle, valeur));
      },
      finApercu: () => scene.finirApercus(),
      parametre: (id, cle, valeur, formule) => variables.valider(id, "parametre." + cle, formule, () => edition.modifierParametre(id, cle, valeur)),
      // Un réglage refusé (borne du modèle) : le champ reprend la valeur du
      // document — une fois qu'il a perdu le focus, sinon il garderait la sienne.
      // Rend la raison d'un refus : le champ la montre sous lui.
      reglage: (id, idVariable, valeur, formule) => {
        let refus = null;
        variables.valider(id, "reglage." + idVariable, formule, () => {
          const retour = bibliotheque.regler(id, idVariable, valeur);
          if (retour === true) return true;
          refus = retour;
          return false;
        });
        setTimeout(() => rafraichirPanneaux());
        return refus;
      },
      basculerTrou: () => edition.basculerTrou(),
      operation: (nom) => operations[nom](),
    },
  });

  // Par défaut à droite, à gauche du cube d'orientation qu'elle ne doit pas cacher.
  const fenetreInspecteur = creerFenetreFlottante(element("colonne-droite"), element("vue"), "atelier-3d:inspecteur", { droite: 132, haut: 8 });

  const arbre = creerPanneauArbre(element("arbre"), {
    typeDe: (noeud) => typeDeNoeud(noeud.type),
    nommer: edition.nommer,
    esquisses: { etat: (noeud) => esquisses.etatDe(noeud), liens: (id) => esquisses.liens(id) },
    actions: {
      selectionner: (id, facon) => etat.selectionner([id], facon),
      ouvrir: reprendre,
      visibilite: (id, visible) => edition.modifierPropriete(id, "visible", visible),
      deplacerEsquisse: (id, sens) => esquisses.deplacerDansLOrdre(id, sens),
      survoler: (id) => montrerLesLiens(id),
    },
  });

  // Les liens de l'objet montré (survolé dans la liste, sinon sélectionné) :
  // ils s'allument dans la liste et dans la vue.
  let survoleDansLaListe = null;
  function montrerLesLiens(idSurvole = survoleDansLaListe) {
    survoleDansLaListe = idSurvole;
    const seuls = [...etat.selection()];
    const id = idSurvole ?? (seuls.length === 1 ? seuls[0] : null);
    const { sources, utilisateurs } = id === null ? { sources: [], utilisateurs: [] } : esquisses.liens(id);
    arbre.montrerLiens({ sources: new Set(sources), utilisateurs: new Set(utilisateurs) });
    scene.marquerLiens(new Set(utilisateurs), new Set(sources));
  }

  const placerSurVue = (nom) => {
    if (!scene.placerSurVue(nom)) annoncer("En esquisse, la vue reste face au plan : passer l'interrupteur à 3D (près du cube) pour la faire tourner.", true);
  };
  const boutonsDeVue = creerBoutonsDeVue(element("boutons-de-vue"), {
    placer: placerSurVue,
    cadrer,
    vueEn3D: (actif) => {
      esquisses.basculerVue3D(actif);
      rafraichirPanneaux();
    },
  });
  creerCubeDeVue(element("cube-de-vue"), couleursDeLaVue(), scene.controleur, placerSurVue);
  const coupes = creerActionsCoupes({ etat, scene, operations: operationsEnCours, rafraichir: () => rafraichirPanneaux() });
  const listeDesCoupes = creerListeDesCoupes(element("vues-en-coupe"), coupes);
  const bulle = creerBulleDeMesure(element("vue"), canvas);
  // Plusieurs pièces choisies : Grouper vient en premier, nommé en toutes lettres,
  // loin de Dupliquer avec qui on le confondait.
  const barreContextuelle = creerBarreContextuelle(element("vue"), [
    {
      nom: "grouper", icone: "grouper", texte: "Grouper",
      aide: { nom: "Grouper", raccourci: "Ctrl+G", texte: "Réunit les pièces sélectionnées en une seule. Les pièces en trou creusent les autres." },
      action: () => operations.grouper(),
    },
    { nom: "aligner", icone: "aligner", aide: { nom: "Aligner", texte: "Aligne les pièces sur la première choisie." }, action: () => operations.aligner() },
    {
      nom: "dupliquer", icone: "dupliquer",
      aide: { nom: "Dupliquer", raccourci: "Ctrl+D", texte: "Copie la sélection, superposée à l'original et prête à être déplacée." },
      action: () => operations.dupliquer(),
    },
    { nom: "trou", icone: "trou", aide: { nom: "Trou ou plein", raccourci: "T", texte: "Un trou creuse les pièces avec lesquelles il est groupé." }, action: () => operations.trou() },
    { nom: "supprimer", icone: "supprimer", aide: { nom: "Supprimer", raccourci: "Suppr", texte: "Supprime la sélection." }, action: () => operations.supprimer() },
  ]);
  // Pendant un geste dans la vue, la barre s'efface ; elle revient au relâcher.
  // Écouté à la capture : la caméra arrête le relâcher des gestes qu'elle prend.
  canvas.addEventListener("pointerdown", () => barreContextuelle.pause(true), true);
  globalThis.addEventListener("pointerup", () => {
    barreContextuelle.pause(false);
    placerLaBarre();
  }, true);
  activerDepotSurLaVue(element("vue"), element("depot-fichier"), {
    importer: (liste) => projet.importer(liste),
    deposerForme: (nomDuType, x, y) => edition.ajouterForme(nomDuType, scene.pointAuSol(x, y)),
  });
  activerPoigneesDeColonnes(document, () => scene.redimensionner());
  new ResizeObserver(() => scene.redimensionner()).observe(canvas);

  // ── L'outil actif reçoit les gestes de la vue ───────────────────────────
  const outils = brancherLesOutils({
    canvas, etat, scene, edition, esquisses, choix, annoncer, plateau,
    operations: operationsEnCours,
    ouvrir: reprendre,
    etiquette: creerEtiquetteDeVue(element("vue")),
    mesurer: (texte) => {
      barreEtat.mesurer(texte);
      bulle.afficher(texte);
    },
  });
  const fiche = creerFicheRaccourcis(element("atelier"), Object.entries(FAMILLES)
    .map(([nom, famille]) => ({ etiquette: famille.etiquette, outils: listeDesOutils(nom) })));
  const raccourcisOutils = (famille) => new Map(listeDesOutils(famille).map((o) => [o.raccourci.toLowerCase(), o.nom]));
  const raccourcisParFamille = Object.fromEntries(Object.keys(FAMILLES).map((nom) => [nom, raccourcisOutils(nom)]));
  activerRaccourcis({
    annuler: () => annulerOuExpliquer(),
    refaire: () => etat.refaire(),
    enregistrer: () => enregistrement.enregistrerMaintenant(),
    selectionnerTout: () => edition.selectionnerTout(),
    deselectionner: () => etat.selectionner([], "remplacer"),
    cadrer,
    deplacer: (dx, dy, dz) => edition.deplacer(dx, dy, dz),
    choisirOutil: (touche) => {
      const nom = raccourcisParFamille[etat.famille()].get(touche);
      if (nom !== undefined) etat.choisirOutil(nom);
    },
    toucheOutil: (ev) => plateau.touche(ev) || operationsEnCours.touche(ev) || choix.touche(ev) || outils.outilActif().surTouche(ev, outils.contexte),
    enEsquisse: () => etat.famille() === "esquisse",
    revenirALaSelection: () => etat.choisirOutil(FAMILLES.esquisse.parDefaut),
    nouvelleEsquisse: () => esquisses.choisirPlan(),
    ...operations,
    basculerTrou: operations.trou,
  });

  /* La barre d'actions flotte au-dessus de la sélection et de son gizmo : hors
     esquisse et hors opération. Posée sur la flèche Z, elle empêchait de la saisir. */
  function placerLaBarre() {
    if (plateau.enImpression()) {
      barreContextuelle.placer(null);
      return;
    }
    const affichee = edition.selectionAffichee();
    const boite = affichee.length > 0 ? scene.boiteDes(affichee) : null;
    if (boite === null || etat.famille() !== "deplacement" || etat.operationEnCours()) {
      barreContextuelle.placer(null);
      return;
    }
    const coins = [];
    for (const x of [boite.min[0], boite.max[0]]) {
      for (const y of [boite.min[1], boite.max[1]]) {
        for (const z of [boite.min[2], boite.max[2]]) coins.push(scene.versEcran([x, y, z]));
      }
    }

    const gizmo = scene.empriseDuGizmo().map((point) => scene.versEcran(point));
    barreContextuelle.placer(coins, { aligner: affichee.length >= 2, grouper: affichee.length >= 2 }, gizmo);
  }
  scene.controleur.surChangement(placerLaBarre);

  // ── Onglet Impression ───────────────────────────────────────────────────
  const rubanImpression = creerRubanImpression(element("ruban-impression"), () => listeDesPrereglages("imprimante"), {
    machine: (id) => plateau.actions.changerMachine(id),
    toutMettre: () => plateau.actions.toutMettreSurLePlateau(),
    disposer: () => plateau.actions.disposer(),
    poserAPlat: () => plateau.actions.basculerPoserAPlat(),
    tourner: (degres) => plateau.actions.tourner(degres),
    orienter: () => plateau.actions.orienterCommeLAssemblage(),
    dupliquer: () => plateau.actions.dupliquer(),
    retirer: () => plateau.actions.retirer(),
    exporter: () => plateau.actions.exporter(),
    exporterGcode: () => envoi.exporter(),
    apercu: () => plateau.actions.basculerApercu(),
    imprimantes: () => basculerImprimantes(),
    calibration: () => plateau.changer(ESPACES.calibration),
  });
  const listePlateau = creerPanneauPlateau(element("liste-plateau"), {
    selectionner: (id, facon) => plateau.actions.selectionner([id], facon),
    ajouter: (id) => plateau.actions.mettreSurLePlateau([id]),
    retirer: (id) => plateau.actions.retirer([id]),
  });
  const inspecteurPlateau = creerInspecteurPlateau(element("inspecteur-plateau"), {
    placer: (id, axe, valeur) => plateau.actions.placer(id, axe, valeur),
    apercu: (id, modifications) => plateau.actions.apercu(id, modifications),
    finApercu: () => scene.finirApercus(),
    angle: (valeur) => plateau.actions.definirAngle(valeur),
    tourner: (degres) => plateau.actions.tourner(degres),
    poserAPlat: () => plateau.actions.basculerPoserAPlat(),
    orienter: () => plateau.actions.orienterCommeLAssemblage(),
    eclater: (id) => plateau.actions.eclater(id),
    rassembler: (id) => plateau.actions.rassembler(id),
    dupliquer: () => plateau.actions.dupliquer(),
    retirer: () => plateau.actions.retirer(),
  });
  // Les réglages du tranchage, sous la liste des pièces du plateau.
  const zoneReglages = document.createElement("div");
  zoneReglages.className = "reglages-impression";
  // ── Diagnostic d'impression ──
  const zoneDiagnostic = document.createElement("section");
  zoneDiagnostic.className = "inspecteur bloc-diagnostic";
  element("liste-plateau").append(zoneDiagnostic, zoneReglages);
  const panneauDiagnostic = creerPanneauDiagnostic(zoneDiagnostic, {
    montrer: (types) => apercuCouches.isolerLesTypes(types),
    analyser: () => {
      if (!plateau.apercuActif()) plateau.actions.basculerApercu();
    },
  });
  const panneauReglages = creerPanneauReglagesImpression(zoneReglages, {
    regler: (cle, valeur) => plateau.actions.regler(cle, valeur),
    retablir: (cle) => plateau.actions.retablir(cle),
    changerPrereglage: (source, id, garder) => plateau.actions.changerPrereglage(source, id, garder),
  });

  // ── Aperçu du tranchage ──
  const apercuCouches = creerApercuCouches(element("vue"), [
    { type: TYPES_DE_LIGNE.paroiExterieure, etiquette: "Paroi extérieure", aide: "La ligne visible de la pièce." },
    { type: TYPES_DE_LIGNE.paroisInterieures, etiquette: "Parois intérieures", aide: "Les lignes entre la paroi extérieure et l'intérieur de la pièce." },
    { type: TYPES_DE_LIGNE.dessus, etiquette: "Surface du dessus", aide: "La dernière couche sous l'air libre : celle qu'on voit." },
    { type: TYPES_DE_LIGNE.dessous, etiquette: "Surface du dessous", aide: "La couche posée sur le plateau, et le dessous des surplombs." },
    { type: TYPES_DE_LIGNE.pleinInterieur, etiquette: "Plein intérieur", aide: "Les couches pleines cachées sous le dessus et sur le dessous." },
    { type: TYPES_DE_LIGNE.remplissage, etiquette: "Remplissage", aide: "L'intérieur de la pièce, à la densité et au motif choisis." },
    { type: TYPES_DE_LIGNE.jupe, etiquette: "Jupe", aide: "Le tour de toutes les pièces sur la première couche, qui amorce la buse." },
    { type: TYPES_DE_LIGNE.bordure, etiquette: "Bordure", aide: "La collerette au pied des pièces, contre le décollement." },
    { type: TYPES_DE_LIGNE.paroiEnSurplomb, etiquette: "Paroi en surplomb", aide: "Une paroi qui dépasse de la couche d'en dessous : elle est imprimée plus lentement." },
    { type: TYPES_DE_LIGNE.pont, etiquette: "Pont", aide: "Des lignes tendues au-dessus du vide, d'un appui à l'autre." },
    { type: TYPES_DE_LIGNE.interstices, etiquette: "Interstices", aide: "Les espaces trop étroits pour une paroi entière, comblés de lignes fines." },
    { type: TYPES_DE_LIGNE.repassage, etiquette: "Repassage", aide: "La buse repasse à vide sur la surface du dessus pour la lisser, en déposant à peine de matière." },
    { type: TYPES_DE_LIGNE.pontInterieur, etiquette: "Pont intérieur", aide: "Une couche pleine tendue au-dessus du remplissage clairsemé : c'est ce qui ferme le dessus des trous et des cavités." },
  ], {
    montrerCouches: (bas, haut) => scene.montrerLesCouches(bas, haut),
    typesVisibles: (types) => scene.typesDeLigneVisibles(types),
    colorer: (mode) => scene.colorerTranchage(mode),
    segments: (couche) => scene.segmentsDeLaCouche(couche),
    avancer: (rang) => scene.avancerDansLaCouche(rang),
    coutures: (visibles) => scene.montrerLesCoutures(visibles),
  });
  apercuCouches.montrer(false);
  let dernierTranchage = null;
  /* Le dessin des lignes n'est refait que si un résultat a changé. */
  function afficherTranchage() {
    const etatDuTranchage = plateau.enCalibration() && calibration.actif() ? calibration.etat() : tranchage.etat();
    const signature = [etatDuTranchage.couches.hauteurs.length, ...etatDuTranchage.pieces];
    const change = dernierTranchage === null || signature.length !== dernierTranchage.length
      || signature.some((element, i) => element !== dernierTranchage[i]);
    if (change) {
      dernierTranchage = signature;
      const machine = plateau.machine();
      scene.montrerTranchage(etatDuTranchage, [machine.largeur / 2, machine.profondeur / 2]);
      apercuCouches.recolorer();
    }
    apercuCouches.mettreAJour(etatDuTranchage, plateau.machine());
    panneauDiagnostic.mettreAJour(
      etatDuTranchage.restantes > 0 ? [] : diagnostiquer(etatDuTranchage, (rang) => nomDeLaPiece(etatDuTranchage, rang)),
      etatDuTranchage.restantes > 0,
    );
  }

  /* Le nom de la pièce d'un rang du tranchage, pour les phrases du diagnostic. */
  function nomDeLaPiece(etatDuTranchage, rang) {
    const pieces = (etatDuTranchage.pieces ?? []).filter((piece) => !piece.jupe);
    const noeud = pieces[rang] === undefined ? null : trouverNoeud(etat.document(), pieces[rang].idNoeud ?? "");
    return noeud === null ? "" : edition.nommer(noeud);
  }
  const tranchage = creerTranchageEnDirect({
    annoncer,
    surResultat: () => afficherTranchage(),
    surAvancement: () => apercuCouches.mettreAJour(tranchage.etat(), plateau.machine()),
  });

  // ── Imprimantes du réseau local ──
  const envoi = creerEnvoiImpression({
    tranchage, plateau, annoncer, telecharger, nomDuProjet: () => etat.document().nom,
    essaiEnCours: () => calibration.source(),
  });
  const panneauImprimantes = creerPanneauImprimantes(element("panneau-imprimantes"), {
    lister: envoi.lister, enregistrer: envoi.enregistrer, retirer: envoi.retirer, commande: envoi.commande,
    imprimer: envoi.imprimer, estAdministrateur: envoi.estAdministrateur, annoncer,
    fermer: () => basculerImprimantes(false),
  });
  const fenetreImprimantes = creerFenetreFlottante(element("colonne-imprimantes"), element("vue"), "atelier-3d:imprimantes", { droite: 8, haut: 8 });
  function basculerImprimantes(ouvrir = !panneauImprimantes.estOuvert()) {
    if (ouvrir) panneauImprimantes.ouvrir();
    else panneauImprimantes.fermer();
    fenetreImprimantes.montrer(ouvrir);
    rafraichirImpression();
  }

  // ── Calibration ──
  // L'essai en cours remplace le plateau dans l'aperçu et dans ce qu'on envoie à
  // l'imprimante ; le projet retrouve son plateau dès que l'essai est arrêté.
  const calibration = creerCalibration({
    plateau, annoncer,
    surChangement: () => {
      panneauCalibration.rafraichir();
      rafraichirPanneaux();
    },
  });
  const panneauCalibration = creerPanneauCalibration(element("panneau-calibration"), {
    combinaisons: () => calibration.liste(),
    active: () => calibration.active(),
    choisir: (id) => calibration.choisir(id),
    ajouter: (champs) => calibration.ajouter(champs),
    renommer: (id, nom) => calibration.renommer(id, nom),
    dupliquer: (id) => calibration.dupliquer(id),
    retirer: (id) => calibration.retirer(id),
    changerPrereglage: (source, id) => calibration.changerPrereglage(source, id),
    exporter: () => calibration.exporter(),
    editionDesChoix: () => calibration.editionDesChoix(),
    basculerEditionDesChoix: (ouvert) => calibration.basculerEditionDesChoix(ouvert),
    avancement: () => calibration.avancement(),
    comparaison: (source) => calibration.comparaison(source),
    reglagesDeLaCombinaison: () => calibration.reglagesDeLaCombinaison(),
    reglagesDeLOutil: (id) => calibration.reglagesDeLOutil(id),
    lancer: async (id, parametres) => {
      await calibration.lancer(id, parametres);
      if (!plateau.apercuActif()) plateau.actions.basculerApercu();
      annoncer("Éprouvette posée sur le plateau.");
    },
    arreter: () => calibration.arreter(),
    exporterFichier: () => envoi.exporter(),
    conclure: (id, parametres, saisie) => calibration.conclure(id, parametres, saisie),
    retenir: (id, conclusion) => calibration.retenir(id, conclusion),
    oublier: (id) => calibration.oublier(id),
    essaiCourant: () => calibration.outil()?.id ?? null,
    annoncer,
  });

  // Les réglages de la combinaison, à gauche : la même interface que celle du
  // plateau, mais ce qu'un essai décide et ce que la combinaison fixe n'y sont
  // pas éditables — les modifier à la main viderait la calibration de son sens.
  const reglagesCalibration = creerPanneauReglagesImpression(element("reglages-calibration"), {
    regler: (cle, valeur) => calibration.regler(cle, valeur),
    retablir: (cle) => calibration.regler(cle, undefined),
    changerPrereglage: (source, id) => calibration.changerPrereglage(source, id),
  }, { verrouillage: (r) => calibration.verrouillage(r), sansPrereglages: true });

  const rubanCalibration = creerRubanCalibration(element("ruban-calibration"), {
    apercu: () => plateau.actions.basculerApercu(),
    imprimantes: () => basculerImprimantes(),
    arreter: () => calibration.arreter(),
    exporterFichier: () => envoi.exporter(),
    exporter: () => calibration.exporter(),
  });

  const fenetrePlateau = creerFenetreFlottante(element("colonne-plateau"), element("vue"), "atelier-3d:inspecteur-plateau", { droite: 132, haut: 8 });

  /* « Mettre sur le plateau », dans l'inspecteur de la conception. */
  function actionsDImpression(noeud) {
    if (!objetsImprimables(etat.document()).some((n) => n.id === noeud.id)) return [];
    const place = plateau.impression().pieces.some((p) => p.source === noeud.id);
    return [{
      icone: "plateau",
      texte: place ? "Sur le plateau" : "Mettre sur le plateau",
      titre: place
        ? "Cette pièce est déjà sur le plateau : la retrouver dans l'onglet Impression."
        : "Ajoute la pièce au plateau d'impression, à une place libre. Sa place dans l'assemblage ne change pas.",
      actif: !place,
      action: () => {
        if (plateau.actions.mettreSurLePlateau([noeud.id]).length > 0) {
          annoncer("« " + edition.nommer(noeud) + " » est sur le plateau : onglet Impression pour la placer.");
        }
      },
    }];
  }

  /* Passer d'un onglet à l'autre : les panneaux de l'un laissent la place à ceux de l'autre. */
  function changerDEspace(nom) {
    const enImpression = nom === ESPACES.impression;
    const enCalibration = nom === ESPACES.calibration;
    const surLePlateau = enImpression || enCalibration;
    document.body.classList.toggle("espace-impression", surLePlateau);
    document.body.classList.toggle("espace-calibration", enCalibration);
    element("ruban").hidden = surLePlateau;
    element("ruban-impression").hidden = !enImpression;
    element("ruban-calibration").hidden = !enCalibration;
    element("arbre").hidden = surLePlateau;
    element("liste-plateau").hidden = !enImpression;
    element("reglages-calibration").hidden = !enCalibration;
    element("colonne-calibration").hidden = !enCalibration;
    element("vues-en-coupe").hidden = surLePlateau;
    if (enCalibration) panneauCalibration.rafraichir();
    else calibration.arreter();
    // Le plateau montre les pièces entières : pas de vue en coupe.
    if (surLePlateau) scene.definirCoupe(null);
    else if (panneauImprimantes.estOuvert()) basculerImprimantes(false);
    else coupes.synchroniser();
    affichage.rafraichir();
    rafraichirPanneaux();
  }

  function rafraichirCalibration() {
    barreHaute.mettreAJour({ nomDuProjet: etat.document().nom, peutAnnuler: etat.peutAnnuler(), peutRefaire: etat.peutRefaire(), espace: plateau.espace() });
    reglagesCalibration.mettreAJour(calibration.impressionCourante());
    const essai = calibration.outil();
    rubanCalibration.mettreAJour({
      essai: essai === null ? null : essai.nom,
      combinaison: calibration.active(),
      apercu: plateau.apercuActif(),
      imprimantes: panneauImprimantes.estOuvert(),
    });
    if (plateau.apercuActif() && calibration.actif()) afficherTranchage();
    fenetrePlateau.montrer(false);
    fenetreInspecteur.montrer(false);
    const avancement = calibration.avancement();
    barreEtat.mettreAJour({
      nombreSelectionnes: 0,
      dimensions: null,
      objets: avancement === null ? 0 : avancement.faits,
      nomDesObjets: ["essai à jour", "essais à jour"],
      etanche: true,
      complet: true,
      horsSite: !stockageProjets.surLeSite,
      sousLeSol: false,
      avertissement: calibration.active() === null ? "Aucune combinaison : en créer une pour commencer." : null,
    });
    scene.suivreAvecLeGizmo(null, null);
    placerLaBarre();
  }

  function rafraichirImpression() {
    const resume = plateau.resume();
    const selection = plateau.selection();
    const choisies = resume.pieces.filter((p) => selection.has(p.id));
    barreHaute.mettreAJour({ nomDuProjet: etat.document().nom, peutAnnuler: etat.peutAnnuler(), peutRefaire: etat.peutRefaire(), espace: plateau.espace() });
    panneauReglages.mettreAJour(plateau.impression());
    if (plateau.apercuActif()) {
      tranchage.mettreAJour(plateau.piecesATrancher(), plateau.impression());
      afficherTranchage();
    } else {
      panneauDiagnostic.mettreAJour([], false, resume.pieces.length === 0 ? "vide" : "sansApercu");
    }
    rubanImpression.mettreAJour({
      imprimante: plateau.impression().imprimante,
      machine: resume.machine,
      poserAPlat: plateau.poserAPlatActif(),
      apercu: plateau.apercuActif(),
      imprimantes: panneauImprimantes.estOuvert(),
      calibration: false,
      disponibles: {
        toutMettre: resume.horsPlateau.length > 0,
        disposer: resume.pieces.length > 0,
        poserAPlat: resume.pieces.length > 0,
        tourner: choisies.length > 0,
        orienter: choisies.length > 0,
        dupliquer: choisies.length > 0,
        retirer: choisies.length > 0,
        exporter: resume.pieces.length > 0,
        exporterGcode: resume.pieces.length > 0,
        apercu: resume.pieces.length > 0 || plateau.apercuActif() || calibration.actif(),
      },
    });
    listePlateau.mettreAJour(resume, selection);
    inspecteurPlateau.mettreAJour(choisies);
    // Dans l'aperçu, on regarde : pas de pièce à régler, le résultat prend la place.
    fenetrePlateau.montrer(choisies.length > 0 && !plateau.apercuActif());
    fenetreInspecteur.montrer(false);
    const boites = choisies.map((p) => p.boite).filter((b) => b !== null);
    const dimensions = boites.length === 0 ? null : {
      x: Math.max(...boites.map((b) => b.max[0])) - Math.min(...boites.map((b) => b.min[0])),
      y: Math.max(...boites.map((b) => b.max[1])) - Math.min(...boites.map((b) => b.min[1])),
      z: Math.max(...boites.map((b) => b.max[2])),
    };
    const bilan = affichage.bilan();
    barreEtat.mettreAJour({
      nombreSelectionnes: choisies.length,
      dimensions,
      objets: resume.pieces.length,
      nomDesObjets: ["pièce sur le plateau", "pièces sur le plateau"],
      etanche: bilan.etanche,
      complet: bilan.complet,
      horsSite: !stockageProjets.surLeSite,
      sousLeSol: false,
      avertissement: resume.fautives === 0 ? null
        : resume.fautives + (resume.fautives > 1 ? " pièces à revoir" : " pièce à revoir") + " : hors du plateau ou chevauchement",
    });
    scene.suivreAvecLeGizmo(null, null);
    canvas.dataset.curseur = plateau.poserAPlatActif() ? "crosshair" : "";
    placerLaBarre();
  }

  // ── Chaque changement d'état remet la vue et les panneaux d'accord ──────
  rafraichirPanneaux = () => {
    if (plateau.enCalibration()) {
      rafraichirCalibration();
      return;
    }
    if (plateau.enImpression()) {
      rafraichirImpression();
      return;
    }
    // Avant les panneaux : leurs champs réécrivent les formules avec ces noms.
    connaitreLesVariables(etat.document().variables);
    panneauVariables.mettreAJour(etat.document().variables, variables.valeurs(), variables.usages());
    const noeuds = etat.noeudsSelectionnes();
    const affichee = edition.selectionAffichee();
    const outil = outils.outilActif();
    const bilan = affichage.bilan();
    const boite = affichee.length > 0 ? scene.boiteDes(affichee) : null;
    // Une pièce qui passe sous le sol sera coupée par le trancheur : on le dit.
    const imprimes = objetsAffichables(etat.document()).filter((n) => !n.trou).map((n) => n.id);
    const dessous = scene.boiteDes(imprimes);

    barreHaute.mettreAJour({ nomDuProjet: etat.document().nom, peutAnnuler: etat.peutAnnuler(), peutRefaire: etat.peutRefaire(), espace: plateau.espace() });
    const enOperation = etat.operationEnCours();
    document.body.classList.toggle("operation-en-cours", enOperation);
    const enEsquisse = etat.famille() === "esquisse";
    ruban.mettreAJour({
      grouper: affichee.length >= 2,
      croiser: affichee.length >= 2,
      degrouper: noeuds.some((n) => estDegroupable(n.type)),
      trou: noeuds.length > 0,
      dupliquer: noeuds.length > 0,
      supprimer: noeuds.length > 0,
      aligner: affichee.length >= 2,
      esquisse: !enEsquisse,
      ...esquisses.disponibilites(),
      ...repetition.disponibilites(),
      ...finitions.disponibilites(),
    }, !enOperation);
    bandeau.mettreAJour(etat.famille(), outil, etat.reglages());
    const esquisseOuverte = etat.esquisseOuverte() === null ? null : trouverNoeud(etat.document(), etat.esquisseOuverte());
    cartouche.afficher(esquisseOuverte === null ? null : edition.nommer(esquisseOuverte), esquisses.libertes());
    bandeauModele.afficher(bibliotheque.session(), etat.document().nom, enEsquisse);
    boutonsDeVue.autoriserLesVues(etat.famille() !== "esquisse" || esquisses.vueEn3D());
    boutonsDeVue.montrerInterrupteur(etat.famille() === "esquisse", esquisses.vueEn3D());
    listeDesCoupes.mettreAJour(etat.document().coupes ?? [], coupes.active(), !enOperation);
    inspecteur.mettreAJour(noeuds);
    // Rien de sélectionné : pas de panneau vide, la vue garde toute sa place.
    fenetreInspecteur.montrer(noeuds.length > 0);
    arbre.mettreAJour(etat.document(), etat.selection(), affichage.erreursParObjet());
    montrerLesLiens();
    barreEtat.mettreAJour({
      nombreSelectionnes: noeuds.length,
      dimensions: boite !== null
        ? { x: boite.max[0] - boite.min[0], y: boite.max[1] - boite.min[1], z: boite.max[2] - boite.min[2] }
        : (noeuds.length === 1 ? edition.dimensionsDe(noeuds[0]) : null),
      objets: bilan.objets,
      etanche: bilan.etanche,
      complet: bilan.complet,
      horsSite: !stockageProjets.surLeSite,
      sousLeSol: dessous !== null && dessous.min[2] < -0.05,
    });

    fenetrePlateau.montrer(false);
    const gizmo = affichee.length === 1 && outil.modeGizmo !== null && !enOperation;
    scene.suivreAvecLeGizmo(gizmo ? affichee[0] : null, outil.modeGizmo);
    outils.suivreLOutil();
    placerLaBarre();
  };

  etat.abonner((changements) => {
    if (changements.document) {
      affichage.rafraichir();
      enregistrement.signalerChangement();
      if (!plateau.enImpression()) coupes.synchroniser();
    }
    if (changements.selection) affichage.rafraichir();
    if (changements.document || changements.selection || changements.esquisse) esquisses.synchroniser();
    rafraichirPanneaux();
  });

  // ── Démarrage ──────────────────────────────────────────────────────────
  scene.redimensionner();
  rafraichirPanneaux();
  enregistrement.suivreProjet(null, etat.document());

  // Connecté : on reprend le projet demandé, ou le dernier. Sans connexion, le
  // poste est peut-être partagé : on part d'un projet neuf.
  const demande = projet.projetDansLAdresse();
  const recents = demande === null && stockageProjets.surLeSite ? await projet.listerProjets().catch(() => []) : [];
  const aOuvrir = demande ?? recents[0]?.id ?? null;
  if (aOuvrir !== null && await projet.ouvrir(aOuvrir)) cadrerDesQuePret = true;
  if (!stockageProjets.surLeSite) annoncer("Session non connectée : le travail reste enregistré dans ce navigateur uniquement.");
  bibliotheque.charger();

  ouvrier.pret
    .then(() => {
      moteurPret = true;
      affichage.rafraichir();
    })
    .catch((erreur) => annoncer("Le moteur de géométrie n'a pas démarré : " + erreur.message, true));
}

demarrer();
