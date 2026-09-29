/*
 * application/calibration_en_cours.js
 * ───────────────────────────────────
 * L'atelier de calibration : les combinaisons (imprimante + buse + plaque +
 * matériau + réglages d'impression), celle qui est active, l'essai en cours, et
 * l'export vers les préréglages du slicer.
 *
 * Il a son propre moteur de tranchage, séparé de celui du plateau : un essai
 * lancé ne jette pas le tranchage du projet, et le projet retrouve son plateau
 * intact quand l'essai est fini. Les éprouvettes ne sont pas des objets de la
 * conception : ce sont des maillages fabriqués sur place (noyau/calibration.js),
 * posés au centre du plateau, avec un nœud de façade qui ne sert qu'à la clé du
 * cache de tranchage.
 *
 * Les variantes d'un essai. Chaque éprouvette peut porter ses propres écarts de
 * réglages : elle est alors TRANCHÉE avec eux, et le G-code les applique. C'est
 * ce qui met quatre stratégies de surplomb ou deux vitesses de paroi sur un seul
 * plateau. Les mêmes écarts servent aux deux (tranchage et G-code) : ils sont
 * déclarés une fois, dans l'essai.
 *
 * Rien de ce qui se passe ici ne touche au projet ouvert. Une conclusion va
 * dans la combinaison ; c'est l'export, demandé explicitement, qui la rend
 * utilisable dans le slicer, sous forme de préréglages personnels.
 */

import { creerTranchageEnDirect } from "./tranchage_en_direct.js";
import {
  valeursEffectives, definirLesPrereglagesPersonnels, reglagesDetermines, reglageDe, SOURCES,
} from "../noyau/reglages_impression.js";
import { outilDe, parametresParDefaut, reglagesDeLEssai, variantesDeLEssai, OUTILS } from "../noyau/calibration.js";
import {
  creerCombinaison, avecChamps, avecResultatDEssai, sansResultatDEssai,
  impressionDeLaCombinaison, prereglagesDeLaCombinaison, avancementDeLaCalibration,
  comparaisonDesCombinaisons,
} from "../noyau/combinaisons.js";
import {
  lireLesCombinaisons, ecrireLesCombinaisons, lireLesAnciensResultats, oublierLesAnciensResultats,
} from "../stockage/combinaisons_enregistrees.js";
import { lirePolice } from "../geometrie/lecture_police.js";

// Les valeurs essayées sont écrites en relief sur les éprouvettes : il faut
// donc une police. La même que les textes de la conception, chargée une fois.
const POLICE_DES_ETIQUETTES = "../vendor/polices/Lato-Bold.ttf";
const ATTENTE_MAX_MS = 300000;
const INTERVALLE_MS = 200;

const IDENTITE = Object.freeze({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  echelle: { x: 1, y: 1, z: 1 },
});

/* Le point le plus haut d'un maillage : le trancheur en tire le nombre de couches. */
function hauteurDe(maillage) {
  let haut = 0;
  for (let i = 2; i < maillage.positions.length; i += 3) haut = Math.max(haut, maillage.positions[i]);
  return haut;
}

/*
 * dependances : { plateau, annoncer(texte, erreur), surChangement() }
 */
