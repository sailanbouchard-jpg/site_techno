/*
 * interface/panneau_diagnostic.js
 * ───────────────────────────────
 * Ce que l'impression réserve, dit avant de lancer : matière posée dans le
 * vide, ponts, surplombs, parois trop fines, pièce mal appuyée sur le plateau.
 * Chaque constat se montre dans l'aperçu d'un clic : on voit où c'est.
 *
 * Le panneau ne calcule rien : il affiche ce que rend
 * tranchage/diagnostic_impression.js.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";

const ICONES = { alerte: "attention", avis: "attention" };

/* actions : { montrer(types) — n'afficher que ces types de ligne dans l'aperçu ;
               analyser() — ouvre l'aperçu tranché, d'où vient le diagnostic. } */
export function creerPanneauDiagnostic(conteneur, actions) {
  const liste = creer("div", { classe: "liste-diagnostic" });
  const entete = creer("div", { classe: "titre-panneau" }, [icone("analyse"), creer("span", { texte: "Avant d'imprimer" })]);
  conteneur.append(entete, liste);
  let isole = null;

  function dessiner(constats, enCours, etatGeneral) {
    if (etatGeneral === "sansApercu") {
      liste.replaceChildren(
        creer("p", { classe: "inspecteur-vide", texte: "Le diagnostic se lit dans le tranchage : ouvrir l'aperçu tranché." }),
        bouton({ icone: "couches", texte: "Analyser la pièce", titre: "Ouvre l'aperçu tranché et examine l'impression à venir.", surClic: () => actions.analyser() }),
      );
      return;
    }
    if (etatGeneral === "vide") {
      liste.replaceChildren(creer("p", { classe: "inspecteur-vide", texte: "Aucune pièce sur le plateau." }));
      return;
    }
    if (enCours) {
      liste.replaceChildren(creer("p", { classe: "inspecteur-vide", texte: "Tranchage en cours…" }));
      return;
    }
    if (constats.length === 0) {
      liste.replaceChildren(creer("p", { classe: "diagnostic-bon" }, [icone("valider"), creer("span", { texte: "Rien à signaler : la pièce s'imprime telle quelle." })]));
      return;
    }
    liste.replaceChildren(...constats.map((constat) => {
      const montrer = bouton({
        icone: "vue",
        texte: isole === constat.genre ? "Tout afficher" : "Montrer",
        titre: "N'affiche que les lignes concernées dans l'aperçu des couches.",
        surClic: () => {
          isole = isole === constat.genre ? null : constat.genre;
          actions.montrer(isole === null ? [] : constat.types);
          dessiner(constats, false, "pret");
        },
      });
      return creer("div", { classe: "constat " + constat.gravite }, [
        creer("div", { classe: "tete-constat" }, [
          icone(ICONES[constat.gravite] ?? "attention"),
          creer("span", { classe: "titre-constat", texte: constat.titre }),
          montrer,
        ]),
        creer("p", { classe: "detail-constat", texte: constat.detail }),
      ]);
    }));
  }

  return {
    /* constats : voir diagnostiquer() ; enCours : le tranchage n'est pas fini ;
       etatGeneral : "pret" | "sansApercu" | "vide". */
    mettreAJour(constats, enCours, etatGeneral = "pret") {
      dessiner(constats, enCours, etatGeneral);
    },
  };
}
