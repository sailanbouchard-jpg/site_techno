/*
 * application/operations/operations_esquisse.js
 * ─────────────────────────────────────────────
 * Deux fenêtres d'opération autour des esquisses :
 *   - « Nouvelle esquisse » : où dessiner (un plan de base, ou la face plate
 *     d'une pièce) ;
 *   - « Extruder / Épaissir / Faire tourner » : le solide naît tout de suite
 *     avec ses réglages de départ, l'élève les ajuste en voyant le résultat.
 */

import { typeDeNoeud } from "../../noyau/registre_types_de_noeuds.js";
import { planSelonNormale, PLANS, repereDeFace } from "../../noyau/esquisse/plans_esquisse.js";

// ── Champs tirés d'un type ──────────────────────────────────────────────────

/* Les réglages visibles d'un type, en champs de fenêtre. */
export function champsDuType(type, surcharges = {}) {
  return Object.entries(type.parametres)
    .filter(([, d]) => !d.cache && !d.lectureSeule && !d.avance)
    .map(([cle, d]) => {
      const surcharge = surcharges[cle] ?? {};
      if (d.choix) return { genre: "choix", cle, etiquette: d.etiquette, options: d.choix, ...surcharge };
      if (d.case) return { genre: "case", cle, texte: d.case, ...surcharge };
      if (d.texte) return { genre: "texte", cle, etiquette: d.etiquette, ...surcharge };
      return {
        genre: "nombre", cle, etiquette: d.etiquette, unite: d.unite,
        min: d.min, max: d.max, pasFixe: d.pasFixe, entier: d.entier, ...surcharge,
      };
    })
    // Un réglage que les autres rendent sans objet (masque) disparaît de la fenêtre.
    .map((champ) => {
      const d = type.parametres[champ.cle];
      return typeof d.masque === "function" ? { ...champ, visible: (valeurs) => !d.masque(valeurs) } : champ;
    });
}

/* Le mot qui dit où va une direction du monde : « vers le haut », « vers l'avant »… */
function direction([x, y, z]) {
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)];
  if (az >= ax && az >= ay) return z > 0 ? "Vers le haut" : "Vers le bas";
  if (ay >= ax) return y < 0 ? "Vers l'avant" : "Vers l'arrière";
  return x > 0 ? "Vers la droite" : "Vers la gauche";
}

// ── Extruder, épaissir, faire tourner ───────────────────────────────────────

export const LONGUEUR_POIGNEE_PX = 40;
const TOLERANCE_POIGNEE_PX = 12;
const HAUTEUR_MIN_MM = 0.1;

/* Distance, en pixels, d'un point de l'écran à un segment de l'écran. */
function distanceAuSegment([px, py], [ax, ay], [bx, by]) {
  const [dx, dy] = [bx - ax, by - ay];
  const longueur = dx * dx + dy * dy;
  const t = longueur === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / longueur));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/*
 * La flèche de hauteur d'un solide tiré d'une esquisse : { base, direction,
 * bout, pointe, symetrique } dans le monde, ou null tant que la forme n'est
 * pas calculée. base : le point fixe ; la hauteur se mesure depuis lui.
 */
function poigneeDeHauteur(outils, id, valeurs) {
  const boite = outils.scene.boiteMonde(id);
  if (boite === null) return null;
  const n = outils.normaleDeLEsquisse(id);
  const direction = valeurs.sens === "bas" ? n.map((c) => -c) : n;
  const centre = [0, 1, 2].map((i) => (boite.min[i] + boite.max[i]) / 2);
  const demi = Math.abs([0, 1, 2].reduce((s, i) => s + (boite.max[i] - boite.min[i]) * n[i], 0)) / 2;
  const symetrique = valeurs.sens === "symetrique";
  const base = symetrique ? centre : centre.map((c, i) => c - direction[i] * demi);
  const bout = centre.map((c, i) => c + direction[i] * demi);
  const longueur = LONGUEUR_POIGNEE_PX * outils.scene.millimetresParPixel(bout);
  return { base, direction, bout, pointe: bout.map((c, i) => c + direction[i] * longueur), symetrique };
}

