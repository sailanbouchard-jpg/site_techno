/*
 * interface/panneau_inspecteur.js
 * ───────────────────────────────
 * Tout ce que l'objet sélectionné possède, en trois blocs :
 *   1. Réglages — ce qui fait l'objet (cotes, texte, nombre de copies…), en
 *      tête et mis en valeur, avec ses boutons propres ;
 *   2. Place — position, rotation, dimensions ;
 *   3. Apparence — nom, couleur, trou.
 * Les champs sont engendrés depuis le registre, sans code propre à une forme.
 *
 * Le panneau ne garde aucune valeur du document : il la relit à chaque mise à
 * jour. Il ne se reconstruit que si la sélection change de nature, pour ne pas
 * voler le focus à l'élève qui tape.
 */

import { creer, bouton } from "./elements.js";
import { FINITIONS } from "../noyau/finitions.js";
import { PORTEE_MM, TAILLE_MIN_MM, TAILLE_MAX_MM } from "../noyau/limites.js";
import { icone, iconeExiste } from "./icones.js";
import {
  rangeeTexte, rangeeTrio, rangeeAspect, rangeeCase, rangeeParametre, blocCotes, blocReglagesDuModele,
} from "./rangees_inspecteur.js";

const AIDE_GROUPER = { nom: "Grouper", raccourci: "Ctrl+G", texte: "Réunit les pièces sélectionnées en une seule. Les pièces en trou creusent les autres." };
const AIDE_DEGROUPER = { nom: "Dégrouper", raccourci: "Ctrl+Maj+G", texte: "Sépare le groupe en ses pièces d'origine." };
const AIDE_DUPLIQUER = { nom: "Dupliquer", raccourci: "Ctrl+D", texte: "Copie la sélection, superposée à l'original et prête à être déplacée." };
const AIDE_SUPPRIMER = { nom: "Supprimer", raccourci: "Suppr", texte: "Supprime la sélection." };

/*
 * dependances : { nuancier, typeDe(noeud), nommer(noeud), dimensionsDe(noeud), cotesDe(noeud),
 *   formuleDe(noeud, cle) → la formule du champ, ou null (cle : « position.x », « cote.rayon »…),
 *   actionsDe(noeud) → [{ icone, texte, titre?, actif, action }] : les boutons propres au nœud ;
 *     titre : la phrase d'explication de leur bulle,
 *   parametresDe(noeud) → les paramètres d'un objet de la bibliothèque (voir
 *     noyau/bibliotheque_d_objets.js), ou null ; signatureDe(noeud) → ce qui
 *     change quand ses champs doivent être refaits (le modèle a changé),
 *   actions: { propriete, transformation, apercuTransformation, dimension,
 *              apercuDimension, cote, apercuCote, finApercu, parametre, basculerTrou, operation } }
 */
