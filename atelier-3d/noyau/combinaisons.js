/*
 * noyau/combinaisons.js
 * ─────────────────────
 * Une combinaison : une imprimante, une buse, une plaque, un matériau, des
 * réglages d'impression, et l'état de calibration de cet ensemble-là.
 *
 * Le problème qu'elle règle. Dans tous les trancheurs, les préréglages se
 * choisissent séparément, et rien ne dit lequel va avec lequel : on ne sait
 * plus quel profil de vitesse a été calibré pour quelle bobine sur quelle
 * machine. Une combinaison nomme l'ensemble une fois pour toutes et garde,
 * pour chaque essai, ce qu'il a conclu et quand.
 *
 * Elle ne vit pas dans le document du projet : un projet ne possède pas ses
 * réglages de calibration, il en choisit le résultat. Quand une combinaison est
 * jugée bonne, elle est exportée en préréglages personnels, utilisables dans le
 * slicer comme ceux fournis.
 *
 * Les dépendances entre essais. Les outils de calibration sont dans un ordre
 * (noyau/calibration.js) et chacun suppose justes ceux qui le précèdent. Si un
 * essai est refait, tous ceux d'après retombent à « à refaire » : c'est la
 * seule règle, et elle suffit.
 *
 * Comparer deux combinaisons. Deux combinaisons qui partagent un préréglage
 * doivent y trouver les mêmes valeurs : le même matériau calibré sur deux
 * plaques doit donner le même débit, la même température, la même rétraction.
 * Un écart entre les deux est un doute — sur la mesure, pas sur la plaque.
 * C'est ce que compare comparaisonDesCombinaisons.
 */

import { OUTILS } from "./calibration.js";
import {
  REGLAGES, SOURCES, valeurDuPrereglage, ecartsNettoyes, choixCoherents, prereglage,
} from "./reglages_impression.js";

export const FORMAT = "atelier-3d-combinaisons";

const maintenant = () => new Date().toISOString().slice(0, 10);

let compteur = 0;
const nouvelIdentifiant = () => {
  compteur += 1;
  return "c" + Date.now().toString(36) + compteur.toString(36);
};

/* Une combinaison neuve, partant des préréglages donnés. */
export function creerCombinaison(champs = {}) {
  return Object.freeze({
    id: champs.id ?? nouvelIdentifiant(),
    nom: champs.nom ?? "Combinaison",
    ...choixCoherents(champs),
    ecarts: Object.freeze({ ...(champs.ecarts ?? {}) }),
    essais: Object.freeze({ ...(champs.essais ?? {}) }),
    creeLe: champs.creeLe ?? maintenant(),
    modifieLe: champs.modifieLe ?? maintenant(),
    exporteeLe: champs.exporteeLe ?? null,
    // Le jour où un choix a changé : les essais conclus avant ne valent plus,
    // ils ont été mesurés dans d'autres conditions.
    choixModifiesLe: champs.choixModifiesLe ?? null,
  });
}

/* Ce qu'une combinaison donne au trancheur : la même forme qu'une section impression. */
export function impressionDeLaCombinaison(combinaison) {
  return Object.freeze({
    ...Object.fromEntries(SOURCES.map(({ id }) => [id, combinaison[id]])),
    ecarts: combinaison.ecarts,
    pieces: Object.freeze([]),
  });
}

/* Une combinaison modifiée : la date de modification suit, les écarts sont nettoyés. */
export function avecChamps(combinaison, modifications) {
  const suivante = { ...combinaison, ...modifications, modifieLe: maintenant() };
  return creerCombinaison({ ...suivante, ecarts: ecartsNettoyes(suivante, suivante.ecarts) });
}

/* Le résultat d'un essai, rangé dans la combinaison, avec les réglages qu'il a conclus. */
export function avecResultatDEssai(combinaison, idOutil, conclusion) {
  const essais = { ...combinaison.essais, [idOutil]: { date: maintenant(), texte: conclusion.texte, reglages: { ...conclusion.reglages } } };
  return avecChamps(combinaison, { essais, ecarts: { ...combinaison.ecarts, ...conclusion.reglages } });
}

export function sansResultatDEssai(combinaison, idOutil) {
  const essais = { ...combinaison.essais };
  delete essais[idOutil];
  return avecChamps(combinaison, { essais });
}

/*
 * L'état de chaque essai, dans l'ordre conseillé :
 *   "a_faire"   jamais conclu ;
 *   "fait"      conclu, et rien de ce dont il dépend n'a bougé depuis ;
 *   "a_refaire" conclu avant un essai qui le précède : sa valeur n'est plus sûre.
 */
