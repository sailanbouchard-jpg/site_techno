/*
 * application/operations/operation_extruder_face.js
 * ─────────────────────────────────────────────────
 * « Extruder une face » en deux temps :
 *   1. choisir dans la vue la face plane d'une pièce (son contour s'allume
 *      au survol) ;
 *   2. son contour devient une esquisse posée sur la face, aussitôt extrudée :
 *      la fenêtre d'extrusion s'ouvre, avec en plus ce que devient la pièce —
 *      la matière s'y ajoute, elle la creuse, ou reste une pièce à part.
 * L'esquisse reste dans la liste : la rouvrir permet de retoucher le contour.
 */

import { faceSous } from "../../noyau/face_du_maillage.js";
import { operationSolideEsquisse, LONGUEUR_POIGNEE_PX } from "./operations_esquisse.js";

const RESULTATS = [
  { valeur: "ajouter", etiquette: "Ajouter à la pièce", aide: "L'extrusion et la pièce sont groupées : la matière s'ajoute." },
  { valeur: "creuser", etiquette: "Creuser la pièce", aide: "L'extrusion part dans la pièce, en trou : elle la creuse." },
  { valeur: "separee", etiquette: "Pièce séparée", aide: "L'extrusion reste une pièce à part, posée contre la face." },
];

/*
 * outils : { scene, operations, terminer(), extruder(face, idPiece) }
 * Rien ne change dans le projet tant qu'aucune face n'est choisie.
 */
export function operationChoisirFace(outils) {
  let survolee = null;       // { id, face } sous la souris
  let cache = { id: null, maillage: null };

  function sous(evenement) {
    const touche = outils.scene.objetSous(evenement.clientX, evenement.clientY);
    if (touche === null || touche.normale === undefined) return null;
    if (cache.id !== touche.id) cache = { id: touche.id, maillage: outils.scene.maillageMonde(touche.id) };
    if (cache.maillage === null) return null;
    const face = faceSous(cache.maillage, touche.point, touche.normale);
    return face === null ? null : { id: touche.id, face: { ...face, point: touche.point } };
  }

  return {
    titre: "Extruder une face",
    icone: "extrusion_face",
    libelle: "Extruder une face",
    sansValider: true,
    champs: [],
    consigne: () => "Cliquer dans la vue la face plane à extruder.",
    preparer: () => ({}),
    changer: (cle, valeur, valeurs) => ({ ...valeurs, [cle]: valeur }),

    aides() {
      if (survolee === null) return [];
      return [
        { genre: "surface", triangles: survolee.face.triangles },
        ...survolee.face.boucles.map((points) => ({ genre: "arete", points, ferme: true, fort: true })),
      ];
    },

    geste(genre, evenement) {
      if (genre === "survol") {
        const cible = sous(evenement);
        const signature = (c) => (c === null ? "" : c.id + ":" + c.face.boucles.map((b) => b.length + ":" + b[0].join(",")).join("|"));
        if (signature(cible) !== signature(survolee)) {
          survolee = cible;
          outils.operations.rafraichir();
        }
        return false;
      }
      if (genre !== "appui" || evenement.button !== 0) return false;
      const cible = sous(evenement);
      if (cible === null) return false;
      outils.terminer();
      outils.extruder(cible.face, cible.id);
      return true;
    },
  };
}

/*
 * L'extrusion d'une face choisie. outils : ceux d'operationSolideEsquisse,
 * plus creerDepuisLaFace(face) → id du solide, grouper(ids, idAppui) → id du
 * groupe ou null, degrouper(id), basculerTrou(id, trou), selectionner(id).
 */
export function operationExtruderFace(outils, face, idPiece) {
  let idSolide = null;
  let idGroupe = null;
  let resultat = "ajouter";

  // La flèche de hauteur part du point cliqué, le long de la normale de la face :
  // groupé, le solide n'a pas de boîte à lui.
  const poigneeDeHauteur = (valeurs) => {
    const n = face.normale;
    const h = valeurs.hauteur ?? 0;
    const symetrique = valeurs.sens === "symetrique";
    const direction = valeurs.sens === "bas" ? n.map((c) => -c) : n;
    const bout = face.point.map((c, i) => c + direction[i] * (symetrique ? h / 2 : h));
    const longueur = LONGUEUR_POIGNEE_PX * outils.scene.millimetresParPixel(bout);
    return { base: face.point, direction, bout, pointe: bout.map((c, i) => c + direction[i] * longueur), symetrique };
  };

  function grouper() {
    if (idGroupe === null) idGroupe = outils.grouper([idPiece, idSolide], idPiece);
    return idGroupe !== null;
  }
  function degrouper() {
    if (idGroupe !== null) outils.degrouper(idGroupe);
    idGroupe = null;
  }

  const base = operationSolideEsquisse("extrusion", {
    ...outils,
    poigneeDeHauteur,
    // La face elle-même se tire : pas besoin de viser la flèche.
    zoneDeTirage: (evenement) => {
      const touche = outils.scene.objetSous(evenement.clientX, evenement.clientY);
      return touche !== null && (touche.id === (idGroupe ?? idSolide) || touche.id === idPiece);
    },
    consommer: () => {
      idSolide = outils.creerDepuisLaFace(face);
      if (!grouper()) resultat = "separee";
      return { id: idSolide, sensExterieur: 1 };
    },
    rouvrirEsquisse: () => {},
  });

  return {
    ...base,
    titre: "Extruder une face",
    icone: "extrusion_face",
    libelle: "Extruder une face",

    preparer() {
      const valeurs = base.preparer();
      base.champs.unshift({ genre: "choix", cle: "resultat", etiquette: "La pièce", options: RESULTATS });
      this.champs = base.champs;
      return { ...valeurs, resultat };
    },

    changer(cle, valeur, valeurs) {
      if (cle !== "resultat") return base.changer(cle, valeur, valeurs);
      if (valeur === "separee") degrouper();
      else if (!grouper()) throw new Error("La pièce et l'extrusion ne sont pas au même niveau de la construction : elles restent séparées.");
      resultat = valeur;
      outils.basculerTrou(idSolide, valeur === "creuser");
      // Creuser part dans la pièce ; ajouter ou séparer, vers l'extérieur.
      const sens = valeur === "creuser" ? "bas" : "haut";
      if (valeurs.sens !== "symetrique") outils.regler(idSolide, { sens });
      return { ...valeurs, resultat, sens: valeurs.sens === "symetrique" ? "symetrique" : sens };
    },

    // La face de départ reste peinte : on voit d'où part la matière.
    aides(valeurs) {
      return [{ genre: "surface", triangles: face.triangles }, ...(base.aides?.(valeurs) ?? [])];
    },

    apresValidation() {
      outils.selectionner(idGroupe ?? idSolide);
      outils.garderEnVue(idGroupe ?? idSolide);
    },
    apresAnnulation: () => {},
  };
}