/*
 * outils : { etat, parametres(id), regler(id, valeurs), normaleDeLEsquisse(id),
 *            consommer(nomDuType) → { id, sensExterieur }, rouvrirEsquisse(),
 *            garderEnVue(id) }
 * idExistant : un solide déjà créé qu'on vient régler.
 */
export function operationSolideEsquisse(nomDuType, outils, idExistant = null) {
  const type = typeDeNoeud(nomDuType);
  let id = idExistant;
  // Une hauteur se tire à la souris : la flèche au bout du solide.
  const avecPoignee = type.parametres.hauteur !== undefined;
  let tirage = null;     // { base, direction, symetrique } pendant qu'on tire la flèche
  const surcharges = {};
  const champs = () => champsDuType(type, surcharges);
  // Une révolution autour d'un segment : on le clique dans la vue.
  const parUnSegment = type.parametres.ligne !== undefined;
  let segmentSurvole = null;
  const segmentSous = (evenement) => {
    let meilleur = null;
    let ecart = TOLERANCE_POIGNEE_PX;
    for (const s of outils.segmentsDeLEsquisse(id)) {
      const [a, b] = s.points.map((p) => outils.scene.versEcran(p));
      const d = distanceAuSegment([evenement.clientX, evenement.clientY], a, b);
      if (d < ecart) {
        ecart = d;
        meilleur = s;
      }
    }
    return meilleur;
  };
  // Une extrusion jusqu'à un point de référence : on clique le point dans la vue.
  const jusquAUnPoint = type.parametres.jusqua !== undefined;
  let choixDuPoint = false;      // en attente du clic sur un point de référence
  let pointSurvole = null;
  const cleDuPoint = (r) => (r === null ? "" : r.esquisse + ":" + r.point);
  const pointSous = (evenement) => {
    let meilleur = null;
    let ecart = TOLERANCE_POIGNEE_PX;
    for (const r of outils.referencesPourLaHauteur(id)) {
      const [x, y] = outils.scene.versEcran(r.monde);
      const d = Math.hypot(x - evenement.clientX, y - evenement.clientY);
      if (d < ecart) {
        ecart = d;
        meilleur = r;
      }
    }
    return meilleur;
  };
  // Les valeurs de la fenêtre, relues sur l'objet : la hauteur a pu changer toute seule.
  let valeursConnues = {};
  const relire = (valeurs) => {
    const p = outils.parametres(id);
    valeursConnues = { ...valeurs, hauteur: p.hauteur, sens: p.sens, jusqua: p.jusqua ?? null };
    return valeursConnues;
  };
  // Une extrusion de face donne sa propre flèche (voir operation_extruder_face.js).
  const poignee = (valeurs) => (outils.poigneeDeHauteur ? outils.poigneeDeHauteur(valeurs) : poigneeDeHauteur(outils, id, valeurs));

  const operation = {
    titre: type.etiquette,
    icone: type.icone,
    idDuNoeud: () => id,
    libelle: type.verbe,
    champs: [],
    consigne: (valeurs) => {
      if (choixDuPoint) return "Cliquer dans la vue le point de référence (en jaune) jusqu'où extruder. Échap : annuler l'opération.";
      if (jusquAUnPoint && valeurs?.jusqua) return "La hauteur va jusqu'au point de référence choisi, mesurée le long de la normale de l'esquisse.";
      if (avecPoignee) return "Hauteur : saisir la valeur, ou tirer la flèche dans la vue.";
      if (parUnSegment && valeurs?.axe === "ligne") return "Cliquer dans la vue le segment de l'esquisse autour duquel tourner.";
      return type.consigneOperation ?? null;
    },

    preparer() {
      let depart = {};
      if (id === null) {
        const cree = outils.consommer(nomDuType);
        id = cree.id;
        // Une esquisse posée sur une face dont la normale entre dans la pièce : on tire vers l'extérieur.
        if (nomDuType === "extrusion" && cree.sensExterieur < 0) depart = { sens: "bas" };
      }
      if (type.parametres.sens !== undefined) {
        const n = outils.normaleDeLEsquisse(id);
        surcharges.sens = {
          etiquette: "Sens",
          options: [
            { valeur: "haut", etiquette: direction(n) },
            { valeur: "bas", etiquette: direction(n.map((c) => -c)) },
            { valeur: "symetrique", etiquette: "Des deux côtés" },
          ],
        };
      }
      operation.champs = champs();
      // Balayage : le logiciel a deviné lequel est le profil ; on peut le contredire.
      if (typeof type.echanger === "function") {
        operation.champs.push({
          genre: "bouton", icone: "echanger", texte: "Échanger profil et chemin",
          action: () => {
            try {
              outils.regler(id, type.echanger(outils.parametres(id)));
            } catch (erreur) {
              outils.annoncer?.(erreur.message, true);
            }
          },
        });
      }
      if (jusquAUnPoint) {
        operation.champs.splice(1, 0,
          {
            genre: "bouton", icone: "sur_reference", texte: "Jusqu'à un point de référence",
            visible: (v) => !v.jusqua,
            action: () => {
              if (outils.referencesPourLaHauteur(id).length === 0) {
                outils.annoncer?.("Aucun point de référence : en marquer un dans une esquisse avec l'outil « Référence ».", true);
                return;
              }
              choixDuPoint = true;
              outils.operations.rafraichir();
            },
          },
          { genre: "note", visible: (v) => Boolean(v.jusqua), texte: (v) => "Hauteur jusqu'au point : " + String(v.hauteur).replace(".", ",") + " mm." },
          {
            genre: "bouton", icone: "fermer", texte: "Hauteur libre", visible: (v) => Boolean(v.jusqua),
            action: () => {
              outils.regler(id, { jusqua: null });
              outils.operations.rafraichir(relire(valeursConnues));
            },
          });
      }
      if (Object.keys(depart).length > 0) outils.regler(id, depart);
      const p = outils.parametres(id);
      valeursConnues = { ...Object.fromEntries(operation.champs.filter((c) => c.cle).map((c) => [c.cle, p[c.cle]])), jusqua: p.jusqua ?? null };
      return valeursConnues;
    },

    changer(cle, valeur, valeurs) {
      // Tourner autour d'un segment attend qu'on le clique : rien ne change avant.
      if (cle === "axe" && valeur === "ligne" && outils.parametres(id).ligne == null) return { ...valeurs, axe: valeur };
      outils.regler(id, { [cle]: valeur });
      // Jusqu'à un point, le sens change la hauteur (des deux côtés : le double).
      return jusquAUnPoint ? relire({ ...valeurs, [cle]: valeur }) : { ...valeurs, [cle]: valeur };
    },

    aides(valeurs) {
      if (choixDuPoint) {
        return outils.referencesPourLaHauteur(id).map((r) => ({ genre: "reference", position: r.monde, fort: cleDuPoint(r) === cleDuPoint(pointSurvole) }));
      }
      if (parUnSegment && valeurs.axe === "ligne") {
        const choisi = outils.parametres(id).ligne;
        return outils.segmentsDeLEsquisse(id).map((s) => ({
          genre: "arete", points: s.points, fort: s.id === choisi || s.id === segmentSurvole?.id,
        }));
      }
      const fleche = avecPoignee ? poignee(valeurs) : null;
      return fleche === null ? [] : [{ genre: "fleche", depart: fleche.bout, arrivee: fleche.pointe }];
    },

    /* Tirer la flèche : la hauteur suit la souris le long de la normale. */
    geste(genre, evenement, valeurs) {
      if (choixDuPoint) {
        const r = pointSous(evenement);
        if (genre === "survol") {
          if (cleDuPoint(r) !== cleDuPoint(pointSurvole)) {
            pointSurvole = r;
            outils.operations.rafraichir();
          }
          return false;
        }
        if (genre !== "appui" || evenement.button !== 0 || r === null) return false;
        choixDuPoint = false;
        pointSurvole = null;
        outils.regler(id, { jusqua: { esquisse: r.esquisse, point: r.point } });
        outils.operations.rafraichir(relire(valeurs));
        return true;
      }
      if (jusquAUnPoint && valeurs.jusqua && genre === "appui") return false;
      if (parUnSegment && valeurs.axe === "ligne") {
        const s = segmentSous(evenement);
        if (genre === "survol") {
          if ((s?.id ?? null) !== (segmentSurvole?.id ?? null)) {
            segmentSurvole = s;
            outils.operations.rafraichir();
          }
          return false;
        }
        if (genre !== "appui" || evenement.button !== 0 || s === null) return false;
        outils.regler(id, { axe: "ligne", ligne: s.id });
        outils.operations.rafraichir();
        return true;
      }
      if (!avecPoignee) return false;
      if (genre === "appui" && evenement.button === 0) {
        const fleche = poignee(valeurs);
        if (fleche === null) return false;
        const souris = [evenement.clientX, evenement.clientY];
        const ecart = distanceAuSegment(souris, outils.scene.versEcran(fleche.bout), outils.scene.versEcran(fleche.pointe));
        // La flèche, ou la pièce elle-même quand l'opération accepte qu'on la tire.
        if (ecart > TOLERANCE_POIGNEE_PX && !(outils.zoneDeTirage?.(evenement) ?? false)) return false;
        tirage = fleche;
        evenement.target.setPointerCapture?.(evenement.pointerId);
        return true;
      } else if (genre === "survol" && tirage !== null) {
        const t = outils.scene.parametreSurAxe(evenement.clientX, evenement.clientY, tirage.base, tirage.direction);
        if (t === null) return;
        const hauteur = Math.max(HAUTEUR_MIN_MM, Math.round((tirage.symetrique ? 2 * t : t) * 2) / 2);
        outils.operations.changer("hauteur", hauteur);
      } else if (genre === "relache") {
        tirage = null;
      }
    },

    apresValidation: () => outils.garderEnVue(id),
    apresAnnulation: () => {
      if (idExistant === null) outils.rouvrirEsquisse();
    },
  };
  return operation;
}

