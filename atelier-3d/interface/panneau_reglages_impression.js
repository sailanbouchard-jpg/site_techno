/*
 * interface/panneau_reglages_impression.js
 * ────────────────────────────────────────
 * Les réglages du tranchage, sous la liste du plateau : les cinq préréglages en
 * tête, dans l'ordre où on les choisit (imprimante, buse, plaque, matériau,
 * réglages d'impression), puis les onglets (Qualité, Résistance…), un mode
 * Simple / Avancé et une recherche par nom.
 *
 * La buse commande les trois derniers : changer de diamètre change la liste des
 * plaques, des matériaux et des réglages proposés. Un diamètre qu'on n'a pas
 * encore rempli n'en propose aucun, et le panneau le dit plutôt que de laisser
 * croire qu'un préréglage d'une autre buse ferait l'affaire.
 *
 * Un réglage qui diffère du préréglage est marqué, avec un bouton pour lui
 * rendre la valeur du préréglage ; le nom du préréglage affiche alors
 * « (modifié) ». Changer de préréglage avec des modifications en cours
 * demande s'il faut les garder.
 *
 * Tout vient du catalogue (noyau/reglages_impression.js) : un réglage ajouté
 * là apparaît ici sans autre code.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";
import {
  ONGLETS, REGLAGES, SOURCES, listeDesPrereglages, dependDeLaBuse,
  valeurDuPrereglage, valeursEffectives, ecartsDeLaSource,
} from "../noyau/reglages_impression.js";

const CLE_MODE = "atelier-3d:reglages-avances";

function lireMode() {
  try {
    return localStorage.getItem(CLE_MODE) === "oui";
  } catch (_erreur) {
    return false;
  }
}

function ecrireMode(avance) {
  try {
    localStorage.setItem(CLE_MODE, avance ? "oui" : "non");
  } catch (_erreur) {
    // Stockage refusé : le mode vaut pour la séance.
  }
}

const texteDeValeur = (r, v) => (r.choix ? r.choix.find((c) => c.valeur === v)?.etiquette ?? String(v)
  : v.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) + (r.unite ? " " + r.unite : ""));

/*
 * actions : { regler(cle, valeur), retablir(cle), changerPrereglage(source, id, garderLesEcarts) }
 * options.verrouillage(reglage) → null, ou { raison } : le réglage est montré mais
 *   pas éditable, avec la raison en bulle. L'espace de calibration s'en sert pour
 *   geler ce qu'un essai décide et ce que la combinaison a fixé.
 * options.sansPrereglages : cache les listes de préréglages (la combinaison les tient).
 */
