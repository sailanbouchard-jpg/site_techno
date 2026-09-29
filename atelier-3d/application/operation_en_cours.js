/*
 * application/operation_en_cours.js
 * ─────────────────────────────────
 * Le déroulement commun à toutes les opérations qui demandent des choix :
 *   1. l'opération se prépare (par exemple : l'objet entre dans une symétrie) ;
 *   2. la fenêtre s'ouvre, chaque réglage met le résultat à jour en direct ;
 *   3. Valider garde tout en une seule annulation, Annuler défait tout, et le
 *      projet revient exactement à son état d'avant.
 *
 * Pendant ce temps, les outils et les panneaux sont en retrait : l'élève sait
 * qu'il a quelque chose à terminer.
 *
 * Une opération : {
 *   titre, icone, libelle, consigne?(valeurs), champs, texteValider?, sansValider?,
 *   preparer() → valeurs de départ (ou null pour renoncer),
 *   changer(cle, valeur, valeurs) → valeurs (le document est modifié ici),
 *   aides(valeurs) → [aide] à dessiner dans la vue,
 *   peutValider(valeurs), geste(genre, evenement, valeurs) → true si l'appui est pris,
 *   apresValidation(valeurs), apresAnnulation(valeurs),
 *   idDuNoeud?() → l'objet que l'opération règle
 * }
 *
 * Avec idDuNoeud, les champs nombre acceptent les variables : une formule tapée
 * (« pile_rayon * 2 ») est posée sur le paramètre de même nom de l'objet à la
 * validation, et le suit ensuite quand la variable change.
 */

import { trouverNoeud } from "../noyau/document.js";
import { valeurDeFormule, valeursDesVariables } from "../noyau/variables.js";

const PREFIXE_PARAMETRE = "parametre.";

