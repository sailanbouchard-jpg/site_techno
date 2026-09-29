/*
 * application/contexte_des_outils.js
 * ──────────────────────────────────
 * Ce que l'outil actif reçoit pour travailler, et le branchement des gestes de
 * la vue sur lui. Un outil ne voit jamais l'état ni le document : il pose des
 * questions à la scène et émet des commandes.
 */

import { trouverNoeud } from "../noyau/document.js";
import { objetsAffichables } from "../noyau/objets_affichables.js";
import { outilParNom } from "../outils/registre_outils.js";

export function brancherLesOutils({ canvas, etat, scene, edition, esquisses, choix, operations, mesurer, annoncer, ouvrir, etiquette, plateau }) {
  const outilActif = () => outilParNom(etat.outil());

  const contexte = {
    scene,
    esquisse: esquisses.pourLesOutils,
    selection: () => new Set(edition.selectionAffichee()),
    principal: () => {
      const affichee = edition.selectionAffichee();
      return affichee.includes(etat.principal()) ? etat.principal() : affichee.at(-1) ?? null;
    },
    selectionner: (ids, facon) => etat.selectionner(ids, facon),
    esquisseSous: (x, y) => esquisses.sous(x, y),
    transformationDe: (id) => trouverNoeud(etat.document(), id)?.transformation ?? null,
    objetsAffiches: () => objetsAffichables(etat.document()).map((n) => n.id),
    nomDe: (id) => {
      const noeud = trouverNoeud(etat.document(), id);
      return noeud === null ? "" : edition.nommer(noeud);
    },
    options: () => etat.reglages(),
    emettre: (commande) => {
      try {
        etat.executer(commande);
      } catch (erreur) {
        annoncer(erreur.message, true);
      }
    },
    mesurer,
    // Le nom du mode actif (Libre, Poser, Axe) : il s'affiche pendant un glisser.
    nomDuMode: () => outilActif().etiquette,
    // Une étiquette posée sur un point de la scène (la hauteur au sol), ou null pour la cacher.
    etiqueter: (point, texte) => (point === null ? etiquette.cacher() : etiquette.montrer(scene.versEcran(point), texte)),
    capturer: (pointeur) => canvas.setPointerCapture(pointeur),
    // Un appui gauche qui ne touche rien : la vue glisse ; sans bouger, c'est un clic.
    translaterLaVue: (evenement, surClic) => scene.controleur.translaterDepuis(evenement, surClic),
    annoncer,
  };

  // Dans l'onglet Impression, les gestes vont au plateau. Pendant une opération
  // (fenêtre ouverte), ils vont à l'opération ; hors opération, un choix en
  // attente les prend avant l'outil.
  const prendre = (genre, ev) => plateau.geste(genre, ev) || operations.geste(genre, ev) || choix.geste(genre, ev);
  canvas.addEventListener("pointerdown", (ev) => {
    canvas.focus();
    if (!prendre("appui", ev)) outilActif().surAppui(ev, contexte);
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!prendre("survol", ev)) outilActif().surDeplacement(ev, contexte);
  });
  for (const genre of ["pointerup", "pointercancel"]) {
    canvas.addEventListener(genre, (ev) => {
      if (!prendre("relache", ev)) outilActif().surRelache(ev, contexte);
    });
  }
  canvas.addEventListener("pointerleave", () => {
    scene.marquerSurvol(null);
    scene.surlignerGizmo(null);
  });

  // Double-clic : on reprend ce qui a fait l'objet (sa fenêtre d'opération, ou son esquisse).
  canvas.addEventListener("dblclick", (ev) => {
    if (plateau.enImpression() || etat.famille() !== "deplacement" || operations.enCours()) return;
    const id = esquisses.sous(ev.clientX, ev.clientY) ?? scene.objetSous(ev.clientX, ev.clientY)?.id ?? null;
    if (id !== null) ouvrir(id);
  });

  let outilPrecedent = null;
  return {
    contexte,
    outilActif,

    /* Appelé à chaque rafraîchissement : l'outil qui change est prévenu. */
    suivreLOutil() {
      const outil = outilActif();
      if (outil === outilPrecedent) return;
      outilPrecedent?.desactiver(contexte);
      outil.activer(contexte);
      canvas.dataset.curseur = outil.curseur;
      outilPrecedent = outil;
    },
  };
}
