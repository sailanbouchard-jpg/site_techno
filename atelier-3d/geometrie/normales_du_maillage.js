/*
 * geometrie/normales_du_maillage.js
 * ─────────────────────────────────
 * Les normales d'un maillage, lissées sur les surfaces courbes et franches
 * sur les arêtes vives : un cylindre brillant a un reflet continu sur son
 * flanc, et un bord net contre son couvercle. Sans elles, chaque facette
 * reflète autre chose et un métal poli ressemble à une boule à facettes.
 *
 * Un sommet partagé par deux faces trop différentes (plus de ANGLE_D_ARETE
 * d'écart) est dédoublé : une copie par côté de l'arête. Les triangles
 * gardent leur ordre, donc les plages de couleurs d'un groupe restent justes.
 *
 * Calculé dans l'ouvrier, avec le maillage : sur un fichier importé de deux
 * cent mille triangles, le faire dans la page gelait l'écran une seconde.
 *
 * Une forme de base est calculée dans un cube unité, puis étirée par son
 * échelle : un anneau de 40 × 40 × 10 est, avant étirement, un tore haut et
 * pincé, dont les angles n'ont rien à voir avec ceux qu'on voit. La vue refait
 * donc le calcul avec les proportions réelles (rapports), sur les sommets
 * ressoudés (souderSommets) pour que les coutures de l'ouvrier disparaissent.
 */

const ANGLE_D_ARETE_DEGRES = 30;
// Deux normales lissées égales à ce près partagent le même sommet.
const QUANTIFICATION = 1000;

/* Les sommets de même position n'en font plus qu'un ; les triangles gardent leur ordre. */
export function souderSommets(positions, indices) {
  const vus = new Map();
  const soudees = [];
  const correspondance = new Uint32Array(positions.length / 3);
  for (let v = 0; v < positions.length / 3; v += 1) {
    const cle = positions[v * 3] + "," + positions[v * 3 + 1] + "," + positions[v * 3 + 2];
    let nouveau = vus.get(cle);
    if (nouveau === undefined) {
      nouveau = soudees.length / 3;
      vus.set(cle, nouveau);
      soudees.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
    }
    correspondance[v] = nouveau;
  }
  return { positions: new Float32Array(soudees), indices: Uint32Array.from(indices, (v) => correspondance[v]) };
}

/* positions : Float32Array (3 par sommet) ; indices : Uint32Array (3 par
   triangle) ; rapports : [sx, sy, sz], l'étirement que l'objet subira à
   l'affichage, ou null. Rend { positions, normales, indices } neufs, les
   positions et les normales restant dans le repère d'avant l'étirement. */
export function normalesAdoucies(positions, indices, rapports = null) {
  const triangles = indices.length / 3;
  const sommets = positions.length / 3;
  const [rx, ry, rz] = rapports ?? [1, 1, 1];

  // Normale de chaque face : unitaire, et pondérée par son aire pour le lissage.
  const unitaires = new Float32Array(triangles * 3);
  const ponderees = new Float32Array(triangles * 3);
  for (let t = 0; t < triangles; t += 1) {
    const [a, b, c] = [indices[t * 3] * 3, indices[t * 3 + 1] * 3, indices[t * 3 + 2] * 3];
    const [ux, uy, uz] = [(positions[b] - positions[a]) * rx, (positions[b + 1] - positions[a + 1]) * ry, (positions[b + 2] - positions[a + 2]) * rz];
    const [vx, vy, vz] = [(positions[c] - positions[a]) * rx, (positions[c + 1] - positions[a + 1]) * ry, (positions[c + 2] - positions[a + 2]) * rz];
    const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const longueur = Math.hypot(nx, ny, nz) || 1;
    ponderees.set([nx, ny, nz], t * 3);
    unitaires.set([nx / longueur, ny / longueur, nz / longueur], t * 3);
  }

  // Les faces autour de chaque sommet, rangées à plat (debuts[v] … debuts[v + 1]).
  const debuts = new Uint32Array(sommets + 1);
  for (const v of indices) debuts[v + 1] += 1;
  for (let v = 0; v < sommets; v += 1) debuts[v + 1] += debuts[v];
  const faces = new Uint32Array(indices.length);
  const remplis = debuts.slice(0, sommets);
  for (let i = 0; i < indices.length; i += 1) faces[remplis[indices[i]]++] = Math.floor(i / 3);

  const seuil = Math.cos((ANGLE_D_ARETE_DEGRES * Math.PI) / 180);
  const nouvellesPositions = [];
  const nouvellesNormales = [];
  const nouveauxIndices = new Uint32Array(indices.length);
  const dejaFaits = new Map();   // « sommet:normale » → nouvel indice

  for (let i = 0; i < indices.length; i += 1) {
    const v = indices[i];
    const t = Math.floor(i / 3);
    // La normale du coin : les faces voisines de même inclinaison, à peu près.
    let [sx, sy, sz] = [0, 0, 0];
    for (let k = debuts[v]; k < debuts[v + 1]; k += 1) {
      const f = faces[k];
      const produit = unitaires[f * 3] * unitaires[t * 3] + unitaires[f * 3 + 1] * unitaires[t * 3 + 1] + unitaires[f * 3 + 2] * unitaires[t * 3 + 2];
      if (produit < seuil) continue;
      sx += ponderees[f * 3];
      sy += ponderees[f * 3 + 1];
      sz += ponderees[f * 3 + 2];
    }
    // Calculée dans l'objet étiré, la normale revient dans le repère d'avant :
    // l'affichage lui appliquera l'inverse de l'étirement.
    [sx, sy, sz] = [sx * rx, sy * ry, sz * rz];
    const longueur = Math.hypot(sx, sy, sz) || 1;
    const [nx, ny, nz] = [sx / longueur, sy / longueur, sz / longueur];
    const cle = v + ":" + Math.round(nx * QUANTIFICATION) + "," + Math.round(ny * QUANTIFICATION) + "," + Math.round(nz * QUANTIFICATION);
    let indice = dejaFaits.get(cle);
    if (indice === undefined) {
      indice = nouvellesPositions.length / 3;
      dejaFaits.set(cle, indice);
      nouvellesPositions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      nouvellesNormales.push(nx, ny, nz);
    }
    nouveauxIndices[i] = indice;
  }

  return {
    positions: new Float32Array(nouvellesPositions),
    normales: new Float32Array(nouvellesNormales),
    indices: nouveauxIndices,
  };
}