export function creerOperationEnCours({ etat, scene, fenetre, choix, annoncer, poserFormule }) {
  let enCours = null;     // { operation, profondeur, valeurs, selectionAvant, formules }

  // L'objet dont un paramètre porte le nom du champ, ou null.
  function noeudDuChamp(operation, cle) {
    const id = operation.idDuNoeud?.() ?? null;
    const noeud = id === null ? null : trouverNoeud(etat.document(), id);
    return noeud !== null && cle in noeud.parametres ? noeud : null;
  }

  // Les formules que l'objet porte déjà : on reprend une opération validée.
  function formulesDeDepart(operation) {
    const formules = {};
    for (const champ of operation.champs) {
      const noeud = champ.genre === "nombre" ? noeudDuChamp(operation, champ.cle) : null;
      const formule = noeud?.formules[PREFIXE_PARAMETRE + champ.cle];
      if (formule !== undefined) formules[champ.cle] = formule;
    }
    return formules;
  }

  /* À la validation, chaque formule va sur son paramètre — sauf si le réglage
     a changé depuis (un autre choix a recalculé la valeur) : la formule ne
     dirait plus ce que montre l'objet. */
  function poserLesFormules(operation, formules) {
    const valeursVariables = valeursDesVariables(etat.document().variables);
    for (const [cle, formule] of Object.entries(formules)) {
      const noeud = noeudDuChamp(operation, cle);
      if (noeud === null || noeud.formules[PREFIXE_PARAMETRE + cle] === formule) continue;
      let valeur;
      try {
        valeur = valeurDeFormule(formule, valeursVariables);
      } catch {
        continue;
      }
      if (Math.abs(valeur - noeud.parametres[cle]) > 1e-6) continue;
      poserFormule(noeud.id, PREFIXE_PARAMETRE + cle, formule);
    }
  }

  function afficher() {
    const { operation, valeurs, formules } = enCours;
    const peutValider = operation.peutValider?.(valeurs) ?? true;
    fenetre.definir(valeurs, operation.consigne?.(valeurs) ?? null, peutValider, formules);
    scene.montrerAidesOperation(operation.aides?.(valeurs) ?? []);
  }

  function terminer() {
    choix.arreter();
    fenetre.fermer();
    scene.montrerAidesOperation([]);
    enCours = null;
    etat.definirOperation(false);
  }

  const controleur = {
    enCours: () => enCours !== null,

    demarrer(operation) {
      if (enCours !== null) controleur.annuler();
      const profondeur = etat.profondeur();
      const selectionAvant = [...etat.selection()];
      let valeurs;
      try {
        valeurs = operation.preparer();
      } catch (erreur) {
        annoncer(erreur.message, true);
        valeurs = null;
      }
      if (valeurs === null) {
        etat.revenirA(profondeur);
        return;
      }
      enCours = { operation, profondeur, valeurs, selectionAvant, formules: formulesDeDepart(operation) };
      etat.definirOperation(true);
      fenetre.ouvrir({
        titre: operation.titre,
        icone: operation.icone,
        champs: operation.champs,
        valeurs,
        formules: enCours.formules,
        avecFormules: operation.idDuNoeud !== undefined,
        texteValider: operation.texteValider,
        sansValider: operation.sansValider,
        surChanger: (cle, valeur, formule) => controleur.changer(cle, valeur, formule),
        surValider: () => controleur.valider(),
        surAnnuler: () => controleur.annuler(),
      });
      afficher();
    },

    /* formule : celle tapée dans le champ, null pour un nombre, undefined
       pendant un réglage aux flèches (la formule d'avant ne change pas). */
    changer(cle, valeur, formule) {
      if (enCours === null) return;
      const { operation } = enCours;
      if (formule !== undefined) {
        const formules = { ...enCours.formules };
        if (formule && noeudDuChamp(operation, cle) !== null) formules[cle] = formule;
        else delete formules[cle];
        enCours.formules = formules;
      }
      let valeurs = null;
      try {
        valeurs = operation.changer(cle, valeur, enCours.valeurs);
      } catch (erreur) {
        annoncer(erreur.message, true);
      }
      // L'opération a pu se terminer d'elle-même (un choix qui suffit).
      if (enCours === null) return;
      if (valeurs !== null) enCours.valeurs = valeurs;
      afficher();
    },

    /* Une opération qui a elle-même fait un choix (un clic dans la vue) remet la fenêtre à jour. */
    rafraichir(valeurs) {
      if (enCours === null) return;
      if (valeurs !== undefined) enCours.valeurs = valeurs;
      afficher();
    },

    valider() {
      if (enCours === null) return;
      const { operation, profondeur, valeurs } = enCours;
      if (!(operation.peutValider?.(valeurs) ?? true)) return;
      poserLesFormules(operation, enCours.formules);
      terminer();
      etat.regrouperDepuis(profondeur, operation.libelle);
      operation.apresValidation?.(valeurs);
    },

    annuler() {
      if (enCours === null) return;
      const { operation, profondeur, valeurs, selectionAvant } = enCours;
      terminer();
      etat.revenirA(profondeur);
      // Annuler rend aussi la sélection d'avant : l'élève peut réessayer tout de suite.
      etat.selectionner(selectionAvant, "remplacer");
      operation.apresAnnulation?.(valeurs);
    },

    /* Pendant une opération, seuls Entrée, Échap, Ctrl+Z et la caméra comptent. */
    touche(evenement) {
      if (enCours === null) return false;
      const ctrl = evenement.ctrlKey || evenement.metaKey;
      if (evenement.key === "Enter") controleur.valider();
      else if (evenement.key === "Escape" || (ctrl && evenement.key.toLowerCase() === "z")) controleur.annuler();
      else if (evenement.key.toLowerCase() === "f" || evenement.code === "Space") return false;
      return true;
    },

    /* Les gestes dans la vue : d'abord un choix en attente, puis l'opération
       elle-même. Un appui gauche que personne ne prend fait glisser la vue.
       Les outils ne reçoivent rien pendant une opération. */
    geste(genre, evenement) {
      if (enCours === null) return false;
      const pris = choix.enCours()
        ? choix.geste(genre, evenement)
        : enCours.operation.geste?.(genre, evenement, enCours.valeurs) === true;
      if (genre === "appui" && evenement.button === 0 && !pris) scene.controleur.translaterDepuis(evenement);
      return true;
    },

    valeurs: () => enCours?.valeurs ?? null,
  };
  return controleur;
}
