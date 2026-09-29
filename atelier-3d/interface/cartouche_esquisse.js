/*
 * interface/cartouche_esquisse.js
 * ───────────────────────────────
 * Pendant une esquisse, un cartouche en haut de la vue rappelle où l'on
 * dessine et porte le bouton « Valider l'esquisse » : c'est la seule façon
 * d'en sortir, il doit toujours se voir, même sur une vue étroite.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";

/* surValider() : appelé au clic sur « Valider l'esquisse ». */
export function creerCartoucheEsquisse(vue, surValider) {
  const titre = creer("span", { classe: "titre-operation" });
  const liberte = creer("p", { classe: "liberte-esquisse", attributs: { "aria-live": "polite" } });
  const cartouche = creer("section", { classe: "fenetre-operation cartouche-esquisse", attributs: { "aria-label": "Esquisse en cours" } }, [
    creer("header", { classe: "tete-operation" }, [icone("esquisse"), titre]),
    creer("p", {
      classe: "consigne-operation",
      texte: "Outils de tracé dans le bandeau au-dessus de la vue. Échap : outil Sélection.",
    }),
    liberte,
    creer("footer", { classe: "pied-operation" }, [
      bouton({ icone: "valider", texte: "Valider l'esquisse", classe: "grand principal", aide: { nom: "Valider l'esquisse", texte: "Ferme l'esquisse et revient à la vue 3D. Elle reste modifiable par double-clic." }, surClic: surValider }),
    ]),
  ]);
  cartouche.hidden = true;
  vue.append(cartouche);

  return {
    /* nom : le nom de l'esquisse ouverte, ou null s'il n'y en a pas ;
       libertes : ses degrés de liberté, ou null si elle est vide. */
    afficher(nom, libertes = null) {
      cartouche.hidden = nom === null;
      if (nom === null) return;
      titre.textContent = nom;
      liberte.hidden = libertes === null;
      liberte.classList.toggle("complete", libertes === 0);
      liberte.textContent = libertes === 0 ? "Esquisse entièrement contrainte"
        : libertes + (libertes > 1 ? " degrés de liberté restants" : " degré de liberté restant");
    },
  };
}
