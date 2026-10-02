/*
 * interface/panneau_reglages_impression.js
 * ────────────────────────────────────────
 * Les réglages du tranchage, sous la liste du plateau. Une seule liste qui
 * descend, en cinq sections — une par profil, dans l'ordre où on les choisit :
 * imprimante, buse, plaque, matériau, réglages d'impression.
 *
 * CHAQUE RÉGLAGE EST SOUS LE PROFIL QUI LE PORTE. La température de la buse est
 * sous Matériau parce qu'elle appartient à la bobine ; le décalage Z est sous
 * Plaque parce qu'il appartient au plateau ; les accélérations sont sous
 * Imprimante parce qu'elles appartiennent à la machine. On voit donc, sans
 * avoir à le chercher, quel profil on est en train de modifier — et, quand on
 * enregistre, ce qui part dans ce profil-là.
 *
 * La buse commande les trois derniers : changer de diamètre change la liste des
 * plaques, des matériaux et des réglages proposés. Un diamètre qu'on n'a pas
 * encore rempli n'en propose aucun, et le panneau le dit plutôt que de laisser
 * croire qu'un profil d'une autre buse ferait l'affaire.
 *
 * Un réglage qui diffère de son profil est marqué, avec un bouton pour lui
 * rendre la valeur du profil ; l'en-tête de la section compte ces écarts.
 *
 * Tout vient du catalogue (noyau/reglages_impression.js) : un réglage ajouté
 * là apparaît ici, sous son profil, sans autre code.
 */

