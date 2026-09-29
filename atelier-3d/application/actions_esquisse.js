/*
 * application/actions_esquisse.js
 * ───────────────────────────────
 * Ouvrir une esquisse, y tracer, la refermer, en tirer un solide. Comme les
 * autres actions, tout passe par des commandes ; ce module fournit en plus
 * aux outils de tracé ce dont ils ont besoin pour viser le plan.
 */

import { trouverNoeud, trouverParent } from "../noyau/document.js";
import { nouvelObjet } from "../noyau/fabrique_de_noeuds.js";
import { esquissesVisibles, objetsAffichables } from "../noyau/objets_affichables.js";
import {
  fournitUnProfil, consommeUnProfil, solidesDEsquisse, solidesMultiEsquisses, typeDeNoeud, parametresParDefaut,
} from "../noyau/registre_types_de_noeuds.js";
import { contenuDe, recalerLesArcs, centresDArc, ajouterPolyligne } from "../noyau/esquisse/elements_esquisse.js";
import {
  analyserEsquisse, regionsPleines, pointsDeCourbe, courbeSous, boiteDeLEsquisse, contoursPourUnion, dansLeProfil, boutsLibres,
} from "../noyau/esquisse/contours_esquisse.js";
import { libelleDuPlan, nomsDesAxes, repereDeFace, matriceDeLEsquisse } from "../noyau/esquisse/plans_esquisse.js";
import {
  resoudre, degresDeLiberte, ajouterContrainte, supprimerContrainte, changerValeur, changerDecalage, coteActuelle,
  dessinDesContraintes, avecContraintesAutomatiques, GENRES_COTES, NOMS_DES_CONTRAINTES,
  contraintesRedondantes, seraitRedondante, contraintesFausses,
} from "../noyau/esquisse/contraintes_esquisse.js";
import {
  pointsMarques, referencesAccessibles, referencesDe, projeter, problemeDeReference, numeroDeLEsquisse, esquissesDansLOrdre, refusDeLOrdre, liensDuNoeud,
} from "../noyau/esquisse/references_esquisse.js";
import { operationPlanParReference } from "./operations/operation_plan_par_reference.js";
import {
  solidesPossibles, repereDeLEsquisse, esquisseDe, solidesDeLEsquisse, contientUnSolideDe, sourcesDesEsquisses,
} from "../noyau/esquisse/solides_d_esquisse.js";
import { appliquerAuPoint } from "../noyau/transformations.js";

const nombreLisible = (x) => x.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
import { commandeAjouterNoeud } from "../noyau/commandes/commande_ajouter_noeud.js";
import { commandeSupprimerNoeud } from "../noyau/commandes/commande_supprimer_noeud.js";
import { commandeModifierEsquisse } from "../noyau/commandes/commande_modifier_esquisse.js";
import { lireSaisie, texteDeFormule } from "../interface/saisie_de_formules.js";
import { commandeConsommerEsquisse } from "../noyau/commandes/commande_consommer_esquisse.js";
import { commandeModifierParametre } from "../noyau/commandes/commande_modifier_parametre.js";
import { commandeLot } from "../noyau/commandes/registre_commandes.js";
import { commandeGrouper } from "../noyau/commandes/commande_grouper.js";
import { commandeDegrouper } from "../noyau/commandes/commande_degrouper.js";
import { commandeBasculerTrou } from "../noyau/commandes/commande_basculer_trou.js";
import { operationChoisirFace, operationExtruderFace } from "./operations/operation_extruder_face.js";
import { operationSolideEsquisse, operationPlanEsquisse } from "./operations/operations_esquisse.js";
import { accrocher, sourcesDAccrochage } from "../outils/esquisse/accrochages.js";

const TOLERANCE_ACCROCHE_PX = 8;
// Une esquisse vide s'ouvre sur un carré de cette taille autour de l'origine.
const CADRE_PAR_DEFAUT_MM = 60;
// Le recul des lignes de cote par rapport au tracé, à l'écran.
const RECUL_DES_COTES_PX = 16;
const CONTRADICTION = "Impossible : cela contredirait les autres contraintes de l'esquisse.";

