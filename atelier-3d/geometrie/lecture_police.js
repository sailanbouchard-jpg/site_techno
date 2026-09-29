/*
 * geometrie/lecture_police.js
 * ───────────────────────────
 * Lit une police TrueType (.ttf) et rend le contour de ses lettres. Écrit à la
 * main plutôt qu'importé : il ne faut ici que la table des caractères, les
 * contours et les largeurs — quelques tables d'un format stable depuis 1991.
 *
 * Les lettres accentuées (é, è, ç, à, œ…) sont souvent des glyphes
 * « composés » : une lettre de base plus un accent posé dessus. On les lit
 * aussi — une police qui perd les accents est un piège découvert à l'impression.
 */

const MORCEAUX_PAR_COURBE = 6;

function tables(vue) {
  const nombre = vue.getUint16(4);
  const trouvees = {};
  for (let i = 0; i < nombre; i += 1) {
    const entree = 12 + i * 16;
    const nom = String.fromCharCode(vue.getUint8(entree), vue.getUint8(entree + 1), vue.getUint8(entree + 2), vue.getUint8(entree + 3));
    trouvees[nom] = vue.getUint32(entree + 8);
  }
  for (const requise of ["head", "cmap", "loca", "glyf", "hhea", "hmtx", "maxp"]) {
    if (trouvees[requise] === undefined) throw new Error("ce fichier n'est pas une police TrueType lisible (table " + requise + " absente).");
  }
  return trouvees;
}

/* Caractère → numéro de glyphe, par la sous-table de format 4 ou 12 (Unicode). */
function tableDesCaracteres(vue, debut) {
  const nombre = vue.getUint16(debut + 2);
  let format4 = null;
  let format12 = null;
  for (let i = 0; i < nombre; i += 1) {
    const plateforme = vue.getUint16(debut + 4 + i * 8);
    const decalage = debut + vue.getUint32(debut + 4 + i * 8 + 4);
    const format = vue.getUint16(decalage);
    if (plateforme !== 0 && plateforme !== 3) continue;
    if (format === 12) format12 = decalage;
    if (format === 4) format4 = decalage;
  }
  if (format12 !== null) {
    const groupes = vue.getUint32(format12 + 12);
    return (code) => {
      for (let g = 0; g < groupes; g += 1) {
        const base = format12 + 16 + g * 12;
        const [premier, dernier] = [vue.getUint32(base), vue.getUint32(base + 4)];
        if (code >= premier && code <= dernier) return vue.getUint32(base + 8) + code - premier;
      }
      return 0;
    };
  }
  if (format4 === null) throw new Error("la police n'a pas de table de caractères Unicode.");
  const segments = vue.getUint16(format4 + 6) / 2;
  const fins = format4 + 14;
  const debuts = fins + segments * 2 + 2;
  const deltas = debuts + segments * 2;
  const decalages = deltas + segments * 2;
  return (code) => {
    for (let s = 0; s < segments; s += 1) {
      if (code > vue.getUint16(fins + s * 2)) continue;
      const premier = vue.getUint16(debuts + s * 2);
      if (code < premier) return 0;
      const delta = vue.getInt16(deltas + s * 2);
      const decalage = vue.getUint16(decalages + s * 2);
      if (decalage === 0) return (code + delta) & 0xffff;
      const glyphe = vue.getUint16(decalages + s * 2 + decalage + (code - premier) * 2);
      return glyphe === 0 ? 0 : (glyphe + delta) & 0xffff;
    }
    return 0;
  };
}