import { creer, bouton } from "./elements.js";
import { icone } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";
import {
  REGLAGES, SOURCES, listeDesPrereglages, dependDeLaBuse,
  valeurDuPrereglage, valeursEffectives, ecartsDeLaSource, prereglage,
  nomDeCopieDisponible, estPrereglageFourni, estPrereglageDuSite,
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
 * actions : { regler(cle, valeur), retablir(cle), changerPrereglage(source, id, garderLesEcarts),
 *             enregistrerPrereglage(source), supprimerPrereglage(source),
 *             renommerPrereglage(source, nom) et dupliquerPrereglage(source, nom),
 *             qui rendent null si c'est fait, sinon la phrase du refus }
 */
export function creerPanneauReglagesImpression(conteneur, actions) {
  let avance = lireMode();
  // Modifier un profil est réservé à l'administrateur : un profil vaut pour TOUT
  // le site, et il n'y en a pas d'autres. Tant qu'on ne sait pas, on n'affiche
  // pas les gestes d'écriture — mieux vaut un bouton qui apparaît qu'un bouton
  // qui refuse.
  let administrateur = false;
  let recherche = "";
  let impression = null;

  // ── Une section : le profil, ses gestes, et SES réglages ──
  /*
   * Enregistrer écrit DANS le profil choisi, sous son nom : c'est le geste
   * courant, et il ne pose aucune question. Seuls Renommer et Dupliquer
   * demandent un nom, parce qu'eux seuls en changent un.
   */
  function sectionDuProfil(source, etiquette, aide) {
    const choix = creer("select", { classe: "champ-texte", aide, attributs: { "aria-label": etiquette } });
    const modifie = creer("span", { classe: "marque-modifie" });
    const vide = creer("span", { classe: "note-prereglage" });
    // Un profil du site qui porte l'identifiant d'un profil FOURNI prend sa
    // place. C'est voulu — l'administrateur l'a changé pour tout le monde —
    // mais il faut le dire : sans cela, on croit lire les valeurs livrées avec
    // le logiciel, et on lit celles du site, qu'aucune mise à jour ne corrige.
    const versionDuSite = creer("span", { classe: "note-prereglage" });
    const question = creer("div", { classe: "question-prereglage", attributs: { hidden: "" } });
    // Les réglages de ce profil, remplis à chaque dessin.
    const corps = creer("div", { classe: "reglages-du-profil" });

    // ── Le champ de nom, pour Renommer et Dupliquer ──
    // Un seul champ pour les deux : ce qu'il fera à la validation est dans
    // « geste », posé au moment où on l'ouvre.
    let geste = null;          // { valider(nom) → null, ou la phrase du refus }
    const nom = creer("input", {
      classe: "champ-texte", attributs: { type: "text", maxlength: "60", spellcheck: "false", "aria-label": "Nom du profil" },
    });
    // Le refus se lit SOUS le champ, là où le regard est. Le champ reste
    // ouvert : on corrige et on recommence, sans rien avoir perdu.
    const refus = creer("span", { classe: "refus-prereglage" });
    // Un libellé dès la naissance : « bouton » ne pose son span que si on lui
    // donne un texte, et c'est ce span qu'on réécrit à chaque ouverture.
    const boutonDuGeste = bouton({ texte: "Renommer", surClic: () => validerLeNom() });
    const saisie = creer("div", { classe: "question-prereglage", attributs: { hidden: "" } }, [
      nom,
      boutonDuGeste,
      bouton({ texte: "Annuler", classe: "plat", surClic: () => { saisie.hidden = true; } }),
      refus,
    ]);
    function demanderUnNom(titre, propose, valider) {
      geste = { valider };
      boutonDuGeste.querySelector("span").textContent = titre;
      nom.value = propose;
      refus.textContent = "";
      refus.hidden = true;
      saisie.hidden = false;
      nom.focus();
      nom.select();
    }
    function validerLeNom() {
      const probleme = geste.valider(nom.value);
      refus.textContent = probleme ?? "";
      refus.hidden = probleme === null;
      if (probleme === null) {
        saisie.hidden = true;
        return;
      }
      nom.focus();
      nom.select();
    }
    nom.addEventListener("keydown", (evenement) => {
      evenement.stopPropagation();
      if (evenement.key === "Enter") validerLeNom();
      if (evenement.key === "Escape") saisie.hidden = true;
    });

    // ── Les gestes ──
    const enregistrer = bouton({
      icone: "enregistrer", classe: "plat",
      aide: {
        nom: "Enregistrer le profil",
        texte: "Écrit les valeurs en vigueur dans le profil choisi, sous son nom. Il gardera ces valeurs pour tout le site, sur tous les postes.",
      },
      surClic: () => actions.enregistrerPrereglage(source),
    });
    const retablir = bouton({
      icone: "annuler", classe: "plat",
      aide: { nom: "Rétablir le profil", texte: "Abandonne les modifications en cours et reprend les valeurs du profil." },
      surClic: () => actions.changerPrereglage(source, impression[source], false),
    });
    const renommer = bouton({
      icone: "renommer", classe: "plat",
      aide: { nom: "Renommer le profil", texte: "Change le nom du profil choisi. Ses valeurs ne bougent pas." },
      surClic: () => demanderUnNom("Renommer", prereglage(source, impression[source]).nom,
        (valeur) => actions.renommerPrereglage(source, valeur)),
    });
    const dupliquer = bouton({
      icone: "dupliquer", classe: "plat",
      aide: { nom: "Dupliquer le profil", texte: "Crée un deuxième profil avec les valeurs en vigueur, sous un autre nom. Le profil d'origine reste tel quel." },
      surClic: () => demanderUnNom("Dupliquer", nomDeCopieDisponible(source, impression[source]),
        (valeur) => actions.dupliquerPrereglage(source, valeur)),
    });
    // Supprimer défait ce que le site a enregistré : un profil créé ici
    // disparaît, un profil fourni retrouve ses valeurs d'origine. Les deux se
    // confirment, parce que les deux perdent du travail — et pour tout le monde.
    const supprimer = bouton({
      icone: "supprimer", classe: "plat",
      aide: { nom: "Supprimer le profil", texte: "Retire du site ce que ce profil y a gardé. Un profil livré avec le logiciel retrouve ses valeurs d'origine." },
      surClic: () => {
        const fourni = estPrereglageFourni(source, impression[source]);
        const sonNom = prereglage(source, impression[source]).nom;
        question.replaceChildren(
          creer("span", {
            texte: fourni
              ? "Rendre à « " + sonNom + " » ses valeurs d'origine ?"
              : "Supprimer « " + sonNom + " » du site ?",
          }),
          bouton({
            texte: fourni ? "Rétablir l'origine" : "Supprimer",
            surClic: () => { question.hidden = true; actions.supprimerPrereglage(source); },
          }),
          bouton({ texte: "Annuler", classe: "plat", surClic: () => { question.hidden = true; } }),
        );
        question.hidden = false;
      },
    });

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

    const element = creer("section", { classe: "section-profil" }, [
      creer("div", { classe: "titre-profil", aide }, [creer("span", { texte: etiquette }), modifie]),
      creer("div", { classe: "ligne-prereglage" }, [choix]),
      creer("div", { classe: "gestes-prereglage" }, [enregistrer, retablir, renommer, dupliquer, supprimer]),
      vide,
      versionDuSite,
      question,
      saisie,
      corps,
    ]);
    return {
      element,
      corps,
      mettreAJour() {
        // La liste dépend de la buse choisie, et un profil vient peut-être
        // d'être enregistré ou renommé : on la redresse à chaque fois.
        const attendus = listeDesPrereglages(source, dependDeLaBuse(source) ? impression.buse : null);
        const memes = choix.options.length === attendus.length
          && attendus.every((p, i) => choix.options[i].value === p.id && choix.options[i].textContent === p.nom);
        if (!memes) {
          choix.replaceChildren(...attendus.map((p) => creer("option", { texte: p.nom, attributs: { value: p.id } })));
        }
        if (choix.value !== impression[source] && question.hidden) choix.value = impression[source] ?? "";
        const sansProfil = attendus.length === 0;
        vide.textContent = sansProfil
          ? "Aucun profil pour cette buse : régler les valeurs, puis Dupliquer pour en créer un."
          : "";
        vide.hidden = !sansProfil;
        choix.hidden = sansProfil;
        const remplaceUnProfilFourni = !sansProfil
          && estPrereglageDuSite(source, impression[source])
          && estPrereglageFourni(source, impression[source]);
        versionDuSite.textContent = remplaceUnProfilFourni
          ? "Version du site : elle remplace le profil livré avec le logiciel et ne suit plus "
            + "ses mises à jour. Supprimer la retire pour retrouver celui d'origine."
          : "";
        versionDuSite.hidden = !remplaceUnProfilFourni;
        // Combien de réglages de CE profil diffèrent : c'est la réponse à
        // « qu'est-ce que j'ai changé, et où ? ».
        const ecarts = Object.keys(ecartsDeLaSource(impression.ecarts, source)).length;
        modifie.textContent = ecarts === 1 ? "1 modifié" : ecarts + " modifiés";
        modifie.hidden = ecarts === 0;
        // Enregistrer et Rétablir ne valent que s'il y a quelque chose à garder
        // ou à défaire ; Supprimer, que si le site a quelque chose à rendre.
        // Rétablir ne touche qu'au plateau : tout le monde peut défaire ses
        // propres écarts. Les quatre autres écrivent le profil DU SITE.
        enregistrer.hidden = ecarts === 0 || sansProfil || !administrateur;
        retablir.hidden = ecarts === 0 || sansProfil;
        renommer.hidden = sansProfil || !administrateur;
        dupliquer.hidden = sansProfil || !administrateur;
        supprimer.hidden = sansProfil || !administrateur || !estPrereglageDuSite(source, impression[source]);
      },
    };
  }

  const sections = SOURCES.map(({ id, etiquette, aide }) =>
    [id, sectionDuProfil(id, etiquette, { nom: etiquette, texte: aide })]);

  // ── Mode et recherche, en tête : ils valent pour toute la liste ──
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

  const rienTrouve = creer("div", { classe: "inspecteur-vide", texte: "Aucun réglage ne correspond.", attributs: { hidden: "" } });

  conteneur.append(
    creer("div", { classe: "titre-panneau" }, [icone("variables"), creer("span", { texte: "Réglages d'impression" })]),
    creer("div", { classe: "tete-reglages" }, [
      champRecherche,
      creer("label", { classe: "mode-avance", aide: { nom: "Mode avancé", texte: "Montre tous les réglages. Sans lui, seulement ceux qu'on change tous les jours." } },
        [caseAvance, creer("span", { texte: "Avancé" })]),
    ]),
    ...sections.map(([, s]) => s.element),
    rienTrouve,
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
    const ligne = creer("div", { classe: "rangee rangee-reglage" }, [libelle, controle, retablir]);
    const entree = { ligne, definir, retablir, libelle, controle };
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

  /*
   * Les réglages d'un profil qui passent le filtre, dans l'ordre du catalogue.
   * Un réglage MODIFIÉ se montre toujours, même en mode simple : un écart caché
   * est un écart qu'on oublie, et c'est lui qu'on enregistrera sans le savoir.
   */
  function reglagesRetenus(source) {
    return REGLAGES.filter((r) => r.source === source && (recherche !== ""
      // Un réglage sans équivalent OrcaSlicer a orca à null : on ne le cherche pas.
      ? [r.etiquette, r.groupe, r.orca, r.aide].some((t) => t && t.toLowerCase().includes(recherche))
      : avance || r.niveau === "simple" || r.cle in impression.ecarts));
  }

  function dessinerMaintenant() {
    if (impression === null) return;
    const valeurs = valeursEffectives(impression);
    let total = 0;

    for (const [source, section] of sections) {
      const retenus = reglagesRetenus(source);
      total += retenus.length;
      // Un groupe par nom, dans l'ordre où il se présente : « Parois » reste un
      // seul bloc même si le catalogue le remplit en deux fois.
      const blocs = new Map();
      for (const r of retenus) {
        if (!blocs.has(r.groupe)) {
          blocs.set(r.groupe, creer("section", { classe: "bloc-inspecteur" },
            [creer("div", { classe: "titre-bloc", texte: r.groupe })]));
        }
        const entree = champDe(r);
        const ecart = r.cle in impression.ecarts;
        entree.definir(valeurs[r.cle]);
        entree.ligne.dataset.role = r.role ?? "fixe";
        entree.ligne.classList.toggle("modifie", ecart);
        entree.retablir.hidden = !ecart;
        entree.retablir.title = "Revenir à la valeur du profil : " + texteDeValeur(r, valeurDuPrereglage(impression, r.cle));
        // L'aide du réglage, avec son nom dans OrcaSlicer pour retrouver la référence.
        entree.libelle.title = r.aide + (r.orca ? " (OrcaSlicer : " + r.orca + ")" : "");
        blocs.get(r.groupe).append(entree.ligne);
      }
      section.corps.replaceChildren(...blocs.values());
      // Pendant une recherche, un profil sans résultat s'efface entièrement :
      // ce qui reste à l'écran est la réponse.
      section.element.hidden = recherche !== "" && retenus.length === 0;
    }
    rienTrouve.hidden = total > 0;
  }

  return {
    mettreAJour(nouvelle) {
      impression = nouvelle;
      for (const [, section] of sections) section.mettreAJour();
      dessiner();
    },
    /* La session administrateur est connue après coup : les gestes d'écriture apparaissent alors. */
    autoriserLesProfils(peut) {
      administrateur = peut === true;
      for (const [, section] of sections) section.mettreAJour();
    },
  };
}