export function creerPanneauInspecteur(conteneur, dependances) {
  const { actions } = dependances;
  let cle = null;
  // Les réglages qu'un autre réglage rend sans objet (masque(p)) : quand la liste change, on reconstruit.
  const masques = (n) => Object.entries(dependances.typeDe(n).parametres ?? {})
    .filter(([, d]) => d.masque?.(n.parametres) === true).map(([k]) => "-" + k).join("");
  let rangees = [];
  let proportionsGardees = false;

  /* Les formules d'une rangée : { x: "{v1} * 2", y: null… } */
  const formulesDe = (noeud, prefixe, cles) => Object.fromEntries(cles.map((c) => [c, dependances.formuleDe(noeud, prefixe + c)]));
  const AXES = ["x", "y", "z"];

  function titre(texte, terme, nomIcone) {
    return creer("div", { classe: "titre-panneau" }, [
      nomIcone && iconeExiste(nomIcone) ? icone(nomIcone) : null,
      creer("span", { texte }),
      terme ? creer("span", { classe: "terme", texte: terme }) : null,
    ]);
  }

  function construireVide() {
    conteneur.append(
      titre("Inspecteur"),
      creer("div", { classe: "inspecteur-vide" }, [
        creer("div", { texte: "Aucun objet sélectionné." }),
        creer("div", { classe: "terme", texte: "Ajouter une forme depuis le ruban (Formes). Dans la vue : clic droit pour tourner, clic gauche dans le vide pour déplacer, molette pour zoomer." }),
      ]),
    );
    rangees = [];
  }

  /* Un bloc titré de l'inspecteur. */
  function bloc(titreDuBloc, classe = "") {
    const element = creer("section", { classe: ("bloc-inspecteur " + classe).trim() }, [
      creer("div", { classe: "titre-bloc", texte: titreDuBloc }),
    ]);
    return element;
  }

  function construireUn(noeud) {
    const type = dependances.typeDe(noeud);
    const id = noeud.id;
    const corps = creer("div", { classe: "inspecteur-corps" });
    conteneur.append(titre(type.etiquette, type.termeDuProgramme, type.icone), corps);

    rangees = [];

    // Forme non calculée : l'objet n'est pas dans la vue, on dit pourquoi ici.
    const erreur = creer("p", { classe: "note-erreur" });
    corps.append(erreur);
    rangees.push((n) => {
      const message = dependances.erreurDe?.(n) ?? null;
      erreur.hidden = message === null;
      erreur.textContent = message ?? "";
    });

    // ── 1. Réglages : ce qui fait l'objet (cotes, texte, nombre de copies…), en tête ──
    const reglages = bloc(type.cotes !== undefined && Object.values(type.parametres).every((d) => d.cache || d.avance) ? "Dimensions" : "Réglages", "bloc-cotes");
    if (type.cotes !== undefined) {
      const cotes = blocCotes(type.cotes, {
        surValider: (cleCote, v, formule) => actions.cote(id, cleCote, v, formule),
        surApercu: (cleCote, v) => actions.apercuCote(id, cleCote, v),
        surAnnuler: actions.finApercu,
      });
      reglages.append(...cotes.lignes);
      const clesDesCotes = type.cotes.map((c) => c.cle);
      rangees.push((n) => cotes.definir(dependances.cotesDe(n), formulesDe(n, "cote.", clesDesCotes)));
    }
    if (type.reglagesDuModele) {
      const parametres = dependances.parametresDe(noeud);
      if (parametres === null) {
        reglages.append(creer("p", { classe: "terme", texte: "Le modèle de cet objet n'est plus dans la bibliothèque : ses paramètres ne se règlent plus." }));
      } else {
        const duModele = blocReglagesDuModele(parametres, (idVariable, v, formule) => actions.reglage(id, idVariable, v, formule));
        reglages.append(...duModele.elements);
        rangees.push((n) => duModele.definir(dependances.parametresDe(n) ?? [], (idVariable) => dependances.formuleDe(n, "reglage." + idVariable)));
      }
    }
    const avances = creer("details", { classe: "avances" }, [creer("summary", { texte: "Réglages avancés" })]);
    for (const [cleParametre, description] of Object.entries(type.parametres)) {
      if (description.cache || description.masque?.(noeud.parametres) === true) continue;
      const valeur = noeud.parametres[cleParametre] ?? description.defaut;
      const r = rangeeParametre(description, valeur, (v, formule = null) => actions.parametre(id, cleParametre, v, formule));
      (description.avance ? avances : reglages).append(r.element);
      rangees.push((n) => r.definir(n.parametres[cleParametre] ?? description.defaut, dependances.formuleDe(n, "parametre." + cleParametre)));
    }
    if (reglages.children.length > 1) corps.append(reglages);

    // Les boutons propres au nœud (Régler, Modifier l'esquisse, Figer…) viennent
    // juste après ses réglages. Ils changent avec lui : reconstruits à chaque mise à jour.
    const propres = creer("div", { classe: "ligne-actions" });
    corps.append(propres);
    rangees.push((n) => {
      const liste = dependances.actionsDe(n);
      propres.hidden = liste.length === 0;
      propres.replaceChildren(...liste.map((a) => {
        const b = bouton({ icone: a.icone, texte: a.texte, aide: a.titre ? { nom: a.texte, texte: a.titre } : undefined, surClic: a.action });
        b.disabled = !a.actif;
        return b;
      }));
    });

    const nom = rangeeTexte("Nom", noeud.nom, (v) => actions.propriete(id, "nom", v), dependances.nommer(noeud));
    rangees.push((n) => nom.definir(n.nom, dependances.nommer({ ...n, nom: "" })));

    // Une esquisse n'a ni matière ni place à elle : seulement un nom.
    if (type.transformable === false) {
      const apparence = bloc("Nom");
      apparence.append(nom.element);
      corps.append(apparence);
      return;
    }

    // ── 2. Place : où est l'objet ──
    const place = bloc("Place");
    const position = rangeeTrio("Position", {
      // L'atelier s'arrête à un demi-mètre de l'origine : au-delà, l'objet est introuvable.
      etiquettes: ["X", "Y", "Z"], unite: "mm", min: -PORTEE_MM, max: PORTEE_MM,
      surValider: (axe, v, formule) => actions.transformation(id, "position", axe, v, formule),
      surApercu: (axe, v) => actions.apercuTransformation(id, "position", { [axe]: v }),
      surAnnuler: actions.finApercu,
    });
    const rotation = rangeeTrio("Rotation", {
      etiquettes: ["X", "Y", "Z"], unite: "°", pasFixe: 15,
      surValider: (axe, v, formule) => actions.transformation(id, "rotation", axe, v, formule),
      surApercu: (axe, v) => actions.apercuTransformation(id, "rotation", { [axe]: v }),
      surAnnuler: actions.finApercu,
    });
    place.append(position.element, rotation.element);
    rangees.push(
      (n) => position.definir(n.transformation.position, formulesDe(n, "position.", AXES)),
      (n) => rotation.definir(n.transformation.rotation, formulesDe(n, "rotation.", AXES)),
    );
    // Les formes de base se règlent par leurs cotes, les solides d'esquisse et
    // les textes par leurs réglages : le trio L × l × h ferait doublon.
    if (type.cotes === undefined && type.tailleParReglages !== true) {
      const dimensions = rangeeTrio("Dimensions", {
        etiquettes: ["L", "l", "h"], unite: "mm", min: TAILLE_MIN_MM, max: TAILLE_MAX_MM,
        surValider: (axe, v, formule) => actions.dimension(id, axe, v, proportionsGardees, formule),
        surApercu: (axe, v) => actions.apercuDimension(id, axe, v, proportionsGardees),
        surAnnuler: actions.finApercu,
        cadenas: {
          verrouille: () => proportionsGardees,
          basculer: () => {
            proportionsGardees = !proportionsGardees;
            dimensions.definirCadenas();
          },
        },
      });
      place.append(dimensions.element);
      rangees.push((n) => dimensions.definir(dependances.dimensionsDe(n), formulesDe(n, "dimension.", AXES)));
    }
    corps.append(place);

    // ── 3. Apparence : nom, couleur, finition, trou ──
    const apparence = bloc("Apparence");
    const aspect = rangeeAspect(dependances.nuancier, FINITIONS,
      (v) => actions.propriete(id, "couleur", v), (v) => actions.propriete(id, "finition", v));
    const trou = rangeeCase("Trou", "creuse une fois groupé", () => actions.basculerTrou());
    apparence.append(nom.element, aspect.element, trou.element);
    rangees.push(
      (n) => aspect.definir(n.couleur, n.finition),
      (n) => trou.definir(n.trou),
    );
    corps.append(apparence);

    if (avances.children.length > 1) corps.append(avances);

    // Une répétition se défait par ses propres boutons (« Retirer la symétrie »).
    if (type.degroupable && typeof type.copies !== "function") {
      corps.append(creer("div", { classe: "ligne-actions" }, [
        bouton({ icone: "degrouper", texte: "Dégrouper", aide: AIDE_DEGROUPER, surClic: () => actions.operation("degrouper") }),
      ]));
    }
  }

  function construirePlusieurs(noeuds) {
    const corps = creer("div", { classe: "inspecteur-corps" });
    conteneur.append(titre(noeuds.length + " objets sélectionnés", null, "groupe"), corps);
    const trou = rangeeCase("Trou", "creusent une fois groupés", () => actions.basculerTrou());
    // Couleur et finition sur toute la sélection : c'est le geste de fin de maquette.
    const aspect = rangeeAspect(dependances.nuancier, FINITIONS,
      (v) => actions.proprietes("couleur", v), (v) => actions.proprietes("finition", v));
    const apparence = bloc("Apparence");
    apparence.append(aspect.element);
    corps.append(apparence, trou.element, creer("div", { classe: "ligne-actions" }, [
      bouton({ icone: "grouper", texte: "Grouper", aide: AIDE_GROUPER, surClic: () => actions.operation("grouper") }),
      bouton({ icone: "dupliquer", texte: "Dupliquer", aide: AIDE_DUPLIQUER, surClic: () => actions.operation("dupliquer") }),
      bouton({ icone: "supprimer", texte: "Supprimer", aide: AIDE_SUPPRIMER, surClic: () => actions.operation("supprimer") }),
    ]));
    const memeValeur = (tous, cle) => (tous.every((n) => n[cle] === tous[0][cle]) ? tous[0][cle] : undefined);
    rangees = [
      (_n, tous) => {
        const trous = tous.filter((n) => n.trou).length;
        trou.definir(trous === 0 ? false : trous === tous.length ? true : null);
        aspect.definir(memeValeur(tous, "couleur"), memeValeur(tous, "finition"));
      },
    ];
  }

  return {
    mettreAJour(noeuds) {
      const nouvelleCle = noeuds.map((n) => n.id + ":" + n.type + (dependances.signatureDe?.(n) ?? "") + masques(n)).join("|");
      if (nouvelleCle !== cle) {
        conteneur.replaceChildren();
        if (noeuds.length === 0) construireVide();
        else if (noeuds.length === 1) construireUn(noeuds[0]);
        else construirePlusieurs(noeuds);
        cle = nouvelleCle;
      }
      if (noeuds.length > 0) {
        for (const definir of rangees) definir(noeuds[0], noeuds);
      }
    },
  };
}
