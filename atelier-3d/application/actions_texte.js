/*
 * application/actions_texte.js
 * ────────────────────────────
 * Le texte collé, dans sa fenêtre d'opération : on désigne une face, le
 * texte s'y pose au centre, lettres debout ; on le fait glisser sur la face,
 * on choisit En relief (il s'ajoute) ou Gravé (il creuse, une fois groupé
 * avec la pièce).
 */

import { trouverNoeud } from "../noyau/document.js";
import { typeDeNoeud, parametresParDefaut } from "../noyau/registre_types_de_noeuds.js";
import { rotationPourTexte, RECOUVREMENT_MM } from "../noyau/pose_sur_face.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import { commandeTransformerNoeud } from "../noyau/commandes/commande_transformer_noeud.js";
import { commandeModifierProprietes } from "../noyau/commandes/commande_modifier_proprietes.js";
import { commandeModifierParametre } from "../noyau/commandes/commande_modifier_parametre.js";
import { champsDuType } from "./operations/operations_esquisse.js";

const parametresDe = (noeud) => ({ ...parametresParDefaut(noeud.type), ...noeud.parametres });
const produit = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* De combien le pied du texte recule sous la face : un peu pour le relief
   (la soudure est franche), presque toute l'épaisseur pour le gravé. */
const recul = (epaisseur, grave) => (grave ? epaisseur - RECOUVREMENT_MM : RECOUVREMENT_MM);

