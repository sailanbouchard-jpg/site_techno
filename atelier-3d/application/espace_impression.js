/*
 * application/espace_impression.js
 * ────────────────────────────────
 * L'onglet Impression : le plateau de l'imprimante, les pièces qu'on y pose,
 * et les gestes qui les placent. Il partage la vue, le cache de maillages et
 * la pile d'annulation avec la conception ; il a sa propre sélection (des
 * pièces du plateau, pas des objets de l'assemblage) et sa propre caméra.
 *
 * Tout ce qu'il modifie passe par une seule commande, modifier_plateau : la
 * section impression du document, avant et après. Annuler un placement, c'est
 * annuler une commande comme les autres.
 */

import { commandeModifierPlateau } from "../noyau/commandes/commande_modifier_plateau.js";
import { avecChamps } from "../noyau/noeud.js";
import { pretPourLeCalcul } from "../noyau/bibliotheque_d_objets.js";
import {
  impressionDe, machineDe, avecPieces, avecReglages, modifierPieces, creerPiece, piecesPresentes, objetsHorsPlateau,
  objetsImprimables, partiesSeparables, rotationDAssemblage, rotationPourPoserAPlat, formeTournee,
  transformationSurLePlateau, boiteSurLePlateau, controlerLePlateau, disposer, placeLibre,
} from "../noyau/plateau.js";
import { stlBinaire, morceauAExporter } from "../geometrie/export_stl.js";
import { ecartsDeLaSource } from "../noyau/reglages_impression.js";

export const ESPACES = Object.freeze({ conception: "conception", impression: "impression", calibration: "calibration" });

// Tant que sa forme n'est pas calculée, une pièce occupe ce carré pour trouver sa place.
const TAILLE_INCONNUE_MM = 30;
// En deçà, un appui suivi d'un relâcher est un clic, pas un glisser.
const SEUIL_GLISSER_PX = 3;
const PAS_FIN_MM = 1;
const PAS_LARGE_MM = 10;

