/*
 * interface/panneau_plateau.js
 * ────────────────────────────
 * La liste de gauche de l'onglet Impression : les pièces posées sur le
 * plateau, puis les objets du projet qui n'y sont pas encore. Une pièce à
 * problème (hors du volume, chevauchement) porte une pastille qui dit pourquoi.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";

/*
 * actions : { selectionner(id, facon), ajouter(idObjet), retirer(id) }
 */
export function creerPanneauPlateau(conteneur, actions) {
  const liste = creer("ul", { classe: "liste-arbre", attributs: { role: "listbox", "aria-label": "Pièces du plateau" } });
  const entete = creer("div", { classe: "titre-panneau", titre: "Cliquer pour replier ou déplier la liste" }, [icone("plateau"), creer("span", { texte: "Plateau" })]);
  entete.addEventListener("click", () => conteneur.parentElement.classList.toggle("repliee"));
  conteneur.append(entete, liste);
  let derniere = null;

  const section = (texte, nombre) => creer("li", { classe: "section-arbre", attributs: { role: "presentation" }, texte: texte + " (" + nombre + ")" });

  function lignePiece(piece, selection) {
    const choisie = selection.has(piece.id);
    const retirer = bouton({
      icone: "supprimer", classe: "plat", titre: "Retirer du plateau (l'objet reste dans la conception)",
      surClic: (evenement) => {
        evenement.stopPropagation();
        actions.retirer(piece.id);
      },
    });
    const element = creer("li", {
      classe: "ligne-arbre racine",
      titre: piece.probleme === null ? piece.nom : piece.nom + " : " + piece.probleme,
      attributs: { role: "option", "aria-selected": String(choisie) },
    }, [
      creer("span", { classe: "depli" }),
      icone(piece.partie ? "eclater" : "plateau"),
      creer("span", { classe: "nom", texte: piece.nom }),
      piece.enCalcul ? creer("span", { classe: "compte-enfants", texte: "calcul…" }) : null,
      piece.probleme === null ? null : creer("span", { classe: "pastille-erreur", titre: piece.probleme, texte: "!" }),
      retirer,
    ]);
    element.style.setProperty("--profondeur", "0");
    element.classList.toggle("choisie", choisie);
    element.classList.toggle("en-erreur", piece.probleme !== null);
    element.addEventListener("click", (evenement) => {
      const ajout = evenement.shiftKey || evenement.ctrlKey || evenement.metaKey;
      actions.selectionner(piece.id, ajout ? "basculer" : "remplacer");
    });
    return element;
  }

  function ligneHorsPlateau(objet) {
    const element = creer("li", {
      classe: "ligne-arbre racine hors-plateau",
      titre: "Cliquer pour mettre « " + objet.nom + " » sur le plateau",
      attributs: { role: "option", "aria-selected": "false" },
    }, [
      creer("span", { classe: "depli" }),
      icone("plus"),
      creer("span", { classe: "nom", texte: objet.nom }),
    ]);
    element.style.setProperty("--profondeur", "0");
    element.addEventListener("click", () => actions.ajouter(objet.id));
    return element;
  }

  return {
    /* resume : voir espace_impression.resume() ; selection : Set d'identifiants de pièces. */
    mettreAJour(resume, selection) {
      const signature = JSON.stringify([resume.pieces.map((p) => [p.id, p.nom, p.probleme, p.enCalcul]), resume.horsPlateau, [...selection]]);
      if (signature === derniere) return;
      derniere = signature;
      const lignes = [];
      lignes.push(section("Sur le plateau", resume.pieces.length));
      if (resume.pieces.length === 0) {
        lignes.push(creer("li", { classe: "inspecteur-vide", texte: "Aucune pièce. Cliquer un objet ci-dessous pour le poser sur le plateau." }));
      }
      lignes.push(...resume.pieces.map((p) => lignePiece(p, selection)));
      if (resume.horsPlateau.length > 0) {
        lignes.push(section("Hors du plateau", resume.horsPlateau.length), ...resume.horsPlateau.map(ligneHorsPlateau));
      }
      liste.replaceChildren(...lignes);
      conteneur.querySelector(".ligne-arbre.choisie")?.scrollIntoView({ block: "nearest" });
    },
  };
}
