/*
 * stockage/enregistrement_automatique.js
 * ──────────────────────────────────────
 * L'élève n'enregistre jamais : le logiciel le fait toutes les 30 secondes si
 * le projet a changé, et au moment où l'onglet se ferme ou passe en arrière-plan.
 *
 * « A changé » se lit par identité : le document est immuable, donc une autre
 * référence est un autre contenu. Aucune comparaison coûteuse.
 *
 * États annoncés, pour l'indicateur de la barre haute :
 *   "neuf" | "enregistre" | "a-enregistrer" | "enregistrement" | "erreur"
 */

const INTERVALLE_MS = 30000;

/*
 * sources :
 *   lireDocument()    le document courant
 *   versBrut(doc)     sa forme JSON
 *   vignette()        une image PNG en data URL, ou null
 *   surEtat(etat, message?)   pour l'indicateur et la barre d'état
 *   surIdentifiant(id)        le projet vient d'être créé sur le stockage
 */
export function creerEnregistrementAutomatique(stockage, sources) {
  let projetId = null;
  let dernierEnregistre = null;
  let enCours = null;
  let aRefaire = false;

  function etatCourant() {
    if (sources.lireDocument() !== dernierEnregistre) return "a-enregistrer";
    return projetId === null ? "neuf" : "enregistre";
  }

  async function enregistrer(auFermer = false) {
    const projet = sources.lireDocument();
    if (projet === dernierEnregistre) return;

    // Un enregistrement à la fois : le suivant repartira du document le plus récent.
    if (enCours !== null) {
      aRefaire = true;
      return enCours;
    }

    sources.surEtat("enregistrement");
    const brut = sources.versBrut(projet);
    const vignette = auFermer ? null : sources.vignette();

    enCours = (async () => {
      try {
        if (projetId === null) {
          const cree = await stockage.creer(projet.nom, brut, vignette);
          projetId = cree.id;
          sources.surIdentifiant(projetId);
        } else {
          await stockage.enregistrer(projetId, projet.nom, brut, vignette, auFermer);
        }
        dernierEnregistre = projet;
        sources.surEtat(etatCourant());
      } catch (erreur) {
        sources.surEtat("erreur", erreur.message);
      } finally {
        enCours = null;
      }
    })();

    await enCours;
    if (aRefaire) {
      aRefaire = false;
      await enregistrer();
    }
  }

  const minuterie = setInterval(() => enregistrer(), INTERVALLE_MS);

  const surVisibilite = () => {
    if (document.visibilityState === "hidden") enregistrer(true);
  };
  document.addEventListener("visibilitychange", surVisibilite);
  globalThis.addEventListener("pagehide", surVisibilite);

  return {
    enregistrerMaintenant: () => enregistrer(),

    /* Un projet ouvert depuis le stockage est, par définition, déjà enregistré. */
    suivreProjet(id, documentOuvert) {
      projetId = id;
      dernierEnregistre = documentOuvert;
      sources.surEtat(etatCourant());
    },

    /* À appeler après chaque changement du document : l'indicateur passe à
       « non enregistré » sans attendre la prochaine échéance. */
    signalerChangement() {
      if (enCours === null) sources.surEtat(etatCourant());
    },

    projetCourant: () => projetId,

    arreter() {
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", surVisibilite);
      globalThis.removeEventListener("pagehide", surVisibilite);
    },
  };
}