// ── Nouvelle esquisse ───────────────────────────────────────────────────────

/*
 * outils : { scene, choix, nouvelle(parametres), terminer() }
 * Rien ne change dans le projet tant que l'élève n'a pas choisi : le choix
 * termine l'opération et ouvre l'esquisse. Décalage et inclinaison se règlent
 * avant : les plans montrés dans la vue les suivent.
 */
export function operationPlanEsquisse(outils) {
  const reglages = { decalage: 0, inclinaison: 0, pivot: "horizontal" };

  function choisir(parametres) {
    outils.terminer();
    outils.nouvelle(parametres);
  }

  /* Sous la souris : la face plate d'une pièce d'abord (c'est ce que l'élève
     vise quand il clique sur une pièce, même si un plan de référence la
     traverse), sinon un plan de référence. Une face se prend telle quelle,
     inclinée ou non ; le décalage l'écarte vers l'extérieur. */
  function sous(evenement) {
    const plan = outils.scene.planDeReferenceSous(evenement.clientX, evenement.clientY);
    const touche = outils.scene.objetSous(evenement.clientX, evenement.clientY);
    if (touche !== null && touche.normale !== undefined) {
      const selon = planSelonNormale(touche.normale);
      if (selon !== null) {
        const n = PLANS[selon.nom].n;
        const decalage = touche.point[0] * n[0] + touche.point[1] * n[1] + touche.point[2] * n[2];
        return {
          genre: "face", id: touche.id,
          parametres: { plan: selon.nom, decalage: decalage + reglages.decalage * selon.signe, sensExterieur: selon.signe },
        };
      }
      const repere = repereDeFace(touche.normale, touche.point);
      [3, 7, 11].forEach((i, k) => { repere[i] += repere[2 + 4 * k] * reglages.decalage; });
      return { genre: "face", id: touche.id, parametres: { plan: "XY", repere, sensExterieur: 1 } };
    }
    return plan === null ? null : { genre: "plan", plan: plan.nom };
  }

  const surUnPlan = (nom) => ({ plan: nom, ...reglages, sensExterieur: 1 });

  return {
    titre: "Nouvelle esquisse",
    icone: "esquisse",
    libelle: "Esquisse",
    sansValider: true,
    champs: [
      {
        genre: "nombre", cle: "decalage", etiquette: "Décalage", unite: "mm", min: -2000, max: 2000,
        aide: "Écarte le plan de l'origine (ou de la face cliquée, vers l'extérieur). Sert à dessiner les sections d'un lissage à des hauteurs différentes.",
      },
      {
        genre: "nombre", cle: "inclinaison", etiquette: "Inclinaison", unite: "°", min: -180, max: 180, pasFixe: 15,
        aide: "Fait pivoter le plan autour de l'un de ses axes, passant par l'origine : pour dessiner sur un plan penché.",
      },
      {
        genre: "choix", cle: "pivot", etiquette: "Le plan pivote autour de",
        visible: (v) => v.inclinaison !== 0,
        options: [
          { valeur: "horizontal", etiquette: "Son axe horizontal", aide: "XY pivote autour de X, XZ autour de X, YZ autour de Y." },
          { valeur: "vertical", etiquette: "Son axe vertical", aide: "XY pivote autour de Y, XZ autour de Z, YZ autour de Z." },
        ],
      },
      {
        genre: "choix", cle: "plan", etiquette: "Plan de l'esquisse",
        options: [
          { valeur: "XY", etiquette: "Plan XY", detail: "horizontal", aide: "Le plateau, vu de dessus." },
          { valeur: "XZ", etiquette: "Plan XZ", detail: "vertical, de face", aide: "Plan vertical gauche-droite, vu de face." },
          { valeur: "YZ", etiquette: "Plan YZ", detail: "vertical, de côté", aide: "Plan vertical avant-arrière, vu de droite." },
        ],
      },
    ],
    consigne: () => "Choisir un plan, ou cliquer dans la vue une face plane d'une pièce, même penchée.",

    preparer() {
      outils.scene.montrerPlansDeReference(true);
      outils.scene.orienterPlansDeReference(reglages);
      outils.choix.demarrer({
        message: null,
        survol(evenement) {
          const cible = sous(evenement);
          outils.scene.surlignerPlanDeReference(cible?.genre === "plan" ? cible.plan : null);
          outils.scene.marquerSurvol(cible?.genre === "face" ? cible.id : null);
        },
        appui(evenement) {
          const cible = sous(evenement);
          if (cible === null) return false;
          choisir(cible.genre === "plan" ? surUnPlan(cible.plan) : cible.parametres);
          return true;
        },
        arreter() {
          outils.scene.orienterPlansDeReference({});
          outils.scene.montrerPlansDeReference(false);
          outils.scene.marquerSurvol(null);
        },
      });
      return { plan: null, ...reglages };
    },

    changer(cle, valeur, valeurs) {
      if (cle === "plan") {
        choisir(surUnPlan(valeur));
        return null;
      }
      reglages[cle] = valeur;
      outils.scene.orienterPlansDeReference(reglages);
      return { ...valeurs, [cle]: valeur };
    },
  };
}
