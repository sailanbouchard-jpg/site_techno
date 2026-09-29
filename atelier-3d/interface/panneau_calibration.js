/*
 * interface/panneau_calibration.js
 * ────────────────────────────────
 * L'onglet Calibration : la combinaison en tête avec ses cinq préréglages,
 * puis les essais dans l'ordre conseillé, avec leurs paramètres et leur
 * dépouillement, et enfin la comparaison avec les autres combinaisons.
 *
 * Une combinaison réunit une imprimante, une buse, une plaque, un matériau et
 * des réglages d'impression. Tant qu'aucune n'est choisie, les essais restent
 * inaccessibles : sans elle, on ne saurait pas à quoi rattacher un résultat.
 *
 * Le dépouillement d'un essai n'a pas de forme imposée : il déclare ce qu'il
 * demande — des cotes à relever (champs), des lectures à choisir dans une liste
 * (champsDeChoix), des cases à cocher (constats) — et le panneau montre ce qui
 * est déclaré, rien d'autre.
 *
 * Rien n'est écrit dans la combinaison tant que la conclusion n'a pas été lue
 * et acceptée : le bouton « Retenir » est le seul chemin. Et rien n'entre dans
 * le slicer tant que la combinaison n'est pas exportée.
 */

import { creer, bouton, vider } from "./elements.js";
import { icone } from "./icones.js";
import { creerChampNumerique } from "./champ_numerique.js";
import { OUTILS, ETAGES, parametresParDefaut } from "../noyau/calibration.js";
import { SOURCES, listeDesPrereglages, dependDeLaBuse, reglageDe } from "../noyau/reglages_impression.js";

const ETATS = {
  a_faire: { texte: "à faire", classe: "a-faire" },
  fait: { texte: "fait", classe: "fait" },
  a_refaire: { texte: "à refaire", classe: "a-refaire" },
};

// Les préréglages que la calibration ajuste vraiment, et qu'il y a donc un sens
// à comparer d'une combinaison à l'autre.
const SOURCES_COMPAREES = Object.freeze(["plaque", "materiau", "reglages"]);

const texteDeValeur = (cle, valeur) => {
  const r = reglageDe(cle);
  if (valeur === null || valeur === undefined) return "—";
  if (r?.choix) return r.choix.find((c) => c.valeur === valeur)?.etiquette ?? String(valeur);
  const nombre = typeof valeur === "number" ? valeur.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) : String(valeur);
  return nombre + (r?.unite ? " " + r.unite : "");
};

/*
 * actions : { combinaisons(), active(), choisir(id), ajouter(champs), renommer(id, nom),
 *             dupliquer(id), retirer(id), changerPrereglage(source, id), exporter(),
 *             editionDesChoix(), basculerEditionDesChoix(ouvert),
 *             avancement(), reglagesDeLaCombinaison(), reglagesDeLOutil(id),
 *             comparaison(source), lancer(id, parametres), arreter(), exporterFichier(),
 *             essaiCourant(), conclure(id, parametres, saisie), retenir(id, conclusion),
 *             oublier(id), annoncer(texte, erreur) }
 */
