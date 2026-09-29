/*
 * interface/inspecteur_plateau.js
 * ───────────────────────────────
 * L'inspecteur de l'onglet Impression : la place d'une pièce sur le plateau,
 * en millimètres de la machine (0, 0 au coin avant gauche, comme dans les
 * trancheurs), son orientation, et ce qu'on peut en faire.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";
import { rangee } from "./rangees_inspecteur.js";

const nombre = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/*
 * actions : { placer(id, axe, valeur), apercu(id, modifications), finApercu(),
 *             angle(valeur), tourner(degres), poserAPlat(), orienter(),
 *             eclater(id), rassembler(id), dupliquer(), retirer() }
 */
export function creerInspecteurPlateau(conteneur, actions) {
  let idAffiche = null;

  const titre = creer("span");
  const entete = creer("div", { classe: "titre-panneau" }, [icone("plateau"), titre]);
  const corps = creer("div", { classe: "inspecteur-corps" });
  conteneur.append(entete, corps);

  // ── Place ──
  const champ = (etiquette, axe, unite, options = {}) => creerChampNumerique({
    etiquette, unite, decimales: 1, ...options,
    titre: etiquette + " — glisser pour régler",
    surValider: (v) => (axe === "angle" ? actions.angle(v) : actions.placer(idAffiche, axe, v)),
    surApercu: (v) => actions.apercu(idAffiche, axe === "angle" ? { rotation: { z: v } } : { [axe]: v }),
    surAnnuler: () => actions.finApercu(),
  });
  const champX = champ("X", "x", "mm");
  const champY = champ("Y", "y", "mm");
  const champAngle = champ("Z", "angle", "°", { pasFixe: 15 });
  const position = rangee("Centre (mm)", creer("div", { classe: "trio duo" }, [champX.element, champY.element]),
    "Centre de la pièce vue de dessus, depuis le coin avant gauche du plateau", true);
  const angle = rangee("Rotation (°)", champAngle.element, "Rotation de la pièce autour de l'axe vertical du plateau");
  const dimensions = creer("div", { classe: "rangee information" });
  const probleme = creer("div", { classe: "rangee alerte-plateau" });

  const place = creer("section", { classe: "bloc-inspecteur" }, [
    creer("div", { classe: "titre-bloc", texte: "Place sur le plateau" }), position, angle, dimensions, probleme,
  ]);

  // ── Actions ──
  const poser = bouton({ icone: "poser", texte: "Poser à plat", aide: { nom: "Poser à plat", raccourci: "P", texte: "Cliquer ensuite la face qui doit reposer sur le plateau." }, surClic: () => actions.poserAPlat() });
  const tourner = bouton({ icone: "tourner", texte: "90°", aide: { nom: "Quart de tour", raccourci: "R", texte: "Tourne autour de la verticale." }, surClic: () => actions.tourner(90) });
  const orienter = bouton({ icone: "vue", texte: "Comme l'assemblage", aide: { nom: "Orientation de l'assemblage", texte: "Rend à la pièce l'orientation qu'elle a dans la conception." }, surClic: () => actions.orienter() });
  const eclater = bouton({ icone: "eclater", texte: "Séparer les pièces", aide: { nom: "Séparer les pièces", texte: "Pose chaque pièce de cet objet séparément sur le plateau, pour les orienter une à une. L'objet reste entier dans la conception." }, surClic: () => actions.eclater(idAffiche) });
  const rassembler = bouton({ icone: "rassembler", texte: "Rassembler", aide: { nom: "Rassembler", texte: "Les pièces séparées de cet objet redeviennent un seul objet sur le plateau." }, surClic: () => actions.rassembler(idAffiche) });
  const dupliquer = bouton({ icone: "dupliquer", texte: "Dupliquer", aide: { nom: "Dupliquer", raccourci: "Ctrl+D", texte: "Un exemplaire de plus, à une place libre." }, surClic: () => actions.dupliquer() });
  const retirer = bouton({ icone: "supprimer", texte: "Retirer", aide: { nom: "Retirer du plateau", raccourci: "Suppr", texte: "L'objet reste dans la conception." }, surClic: () => actions.retirer() });

  const orientation = creer("section", { classe: "bloc-inspecteur" }, [
    creer("div", { classe: "titre-bloc", texte: "Orientation" }),
    creer("div", { classe: "ligne-actions" }, [poser, tourner, orienter]),
  ]);
  const organisation = creer("section", { classe: "bloc-inspecteur" }, [
    creer("div", { classe: "titre-bloc", texte: "Pièce" }),
    creer("div", { classe: "ligne-actions" }, [eclater, rassembler, dupliquer, retirer]),
  ]);
  corps.append(place, orientation, organisation);

  return {
    /* pieces : les pièces sélectionnées, telles que resume() les décrit. */
    mettreAJour(pieces) {
      const une = pieces.length === 1 ? pieces[0] : null;
      idAffiche = une?.id ?? null;
      titre.textContent = une !== null ? une.nom : pieces.length + " pièces";
      position.hidden = une === null;
      if (une !== null) {
        champX.definirValeur(une.piece.x);
        champY.definirValeur(une.piece.y);
      }
      // Un angle commun à toute la sélection s'affiche ; sinon le champ reste vide.
      const angles = new Set(pieces.map((p) => p.piece.rotation.z));
      champAngle.definirValeur(angles.size === 1 ? [...angles][0] : null);

      const boites = pieces.map((p) => p.boite).filter((b) => b !== null);
      dimensions.hidden = une === null || une.boite === null;
      if (une !== null && une.boite !== null) {
        const { min, max } = une.boite;
        dimensions.textContent = "Encombrement : " + [max[0] - min[0], max[1] - min[1], max[2]].map(nombre).join(" × ") + " mm";
      }
      const problemes = pieces.filter((p) => p.probleme !== null);
      probleme.hidden = problemes.length === 0;
      probleme.textContent = problemes.map((p) => (une === null ? p.nom + " : " : "") + p.probleme).join(". ");
      dimensions.hidden = dimensions.hidden || boites.length === 0;

      eclater.hidden = !(une?.separable ?? false);
      rassembler.hidden = !(une?.partie ?? false);
    },
  };
}
