/*
 * v0/scenes_d_essai.js
 * ────────────────────
 * Les deux scènes de V0. Elles existent pour que la mesure commence dès
 * l'ouverture, sans que le professeur ait à construire quoi que ce soit devant
 * une classe qui attend. Elles disparaissent avec le jalon.
 */

import { creerNoeud } from "../noyau/noeud.js";
import { creerDocument } from "../noyau/document.js";
import { nouvelObjet } from "../noyau/fabrique_de_noeuds.js";

export function nouveauNoeud(type, position, extras = {}) {
  return nouvelObjet(type, { ...extras, transformation: { position, ...(extras.transformation ?? {}) } });
}

/* Un socle, un pion posé dessus, et un perçage qui traverse les deux : de quoi
   lancer un booléen qui a du sens dès la première seconde. */
export function documentDEssai() {
  const socle = nouveauNoeud("pave", { x: 0, y: 0, z: 0 }, {
    transformation: { echelle: { x: 20, y: 20, z: 10 } },
  });
  const pion = nouveauNoeud("cylindre", { x: 0, y: 0, z: 10 });
  const percage = nouveauNoeud("cylindre", { x: 0, y: 0, z: -5 }, {
    nom: "Perçage",
    trou: true,
    transformation: { echelle: { x: 8, y: 8, z: 40 } },
  });

  return creerDocument({
    nom: "essai_v0",
    racine: creerNoeud({ type: "racine", enfants: [socle, pion, percage] }),
  });
}

/* Quarante cylindres identiques. Volontairement identiques : ils partagent une
   seule empreinte, donc un seul maillage. Si les images par seconde s'écroulent
   ici, c'est l'affichage qui coince, pas le moteur de géométrie. */
export function documentLourd(nombre = 40) {
  const enfants = [];
  for (let i = 0; i < nombre; i += 1) {
    enfants.push(nouveauNoeud("cylindre", {
      x: (i % 8) * 25 - 90,
      y: Math.floor(i / 8) * 25 - 50,
      z: 0,
    }));
  }
  return creerDocument({
    nom: "scene_lourde_v0",
    racine: creerNoeud({ type: "racine", enfants }),
  });
}
