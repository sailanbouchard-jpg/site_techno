/*
 * stockage/prereglages_du_site.js
 * ───────────────────────────────
 * Les préréglages d'impression sont ceux DU SITE, et il n'y en a pas d'autres.
 *
 * Le logiciel en livre un jeu dans son code (noyau/reglages_impression.js) ;
 * ce que l'administrateur en change va dans la base de données, et tout le
 * monde lit la même chose. Rien, jamais, dans le navigateur : un réglage rangé
 * dans localStorage finit par masquer celui du logiciel sans que rien ne le
 * dise — on croit lire le profil livré, on lit une vieille copie du poste, et
 * une mise à jour du logiciel n'y change rien. C'est ce qui est arrivé, et
 * c'est pourquoi le stockage par poste a été retiré.
 *
 * Lecture libre (un élève doit pouvoir imprimer), écriture réservée à
 * l'administrateur, comme la bibliothèque d'objets et le catalogue du
 * simulateur. Le serveur garde le JSON entier et le réécrit en bloc.
 */

import { requeteJson, corpsJson } from "./requetes.js";

const URL_API = "/api/cao/prereglages";
const URL_ADMIN = "/api/admin/me";

// Toujours relire : un préréglage changé par l'administrateur doit l'être pour
// tout le monde au prochain chargement de page.
const FRAIS = { cache: "no-store" };

export function creerStockageDesPrereglages() {
  return {
    /*
     * Ce que l'administrateur a changé, par source. Rend un objet vide si la
     * base n'a rien — le logiciel garde alors ses propres valeurs — et aussi si
     * le site ne répond pas : l'atelier doit marcher sans lui (serveur statique,
     * poste hors réseau), avec les préréglages livrés.
     */
    async charger() {
      try {
        const reponse = await requeteJson(URL_API, FRAIS);
        return reponse.prereglages ?? {};
      } catch (_erreur) {
        return {};
      }
    },

    /* Seul l'administrateur du site modifie un préréglage : il vaut pour tous. */
    async peutEcrire() {
      try {
        const reponse = await fetch(URL_ADMIN, { credentials: "same-origin" });
        return reponse.ok && (await reponse.json()).admin === true;
      } catch (_erreur) {
        return false;
      }
    },

    async enregistrer(parSource) {
      await requeteJson(URL_API, corpsJson("PUT", { prereglages: parSource }));
    },
  };
}
