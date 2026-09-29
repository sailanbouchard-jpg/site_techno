/*
 * application/etat_application.js
 * ───────────────────────────────
 * L'état de l'atelier : le document et sa pile d'annulation, la sélection, le
 * mode actif et ses réglages. C'est le seul état qui existe ; la vue et les
 * panneaux le lisent et sont prévenus quand il change.
 *
 * Le flux est unique :
 *   geste → commande → nouveau document → notification → vue + panneaux
 */

import {
  creerEtat, executer, annuler, refaire, peutAnnuler, peutRefaire, regrouper, revenirA,
} from "../noyau/pile_annulation.js";
import { trouverNoeud, parcourir } from "../noyau/document.js";
import { identifiantsCrees, identifiantsRestaures, commandeLot } from "../noyau/commandes/registre_commandes.js";
import { commandeModifierProprietes } from "../noyau/commandes/commande_modifier_proprietes.js";
import { formulesDevenuesCaduques } from "../noyau/variables.js";
import { commandesDePropagation } from "../noyau/esquisse/references_esquisse.js";
import { FAMILLES, familleDe, outilParNom, reglagesParDefaut, reglagesDe, avecReglage } from "../outils/registre_outils.js";

export function creerEtatApplication(documentInitial) {
  let edition = creerEtat(documentInitial);
  let selection = new Set();
  let principal = null;
  // Un outil retenu par famille : fermer une esquisse rend le mode de déplacement d'avant.
  const outils = Object.fromEntries(Object.entries(FAMILLES).map(([nom, famille]) => [nom, famille.parDefaut]));
  let esquisseOuverte = null;
  // Dans une esquisse, on n'annule pas plus loin que son ouverture.
  let profondeurDeLEsquisse = 0;
  let operationEnCours = false;
  let reglages = reglagesParDefaut();
  const abonnes = [];

  function prevenir(changements) {
    for (const abonne of abonnes) abonne(changements);
  }

  /* Après un changement du document, la sélection ne garde que ce qui existe
     encore : un objet supprimé, ou dégroupé, ne peut pas rester sélectionné. */
  function nettoyerSelection() {
    const existants = new Set([...parcourir(edition.document.racine)].map((e) => e.noeud.id));
    selection = new Set([...selection].filter((id) => existants.has(id)));
    if (!selection.has(principal)) principal = selection.size > 0 ? [...selection].at(-1) : null;
    // Une esquisse ouverte qu'on vient de supprimer (ou d'annuler) se referme.
    if (esquisseOuverte !== null && !existants.has(esquisseOuverte)) esquisseOuverte = null;
  }

  function changerDocument(nouvelleEdition, aSelectionner = null) {
    edition = nouvelleEdition;
    if (aSelectionner !== null && aSelectionner.length > 0) {
      selection = new Set(aSelectionner);
      principal = aSelectionner.at(-1);
    }
    nettoyerSelection();
    prevenir({ document: true, selection: true });
  }

  const etat = {
    document: () => edition.document,
    peutAnnuler: () => peutAnnuler(edition),
    peutRefaire: () => peutRefaire(edition),
    selection: () => selection,
    principal: () => principal,
    famille: () => (esquisseOuverte === null ? "deplacement" : "esquisse"),
    outil() {
      return outils[etat.famille()];
    },
    reglages() {
      return reglagesDe(reglages, etat.outil());
    },
    esquisseOuverte: () => esquisseOuverte,

    ouvrirEsquisse(id) {
      esquisseOuverte = id;
      profondeurDeLEsquisse = edition.passe.length;
      // Une esquisse s'ouvre toujours sur la sélection : aucun clic ne trace par surprise.
      outils.esquisse = FAMILLES.esquisse.parDefaut;
      selection = new Set([id]);
      principal = id;
      prevenir({ esquisse: true, selection: true, outil: true });
    },

    fermerEsquisse() {
      if (esquisseOuverte === null) return;
      esquisseOuverte = null;
      prevenir({ esquisse: true, outil: true });
    },

    noeudsSelectionnes() {
      return [...selection].map((id) => trouverNoeud(edition.document, id)).filter((n) => n !== null);
    },

    /* Toute modification passe par ici. Une commande impossible lève une
       erreur, que l'appelant affiche : le document, lui, n'a pas bougé. */
    executer(commande) {
      let suivante = executer(edition, commande);
      let lot = [commande];
      // Un champ piloté par une variable, qu'on déplace ou retape à la main,
      // n'est plus piloté : sa formule part avec le même geste, donc la même annulation.
      if (commande.type !== "modifier_variables") {
        const caduques = formulesDevenuesCaduques(edition.document, suivante.document);
        if (caduques.length > 0) {
          lot = [...lot, ...caduques.map((r) => commandeModifierProprietes.creer(r.id, { formules: r.avant }, { formules: r.apres }))];
          suivante = executer(edition, commandeLot.creer(lot, commande.libelle ?? ""));
        }
      }
      // Les esquisses qui visent des points de référence suivent, dans le même geste.
      const suivre = commandesDePropagation(suivante.document);
      if (suivre.length > 0) suivante = executer(edition, commandeLot.creer([...lot, ...suivre], commande.libelle ?? ""));
      changerDocument(suivante, identifiantsCrees(commande));
    },

    /* Annuler resélectionne ce qui revient : annuler « Grouper » rend les
       membres sélectionnés, prêts à être regroupés autrement. Rend false si
       l'annulation est refusée (au-delà de l'ouverture de l'esquisse). */
    annuler() {
      if (!peutAnnuler(edition)) return true;
      if (esquisseOuverte !== null && edition.passe.length <= profondeurDeLEsquisse) return false;
      const derniere = edition.passe[edition.passe.length - 1].commande;
      changerDocument(annuler(edition), identifiantsRestaures(derniere));
      return true;
    },

    // ── Opération en cours (fenêtre d'opération) ─────────────────────────
    profondeur: () => edition.passe.length,
    regrouperDepuis(profondeur, libelle) {
      edition = regrouper(edition, profondeur, libelle);
      prevenir({ document: true });
    },
    revenirA(profondeur) {
      const avant = edition;
      edition = revenirA(edition, profondeur);
      if (edition.document !== avant.document) {
        nettoyerSelection();
        prevenir({ document: true, selection: true });
      } else {
        prevenir({ document: true });
      }
    },
    operationEnCours: () => operationEnCours,
    definirOperation(active) {
      operationEnCours = active;
      prevenir({ operation: true });
    },

    /* Refaire resélectionne ce que la commande fait naître : refaire un
       « Grouper » doit rendre le groupe sélectionné, comme la première fois. */
    refaire() {
      if (!peutRefaire(edition)) return;
      const prochaine = edition.futur[0].commande;
      changerDocument(refaire(edition), identifiantsCrees(prochaine));
    },

    /* Mettre le projet de côté, tel quel — pile d'annulation et sélection
       comprises — le temps d'éditer un objet paramétrique ; reprendre() le
       rend exactement comme il était. */
    mettreDeCote: () => ({ edition, selection, principal }),

    reprendre(misDeCote) {
      edition = misDeCote.edition;
      selection = misDeCote.selection;
      principal = misDeCote.principal;
      esquisseOuverte = null;
      nettoyerSelection();
      prevenir({ document: true, selection: true, projet: true });
    },

    /* Ouvrir un autre projet : une nouvelle pile, on n'annule pas au-delà. */
    remplacerDocument(document) {
      edition = creerEtat(document);
      selection = new Set();
      principal = null;
      esquisseOuverte = null;
      prevenir({ document: true, selection: true, projet: true });
    },

    /* facon : "remplacer" | "ajouter" | "basculer" */
    selectionner(ids, facon = "remplacer") {
      const avant = [...selection].join();
      // Toujours un nouvel ensemble : les panneaux comparent par identité.
      const nouvelle = facon === "remplacer" ? new Set(ids) : new Set(selection);
      for (const id of ids) {
        if (facon === "ajouter") nouvelle.add(id);
        if (facon === "basculer" && nouvelle.has(id)) nouvelle.delete(id);
        else if (facon === "basculer") nouvelle.add(id);
      }
      selection = nouvelle;
      principal = ids.length > 0 && selection.has(ids.at(-1)) ? ids.at(-1) : principal;
      nettoyerSelection();
      if ([...selection].join() !== avant) prevenir({ selection: true });
    },

    choisirOutil(nom) {
      const famille = familleDe(outilParNom(nom));
      if (outils[famille] === nom) return;
      outils[famille] = nom;
      prevenir({ outil: true });
    },

    regler(cle, valeur) {
      reglages = avecReglage(reglages, etat.outil(), cle, valeur);
      prevenir({ reglages: true });
    },

    abonner(fonction) {
      abonnes.push(fonction);
    },
  };
  return etat;
}