export function creerPanneauReglagesImpression(conteneur, actions, options = {}) {
  const verrouillage = options.verrouillage ?? (() => null);
  let onglet = ONGLETS[0].id;
  let avance = lireMode();
  let recherche = "";
  let impression = null;

  // ── Les cinq préréglages, dans l'ordre où on les choisit ──
  /* Une ligne de préréglage : son nom, la liste, « (modifié) », et le retour aux valeurs du préréglage. */
  function lignePrereglage(source, etiquette, aide) {
    const choix = creer("select", { classe: "champ-texte", aide, attributs: { "aria-label": etiquette } });
    const modifie = creer("span", { classe: "marque-modifie", texte: "(modifié)" });
    const retablir = bouton({
      icone: "annuler", classe: "plat",
      aide: { nom: "Revenir au préréglage", texte: "Abandonne les modifications de ces réglages et reprend les valeurs du préréglage." },
      surClic: () => actions.changerPrereglage(source, impression[source], false),
    });
    const vide = creer("span", { classe: "note-prereglage" });
    const question = creer("div", { classe: "question-prereglage", attributs: { hidden: "" } });
    choix.addEventListener("change", () => {
      const id = choix.value;
      if (Object.keys(ecartsDeLaSource(impression.ecarts, source)).length === 0) {
        actions.changerPrereglage(source, id, false);
        return;
      }
      // Des modifications en cours : on demande ce qu'elles deviennent.
      question.replaceChildren(
        creer("span", { texte: "Garder les modifications en cours ?" }),
        bouton({ texte: "Garder", surClic: () => { question.hidden = true; actions.changerPrereglage(source, id, true); } }),
        bouton({ texte: "Abandonner", surClic: () => { question.hidden = true; actions.changerPrereglage(source, id, false); } }),
        bouton({ texte: "Annuler", classe: "plat", surClic: () => { question.hidden = true; choix.value = impression[source]; } }),
      );
      question.hidden = false;
    });
    const element = creer("div", { classe: "bloc-prereglage" }, [
      creer("span", { classe: "libelle-prereglage", texte: etiquette }),
      creer("div", { classe: "ligne-prereglage" }, [choix, modifie, retablir]),
      vide,
      question,
    ]);
    return {
      element,
      mettreAJour() {
        // La liste dépend de la buse choisie, et un préréglage personnel vient
        // peut-être d'être exporté : on la redresse à chaque fois.
        const attendus = listeDesPrereglages(source, dependDeLaBuse(source) ? impression.buse : null);
        const memes = choix.options.length === attendus.length
          && attendus.every((p, i) => choix.options[i].value === p.id && choix.options[i].textContent === p.nom);
        if (!memes) {
          choix.replaceChildren(...attendus.map((p) => creer("option", { texte: p.nom, attributs: { value: p.id } })));
        }
        if (choix.value !== impression[source] && question.hidden) choix.value = impression[source] ?? "";
        vide.textContent = attendus.length === 0
          ? "Aucun préréglage pour cette buse : en calibrer un dans l'onglet Calibration."
          : "";
        vide.hidden = attendus.length > 0;
        choix.hidden = attendus.length === 0;
        modifie.hidden = Object.keys(ecartsDeLaSource(impression.ecarts, source)).length === 0;
        retablir.hidden = modifie.hidden;
      },
    };
  }
  const prereglages = options.sansPrereglages ? []
    : SOURCES.map(({ id, etiquette, aide }) => lignePrereglage(id, etiquette, { nom: etiquette, texte: aide }));

  // ── Onglets, mode, recherche ──
  const boutonsOnglets = new Map(ONGLETS.map((o) => {
    const b = creer("button", { classe: "onglet-reglages", texte: o.etiquette, attributs: { type: "button", role: "tab" } });
    b.addEventListener("click", () => {
      onglet = o.id;
      dessiner();
    });
    return [o.id, b];
  }));
  const caseAvance = creer("input", { attributs: { type: "checkbox" } });
  caseAvance.checked = avance;
  caseAvance.addEventListener("change", () => {
    avance = caseAvance.checked;
    ecrireMode(avance);
    dessiner();
  });
  const champRecherche = creer("input", {
    classe: "champ-texte recherche-reglage",
    attributs: { type: "search", placeholder: "Rechercher un réglage", "aria-label": "Rechercher un réglage", spellcheck: "false" },
  });
  champRecherche.addEventListener("input", () => {
    recherche = champRecherche.value.trim().toLowerCase();
    dessiner();
  });
  champRecherche.addEventListener("keydown", (evenement) => evenement.stopPropagation());

  const corps = creer("div", { classe: "corps-reglages" });
  conteneur.append(
    creer("div", { classe: "titre-panneau" }, [icone("variables"), creer("span", { texte: "Réglages d'impression" })]),
    ...prereglages.map((l) => l.element),
    creer("div", { classe: "onglets-reglages", attributs: { role: "tablist" } }, [
      ...boutonsOnglets.values(),
      creer("label", { classe: "mode-avance", aide: { nom: "Mode avancé", texte: "Montre tous les réglages. Sans lui, seulement ceux qu'on change tous les jours." } }, [caseAvance, creer("span", { texte: "Avancé" })]),
    ]),
    champRecherche,
    corps,
  );

  // Les champs gardés d'un dessin à l'autre : une mise à jour ne vole pas le focus.
  const champs = new Map();

  function champDe(r) {
    if (champs.has(r.cle)) return champs.get(r.cle);
    let controle;
    let definir;
    if (r.choix) {
      controle = creer("select", { classe: "champ-texte", attributs: { "aria-label": r.etiquette } },
        r.choix.map((c) => creer("option", { texte: c.etiquette, attributs: { value: c.valeur } })));
      controle.addEventListener("change", () => actions.regler(r.cle, controle.value));
      definir = (v) => { controle.value = v; };
    } else {
      const champ = creerChampNumerique({
        etiquette: "", titre: r.etiquette, unite: r.unite, min: r.min, max: r.max, entier: r.entier,
        decimales: r.entier || r.unite !== "mm" ? 0 : 2, valeursUsuelles: r.valeursUsuelles,
        surValider: (v) => actions.regler(r.cle, v),
      });
      controle = champ.element;
      definir = (v) => champ.definirValeur(v);
    }
    const retablir = bouton({
      icone: "annuler", classe: "plat retablir-reglage",
      surClic: () => actions.retablir(r.cle),
    });
    const libelle = creer("span", { classe: "libelle", texte: r.etiquette });
    // La valeur figée, à la place du champ, quand l'essai ou la combinaison la tient.
    const fige = creer("span", { classe: "valeur-figee" });
    const ligne = creer("div", { classe: "rangee rangee-reglage" }, [libelle, controle, fige, retablir]);
    const entree = { ligne, definir, retablir, libelle, controle, fige };
    champs.set(r.cle, entree);
    return entree;
  }

  /* Déplacer un champ qui a le focus le fait valider (blur), ce qui met le
     panneau à jour pendant qu'on le dessine : ce second dessin attend la fin du premier. */
  let enDessin = false;
  let aRedessiner = false;
  function dessiner() {
    if (enDessin) {
      aRedessiner = true;
      return;
    }
    enDessin = true;
    try {
      dessinerMaintenant();
    } finally {
      enDessin = false;
    }
    if (aRedessiner) {
      aRedessiner = false;
      dessiner();
    }
  }

  function dessinerMaintenant() {
    if (impression === null) return;
    for (const [id, b] of boutonsOnglets) {
      b.classList.toggle("actif", id === onglet && recherche === "");
      b.setAttribute("aria-selected", String(id === onglet));
    }
    const valeurs = valeursEffectives(impression);
    const retenus = REGLAGES.filter((r) => (recherche !== ""
      ? [r.etiquette, r.groupe, r.orca, r.aide].some((t) => t.toLowerCase().includes(recherche))
      : r.onglet === onglet && (avance || r.niveau === "simple")));

    const blocs = [];
    let groupe = null;
    let bloc = null;
    for (const r of retenus) {
      if (r.groupe !== groupe) {
        groupe = r.groupe;
        bloc = creer("section", { classe: "bloc-inspecteur" }, [creer("div", { classe: "titre-bloc", texte: r.groupe })]);
        blocs.push(bloc);
      }
      const entree = champDe(r);
      const ecart = r.cle in impression.ecarts;
      const duPrereglage = valeurDuPrereglage(impression, r.cle);
      entree.definir(valeurs[r.cle]);
      const verrou = verrouillage(r);
      entree.controle.hidden = verrou !== null;
      entree.fige.hidden = verrou === null;
      entree.ligne.classList.toggle("verrouille", verrou !== null);
      entree.ligne.dataset.role = r.role ?? "fixe";
      if (verrou !== null) {
        entree.fige.textContent = texteDeValeur(r, valeurs[r.cle]);
        entree.fige.title = verrou.raison;
      }
      entree.ligne.classList.toggle("modifie", ecart);
      entree.retablir.hidden = !ecart || verrou !== null;
      entree.retablir.title = "Revenir à la valeur du préréglage : " + texteDeValeur(r, duPrereglage);
      // L'aide du réglage, avec son nom dans OrcaSlicer pour retrouver la référence.
      entree.libelle.title = r.aide + (r.orca ? " (OrcaSlicer : " + r.orca + ")" : "");
      bloc.append(entree.ligne);
    }
    corps.replaceChildren(...blocs);
    if (blocs.length === 0) corps.append(creer("div", { classe: "inspecteur-vide", texte: "Aucun réglage ne correspond." }));
  }

  return {
    mettreAJour(nouvelle) {
      impression = nouvelle;
      for (const ligne of prereglages) ligne.mettreAJour();
      dessiner();
    },
  };
}
