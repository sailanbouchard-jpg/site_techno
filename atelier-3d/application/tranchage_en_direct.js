/*
 * application/tranchage_en_direct.js
 * ──────────────────────────────────
 * Le tranchage suit le plateau sans qu'on le demande : une pièce déplacée,
 * tournée ou modifiée, un réglage changé, et seules les pièces touchées sont
 * retranchées. Le résultat précédent reste affiché jusqu'au nouveau.
 *
 * Chaque pièce est tranchée à part, sous une clé qui résume tout ce dont son
 * résultat dépend : sa forme (empreinte), sa pose sur le plateau, et les
 * réglages. Même clé, même résultat : il est gardé.
 *
 * Une pièce peut porter ses PROPRES écarts de réglages (piece.ecarts) : elle est
 * alors tranchée avec eux. C'est ce qui permet de comparer dans une seule
 * impression des réglages que le trancheur applique lui-même — quatre
 * stratégies de surplomb, deux vitesses de paroi — et pas seulement des valeurs
 * que le G-code porte. Seul ce qui ne change pas le découpage en couches peut
 * varier ainsi : la hauteur de couche et celle de la première reste commune à
 * tout le plateau, sinon les couches ne seraient plus alignées.
 *
 * La jupe entoure toutes les pièces : elle est calculée à part, une fois que
 * chaque pièce a donné son contour au sol.
 *
 * L'avancement : chaque pièce annonce où elle en est, et pèse dans le total
 * selon le travail qu'elle demande (ses couches × l'aire de son emprise). Sans
 * cette pondération, un plateau fait d'une grosse pièce et d'une petite
 * sauterait à 50 % puis semblerait bloqué, et deux tranchages différents
 * n'avanceraient pas au même rythme.
 */

import { empreinteDeNoeud } from "../noyau/empreinte_de_noeud.js";
import { matriceDeTransformation } from "../noyau/transformations.js";
import { valeursEffectives } from "../noyau/reglages_impression.js";
import { NOMBRE_DE_TYPES } from "../tranchage/protocole_tranchage.js";

// Au-delà, on oublie les plus anciens résultats : ceux des poses essayées puis abandonnées.
const RESULTATS_GARDES = 60;
const arrondi = (v) => Math.round(v * 1e4) / 1e4;

/* Les couches du plateau : la première, puis des couches régulières jusqu'au sommet. */
export function couchesDuPlateau(hauteurMax, premiere, courante) {
  const hauteurs = [];
  const epaisseurs = [];
  if (!(hauteurMax > 0)) return { hauteurs, epaisseurs };
  hauteurs.push(arrondi(premiere));
  epaisseurs.push(arrondi(premiere));
  // Une dernière couche n'est ajoutée que si la pièce en remplit plus de la moitié.
  while (hauteurs.at(-1) + courante / 2 < hauteurMax) {
    hauteurs.push(arrondi(hauteurs.at(-1) + courante));
    epaisseurs.push(arrondi(courante));
  }
  return { hauteurs, epaisseurs };
}

/*
 * dependances : { surResultat(), surAvancement(), annoncer(texte, erreur) }
 */