/* Les contours d'un glyphe : des listes de points { x, y, sur } (sur la courbe ou non). */
function lireGlyphe(vue, t, indice, emplacement, profondeur = 0) {
  const [debut, fin] = [emplacement(indice), emplacement(indice + 1)];
  if (fin <= debut || profondeur > 8) return [];
  const g = t.glyf + debut;
  const nombreDeContours = vue.getInt16(g);

  if (nombreDeContours < 0) {
    // Glyphe composé : chaque morceau est un autre glyphe, décalé et parfois mis à l'échelle.
    const contours = [];
    let p = g + 10;
    let drapeaux;
    do {
      drapeaux = vue.getUint16(p);
      const piece = vue.getUint16(p + 2);
      p += 4;
      let [dx, dy] = [0, 0];
      if (drapeaux & 0x0001) {
        [dx, dy] = [vue.getInt16(p), vue.getInt16(p + 2)];
        p += 4;
      } else {
        [dx, dy] = [vue.getInt8(p), vue.getInt8(p + 1)];
        p += 2;
      }
      let [a, b, c, d] = [1, 0, 0, 1];
      const f2dot14 = (o) => vue.getInt16(o) / 16384;
      if (drapeaux & 0x0008) {
        a = d = f2dot14(p);
        p += 2;
      } else if (drapeaux & 0x0040) {
        [a, d] = [f2dot14(p), f2dot14(p + 2)];
        p += 4;
      } else if (drapeaux & 0x0080) {
        [a, b, c, d] = [f2dot14(p), f2dot14(p + 2), f2dot14(p + 4), f2dot14(p + 6)];
        p += 8;
      }
      // Sans ARGS_ARE_XY_VALUES, le décalage est un appariement de points : rare, on l'ignore.
      if (!(drapeaux & 0x0002)) [dx, dy] = [0, 0];
      for (const contour of lireGlyphe(vue, t, piece, emplacement, profondeur + 1)) {
        contours.push(contour.map(({ x, y, sur }) => ({ x: a * x + c * y + dx, y: b * x + d * y + dy, sur })));
      }
    } while (drapeaux & 0x0020);
    return contours;
  }

  const fins = [];
  for (let i = 0; i < nombreDeContours; i += 1) fins.push(vue.getUint16(g + 10 + i * 2));
  const nombreDePoints = nombreDeContours === 0 ? 0 : fins.at(-1) + 1;
  let p = g + 10 + nombreDeContours * 2;
  p += 2 + vue.getUint16(p);   // les instructions de rendu ne servent pas ici

  const drapeaux = [];
  while (drapeaux.length < nombreDePoints) {
    const drapeau = vue.getUint8(p++);
    drapeaux.push(drapeau);
    if (drapeau & 0x08) {
      for (let r = vue.getUint8(p++); r > 0; r -= 1) drapeaux.push(drapeau);
    }
  }
  const lireCoordonnees = (court, meme) => {
    const valeurs = [];
    let courant = 0;
    for (const drapeau of drapeaux) {
      if (drapeau & court) {
        const v = vue.getUint8(p++);
        courant += drapeau & meme ? v : -v;
      } else if (!(drapeau & meme)) {
        courant += vue.getInt16(p);
        p += 2;
      }
      valeurs.push(courant);
    }
    return valeurs;
  };
  const xs = lireCoordonnees(0x02, 0x10);
  const ys = lireCoordonnees(0x04, 0x20);

  const contours = [];
  let premier = 0;
  for (const dernier of fins) {
    const contour = [];
    for (let i = premier; i <= dernier; i += 1) contour.push({ x: xs[i], y: ys[i], sur: (drapeaux[i] & 0x01) === 1 });
    contours.push(contour);
    premier = dernier + 1;
  }
  return contours;
}

/* Les courbes quadratiques d'un contour, découpées en petits segments. */
function enPolygone(contour) {
  if (contour.length < 2) return [];
  // Entre deux points hors courbe, il y a un point sur la courbe implicite, au milieu.
  const complets = [];
  contour.forEach((point, i) => {
    const suivant = contour[(i + 1) % contour.length];
    complets.push(point);
    if (!point.sur && !suivant.sur) complets.push({ x: (point.x + suivant.x) / 2, y: (point.y + suivant.y) / 2, sur: true });
  });
  const depart = complets.findIndex((point) => point.sur);
  if (depart < 0) return [];
  const ordonnes = [...complets.slice(depart), ...complets.slice(0, depart)];
  const polygone = [];
  for (let i = 0; i < ordonnes.length; i += 1) {
    const a = ordonnes[i];
    if (!a.sur) continue;
    polygone.push([a.x, a.y]);
    const controle = ordonnes[(i + 1) % ordonnes.length];
    if (controle.sur) continue;
    const b = ordonnes[(i + 2) % ordonnes.length];
    for (let k = 1; k < MORCEAUX_PAR_COURBE; k += 1) {
      const t = k / MORCEAUX_PAR_COURBE;
      const u = 1 - t;
      polygone.push([u * u * a.x + 2 * u * t * controle.x + t * t * b.x, u * u * a.y + 2 * u * t * controle.y + t * t * b.y]);
    }
  }
  return polygone;
}

/*
 * Rend { unitesParEm, hauteurDeCapitale, contoursDe(caractere) → { contours, avance } | null }.
 * Les contours sont en unités de la police, y vers le haut.
 */
export function lirePolice(octets) {
  const vue = new DataView(octets);
  const t = tables(vue);
  const unitesParEm = vue.getUint16(t.head + 18);
  const locaLongue = vue.getInt16(t.head + 50) === 1;
  const emplacement = (i) => (locaLongue ? vue.getUint32(t.loca + i * 4) : vue.getUint16(t.loca + i * 2) * 2);
  const caractere = tableDesCaracteres(vue, t.cmap);
  const metriques = vue.getUint16(t.hhea + 34);
  const avance = (g) => vue.getUint16(t.hmtx + Math.min(g, metriques - 1) * 4);

  let hauteurDeCapitale = unitesParEm * 0.7;
  if (t["OS/2"] !== undefined && vue.getUint16(t["OS/2"]) >= 2) {
    hauteurDeCapitale = vue.getInt16(t["OS/2"] + 88) || hauteurDeCapitale;
  }

  const memoire = new Map();
  return {
    unitesParEm,
    hauteurDeCapitale,
    contoursDe(lettre) {
      if (memoire.has(lettre)) return memoire.get(lettre);
      const glyphe = caractere(lettre.codePointAt(0));
      const resultat = glyphe === 0 && lettre !== " "
        ? null
        : { contours: lireGlyphe(vue, t, glyphe, emplacement).map(enPolygone).filter((c) => c.length >= 3), avance: avance(glyphe) };
      memoire.set(lettre, resultat);
      return resultat;
    },
  };
}
