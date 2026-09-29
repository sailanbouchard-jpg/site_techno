/*
 * application/affichage_du_document.js
 * ────────────────────────────────────
 * Fait le lien entre le document et la vue : quels objets montrer, avec quel
 * maillage, lesquels attendent un calcul. Le recalcul est paresseux — on ne
 * demande que ce qui manque à l'affichage — et plusieurs changements dans la
 * même tâche ne coûtent qu'une mise à jour.
 */

import { creerDocument } from "../noyau/document.js";
import { empreinteDeNoeud } from "../noyau/empreinte_de_noeud.js";
import { objetsAffichables } from "../noyau/objets_affichables.js";
import { fichiersDuSousArbre } from "../noyau/registre_types_de_noeuds.js";
import { documentVersBrut } from "../noyau/serialisation_document.js";
import { pretPourLeCalcul } from "../noyau/bibliotheque_d_objets.js";

// Au-delà, un calcul mérite une barre de progression.
const CALCUL_LONG_MS = 300;

function serialiser(noeud) {
  return documentVersBrut(creerDocument({ racine: noeud })).racine;
}

/*
 * La couleur et la finition de chaque pièce d'un groupe : pour chacune, la
 * première choisie en descendant du groupe vers la pièce. Un groupe sans
 * couleur montre donc celles de ses pièces ; lui en donner une les recouvre
 * toutes (de même pour la finition). Les faces creusées par un trou prennent
 * l'aspect de la première pièce pleine.
 */
function apparencesDesParties(noeud, parties) {
  const lues = parties.map((chemin) => {
    let courant = noeud;
    let { couleur, finition } = noeud;
    let trou = chemin === null;
    for (const rang of chemin ?? []) {
      courant = courant.enfants?.[rang];
      if (courant === undefined) break;
      couleur = couleur ?? courant.couleur;
      finition = finition ?? courant.finition;
      trou = trou || courant.trou;
    }
    return { couleur, finition, trou };
  });
  const pleine = lues.find((l) => !l.trou) ?? { couleur: noeud.couleur, finition: noeud.finition };
  return lues.map((l) => (l.trou ? { couleur: pleine.couleur, finition: pleine.finition } : { couleur: l.couleur, finition: l.finition }));
}

/*
 * dependances : { etat, scene, cache, fichiers, moteurPret(), annoncer(texte, erreur),
 *                 surCalculs(enCours, long), surMiseAJour(),
 *                 plateau : l'onglet Impression (application/espace_impression.js) }
 */
