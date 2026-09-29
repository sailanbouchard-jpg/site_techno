/*
 * application/actions_finitions.js
 * ────────────────────────────────
 * Trois outils qui travaillent sur une pièce déjà en volume :
 *   - Arêtes : chanfreins et congés sur les arêtes qu'on clique dans la vue ;
 *   - Couper : scinder une pièce par un plan (imprimer en deux fois) ;
 *   - Analyser : volume, masse, centre de gravité ; entre deux pièces, leur
 *     recouvrement et le jeu qui les sépare.
 * Arêtes et Couper posent la pièce dans un nœud qui la modifie (comme une
 * symétrie) ; « Retirer » la rend telle qu'elle était.
 */

import { trouverNoeud, cheminVers } from "../noyau/document.js";
import { parametresParDefaut, typeDeNoeud } from "../noyau/registre_types_de_noeuds.js";
import { creerNoeud } from "../noyau/noeud.js";
import { matriceDeTransformation, composer, inverser, appliquerAuPoint } from "../noyau/transformations.js";
import { commandeEnvelopper } from "../noyau/commandes/commande_envelopper.js";
import { commandeDegrouper } from "../noyau/commandes/commande_degrouper.js";
import { commandeModifierParametre } from "../noyau/commandes/commande_modifier_parametre.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import { MATIERES, proprietes, jeuMinimal } from "../noyau/analyse_des_maillages.js";

const arrondi = (valeur) => Math.round(valeur * 100) / 100 || 0;
const lisible = (x, decimales = 1) => x.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
// Un clic à moins de ça d'une arête déjà choisie la retire.
const TOLERANCE_PX = 10;
// Au-delà de ce jeu, deux pièces sont simplement « éloignées ».
const JEU_PLAFOND_MM = 10;

/* La matrice qui envoie le repère d'un nœud dans le monde : ses ancêtres, puis lui. */
function matriceMonde(document, id) {
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  for (const idAncetre of cheminVers(document, id)) {
    const noeud = trouverNoeud(document, idAncetre);
    if (noeud?.transformation) m = composer(m, matriceDeTransformation(noeud.transformation));
  }
  return m;
}

/* Une arête d'un repère à l'autre : les points par la matrice, les normales par sa partie linéaire. */
function transporterArete(arete, m) {
  const lineaire = (n) => {
    const v = [m[0] * n[0] + m[1] * n[1] + m[2] * n[2], m[4] * n[0] + m[5] * n[1] + m[6] * n[2], m[8] * n[0] + m[9] * n[1] + m[10] * n[2]];
    const l = Math.hypot(...v) || 1;
    return v.map((c) => c / l);
  };
  const arrondir = (p) => p.map((c) => Math.round(c * 1e4) / 1e4);
  return {
    points: arete.points.map((p) => arrondir(appliquerAuPoint(m, p))),
    n1: arete.n1.map((n) => arrondir(lineaire(n))),
    n2: arete.n2.map((n) => arrondir(lineaire(n))),
    ferme: arete.ferme,
  };
}