export function creerCalibration({ plateau, annoncer, surChangement }) {
  const tranchage = creerTranchageEnDirect({
    annoncer,
    surResultat: () => surChangement(),
    surAvancement: () => surChangement(),
  });

  let combinaisons = lireLesCombinaisons();
  let active = combinaisons[0]?.id ?? null;
  let essai = null;         // { outil, parametres, pieces, impression, variantes }
  let police = null;        // null tant qu'elle n'est pas lue : les pièces sortent alors sans chiffres
  // Les choix de la combinaison (hauteur de couche, nombre de parois, densité…)
  // sont figés tant qu'on ne demande pas à les changer : les toucher en cours de
  // calibration invaliderait ce qui a déjà été mesuré. On peut le demander, et
  // les essais déjà conclus repassent alors à « à refaire ».
  let editionDesChoix = false;

  // Les préréglages personnels déjà exportés sont remis en place au démarrage.
  republierLesPrereglages();

  function republierLesPrereglages() {
    const parSource = Object.fromEntries(SOURCES.map(({ id }) => [id, []]));
    for (const combinaison of combinaisons) {
      if (combinaison.exporteeLe === null) continue;
      const tous = prereglagesDeLaCombinaison(combinaison);
      for (const source of Object.keys(parSource)) parSource[source].push(...tous[source]);
    }
    definirLesPrereglagesPersonnels(parSource);
  }

  function enregistrer(liste) {
    combinaisons = liste;
    if (!ecrireLesCombinaisons(combinaisons)) {
      annoncer("Les combinaisons ne peuvent pas être gardées sur ce poste : elles valent pour la séance.", true);
    }
    republierLesPrereglages();
    surChangement();
  }

  const combinaisonActive = () => combinaisons.find((c) => c.id === active) ?? null;

  function remplacer(suivante) {
    enregistrer(combinaisons.map((c) => (c.id === suivante.id ? suivante : c)));
  }

  async function chargerLaPolice() {
    if (police !== null) return police;
    try {
      const reponse = await fetch(new URL(POLICE_DES_ETIQUETTES, import.meta.url));
      police = lirePolice(await reponse.arrayBuffer());
    } catch (_erreur) {
      annoncer("Police introuvable : l'éprouvette sortira sans les valeurs gravées.", true);
    }
    return police;
  }

  /* La section impression de la combinaison active, ou celle du projet à défaut. */
  const impressionCourante = () => {
    const c = combinaisonActive();
    return c === null ? plateau.impression() : impressionDeLaCombinaison(c);
  };

  /* La section impression d'un essai : celle de la combinaison, plus ce que l'essai impose. */
  function impressionDeLEssai(combinaison, outil, parametres) {
    const base = impressionDeLaCombinaison(combinaison);
    return { ...base, ecarts: { ...base.ecarts, ...reglagesDeLEssai(outil, parametres) } };
  }

  return {
    // ── Les combinaisons ──
    liste: () => combinaisons,
    active: combinaisonActive,
    choisir(id) {
      active = id;
      essai = null;
      surChangement();
    },
    ajouter(champs) {
      const neuve = creerCombinaison(champs);
      // Les essais conclus avant qu'il y ait des combinaisons ne sont pas perdus.
      const anciens = combinaisons.length === 0 ? lireLesAnciensResultats() : {};
      const reprise = Object.keys(anciens).length === 0 ? neuve
        : creerCombinaison({ ...neuve, essais: anciens, ecarts: Object.assign({}, ...Object.values(anciens).map((e) => e.reglages ?? {})) });
      if (Object.keys(anciens).length > 0) oublierLesAnciensResultats();
      active = reprise.id;
      enregistrer([...combinaisons, reprise]);
      return reprise;
    },
    renommer(id, nom) {
      const c = combinaisons.find((x) => x.id === id);
      if (c !== undefined) remplacer(avecChamps(c, { nom }));
    },
    changerPrereglage(source, id) {
      const c = combinaisonActive();
      if (c === null) return;
      remplacer(avecChamps(c, { [source]: id }));
      essai = null;
    },
    editionDesChoix: () => editionDesChoix,
    basculerEditionDesChoix(ouvert) {
      editionDesChoix = ouvert;
      surChangement();
    },
    regler(cle, valeur) {
      const c = combinaisonActive();
      if (c === null) return;
      const ecarts = { ...c.ecarts };
      if (valeur === undefined) delete ecarts[cle];
      else ecarts[cle] = valeur;
      // Changer un choix rend caducs les essais déjà conclus : ils ont été
      // mesurés dans d'autres conditions.
      const estUnChoix = (reglageDe(cle)?.role ?? "fixe") === "fixe";
      remplacer(avecChamps(c, { ecarts, ...(estUnChoix ? { choixModifiesLe: new Date().toISOString().slice(0, 10) } : {}) }));
    },
    dupliquer(id) {
      const c = combinaisons.find((x) => x.id === id);
      if (c === undefined) return;
      const copie = creerCombinaison({ ...c, id: undefined, nom: c.nom + " (copie)", exporteeLe: null });
      active = copie.id;
      enregistrer([...combinaisons, copie]);
    },
    retirer(id) {
      const restantes = combinaisons.filter((c) => c.id !== id);
      if (active === id) active = restantes[0]?.id ?? null;
      essai = null;
      enregistrer(restantes);
    },
    avancement: () => (combinaisonActive() === null ? null : avancementDeLaCalibration(combinaisonActive())),

    /*
     * Ce que les autres combinaisons ont trouvé pour le même préréglage. C'est
     * la vérification croisée : le même matériau calibré sur deux plaques doit
     * donner deux fois les mêmes nombres, sinon l'une des deux mesures est
     * douteuse — et on a alors deux jeux d'éprouvettes pour trancher.
     */
    comparaison(source) {
      const c = combinaisonActive();
      return c === null ? null : comparaisonDesCombinaisons(combinaisons, c, source);
    },

    /* Les préréglages personnels, utilisables ensuite dans le slicer. */
    exporter() {
      const c = combinaisonActive();
      if (c === null) return;
      remplacer(avecChamps(c, { exporteeLe: new Date().toISOString().slice(0, 10) }));
      annoncer("« " + c.nom + " » est disponible dans les préréglages de l'onglet Impression.");
    },

    // ── Les réglages en vigueur ──
    reglagesDeLaCombinaison: () => valeursEffectives(impressionCourante()),
    impressionCourante,

    /*
     * Ce qui verrouille un réglage dans l'espace de calibration : l'essai en
     * cours d'abord (il impose ses conditions de mesure), puis l'essai qui le
     * détermine, puis la combinaison pour tout ce qui est une intention.
     */
    verrouillage(reglage) {
      const c = combinaisonActive();
      if (c === null) return null;
      if (essai !== null && reglage.cle in reglagesDeLEssai(essai.outil, essai.parametres)) {
        return { raison: "Fixé par l'essai en cours : « " + essai.outil.nom + " ». La mesure en dépend." };
      }
      if (reglage.role === "a_determiner") {
        const outil = outilDe(reglage.determinePar);
        const fait = c.essais[reglage.determinePar];
        return {
          raison: fait === undefined
            ? "Déterminé par l'essai « " + (outil?.nom ?? reglage.determinePar) + " », pas encore fait."
            : "Déterminé par l'essai « " + (outil?.nom ?? reglage.determinePar) + " », conclu le " + fait.date + ".",
        };
      }
      if (reglage.role === "independant") return null;
      if (editionDesChoix) return null;
      return { raison: "Choix de la combinaison : il décrit ce qu'on veut, il n'y a rien à mesurer. « Modifier les choix » pour y toucher." };
    },

    // ── L'essai en cours ──
    actif: () => essai !== null,
    outil: () => essai?.outil ?? null,
    parametres: () => essai?.parametres ?? null,

    /* Prépare un essai : ses éprouvettes sont tranchées tout de suite. */
    async lancer(idOutil, parametres) {
      const c = combinaisonActive();
      const outil = outilDe(idOutil);
      if (c === null || outil === null || outil.sansImpression) return;
      const valeurs = { ...parametresParDefaut(outil, valeursEffectives(impressionCourante())), ...parametres };
      const impression = impressionDeLEssai(c, outil, valeurs);
      const reglages = valeursEffectives(impression);
      const contexte = { police: await chargerLaPolice() };
      const variantes = variantesDeLEssai(outil, valeurs, reglages);
      const pieces = outil.geometrie(valeurs, reglages, contexte).map((forme, i) => {
        const propres = variantes[i]?.ecarts ?? null;
        return {
          id: "calibration-" + outil.id + "-" + i,
          // Un nœud de façade : seules sa nature et ses paramètres comptent, pour la clé du cache.
          noeud: { type: "calibration:" + outil.id + ":" + i, parametres: { ...valeurs }, enfants: [] },
          maillage: forme.maillage,
          nom: forme.nom,
          transformation: IDENTITE,
          hauteur: hauteurDe(forme.maillage),
          // Les écarts de la variante : cette pièce est tranchée avec eux.
          ...(propres === null || Object.keys(propres).length === 0 ? {} : { ecarts: propres }),
        };
      });
      essai = { outil, parametres: valeurs, pieces, impression, variantes };
      tranchage.mettreAJour(pieces, impression);
      surChangement();
    },

    arreter() {
      essai = null;
      surChangement();
    },

    pieces: () => essai?.pieces ?? [],
    impression: () => essai?.impression ?? impressionCourante(),

    /* Ce que l'aperçu montre, et ce que le G-code lit : le tranchage plus les modulations. */
    etat() {
      const brut = tranchage.etat();
      if (essai === null) return brut;
      const outil = essai.outil;
      const reglages = brut.reglages ?? {};
      const complet = { ...brut };
      if (outil.modulations) complet.modulations = outil.modulations(essai.parametres, brut.couches, reglages);
      // Les variantes ne dépendent pas du découpage en couches : une par
      // éprouvette, dans l'ordre où la géométrie les a rendues.
      if (essai.variantes.length > 0) {
        complet.modulationsDePiece = essai.variantes.map((v) => ({
          reglages: v.ecarts ?? {},
          etiquette: v.etiquette ?? "",
          decalageZ: v.decalageZ,
          vitesseImposee: v.vitesseImposee,
          facteurVitesse: v.facteurVitesse,
        }));
      }
      return complet;
    },

    /* Pour l'envoi à l'imprimante : la même attente que le plateau, éprouvettes comprises. */
    source() {
      if (essai === null) return null;
      const complet = this.etat.bind(this);
      return {
        nom: "calibration-" + essai.outil.id,
        async attendre() {
          const debut = performance.now();
          let dernierePart = -1;
          for (;;) {
            const etat = complet();
            if (etat.total > 0 && etat.restantes === 0 && tranchage.enCours() === 0) return etat;
            const part = Math.round((etat.avancement ?? 0) * 100);
            if (part !== dernierePart) {
              annoncer("Tranchage de l'éprouvette : " + part + " %");
              dernierePart = part;
            }
            if (performance.now() - debut > ATTENTE_MAX_MS) throw new Error("Le tranchage de l'éprouvette n'a pas abouti.");
            await new Promise((fin) => setTimeout(fin, INTERVALLE_MS));
          }
        },
      };
    },

    // ── Dépouillement ──
    /* Ce que la saisie donne comme réglages, sans encore les écrire. */
    conclure(idOutil, parametres, saisie) {
      const outil = outilDe(idOutil);
      const valeurs = { ...parametresParDefaut(outil, this.reglagesDeLaCombinaison()), ...parametres };
      return outil.depouillement.conclure(saisie, valeurs, this.reglagesDeLaCombinaison());
    },

    /* La conclusion retenue : elle entre dans la combinaison, pas dans le projet. */
    retenir(idOutil, conclusion) {
      const c = combinaisonActive();
      if (c === null) return;
      remplacer(avecResultatDEssai(c, idOutil, conclusion));
      const cles = Object.keys(conclusion.reglages);
      if (cles.length > 0) annoncer("« " + (outilDe(idOutil)?.nom ?? idOutil) + " » : " + cles.join(", ") + " mis à jour dans la combinaison.");
    },

    oublier(idOutil) {
      const c = combinaisonActive();
      if (c !== null) remplacer(sansResultatDEssai(c, idOutil));
    },

    /* Les réglages qu'un essai décide : le panneau les montre sur sa fiche. */
    reglagesDeLOutil: (idOutil) => reglagesDetermines(idOutil),
    outils: () => OUTILS,
  };
}