export function creerPanneauCalibration(conteneur, actions) {
  const entete = creer("div", { classe: "titre-panneau" }, [icone("regle"), creer("span", { texte: "Calibration" })]);
  const corps = creer("div", { classe: "inspecteur-corps panneau-calibration" });
  conteneur.append(entete, corps);

  let deplie = null;                    // l'essai ouvert, ou null
  let fiche = null;                     // la fiche de création ou de renommage
  const saisies = new Map();            // id d'essai → ce qui a été relevé
  const parametres = new Map();         // id d'essai → les paramètres que l'utilisateur a changés
  const conclusions = new Map();        // id d'essai → la conclusion calculée, pas encore retenue

  /*
   * Les paramètres d'un essai : ses valeurs par défaut, recalculées à chaque
   * lecture parce que certaines dépendent de la combinaison (l'essai de débit se
   * centre sur le rapport en vigueur), et par-dessus ce que l'utilisateur a tapé
   * lui-même, qui ne bouge plus.
   */
  const parametresDe = (outil) => ({
    ...parametresParDefaut(outil, actions.reglagesDeLaCombinaison() ?? {}),
    ...(parametres.get(outil.id) ?? {}),
  });

  const changerParametre = (outil, cle, valeur) => {
    if (!parametres.has(outil.id)) parametres.set(outil.id, {});
    parametres.get(outil.id)[cle] = valeur;
    conclusions.delete(outil.id);
  };
  const saisieDe = (id) => {
    if (!saisies.has(id)) saisies.set(id, {});
    return saisies.get(id);
  };

  // ── La combinaison ──
  function blocDeLaCombinaison() {
    const liste = actions.combinaisons();
    const active = actions.active();
    const rangees = [];

    if (liste.length > 0) {
      const choix = creer("select", { classe: "champ-texte", attributs: { "aria-label": "Combinaison" } },
        liste.map((c) => creer("option", { texte: c.nom, attributs: { value: c.id } })));
      choix.value = active?.id ?? liste[0].id;
      choix.addEventListener("change", () => actions.choisir(choix.value));
      rangees.push(creer("div", { classe: "rangee rangee-reglage" }, [
        creer("span", { classe: "libelle", texte: "Combinaison" }), choix,
      ]));
    }

    const boutons = [bouton({
      icone: "plus", texte: "Nouvelle", classe: liste.length === 0 ? "principal" : "",
      aide: { nom: "Nouvelle combinaison", texte: "Une imprimante, une buse, une plaque, un matériau, des réglages d'impression, et l'état de calibration de cet ensemble." },
      surClic: () => ouvrirLaFiche(null),
    })];
    if (active !== null) {
      boutons.push(bouton({ texte: "Modifier", surClic: () => ouvrirLaFiche(active) }));
      boutons.push(bouton({ icone: "dupliquer", texte: "Dupliquer", surClic: () => actions.dupliquer(active.id) }));
      boutons.push(bouton({ icone: "supprimer", texte: "Retirer", classe: "plat", surClic: () => actions.retirer(active.id) }));
    }

    const details = [];
    if (active !== null) {
      for (const { id: source, etiquette, aide } of SOURCES) {
        const valeurs = listeDesPrereglages(source, dependDeLaBuse(source) ? active.buse : null);
        if (valeurs.length === 0) {
          details.push(creer("div", { classe: "rangee rangee-reglage" }, [
            creer("span", { classe: "libelle", texte: etiquette }),
            creer("span", { classe: "note-prereglage", texte: "Aucun pour cette buse" }),
          ]));
          continue;
        }
        const liste2 = creer("select", { classe: "champ-texte", aide: { nom: etiquette, texte: aide }, attributs: { "aria-label": etiquette } },
          valeurs.map((p) => creer("option", { texte: p.nom, attributs: { value: p.id } })));
        liste2.value = active[source] ?? "";
        liste2.addEventListener("change", () => actions.changerPrereglage(source, liste2.value));
        details.push(creer("div", { classe: "rangee rangee-reglage" }, [
          creer("span", { classe: "libelle", texte: etiquette }), liste2,
        ]));
      }
      const edition = creer("input", { attributs: { type: "checkbox" } });
      edition.checked = actions.editionDesChoix();
      edition.addEventListener("change", () => actions.basculerEditionDesChoix(edition.checked));
      details.push(creer("label", {
        classe: "rangee rangee-constat",
        aide: { nom: "Modifier les choix", texte: "Hauteur de couche, parois, densité, vitesses : ce que la combinaison veut obtenir. Les changer remet à « à refaire » les essais déjà conclus." },
      }, [edition, creer("span", { texte: "Modifier les choix" })]));
      const avancement = actions.avancement();
      details.push(creer("div", { classe: "ligne-actions" }, [
        creer("span", { classe: "compte-essais", texte: avancement.faits + " / " + avancement.total + " à jour" }),
        bouton({
          icone: "exporter", texte: active.exporteeLe === null ? "Exporter" : "Exporter de nouveau",
          classe: avancement.faits === avancement.total ? "principal" : "",
          aide: { nom: "Exporter", texte: "Crée cinq préréglages personnels du même nom, choisissables dans l'onglet Impression." },
          surClic: () => actions.exporter(),
        }),
      ]));
      if (active.exporteeLe !== null) {
        details.push(creer("p", { classe: "note-calibration", texte: "Exportée le " + active.exporteeLe + "." }));
      }
    }

    return creer("section", { classe: "bloc-inspecteur bloc-combinaisons" }, [
      creer("div", { classe: "titre-bloc", texte: "Combinaison" }),
      ...rangees,
      creer("div", { classe: "ligne-actions" }, boutons),
      ...details,
    ]);
  }

  /* La fiche de création ou de modification : un nom, et les cinq préréglages de départ. */
  function ouvrirLaFiche(combinaison) {
    const nom = creer("input", {
      classe: "champ-texte",
      attributs: { type: "text", maxlength: "60", spellcheck: "false", value: combinaison?.nom ?? "", placeholder: "P1S · BQ Smooth · PLA Polyterra" },
    });
    // La buse commande les trois dernières listes : les changer quand elle change.
    const listes = SOURCES.map(({ id: source, etiquette }) => {
      const liste = creer("select", { classe: "champ-texte" });
      return { source, etiquette, liste };
    });
    const buseChoisie = () => listes.find((l) => l.source === "buse").liste.value;
    function remplirLesListes() {
      for (const { source, liste } of listes) {
        const valeurs = listeDesPrereglages(source, dependDeLaBuse(source) ? buseChoisie() : null);
        const garde = liste.value;
        liste.replaceChildren(...valeurs.map((p) => creer("option", { texte: p.nom, attributs: { value: p.id } })));
        if (valeurs.some((p) => p.id === garde)) liste.value = garde;
        else if (dependDeLaBuse(source) && combinaison !== null && valeurs.some((p) => p.id === combinaison[source])) {
          liste.value = combinaison[source];
        }
        liste.disabled = valeurs.length === 0;
      }
    }
    for (const { source, liste } of listes) {
      if (combinaison !== null) liste.value = combinaison[source] ?? "";
      if (source === "buse") liste.addEventListener("change", remplirLesListes);
    }
    remplirLesListes();

    const valider = bouton({
      icone: "valider", texte: combinaison === null ? "Créer" : "Enregistrer", classe: "principal",
      surClic: () => {
        const propre = nom.value.trim() || "Combinaison";
        const choix = Object.fromEntries(listes.map(({ source, liste }) => [source, liste.value || null]));
        if (combinaison === null) {
          actions.ajouter({ nom: propre, ...choix });
        } else {
          actions.renommer(combinaison.id, propre);
          for (const [source, id] of Object.entries(choix)) actions.changerPrereglage(source, id);
        }
        fiche = null;
        dessiner();
      },
    });
    const annuler = bouton({ texte: "Annuler", classe: "plat", surClic: () => { fiche = null; dessiner(); } });
    fiche = creer("section", { classe: "bloc-inspecteur fiche-combinaison" }, [
      creer("div", { classe: "titre-bloc", texte: combinaison === null ? "Nouvelle combinaison" : "Modifier la combinaison" }),
      creer("div", { classe: "rangee rangee-reglage" }, [creer("span", { classe: "libelle", texte: "Nom" }), nom]),
      ...listes.map(({ etiquette, liste }) => creer("div", { classe: "rangee rangee-reglage" }, [
        creer("span", { classe: "libelle", texte: etiquette }), liste,
      ])),
      creer("div", { classe: "ligne-actions" }, [valider, annuler]),
    ]);
    dessiner();
    nom.focus();
  }

  // ── Les paramètres d'un essai ──
  function rangeeDeParametre(outil, p) {
    const valeurs = parametresDe(outil);
    const changer = (v) => { changerParametre(outil, p.cle, v); dessiner(); };
    let controle;
    if (p.choix) {
      controle = creer("select", { classe: "champ-texte" }, p.choix.map((c) => creer("option", { texte: c.etiquette, attributs: { value: c.valeur } })));
      controle.value = valeurs[p.cle];
      controle.addEventListener("change", () => changer(controle.value));
    } else {
      const champ = creerChampNumerique({
        etiquette: "", titre: p.etiquette, unite: p.unite, min: p.min, max: p.max, entier: p.entier,
        pasFixe: p.pasFixe, decimales: p.decimales ?? (p.entier ? 0 : 2), valeur: valeurs[p.cle],
        surValider: changer,
      });
      controle = champ.element;
    }
    return creer("div", { classe: "rangee rangee-reglage" }, [
      creer("span", { classe: "libelle", texte: p.etiquette }), controle,
    ]);
  }

  // ── Le dépouillement ──
  function champDeReleve(outil, description) {
    const saisie = saisieDe(outil.id);
    if (saisie[description.cle] === undefined && description.defaut !== undefined) saisie[description.cle] = description.defaut;
    const champ = creerChampNumerique({
      etiquette: "", titre: description.etiquette, unite: description.unite,
      min: description.min, max: description.max, entier: description.entier,
      decimales: description.entier ? 0 : 3, valeur: saisie[description.cle] ?? null, accepteVide: true,
      surValider: (v) => {
        saisie[description.cle] = v;
        conclusions.delete(outil.id);
      },
    });
    return creer("div", { classe: "rangee rangee-reglage" }, [
      creer("span", { classe: "libelle", texte: description.etiquette }), champ.element,
    ]);
  }

  function listeDeChoix(outil, cle, options, etiquette) {
    const saisie = saisieDe(outil.id);
    const liste = creer("select", { classe: "champ-texte" },
      options.map((o) => creer("option", { texte: o.etiquette, attributs: { value: String(o.valeur) } })));
    liste.value = String(saisie[cle] ?? options[0].valeur);
    saisie[cle] = Number(liste.value);
    liste.addEventListener("change", () => {
      saisie[cle] = Number(liste.value);
      conclusions.delete(outil.id);
    });
    return creer("div", { classe: "rangee rangee-reglage rangee-lecture" }, [
      creer("span", { classe: "libelle", texte: etiquette }), liste,
    ]);
  }

  function blocDepouillement(outil) {
    const d = outil.depouillement;
    const rangees = [];
    const reglages = actions.reglagesDeLaCombinaison();

    for (const champ of d.champs ?? []) rangees.push(champDeReleve(outil, champ));

    // Les lectures : fixes, ou calculées depuis les paramètres de l'essai quand
    // elles portent sur ses bandes.
    const lectures = typeof d.champsDeChoix === "function"
      ? d.champsDeChoix(parametresDe(outil), reglages)
      : (d.champsDeChoix ?? []);
    for (const champ of lectures) rangees.push(listeDeChoix(outil, champ.cle, champ.options, champ.etiquette));

    if (d.constats) {
      const saisie = saisieDe(outil.id);
      for (const constat of d.constats) {
        const caseAcocher = creer("input", { attributs: { type: "checkbox" } });
        caseAcocher.checked = saisie[constat.cle] === true;
        caseAcocher.addEventListener("change", () => {
          saisie[constat.cle] = caseAcocher.checked;
          conclusions.delete(outil.id);
        });
        rangees.push(creer("label", { classe: "rangee rangee-constat" }, [caseAcocher, creer("span", { texte: constat.etiquette })]));
      }
    }

    const conclure = bouton({
      texte: "Conclure", classe: "principal",
      surClic: () => {
        try {
          conclusions.set(outil.id, actions.conclure(outil.id, parametresDe(outil), saisieDe(outil.id)));
        } catch (erreur) {
          actions.annoncer(erreur.message, true);
        }
        dessiner();
      },
    });

    const conclusion = conclusions.get(outil.id);
    const cles = Object.keys(conclusion?.reglages ?? {});
    const bilan = conclusion === undefined ? null : creer("div", { classe: "bilan-calibration" }, [
      creer("p", { texte: conclusion.texte }),
      cles.length === 0 ? null : creer("ul", { classe: "liste-conclusion" }, cles.map((cle) => creer("li", {
        texte: (reglageDe(cle)?.etiquette ?? cle) + " : " + texteDeValeur(cle, conclusion.reglages[cle]),
      }))),
      creer("div", { classe: "ligne-actions" }, [
        bouton({
          icone: "valider", texte: cles.length === 0 ? "Retenir" : "Retenir " + cles.length + (cles.length > 1 ? " réglages" : " réglage"),
          classe: "principal",
          surClic: () => {
            actions.retenir(outil.id, conclusion);
            conclusions.delete(outil.id);
            dessiner();
          },
        }),
        bouton({ texte: "Abandonner", classe: "plat", surClic: () => { conclusions.delete(outil.id); dessiner(); } }),
      ]),
    ]);

    return creer("div", { classe: "depouillement" }, [
      creer("div", { classe: "titre-bloc", texte: "Dépouillement" }),
      creer("p", { classe: "consigne-calibration", texte: d.consigne }),
      ...rangees,
      creer("div", { classe: "ligne-actions" }, [conclure]),
      bilan,
    ]);
  }

  // ── Une fiche d'essai ──
  function ficheOutil(outil, rang, etat) {
    const enCours = actions.essaiCourant() === outil.id;
    const marque = ETATS[etat.etat];
    const titre = creer("button", {
      classe: "titre-outil" + (deplie === outil.id ? " ouvert" : ""),
      attributs: { type: "button", "aria-expanded": String(deplie === outil.id) },
    }, [
      creer("span", { classe: "rang-outil", texte: String(rang) }),
      creer("span", { classe: "nom-outil", texte: outil.nom }),
      creer("span", { classe: "marque-etat " + marque.classe, texte: marque.texte }),
      enCours ? creer("span", { classe: "marque-en-cours", texte: "sur le plateau" }) : null,
    ]);
    titre.addEventListener("click", () => {
      deplie = deplie === outil.id ? null : outil.id;
      dessiner();
    });

    if (deplie !== outil.id) {
      return creer("section", { classe: "outil-calibration" }, [titre, creer("p", { classe: "but-outil", texte: outil.but })]);
    }

    const determines = actions.reglagesDeLOutil(outil.id).map((cle) => reglageDe(cle)?.etiquette ?? cle);
    const boutons = [];
    if (!outil.sansImpression) {
      boutons.push(bouton({
        icone: "couches", texte: enCours ? "Retrancher" : "Poser l'éprouvette", classe: "principal",
        surClic: () => actions.lancer(outil.id, parametresDe(outil)),
      }));
      if (enCours) {
        boutons.push(bouton({ icone: "exporter", texte: "Fichier .gcode.3mf", surClic: () => actions.exporterFichier() }));
        boutons.push(bouton({ texte: "Arrêter", classe: "plat", surClic: () => actions.arreter() }));
      }
    }

    return creer("section", { classe: "outil-calibration ouvert" }, [
      titre,
      creer("p", { classe: "but-outil", texte: outil.but }),
      creer("p", { classe: "pourquoi-outil", texte: outil.pourquoi }),
      determines.length === 0 ? null : creer("p", { classe: "determine-outil", texte: "Décide : " + determines.join(", ") + "." }),
      outil.duree ? creer("p", { classe: "duree-outil", texte: "Impression : " + outil.duree }) : null,
      outil.parametres.length === 0 ? null : creer("div", { classe: "bloc-parametres" }, [
        creer("div", { classe: "titre-bloc", texte: "Paramètres" }),
        ...outil.parametres.map((p) => rangeeDeParametre(outil, p)),
      ]),
      boutons.length === 0 ? null : creer("div", { classe: "ligne-actions" }, boutons),
      blocDepouillement(outil),
      etat.texte === null ? null : creer("div", { classe: "note-calibration" }, [
        creer("p", { texte: etat.date + " — " + etat.texte }),
        bouton({ texte: "Oublier", classe: "plat", surClic: () => actions.oublier(outil.id) }),
      ]),
    ]);
  }

  // ── La comparaison entre combinaisons ──
  /*
   * Deux combinaisons qui partagent un préréglage doivent y trouver les mêmes
   * valeurs. C'est la vérification qui justifie de calibrer le même matériau sur
   * deux plaques : si les deux séries d'éprouvettes donnent le même nombre, il
   * est sûr ; si elles divergent, on sait qu'il faut regarder de plus près, et
   * on a deux jeux de pièces pour trancher.
   */
  function blocComparaison() {
    const blocs = [];
    for (const source of SOURCES_COMPAREES) {
      const comparaison = actions.comparaison(source);
      if (comparaison === null) continue;
      const etiquette = SOURCES.find((s) => s.id === source).etiquette;
      const noms = [actions.active(), ...comparaison.autres].map((c) => c.nom);
      const lignes = comparaison.lignes.map((ligne) => creer("div", {
        classe: "ligne-comparaison" + (ligne.accord === false ? " desaccord" : ligne.accord === true ? " accord" : ""),
      }, [
        creer("span", { classe: "libelle-comparaison", texte: ligne.etiquette }),
        ...ligne.valeurs.map((v) => creer("span", { classe: "valeur-comparaison", texte: texteDeValeur(ligne.cle, v.valeur) })),
      ]));
      const desaccords = comparaison.lignes.filter((l) => l.accord === false).length;
      blocs.push(creer("section", { classe: "bloc-inspecteur bloc-comparaison" }, [
        creer("div", { classe: "titre-bloc", texte: "Même « " + etiquette + " » : " + noms.join(" · ") }),
        creer("div", { classe: "ligne-comparaison entete-comparaison" }, [
          creer("span", { classe: "libelle-comparaison", texte: "" }),
          ...noms.map((n) => creer("span", { classe: "valeur-comparaison", texte: n })),
        ]),
        ...lignes,
        creer("p", {
          classe: "note-calibration",
          texte: desaccords === 0
            ? "Toutes les valeurs concluent pareil : le préréglage est confirmé deux fois."
            : desaccords + (desaccords > 1 ? " valeurs divergent" : " valeur diverge")
              + " : ces mesures sont à reprendre, le reste est confirmé. Un même matériau ne change pas parce qu'on change de plaque.",
        }),
      ]));
    }
    return blocs;
  }

  function dessiner() {
    vider(corps);
    corps.append(blocDeLaCombinaison());
    if (fiche !== null) {
      corps.append(fiche);
      return;
    }
    const active = actions.active();
    if (active === null) {
      corps.append(creer("p", { classe: "intro-calibration", texte: "Créer une combinaison pour commencer." }));
      return;
    }
    const avancement = actions.avancement();
    let rang = 0;
    for (const etage of ETAGES) {
      corps.append(creer("div", { classe: "etage-calibration" }, [
        creer("div", { classe: "titre-bloc", texte: etage.nom }),
        creer("p", { classe: "texte-etage", texte: etage.texte }),
      ]));
      for (const outil of OUTILS.filter((o) => o.etage === etage.id)) {
        rang += 1;
        corps.append(ficheOutil(outil, rang, avancement.etats[outil.id]));
      }
    }
    corps.append(...blocComparaison());
  }

  return { rafraichir: () => dessiner() };
}