export function etatDesEssais(combinaison) {
  const etats = {};
  let dernierePrecedente = null;
  const choix = combinaison.choixModifiesLe;
  for (const outil of OUTILS) {
    const fait = combinaison.essais[outil.id] ?? null;
    if (fait === null) {
      etats[outil.id] = { etat: "a_faire", date: null, texte: null };
    } else {
      const perime = (dernierePrecedente !== null && fait.date < dernierePrecedente)
        || (choix !== null && fait.date < choix);
      etats[outil.id] = { etat: perime ? "a_refaire" : "fait", date: fait.date, texte: fait.texte };
    }
    if (fait !== null && (dernierePrecedente === null || fait.date > dernierePrecedente)) dernierePrecedente = fait.date;
  }
  return etats;
}

/* Combien d'essais sont faits et à jour. */
export function avancementDeLaCalibration(combinaison) {
  const etats = etatDesEssais(combinaison);
  const total = OUTILS.length;
  const faits = OUTILS.filter((o) => etats[o.id].etat === "fait").length;
  return { faits, total, etats };
}

/*
 * Les préréglages personnels d'une combinaison exportée : chaque source reçoit
 * les valeurs effectives des réglages qui lui appartiennent. Le résultat se
 * branche dans definirLesPrereglagesPersonnels.
 */
export function prereglagesDeLaCombinaison(combinaison) {
  const sortie = {};
  for (const { id: source } of SOURCES) {
    const valeurs = {};
    for (const r of REGLAGES) {
      if (r.source !== source) continue;
      valeurs[r.cle] = r.cle in combinaison.ecarts ? combinaison.ecarts[r.cle] : valeurDuPrereglage(combinaison, r.cle);
    }
    const base = prereglage(source, combinaison[source]);
    sortie[source] = [{
      id: "perso:" + combinaison.id + ":" + source,
      nom: combinaison.nom,
      personnel: true,
      combinaison: combinaison.id,
      // Le matériel, la matière et la buse suivent le préréglage dont la combinaison est partie.
      machine: base?.machine,
      matiere: base?.matiere,
      buse: combinaison.buse,
      valeurs,
    }];
  }
  return sortie;
}

/*
 * La comparaison d'une combinaison avec celles qui partagent le même préréglage
 * pour une source donnée. Rend, pour chaque réglage déterminé par un essai et
 * appartenant à cette source, ce que chaque combinaison a trouvé :
 *   { source, autres: [combinaison], lignes: [{ cle, etiquette, unite, valeurs, accord }] }
 * accord : true si toutes les combinaisons ont conclu la même valeur.
 * Rend null quand il n'y a personne à qui se comparer.
 */
export function comparaisonDesCombinaisons(combinaisons, active, source) {
  const autres = combinaisons.filter((c) => c.id !== active.id && c[source] === active[source] && c[source] !== null);
  if (autres.length === 0) return null;
  const toutes = [active, ...autres];
  const lignes = [];
  for (const r of REGLAGES) {
    if (r.source !== source || r.role !== "a_determiner") continue;
    const valeurs = toutes.map((c) => ({
      id: c.id,
      nom: c.nom,
      // Ce que l'essai a conclu pour cette combinaison, et rien d'autre : une
      // valeur qui vient encore du préréglage ne prouve rien.
      valeur: c.essais[r.determinePar] === undefined ? null
        : (r.cle in c.ecarts ? c.ecarts[r.cle] : valeurDuPrereglage(c, r.cle)),
    }));
    if (valeurs.every((v) => v.valeur === null)) continue;
    const connues = valeurs.filter((v) => v.valeur !== null).map((v) => v.valeur);
    lignes.push({
      cle: r.cle, etiquette: r.etiquette, unite: r.unite ?? "",
      valeurs,
      accord: connues.length < 2 ? null : connues.every((v) => v === connues[0]),
    });
  }
  return lignes.length === 0 ? null : { source, autres, lignes };
}

/* Relecture : ce qui n'a pas la forme d'une combinaison est laissé de côté. */
export function combinaisonDepuisBrut(brut) {
  if (brut === null || typeof brut !== "object" || typeof brut.id !== "string") return null;
  const essais = {};
  for (const [id, valeur] of Object.entries(brut.essais ?? {})) {
    if (valeur === null || typeof valeur !== "object") continue;
    essais[id] = {
      date: typeof valeur.date === "string" ? valeur.date : maintenant(),
      texte: typeof valeur.texte === "string" ? valeur.texte : "",
      reglages: typeof valeur.reglages === "object" && valeur.reglages !== null ? valeur.reglages : {},
    };
  }
  const partielle = {
    ...brut,
    essais,
    ecarts: typeof brut.ecarts === "object" && brut.ecarts !== null ? brut.ecarts : {},
  };
  return creerCombinaison({ ...partielle, ecarts: ecartsNettoyes(partielle, partielle.ecarts) });
}
