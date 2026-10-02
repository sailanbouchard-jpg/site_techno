/*
 * geometrie/lecture_draco.js
 * ──────────────────────────
 * Lit un maillage compressé Draco (.drc) et rend la même chose que lireStl :
 * un maillage indexé { positions, indices, triangles, boite }.
 *
 * Pourquoi Draco. Les éprouvettes de calibration sont des pièces lourdes —
 * la tour de température fait 212 000 triangles — et elles sont fixes : elles
 * ne sont pas dessinées par l'élève, elles accompagnent le logiciel. En STL
 * elles pèseraient 18 Mo, en Draco 1,3 Mo. C'est le format qu'emploie
 * OrcaSlicer pour les mêmes modèles, et le décodeur tient en 340 ko.
 *
 * Le décodeur est chargé à la première éprouvette et gardé ensuite : tant
 * qu'on ne fait pas de calibration, il n'est jamais téléchargé.
 */

import chargerDraco from "../vendor/draco-1.5.7/draco_wasm_wrapper.js";

const CHEMIN_WASM = "../vendor/draco-1.5.7/draco_decoder.wasm";

let decodeur = null;   // la promesse du module, partagée par tous les appels

/* Le module Draco, chargé une seule fois. */
function moduleDraco() {
  if (decodeur === null) {
    decodeur = fetch(new URL(CHEMIN_WASM, import.meta.url))
      .then((reponse) => reponse.arrayBuffer())
      .then((wasm) => new Promise((pret) => {
        chargerDraco({ wasmBinary: wasm, onModuleLoaded: pret });
      }));
  }
  return decodeur;
}

/* L'encombrement du maillage, comme le fait le lecteur de STL. */
function boiteDe(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a += 1) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/*
 * octets : le contenu du .drc (ArrayBuffer).
 * Rend { positions, indices, triangles, boite }.
 */
export async function lireDraco(octets) {
  const draco = await moduleDraco();
  const tampon = new draco.DecoderBuffer();
  const lecteur = new draco.Decoder();
  const maillage = new draco.Mesh();
  // Draco laisse fuir sa mémoire si on ne la rend pas : d'où le try/finally.
  try {
    tampon.Init(new Int8Array(octets), octets.byteLength);
    if (lecteur.GetEncodedGeometryType(tampon) !== draco.TRIANGULAR_MESH) {
      throw new Error("Ce fichier Draco n'est pas un maillage de triangles.");
    }
    const etat = lecteur.DecodeBufferToMesh(tampon, maillage);
    if (!etat.ok() || maillage.ptr === 0) throw new Error("Maillage Draco illisible : " + etat.error_msg());

    const attribut = lecteur.GetAttribute(maillage, lecteur.GetAttributeId(maillage, draco.POSITION));
    const lues = new draco.DracoFloat32Array();
    lecteur.GetAttributeFloatForAllPoints(maillage, attribut, lues);
    const nombreDeSommets = maillage.num_points();
    const positions = new Float32Array(nombreDeSommets * 3);
    for (let i = 0; i < positions.length; i += 1) positions[i] = lues.GetValue(i);
    draco.destroy(lues);

    const nombreDeFaces = maillage.num_faces();
    const indices = new Uint32Array(nombreDeFaces * 3);
    const coins = new draco.DracoInt32Array();
    for (let f = 0; f < nombreDeFaces; f += 1) {
      lecteur.GetFaceFromMesh(maillage, f, coins);
      indices[f * 3] = coins.GetValue(0);
      indices[f * 3 + 1] = coins.GetValue(1);
      indices[f * 3 + 2] = coins.GetValue(2);
    }
    draco.destroy(coins);

    return { positions, indices, triangles: nombreDeFaces, boite: boiteDe(positions) };
  } finally {
    draco.destroy(maillage);
    draco.destroy(lecteur);
    draco.destroy(tampon);
  }
}