export function creerAffichageDuDocument(dependances) {
  const { etat, scene, cache, fichiers } = dependances;
  const enPreparation = new Map();   // empreinte → instant de la demande
  const echecs = new Map();          // empreinte → message, pour ne pas redemander en boucle
  let demande = false;
  let surveillance = null;

  function surveillerLesCalculs() {
    const maintenant = performance.now();
    const long = [...enPreparation.values()].some((debut) => maintenant - debut > CALCUL_LONG_MS);
    dependances.surCalculs(enPreparation.size, long);
    if (enPreparation.size === 0) {
      clearInterval(surveillance);
      surveillance = null;
    } else if (surveillance === null) {
      surveillance = setInterval(surveillerLesCalculs, 100);
    }
  }

  function demanderMaillage(noeud, empreinte) {
    if (!dependances.moteurPret() || enPreparation.has(empreinte) || echecs.has(empreinte)) return;
    enPreparation.set(empreinte, performance.now());
    surveillerLesCalculs();

    fichiers.garantir(fichiersDuSousArbre(noeud))
      .then(() => cache.obtenirMaillage(noeud, serialiser(noeud)))
      .catch((erreur) => {
        echecs.set(empreinte, erreur.message);
        dependances.annoncer(erreur.message, true);
      })
      .finally(() => {
        enPreparation.delete(empreinte);
        surveillerLesCalculs();
        rafraichir();
      });
  }

  /* Les objets à l'écran, tels que le calcul les reçoit : chaque solide
     d'esquisse avec sa propre esquisse en enfant, chaque objet paramétrique
     avec les pièces de son modèle. */
  const objetsACalculer = () => {
    const document = etat.document();
    return objetsAffichables(document).map((noeud) => pretPourLeCalcul(document, noeud));
  };

  /* Dans l'onglet Impression : les pièces du plateau, placées sur la machine. */
  function objetsDuPlateau() {
    const obtenir = (noeud) => {
      const maillage = cache.maillageConnu(noeud);
      if (maillage === null) demanderMaillage(noeud, empreinteDeNoeud(noeud));
      return maillage;
    };
    return dependances.plateau.objetsAAfficher(obtenir).map(({ id, noeud, maillage, transformation, apparence }) => ({
      id,
      maillage,
      empreinteDuMaillage: empreinteDeNoeud(noeud),
      transformation,
      couleur: apparence.couleur,
      finition: apparence.finition,
      apparencesDesParties: (parties) => apparencesDesParties(apparence, parties),
      trou: false,
      enAttente: maillage === null,
    }));
  }

  function mettreAJour() {
    demande = false;
    if (dependances.plateau.enImpression()) {
      scene.synchroniser(objetsDuPlateau(), dependances.plateau.selection());
      dependances.surMiseAJour();
      return;
    }
    const liste = objetsACalculer().map((noeud) => {
      const empreinte = empreinteDeNoeud(noeud);
      const maillage = cache.maillageConnu(noeud);
      if (maillage === null) demanderMaillage(noeud, empreinte);
      return {
        id: noeud.id,
        maillage,
        empreinteDuMaillage: empreinte,
        transformation: noeud.transformation,
        couleur: noeud.couleur,
        finition: noeud.finition,
        apparencesDesParties: (parties) => apparencesDesParties(noeud, parties),
        trou: noeud.trou,
        enAttente: maillage === null && !echecs.has(empreinte),
      };
    });
    scene.synchroniser(liste, etat.selection());
    dependances.surMiseAJour();
  }

  function rafraichir() {
    if (demande) return;
    demande = true;
    queueMicrotask(mettreAJour);
  }

  return {
    rafraichir,

    /* Une nouvelle tentative : le fichier a été réimporté, l'élève s'est reconnecté. */
    oublierLesEchecs() {
      echecs.clear();
      rafraichir();
    },

    maillageDe: (noeud) => cache.maillageConnu(pretPourLeCalcul(etat.document(), noeud)),

    /* Le maillage d'un nœud qui n'est pas forcément dans le document (une
       vérification : la partie commune de deux pièces). Rend une promesse. */
    calculer(noeud) {
      const pret = pretPourLeCalcul(etat.document(), noeud);
      return fichiers.garantir(fichiersDuSousArbre(pret)).then(() => cache.obtenirMaillage(pret, serialiser(pret)));
    },

    /* Les objets dont la forme n'a pas pu être calculée : identifiant → ce qui
       ne va pas. L'arbre et l'inspecteur le montrent, sinon l'objet disparaît
       de la vue sans explication. */
    erreursParObjet() {
      const document = etat.document();
      const resultat = new Map();
      for (const noeud of objetsAffichables(document)) {
        const message = echecs.get(empreinteDeNoeud(pretPourLeCalcul(document, noeud)));
        if (message !== undefined) resultat.set(noeud.id, message);
      }
      return resultat;
    },

    /* Ce que la barre d'état doit dire du projet. L'étanchéité ne regarde que
       ce qui partira à l'impression : un trou seul n'est pas exporté. */
    bilan() {
      const objets = objetsACalculer();
      const imprimes = objets.filter((noeud) => !noeud.trou);
      const maillages = imprimes.map((noeud) => cache.maillageConnu(noeud));
      const connus = maillages.filter((m) => m !== null);
      return {
        objets: objets.length,
        etanche: connus.length === 0 ? null : connus.every((m) => m.etanche),
        complet: connus.length === maillages.length,
      };
    },
  };
}
