/*
 * interface/liste_des_coupes.js
 * ─────────────────────────────
 * Sous le cube d'orientation : les vues en coupe du projet. « Coupe » en crée
 * une ; chaque vue s'active d'un clic et se quitte d'un autre. La vue active
 * porte deux petits boutons : la régler, la supprimer.
 */

import { creer, bouton } from "./elements.js";
import { nomCourtDeLaCoupe, descriptionDeLaCoupe } from "../noyau/vues_en_coupe.js";

/* actions : { creer(), basculer(id), regler(id), supprimer(id) } */
export function creerListeDesCoupes(conteneur, actions) {
  const ajouter = bouton({
    icone: "coupe", texte: "Coupe",
    aide: {
      nom: "Nouvelle vue en coupe",
      texte: "Coupe les pièces par un plan choisi, pour voir et travailler à l'intérieur. La vue créée se range ici, sous le cube.",
    },
    surClic: () => actions.creer(),
  });
  const liste = creer("div", { classe: "liste-des-coupes" });
  conteneur.append(ajouter, liste);
  let affiche = null;

  function entree(coupe, active) {
    const principal = bouton({
      texte: nomCourtDeLaCoupe(coupe),
      classe: "vue-en-coupe" + (active ? " actif" : ""),
      aide: { nom: active ? "Vue en coupe active" : "Vue en coupe", texte: descriptionDeLaCoupe(coupe) + (active ? " Cliquer pour la quitter." : " Cliquer pour l'activer.") },
      surClic: () => actions.basculer(coupe.id),
    });
    principal.setAttribute("aria-pressed", String(active));
    if (!active) return principal;
    return creer("div", { classe: "coupe-active" }, [
      principal,
      bouton({ icone: "esquisse", classe: "plat", aide: { nom: "Régler la coupe", texte: "Changer le plan, le décalage ou le côté vu." }, surClic: () => actions.regler(coupe.id) }),
      bouton({ icone: "supprimer", classe: "plat", aide: { nom: "Supprimer la vue en coupe", texte: "Retire cette vue du projet. Ctrl+Z la rend." }, surClic: () => actions.supprimer(coupe.id) }),
    ]);
  }

  return {
    /* autorise : faux pendant une opération, où rien d'autre ne doit se lancer. */
    mettreAJour(coupes, active, autorise) {
      // Reconstruite seulement quand elle change : une bulle d'aide ouverte ne clignote pas.
      const cle = JSON.stringify([coupes, active, autorise]);
      if (cle === affiche) return;
      affiche = cle;
      ajouter.disabled = !autorise;
      liste.replaceChildren(...coupes.map((c) => entree(c, c.id === active)));
      for (const b of liste.querySelectorAll("button")) b.disabled = !autorise;
    },
  };
}
