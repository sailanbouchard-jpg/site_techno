/*
 * application/actions_edition.js
 * ──────────────────────────────
 * Ce que l'élève peut demander au projet, depuis un bouton, un raccourci ou
 * l'inspecteur. Chaque action fabrique une commande et la fait exécuter ;
 * aucune ne touche le document elle-même. Une erreur n'interrompt rien : elle
 * s'affiche dans la barre d'état, et le document reste tel qu'il était.
 */

import { trouverNoeud, trouverParent, parcourir } from "../noyau/document.js";
import { nouvelObjet } from "../noyau/fabrique_de_noeuds.js";
import { trouverPlaceLibre } from "../outils/aimantation.js";
import { objetsAffichables } from "../noyau/objets_affichables.js";
import { estNormalise, estDegroupable, typeDeNoeud, fournitUnProfil } from "../noyau/registre_types_de_noeuds.js";
import { nommer } from "../noyau/noms_automatiques.js";
import { operationAligner } from "./operations/operation_aligner.js";
import { valeursDesCotes, changementDeCote } from "../noyau/cotes_des_formes.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import { commandeAjouterNoeud } from "../noyau/commandes/commande_ajouter_noeud.js";
import { commandeSupprimerNoeud } from "../noyau/commandes/commande_supprimer_noeud.js";
import { commandeTransformerNoeud } from "../noyau/commandes/commande_transformer_noeud.js";
import { commandeModifierProprietes } from "../noyau/commandes/commande_modifier_proprietes.js";
import { commandeModifierParametre } from "../noyau/commandes/commande_modifier_parametre.js";
import { commandeGrouper } from "../noyau/commandes/commande_grouper.js";
import { commandeDegrouper } from "../noyau/commandes/commande_degrouper.js";
import { commandeDupliquer, copieAvecNouveauxIdentifiants } from "../noyau/commandes/commande_dupliquer.js";
import { liensDuNoeud } from "../noyau/esquisse/references_esquisse.js";

const arrondi = (valeur) => Math.round(valeur);

/* Un seul objet : sa commande ; plusieurs : un lot, une seule annulation. */
function enUneFois(commandes, libelle) {
  if (commandes.length === 0) return null;
  return commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, libelle);
}

// Le presse-papier de la séance : il survit au changement de projet, jamais au rechargement.
let pressePapier = [];

