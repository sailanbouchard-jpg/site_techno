/*
 * geometrie/export_stl.js
 * ───────────────────────
 * Écrit un STL binaire à partir d'un ou plusieurs maillages. Fonction pure :
 * elle rend un ArrayBuffer, ne touche ni au DOM ni au disque — c'est
 * l'application qui en fait un téléchargement. Testable sous Node.
 *
 * Unités et orientation : les coordonnées partent telles quelles, en
 * millimètres, Z vertical et Z = 0 au sol. Le STL n'a pas de champ d'unité ;
 * tous les trancheurs supposent le millimètre, donc écrire autre chose serait
 * une erreur invisible jusqu'à l'impression.
 *
 * On écrit du binaire et pas de l'ASCII : cinq fois plus petit, et pas de
 * question d'arrondi décimal.
 */

import { matriceDeTransformation } from "../noyau/transformations.js";

// Réexportée pour les appelants qui fabriquent eux-mêmes leurs morceaux.
export { matriceDeTransformation };

const OCTETS_ENTETE = 80;
const OCTETS_PAR_TRIANGLE = 50;   // 12 flottants + 2 octets d'attribut

/* Normale par produit vectoriel, dans le sens de l'enroulement des sommets.
   La plupart des trancheurs la recalculent, mais un fichier qui ment sur ses
   normales se fait refuser par les plus stricts. */
function normale(ax, ay, az, bx, by, bz, cx, cy, cz) {
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const longueur = Math.hypot(nx, ny, nz);
  return longueur === 0 ? [0, 0, 0] : [nx / longueur, ny / longueur, nz / longueur];
}

/* Un objet du document prêt à partir dans le fichier : son maillage, construit
   à l'origine, et la matrice qui le remet là où l'élève l'a posé. */
export function morceauAExporter(maillage, transformation) {
  return {
    positions: maillage.positions,
    indices: maillage.indices,
    transformation: matriceDeTransformation(transformation),
  };
}

/*
 * maillages : liste de { positions, indices, transformation? }
 * La transformation est facultative : l'export d'objets non groupés doit les
 * placer chacun à sa position, alors que leurs maillages sont tous construits
 * à l'origine. Elle est fournie sous forme de matrice 4×4 en ligne majeure,
 * ou omise si le maillage est déjà dans le repère du document.
 */
export function stlBinaire(maillages, nomObjet = "atelier-3d") {
  let nombreDeTriangles = 0;
  for (const maillage of maillages) nombreDeTriangles += maillage.indices.length / 3;

  const tampon = new ArrayBuffer(OCTETS_ENTETE + 4 + nombreDeTriangles * OCTETS_PAR_TRIANGLE);
  const vue = new DataView(tampon);

  // En-tête : 80 octets libres. On y met le nom du projet, tronqué, en ASCII —
  // un en-tête qui commence par « solid » ferait passer le fichier pour de
  // l'ASCII auprès de certains lecteurs.
  const entete = ("Atelier 3D - " + nomObjet).slice(0, OCTETS_ENTETE - 1);
  for (let i = 0; i < entete.length; i += 1) {
    const code = entete.charCodeAt(i);
    vue.setUint8(i, code < 128 ? code : 63);   // « ? » pour tout ce qui n'est pas ASCII
  }

  vue.setUint32(OCTETS_ENTETE, nombreDeTriangles, true);

  let decalage = OCTETS_ENTETE + 4;
  const ecrireFlottant = (valeur) => {
    vue.setFloat32(decalage, valeur, true);
    decalage += 4;
  };

  for (const maillage of maillages) {
    const { positions, indices } = maillage;
    const placer = maillage.transformation ?? null;

    const sommet = (index) => {
      const x = positions[index * 3];
      const y = positions[index * 3 + 1];
      const z = positions[index * 3 + 2];
      if (placer === null) return [x, y, z];
      return [
        placer[0] * x + placer[1] * y + placer[2] * z + placer[3],
        placer[4] * x + placer[5] * y + placer[6] * z + placer[7],
        placer[8] * x + placer[9] * y + placer[10] * z + placer[11],
      ];
    };

    // Un objet posé en miroir (échelle négative) retourne ses faces : on
    // inverse l'ordre des sommets pour que l'extérieur reste dehors.
    const m = placer ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const retourne = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8])
      + m[2] * (m[4] * m[9] - m[5] * m[8]) < 0;
    const [deuxieme, troisieme] = retourne ? [2, 1] : [1, 2];

    for (let t = 0; t < indices.length; t += 3) {
      const [ax, ay, az] = sommet(indices[t]);
      const [bx, by, bz] = sommet(indices[t + deuxieme]);
      const [cx, cy, cz] = sommet(indices[t + troisieme]);

      const [nx, ny, nz] = normale(ax, ay, az, bx, by, bz, cx, cy, cz);
      ecrireFlottant(nx); ecrireFlottant(ny); ecrireFlottant(nz);
      ecrireFlottant(ax); ecrireFlottant(ay); ecrireFlottant(az);
      ecrireFlottant(bx); ecrireFlottant(by); ecrireFlottant(bz);
      ecrireFlottant(cx); ecrireFlottant(cy); ecrireFlottant(cz);

      vue.setUint16(decalage, 0, true);
      decalage += 2;
    }
  }

  return tampon;
}

/* Relit un STL binaire : sert aux tests, et à vérifier après coup qu'un export
   contient bien ce qu'on croit y avoir mis. */
export function lireStlBinaire(tampon) {
  const vue = new DataView(tampon);
  const nombreDeTriangles = vue.getUint32(OCTETS_ENTETE, true);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let t = 0; t < nombreDeTriangles; t += 1) {
    const base = OCTETS_ENTETE + 4 + t * OCTETS_PAR_TRIANGLE + 12;   // on saute la normale
    for (let s = 0; s < 3; s += 1) {
      for (let axe = 0; axe < 3; axe += 1) {
        const valeur = vue.getFloat32(base + s * 12 + axe * 4, true);
        if (valeur < min[axe]) min[axe] = valeur;
        if (valeur > max[axe]) max[axe] = valeur;
      }
    }
  }

  const entete = [];
  for (let i = 0; i < OCTETS_ENTETE; i += 1) {
    const code = vue.getUint8(i);
    if (code === 0) break;
    entete.push(String.fromCharCode(code));
  }

  return { nombreDeTriangles, min, max, entete: entete.join("") };
}