export function creerActionsFinitions({ etat, scene, annoncer, edition, operations, affichage }) {
  const parametresDe = (id) => {
    const noeud = trouverNoeud(etat.document(), id);
    return { ...parametresParDefaut(noeud.type), ...noeud.parametres };
  };
  function regler(id, valeurs) {
    const p = parametresDe(id);
    const commandes = Object.entries(valeurs)
      .filter(([cle, valeur]) => JSON.stringify(p[cle]) !== JSON.stringify(valeur))
      .map(([cle, valeur]) => commandeModifierParametre.creer(id, cle, p[cle], valeur));
    if (commandes.length > 0) etat.executer(commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, "Régler"));
  }

  /* Pose la pièce sélectionnée dans un nœud de ce type. Rend { id, taille }. */
  function envelopper(nomDuType, parametresPour) {
    const ids = edition.selectionAffichee();
    if (ids.length !== 1) throw new Error("Sélectionner une seule pièce.");
    const boite = scene.boiteMonde(ids[0]);
    if (boite === null) throw new Error("La pièce se calcule encore : réessayer dans un instant.");
    const [x, y, z] = [0, 1, 2].map((i) => arrondi(boite.max[i] - boite.min[i]));
    const taille = { x, y, z };
    const appui = { x: (boite.min[0] + boite.max[0]) / 2, y: (boite.min[1] + boite.max[1]) / 2, z: boite.min[2] };
    const parametres = {
      ...parametresParDefaut(nomDuType),
      centreObjet: { x: 0, y: 0, z: arrondi(taille.z / 2) },
      tailleObjet: taille,
      ...parametresPour(taille),
    };
    const commande = commandeEnvelopper.creer(etat.document(), ids[0], nomDuType, parametres, appui);
    etat.executer(commande);
    return { id: commande.enveloppe.id, taille };
  }

  // ── Arêtes ────────────────────────────────────────────────────────────────

  function operationAretes(idExistant) {
    let id = idExistant;
    let survolee = null;       // l'arête sous la souris, dans le monde
    const aretesMonde = () => {
      const m = matriceMonde(etat.document(), id);
      return (parametresDe(id).aretes ?? []).map((a) => transporterArete(a, m));
    };
    const versEcran = (p) => scene.versEcran(p);
    // L'arête choisie la plus proche du clic, à l'écran : son rang, ou -1.
    const choisieSous = (x, y) => {
      let rang = -1;
      let ecart = TOLERANCE_PX;
      aretesMonde().forEach((a, k) => {
        const pts = a.ferme ? [...a.points, a.points[0]] : a.points;
        for (let i = 1; i < pts.length; i += 1) {
          const [e1, e2] = [versEcran(pts[i - 1]), versEcran(pts[i])];
          const [dx, dy] = [e2[0] - e1[0], e2[1] - e1[1]];
          const l2 = dx * dx + dy * dy;
          const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - e1[0]) * dx + (y - e1[1]) * dy) / l2));
          const d = Math.hypot(x - e1[0] - t * dx, y - e1[1] - t * dy);
          if (d < ecart) {
            ecart = d;
            rang = k;
          }
        }
      });
      return rang;
    };
    const note = () => {
      const n = (parametresDe(id).aretes ?? []).length;
      return n === 0 ? "Aucune arête choisie." : n + (n > 1 ? " arêtes choisies." : " arête choisie.") + " Cliquer une arête choisie la retire.";
    };

    const operation = {
      titre: "Chanfreins et congés",
      icone: "aretes",
      libelle: "Chanfreins et congés",
      champs: [
        {
          genre: "choix", cle: "genre", etiquette: "Forme",
          options: [
            { valeur: "chanfrein", etiquette: "Chanfrein", aide: "Un pan incliné remplace l'arête." },
            { valeur: "conge", etiquette: "Congé", aide: "Un arrondi remplace l'arête." },
          ],
        },
        { genre: "nombre", cle: "taille", etiquette: "Taille", unite: "mm", min: 0.1, max: 200 },
        { genre: "note", texte: note },
      ],
      idDuNoeud: () => id,
      consigne: () => "Cliquer dans la vue les arêtes à casser (droites ou courbes, saillantes).",

      preparer() {
        if (id === null) id = envelopper("aretes", () => ({ genre: "chanfrein", taille: 1, aretes: [] })).id;
        const p = parametresDe(id);
        return { genre: p.genre, taille: p.taille };
      },

      changer(cle, valeur, valeurs) {
        regler(id, { [cle]: valeur });
        return { ...valeurs, [cle]: valeur };
      },

      aides() {
        const aides = aretesMonde().map((a) => ({ genre: "arete", points: a.points, ferme: a.ferme }));
        if (survolee !== null) aides.push({ genre: "arete", points: survolee.points, ferme: survolee.ferme, fort: true });
        return aides;
      },

      geste(genre, evenement) {
        const [x, y] = [evenement.clientX, evenement.clientY];
        if (genre === "survol") {
          const sous = scene.areteSous(x, y);
          const nouvelle = sous !== null && sous.id === id && sous.saillante ? sous.arete : null;
          const signature = (a) => (a === null ? "" : a.points.length + ":" + a.points[0].join(","));
          if (signature(nouvelle) !== signature(survolee)) {
            survolee = nouvelle;
            operations.rafraichir();
          }
          return false;
        }
        if (genre !== "appui" || evenement.button !== 0) return false;
        const rang = choisieSous(x, y);
        const aretes = [...(parametresDe(id).aretes ?? [])];
        if (rang >= 0) {
          aretes.splice(rang, 1);
          regler(id, { aretes });
          operations.rafraichir();
          return true;
        }
        const sous = scene.areteSous(x, y);
        if (sous === null || sous.id !== id) return false;
        if (!sous.saillante) {
          annoncer("Arête rentrante : chanfreins et congés ne s'appliquent qu'aux arêtes saillantes. Pour un creux arrondi, arrondir le coin dans l'esquisse.", true);
          return true;
        }
        aretes.push(transporterArete(sous.arete, inverser(matriceMonde(etat.document(), id))));
        survolee = null;
        regler(id, { aretes });
        operations.rafraichir();
        return true;
      },
    };
    return operation;
  }

  // ── Couper ────────────────────────────────────────────────────────────────

  const NORMALES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const milieu = (axe, taille) => (axe === "z" ? arrondi(taille.z / 2) : 0);

  function operationCouper(idExistant) {
    let id = idExistant;
    const type = typeDeNoeud("decoupe");
    return {
      titre: "Couper",
      icone: "decoupe",
      libelle: "Couper",
      champs: [
        { genre: "choix", cle: "axe", etiquette: type.parametres.axe.etiquette, options: type.parametres.axe.choix },
        { genre: "nombre", cle: "position", etiquette: "Position du plan", unite: "mm", min: -2000, max: 2000, aide: "Depuis le pied de la pièce pour une coupe horizontale, depuis son milieu sinon." },
        { genre: "choix", cle: "garder", etiquette: "Garder", options: type.parametres.garder.choix },
        { genre: "nombre", cle: "ecart", etiquette: "Écart", unite: "mm", min: 0, max: 500, visible: (v) => v.garder === "deux" },
      ],
      idDuNoeud: () => id,
      consigne: () => "Placer le plan de coupe : il se voit dans la vue.",

      preparer() {
        if (id === null) id = envelopper("decoupe", (taille) => ({ axe: "z", position: milieu("z", taille), garder: "deux", ecart: 5 })).id;
        const p = parametresDe(id);
        return { axe: p.axe, position: p.position, garder: p.garder, ecart: p.ecart };
      },

      changer(cle, valeur, valeurs) {
        const suivantes = { ...valeurs, [cle]: valeur };
        // Changer d'axe replace le plan au milieu de la pièce.
        if (cle === "axe") suivantes.position = milieu(valeur, parametresDe(id).tailleObjet);
        regler(id, suivantes);
        return suivantes;
      },

      aides(valeurs) {
        const m = matriceMonde(etat.document(), id);
        const n = NORMALES[valeurs.axe];
        const t = parametresDe(id).tailleObjet;
        const local = [0, 0, t.z / 2].map((c, k) => (n[k] === 1 ? valeurs.position : c));
        return [{ genre: "plan", centre: appliquerAuPoint(m, local), normale: n, taille: Math.max(t.x, t.y, t.z) * 1.4 + 10 }];
      },
    };
  }

  // ── Analyser ──────────────────────────────────────────────────────────────

  function operationAnalyser() {
    let texte = "";
    let calcul = 0;

    function analyser(valeurs) {
      const document = etat.document();
      const ids = edition.selectionAffichee();
      const matiere = MATIERES.find((m) => m.valeur === valeurs.matiere) ?? MATIERES[0];
      const pieces = ids.map((id) => ({ id, noeud: trouverNoeud(document, id), maillage: scene.maillageMonde(id) }))
        .filter((p) => p.noeud !== null && p.maillage !== null);
      if (pieces.length === 0) return "Aucune pièce calculée dans la sélection.";
      const lignes = [];
      let masseTotale = 0;
      for (const piece of pieces) {
        const { volume, surface, centre, boite } = proprietes(piece.maillage);
        const masse = volume / 1000 * matiere.densite;
        masseTotale += masse;
        const dims = [0, 1, 2].map((k) => lisible(boite.max[k] - boite.min[k]));
        lignes.push("• " + edition.nommer(piece.noeud) + " : " + lisible(volume / 1000, 2) + " cm³, " + lisible(masse, 1) + " g "
          + "(" + matiere.etiquette + " plein), surface " + lisible(surface / 100, 1) + " cm², " + dims.join(" × ") + " mm, "
          + "centre de gravité (" + centre.map((c) => lisible(c)).join(" ; ") + ")");
      }
      if (pieces.length > 1) lignes.push("Masse totale : " + lisible(masseTotale, 1) + " g (pièces pleines ; le remplissage du trancheur l'allège).");

      // Entre chaque paire : le recouvrement (calcul exact du moteur), sinon le jeu (approché).
      const numero = ++calcul;
      const paires = [];
      for (let i = 0; i < pieces.length; i += 1) for (let j = i + 1; j < pieces.length; j += 1) paires.push([pieces[i], pieces[j]]);
      if (paires.length > 0) {
        lignes.push("Entre les pièces : calcul en cours…");
        Promise.all(paires.map(async ([a, b]) => {
          const commun = creerNoeud({ type: "groupe", parametres: { assemblage: "commun" }, enfants: [a.noeud, b.noeud].map((n) => ({ ...n, trou: false })) });
          const maillage = await affichage.calculer(commun);
          const recouvrement = maillage.triangles > 0 ? proprietes(maillage).volume : 0;
          const nom = edition.nommer(a.noeud) + " / " + edition.nommer(b.noeud);
          if (recouvrement > 1e-3) return "• " + nom + " : elles se recouvrent de " + lisible(recouvrement, 2) + " mm³ — interférence.";
          const jeu = jeuMinimal(a.maillage, b.maillage, JEU_PLAFOND_MM);
          if (jeu === Infinity) return "• " + nom + " : éloignées de plus de " + JEU_PLAFOND_MM + " mm.";
          return "• " + nom + " : jeu minimal ≈ " + lisible(jeu, 2) + " mm" + (jeu < 0.15 ? " — trop serré pour une impression (viser 0,2 à 0,3 mm)." : ".");
        })).then((resultats) => {
          if (numero !== calcul) return;
          texte = texte.replace("Entre les pièces : calcul en cours…", "Entre les pièces :\n" + resultats.join("\n"));
          operations.rafraichir();
        }).catch((erreur) => {
          if (numero !== calcul) return;
          texte = texte.replace("Entre les pièces : calcul en cours…", "Entre les pièces : " + erreur.message);
          operations.rafraichir();
        });
      }
      return lignes.join("\n");
    }

    return {
      titre: "Analyser",
      icone: "analyse",
      libelle: "Analyser",
      texteValider: "Fermer",
      champs: [
        { genre: "choix", cle: "matiere", etiquette: "Matière", options: MATIERES.map((m) => ({ valeur: m.valeur, etiquette: m.etiquette })) },
        { genre: "note", texte: () => texte },
      ],
      consigne: () => "Mesures des pièces sélectionnées. Avec plusieurs pièces : recouvrements et jeux entre elles.",
      preparer() {
        if (edition.selectionAffichee().length === 0) throw new Error("Sélectionner au moins une pièce à analyser.");
        const valeurs = { matiere: "pla" };
        texte = analyser(valeurs);
        return valeurs;
      },
      changer(cle, valeur, valeurs) {
        const suivantes = { ...valeurs, [cle]: valeur };
        texte = analyser(suivantes);
        return suivantes;
      },
    };
  }

  return {
    aretes: () => operations.demarrer(operationAretes(null)),
    couper: () => operations.demarrer(operationCouper(null)),
    analyser: () => operations.demarrer(operationAnalyser()),

    /* Les boutons de l'inspecteur pour un nœud de finition. */
    actionsDe(noeud) {
      if (noeud.type !== "aretes" && noeud.type !== "decoupe") return [];
      const type = typeDeNoeud(noeud.type);
      return [
        {
          icone: type.icone, texte: "Régler", titre: "Rouvre la fenêtre de réglage.", actif: true,
          action: () => operations.demarrer(noeud.type === "aretes" ? operationAretes(noeud.id) : operationCouper(noeud.id)),
        },
        {
          icone: "degrouper", texte: noeud.type === "aretes" ? "Retirer les chanfreins" : "Retirer la découpe",
          titre: "Rend la pièce telle qu'elle était.", actif: true,
          action: () => {
            try {
              etat.executer(commandeDegrouper.creer(etat.document(), noeud.id));
            } catch (erreur) {
              annoncer(erreur.message, true);
            }
          },
        },
      ];
    },

    disponibilites() {
      const n = edition.selectionAffichee().length;
      return { extrusion_face: etat.esquisseOuverte() === null, aretes: n === 1, decoupe: n === 1, analyse: n >= 1 };
    },
  };
}
