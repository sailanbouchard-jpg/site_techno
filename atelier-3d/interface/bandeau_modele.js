/*
 * interface/bandeau_modele.js
 * ───────────────────────────
 * Pendant l'édition d'un objet paramétrique, un bandeau au bas de la vue
 * rappelle qu'on n'est plus dans le projet, et porte les deux seules sorties :
 * enregistrer dans la bibliothèque, ou abandonner. Si l'objet ne peut pas
 * être enregistré (esquisse pas entièrement contrainte…), la liste de ce qui
 * manque s'affiche au-dessus des boutons.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";

/* actions : { enregistrer() → Promise<[problème]>, abandonner(), retirer(), decrire(texte) } */
export function creerBandeauModele(vue, actions) {
  const titre = creer("span", { classe: "titre-operation" });
  const description = creer("input", {
    classe: "champ-texte description-modele",
    attributs: { type: "text", maxlength: "400", spellcheck: "true", placeholder: "Description courte, montrée dans la bibliothèque", "aria-label": "Description de l'objet" },
  });
  description.addEventListener("keydown", (evenement) => {
    evenement.stopPropagation();
    if (evenement.key === "Enter") description.blur();
  });
  description.addEventListener("change", () => actions.decrire(description.value));
  const problemes = creer("ul", { classe: "problemes-modele", attributs: { hidden: "" } });

  const enregistrer = bouton({
    icone: "valider", texte: "Enregistrer dans la bibliothèque", classe: "principal",
    aide: { nom: "Enregistrer dans la bibliothèque", texte: "Vérifie que l'objet est entièrement contraint, l'enregistre dans le logiciel et revient au projet. Les objets déjà tirés de ce modèle suivent, dans tous les projets." },
    surClic: async () => {
      enregistrer.disabled = true;
      actions.decrire(description.value);
      const liste = await actions.enregistrer();
      enregistrer.disabled = false;
      problemes.replaceChildren(...liste.map((texte) => creer("li", { texte })));
      problemes.hidden = liste.length === 0;
    },
  });
  const abandonner = bouton({
    texte: "Abandonner", classe: "plat",
    aide: { nom: "Abandonner", texte: "Revient au projet sans rien enregistrer dans la bibliothèque." },
    surClic: () => actions.abandonner(),
  });

  // Retirer un modèle est rare et sans retour : petit, à gauche, et confirmé par un second clic.
  let confirme = false;
  const retirer = bouton({ texte: "Retirer de la bibliothèque", classe: "plat retirer-modele" });
  retirer.addEventListener("click", () => {
    if (!confirme) {
      confirme = true;
      retirer.classList.add("danger");
      retirer.textContent = "Retirer ? Les objets posés perdront leur modèle";
      return;
    }
    actions.retirer();
  });
  const rearmer = () => {
    confirme = false;
    retirer.classList.remove("danger");
    retirer.textContent = "Retirer de la bibliothèque";
  };

  const bandeau = creer("section", { classe: "bandeau-modele", attributs: { hidden: "", "aria-label": "Édition d'un objet paramétrique" } }, [
    creer("header", { classe: "tete-operation" }, [icone("bibliotheque"), creer("span", { classe: "terme", texte: "Objet paramétrique" }), titre]),
    creer("p", { classe: "consigne-operation", texte: "Les variables de cette scène deviennent les paramètres de l'objet ; leurs bornes s'appliquent aux objets posés. Le nom se change en haut, comme celui d'un projet." }),
    description,
    problemes,
    creer("footer", { classe: "pied-operation" }, [retirer, abandonner, enregistrer]),
  ]);
  vue.append(bandeau);

  return {
    /* session : { id, description } ou null ; nom : celui du document en édition ;
       enEsquisse : le cartouche de l'esquisse prend sa place, le bandeau s'efface. */
    afficher(session, nom, enEsquisse = false) {
      if (bandeau.hidden !== (session === null)) rearmer();
      bandeau.hidden = session === null || enEsquisse;
      document.body.classList.toggle("edition-de-modele", session !== null);
      if (session === null) {
        problemes.hidden = true;
        problemes.replaceChildren();
        return;
      }
      titre.textContent = nom;
      retirer.hidden = session.id === null;
      if (document.activeElement !== description) description.value = session.description ?? "";
    },
  };
}
