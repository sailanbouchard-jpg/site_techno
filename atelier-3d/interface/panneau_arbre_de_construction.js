/*
 * interface/panneau_arbre_de_construction.js
 * ──────────────────────────────────────────
 * La liste des objets, avec l'imbrication des groupes, puis à part celle des
 * esquisses : elles restent disponibles même extrudées, et on en tire autant
 * de solides qu'on veut. Un œil pour masquer, une pastille pour signaler un
 * trou. C'est là qu'on retrouve un objet d'origine dans son groupe.
 *
 * Les groupes arrivent repliés : l'élève voit d'abord SES objets, ceux qu'il
 * reconnaît dans la vue, et pas la liste de tout ce qui a servi à les
 * fabriquer. Un groupe ouvert montre son contenu en plus petit et en plus
 * pâle : on voit du premier coup d'œil ce qui est un objet de la scène et ce
 * qui est une pièce à l'intérieur.
 *
 * Plier ou déplier un groupe est un état d'affichage, pas une donnée du
 * projet : il reste ici et n'est jamais enregistré.
 */

import { creer, bouton } from "./elements.js";
import { icone, iconeExiste } from "./icones.js";
import { parcourir, cheminVers } from "../noyau/document.js";

/*
 * dependances : { typeDe(noeud), nommer(noeud),
 *                 esquisses: { etat(noeud) → { etat: "complete" | "libre" | "probleme", texte },
 *                              liens(id) → { sources: [id], utilisateurs: [id] } },
 *                 actions: { selectionner(id, facon), ouvrir(id), visibilite(id, visible),
 *                            deplacerEsquisse(id, sens), survoler(id) } }
 *
 * Les lignes liées à celle qu'on montre s'allument : en plein ce qui en
 * dépend, en pointillé ce dont elle dépend. On voit donc, avant de toucher à
 * une esquisse, tout ce qui suivra.
 *
 * Les esquisses sont numérotées : une esquisse ne peut viser que les points de
 * référence de celles qui la précèdent. Les flèches de la ligne choisie la
 * font monter ou descendre, si ses références le permettent.
 */
const ETATS_D_ESQUISSE = {
  complete: { icone: "valider", nom: "Entièrement contrainte" },
  libre: { icone: "attention", nom: "Pas entièrement contrainte" },
  probleme: { icone: "fermer", nom: "Problème" },
};
const DELAI_DOUBLE_CLIC_MS = 450;