/* Un angle ramené entre -180° (exclu) et 180°. */
function angleNormalise(a) {
  let r = ((a % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Number(r.toFixed(6)) || 0;
}

/*
 * dependances : { etat, scene, annoncer(texte, erreur), nommer(noeud),
 *                 maillageConnu(noeud), telecharger(octets, nom, type),
 *                 rafraichir(), refusDEntrer() → texte | null, surChangementDEspace(espace),
 *                 surApercu(actif), changerDeCouche(pas), avancerDansLaCouche(pas) }
 */
export function creerEspaceImpression(dependances) {
  const { etat, scene, annoncer } = dependances;
  let espace = ESPACES.conception;
  let selection = new Set();
  let poserAPlat = false;
  let apercu = false;          // l'aperçu du tranchage à la place des pièces
  let glisser = null;
  const cameras = { conception: null, impression: null, calibration: null };
  const formes = new WeakMap();      // maillage → Map(orientation → forme)
  let placees = new Map();           // id de pièce → { piece, source, noeud, echelle, forme, transformation }
  let controle = { hors: new Set(), chevauchements: [] };

  const documentCourant = () => etat.document();
  const impression = () => impressionDe(documentCourant());
  const machine = () => machineDe(impression());

  function formeDe(maillage, rotation, echelle) {
    let table = formes.get(maillage);
    if (table === undefined) {
      table = new Map();
      formes.set(maillage, table);
    }
    const cle = [rotation.x, rotation.y, rotation.z, echelle.x, echelle.y, echelle.z].join(",");
    if (!table.has(cle)) table.set(cle, formeTournee(maillage.positions, rotation, echelle));
    return table.get(cle);
  }

  /* La forme d'une pièce du plateau, si son maillage est déjà là. */
  function formePour(piece, noeud, echelle, maillage = dependances.maillageConnu(noeud)) {
    return maillage === null ? null : formeDe(maillage, piece.rotation, echelle);
  }

  /* Du repère du plateau (coin avant gauche) au repère du monde (plateau centré). */
  const versLeMonde = ({ min, max }) => {
    const [dx, dy] = [machine().largeur / 2, machine().profondeur / 2];
    return { min: [min[0] - dx, min[1] - dy, min[2]], max: [max[0] - dx, max[1] - dy, max[2]] };
  };

  // ── Modifier le plateau ─────────────────────────────────────────────────
  function modifier(nouvelle, { geste = null, aSelectionner = null } = {}) {
    try {
      etat.executer(commandeModifierPlateau.creer(documentCourant().impression, nouvelle, geste));
    } catch (erreur) {
      annoncer(erreur.message, true);
      return false;
    }
    if (aSelectionner !== null) selection = new Set(aSelectionner);
    nettoyerSelection();
    dependances.rafraichir();
    return true;
  }

  function nettoyerSelection() {
    const existantes = new Set(piecesPresentes(documentCourant()).map((p) => p.piece.id));
    const gardee = [...selection].filter((id) => existantes.has(id));
    if (gardee.length !== selection.size) selection = new Set(gardee);
  }

  /* Les boîtes des pièces déjà posées, pour en placer une nouvelle à côté. */
  function boitesPosees(sauf = new Set()) {
    return piecesPresentes(documentCourant())
      .filter((p) => !sauf.has(p.piece.id))
      .map((p) => {
        const forme = formePour(p.piece, p.noeud, p.echelle);
        if (forme !== null) return boiteSurLePlateau(p.piece, forme);
        const demi = TAILLE_INCONNUE_MM / 2;
        return { min: [p.piece.x - demi, p.piece.y - demi, 0], max: [p.piece.x + demi, p.piece.y + demi, 0] };
      });
  }

  /* Largeur et profondeur d'une pièce orientée ainsi, ou la taille par défaut. */
  function empriseDe(noeud, rotation, echelle) {
    const maillage = dependances.maillageConnu(noeud);
    if (maillage === null) return { largeur: TAILLE_INCONNUE_MM, profondeur: TAILLE_INCONNUE_MM };
    const { min, max } = formeDe(maillage, rotation, echelle).boite;
    return { largeur: max[0] - min[0], profondeur: max[1] - min[1] };
  }

  /* De nouvelles pièces, chacune à la place libre la plus proche du centre. */
  function placerDesPieces(nouvelles) {
    const boites = boitesPosees();
    const creees = [];
    for (const { source, partie, rotation, noeud, echelle } of nouvelles) {
      const { largeur, profondeur } = empriseDe(noeud, rotation, echelle);
      const { x, y } = placeLibre(largeur, profondeur, boites, machine());
      const piece = creerPiece({ source, partie, x, y, rotation });
      boites.push({ min: [x - largeur / 2, y - profondeur / 2, 0], max: [x + largeur / 2, y + profondeur / 2, 0] });
      creees.push(piece);
    }
    return creees;
  }

  function nomDe({ source, noeud, piece }) {
    const nom = dependances.nommer(source);
    if (piece.partie === null) return nom;
    // Les pièces d'un modèle portent souvent déjà son nom (« Clip A — mâle »).
    const partie = dependances.nommer(noeud);
    return partie.startsWith(nom) ? partie : nom + " — " + partie;
  }

  // ── Actions ─────────────────────────────────────────────────────────────
  const actions = {
    /* Depuis la conception : les objets choisis rejoignent le plateau. */
    mettreSurLePlateau(ids) {
      const document = documentCourant();
      const imprimables = new Map(objetsImprimables(document).map((n) => [n.id, n]));
      const dejaPlaces = new Set(impression().pieces.map((p) => p.source));
      const aPoser = ids.map((id) => imprimables.get(id)).filter((n) => n !== undefined && !dejaPlaces.has(n.id));
      if (aPoser.length === 0) {
        annoncer(ids.some((id) => dejaPlaces.has(id))
          ? "Déjà sur le plateau : Dupliquer dans l'onglet Impression pour en imprimer plusieurs."
          : "Rien à mettre sur le plateau : sélectionner une pièce pleine et visible.", true);
        return [];
      }
      const creees = placerDesPieces(aPoser.map((source) => ({
        source: source.id, partie: null, rotation: source.transformation.rotation,
        noeud: pretPourLeCalcul(document, source), echelle: source.transformation.echelle,
      })));
      if (!modifier(avecPieces(impression(), [...impression().pieces, ...creees]), { aSelectionner: creees.map((p) => p.id) })) return [];
      return creees;
    },

    toutMettreSurLePlateau() {
      const hors = objetsHorsPlateau(documentCourant());
      if (hors.length === 0) {
        annoncer("Tous les objets du projet sont déjà sur le plateau.");
        return;
      }
      actions.mettreSurLePlateau(hors.map((n) => n.id));
    },

    retirer(ids = [...selection]) {
      if (ids.length === 0) return;
      const retirees = new Set(ids);
      modifier(avecPieces(impression(), impression().pieces.filter((p) => !retirees.has(p.id))), { aSelectionner: [] });
    },

    dupliquer(ids = [...selection]) {
      const originales = piecesPresentes(documentCourant()).filter((p) => ids.includes(p.piece.id));
      if (originales.length === 0) return;
      const copies = placerDesPieces(originales.map((p) => ({
        source: p.piece.source, partie: p.piece.partie, rotation: p.piece.rotation, noeud: p.noeud, echelle: p.echelle,
      })));
      modifier(avecPieces(impression(), [...impression().pieces, ...copies]), { aSelectionner: copies.map((p) => p.id) });
    },

    deplacer(dx, dy, ids = [...selection], geste = null) {
      if (ids.length === 0) return;
      modifier(modifierPieces(impression(), ids, (p) => ({ x: p.x + dx, y: p.y + dy })), { geste });
    },

    placer(id, axe, valeur) {
      modifier(modifierPieces(impression(), [id], () => ({ [axe]: valeur })));
    },

    tourner(degres, ids = [...selection]) {
      if (ids.length === 0) return;
      modifier(modifierPieces(impression(), ids, (p) => ({ rotation: { ...p.rotation, z: angleNormalise(p.rotation.z + degres) } })), { geste: "tourner" });
    },

    definirAngle(valeur, ids = [...selection]) {
      if (ids.length === 0) return;
      modifier(modifierPieces(impression(), ids, (p) => ({ rotation: { ...p.rotation, z: angleNormalise(valeur) } })));
    },

    /* L'orientation qu'a la pièce dans l'assemblage. */
    orienterCommeLAssemblage(ids = [...selection]) {
      const choisies = piecesPresentes(documentCourant()).filter((p) => ids.includes(p.piece.id));
      if (choisies.length === 0) return;
      const document = documentCourant();
      const rotations = new Map(choisies.map((p) => [
        p.piece.id, rotationDAssemblage(p.source, p.piece.partie, pretPourLeCalcul(document, p.source)),
      ]));
      modifier(modifierPieces(impression(), ids, (p) => ({ rotation: rotations.get(p.id) ?? p.rotation })));
    },

    basculerPoserAPlat() {
      poserAPlat = !poserAPlat;
      if (poserAPlat) annoncer("Poser à plat : cliquer la face de la pièce qui doit reposer sur le plateau. Échap pour renoncer.");
      dependances.rafraichir();
    },

    poserSurLaFace(id, normale) {
      poserAPlat = false;
      modifier(modifierPieces(impression(), [id], (p) => ({ rotation: rotationPourPoserAPlat(p.rotation, normale) })), { aSelectionner: [id] });
    },

    disposer() {
      const presentes = piecesPresentes(documentCourant());
      if (presentes.length === 0) {
        annoncer("Le plateau est vide : mettre des pièces dessus depuis la liste de gauche.", true);
        return;
      }
      const places = disposer(presentes.map((p) => ({ id: p.piece.id, ...empriseDe(p.noeud, p.piece.rotation, p.echelle) })), machine());
      modifier(modifierPieces(impression(), [...places.keys()], (p) => places.get(p.id)));
    },

    /* Un objet paramétrique fait de plusieurs pièces : chacune devient une pièce du plateau. */
    eclater(id) {
      const presente = piecesPresentes(documentCourant()).find((p) => p.piece.id === id);
      if (presente === undefined || presente.piece.partie !== null) return;
      const rangs = partiesSeparables(presente.noeud);
      if (rangs.length === 0) return;
      const parties = rangs.map((rang) => {
        const enfant = presente.noeud.enfants[rang];
        return {
          source: presente.source.id, partie: rang, noeud: enfant, echelle: enfant.transformation.echelle,
          rotation: rotationDAssemblage(presente.source, rang, presente.noeud),
        };
      });
      // Les parties se placent autour des autres pièces, pas autour de l'objet qu'elles remplacent.
      const boites = boitesPosees(new Set([id]));
      const creees = parties.map((partie) => {
        const { largeur, profondeur } = empriseDe(partie.noeud, partie.rotation, partie.echelle);
        const { x, y } = placeLibre(largeur, profondeur, boites, machine());
        boites.push({ min: [x - largeur / 2, y - profondeur / 2, 0], max: [x + largeur / 2, y + profondeur / 2, 0] });
        return creerPiece({ source: partie.source, partie: partie.partie, x, y, rotation: partie.rotation });
      });
      const sansLObjet = impression().pieces.filter((p) => p.id !== id);
      modifier(avecPieces(impression(), [...sansLObjet, ...creees]), { aSelectionner: creees.map((p) => p.id) });
      annoncer(creees.length + " pièces séparées sur le plateau. L'objet reste entier dans la conception.");
    },

    /* L'inverse : les pièces séparées d'un objet redeviennent une seule pièce. */
    rassembler(id) {
      const piece = impression().pieces.find((p) => p.id === id);
      if (piece === undefined || piece.partie === null) return;
      const soeurs = impression().pieces.filter((p) => p.source === piece.source && p.partie !== null);
      const source = objetsImprimables(documentCourant()).find((n) => n.id === piece.source);
      if (source === undefined) return;
      const entiere = creerPiece({ source: source.id, partie: null, x: piece.x, y: piece.y, rotation: source.transformation.rotation });
      const restantes = impression().pieces.filter((p) => !soeurs.includes(p));
      modifier(avecPieces(impression(), [...restantes, entiere]), { aSelectionner: [entiere.id] });
    },

    // ── Réglages du tranchage ──
    regler(cle, valeur) {
      const i = impression();
      modifier(avecReglages(i, { ecarts: { ...i.ecarts, [cle]: valeur } }), { geste: "reglage:" + cle });
    },

    /* Le réglage reprend la valeur du préréglage. */
    retablir(cle) {
      const i = impression();
      const ecarts = { ...i.ecarts };
      delete ecarts[cle];
      modifier(avecReglages(i, { ecarts }));
    },

    /* source : l'une des cinq (imprimante, buse, plaque, materiau, reglages).
       Sans garder les écarts, seuls ceux de cette source partent. Changer de buse
       peut remplacer d'office la plaque, le matériau et les réglages : ils sont
       calibrés pour un diamètre, et pas pour un autre. */
    changerPrereglage(source, id, garderLesEcarts) {
      const i = impression();
      const ecarts = garderLesEcarts ? i.ecarts
        : Object.fromEntries(Object.entries(i.ecarts).filter(([cle]) => !(cle in ecartsDeLaSource(i.ecarts, source))));
      modifier(avecReglages(i, { [source]: id, ecarts }));
    },

    basculerApercu() {
      apercu = !apercu;
      poserAPlat = false;
      scene.marquerSurvol(null);
      dependances.surApercu(apercu);
      dependances.rafraichir();
    },

    changerMachine(id) {
      if (id === impression().imprimante) return;
      modifier(avecReglages(impression(), { imprimante: id }));
      scene.montrerPlateau(espace === ESPACES.impression ? machine() : null);
    },

    selectionner(ids, facon = "remplacer") {
      const nouvelle = facon === "remplacer" ? new Set(ids) : new Set(selection);
      if (facon === "basculer") {
        for (const id of ids) {
          if (nouvelle.has(id)) nouvelle.delete(id);
          else nouvelle.add(id);
        }
      }
      selection = nouvelle;
      dependances.rafraichir();
    },

    selectionnerTout() {
      actions.selectionner(piecesPresentes(documentCourant()).map((p) => p.piece.id));
    },

    /* Aperçu d'un champ de l'inspecteur : la pièce bouge, le document non. */
    apercu(id, modifications) {
      const p = placees.get(id);
      if (p === undefined || p.forme === null) return;
      const piece = creerPiece({ ...p.piece, ...modifications, rotation: { ...p.piece.rotation, ...(modifications.rotation ?? {}) } });
      const forme = formePour(piece, p.noeud, p.echelle);
      if (forme !== null) scene.apercu(id, transformationSurLePlateau(piece, p.echelle, forme, machine()));
    },

    /* Le plateau en STL, pièces placées comme sur la machine : un trancheur
       l'ouvre à l'identique. */
    exporter() {
      const presentes = [...placees.values()].filter((p) => p.forme !== null);
      if (piecesPresentes(documentCourant()).length === 0) {
        annoncer("Le plateau est vide : rien à exporter.", true);
        return;
      }
      if (presentes.length < piecesPresentes(documentCourant()).length) {
        annoncer("Des pièces sont encore en calcul : réessayer dans un instant.", true);
        return;
      }
      const [dx, dy] = [machine().largeur / 2, machine().profondeur / 2];
      const morceaux = presentes.map((p) => morceauAExporter(dependances.maillageConnu(p.noeud), {
        ...p.transformation,
        position: { x: p.transformation.position.x + dx, y: p.transformation.position.y + dy, z: p.transformation.position.z },
      }));
      const nom = documentCourant().nom;
      dependances.telecharger(stlBinaire(morceaux, nom + " - plateau"), (nom.trim() || "projet").replace(/[\\/:*?"<>|]+/g, "_") + " - plateau.stl", "model/stl");
      annoncer("Plateau exporté : " + presentes.length + (presentes.length > 1 ? " pièces" : " pièce") + ", aux positions de la machine.");
    },
  };

  // ── Ce que la vue montre ────────────────────────────────────────────────
  /*
   * La liste des objets de la scène dans l'onglet Impression. obtenir(noeud)
   * rend le maillage connu, ou null en le faisant calculer.
   */
  function objetsAAfficher(obtenir) {
    const m = machine();
    const nouvelles = new Map();
    const liste = [];
    for (const presente of piecesPresentes(documentCourant())) {
      const { piece, source, noeud, echelle } = presente;
      const maillage = obtenir(noeud);
      const forme = formePour(piece, noeud, echelle, maillage);
      const transformation = forme !== null
        ? transformationSurLePlateau(piece, echelle, forme, m)
        : placees.get(piece.id)?.transformation ?? null;
      nouvelles.set(piece.id, { ...presente, forme, transformation });
      if (transformation === null) continue;
      // Une pièce séparée d'un objet prend la couleur de l'objet si elle n'a pas la sienne.
      const apparence = piece.partie === null ? noeud
        : avecChamps(noeud, { couleur: noeud.couleur ?? source.couleur, finition: noeud.finition ?? source.finition });
      liste.push({ id: piece.id, noeud, maillage, transformation, apparence });
    }
    placees = nouvelles;
    controle = controlerLePlateau([...placees.values()].map((p) => ({ id: p.piece.id, piece: p.piece, forme: p.forme })), m);
    scene.signalerSurLePlateau([...fautives()].map((id) => versLeMonde(boiteSurLePlateau(placees.get(id).piece, placees.get(id).forme))));
    return liste;
  }

  function fautives() {
    return new Set([...controle.hors, ...controle.chevauchements.flat()]);
  }

  /* Pourquoi une pièce est signalée, en une phrase ; null si elle ne l'est pas. */
  function problemeDe(id) {
    const raisons = [];
    if (controle.hors.has(id)) raisons.push("dépasse du volume d'impression");
    const autres = controle.chevauchements.filter((paire) => paire.includes(id)).map((paire) => paire.find((i) => i !== id));
    if (autres.length > 0) {
      const noms = autres.map((autre) => (placees.has(autre) ? nomDe(placees.get(autre)) : "une autre pièce"));
      raisons.push("chevauche " + noms.join(", "));
    }
    return raisons.length === 0 ? null : raisons.join(" ; ");
  }

  // ── Gestes dans la vue ──────────────────────────────────────────────────
  function geste(genre, evenement) {
    if (espace !== ESPACES.impression) return false;
    const { clientX: x, clientY: y } = evenement;

    // Pendant l'aperçu du tranchage, la souris ne fait que déplacer la vue.
    if (apercu) {
      if (genre === "appui" && evenement.button === 0) scene.controleur.translaterDepuis(evenement);
      return true;
    }

    if (genre === "appui") {
      if (evenement.button !== 0) return true;
      const touche = scene.objetSous(x, y);
      if (poserAPlat) {
        if (touche !== null) actions.poserSurLaFace(touche.id, touche.normale);
        return true;
      }
      if (touche === null) {
        scene.controleur.translaterDepuis(evenement, () => actions.selectionner([]));
        return true;
      }
      const ajout = evenement.shiftKey || evenement.ctrlKey || evenement.metaKey;
      if (ajout) {
        actions.selectionner([touche.id], "basculer");
        return true;
      }
      if (!selection.has(touche.id)) actions.selectionner([touche.id]);
      const depart = scene.pointAuSol(x, y);
      if (depart !== null) {
        glisser = { depart, ecran: [x, y], ids: [...selection], bouge: false, decalage: [0, 0] };
        evenement.target.setPointerCapture?.(evenement.pointerId);
      }
      return true;
    }

    if (genre === "survol") {
      if (glisser === null) {
        scene.marquerSurvol(scene.objetSous(x, y)?.id ?? null);
        return true;
      }
      if (!glisser.bouge && Math.hypot(x - glisser.ecran[0], y - glisser.ecran[1]) < SEUIL_GLISSER_PX) return true;
      glisser.bouge = true;
      const point = scene.pointAuSol(x, y);
      if (point === null) return true;
      glisser.decalage = [point[0] - glisser.depart[0], point[1] - glisser.depart[1]];
      for (const id of glisser.ids) actions.apercu(id, { x: placees.get(id).piece.x + glisser.decalage[0], y: placees.get(id).piece.y + glisser.decalage[1] });
      dependances.mesurer?.("Déplacement : " + glisser.decalage.map((v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })).join(" × ") + " mm");
      return true;
    }

    if (genre === "relache") {
      if (glisser === null) return true;
      const fini = glisser;
      glisser = null;
      dependances.mesurer?.(null);
      if (fini.bouge) {
        scene.finirApercus();
        const [dx, dy] = fini.decalage.map((v) => Math.round(v * 10) / 10);
        actions.deplacer(dx, dy, fini.ids);
      }
      return true;
    }
    return false;
  }

  /* Les touches de l'onglet Impression. Rend true si la touche est prise ;
     les autres raccourcis de la conception n'y ont pas de sens. */
  function touche(evenement) {
    if (espace !== ESPACES.impression) return false;
    const ctrl = evenement.ctrlKey || evenement.metaKey;
    const cle = evenement.key.toLowerCase();
    // Annuler, refaire, enregistrer : les mêmes partout.
    if (ctrl && ["z", "y", "s"].includes(cle)) return false;
    const pas = evenement.shiftKey ? PAS_LARGE_MM : PAS_FIN_MM;
    if (!ctrl && cle === "v") {
      actions.basculerApercu();
      return true;
    }
    // Dans l'aperçu, les flèches montent et descendent dans les couches.
    if (apercu && !ctrl && ["arrowup", "arrowdown"].includes(cle)) {
      dependances.changerDeCouche((cle === "arrowup" ? 1 : -1) * (evenement.shiftKey ? 10 : 1));
      return true;
    }
    // Et les flèches gauche et droite font avancer la buse dans la couche.
    if (apercu && !ctrl && ["arrowleft", "arrowright"].includes(cle)) {
      dependances.avancerDansLaCouche((cle === "arrowright" ? 1 : -1) * (evenement.shiftKey ? 10 : 1));
      return true;
    }
    if (apercu) return (!ctrl && cle.length === 1) || ["delete", "backspace", "arrowleft", "arrowright"].includes(cle);
    const table = ctrl ? {
      d: () => actions.dupliquer(),
      a: () => actions.selectionnerTout(),
    } : {
      delete: () => actions.retirer(),
      backspace: () => actions.retirer(),
      escape: () => (poserAPlat ? actions.basculerPoserAPlat() : actions.selectionner([])),
      r: () => actions.tourner(evenement.shiftKey ? -90 : 90),
      p: () => actions.basculerPoserAPlat(),
      f: () => scene.cadrerLePlateau(),
      arrowleft: () => actions.deplacer(-pas, 0, undefined, "fleches"),
      arrowright: () => actions.deplacer(pas, 0, undefined, "fleches"),
      arrowup: () => actions.deplacer(0, pas, undefined, "fleches"),
      arrowdown: () => actions.deplacer(0, -pas, undefined, "fleches"),
    };
    const action = table[cle];
    if (action !== undefined) {
      action();
      return true;
    }
    // Les lettres et Suppr de la conception (T, K, Ctrl+G…) ne font rien ici.
    return (!ctrl && cle.length === 1) || (ctrl && ["g", "c", "v"].includes(cle)) || ["pageup", "pagedown"].includes(cle);
  }

  // ── Changer d'onglet ────────────────────────────────────────────────────
  function changer(nom) {
    if (nom === espace) return true;
    if (apercu) actions.basculerApercu();
    if (nom !== ESPACES.conception) {
      const refus = dependances.refusDEntrer();
      if (refus !== null) {
        annoncer(refus, true);
        return false;
      }
    }
    cameras[espace] = scene.controleur.photographier();
    espace = nom;
    poserAPlat = false;
    glisser = null;
    scene.finirApercus();
    scene.marquerSurvol(null);
    // La calibration montre aussi le plateau : c'est l'éprouvette qu'on y voit.
    const surLePlateau = nom === ESPACES.impression || nom === ESPACES.calibration;
    const enImpression = nom === ESPACES.impression;
    scene.montrerPlateau(surLePlateau ? machine() : null);
    if (!surLePlateau) scene.signalerSurLePlateau([]);
    if (cameras[nom] !== null) scene.controleur.restaurer(cameras[nom]);
    else if (surLePlateau) scene.cadrerLePlateau();
    if (surLePlateau) nettoyerSelection();
    dependances.surChangementDEspace(nom);
    return true;
  }

  return {
    actions,
    geste,
    touche,
    changer,
    espace: () => espace,
    apercuActif: () => apercu,

    /* Les pièces prêtes à trancher : forme connue, pose en repère machine. */
    piecesATrancher() {
      const [dx, dy] = [machine().largeur / 2, machine().profondeur / 2];
      return [...placees.values()].filter((p) => p.forme !== null).map((p) => ({
        id: p.piece.id,
        noeud: p.noeud,
        maillage: dependances.maillageConnu(p.noeud),
        transformation: {
          ...p.transformation,
          position: { x: p.transformation.position.x + dx, y: p.transformation.position.y + dy, z: p.transformation.position.z },
        },
        hauteur: p.forme.boite.max[2] - p.forme.boite.min[2],
      })).filter((p) => p.maillage !== null);
    },
    enImpression: () => espace === ESPACES.impression,
    enCalibration: () => espace === ESPACES.calibration,
    selection: () => selection,
    poserAPlatActif: () => poserAPlat,
    objetsAAfficher,
    machine,
    impression,

    /* Ce que les panneaux montrent. */
    resume() {
      const presentes = [...placees.values()];
      return {
        machine: machine(),
        pieces: presentes.map((p) => {
          const boite = p.forme === null ? null : boiteSurLePlateau(p.piece, p.forme);
          return {
            id: p.piece.id,
            nom: nomDe(p),
            piece: p.piece,
            boite,
            probleme: problemeDe(p.piece.id),
            enCalcul: p.forme === null,
            separable: p.piece.partie === null && partiesSeparables(p.noeud).length > 0,
            partie: p.piece.partie !== null,
          };
        }),
        horsPlateau: objetsHorsPlateau(documentCourant()).map((n) => ({ id: n.id, nom: dependances.nommer(n) })),
        fautives: fautives().size,
      };
    },
  };
}