export function creerActionsEdition({ etat, scene, affichage, annoncer, operations, garderEnVue }) {
  function executer(fabriquer) {
    try {
      const commande = fabriquer();
      if (commande !== null) etat.executer(commande);
      return commande;
    } catch (erreur) {
      annoncer(erreur.message, true);
      return null;
    }
  }

  /* Ce que les outils et les actions manipulent : les objets sélectionnés qui
     s'affichent eux-mêmes, pas les enfants d'un groupe. */
  function selectionAffichee() {
    const affiches = new Set(objetsAffichables(etat.document()).map((n) => n.id));
    return [...etat.selection()].filter((id) => affiches.has(id));
  }

  return {
    selectionAffichee,

    /* Près du centre de la vue, là où une pièce de cette taille ne chevauche
       rien : sans cela, chaque ajout naît dans le précédent. */
    placeLibre(largeur, profondeur) {
      const [x, y] = scene.pointAuSolAuCentre();
      const occupees = objetsAffichables(etat.document()).map((n) => scene.boiteMonde(n.id)).filter((b) => b !== null);
      return trouverPlaceLibre([arrondi(x), arrondi(y)], [largeur, profondeur], occupees);
    },

    /* Une forme neuve se pose au sol : sous la souris si on l'y a glissée,
       sinon à une place libre. */
    ajouterForme(nomDuType, pointAuSol = null) {
      const { echelle } = nouvelObjet(nomDuType).transformation;
      const [x, y] = pointAuSol ?? this.placeLibre(Math.abs(echelle.x), Math.abs(echelle.y));
      const noeud = nouvelObjet(nomDuType, { transformation: { position: { x: arrondi(x), y: arrondi(y), z: 0 } } });
      if (executer(() => commandeAjouterNoeud.creer(etat.document().racine.id, noeud)) !== null) garderEnVue(noeud.id);
    },

    supprimer() {
      const document = etat.document();
      const noeuds = [...etat.selection()].map((id) => trouverNoeud(document, id)).filter((n) => n !== null);
      // Une esquisse ne part pas seule : les solides qu'on en a tirés perdraient leur forme.
      const partent = new Set(noeuds.flatMap((n) => [...parcourir(n)].map(({ noeud }) => noeud.id)));
      for (const esquisse of noeuds.filter((n) => fournitUnProfil(n.type))) {
        // Tout ce qui tient à cette esquisse : ses solides, les esquisses qui
        // la visent, ses copies liées, les extrusions qui s'arrêtent sur elle.
        const restants = liensDuNoeud(document, esquisse.id).utilisateurs
          .filter((id) => !partent.has(id))
          .map((id) => trouverNoeud(document, id));
        if (restants.length > 0) {
          annoncer("« " + nommer(esquisse) + " » sert à " + restants.map((n) => "« " + nommer(n) + " »").join(", ")
            + " : les supprimer d'abord, ou les sélectionner avec elle.", true);
          return;
        }
      }
      executer(() => enUneFois(noeuds.map((n) => commandeSupprimerNoeud.creer(etat.document(), n.id)), "Supprimer"));
    },

    /* Si un seul objet n'est pas un trou, tous le deviennent ; sinon tous
       redeviennent pleins. C'est le comportement d'une case à trois états. */
    basculerTrou() {
      const noeuds = etat.noeudsSelectionnes();
      const devenirTrou = noeuds.some((n) => !n.trou);
      executer(() => enUneFois(noeuds.filter((n) => n.trou !== devenirTrou)
        .map((n) => commandeModifierProprietes.creer(n.id, { trou: n.trou }, { trou: devenirTrou })), "Trou"));
    },

    /* assemblage : "reunir" (par défaut) ou "commun" — le bouton « Croiser ». */
    grouper(assemblage = "reunir") {
      const ids = selectionAffichee();
      if (ids.length < 2) {
        annoncer((assemblage === "commun" ? "Croiser" : "Grouper")
          + " : sélectionner au moins deux objets (Maj + clic).", true);
        return;
      }
      if (assemblage === "commun" && ids.some((id) => trouverNoeud(etat.document(), id).trou)) {
        annoncer("Croiser : une pièce en trou n'a pas de partie commune. La remettre pleine d'abord.", true);
        return;
      }
      // Le groupe se tient au centre du dessous de la matière, comme un objet :
      // un trou qui dépasse dessous ne doit pas décaler ce point.
      const pleins = ids.filter((id) => !trouverNoeud(etat.document(), id).trou);
      const boite = scene.boiteDes(pleins.length > 0 ? pleins : ids);
      const appui = boite === null ? { x: 0, y: 0, z: 0 }
        : { x: (boite.min[0] + boite.max[0]) / 2, y: (boite.min[1] + boite.max[1]) / 2, z: boite.min[2] };
      executer(() => commandeGrouper.creer(etat.document(), ids, "", appui, { assemblage }));
    },

    degrouper() {
      const groupes = etat.noeudsSelectionnes().filter((n) => estDegroupable(n.type));
      if (groupes.length === 0) {
        annoncer("Dégrouper : sélectionner un groupe.", true);
        return;
      }
      executer(() => enUneFois(groupes.map((g) => commandeDegrouper.creer(etat.document(), g.id)), "Dégrouper"));
    },

    /* Rend le nombre de copies faites (0 si rien n'a été dupliqué). */
    dupliquer() {
      const ids = [...etat.selection()].filter((id) => trouverParent(etat.document(), id) !== null);
      if (ids.length === 0) return 0;
      // La copie se superpose exactement à l'original : elle est sélectionnée, prête à être déplacée.
      const decalage = { x: 0, y: 0, z: 0 };
      if (executer(() => commandeDupliquer.creer(etat.document(), ids, decalage)) === null) return 0;
      for (const id of etat.selection()) garderEnVue(id);
      return ids.length;
    },

    /* Copier-coller : les copies naissent à la place des originales, comme
       « Dupliquer », et restent disponibles d'un projet à l'autre de la séance. */
    copier() {
      const noeuds = [...etat.selection()]
        .map((id) => trouverNoeud(etat.document(), id))
        .filter((n) => n !== null && trouverParent(etat.document(), n.id) !== null);
      if (noeuds.length === 0) return;
      pressePapier = noeuds;
      annoncer(noeuds.length > 1 ? noeuds.length + " objets copiés." : "« " + nommer(noeuds[0]) + " » copié.");
    },

    /* Rend le nombre d'objets collés. */
    coller() {
      if (pressePapier.length === 0) {
        annoncer("Rien à coller : copier d'abord un objet (Ctrl+C).", true);
        return 0;
      }
      const copies = pressePapier.map(copieAvecNouveauxIdentifiants);
      const racine = etat.document().racine.id;
      if (executer(() => enUneFois(copies.map((c) => commandeAjouterNoeud.creer(racine, c)), "Coller")) === null) return 0;
      etat.selectionner(copies.map((c) => c.id), "remplacer");
      for (const c of copies) garderEnVue(c.id);
      return copies.length;
    },

    /* Un quart de tour autour d'un axe du monde, sur place. */
    tourner(axe, degres) {
      executer(() => enUneFois(selectionAffichee().map((id) => {
        const t = trouverNoeud(etat.document(), id).transformation;
        const angle = (t.rotation[axe] + degres) % 360;
        return commandeTransformerNoeud.creer(id, t, { ...t, rotation: { ...t.rotation, [axe]: angle } });
      }), "Tourner"));
    },

    /* Aligner les pièces choisies sur la première. */
    aligner() {
      operations.demarrer(operationAligner({
        etat, scene, nommer, ids: selectionAffichee(),
        noeud: (id) => trouverNoeud(etat.document(), id),
      }));
    },

    selectionnerTout() {
      etat.selectionner(objetsAffichables(etat.document()).map((n) => n.id), "remplacer");
    },

    deplacer(dx, dy, dz) {
      executer(() => enUneFois(selectionAffichee().map((id) => {
        const t = trouverNoeud(etat.document(), id).transformation;
        const p = t.position;
        return commandeTransformerNoeud.creer(id, t, { ...t, position: { x: p.x + dx, y: p.y + dy, z: p.z + dz } });
      }), "Déplacer"));
    },

    // ── Inspecteur ───────────────────────────────────────────────────────
    modifierPropriete(id, cle, valeur) {
      const noeud = trouverNoeud(etat.document(), id);
      if (noeud === null || noeud[cle] === valeur) return;
      executer(() => commandeModifierProprietes.creer(id, { [cle]: noeud[cle] }, { [cle]: valeur }));
    },

    /* La même propriété sur toute la sélection, en une seule annulation. */
    modifierProprieteSelection(cle, valeur) {
      const noeuds = etat.noeudsSelectionnes().filter((n) => n[cle] !== valeur);
      executer(() => enUneFois(noeuds.map((n) => commandeModifierProprietes.creer(n.id, { [cle]: n[cle] }, { [cle]: valeur })), "Apparence"));
    },

    /* champ : "position" | "rotation" ; valeurs : { x?, y?, z? } */
    modifierTransformation(id, champ, valeurs) {
      const noeud = trouverNoeud(etat.document(), id);
      if (noeud === null) return;
      const t = noeud.transformation;
      executer(() => commandeTransformerNoeud.creer(id, t, { ...t, [champ]: { ...t[champ], ...valeurs } }));
    },

    /* Les dimensions affichées d'un objet, en millimètres. Pour une forme
       normalisée, c'est son échelle ; pour un groupe, sa boîte fois son échelle. */
    dimensionsDe(noeud) {
      const base = this.tailleDeBase(noeud);
      if (base === null) return null;
      const e = noeud.transformation.echelle;
      return { x: Math.abs(e.x) * base[0], y: Math.abs(e.y) * base[1], z: Math.abs(e.z) * base[2] };
    },

    tailleDeBase(noeud) {
      if (estNormalise(noeud.type)) return [1, 1, 1];
      const maillage = affichage.maillageDe(noeud);
      if (maillage === null || maillage.triangles === 0) return null;
      return [0, 1, 2].map((i) => maillage.boite.max[i] - maillage.boite.min[i] || 1);
    },

    /* La transformation qu'aurait l'objet avec cette cote, ou null si on ne
       peut pas encore la calculer. verrouille : le cadenas est fermé. */
    transformationPourDimension(noeud, axe, valeur, verrouille) {
      const base = this.tailleDeBase(noeud);
      if (base === null || !(valeur > 0)) return null;
      const i = { x: 0, y: 1, z: 2 }[axe];
      const e = noeud.transformation.echelle;
      const actuelle = Math.abs(e[axe]) * base[i];
      if (actuelle === 0) return null;
      const rapport = valeur / actuelle;
      const echelle = verrouille
        ? { x: e.x * rapport, y: e.y * rapport, z: e.z * rapport }
        : { ...e, [axe]: Math.sign(e[axe] || 1) * (valeur / base[i]) };
      return { ...noeud.transformation, echelle };
    },

    modifierDimension(id, axe, valeur, verrouille) {
      const noeud = trouverNoeud(etat.document(), id);
      if (noeud === null) return;
      const apres = this.transformationPourDimension(noeud, axe, valeur, verrouille);
      if (apres === null) {
        annoncer("La forme de « " + this.nommer(noeud) + " » se calcule encore : réessayer dans un instant.", true);
        return;
      }
      executer(() => commandeTransformerNoeud.creer(id, noeud.transformation, apres));
    },

    // ── Cotes d'une forme de base (rayon, ovalité…) ──────────────────────
    cotesDe(noeud) {
      const type = typeDeNoeud(noeud.type);
      return type.cotes === undefined ? null : valeursDesCotes(type, noeud);
    },

    /* La transformation à montrer pendant le réglage, ou null si la cote
       touche aussi un paramètre (le tore) : il faudrait recalculer la forme. */
    apercuCote(noeud, cle, valeur) {
      try {
        const { transformation, parametres } = changementDeCote(typeDeNoeud(noeud.type), noeud, cle, valeur);
        return Object.keys(parametres).length === 0 ? transformation : null;
      } catch (_erreur) {
        return null;
      }
    },

    modifierCote(id, cle, valeur) {
      const noeud = trouverNoeud(etat.document(), id);
      if (noeud === null) return;
      executer(() => {
        const { transformation, parametres } = changementDeCote(typeDeNoeud(noeud.type), noeud, cle, valeur);
        const commandes = [commandeTransformerNoeud.creer(id, noeud.transformation, transformation)];
        for (const [cleParametre, v] of Object.entries(parametres)) {
          commandes.push(commandeModifierParametre.creer(id, cleParametre, noeud.parametres[cleParametre], v));
        }
        return enUneFois(commandes, "Cote");
      });
    },

    modifierParametre(id, cle, valeur) {
      const noeud = trouverNoeud(etat.document(), id);
      if (noeud === null || noeud.parametres[cle] === valeur) return;
      executer(() => commandeModifierParametre.creer(id, cle, noeud.parametres[cle], valeur));
    },

    nommer,
  };
}
