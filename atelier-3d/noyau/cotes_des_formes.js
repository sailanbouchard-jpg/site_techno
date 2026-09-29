/*
 * noyau/cotes_des_formes.js
 * ─────────────────────────
 * Les cotes qu'on règle d'abord sur une forme de base : rayon, hauteur,
 * ovalité… plutôt que trois dimensions X, Y, Z. Une forme normalisée porte
 * ses dimensions dans son échelle (voir type_noeud_pave.js) : chaque cote
 * n'est qu'une autre façon de lire et d'écrire cette échelle — et, pour le
 * tore, son paramètre « ouverture ».
 *
 * Une cote : { cle, etiquette, titre?, unite, min, pasFixe?, decimales,
 *              lire(e, p) → nombre, ecrire(e, p, valeur) → { echelle?, parametres? } }
 * e est l'échelle en valeurs absolues ; ecrire ne rend que ce qui change.
 *
 * L'ovalité est un facteur sur le rayon : 1 donne un rond (côté = 2 × rayon),
 * 2 un ovale deux fois plus long dans ce sens.
 */

const MIN_MM = 0.05;
const MIN_OVALITE = 0.01;

export function coteDAxe(cle, etiquette, axe, titre) {
  return {
    cle, etiquette, titre, unite: "mm", min: MIN_MM, decimales: 1,
    lire: (e) => e[axe],
    ecrire: (_e, _p, v) => ({ echelle: { [axe]: v } }),
  };
}

/* Le rayon de la base : les ovalités restent, les axes qui en dépendent suivent. */
export function coteRayon(axesQuiSuivent) {
  return {
    cle: "rayon", etiquette: "Rayon", unite: "mm", min: MIN_MM, decimales: 2,
    lire: (e) => e.x / 2,
    ecrire(e, _p, v) {
      const echelle = { x: 2 * v };
      for (const axe of axesQuiSuivent) echelle[axe] = 2 * v * (e[axe] / e.x);
      return { echelle };
    },
  };
}

export function coteOvalite(cle, etiquette, axe, titre) {
  return {
    cle, etiquette, titre, unite: "", min: MIN_OVALITE, decimales: 2,
    lire: (e) => e[axe] / e.x,
    ecrire: (e, _p, v) => ({ echelle: { [axe]: e.x * v } }),
  };
}

// ── Tore ────────────────────────────────────────────────────────────────────
// Diamètre extérieur x = 2 (R + r) ; ouverture = (R − r) / (R + r) en %.
// La hauteur z vaut 2 r × ovalité verticale.

export const OUVERTURE_MIN = 1;
export const OUVERTURE_MAX = 98;

const rayonsDuTore = (e, p) => {
  const k = p.ouverture / 100;
  return { R: (e.x * (1 + k)) / 4, r: (e.x * (1 - k)) / 4 };
};

function toreAvec(e, p, R, r) {
  if (!(R > r)) throw new Error("Le rayon de l'anneau doit rester plus grand que celui du tube.");
  const ouverture = (100 * (R - r)) / (R + r);
  if (ouverture < OUVERTURE_MIN) throw new Error("Le tube est trop gros pour cet anneau : le trou central disparaîtrait.");
  if (ouverture > OUVERTURE_MAX) throw new Error("Le tube est trop fin pour cet anneau.");
  const x = 2 * (R + r);
  const ancien = rayonsDuTore(e, p);
  return {
    echelle: { x, y: x * (e.y / e.x), z: 2 * r * (e.z / (2 * ancien.r)) },
    parametres: { ouverture },
  };
}

export const COTES_DU_TORE = [
  {
    cle: "grandRayon", etiquette: "Rayon", titre: "Rayon de l'anneau, jusqu'au milieu du tube",
    unite: "mm", min: MIN_MM, decimales: 2,
    lire: (e, p) => rayonsDuTore(e, p).R,
    ecrire: (e, p, v) => toreAvec(e, p, v, rayonsDuTore(e, p).r),
  },
  {
    cle: "petitRayon", etiquette: "Rayon tube", titre: "Rayon du tube qui forme l'anneau",
    unite: "mm", min: MIN_MM, decimales: 2,
    lire: (e, p) => rayonsDuTore(e, p).r,
    ecrire: (e, p, v) => toreAvec(e, p, rayonsDuTore(e, p).R, v),
  },
  coteOvalite("ovaliteH", "Ovalité horiz.", "y", "Ovalité de l'anneau vu de dessus (1 : rond)"),
  {
    cle: "ovaliteV", etiquette: "Ovalité vert.", titre: "Ovalité du tube en hauteur (1 : tube rond)",
    unite: "", min: MIN_OVALITE, decimales: 2,
    lire: (e, p) => e.z / (2 * rayonsDuTore(e, p).r),
    ecrire: (e, p, v) => ({ echelle: { z: 2 * rayonsDuTore(e, p).r * v } }),
  },
];

// ── Lecture et écriture depuis un nœud ──────────────────────────────────────

const absolue = (echelle) => ({ x: Math.abs(echelle.x), y: Math.abs(echelle.y), z: Math.abs(echelle.z) });

export function valeursDesCotes(type, noeud) {
  const e = absolue(noeud.transformation.echelle);
  const p = { ...parametresParDefaut(type), ...noeud.parametres };
  return Object.fromEntries(type.cotes.map((cote) => [cote.cle, cote.lire(e, p)]));
}

/* La transformation et les paramètres qu'aurait le nœud avec cette cote. Une
   forme retournée par symétrie (échelle négative) le reste. */
export function changementDeCote(type, noeud, cle, valeur) {
  const cote = type.cotes.find((c) => c.cle === cle);
  if (cote === undefined) throw new Error("Cote inconnue : « " + cle + " ».");
  const echelleActuelle = noeud.transformation.echelle;
  const p = { ...parametresParDefaut(type), ...noeud.parametres };
  const { echelle = {}, parametres = {} } = cote.ecrire(absolue(echelleActuelle), p, valeur);
  const signee = { ...echelleActuelle };
  for (const [axe, v] of Object.entries(echelle)) signee[axe] = Math.sign(echelleActuelle[axe] || 1) * v;
  return { transformation: { ...noeud.transformation, echelle: signee }, parametres };
}

function parametresParDefaut(type) {
  return Object.fromEntries(Object.entries(type.parametres).map(([cle, description]) => [cle, description.defaut]));
}