export function creerActionsTexte({ etat, scene, annoncer, choix, operations, garderEnVue }) {
  function executer(commandes, libelle) {
    if (commandes.length === 0) return;
    etat.executer(commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, libelle));
  }

  const noeud = (id) => trouverNoeud(etat.document(), id);

  /* Pose le pied du texte sur le plan de la face, au point voulu. */
  function poserAuPoint(id, pointDeLaFace, normale) {
    const n = noeud(id);
    const p = parametresDe(n);
    const r = recul(p.epaisseur, n.trou);
    const position = { x: pointDeLaFace[0] - normale[0] * r, y: pointDeLaFace[1] - normale[1] * r, z: pointDeLaFace[2] - normale[2] * r };
    executer([commandeTransformerNoeud.creer(id, n.transformation, { ...n.transformation, position })], "Placer le texte");
  }

  /* Colle le texte au centre de la face plate touchée, ramené sur son plan. */
  function collerSur(id, touche, centreDeLaFace) {
    const n = noeud(id);
    const p = parametresDe(n);
    const centre = centreDeLaFace ?? touche.point;
    const ecart = produit([0, 1, 2].map((i) => centre[i] - touche.point[i]), touche.normale);
    const surLaFace = centre.map((c, i) => c - touche.normale[i] * ecart);
    const [x, y, z] = touche.point;
    const surface = { point: { x, y, z }, normale: touche.normale };
    const r = recul(p.epaisseur, n.trou);
    executer([
      commandeTransformerNoeud.creer(id, n.transformation, {
        ...n.transformation,
        rotation: rotationPourTexte(touche.normale),
        // Retenue pour que « Poser » sache d'où il repart si on le déplace.
        appui: { x: touche.normale[0], y: touche.normale[1], z: touche.normale[2] },
        position: { x: surLaFace[0] - touche.normale[0] * r, y: surLaFace[1] - touche.normale[1] * r, z: surLaFace[2] - touche.normale[2] * r },
      }),
      commandeModifierParametre.creer(id, "surface", p.surface, surface),
    ], "Coller le texte");
  }

  /* Relief ou gravé : le texte garde sa place sur la face, seul son enfoncement change. */
  function mettreEn(id, grave) {
    const n = noeud(id);
    const p = parametresDe(n);
    if (p.surface === null || n.trou === grave) return;
    const normale = p.surface.normale;
    const decalage = recul(p.epaisseur, n.trou) - recul(p.epaisseur, grave);
    const { position } = n.transformation;
    executer([
      commandeTransformerNoeud.creer(id, n.transformation, {
        ...n.transformation,
        position: { x: position.x + normale[0] * decalage, y: position.y + normale[1] * decalage, z: position.z + normale[2] * decalage },
      }),
      commandeModifierProprietes.creer(id, { trou: n.trou }, { trou: grave }),
    ], grave ? "Graver" : "Relief");
  }

  /* Changer l'épaisseur d'un texte gravé : son dessus doit rester à fleur de la face. */
  function changerEpaisseur(id, epaisseur) {
    const n = noeud(id);
    const p = parametresDe(n);
    const commandes = [commandeModifierParametre.creer(id, "epaisseur", p.epaisseur, epaisseur)];
    if (p.surface !== null && n.trou) {
      const d = recul(p.epaisseur, true) - recul(epaisseur, true);
      const { position } = n.transformation;
      const normale = p.surface.normale;
      commandes.push(commandeTransformerNoeud.creer(id, n.transformation, {
        ...n.transformation,
        position: { x: position.x + normale[0] * d, y: position.y + normale[1] * d, z: position.z + normale[2] * d },
      }));
    }
    executer(commandes, "Épaisseur");
  }

  function operationColler(id) {
    let enChoix = false;
    let glisse = null;      // { pointeur } pendant qu'on fait glisser le texte

    const lire = () => {
      const n = noeud(id);
      const p = parametresDe(n);
      return { ...p, mode: n.trou ? "grave" : "relief", colle: p.surface !== null };
    };

    function choisirLaFace() {
      enChoix = true;
      const exclus = new Set([id]);
      const sous = (ev) => scene.objetSous(ev.clientX, ev.clientY, exclus);
      choix.demarrer({
        message: null,
        survol: (ev) => scene.marquerSurvol(sous(ev)?.id ?? null),
        appui(ev) {
          const touche = sous(ev);
          if (touche === null) return false;
          collerSur(id, touche, scene.centreDeLaFaceSous(ev.clientX, ev.clientY, exclus));
          enChoix = false;
          operations.rafraichir(lire());
          return true;
        },
        arreter() {
          enChoix = false;
          scene.marquerSurvol(null);
        },
      });
      operations.rafraichir();
    }

    const champs = champsDuType(typeDeNoeud(noeud(id).type), { texte: { indication: "Texte" } });
    return {
      titre: "Texte sur une face",
      icone: "texte",
      libelle: "Coller le texte",
      champs: [
        champs.find((c) => c.cle === "texte"),
        { genre: "bouton", icone: "poser", texte: "Choisir une autre face", action: choisirLaFace },
        {
          genre: "choix", cle: "mode", etiquette: "Type",
          options: [
            { valeur: "relief", etiquette: "En relief", detail: "dépasse de la face" },
            { valeur: "grave", etiquette: "Gravé", detail: "creuse la face", aide: "Le texte devient un trou : il creuse la pièce une fois groupé avec elle." },
          ],
          visible: (v) => v.colle,
        },
        ...champs.filter((c) => c.cle !== "texte"),
      ],
      consigne: (v) => {
        if (enChoix || !v.colle) return "Cliquer dans la vue la face qui recevra le texte.";
        return "Glisser le texte dans la vue pour le déplacer sur la face.";
      },
      peutValider: (v) => v.colle,

      preparer() {
        if (!lire().colle) choisirLaFace();
        return lire();
      },

      changer(cle, valeur) {
        if (cle === "mode") mettreEn(id, valeur === "grave");
        else if (cle === "epaisseur") changerEpaisseur(id, valeur);
        else executer([commandeModifierParametre.creer(id, cle, parametresDe(noeud(id))[cle], valeur)], "Texte");
        return lire();
      },

      /* Faire glisser le texte sur sa face. */
      geste(genre, evenement, valeurs) {
        if (!valeurs.colle) return;
        const { surface } = parametresDe(noeud(id));
        const point = [surface.point.x, surface.point.y, surface.point.z];
        if (genre === "appui" && evenement.button === 0 && scene.objetSous(evenement.clientX, evenement.clientY)?.id === id) {
          glisse = { pointeur: evenement.pointerId };
          evenement.target.setPointerCapture(evenement.pointerId);
          return true;
        } else if (genre === "survol" && glisse !== null) {
          const vise = scene.pointSurPlan(evenement.clientX, evenement.clientY, point, surface.normale);
          if (vise !== null) poserAuPoint(id, vise, surface.normale);
        } else if (genre === "relache") {
          glisse = null;
        }
        return false;
      },

      apresValidation: () => garderEnVue(id),
    };
  }

  return {
    coller(id) {
      operations.demarrer(operationColler(id));
    },

    actionsDe(n) {
      if (typeDeNoeud(n.type).collable !== true) return [];
      const colle = parametresDe(n).surface !== null;
      return [{
        icone: "poser",
        texte: colle ? "Déplacer sur la face, relief ou gravé" : "Coller sur une face",
        actif: true,
        action: () => this.coller(n.id),
      }];
    },
  };
}
