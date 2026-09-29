/*
 * outils/esquisse/saisie_au_clavier.js
 * ────────────────────────────────────
 * Pendant un tracé, les chiffres tapés au clavier deviennent des cotes : on
 * tape « 25 », Tab, « 30 », Entrée, et le trait fait 25 mm à 30°. La souris
 * donne la direction de ce qu'on n'a pas tapé. Taper une cote enseigne la
 * cotation ; c'est la voie de référence, la souris n'est que l'esquisse.
 */

import { nombre } from "./options_esquisse.js";

const TOUCHES_DE_NOMBRE = /^[0-9.,-]$/;

/* champs : [{ cle, etiquette, unite }] */
export function creerSaisie(champs) {
  let valeurs = {};
  let rang = 0;
  let tampon = "";

  function lireTampon() {
    const valeur = Number(tampon.replace(",", "."));
    return tampon !== "" && tampon !== "-" && Number.isFinite(valeur) ? valeur : undefined;
  }

  function retenir() {
    const valeur = lireTampon();
    if (valeur !== undefined) valeurs = { ...valeurs, [champs[rang].cle]: valeur };
    tampon = "";
  }

  return {
    active: () => tampon !== "" || Object.keys(valeurs).length > 0,

    /* La cote tapée pour ce champ, y compris celle qu'on est en train de taper. */
    valeur(cle) {
      if (champs[rang].cle === cle && lireTampon() !== undefined) return lireTampon();
      return valeurs[cle];
    },

    /* mesures : les valeurs données par la souris, pour les champs non tapés. */
    texte(mesures) {
      return champs.map((champ, i) => {
        const enCours = i === rang && tampon !== "";
        const valeur = enCours ? tampon + "▌" : nombre(this.valeur(champ.cle) ?? mesures[champ.cle] ?? 0);
        const tapee = enCours || valeurs[champ.cle] !== undefined;
        return champ.etiquette + (tapee ? " = " : " ") + valeur + " " + champ.unite;
      }).join(" · ") + (champs.length > 1 ? "   (Tab : cote suivante)" : "");
    },

    /* Rend "valider" (Entrée), "pris" (touche utilisée) ou null. */
    touche(evenement) {
      if (evenement.ctrlKey || evenement.metaKey || evenement.altKey) return null;
      if (TOUCHES_DE_NOMBRE.test(evenement.key)) {
        tampon += evenement.key;
        return "pris";
      }
      if (evenement.key === "Backspace" && tampon !== "") {
        tampon = tampon.slice(0, -1);
        return "pris";
      }
      if (evenement.key === "Tab" && champs.length > 1) {
        retenir();
        rang = (rang + 1) % champs.length;
        return "pris";
      }
      if (evenement.key === "Enter" && this.active()) {
        retenir();
        return "valider";
      }
      if (evenement.key === "Escape" && this.active()) {
        this.vider();
        return "pris";
      }
      return null;
    },

    vider() {
      valeurs = {};
      rang = 0;
      tampon = "";
    },
  };
}
