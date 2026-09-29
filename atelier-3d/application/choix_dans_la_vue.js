/*
 * application/choix_dans_la_vue.js
 * ────────────────────────────────
 * Certaines actions attendent que l'élève désigne quelque chose dans la vue :
 * le plan d'une esquisse, la face où coller un texte. Pendant ce temps, les
 * clics vont au choix et pas à l'outil ; Échap renonce.
 */

/*
 * choix : { survol(evenement), appui(evenement) → true si le choix est fait,
 *           arreter(), message }
 * message null : la consigne est affichée ailleurs (dans la fenêtre d'opération).
 */
export function creerChoixDansLaVue(annoncer) {
  let enCours = null;

  function arreter() {
    const choix = enCours;
    enCours = null;
    choix?.arreter();
  }

  return {
    demarrer(choix) {
      arreter();
      enCours = choix;
      if (choix.message) annoncer(choix.message);
    },

    arreter,

    enCours: () => enCours !== null,

    /* genre : "survol" | "appui". Rend true si le geste a servi : un appui
       qui ne désigne rien rend false, et la vue peut glisser. */
    geste(genre, evenement) {
      if (enCours === null) return false;
      if (genre === "survol") enCours.survol(evenement);
      if (genre !== "appui" || evenement.button !== 0) return true;
      const choix = enCours;
      const fait = choix.appui(evenement);
      if (fait && enCours === choix) arreter();
      return fait;
    },

    touche(evenement) {
      if (enCours === null || evenement.key !== "Escape") return false;
      arreter();
      annoncer("Choix abandonné.");
      return true;
    },
  };
}