export function creerTranchageEnDirect(dependances) {
  const ouvrier = new Worker(new URL("../tranchage/ouvrier_tranchage.js", import.meta.url), { type: "module" });
  let compteur = 0;
  const resultats = new Map();     // clé → { points, chemins, bilan, sol }
  const avancements = new Map();   // clé → part déjà faite (0 à 1) de la pièce en cours
  const poids = new Map();         // clé → le travail que cette pièce demande
  const enCours = new Map();       // clé → identifiant de requête
  const clesParRequete = new Map();
  let voulues = [];                // [{ id, cle }] : ce que le plateau montre en ce moment
  let couches = { hauteurs: [], epaisseurs: [] };
  let cleDeLaJupe = null;
  let reglagesCourants = null;

  ouvrier.onmessage = (evenement) => {
    const reponse = evenement.data;
    const cle = clesParRequete.get(reponse.id);
    if (reponse.avancement !== undefined) {
      if (cle !== undefined) avancements.set(cle, reponse.avancement);
      dependances.surAvancement();
      return;
    }
    clesParRequete.delete(reponse.id);
    if (cle === undefined) {
      if (!reponse.ok) dependances.annoncer(reponse.erreur, true);
      return;
    }
    enCours.delete(cle);
    avancements.delete(cle);
    if (!reponse.ok) {
      dependances.annoncer(reponse.erreur, true);
      return;
    }
    resultats.set(cle, {
      points: reponse.points, chemins: reponse.chemins, sol: reponse.sol,
      bilan: reponse.bilan, coutures: reponse.coutures, contours: reponse.contours,
    });
    demanderLaJupe();
    while (resultats.size > RESULTATS_GARDES) resultats.delete(resultats.keys().next().value);
    dependances.surResultat();
  };
  ouvrier.onerror = (evenement) => dependances.annoncer("Le moteur de tranchage s'est arrêté : " + (evenement.message ?? "erreur inconnue"), true);

  function envoyer(cle, message) {
    compteur += 1;
    const id = compteur;
    enCours.set(cle, id);
    clesParRequete.set(id, cle);
    ouvrier.postMessage({ id, ...message });
  }

  function demander(cle, piece, couchesDeLaPiece, reglages) {
    envoyer(cle, {
      type: "trancher",
      positions: piece.maillage.positions, indices: piece.maillage.indices,
      matrice: piece.matrice, couches: couchesDeLaPiece, reglages,
    });
  }

  /* Quand toutes les pièces ont leur contour au sol, la jupe peut les entourer. */
  function demanderLaJupe() {
    cleDeLaJupe = null;
    if (reglagesCourants === null || reglagesCourants.tours_jupe === 0) return;
    const pieces = voulues.map((v) => resultats.get(v.cle));
    if (pieces.length === 0 || pieces.some((p) => p === undefined)) return;
    const sols = pieces.map((p) => p.sol).filter((s) => s.length > 0);
    const cle = "jupe|" + JSON.stringify(sols) + "|" + ["tours_jupe", "distance_jupe", "largeur_premiere_couche", "hauteur_premiere_couche"]
      .map((c) => reglagesCourants[c]).join(",");
    cleDeLaJupe = cle;
    if (!resultats.has(cle) && !enCours.has(cle)) {
      envoyer(cle, {
        type: "jupe", sols, reglages: reglagesCourants,
        couches: { hauteurs: couches.hauteurs.slice(0, 1), epaisseurs: couches.epaisseurs.slice(0, 1) },
      });
    }
  }

  return {
    /*
     * pieces : [{ id, noeud, maillage, transformation (repère machine), hauteur }]
     * impression : la section du document (préréglage et écarts)
     */
    mettreAJour(pieces, impression) {
      const reglages = valeursEffectives(impression);
      reglagesCourants = reglages;
      const hauteurMax = Math.max(0, ...pieces.map((p) => p.hauteur));
      couches = couchesDuPlateau(hauteurMax, reglages.hauteur_premiere_couche, reglages.hauteur_couche);
      const texteDesReglages = JSON.stringify(reglages);

      voulues = pieces.map((piece) => {
        const matrice = matriceDeTransformation(piece.transformation).map(arrondi);
        // Les écarts propres à la pièce, s'il y en a : ils entrent dans la clé,
        // sinon deux pièces identiques aux réglages différents se partageraient
        // le même résultat.
        const siennes = piece.ecarts === undefined ? reglages : { ...reglages, ...piece.ecarts };
        const texteDesSiennes = piece.ecarts === undefined ? texteDesReglages : JSON.stringify(siennes);
        const cle = [empreinteDeNoeud(piece.noeud), matrice.join(","), piece.hauteur.toFixed(4), texteDesSiennes].join("|");
        const nombre = couches.hauteurs.findIndex((h, k) => h - couches.epaisseurs[k] >= piece.hauteur);
        const tranche = nombre < 0 ? couches : {
          hauteurs: couches.hauteurs.slice(0, nombre), epaisseurs: couches.epaisseurs.slice(0, nombre),
        };
        poids.set(cle, travailDe(piece, tranche.hauteurs.length));
        if (!resultats.has(cle) && !enCours.has(cle)) demander(cle, { ...piece, matrice }, tranche, siennes);
        return { id: piece.id, cle };
      });

      demanderLaJupe();
      // Ce qui n'est plus voulu n'est plus calculé.
      const cles = new Set([...voulues.map((v) => v.cle), cleDeLaJupe]);
      for (const [cle, id] of enCours) {
        if (cles.has(cle)) continue;
        ouvrier.postMessage({ type: "annuler", id });
        enCours.delete(cle);
        clesParRequete.delete(id);
      }
    },

    /* Ce que l'aperçu montre : les pièces déjà tranchées, et où en est le reste. */
    etat() {
      // L'identifiant suit le résultat : le diagnostic peut nommer la pièce.
      const pieces = voulues
        .map((v) => (resultats.has(v.cle) ? { ...resultats.get(v.cle), idNoeud: v.id } : undefined))
        .filter((r) => r !== undefined);
      const restantes = voulues.length - pieces.length;
      const jupe = cleDeLaJupe === null ? undefined : resultats.get(cleDeLaJupe);
      // La jupe passe devant les pièces : elle est marquée, sinon les modulations
      // de pièce se décaleraient toutes d'un rang.
      if (jupe !== undefined) pieces.unshift({ ...jupe, jupe: true });
      const avancement = avancementDuPlateau();
      return {
        couches, pieces, ...totaux(pieces, couches.hauteurs.length, reglagesCourants),
        reglages: reglagesCourants, restantes, total: voulues.length, avancement,
      };
    },

    enCours: () => enCours.size,
  };

  /* Ce qui est fait sur l'ensemble du plateau, de 0 à 1. */
  function avancementDuPlateau() {
    let total = 0;
    let fait = 0;
    for (const { cle } of voulues) {
      const travail = poids.get(cle) ?? 1;
      total += travail;
      fait += resultats.has(cle) ? travail : travail * (avancements.get(cle) ?? 0);
    }
    if (total === 0) return 1;
    // La jupe attend le contour de toutes les pièces : elle vaut le dernier pour cent.
    const jupeALaTraine = cleDeLaJupe !== null && !resultats.has(cleDeLaJupe);
    return Math.min(jupeALaTraine ? 0.99 : 1, fait / total);
  }
}

