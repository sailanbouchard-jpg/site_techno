/*
 * interface/bandeau_outil.js
 * ──────────────────────────
 * Une seule ligne, contextuelle : les outils de la famille active (modes de
 * déplacement, ou outils de tracé quand une esquisse est ouverte), puis les
 * réglages de l'outil choisi, chacun avec son libellé visible. Les réglages
 * sont construits depuis optionsBandeau : aucun code propre à un outil ici.
 * Le mot du programme et l'explication de chaque outil sont dans sa bulle.
 */

import { creer, bouton, separateur } from "./elements.js";
import { creerChampNumerique } from "./champ_numerique.js";
import { aider } from "./bulle_d_aide.js";

/*
 * familles : { nom: { etiquette, outils } } ;
 * actions : { choisir(nom), regler(cle, valeur) }
 * (« Valider l'esquisse » est dans le cartouche de la vue, toujours visible.)
 */
const TITRES_DE_GROUPE = { modification: "Modifier", contrainte: "Contraindre" };

export function creerBandeauOutil(conteneur, familles, actions) {
  const etiquette = creer("span", { classe: "etiquette-bandeau" });
  const segments = creer("div", { classe: "segments", attributs: { role: "radiogroup" } });
  const zoneOptions = creer("div", { classe: "options-outil" });
  conteneur.append(etiquette, segments, separateur(), zoneOptions);

  const boutons = new Map();
  const champs = new Map();
  let familleAffichee = null;
  let outilAffiche = null;

  function construireSegments(nomFamille) {
    const famille = familles[nomFamille];
    etiquette.textContent = famille.etiquette;
    segments.setAttribute("aria-label", famille.etiquette);
    segments.replaceChildren();
    boutons.clear();
    let groupe = null;
    for (const outil of famille.outils) {
      // Dessiner, modifier, contraindre : trois familles, séparées comme dans le ruban.
      if ((outil.groupe ?? null) !== groupe) {
        groupe = outil.groupe ?? null;
        const titre = TITRES_DE_GROUPE[groupe];
        if (titre !== undefined) segments.append(separateur(), creer("span", { classe: "etiquette-bandeau", texte: titre }));
      }
      const b = bouton({
        icone: outil.nom,
        texte: outil.etiquette,
        aide: { nom: outil.etiquette, terme: outil.termeDuProgramme, raccourci: outil.raccourci, texte: outil.aide },
        surClic: () => actions.choisir(outil.nom),
      });
      b.setAttribute("role", "radio");
      boutons.set(outil.nom, b);
      segments.append(b);
    }
    conteneur.classList.toggle("en-esquisse", nomFamille === "esquisse");
  }

  function construireOptions(outil, valeurs) {
    zoneOptions.replaceChildren();
    champs.clear();
    for (const option of outil.optionsBandeau) {
      if (option.type === "texte") {
        zoneOptions.append(creer("span", { classe: "aide", texte: option.etiquette }));
      } else if (option.type === "choix") {
        const liste = creer("select", { classe: "choix-bandeau" }, option.choix.map((c) => creer("option", { texte: c.etiquette, attributs: { value: String(c.valeur) } })));
        // La liste rend du texte : on retrouve la valeur d'origine, nombre compris.
        liste.addEventListener("change", () => actions.regler(option.cle, option.choix.find((c) => String(c.valeur) === liste.value).valeur));
        // Une valeur enregistrée hors de la liste (un ancien pas de 1,1 mm) retombe sur le défaut.
        const definirValeur = (v) => {
          liste.value = String(v);
          if (liste.selectedIndex === -1) {
            liste.value = String(option.defaut);
            // Après la construction du bandeau : le réglage le reconstruit.
            queueMicrotask(() => actions.regler(option.cle, option.defaut));
          }
        };
        definirValeur(valeurs[option.cle]);
        const aide = option.aide ? { nom: option.etiquette, texte: option.aide } : undefined;
        zoneOptions.append(creer("label", { classe: "option-choix", aide }, [option.etiquette, liste]));
        champs.set(option.cle, { definirValeur });
      } else if (option.type === "case") {
        const caseACocher = creer("input", { attributs: { type: "checkbox" } });
        caseACocher.checked = valeurs[option.cle];
        caseACocher.addEventListener("change", () => actions.regler(option.cle, caseACocher.checked));
        const aide = option.aide ? { nom: option.etiquette, texte: option.aide } : undefined;
        zoneOptions.append(creer("label", { classe: "case", aide }, [caseACocher, option.etiquette]));
        champs.set(option.cle, { definirValeur: (v) => { caseACocher.checked = v; } });
      } else {
        const champ = creerChampNumerique({
          etiquette: option.etiquette,
          unite: option.unite,
          valeur: valeurs[option.cle],
          min: option.min,
          max: option.max,
          pasFixe: option.pasFixe,
          valeursUsuelles: option.valeursUsuelles,
          entier: option.entier,
          surValider: (v) => actions.regler(option.cle, v),
        });
        champ.element.classList.add("large");
        if (option.aide) {
          aider(champ.element.querySelector(".etiquette"), {
            nom: option.etiquette, texte: option.aide, geste: "Glisser le libellé fait varier la valeur.",
          });
        }
        zoneOptions.append(champ.element);
        champs.set(option.cle, champ);
      }
    }
  }

  return {
    mettreAJour(nomFamille, outil, valeurs) {
      if (nomFamille !== familleAffichee) {
        construireSegments(nomFamille);
        familleAffichee = nomFamille;
      }
      for (const [nom, b] of boutons) {
        b.classList.toggle("actif", nom === outil.nom);
        b.setAttribute("aria-checked", String(nom === outil.nom));
      }
      if (outil !== outilAffiche) {
        construireOptions(outil, valeurs);
        outilAffiche = outil;
        return;
      }
      for (const [cle, champ] of champs) champ.definirValeur(valeurs[cle]);
    },
  };
}
