/*
 * noyau/esquisse/plans_esquisse.js
 * ────────────────────────────────
 * Les trois plans de base. Une esquisse se dessine en coordonnées (u, v) dans
 * son plan ; w mesure la distance hors du plan, le long de sa normale.
 *
 * La normale regarde vers la caméra de la vue qui montre le plan de face :
 * « Dessus » pour le sol, « Face » pour XZ, « Droite » pour YZ. Extruder
 * « vers moi » monte donc vers l'élève qui dessine, quel que soit le plan.
 */

export const PLANS = Object.freeze({
  XY: Object.freeze({ nom: "XY", etiquette: "Sol", u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }),
  XZ: Object.freeze({ nom: "XZ", etiquette: "Face", u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] }),
  YZ: Object.freeze({ nom: "YZ", etiquette: "Côté", u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }),
});

export function planNomme(nom) {
  return PLANS[nom] ?? PLANS.XY;
}

export function libelleDuPlan(nom) {
  return "plan " + planNomme(nom).nom;
}

/* Le nom, dans le monde, des deux axes de l'esquisse : pour XZ, l'axe
   horizontal est X et l'axe vertical Z. Un axe incliné n'est plus celui du
   monde : on l'appelle « l'axe u » ou « l'axe v » de l'esquisse.
   Reçoit le nom du plan, ou les paramètres de l'esquisse. */
export function nomsDesAxes(planOuParametres) {
  const parametres = typeof planOuParametres === "string" ? { plan: planOuParametres } : (planOuParametres ?? {});
  const plan = planNomme(parametres.plan).nom;
  if (Array.isArray(parametres.repere)) return { horizontal: "u", vertical: "v" };
  const incline = (parametres.inclinaison ?? 0) !== 0;
  return {
    horizontal: incline && parametres.pivot === "vertical" ? "u" : plan[0],
    vertical: incline && parametres.pivot !== "vertical" ? "v" : plan[1],
  };
}

/* La matrice (12 nombres, ligne majeure) qui envoie (u, v, w) dans le monde :
   ses colonnes sont u, v et la normale. decalage : le plan glisse le long de
   sa normale — c'est ainsi qu'une esquisse se pose sur la face d'une pièce. */
export function matriceDuPlan(nom, decalage = 0) {
  const { u, v, n } = planNomme(nom);
  return [
    u[0], v[0], n[0], n[0] * decalage,
    u[1], v[1], n[1], n[1] * decalage,
    u[2], v[2], n[2], n[2] * decalage,
  ];
}

/*
 * Le plan d'une esquisse, d'après ses paramètres :
 *   plan         un plan de base (XY, XZ, YZ) ;
 *   inclinaison  en degrés : le plan pivote autour de l'un de ses axes,
 *                passant par l'origine (pivot "horizontal" : son axe u,
 *                "vertical" : son axe v) ;
 *   decalage     puis il glisse le long de sa normale ;
 *   repere       ou bien, pour une esquisse posée sur une face qui n'est
 *                parallèle à aucun plan de base, la matrice elle-même.
 */
export function matriceDeLEsquisse(parametres) {
  if (Array.isArray(parametres.repere) && parametres.repere.length === 12) return parametres.repere;
  const { u, v, n } = planNomme(parametres.plan);
  const angle = ((parametres.inclinaison ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const melange = (a, b, ka, kb) => [0, 1, 2].map((i) => a[i] * ka + b[i] * kb);
  let [pu, pv, pn] = [u, v, n];
  if (angle !== 0 && parametres.pivot === "vertical") {
    pu = melange(u, n, c, -s);
    pn = melange(u, n, s, c);
  } else if (angle !== 0) {
    pv = melange(v, n, c, s);
    pn = melange(v, n, -s, c);
  }
  const d = parametres.decalage ?? 0;
  return [
    pu[0], pv[0], pn[0], pn[0] * d,
    pu[1], pv[1], pn[1], pn[1] * d,
    pu[2], pv[2], pn[2], pn[2] * d,
  ];
}

/* Le repère d'une face plane quelconque : sa normale n (vers l'extérieur de
   la pièce), un axe u horizontal quand c'est possible, v qui complète, et
   l'origine du monde projetée sur la face. */
export function repereDeFace([nx, ny, nz], point) {
  const n = normaliser([nx, ny, nz]);
  let u = normaliser([-n[1], n[0], 0]);                 // Z × n : horizontal
  if (Math.hypot(...u) < 0.5) u = [1, 0, 0];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const d = n[0] * point[0] + n[1] * point[1] + n[2] * point[2];
  return [
    u[0], v[0], n[0], n[0] * d,
    u[1], v[1], n[1], n[1] * d,
    u[2], v[2], n[2], n[2] * d,
  ];
}

function normaliser(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-12 ? [0, 0, 0] : a.map((x) => x / l);
}

/* Le plan de base dont la normale suit cette direction du monde, et le signe
   qui les relie, ou null si la direction n'est pas celle d'un axe. */
export function planSelonNormale([nx, ny, nz]) {
  for (const plan of Object.values(PLANS)) {
    const produit = plan.n[0] * nx + plan.n[1] * ny + plan.n[2] * nz;
    if (Math.abs(produit) > 0.999) return { nom: plan.nom, signe: Math.sign(produit) };
  }
  return null;
}

export function translation([x, y, z]) {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
}

/* Pour Manifold : 16 nombres, en colonne majeure. */
export function enColonnes(m) {
  return [
    m[0], m[4], m[8], 0,
    m[1], m[5], m[9], 0,
    m[2], m[6], m[10], 0,
    m[3], m[7], m[11], 1,
  ];
}

/* Les solides tirés d'une esquisse se tiennent, comme toute pièce, par le
   centre de leur dessous : ce point est noté à la création, et la géométrie
   est construite autour de lui. Le mode « Poser » les saisit ainsi par le pied. */
export const PARAMETRE_ORIGINE = Object.freeze({
  etiquette: "Origine",
  defaut: Object.freeze({ x: 0, y: 0, z: 0 }),
  cache: true,
});

// L'identifiant de l'esquisse dont le solide est tiré : elle vit à part, à la
// racine, et plusieurs solides peuvent la partager.
export const PARAMETRE_ESQUISSE = Object.freeze({ etiquette: "Esquisse", defaut: null, cache: true });