export function creerPanneauArbre(conteneur, dependances) {
  let erreurs = new Map();
  const { actions } = dependances;
  // Ce qui est ouvert, et non ce qui est fermé : un groupe tout neuf est replié.
  const deplies = new Set();
  const liste = creer("ul", { classe: "liste-arbre", attributs: { role: "tree" } });
  const titre = creer("span", { texte: "Construction" });
  // L'arbre est écrit sur la vue : un clic sur son titre le replie pour dégager la scène.
  const entete = creer("div", { classe: "titre-panneau", titre: "Cliquer pour replier ou déplier la liste" }, [icone("construction"), titre]);
  entete.addEventListener("click", () => {
    const repliee = conteneur.parentElement.classList.toggle("repliee");
    entete.setAttribute("aria-expanded", String(!repliee));
  });
  conteneur.append(entete, liste);

  let liens = { sources: new Set(), utilisateurs: new Set() };
  let dernierDocument = null;
  let dernierClic = { id: null, instant: -Infinity };
  let derniereSelection = null;

  /* numero : le rang d'une esquisse dans la liste (1, 2…), ou 0 pour un objet. */
  function ligne(noeud, profondeur, selection, numero = 0) {
    const type = dependances.typeDe(noeud);
    const erreur = erreurs.get(noeud.id) ?? null;
    const aDesEnfants = noeud.enfants.length > 0;
    const ouvert = deplies.has(noeud.id);
    const depli = creer("span", { classe: "depli" });
    if (aDesEnfants) {
      depli.append(icone("menu"));
      depli.classList.toggle("plie", !ouvert);
      depli.addEventListener("click", (evenement) => {
        evenement.stopPropagation();
        if (ouvert) deplies.delete(noeud.id);
        else deplies.add(noeud.id);
        dessiner(dernierDocument, derniereSelection);
      });
    }

    const oeil = bouton({
      icone: noeud.visible ? "oeil" : "oeil-barre",
      classe: "plat",
      titre: noeud.visible ? "Masquer" : "Afficher",
      surClic: (evenement) => {
        evenement.stopPropagation();
        actions.visibilite(noeud.id, !noeud.visible);
      },
    });

    const nom = dependances.nommer(noeud);
    // Un groupe replié annonce ce qu'il contient : on n'a pas besoin de l'ouvrir pour le savoir.
    const contenu = aDesEnfants && !ouvert
      ? creer("span", { classe: "compte-enfants", texte: noeud.enfants.length + " pièces" })
      : null;
    const etatEsquisse = numero > 0 ? dependances.esquisses.etat(noeud) : null;
    const pastilleEsquisse = etatEsquisse === null ? null : creer("span", {
      classe: "pastille-esquisse " + etatEsquisse.etat,
      titre: ETATS_D_ESQUISSE[etatEsquisse.etat].nom + " — " + etatEsquisse.texte,
    }, [icone(ETATS_D_ESQUISSE[etatEsquisse.etat].icone)]);
    // Monter, descendre : seulement sur l'esquisse choisie, pour ne pas charger la liste.
    const fleches = numero > 0 && selection.has(noeud.id) ? ["haut", "bas"].map((sens) => bouton({
      icone: "menu",
      classe: "plat fleche-ordre " + sens,
      titre: sens === "haut" ? "Monter l'esquisse dans la liste" : "Descendre l'esquisse dans la liste",
      surClic: (evenement) => {
        evenement.stopPropagation();
        actions.deplacerEsquisse(noeud.id, sens);
      },
    })) : [];
    // Ce qui dépend de cette esquisse : le nombre, et la liste au survol.
    const utilisateurs = numero > 0 ? dependances.esquisses.liens(noeud.id).utilisateurs : [];
    const pastilleLiens = utilisateurs.length === 0 ? null : creer("span", {
      classe: "compte-liens",
      texte: String(utilisateurs.length),
      titre: utilisateurs.length + (utilisateurs.length > 1 ? " objets dépendent" : " objet dépend")
        + " de cette esquisse : la modifier les modifie, la supprimer les casserait.",
    });
    const element = creer("li", {
      classe: "ligne-arbre" + (profondeur === 1 ? " racine" : " enfant"),
      titre: erreur ?? (nom + " — " + type.etiquette + (noeud.trou ? ", trou" : "")),
      attributs: { role: "treeitem", "aria-selected": String(selection.has(noeud.id)) },
    }, [
      depli,
      numero > 0 ? creer("span", { classe: "numero-esquisse", texte: String(numero) }) : null,
      icone(iconeExiste(type.icone) ? type.icone : "pave"),
      creer("span", { classe: "nom", texte: nom }),
      pastilleEsquisse,
      pastilleLiens,
      ...fleches,
      contenu,
      // Une forme qui n'a pas pu être calculée : elle a disparu de la vue, pas de la liste.
      erreur === null ? null : creer("span", { classe: "pastille-erreur", titre: erreur, texte: "!" }),
      noeud.trou ? creer("span", { classe: "pastille-trou", titre: "Trou" }, [icone("trou")]) : null,
      oeil,
    ]);
    // La profondeur seule passe par le JS ; le retrait qu'elle donne est réglé en CSS.
    element.style.setProperty("--profondeur", String(profondeur - 1));
    element.classList.toggle("choisie", selection.has(noeud.id));
    element.classList.toggle("dependante", liens.utilisateurs.has(noeud.id));
    element.classList.toggle("source", liens.sources.has(noeud.id));
    element.addEventListener("pointerenter", () => actions.survoler(noeud.id));
    element.addEventListener("pointerleave", () => actions.survoler(null));
    element.classList.toggle("masquee", !noeud.visible);
    element.classList.toggle("en-erreur", erreur !== null);
    element.addEventListener("click", (evenement) => {
      // Double-clic : reprendre l'esquisse de la ligne, s'il y en a une. Le
      // premier clic redessine la liste, donc le navigateur ne verrait pas
      // deux clics sur le même élément : on les compare par objet.
      const maintenant = evenement.timeStamp;
      const double = dernierClic.id === noeud.id && maintenant - dernierClic.instant < DELAI_DOUBLE_CLIC_MS;
      dernierClic = { id: noeud.id, instant: maintenant };
      if (double) {
        actions.ouvrir(noeud.id);
        return;
      }
      const ajout = evenement.shiftKey || evenement.ctrlKey || evenement.metaKey;
      actions.selectionner(noeud.id, ajout ? "basculer" : "remplacer");
    });
    return element;
  }

  /* Les lignes d'une liste de branches, en respectant les groupes repliés. */
  function lignes(branches, selection, numerotees = false) {
    const resultat = [];
    const plieSous = [];
    for (const [rang, branche] of branches.entries()) {
      for (const { noeud, profondeur } of parcourir(branche, null, 1)) {
        while (plieSous.length > 0 && profondeur <= plieSous.at(-1)) plieSous.pop();
        if (plieSous.length > 0) continue;
        resultat.push(ligne(noeud, profondeur, selection, numerotees && noeud === branche ? rang + 1 : 0));
        if (!deplies.has(noeud.id)) plieSous.push(profondeur);
      }
    }
    return resultat;
  }

  /* Une pièce choisie dans la vue doit se voir dans la liste : ses groupes s'ouvrent. */
  function ouvrirJusquA(document, selection) {
    for (const id of selection) {
      for (const ancetre of cheminVers(document, id).slice(0, -1)) deplies.add(ancetre);
    }
  }

  const section = (texte, nombre) => creer("li", { classe: "section-arbre", attributs: { role: "presentation" }, texte: texte + " (" + nombre + ")" });

  function dessiner(document, selection) {
    const estEsquisse = (noeud) => dependances.typeDe(noeud).fournitUnProfil === true;
    const objets = document.racine.enfants.filter((n) => !estEsquisse(n));
    const esquisses = document.racine.enfants.filter(estEsquisse);
    const fragment = [];
    if (objets.length > 0) fragment.push(section("Objets", objets.length), ...lignes(objets, selection));
    if (esquisses.length > 0) fragment.push(section("Esquisses", esquisses.length), ...lignes(esquisses, selection, true));
    liste.replaceChildren(...fragment);
    if (fragment.length === 0) {
      liste.append(creer("li", { classe: "inspecteur-vide", texte: "Le projet est vide." }));
    }
  }

  return {
    /* Les lignes à allumer : { sources, utilisateurs } (des ensembles). */
    montrerLiens(nouveaux) {
      const memes = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));
      if (memes(nouveaux.sources, liens.sources) && memes(nouveaux.utilisateurs, liens.utilisateurs)) return;
      liens = nouveaux;
      if (dernierDocument !== null) dessiner(dernierDocument, derniereSelection);
    },

    /* erreursParObjet : identifiant → ce qui empêche de calculer la forme. */
    mettreAJour(document, selection, erreursParObjet = new Map()) {
      const memesErreurs = erreursParObjet.size === erreurs.size
        && [...erreursParObjet].every(([id, message]) => erreurs.get(id) === message);
      erreurs = erreursParObjet;
      // Rien n'a changé : on ne redessine pas la liste (elle peut être longue).
      if (document === dernierDocument && selection === derniereSelection && memesErreurs) return;
      dernierDocument = document;
      derniereSelection = selection;
      ouvrirJusquA(document, selection);
      dessiner(document, selection);
      conteneur.querySelector(".ligne-arbre.choisie")?.scrollIntoView({ block: "nearest" });
    },
  };
}
