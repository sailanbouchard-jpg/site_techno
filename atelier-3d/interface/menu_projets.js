/*
 * interface/menu_projets.js
 * ─────────────────────────
 * La liste des projets de l'élève, sous le nom du projet. Ouvrir, créer,
 * supprimer. La suppression demande une confirmation dans la ligne même —
 * jamais de boîte de dialogue.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";

function dateLisible(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return "modifié le " + date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) +
    " à " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/*
 * actions : { lister(), ouvrir(id), nouveau(), supprimer(id), projetCourant(), surLeSite }
 */
export function creerMenuProjets(actions) {
  let menu = null;

  function fermer() {
    if (menu === null) return;
    menu.remove();
    menu = null;
    document.removeEventListener("pointerdown", surClicAilleurs, true);
    document.removeEventListener("keydown", surEchap, true);
  }

  function surClicAilleurs(evenement) {
    if (menu !== null && !menu.contains(evenement.target)) fermer();
  }

  function surEchap(evenement) {
    if (evenement.key === "Escape") {
      evenement.stopPropagation();
      fermer();
    }
  }

  function ligne(projet) {
    const vignette = projet.vignette_png
      ? creer("img", { classe: "vignette", attributs: { src: projet.vignette_png, alt: "" } })
      : creer("span", { classe: "vignette" });
    const details = creer("div", { classe: "details" }, [
      creer("div", { classe: "nom", texte: projet.nom }),
      creer("span", { classe: "terme", texte: dateLisible(projet.modifie_le) }),
    ]);

    const supprimer = bouton({ icone: "supprimer", classe: "plat", titre: "Supprimer ce projet" });
    let confirme = false;
    supprimer.addEventListener("click", async (evenement) => {
      evenement.stopPropagation();
      if (!confirme) {
        confirme = true;
        supprimer.classList.add("danger");
        supprimer.replaceChildren(creer("span", { texte: "Supprimer ?" }));
        supprimer.title = "Cliquer encore pour supprimer définitivement";
        return;
      }
      await actions.supprimer(projet.id);
      entree.remove();
    });

    const entree = creer("div", { classe: "menu-entree", attributs: { role: "menuitem" } }, [vignette, details, supprimer]);
    if (projet.id === actions.projetCourant()) entree.classList.add("courante");
    entree.addEventListener("click", () => {
      fermer();
      if (projet.id !== actions.projetCourant()) actions.ouvrir(projet.id);
    });
    return entree;
  }

  return {
    async ouvrir(ancre) {
      if (menu !== null) {
        fermer();
        return;
      }
      const cadre = ancre.getBoundingClientRect();
      menu = creer("div", { classe: "menu", attributs: { role: "menu" } }, [
        creer("div", { classe: "menu-titre", texte: actions.surLeSite ? "Mes projets, enregistrés sur le site" : "Projets de ce navigateur" }),
      ]);
      menu.style.left = Math.max(4, cadre.left - 170) + "px";
      menu.style.top = cadre.bottom + 2 + "px";

      const nouveau = creer("div", { classe: "menu-entree" }, [icone("plus"), creer("span", { texte: "Nouveau projet" })]);
      nouveau.addEventListener("click", () => {
        fermer();
        actions.nouveau();
      });
      menu.append(nouveau);
      document.body.append(menu);
      document.addEventListener("pointerdown", surClicAilleurs, true);
      document.addEventListener("keydown", surEchap, true);

      try {
        const projets = await actions.lister();
        if (menu === null) return;
        if (projets.length === 0) menu.append(creer("div", { classe: "menu-vide", texte: "Aucun projet enregistré pour l'instant." }));
        for (const projet of projets) menu.append(ligne(projet));
      } catch (erreur) {
        if (menu !== null) menu.append(creer("div", { classe: "menu-vide", texte: erreur.message }));
      }
    },

    fermer,
  };
}
