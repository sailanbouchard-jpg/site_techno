/*
 * geometrie/lecture_stl.js
 * ────────────────────────
 * Lit un fichier STL, binaire ou texte, et rend un maillage indexé. Fonction
 * pure, testable sous Node, appelée dans l'ouvrier pour qu'un gros fichier ne
 * fige pas l'interface.
 *
 * Un STL ne partage aucun sommet : chaque triangle a ses trois coins à lui.
 * Manifold, lui, a besoin de savoir quels triangles se touchent. On soude donc
 * les sommets de même position exacte — c'est ce qui permet ensuite de dire si
 * le maillage est étanche.
 */

const OCTETS_ENTETE = 80;
const OCTETS_PAR_TRIANGLE = 50;

// Au-delà, un poste du collège rame à l'affichage : on prévient, on ne refuse pas.
export const TRIANGLES_CONSEILLES = 500000;

function estBinaire(octets) {
  if (octets.byteLength < OCTETS_ENTETE + 4) return false;
  const nombre = new DataView(octets).getUint32(OCTETS_ENTETE, true);
  // Beaucoup de logiciels écrivent « solid » en tête d'un STL binaire : seule la
  // taille exacte fait foi.
  return OCTETS_ENTETE + 4 + nombre * OCTETS_PAR_TRIANGLE === octets.byteLength;
}

function coinsDuBinaire(octets) {
  const vue = new DataView(octets);
  const nombre = vue.getUint32(OCTETS_ENTETE, true);
  const coins = new Float32Array(nombre * 9);
  for (let t = 0; t < nombre; t += 1) {
    const base = OCTETS_ENTETE + 4 + t * OCTETS_PAR_TRIANGLE + 12;   // on saute la normale
    for (let i = 0; i < 9; i += 1) {
      coins[t * 9 + i] = vue.getFloat32(base + i * 4, true);
    }
  }
  return coins;
}

function coinsDuTexte(octets) {
  const texte = new TextDecoder("latin1").decode(octets);
  if (!/^\s*solid/i.test(texte) || !/facet/i.test(texte)) {
    throw new Error("ce fichier n'est pas un STL lisible.");
  }
  const valeurs = [];
  const motif = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  for (const [, x, y, z] of texte.matchAll(motif)) {
    valeurs.push(Number(x), Number(y), Number(z));
  }
  if (valeurs.length % 9 !== 0 || valeurs.some((v) => !Number.isFinite(v))) {
    throw new Error("ce fichier STL texte est abîmé : un triangle n'a pas trois sommets lisibles.");
  }
  return new Float32Array(valeurs);
}

/* Table de hachage à adressage ouvert sur tableaux typés : une Map à clés
   texte est dix fois plus lente sur un boîtier d'un million de sommets. */
function souder(coins) {
  const nombreDeCoins = coins.length / 3;
  let capacite = 1;
  while (capacite < nombreDeCoins * 2) capacite <<= 1;

  const table = new Int32Array(capacite).fill(-1);
  const bits = new Uint32Array(coins.buffer, coins.byteOffset, coins.length);
  const positions = new Float32Array(coins.length);
  const indices = new Uint32Array(nombreDeCoins);
  let nombreDeSommets = 0;

  for (let c = 0; c < nombreDeCoins; c += 1) {
    const [a, b, d] = [bits[c * 3], bits[c * 3 + 1], bits[c * 3 + 2]];
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f) ^ Math.imul(d, 0x165667b1);
    h = (h ^ (h >>> 15)) & (capacite - 1);

    for (;;) {
      const existant = table[h];
      if (existant === -1) {
        table[h] = nombreDeSommets;
        positions[nombreDeSommets * 3] = coins[c * 3];
        positions[nombreDeSommets * 3 + 1] = coins[c * 3 + 1];
        positions[nombreDeSommets * 3 + 2] = coins[c * 3 + 2];
        indices[c] = nombreDeSommets;
        nombreDeSommets += 1;
        break;
      }
      if (positions[existant * 3] === coins[c * 3]
        && positions[existant * 3 + 1] === coins[c * 3 + 1]
        && positions[existant * 3 + 2] === coins[c * 3 + 2]) {
        indices[c] = existant;
        break;
      }
      h = (h + 1) & (capacite - 1);
    }
  }

  return { positions: positions.slice(0, nombreDeSommets * 3), indices };
}

/* Un triangle dont deux coins sont soudés n'a pas de surface : Manifold le
   refuserait, et il n'apporte rien à l'impression. */
function sansTrianglesPlats(indices) {
  const gardes = new Uint32Array(indices.length);
  let n = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    if (a === b || b === c || a === c) continue;
    gardes[n] = a;
    gardes[n + 1] = b;
    gardes[n + 2] = c;
    n += 3;
  }
  return gardes.slice(0, n);
}

function boiteDe(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 1) {
    const axe = i % 3;
    if (positions[i] < min[axe]) min[axe] = positions[i];
    if (positions[i] > max[axe]) max[axe] = positions[i];
  }
  return { min, max };
}

export function lireStl(octets) {
  const coins = estBinaire(octets) ? coinsDuBinaire(octets) : coinsDuTexte(octets);
  if (coins.length === 0) {
    throw new Error("ce fichier STL ne contient aucun triangle.");
  }
  if (coins.some((valeur) => !Number.isFinite(valeur))) {
    throw new Error("ce fichier STL contient des coordonnées invalides.");
  }

  const { positions, indices } = souder(coins);
  const propres = sansTrianglesPlats(indices);
  if (propres.length === 0) {
    throw new Error("ce fichier STL ne contient que des triangles plats.");
  }

  return { positions, indices: propres, triangles: propres.length / 3, boite: boiteDe(positions) };
}
