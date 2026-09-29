/*
 * application/operations/operations_repetition.js
 * ───────────────────────────────────────────────
 * Les fenêtres d'opération de la symétrie et des deux répétitions. Chaque
 * réglage est appliqué tout de suite au nœud de répétition (le résultat se
 * voit en direct) ; la fenêtre propose des choix qui parlent à un élève
 * — « contre l'objet », « centre du plateau » — et les traduit elle-même en
 * positions.
 *
 * Repère d'une répétition : posé au pied de l'objet d'origine, l'objet centré
 * en X et Y, son dessous à Z = 0.
 */

import { arrondi } from "../actions_repetition.js";

const MARGE_ENTRE_COPIES_MM = 5;
const MARGE_DU_PLAN_MM = 10;
const AXES = ["x", "y", "z"];
const INDICE = { x: 0, y: 1, z: 2 };
const AXE_DU_PLAN = { YZ: "x", XZ: "y", XY: "z" };
const VECTEUR = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

const centreLocal = (taille) => [0, 0, taille.z / 2];
const plusGrand = (taille) => Math.max(taille.x, taille.y, taille.z, 1);

/* Une direction du repère de la répétition, exprimée dans le monde. */
function directionMonde(outils, id, vecteur) {
  const a = outils.versLeMonde(id, [0, 0, 0]);
  const b = outils.versLeMonde(id, vecteur);
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

// ── Symétrie ────────────────────────────────────────────────────────────────

function positionDuMiroir(outils, id, miroir, plan, taille, actuelle) {
  const axe = AXE_DU_PLAN[plan];
  if (miroir === "colle") return axe === "z" ? taille.z : arrondi(taille[axe] / 2);
  if (miroir === "centre") return centreLocal(taille)[INDICE[axe]];
  if (miroir === "plateau") return outils.versLeRepere(id, [0, 0, 0])[INDICE[axe]];
  return actuelle;
}

function operationSymetrie(outils, idExistant) {
  let id = idExistant;
  return {
    titre: "Symétrie",
    icone: "symetrie",
    idDuNoeud: () => id,
    libelle: "Symétrie",
    champs: [
      {
        genre: "choix", cle: "plan", etiquette: "Plan de symétrie",
        options: [
          { valeur: "YZ", etiquette: "Gauche ↔ droite", detail: "plan YZ", aide: "Le reflet se place à gauche ou à droite de l'objet." },
          { valeur: "XZ", etiquette: "Avant ↔ arrière", detail: "plan XZ", aide: "Le reflet se place devant ou derrière l'objet." },
          { valeur: "XY", etiquette: "Haut ↔ bas", detail: "plan XY", aide: "Le reflet se place au-dessus ou au-dessous de l'objet." },
        ],
      },
      {
        genre: "choix", cle: "miroir", etiquette: "Position du plan",
        options: [
          { valeur: "colle", etiquette: "Contre l'objet", aide: "Le plan touche une face de l'objet : le reflet lui est accolé." },
          { valeur: "centre", etiquette: "Centre de l'objet", aide: "Le plan coupe l'objet en son milieu : le reflet se superpose à l'original." },
          { valeur: "plateau", etiquette: "Centre du plateau", aide: "Le plan passe par l'origine du plateau." },
          { valeur: "autre", etiquette: "Valeur", aide: "Position du plan saisie en millimètres." },
        ],
      },
      {
        genre: "nombre", cle: "position", etiquette: "Position", unite: "mm", visible: (v) => v.miroir === "autre",
        aide: "Distance du plan au centre de l'objet ; pour le plan XY, à son dessous.",
      },
      { genre: "case", cle: "garder", texte: "Conserver l'original" },
    ],

    preparer() {
      if (id === null) {
        id = outils.envelopper("symetrie", (taille) => ({ plan: "YZ", position: arrondi(taille.x / 2), garder: true })).id;
        return { plan: "YZ", miroir: "colle", position: outils.parametres(id).position, garder: true };
      }
      const p = outils.parametres(id);
      const miroir = ["colle", "centre", "plateau"]
        .find((m) => Math.abs(positionDuMiroir(outils, id, m, p.plan, p.tailleObjet, p.position) - p.position) < 0.01) ?? "autre";
      return { plan: p.plan, miroir, position: p.position, garder: p.garder };
    },

    changer(cle, valeur, valeurs) {
      const suivantes = { ...valeurs, [cle]: valeur };
      const { tailleObjet } = outils.parametres(id);
      suivantes.position = positionDuMiroir(outils, id, suivantes.miroir, suivantes.plan, tailleObjet, suivantes.position);
      outils.regler(id, { plan: suivantes.plan, position: suivantes.position, garder: suivantes.garder });
      return suivantes;
    },

    aides(valeurs) {
      const { tailleObjet } = outils.parametres(id);
      const axe = AXE_DU_PLAN[valeurs.plan];
      const local = centreLocal(tailleObjet);
      local[INDICE[axe]] = valeurs.position;
      return [{
        genre: "plan",
        centre: outils.versLeMonde(id, local),
        normale: directionMonde(outils, id, VECTEUR[axe]),
        taille: plusGrand(tailleObjet) * 1.4 + MARGE_DU_PLAN_MM,
      }];
    },

    apresValidation: () => outils.garderEnVue(id),
  };
}

// ── Répétition en ligne ─────────────────────────────────────────────────────

const ecartAuto = (taille, axe) => arrondi(Math.max(1, taille[axe] + MARGE_ENTRE_COPIES_MM));

function operationLigne(outils, idExistant) {
  let id = idExistant;
  return {
    titre: "Répétition en ligne",
    icone: "repetition_ligne",
    idDuNoeud: () => id,
    libelle: "Répétition en ligne",
    champs: [
      {
        genre: "choix", cle: "axe", etiquette: "Direction",
        options: [
          { valeur: "x", etiquette: "Axe X", detail: "vers la droite" },
          { valeur: "y", etiquette: "Axe Y", detail: "vers l'arrière" },
          { valeur: "z", etiquette: "Axe Z", detail: "vers le haut" },
        ],
      },
      { genre: "nombre", cle: "nombre", etiquette: "Exemplaires", min: 1, max: 100, entier: true, aide: "Nombre total d'objets, original compris." },
      {
        genre: "nombre", cle: "ecart", etiquette: "Écart", unite: "mm", min: -2000, max: 2000,
        aide: "Distance entre les centres de deux exemplaires voisins. Une valeur négative inverse le sens.",
      },
      { genre: "case", cle: "deuxSens", texte: "Prolonger aussi dans le sens opposé" },
      { genre: "note", texte: (v) => "Longueur de l'objet selon cet axe : " + String(v.longueur).replace(".", ",") + " mm." },
    ],

    preparer() {
      if (id === null) {
        id = outils.envelopper("repetition_ligne", (taille) => ({ axe: "x", nombre: 3, ecart: ecartAuto(taille, "x"), deuxSens: false })).id;
      }
      const p = outils.parametres(id);
      return { axe: p.axe, nombre: p.nombre, ecart: p.ecart, deuxSens: p.deuxSens, longueur: p.tailleObjet[p.axe] };
    },

    changer(cle, valeur, valeurs) {
      const { tailleObjet } = outils.parametres(id);
      const suivantes = { ...valeurs, [cle]: valeur };
      // Un écart laissé à sa valeur automatique suit la direction choisie.
      if (cle === "axe" && valeurs.ecart === ecartAuto(tailleObjet, valeurs.axe)) suivantes.ecart = ecartAuto(tailleObjet, valeur);
      suivantes.longueur = tailleObjet[suivantes.axe];
      outils.regler(id, { axe: suivantes.axe, nombre: suivantes.nombre, ecart: suivantes.ecart, deuxSens: suivantes.deuxSens });
      return suivantes;
    },

    aides(valeurs) {
      const { tailleObjet } = outils.parametres(id);
      const depart = centreLocal(tailleObjet);
      const bout = (signe) => {
        const point = [...depart];
        point[INDICE[valeurs.axe]] += signe * Math.max(1, valeurs.nombre - 1) * valeurs.ecart;
        return { genre: "fleche", depart: outils.versLeMonde(id, depart), arrivee: outils.versLeMonde(id, point) };
      };
      return valeurs.deuxSens ? [bout(1), bout(-1)] : [bout(1)];
    },

    apresValidation: () => outils.garderEnVue(id),
  };
}

// ── Répétition en cercle ────────────────────────────────────────────────────

/* Le centre du cercle, dans le repère, pour chaque façon de le choisir. */
function centreDuCercle(outils, id, valeurs, taille) {
  const objet = centreLocal(taille);
  const i = INDICE[valeurs.axe];
  if (valeurs.autour === "objet") return objet;
  if (valeurs.autour === "plateau") {
    const origine = outils.versLeRepere(id, [0, 0, 0]);
    origine[i] = objet[i];
    return origine;
  }
  // « point » : le centre est à « rayon » de l'objet, dans la direction déjà choisie.
  const centre = [valeurs.centreX, valeurs.centreY, valeurs.centreZ];
  const ecart = objet.map((c, k) => (k === i ? 0 : c - centre[k]));
  const longueur = Math.hypot(...ecart);
  const direction = longueur > 1e-6 ? ecart.map((c) => c / longueur) : AXES.map((a, k) => (k === (i + 1) % 3 ? 1 : 0));
  return objet.map((c, k) => (k === i ? c : arrondi(c - direction[k] * valeurs.rayon)));
}

function rayonDepuis(valeurs, taille) {
  const objet = centreLocal(taille);
  const i = INDICE[valeurs.axe];
  const centre = [valeurs.centreX, valeurs.centreY, valeurs.centreZ];
  return arrondi(Math.hypot(...objet.map((c, k) => (k === i ? 0 : c - centre[k]))));
}

function operationCercle(outils, idExistant) {
  let id = idExistant;
  let enChoix = false;

  function appliquer(valeurs) {
    const { tailleObjet } = outils.parametres(id);
    const [centreX, centreY, centreZ] = centreDuCercle(outils, id, valeurs, tailleObjet);
    const suivantes = { ...valeurs, centreX, centreY, centreZ };
    suivantes.rayon = rayonDepuis(suivantes, tailleObjet);
    outils.regler(id, {
      axe: suivantes.axe, nombre: suivantes.nombre, angle: suivantes.angle, tourner: suivantes.tourner, centreX, centreY, centreZ,
    });
    return suivantes;
  }

  function choisirLeCentre(valeurs) {
    enChoix = true;
    outils.operations.rafraichir();
    outils.choix.demarrer({
      message: null,
      survol() {},
      appui(evenement) {
        const { tailleObjet } = outils.parametres(id);
        const i = INDICE[valeurs.axe];
        const objetMonde = outils.versLeMonde(id, centreLocal(tailleObjet));
        const point = outils.scene.pointSurPlan(evenement.clientX, evenement.clientY, objetMonde, directionMonde(outils, id, VECTEUR[valeurs.axe]));
        if (point === null) return false;
        const local = outils.versLeRepere(id, point);
        local[i] = centreLocal(tailleObjet)[i];
        const actuelles = outils.operations.valeurs();
        const suivantes = { ...actuelles, autour: "point", centreX: local[0], centreY: local[1], centreZ: local[2] };
        suivantes.rayon = rayonDepuis(suivantes, tailleObjet);
        enChoix = false;
        outils.operations.rafraichir(appliquer(suivantes));
        return true;
      },
      arreter() {
        enChoix = false;
      },
    });
  }

  return {
    titre: "Répétition en cercle",
    icone: "repetition_cercle",
    idDuNoeud: () => id,
    libelle: "Répétition en cercle",
    champs: [
      { genre: "nombre", cle: "nombre", etiquette: "Exemplaires", min: 1, max: 100, entier: true, aide: "Nombre total d'objets, original compris." },
      {
        genre: "choix", cle: "autour", etiquette: "Centre du cercle",
        options: [
          { valeur: "point", etiquette: "Point à distance", aide: "Centre placé à la distance choisie de l'objet, ou désigné d'un clic dans la vue." },
          { valeur: "plateau", etiquette: "Centre du plateau", aide: "Les exemplaires tournent autour de l'origine du plateau." },
          { valeur: "objet", etiquette: "Centre de l'objet", aide: "Les exemplaires tournent sur place, autour du centre de l'objet." },
        ],
      },
      {
        genre: "nombre", cle: "rayon", etiquette: "Rayon", unite: "mm", min: 0, max: 2000, visible: (v) => v.autour === "point",
        aide: "Distance entre le centre du cercle et le centre de l'objet.",
      },
      { genre: "bouton", icone: "repetition_cercle", texte: "Désigner le centre dans la vue", action: () => choisirLeCentre(outils.operations.valeurs()) },
      {
        genre: "nombre", cle: "angle", etiquette: "Angle total", unite: "°", min: 1, max: 360, pasFixe: 15,
        aide: "360° : les exemplaires font le tour complet. En dessous, ils se répartissent sur un arc.",
      },
      {
        genre: "choix", cle: "axe", etiquette: "Axe de rotation",
        options: [
          { valeur: "z", etiquette: "Axe Z", detail: "vertical", aide: "Les exemplaires tournent à plat, autour d'un axe vertical." },
          { valeur: "x", etiquette: "Axe X", detail: "gauche-droite", aide: "Les exemplaires tournent debout, autour d'un axe gauche-droite." },
          { valeur: "y", etiquette: "Axe Y", detail: "avant-arrière", aide: "Les exemplaires tournent debout, autour d'un axe avant-arrière." },
        ],
      },
      { genre: "case", cle: "tourner", texte: "Orienter les exemplaires selon le cercle" },
    ],
    consigne: () => (enChoix ? "Cliquer dans la vue pour placer le centre du cercle." : null),

    preparer() {
      if (id === null) {
        // Loin de l'origine : on tourne autour du plateau. Sinon, autour d'un point à côté.
        id = outils.envelopper("repetition_cercle", (taille, appui) => {
          const pres = Math.hypot(appui.x, appui.y) < Math.max(taille.x, taille.y) / 2;
          const rayon = arrondi(Math.max(taille.x, taille.y, 10));
          const centre = pres ? { centreX: -rayon, centreY: 0 } : { centreX: arrondi(-appui.x), centreY: arrondi(-appui.y) };
          return { axe: "z", nombre: 6, angle: 360, tourner: true, ...centre, centreZ: arrondi(taille.z / 2) };
        }).id;
        const p = outils.parametres(id);
        const valeurs = { axe: p.axe, nombre: p.nombre, angle: p.angle, tourner: p.tourner, centreX: p.centreX, centreY: p.centreY, centreZ: p.centreZ };
        const origine = outils.versLeRepere(id, [0, 0, 0]);
        valeurs.autour = Math.abs(origine[0] - p.centreX) < 0.01 && Math.abs(origine[1] - p.centreY) < 0.01 ? "plateau" : "point";
        valeurs.rayon = rayonDepuis(valeurs, p.tailleObjet);
        return valeurs;
      }
      const p = outils.parametres(id);
      const valeurs = { axe: p.axe, nombre: p.nombre, angle: p.angle, tourner: p.tourner, centreX: p.centreX, centreY: p.centreY, centreZ: p.centreZ };
      valeurs.rayon = rayonDepuis(valeurs, p.tailleObjet);
      const origine = outils.versLeRepere(id, [0, 0, 0]);
      const i = INDICE[p.axe];
      const surOrigine = [0, 1, 2].every((k) => k === i || Math.abs(origine[k] - valeurs["centre" + "XYZ"[k]]) < 0.01);
      valeurs.autour = valeurs.rayon < 0.01 ? "objet" : surOrigine ? "plateau" : "point";
      return valeurs;
    },

    changer(cle, valeur, valeurs) {
      const suivantes = { ...valeurs, [cle]: valeur };
      if (cle === "autour" && valeur === "point" && valeurs.rayon < 0.01) {
        suivantes.rayon = arrondi(Math.max(outils.parametres(id).tailleObjet.x, 10));
      }
      return appliquer(suivantes);
    },

    aides(valeurs) {
      const { tailleObjet } = outils.parametres(id);
      const centre = [valeurs.centreX, valeurs.centreY, valeurs.centreZ];
      const normale = directionMonde(outils, id, VECTEUR[valeurs.axe]);
      const centreMonde = outils.versLeMonde(id, centre);
      const demiAxe = plusGrand(tailleObjet) / 2 + MARGE_DU_PLAN_MM;
      const aides = [
        { genre: "point", position: centreMonde },
        {
          genre: "axe",
          de: centreMonde.map((c, k) => c - normale[k] * demiAxe),
          a: centreMonde.map((c, k) => c + normale[k] * demiAxe),
        },
      ];
      if (valeurs.rayon > 0.01) aides.push({ genre: "cercle", centre: centreMonde, normale, rayon: valeurs.rayon });
      return aides;
    },

    apresValidation: () => outils.garderEnVue(id),
  };
}

export function operationDeRepetition(nomDuType, outils, id) {
  const fabriques = { symetrie: operationSymetrie, repetition_ligne: operationLigne, repetition_cercle: operationCercle };
  return fabriques[nomDuType](outils, id);
}