/*
 * Le travail que demande une pièce : ses couches multipliées par l'aire de son
 * emprise (le remplissage, qui prend le plus de temps, y est proportionnel).
 */
function travailDe(piece, nombreDeCouches) {
  const positions = piece.maillage.positions;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y] = [positions[i], positions[i + 1]];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const aire = Number.isFinite(x0) ? Math.max(1, (x1 - x0) * (y1 - y0)) : 1;
  return aire * Math.max(1, nombreDeCouches);
}

/*
 * Les totaux du plateau. Une couche imprimée en moins de « temps de couche
 * minimal » n'a pas le temps de refroidir : l'imprimante ralentit pour
 * l'atteindre. Le ralentissement se répartit sur les types de la couche.
 * Rend { parType: Map(type → { temps, volume }), deplacements, ralentissement,
 *        facteurs: Float64Array — le ralentissement de chaque couche (1 : aucun),
 *        durees: Float64Array — la durée de chaque couche, ralentissement compris, en secondes }.
 */
function totaux(pieces, nombreDeCouches, reglages) {
  const temps = new Float64Array(NOMBRE_DE_TYPES);
  const volumes = new Float64Array(NOMBRE_DE_TYPES);
  let deplacements = 0;
  let ralentissement = 0;
  const facteurs = new Float64Array(nombreDeCouches).fill(1);
  const durees = new Float64Array(nombreDeCouches);
  for (let k = 0; k < nombreDeCouches; k += 1) {
    const couche = new Float64Array(NOMBRE_DE_TYPES);
    let deplacement = 0;
    for (const p of pieces) {
      if (k * NOMBRE_DE_TYPES >= p.bilan.temps.length) continue;
      for (let t = 0; t < NOMBRE_DE_TYPES; t += 1) couche[t] += p.bilan.temps[k * NOMBRE_DE_TYPES + t];
      deplacement += p.bilan.deplacements[k] ?? 0;
    }
    const duree = couche.reduce((s, v) => s + v, 0);
    const facteur = duree > 0 && reglages !== null && duree < reglages.temps_couche_min ? reglages.temps_couche_min / duree : 1;
    ralentissement += duree * (facteur - 1);
    facteurs[k] = facteur;
    durees[k] = duree * facteur + deplacement;
    for (let t = 0; t < NOMBRE_DE_TYPES; t += 1) temps[t] += couche[t] * facteur;
    deplacements += deplacement;
  }
  for (const p of pieces) {
    for (let t = 0; t < NOMBRE_DE_TYPES; t += 1) volumes[t] += p.bilan.volumes[t];
  }
  const parType = new Map();
  for (let t = 0; t < NOMBRE_DE_TYPES; t += 1) {
    if (temps[t] > 0 || volumes[t] > 0) parType.set(t, { temps: temps[t], volume: volumes[t] });
  }
  return { parType, deplacements, ralentissement, facteurs, durees };
}
