/*
 * interface/menu_bibliotheque.js
 * ──────────────────────────────
 * Le menu du bouton « Objets » du ruban : les objets paramétriques de la
 * bibliothèque (un clic en pose un dans le projet) et, pour l'administrateur,
 * la création d'un nouvel objet et la modification d'un modèle existant.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";

/*
 * actions : { modeles() → [{ id, nom, description }], ecriturePermise(), enSession(),
 *             poser(id), modifier(id), nouveau() }
 */
export function creerMenuBibliotheque(actions) {
  let menu = null;

  function fermer() {
    if (menu === null) return;
    menu.remove();
    menu = null;
    document.removeEventListener("pointerdown", surClicAilleurs, true);
    document.removeEventListener("keydown", surEchap, true);
  }

  function surClicAilleurs(evenement) {
    if (menu !== null && !menu.contains(evenement.target) && !menu.ancre.contains(evenement.target)) fermer();
  }

  function surEchap(evenement) {
    if (evenement.key === "Escape") {
      evenement.stopPropagation();
      fermer();
    }
  }

  function ligne(modele) {
    const details = creer("div", { classe: "details" }, [
      creer("div", { classe: "nom", texte: modele.nom }),
      modele.description ? creer("div", { classe: "terme description-modele", texte: modele.description }) : null,
    ]);
    const entree = creer("div", { classe: "menu-entree entree-modele", attributs: { role: "menuitem" } }, [icone("bibliotheque"), details]);
    // On modifie rarement un modèle : un petit bouton, visible au survol de la ligne.
    if (actions.ecriturePermise()) {
      const modifier = bouton({ icone: "esquisse", classe: "plat modifier-modele", titre: "Modifier ce modèle (tous les objets qui en sont tirés suivront)" });
      modifier.disabled = actions.enSession();
      modifier.addEventListener("click", (evenement) => {
        evenement.stopPropagation();
        fermer();
        actions.modifier(modele.id);
      });
      entree.append(modifier);
    }
    entree.title = "Poser « " + modele.nom + " » dans la scène";
    entree.addEventListener("click", () => {
      fermer();
      actions.poser(modele.id);
    });
    return entree;
  }

  return {
    basculer(ancre) {
      if (menu !== null) {
        fermer();
        return;
      }
      const cadre = ancre.getBoundingClientRect();
      menu = creer("div", { classe: "menu menu-bibliotheque", attributs: { role: "menu" } }, [
        creer("div", { classe: "menu-titre", texte: "Objets paramétriques de la bibliothèque" }),
      ]);
      menu.ancre = ancre;
      menu.style.left = Math.max(4, cadre.left) + "px";
      menu.style.top = cadre.bottom + 2 + "px";

      const modeles = actions.modeles();
      if (modeles.length === 0) menu.append(creer("div", { classe: "menu-vide", texte: "La bibliothèque est vide pour l'instant." }));
      for (const modele of modeles) menu.append(ligne(modele));

      if (actions.ecriturePermise()) {
        const nouveau = creer("div", { classe: "menu-entree separee" }, [icone("plus"), creer("span", { texte: "Nouvel objet paramétrique…" })]);
        nouveau.title = "Ouvre une scène vide : l'objet s'y construit, ses variables deviennent ses paramètres.";
        if (actions.enSession()) nouveau.classList.add("inactive");
        nouveau.addEventListener("click", () => {
          fermer();
          actions.nouveau();
        });
        menu.append(nouveau);
      } else {
        menu.append(creer("div", { classe: "menu-vide separee", texte: "Créer ou modifier un objet est réservé à l'administrateur du site." }));
      }
      document.body.append(menu);
      // Le bouton est au bout du ruban : le menu ne doit pas sortir de l'écran.
      const largeur = menu.getBoundingClientRect().width;
      menu.style.left = Math.max(4, Math.min(cadre.left, globalThis.innerWidth - largeur - 4)) + "px";
      document.addEventListener("pointerdown", surClicAilleurs, true);
      document.addEventListener("keydown", surEchap, true);
    },

    fermer,
  };
}
