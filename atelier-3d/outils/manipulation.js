/*
 * outils/manipulation.js
 * ──────────────────────
 * Le comportement commun des modes de déplacement : cliquer sélectionne, Maj
 * ou Ctrl ajoute à la sélection, attraper une poignée la fait glisser,
 * attraper l'objet le déplace à la façon du mode. Glisser dans le vide fait
 * glisser la vue ; y cliquer désélectionne. Chaque outil ne fournit que sa
 * façon de déplacer le corps de l'objet.
 *
 * Pendant le glisser, rien n'est écrit : la vue montre un aperçu. Au relâcher,
 * et nulle part ailleurs, part UNE commande. Échap annule le geste.
 */

import { commandeTransformerNoeud } from "../noyau/commandes/commande_transformer_noeud.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import { glisserFleche, glisserAnneau, glisserPoignee } from "./glissers_du_gizmo.js";

// En dessous, c'est un clic qui a tremblé, pas un glisser.
const SEUIL_DE_GLISSER_PX = 4;
const BOUTON_GAUCHE = 0;

const GLISSERS_DU_GIZMO = {
  fleche: (partie, ev, contexte, depart) => glisserFleche(partie.axe, ev, contexte, depart),
  anneau: (partie, ev, contexte, depart) => glisserAnneau(partie.axe, ev, contexte, depart),
  poignee: (partie, ev, contexte, depart) => glisserPoignee(partie.coin, ev, contexte, depart),
};

/* Ce que vise la souris : une poignée ou un objet, jamais les deux. Le
   gizmo, dessiné devant tout, gagne toujours. */
function viser(contexte, ev) {
  const partie = contexte.scene.partieDuGizmoSous(ev.clientX, ev.clientY);
  return { partie, cible: partie === null ? contexte.scene.objetSous(ev.clientX, ev.clientY) : null };
}

function memeTransformation(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* Les transformations de départ, l'objet principal en premier : c'est lui
   que les poignées et le mode Poser déplacent, les autres suivent. */
function transformationsDeDepart(contexte, principal) {
  const ids = [principal, ...[...contexte.selection()].filter((id) => id !== principal)];
  return new Map(ids.map((id) => [id, contexte.transformationDe(id)]).filter(([, t]) => t !== null));
}

/*
 * glisserCorps(appui, contexte, depart) : la façon dont le mode déplace
 * l'objet saisi, ou null si le mode ne déplace pas l'objet à la souris.
 */
export function creerManipulation(glisserCorps) {
  let appui = null;
  let geste = null;       // { glisser, depart, propose }

  function arreter(contexte) {
    if (geste !== null) {
      contexte.scene.finirApercus();
      contexte.scene.montrerAidesOutil([]);
      contexte.etiqueter(null);
    }
    contexte.mesurer(null);
    appui = null;
    geste = null;
  }

  function commencer(contexte, ev) {
    if (appui.partie !== null) {
      const depart = transformationsDeDepart(contexte, contexte.principal());
      if (depart.size === 0) return null;
      return { glisser: GLISSERS_DU_GIZMO[appui.partie.genre](appui.partie, ev, contexte, depart), depart, propose: null };
    }
    if (glisserCorps === null || appui.cible === null || !contexte.selection().has(appui.cible.id)) return null;
    const depart = transformationsDeDepart(contexte, appui.cible.id);
    return { glisser: glisserCorps(appui, contexte, depart), depart, propose: null };
  }

  return {
    surAppui(ev, contexte) {
      if (ev.button !== BOUTON_GAUCHE) return;
      const { partie, cible } = viser(contexte, ev);
      const ajout = ev.shiftKey || ev.ctrlKey || ev.metaKey;
      appui = { x: ev.clientX, y: ev.clientY, partie, cible, ajout };

      // Rien de solide sous la souris : peut-être le trait d'une esquisse.
      const esquisse = partie === null && cible === null ? contexte.esquisseSous(ev.clientX, ev.clientY) : null;
      if (partie === null && cible === null && esquisse === null) {
        appui = null;
        contexte.translaterLaVue(ev, ajout ? null : () => contexte.selectionner([], "remplacer"));
        return;
      }
      if (esquisse !== null) {
        contexte.selectionner([esquisse], ajout ? "basculer" : "remplacer");
      } else if (partie === null) {
        if (cible !== null && ajout) contexte.selectionner([cible.id], "basculer");
        else if (cible !== null && !contexte.selection().has(cible.id)) contexte.selectionner([cible.id], "remplacer");
      }
      contexte.capturer(ev.pointerId);
    },

    surDeplacement(ev, contexte) {
      if (appui === null) {
        // Survol : la poignée sous la souris s'éclaire, sinon l'objet.
        const { partie, cible } = viser(contexte, ev);
        contexte.scene.surlignerGizmo(partie);
        contexte.scene.marquerSurvol(cible?.id ?? null);
        return;
      }

      if (geste === null) {
        if (Math.hypot(ev.clientX - appui.x, ev.clientY - appui.y) < SEUIL_DE_GLISSER_PX) return;
        geste = commencer(contexte, ev);
        if (geste === null) return;
      }

      const propose = geste.glisser.deplacer(ev);
      if (propose === null) return;
      geste.propose = propose;
      for (const [id, transformation] of propose) contexte.scene.apercu(id, transformation);
      // Le mode en tête de la mesure : l'élève voit, au point où il agit, ce
      // que son glisser est en train de faire.
      contexte.mesurer(contexte.nomDuMode() + " — " + geste.glisser.mesure());
    },

    surRelache(ev, contexte) {
      if (geste !== null && geste.propose !== null) {
        const commandes = [...geste.propose]
          .filter(([id, apres]) => !memeTransformation(geste.depart.get(id), apres))
          .map(([id, apres]) => commandeTransformerNoeud.creer(id, geste.depart.get(id), apres));
        if (commandes.length === 1) contexte.emettre(commandes[0]);
        else if (commandes.length > 1) contexte.emettre(commandeLot.creer(commandes, "Déplacer"));
      }
      arreter(contexte);
    },

    surTouche(ev, contexte) {
      if (ev.key === "Escape" && appui !== null) {
        arreter(contexte);
        return true;
      }
      return false;
    },

    annuler: arreter,
  };
}