/* etiquettes : les étiquettes des contraintes posées sur la vue (interface/etiquettes_contraintes.js). */
export function creerActionsEsquisse({ etat, scene, annoncer, nommer, choix, operations, garderEnVue, etiquettes }) {
  // Ce qui n'existe que le temps d'un geste sur une étiquette de cote.
  let decalageProvisoire = null;   // { id, valeur } pendant qu'on la glisse
  let contrainteSurvolee = null;   // l'étiquette sous la souris
  let glisserEtiquette = null;     // { depart: [u, v], decalage: [du, dv] }
  // Les degrés de liberté coûtent un calcul de rang : on les garde par esquisse.
  const libertesConnues = new WeakMap();
  const dessins = new Map();       // id → { cle, donnees, contenu, orientes }
  const versions = new WeakMap();  // contenu ou paramètres → numéro, pour savoir ce qui a changé
  let prochaineVersion = 1;
  let vueOuverte = null;           // { id, photo } : ce que la vue montre vraiment
  let contenuApercu = null;
  let sources = null;              // { contenu, silhouette, valeur } : accrochages préparés
  // Dans l'esquisse : la vue face au plan (false), ou libre de tourner autour (true).
  // Le choix reste d'une esquisse à l'autre, le temps de la séance.
  let vueEn3D = false;
  let referenceVisee = null;       // { esquisse, point } : la référence que l'accrochage a prise

  const version = (objet) => {
    if (!versions.has(objet)) versions.set(objet, prochaineVersion++);
    return versions.get(objet);
  };

  /* fabriquer() rend une commande, ou null s'il n'y a rien à faire. */
  function executer(fabriquer) {
    try {
      const commande = fabriquer();
      if (commande === null) return false;
      etat.executer(commande);
      return true;
    } catch (erreur) {
      annoncer(erreur.message, true);
      return false;
    }
  }

  // On ne sort d'une esquisse qu'en la validant : rien d'autre ne la referme en douce.
  function refuserSiOuverte() {
    if (etat.esquisseOuverte() === null) return false;
    annoncer("Une esquisse est ouverte : la valider d'abord (« Valider l'esquisse »).", true);
    return true;
  }

  const outilsDesSolides = {
    etat,
    scene,
    operations,
    garderEnVue,
    parametres(id) {
      const noeud = trouverNoeud(etat.document(), id);
      return { ...parametresParDefaut(noeud.type), ...noeud.parametres };
    },
    regler(id, valeurs) {
      const avant = this.parametres(id);
      const commandes = Object.entries(valeurs)
        .filter(([cle, valeur]) => avant[cle] !== valeur)
        .map(([cle, valeur]) => commandeModifierParametre.creer(id, cle, avant[cle], valeur));
      if (commandes.length > 0) etat.executer(commandes.length === 1 ? commandes[0] : commandeLot.creer(commandes, "Régler"));
    },
    annoncer,
    /* Les points de référence où une extrusion peut s'arrêter : ceux de toutes
       les esquisses, sauf la sienne. [{ esquisse, point, monde }] */
    referencesPourLaHauteur(id) {
      const propre = esquisseDe(etat.document(), id)?.id;
      return esquissesDansLOrdre(etat.document()).filter((e) => e.id !== propre)
        .flatMap((e) => referencesDe(e).map((r) => ({ esquisse: e.id, point: r.point, monde: r.monde })));
    },
    /* Les segments de l'esquisse du solide, dans le monde : [{ id, points: [a, b] }]. */
    segmentsDeLEsquisse(id) {
      const esquisse = esquisseDe(etat.document(), id);
      if (esquisse === null) return [];
      const r = repereDeLEsquisse(etat.document(), esquisse.id);
      const contenu = contenuDe(esquisse.parametres);
      return contenu.courbes.filter((c) => c.genre === "segment").map((c) => ({
        id: c.id, points: [c.a, c.b].map((p) => appliquerAuPoint(r, [...contenu.points[p], 0])),
      }));
    },
    /* La normale de l'esquisse du solide, dans le monde. */
    normaleDeLEsquisse(id) {
      const esquisse = esquisseDe(etat.document(), id);
      const r = repereDeLEsquisse(etat.document(), esquisse.id);
      return [r[2], r[6], r[10]];
    },
  };

  /* L'esquisse du contour d'une face (voir noyau/face_du_maillage.js), posée
     sur la face, et son extrusion vers l'extérieur : une seule annulation.
     Rend l'identifiant du solide. */
  function creerDepuisLaFace(face) {
    const repere = repereDeFace(face.normale, face.point);
    const [u, v] = [[repere[0], repere[4], repere[8]], [repere[1], repere[5], repere[9]]];
    const dansLePlan = (p) => [u, v].map((axe) => axe[0] * p[0] + axe[1] * p[1] + axe[2] * p[2]);
    let contenu = contenuDe({});
    for (const boucle of face.boucles) {
      contenu = ajouterPolyligne(contenu, boucle.map((p) => ({ point: dansLePlan(p) })), true).contenu;
    }
    const esquisse = nouvelObjet("esquisse", {
      parametres: { plan: "XY", repere, sensExterieur: 1, points: contenu.points, courbes: contenu.courbes, contraintes: contenu.contraintes },
    });
    const ajout = commandeAjouterNoeud.creer(etat.document().racine.id, esquisse);
    const consommation = commandeConsommerEsquisse.creer(commandeAjouterNoeud.appliquer(etat.document(), ajout), esquisse.id, "extrusion");
    etat.executer(commandeLot.creer([ajout, consommation], "Extruder une face"));
    garderEnVue(consommation.solide.id);
    return consommation.solide.id;
  }

  /* Groupe ces objets, posé au pied du premier ; null s'ils ne sont pas au même niveau. */
  function grouperAvec(ids, idAppui) {
    const parents = ids.map((id) => trouverParent(etat.document(), id)?.id);
    if (parents.some((p) => p === undefined || p !== parents[0])) return null;
    const boite = scene.boiteDes([idAppui]);
    const appui = boite === null ? { x: 0, y: 0, z: 0 }
      : { x: (boite.min[0] + boite.max[0]) / 2, y: (boite.min[1] + boite.max[1]) / 2, z: boite.min[2] };
    const commande = commandeGrouper.creer(etat.document(), ids, "", appui);
    etat.executer(commande);
    return commande.groupe.id;
  }

  const noeudOuvert = () => (etat.esquisseOuverte() === null ? null : trouverNoeud(etat.document(), etat.esquisseOuverte()));

  /* L'esquisse que les boutons « Extruder »… visent : l'ouverte, sinon la seule sélectionnée. */
  function cible() {
    if (etat.esquisseOuverte() !== null) return noeudOuvert();
    const noeuds = etat.noeudsSelectionnes();
    return noeuds.length === 1 && fournitUnProfil(noeuds[0].type) ? noeuds[0] : null;
  }

  /* Les esquisses sélectionnées dans la liste, pour un balayage ou un lissage. */
  function esquissesChoisies() {
    if (etat.esquisseOuverte() !== null) return [];
    const noeuds = etat.noeudsSelectionnes();
    return noeuds.length >= 2 && noeuds.every((n) => fournitUnProfil(n.type)) ? noeuds : [];
  }

  /* Ces esquisses conviennent-elles à ce type ? Rend null, ou pourquoi pas. */
  function refusDesEsquisses(nomDuType, esquisses) {
    try {
      typeDeNoeud(nomDuType).roles(sourcesDesEsquisses(esquisses));
      return null;
    } catch (erreur) {
      return erreur.message;
    }
  }

  /* Les contraintes en trop d'une esquisse, calculées une fois par version.
     Pendant un glisser, celles du document suffisent : un point qu'on
     déplace ne rend aucune contrainte inutile. */
  const redondancesConnues = new WeakMap();
  function redondancesDe(noeud) {
    const source = noeud.parametres;
    if (!redondancesConnues.has(source)) {
      redondancesConnues.set(source, new Set(contraintesRedondantes(contenuDe(source))));
    }
    return redondancesConnues.get(source);
  }

  /* Les degrés de liberté d'une esquisse, calculés une fois par version. */
  function libertesDe(noeud) {
    const connues = libertesConnues.get(noeud.parametres);
    if (connues !== undefined) return connues;
    const contenu = contenuDe(noeud.parametres);
    const valeur = Object.keys(contenu.points).length === 0 ? null : degresDeLiberte(contenu);
    libertesConnues.set(noeud.parametres, valeur);
    return valeur;
  }

  function donneesDe(noeud, document) {
    const ouverte = noeud.id === etat.esquisseOuverte();
    const source = ouverte && contenuApercu !== null ? contenuApercu : noeud.parametres;
    const repere = repereDeLEsquisse(document, noeud.id);
    // Une esquisse entièrement contrainte change de couleur : c'est le signe
    // que le dessin ne bougera plus tout seul.
    const etatDessin = ouverte
      ? (libertesDe(noeud) === 0 ? "contrainte" : "ouverte")
      : etat.selection().has(noeud.id) ? "choisie" : "normale";
    const cle = version(source) + "|" + etatDessin + "|" + repere.join(",");
    const connu = dessins.get(noeud.id);
    if (connu !== undefined && connu.cle === cle) return connu;

    const contenu = source === noeud.parametres ? contenuDe(noeud.parametres) : source;
    const { fermes } = analyserEsquisse(contenu);
    const centres = centresDArc(contenu);
    const donnees = {
      id: noeud.id, cle, repere, etat: etatDessin,
      traces: contenu.courbes.filter((c) => c.construction !== true).map((c) => pointsDeCourbe(contenu, c)),
      // Les traits d'aide se dessinent en pointillé : ils guident sans donner de matière.
      tracesAide: contenu.courbes.filter((c) => c.construction === true).map((c) => pointsDeCourbe(contenu, c)),
      regions: regionsPleines(fermes),
      // Les centres des arcs se marquent d'une croix : ce ne sont pas des bouts de trait.
      points: Object.entries(contenu.points).filter(([id]) => !centres.has(id)).map(([, uv]) => uv),
      centres: [...centres].filter((id) => id in contenu.points).map((id) => contenu.points[id]),
      bouts: ouverte ? boutsLibres(contenu) : [],
      references: [...pointsMarques(contenu)].filter((id) => id in contenu.points).map((id) => contenu.points[id]),
    };
    const dessin = { cle, donnees, contenu, orientes: contoursPourUnion(fermes) };
    dessins.set(noeud.id, dessin);
    return dessin;
  }

  /* Les points de référence que l'esquisse ouverte peut viser (ceux des
     esquisses d'avant), projetés sur son plan : [{ esquisse, numero, point, uv, local }]. */
  function referencesExternes() {
    const noeud = noeudOuvert();
    if (noeud === null) return [];
    const repere = repereDeLEsquisse(etat.document(), noeud.id);
    const n = [repere[2], repere[6], repere[10]];
    return referencesAccessibles(etat.document(), noeud.id).map((r) => {
      const uv = projeter(repere, r.monde);
      const w = n[0] * (r.monde[0] - repere[3]) + n[1] * (r.monde[1] - repere[7]) + n[2] * (r.monde[2] - repere[11]);
      return { ...r, uv, local: [...uv, w] };
    });
  }

  /* La référence la plus proche du curseur à l'écran, par le point lui-même
     ou par sa projection sur le plan ; à égalité, le point lui-même l'emporte.
     En 3D, des références confondues dans le plan se départagent ainsi. */
  function referenceSousLeCurseur(x, y, tolerancePx) {
    const repere = noeudOuvert() === null ? null : repereDeLEsquisse(etat.document(), noeudOuvert().id);
    if (repere === null) return null;
    let meilleure = null;
    let ecart = tolerancePx;
    for (const r of referencesExternes()) {
      const [xr, yr] = scene.versEcran(r.monde);
      const [xp, yp] = scene.versEcran(appliquerAuPoint(repere, [...r.uv, 0]));
      const d = Math.min(Math.hypot(xr - x, yr - y), Math.hypot(xp - x, yp - y) + 0.5);
      if (d < ecart) {
        ecart = d;
        meilleure = r;
      }
    }
    return meilleure;
  }

  /* Tourner librement autour de l'esquisse ouverte, ou revenir face à son plan. */
  function regarderLEsquisse() {
    const noeud = noeudOuvert();
    if (noeud === null) return;
    const repere = repereDeLEsquisse(etat.document(), noeud.id);
    const sens = noeud.parametres.sensExterieur ?? 1;
    scene.controleur.regarderSelon([repere[2] * sens, repere[6] * sens, repere[10] * sens]);
  }

  /* Un point qu'on vient de poser ou de glisser pile sur un point de référence
     (l'accrochage l'y a mis) le suivra : la contrainte se pose d'office, comme
     « sur l'origine ». Sauf si l'accrochage aux références est coupé. */
  function avecReferencesAutomatiques(avant, apres, tenus) {
    if (etat.reglages().accrocherReferences === false) return apres;
    const references = referencesExternes();
    if (references.length === 0) return apres;
    let resultat = apres;
    for (const [id, uv] of Object.entries(apres.points)) {
      const ancien = avant.points[id];
      const deplace = ancien !== undefined && tenus.includes(id) && Math.hypot(ancien[0] - uv[0], ancien[1] - uv[1]) > 1e-9;
      if (ancien !== undefined && !deplace) continue;
      // Plusieurs références confondues dans le plan : celle que le curseur visait.
      const ici = references.filter((x) => Math.hypot(x.uv[0] - uv[0], x.uv[1] - uv[1]) < 1e-6);
      const r = ici.find((x) => referenceVisee !== null && x.esquisse === referenceVisee.esquisse && x.point === referenceVisee.point) ?? ici[0];
      if (r === undefined || resultat.contraintes.some((c) => c.genre === "surReference" && c.a === id)) continue;
      // La référence l'emporte sur « sur un axe » ou « sur l'origine » posés d'office à l'instant.
      const dejaLa = new Set(avant.contraintes.map((c) => c.id));
      resultat = {
        ...resultat,
        contraintes: resultat.contraintes.filter((c) => dejaLa.has(c.id) || c.a !== id || (c.genre !== "surAxe" && c.genre !== "origine")),
      };
      const contrainte = { genre: "surReference", a: id, esquisse: r.esquisse, point: r.point, u: r.uv[0], v: r.uv[1] };
      if (!seraitRedondante(resultat, contrainte)) resultat = ajouterContrainte(resultat, contrainte).contenu;
    }
    return resultat;
  }

  /* L'état d'une esquisse, pour la liste : « complete » (entièrement
     contrainte), « libre » (des degrés de liberté restent), « probleme »
     (une contrainte que le dessin ne respecte pas, une référence perdue),
     avec une phrase qui l'explique. Calculé une fois par version. */
  const etatsConnus = new WeakMap();
  function etatDe(noeud) {
    const probleme = problemeDeReference(etat.document(), noeud);
    if (probleme !== null) return { etat: "probleme", texte: probleme };
    const connu = etatsConnus.get(noeud.parametres);
    if (connu !== undefined) return connu;
    const contenu = contenuDe(noeud.parametres);
    let resultat;
    if (Object.keys(contenu.points).length === 0) resultat = { etat: "libre", texte: "Esquisse vide." };
    else if (contraintesFausses(contenu).length > 0) {
      resultat = { etat: "probleme", texte: "Des contraintes ne sont pas respectées : elles se contredisent. Rouvrir l'esquisse, les cotes en rouge sont en cause." };
    } else {
      const libres = libertesDe(noeud);
      resultat = libres === 0
        ? { etat: "complete", texte: "Entièrement contrainte : le dessin ne bougera plus tout seul." }
        : { etat: "libre", texte: libres + (libres > 1 ? " degrés de liberté restent" : " degré de liberté reste") + " : des points peuvent encore bouger." };
    }
    etatsConnus.set(noeud.parametres, resultat);
    return resultat;
  }

  /* Les cotes et les symboles des contraintes de l'esquisse ouverte, là où
     elle se trouve à l'écran : à chaque changement du dessin ou de la vue. */
  /* Le contenu tel qu'il se dessine : avec l'étiquette qu'on glisse à sa place du moment. */
  function contenuAffiche(noeud) {
    const contenu = contenuApercu ?? contenuDe(noeud.parametres);
    if (decalageProvisoire === null) return contenu;
    return {
      ...contenu,
      contraintes: contenu.contraintes.map((c) => (c.id === decalageProvisoire.id ? { ...c, decalage: decalageProvisoire.valeur } : c)),
    };
  }

  /* Les tracés que désigne une contrainte : mis en avant quand on survole son étiquette. */
  function tracesDeLaContrainte(contenu, id) {
    const c = contenu.contraintes.find((k) => k.id === id);
    if (c === undefined) return [];
    const ids = c.courbes ?? (c.courbe === undefined ? [] : [c.courbe]);
    return contenu.courbes
      .filter((courbe) => ids.includes(courbe.id))
      .map((courbe) => ({ points: pointsDeCourbe(contenu, courbe), conflit: false, fort: true }));
  }

  function montrerContraintes() {
    const noeud = noeudOuvert();
    if (vueOuverte === null || noeud === null) {
      etiquettes.vider();
      return;
    }
    const contenu = contenuAffiche(noeud);
    const repere = repereDeLEsquisse(etat.document(), noeud.id);
    const versMonde = ([u, v]) => appliquerAuPoint(repere, [u, v, 0]);
    scene.esquisses.referencesExternes(referencesExternes());
    const ecart = RECUL_DES_COTES_PX * scene.millimetresParPixel(versMonde([0, 0]));
    const dessin = dessinDesContraintes(contenu, ecart, nomsDesAxes(noeud.parametres));
    const survolees = contrainteSurvolee === null ? [] : tracesDeLaContrainte(contenu, contrainteSurvolee);
    scene.esquisses.cotes([...dessin.traits, ...survolees]);
    const formules = new Map(contenu.contraintes.filter((c) => c.formule).map((c) => [c.id, texteDeFormule(c.formule)]));
    const redondantes = redondancesDe(noeud);
    etiquettes.afficher(dessin.etiquettes.map((e) => {
      const [x, y] = scene.versEcran(versMonde(e.uv));
      return { ...e, x, y, formule: formules.get(e.id) ?? null, redondante: redondantes.has(e.id) };
    }));
  }
  scene.controleur.surChangement(() => {
    if (vueOuverte !== null) montrerContraintes();
  });

  /* Sur l'origine ou sur un axe, la contrainte que le point va recevoir est
     écrite à côté du curseur, avant le clic : on sait ce qu'on pose. */
  function indiquerLAccroche(vise) {
    const noeud = noeudOuvert();
    if (noeud === null || vise === null || vise === undefined || !["origine", "axe", "reference"].includes(vise.genre)) {
      etiquettes.indiquer(null);
      return;
    }
    const axes = nomsDesAxes(noeud.parametres);
    const texte = vise.genre === "origine" ? "sur l'origine"
      : vise.genre === "reference" ? "sur la référence" + (vise.reference ? " (esquisse n°" + vise.reference.numero + ")" : "")
        : "sur " + (Math.abs(vise.uv[1]) < 1e-9 ? axes.horizontal : axes.vertical);
    const repere = repereDeLEsquisse(etat.document(), noeud.id);
    const [x, y] = scene.versEcran(appliquerAuPoint(repere, [vise.uv[0], vise.uv[1], 0]));
    etiquettes.indiquer(texte, x, y);
  }

  function fermerLaVue() {
    etiquettes.vider();
    scene.esquisses.fermer();
    scene.controleur.verrouillerOrbite(false);
    scene.controleur.restaurer(vueOuverte.photo);
    vueOuverte = null;
    contenuApercu = null;
    sources = null;
  }

  const actions = {
    cible,

    /* Remet la vue d'accord avec le document : les esquisses à dessiner, et
       l'esquisse ouverte, qui a pu disparaître par une annulation. */
    synchroniser() {
      if (vueOuverte !== null && vueOuverte.id !== etat.esquisseOuverte()) fermerLaVue();
      const document = etat.document();
      const noeuds = esquissesVisibles(document);
      const ouvert = noeudOuvert();
      if (ouvert !== null && !noeuds.includes(ouvert)) noeuds.push(ouvert);
      const liste = noeuds.map((noeud) => donneesDe(noeud, document));
      for (const id of [...dessins.keys()]) if (!noeuds.some((n) => n.id === id)) dessins.delete(id);
      scene.esquisses.afficher(liste.map((d) => d.donnees));
      montrerContraintes();
    },

    etatDe,
    numero: (id) => numeroDeLEsquisse(etat.document(), id),
    /* Ce qui dépend d'un objet, et ce dont il dépend (voir references_esquisse.js). */
    liens: (id) => liensDuNoeud(etat.document(), id),

    vueEn3D: () => vueEn3D,

    /* L'interrupteur 2D / 3D : en 3D la vue tourne librement, en partant de
       là où elle est ; en 2D elle revient aussitôt face au plan. */
    basculerVue3D(actif) {
      vueEn3D = actif;
      if (etat.esquisseOuverte() === null) return;
      scene.controleur.verrouillerOrbite(!actif);
      if (!actif) regarderLEsquisse();
      annoncer(actif
        ? "Esquisse en 3D : tourner la vue avec le bouton droit (ou le cube) ; le tracé reste dans le plan de l'esquisse."
        : "Esquisse en 2D : la vue est face au plan.");
    },

    /* Les degrés de liberté de l'esquisse ouverte, ou null. */
    libertes() {
      const noeud = noeudOuvert();
      return noeud === null ? null : libertesDe(noeud);
    },

    /* Un clic sur une cote : un champ s'ouvre à sa place pour changer sa valeur. */
    editerContrainte(id) {
      const noeud = noeudOuvert();
      const contrainte = noeud === null ? undefined : contenuDe(noeud.parametres).contraintes.find((c) => c.id === id);
      if (contrainte === undefined || !GENRES_COTES.has(contrainte.genre)) return;
      montrerContraintes();
      const avant = contrainte.formule ?? null;
      etiquettes.editer(id, contrainte.valeur, (texte) => {
        if (texte !== null) {
          try {
            const { valeur, formule } = lireSaisie(texte, true);
            if (valeur !== contrainte.valeur || formule !== avant) {
              this.pourLesOutils.modifier((contenu) => changerValeur(contenu, id, valeur, formule), formule === null ? "Coter" : "Formule");
            }
          } catch (erreur) {
            annoncer(erreur.message, true);
          }
        }
        montrerContraintes();
      }, texteDeFormule(avant));
    },

    /*
     * Glisser une étiquette l'écarte du tracé, et sa ligne de cote suit.
     * phase : "debut" | "glisser" | "fin" | "abandon".
     */
    deplacerEtiquette(id, evenement, phase) {
      const noeud = noeudOuvert();
      if (noeud === null) return;
      const vise = scene.esquisses.pointSur(evenement.clientX, evenement.clientY);
      if (phase === "debut") {
        const contrainte = contenuDe(noeud.parametres).contraintes.find((c) => c.id === id);
        glisserEtiquette = vise === null || contrainte === undefined
          ? null
          : { depart: vise.uv, decalage: contrainte.decalage ?? [0, 0] };
        return;
      }
      if (glisserEtiquette === null) return;
      const valeur = vise === null ? glisserEtiquette.decalage : [
        glisserEtiquette.decalage[0] + vise.uv[0] - glisserEtiquette.depart[0],
        glisserEtiquette.decalage[1] + vise.uv[1] - glisserEtiquette.depart[1],
      ];
      if (phase === "glisser") {
        decalageProvisoire = { id, valeur };
        montrerContraintes();
        return;
      }
      decalageProvisoire = null;
      glisserEtiquette = null;
      if (phase === "fin") this.pourLesOutils.modifier((contenu) => changerDecalage(contenu, id, valeur), "Déplacer une cote");
      else montrerContraintes();
    },

    /* L'étiquette sous la souris met en évidence le tracé qu'elle mesure. */
    survolerContrainte(id) {
      if (contrainteSurvolee === id) return;
      contrainteSurvolee = id;
      montrerContraintes();
    },

    retirerContrainte(id) {
      this.pourLesOutils.modifier((contenu) => supprimerContrainte(contenu, id), "Retirer une contrainte");
    },

    /* « Esquisse » : une fenêtre demande où dessiner (un plan, ou la face d'une
       pièce). À plat, deux des trois plans seraient vus par la tranche : on repasse en 3D. */
    choisirPlan() {
      if (refuserSiOuverte()) return;
      if (scene.controleur.aPlat()) scene.placerSurVue("iso");
      operations.demarrer(operationPlanEsquisse({
        scene,
        choix,
        terminer: () => operations.valider(),
        nouvelle: (parametres) => this.nouvelle(parametres),
      }));
    },

    /* parametres : { plan, decalage, inclinaison, pivot, repere, sensExterieur }
       (voir matriceDeLEsquisse) ; sensExterieur : -1 si la normale du plan
       entre dans la pièce. Les réglages nuls ne sont pas écrits. */
    nouvelle(parametres) {
      const racine = etat.document().racine.id;
      const propres = Object.fromEntries(Object.entries(parametres).filter(([cle, valeur]) => valeur !== 0 || cle === "sensExterieur"));
      if (!propres.inclinaison) delete propres.pivot;
      const esquisse = nouvelObjet("esquisse", { parametres: propres });
      if (executer(() => commandeAjouterNoeud.creer(racine, esquisse))) this.ouvrir(esquisse.id);
    },

    ouvrir(id) {
      const document = etat.document();
      const esquisse = esquisseDe(document, id);
      if (esquisse === null || esquisse.id === etat.esquisseOuverte()) return;
      if (esquisse.parametres.copieDe) {
        annoncer("Copie liée de l'esquisse n°" + numeroDeLEsquisse(document, esquisse.parametres.copieDe)
          + " : ses tracés se modifient dans l'esquisse d'origine. Seul son déplacement se règle ici (inspecteur).", true);
        return;
      }
      if (refuserSiOuverte()) return;
      if (vueOuverte !== null) fermerLaVue();

      const repere = repereDeLEsquisse(document, esquisse.id);
      // Les pièces tirées de cette esquisse la cacheraient : elles s'effacent le temps de la modifier.
      const exclus = new Set(objetsAffichables(document)
        .filter((objet) => contientUnSolideDe(objet, esquisse.id))
        .map((objet) => objet.id));
      vueOuverte = { id: esquisse.id, photo: scene.controleur.photographier() };
      scene.esquisses.ouvrir(repere, exclus);
      // Une esquisse posée sur une face se regarde depuis l'extérieur de la pièce.
      const sens = esquisse.parametres.sensExterieur ?? 1;
      scene.controleur.regarderSelon([repere[2] * sens, repere[6] * sens, repere[10] * sens]);
      scene.controleur.verrouillerOrbite(!vueEn3D);

      const boite = boiteDeLEsquisse(contenuDe(esquisse.parametres));
      const d = CADRE_PAR_DEFAUT_MM / 2;
      const [min, max] = boite === null ? [[-d, -d], [d, d]] : [boite.min, boite.max];
      scene.cadrerSur([appliquerAuPoint(repere, [min[0], min[1], 0]), appliquerAuPoint(repere, [max[0], max[1], 0])]);

      etat.ouvrirEsquisse(esquisse.id);
      const q = esquisse.parametres;
      const ou = Array.isArray(q.repere) ? "une face"
        : "le " + libelleDuPlan(q.plan) + (q.inclinaison ? ", incliné de " + nombreLisible(q.inclinaison) + "°" : "")
          + (q.decalage ? ", décalé de " + nombreLisible(q.decalage) + " mm" : "");
      annoncer("Esquisse sur " + ou + ". Échap : retour à l'outil Sélection.");
    },

    /* Une esquisse restée vide, dont aucun solide n'est tiré, ne sert à rien : elle disparaît en sortant. */
    fermer() {
      const noeud = noeudOuvert();
      etat.fermerEsquisse();
      const vide = !(noeud?.parametres.courbes?.length > 0);
      if (noeud !== null && vide && solidesDeLEsquisse(etat.document(), noeud.id).length === 0) {
        executer(() => commandeSupprimerNoeud.creer(etat.document(), noeud.id));
      }
    },

    /* Extruder, épaissir, faire tourner : le solide naît, et sa fenêtre s'ouvre. */
    consommer(nomDuType) {
      const esquisse = cible();
      if (esquisse === null) {
        annoncer("Sélectionner d'abord une esquisse.", true);
        return;
      }
      const etaitOuverte = etat.esquisseOuverte() === esquisse.id;
      operations.demarrer(operationSolideEsquisse(nomDuType, {
        ...outilsDesSolides,
        consommer: () => {
          const commande = commandeConsommerEsquisse.creer(etat.document(), esquisse.id, nomDuType);
          if (etat.esquisseOuverte() !== null) etat.fermerEsquisse();
          etat.executer(commande);
          if (scene.controleur.aPlat()) scene.placerSurVue("iso");
          garderEnVue(commande.solide.id);
          return { id: commande.solide.id, sensExterieur: esquisse.parametres.sensExterieur ?? 1 };
        },
        rouvrirEsquisse: () => {
          if (etaitOuverte) this.ouvrir(esquisse.id);
        },
      }));
    },

    /* Balayer, lisser : le solide naît des esquisses sélectionnées, et sa fenêtre s'ouvre. */
    consommerPlusieurs(nomDuType) {
      if (refuserSiOuverte()) return;
      const esquisses = esquissesChoisies();
      const refus = esquisses.length === 0
        ? "Sélectionner d'abord les esquisses (Ctrl+clic dans la liste de construction)."
        : refusDesEsquisses(nomDuType, esquisses);
      if (refus !== null) {
        annoncer(refus, true);
        return;
      }
      operations.demarrer(operationSolideEsquisse(nomDuType, {
        ...outilsDesSolides,
        consommer: () => {
          const commande = commandeConsommerEsquisse.creer(etat.document(), esquisses.map((e) => e.id), nomDuType);
          etat.executer(commande);
          if (scene.controleur.aPlat()) scene.placerSurVue("iso");
          garderEnVue(commande.solide.id);
          return { id: commande.solide.id, sensExterieur: 1 };
        },
        rouvrirEsquisse: () => {},
      }));
    },

    /* Une copie liée de l'esquisse : mêmes tracés, toujours ; seule sa place
       change (déplacements dans l'inspecteur). Elle se range juste après. */
    copieLiee(id) {
      if (refuserSiOuverte()) return;
      const document = etat.document();
      const source = trouverNoeud(document, id);
      const contenu = contenuDe(source.parametres);
      const copie = nouvelObjet("esquisse", {
        parametres: {
          plan: source.parametres.plan ?? "XY", repere: matriceDeLEsquisse(source.parametres), sensExterieur: source.parametres.sensExterieur ?? 1,
          copieDe: id, points: contenu.points, courbes: contenu.courbes, contraintes: contenu.contraintes,
        },
      });
      const index = document.racine.enfants.indexOf(source) + 1;
      if (executer(() => commandeAjouterNoeud.creer(document.racine.id, copie, index))) {
        annoncer("Copie liée créée : régler son déplacement dans l'inspecteur. Elle suivra toujours l'esquisse d'origine.");
      }
    },

    /* Monter ou descendre une esquisse dans la liste (sens : "haut" | "bas"),
       si aucune ne se retrouve avant une esquisse dont elle vise un point. */
    deplacerDansLOrdre(id, sens) {
      const document = etat.document();
      const ordre = esquissesDansLOrdre(document);
      const rang = ordre.findIndex((n) => n.id === id);
      const voisin = ordre[sens === "haut" ? rang - 1 : rang + 1];
      if (rang < 0 || voisin === undefined) return;
      const ids = ordre.map((n) => n.id);
      [ids[rang], ids[ids.indexOf(voisin.id)]] = [voisin.id, id];
      const refus = refusDeLOrdre(document, ids);
      if (refus !== null) {
        annoncer(refus, true);
        return;
      }
      // Monter : prendre la place du voisin ; descendre : se mettre juste après lui.
      const index = document.racine.enfants.indexOf(voisin);
      executer(() => commandeLot.creer([
        commandeSupprimerNoeud.creer(document, id),
        commandeAjouterNoeud.creer(document.racine.id, trouverNoeud(document, id), index),
      ], "Réordonner les esquisses"));
    },

    /* Faire passer le plan d'une esquisse par un point de référence d'une esquisse précédente. */
    planParReference(id) {
      if (referencesAccessibles(etat.document(), id).length === 0) {
        annoncer("Aucun point de référence dans les esquisses précédentes : en marquer un avec l'outil « Référence ».", true);
        return;
      }
      if (etat.esquisseOuverte() === id) this.fermer();
      operations.demarrer(operationPlanParReference({
        scene,
        references: () => referencesAccessibles(etat.document(), id),
        rafraichir: () => operations.rafraichir(),
        terminer: () => operations.valider(),
        choisir: (r) => {
          executer(() => commandeModifierParametre.creer(id, "passePar", trouverNoeud(etat.document(), id).parametres.passePar ?? null,
            { esquisse: r.esquisse, point: r.point }));
        },
      }));
    },

    /* « Extruder une face » : choisir une face plane dans la vue, puis régler son extrusion. */
    extruderUneFace() {
      if (refuserSiOuverte()) return;
      if (scene.controleur.aPlat()) scene.placerSurVue("iso");
      operations.demarrer(operationChoisirFace({
        scene,
        operations,
        terminer: () => operations.valider(),
        extruder: (face, idPiece) => operations.demarrer(operationExtruderFace({
          ...outilsDesSolides,
          annoncer,
          creerDepuisLaFace: (laFace) => creerDepuisLaFace(laFace),
          grouper: (ids, idAppui) => grouperAvec(ids, idAppui),
          degrouper: (id) => etat.executer(commandeDegrouper.creer(etat.document(), id)),
          basculerTrou(id, trou) {
            const noeud = trouverNoeud(etat.document(), id);
            if (noeud.trou !== trou) etat.executer(commandeBasculerTrou.creer(id, noeud.trou === true));
          },
          selectionner: (id) => etat.selectionner([id], "remplacer"),
        }, face, idPiece)),
      }));
    },

    /* Régler un solide d'esquisse déjà créé. */
    modifierSolide(id) {
      const noeud = trouverNoeud(etat.document(), id);
      if (noeud === null || !consommeUnProfil(noeud.type)) return;
      operations.demarrer(operationSolideEsquisse(noeud.type, outilsDesSolides, id));
    },

    /* Ce que la colonne de gauche peut proposer. */
    disponibilites() {
      const esquisse = cible();
      const possibles = esquisse !== null ? solidesPossibles(esquisse.parametres) : {};
      const choisies = esquissesChoisies();
      return {
        ...Object.fromEntries(solidesDEsquisse().map((type) => [type.nom, possibles[type.nom] === true])),
        ...Object.fromEntries(solidesMultiEsquisses().map((type) => [type.nom, choisies.length > 0 && refusDesEsquisses(type.nom, choisies) === null])),
      };
    },

    /* Les boutons de l'inspecteur pour un nœud : { icone, texte, titre, actif, action }. */
    actionsDe(noeud) {
      const esquisse = esquisseDe(etat.document(), noeud.id);
      const ouverte = esquisse !== null && etat.esquisseOuverte() === esquisse.id;
      const partage = esquisse === null ? 0 : solidesDeLEsquisse(etat.document(), esquisse.id).length;
      const reprendre = {
        icone: ouverte ? "valider" : "esquisse",
        texte: ouverte ? "Valider l'esquisse" : "Modifier l'esquisse",
        titre: ouverte ? "Ferme l'esquisse et revient à la vue 3D."
          : partage > 1 ? "Rouvre l'esquisse. Elle sert à " + partage + " solides : tous suivront les modifications."
            : "Rouvre l'esquisse pour modifier ses tracés.",
        actif: true,
        action: () => (ouverte ? this.fermer() : this.ouvrir(noeud.id)),
      };
      if (consommeUnProfil(noeud.type)) {
        const type = typeDeNoeud(noeud.type);
        const regler = { icone: type.icone, texte: "Régler : " + type.etiquette.toLowerCase(), titre: "Rouvre la fenêtre de réglage.", actif: true, action: () => this.modifierSolide(noeud.id) };
        // Un balayage a un profil et un chemin, un lissage peut avoir une courbe guide : chacune se rouvre.
        const autre = typeof noeud.parametres.chemin === "string" ? { id: noeud.parametres.chemin, nom: "le chemin", premiere: "Modifier le profil" }
          : typeof noeud.parametres.guide === "string" ? { id: noeud.parametres.guide, nom: "la courbe guide", premiere: "Modifier la 1re section" } : null;
        if (autre !== null && trouverNoeud(etat.document(), autre.id) !== null) {
          return [regler, { ...reprendre, texte: ouverte ? reprendre.texte : autre.premiere }, {
            icone: "esquisse", texte: "Modifier " + autre.nom, titre: "Rouvre l'esquisse de " + autre.nom + ".", actif: etat.esquisseOuverte() !== autre.id,
            action: () => this.ouvrir(autre.id),
          }];
        }
        return [regler, reprendre];
      }
      if (!fournitUnProfil(noeud.type)) return [];
      const possibles = solidesPossibles(noeud.parametres);
      const solides = solidesDEsquisse().map((type) => ({
        icone: type.icone,
        texte: type.verbe,
        titre: possibles[type.nom] ? type.aide : "Contour ouvert : relier les extrémités marquées en rouge.",
        actif: possibles[type.nom],
        action: () => this.consommer(type.nom),
      }));
      const copieDe = noeud.parametres.copieDe ?? null;
      if (copieDe !== null) {
        return [
          {
            icone: "esquisse", texte: "Modifier l'origine", actif: trouverNoeud(etat.document(), copieDe) !== null,
            titre: "Ouvre l'esquisse d'origine : ses modifications passent dans la copie.",
            action: () => this.ouvrir(copieDe),
          },
          {
            icone: "degrouper", texte: "Détacher la copie", actif: true,
            titre: "La copie devient une esquisse ordinaire, modifiable, qui ne suit plus l'origine.",
            action: () => executer(() => commandeModifierParametre.creer(noeud.id, "copieDe", copieDe, null)),
          },
          ...solides,
        ];
      }
      const copier = {
        icone: "dupliquer", texte: "Copie liée", actif: true,
        titre: "Crée une copie de l'esquisse qu'on peut déplacer, mais pas modifier : ses tracés restent toujours ceux de celle-ci.",
        action: () => this.copieLiee(noeud.id),
      };
      const passePar = noeud.parametres.passePar ?? null;
      const plan = passePar === null
        ? {
          icone: "sur_reference", texte: "Plan par un point", actif: referencesAccessibles(etat.document(), noeud.id).length > 0,
          titre: "Fait passer le plan de l'esquisse par un point de référence d'une esquisse précédente : le plan glisse le long de sa normale, et suivra le point.",
          action: () => this.planParReference(noeud.id),
        }
        : {
          icone: "fermer", texte: "Libérer le plan", actif: true,
          titre: "Le plan ne suit plus le point de référence ; il reste où il est, et son décalage se règle à nouveau à la main.",
          action: () => executer(() => commandeModifierParametre.creer(noeud.id, "passePar", passePar, null)),
        };
      return [reprendre, plan, copier, ...solides];
    },

    /* L'esquisse dessinée sous la souris : un de ses traits, ou son aplat. */
    sous(x, y) {
      return scene.esquisses.sous(x, y, (id, uv, tolerance) => {
        const dessin = dessins.get(id);
        if (dessin === undefined) return false;
        return dansLeProfil(uv, dessin.orientes) || courbeSous(dessin.contenu, uv, tolerance) !== null;
      });
    },

    // ── Ce que reçoivent les outils de tracé ─────────────────────────────
    pourLesOutils: {
      contenu: () => {
        const noeud = noeudOuvert();
        return noeud === null ? null : contenuDe(noeud.parametres);
      },

      viser: (evenement) => (vueOuverte === null ? null : scene.esquisses.pointSur(evenement.clientX, evenement.clientY)),

      referencesExternes,
      referenceSousLeCurseur,

      /* options : { depuis, exclus, sansGrille }. Alt coupe les accrochages. */
      accrocher(evenement, options = {}) {
        const vise = this.viser(evenement);
        const noeud = noeudOuvert();
        if (vise === null || noeud === null) return null;
        const { accrocher: actif = true, accrocherReferences = true, grille = 1 } = etat.reglages();
        if (!actif || evenement.altKey) return { uv: vise.uv, genre: "libre", idPoint: null, guides: [], mmParPixel: vise.mmParPixel };

        // Un point de référence sous le curseur — lui-même, en 3D, ou sa projection : on le prend.
        referenceVisee = null;
        if (accrocherReferences) {
          const r = referenceSousLeCurseur(evenement.clientX, evenement.clientY, TOLERANCE_ACCROCHE_PX * 1.5);
          if (r !== null) {
            referenceVisee = { esquisse: r.esquisse, point: r.point, numero: r.numero };
            const pose = Object.entries(contenuDe(noeud.parametres).points)
              .find(([, p]) => Math.hypot(p[0] - r.uv[0], p[1] - r.uv[1]) < 1e-9);
            return { uv: r.uv, genre: "reference", idPoint: pose?.[0] ?? null, guides: [], mmParPixel: vise.mmParPixel, reference: referenceVisee };
          }
        }

        const silhouette = scene.esquisses.silhouettes();
        const document = etat.document();
        if (sources === null || sources.parametres !== noeud.parametres || sources.silhouette !== silhouette
          || sources.document !== document || sources.references !== accrocherReferences) {
          const references = accrocherReferences ? referencesExternes().map((r) => r.uv) : [];
          sources = {
            parametres: noeud.parametres, silhouette, document, references: accrocherReferences,
            valeur: sourcesDAccrochage(contenuDe(noeud.parametres), silhouette, references),
          };
        }
        const resultat = accrocher(vise.uv, sources.valeur, {
          tolerance: TOLERANCE_ACCROCHE_PX * vise.mmParPixel,
          pasGrille: options.sansGrille ? 0 : grille,
          depuis: options.depuis ?? null,
          exclus: options.exclus ?? null,
        });
        return { ...resultat, mmParPixel: vise.mmParPixel };
      },

      montrer: (vise) => {
        scene.esquisses.accroche(vise?.uv ?? null, vise?.guides ?? [], vise?.genre ?? null);
        indiquerLAccroche(vise);
      },
      apercu: (traces) => scene.esquisses.apercu(traces),

      apercuContenu(contenu) {
        contenuApercu = contenu;
        const noeud = noeudOuvert();
        if (noeud !== null) scene.esquisses.afficher([...dessins.values()]
          .map((d) => (d.donnees.id === noeud.id ? donneesDe(noeud, etat.document()).donnees : d.donnees)));
        montrerContraintes();
      },

      /* Le contenu, ses contraintes satisfaites au mieux : pour l'aperçu d'un glisser. */
      contraindre: (contenu, tenus = []) => recalerLesArcs(resoudre(contenu, tenus).contenu),

      /*
       * fabriquer(contenu) → nouveau contenu, dont les contraintes sont ensuite
       * satisfaites ; ce qui vient d'être tracé reçoit d'abord ses contraintes
       * d'office (voir avecContraintesAutomatiques). tenus : les points que la souris vient de placer, qui
       * bougent le moins possible. Rend true si le changement est fait ; sinon
       * une erreur s'affiche et rien ne change.
       */
      modifier(fabriquer, libelle, tenus = []) {
        const noeud = noeudOuvert();
        if (noeud === null) return false;
        const avant = contenuDe(noeud.parametres);
        return executer(() => {
          const brut = fabriquer(avant);
          if (brut === avant) return null;
          const { contenu: resolu, ok } = resoudre(avecReferencesAutomatiques(avant, avecContraintesAutomatiques(avant, brut, tenus), tenus), tenus);
          if (!ok) throw new Error(CONTRADICTION);
          return commandeModifierEsquisse.creer(noeud.id, avant, recalerLesArcs(resolu), libelle);
        });
      },

      /* Pose une contrainte ; une cote prend la valeur du dessin. Rend son identifiant, ou null. */
      poserContrainte(contrainte) {
        let id = null;
        const fait = this.modifier((contenu) => {
          const complete = GENRES_COTES.has(contrainte.genre) ? coteActuelle(contenu, contrainte) : contrainte;
          if (seraitRedondante(contenu, complete)) {
            throw new Error(GENRES_COTES.has(contrainte.genre)
              ? "Cette cote est déjà imposée par les autres contraintes : elle ne changerait rien."
              : "Le dessin respecte déjà cette contrainte par les autres : elle serait en trop.");
          }
          const ajout = ajouterContrainte(contenu, complete);
          id = ajout.id;
          return ajout.contenu;
        }, "Contraindre : " + NOMS_DES_CONTRAINTES[contrainte.genre].toLowerCase());
        return fait ? id : null;
      },

      editerContrainte: (id) => actions.editerContrainte(id),
    },
  };
  return actions;
}
