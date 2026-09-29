/*
 * vue/apercu_tranchage.js
 * ───────────────────────
 * Le résultat du tranchage, dessiné comme la matière qui sera déposée : chaque
 * ligne est un cordon de sa vraie largeur et de sa vraie hauteur, au profil
 * arrondi (hexagone aux normales lissées), comme dans les trancheurs courants.
 *
 * Raccords : deux segments d'une même ligne se rejoignent en onglet (les bords
 * se prolongent jusqu'à se couper), sans trou ni dent de scie sur les courbes.
 * Un coin plus vif que 45° garde une arête nette : les deux segments ont
 * chacun leurs normales. Un onglet trop long (coin très aigu) est plafonné.
 * Les bouts d'une ligne ouverte (remplissage) sont prolongés d'une
 * demi-largeur et fermés, comme le cordon qui s'arrête sous la buse.
 *
 * Un seul maillage par type de ligne, ses segments rangés couche par couche,
 * et dans chaque couche dans l'ordre d'impression : montrer les couches de a
 * à b, ou la couche du haut jusqu'à un point de son parcours, c'est régler la
 * plage de dessin, sans rien reconstruire.
 *
 * Coloration : par type de ligne (une couleur par maillage), ou selon une
 * valeur (vitesse, largeur, débit, hauteur de couche) posée sur chaque sommet
 * et traduite en dégradé.
 */

import * as THREE from "../vendor/three-0.186.0/three.module.js";
import { CHAMPS_PAR_CHEMIN } from "../tranchage/protocole_tranchage.js";

// Le profil du cordon : (écart latéral, hauteur) de 0 à 1, et sa normale (latérale, verticale).
const PROFIL = [
  [-1, 0.5, -1, 0], [-0.55, 1, -0.45, 0.89], [0.55, 1, 0.45, 0.89],
  [1, 0.5, 1, 0], [0.55, 0, 0.45, -0.89], [-0.55, 0, -0.45, -0.89],
];
const COTES = PROFIL.length;
const INDICES_PAR_SEGMENT = COTES * 6;
// Au-delà de ce virage, le raccord garde une arête nette.
const COS_VIRAGE_LISSE = Math.cos(45 * Math.PI / 180);
// Un onglet ne dépasse jamais deux demi-largeurs.
const ONGLET_MAX = 2;
// L'éclairage de la scène est réglé pour des pièces claires : sur des couleurs
// vives, il sature et efface l'arrondi des cordons. Les lignes en reçoivent moins.
const LUMIERE_RECUE = 0.55;
// Le repère de couture, et la buse qui montre où en est le parcours (mm).
const TAILLE_COUTURE_MM = 0.35;
const RAYON_BUSE_MM = 0.9;
const HAUTEUR_BUSE_MM = 2.4;

const sectionDeLigne = (largeur, hauteur) => (largeur - hauteur) * hauteur + Math.PI * (hauteur / 2) ** 2;

/*
 * couleurs : { parType: { type: couleur CSS }, degrade: [5 couleurs CSS], couture, buse }
 */
export function creerApercuTranchage(scene3d, couleurs) {
  const groupe = new THREE.Group();
  groupe.name = "apercu_tranchage";
  scene3d.add(groupe);
  const degrade = couleurs.degrade.map((c) => new THREE.Color(c));

  let parType = new Map();      // type → { maillage, debuts: [indice de début de chaque couche], valeurs }
  let ordre = [];               // [couche] → [{ type, debut, segments, fin, piece, c }] dans l'ordre d'impression
  let donnees = null;
  let decalage = [0, 0];
  // Chaque sommet porte ce qui sert à le colorer : largeur, vitesse, couche, rapport de débit.
  const CHAMPS_PAR_SOMMET = 4;
  let nombreDeCouches = 0;
  let modulationParCouche = [];
  let debitDePiece = new Map();
  let plage = [0, Infinity];
  let avancement = Infinity;    // segments montrés dans la couche du haut
  let mode = "type";
  let typesVisibles = null;
  let coutures = [];            // [x, y, z, couche] dans le repère du monde
  let couturesVisibles = true;

  const geometrieCouture = new THREE.OctahedronGeometry(TAILLE_COUTURE_MM);
  const matiereCouture = new THREE.MeshBasicMaterial({ color: new THREE.Color(couleurs.couture) });
  let maillageCoutures = null;
  const buse = new THREE.Mesh(
    new THREE.ConeGeometry(RAYON_BUSE_MM, HAUTEUR_BUSE_MM, 16).rotateX(-Math.PI / 2).translate(0, 0, HAUTEUR_BUSE_MM / 2),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(couleurs.buse) }),
  );
  buse.visible = false;
  groupe.add(buse);

  function vider() {
    for (const { maillage } of parType.values()) {
      groupe.remove(maillage);
      maillage.geometry.dispose();
      maillage.material.dispose();
    }
    parType = new Map();
    ordre = [];
    if (maillageCoutures !== null) {
      groupe.remove(maillageCoutures);
      maillageCoutures.dispose();
      maillageCoutures = null;
    }
  }

  /*
   * Les modulations d'un essai de calibration, étalées couche par couche : à
   * partir de sa couche, la dernière commencée vaut jusqu'à la suivante. Sans
   * ça l'aperçu montrerait la vitesse sortie du tranchage, la même partout,
   * alors que le G-code, lui, fait bien varier les bandes.
   */
  function etaler(modulations, nombre) {
    const liste = (modulations ?? []).slice().sort((a, b) => a.couche - b.couche);
    const par = new Array(nombre).fill(null);
    let courante = null;
    let i = 0;
    for (let k = 0; k < nombre; k += 1) {
      while (i < liste.length && liste[i].couche <= k) { courante = liste[i]; i += 1; }
      par[k] = courante;
    }
    return par;
  }

  /* La vitesse demandée à cette couche : celle du tranchage, ou celle qu'impose l'essai. */
  function vitesseVoulueA(k, brute) {
    const m = modulationParCouche[k] ?? null;
    if (m === null) return brute;
    return m.vitesseImposee ?? brute * (m.facteurVitesse ?? 1);
  }

  /* Le ralentissement du temps de couche minimal, comme dans generation_gcode.js. */
  function ralentie(voulue, k) {
    const facteur = donnees.facteurs?.[k] ?? 1;
    const plancher = donnees.reglages?.vitesse_min_refroidissement ?? 0;
    return Math.max(Math.min(voulue, plancher), voulue / facteur);
  }

  function construire() {
    const { hauteurs, epaisseurs } = donnees.couches;
    nombreDeCouches = hauteurs.length;
    modulationParCouche = etaler(donnees.modulations, nombreDeCouches);
    // Le rapport de débit de chaque pièce : un essai peut en donner un par
    // éprouvette (l'escalier des débits), et c'est le G-code qui l'applique.
    const debitDeBase = donnees.reglages?.rapport_debit ?? 1;
    const parPiece = donnees.modulationsDePiece ?? [];
    let rangDePiece = -1;
    debitDePiece = new Map();
    for (const piece of donnees.pieces) {
      if (piece.jupe === true) { debitDePiece.set(piece, debitDeBase); continue; }
      rangDePiece += 1;
      debitDePiece.set(piece, parPiece[rangDePiece]?.reglages?.rapport_debit ?? debitDeBase);
    }
    // Les chemins de chaque couche, dans l'ordre d'impression : pièce après pièce.
    const parCouche = Array.from({ length: nombreDeCouches }, () => []);
    for (const piece of donnees.pieces) {
      for (let c = 0; c < piece.chemins.length; c += CHAMPS_PAR_CHEMIN) parCouche[piece.chemins[c]].push([piece, c]);
    }
    const tampons = new Map();
    const tamponDe = (type) => {
      if (!tampons.has(type)) tampons.set(type, { positions: [], normales: [], valeurs: [], indices: [], debuts: [] });
      return tampons.get(type);
    };
    for (let k = 0; k < nombreDeCouches; k += 1) {
      for (const t of tampons.values()) t.debuts[k] = t.indices.length;
      const zHaut = hauteurs[k];
      const zBas = zHaut - epaisseurs[k];
      ordre[k] = [];
      for (const [piece, c] of parCouche[k]) {
        const { points, chemins } = piece;
        const type = chemins[c + 1];
        const tampon = tamponDe(type);
        if (tampon.debuts[k] === undefined) tampon.debuts[k] = tampon.indices.length;
        const [premier, nombre, largeur, ferme] = [chemins[c + 2], chemins[c + 3], chemins[c + 4] / 1000, chemins[c + 5] === 1];
        const vitesse = vitesseVoulueA(k, chemins[c + 6] / 100);
        const liste = [];
        for (let i = 0; i < nombre; i += 1) liste.push([points[(premier + i) * 2] - decalage[0], points[(premier + i) * 2 + 1] - decalage[1]]);
        const debut = tampon.indices.length;
        const segments = ecrireCordon(tampon, liste, ferme, largeur / 2, zBas, zHaut, [largeur, vitesse, k, debitDePiece.get(piece) ?? 1]);
        ordre[k].push({ type, debut, segments, fin: tampon.indices.length, piece, c });
      }
    }
    for (const [type, t] of tampons) {
      // Les couches d'avant la première ligne de ce type commencent à zéro ; la fin ferme la liste.
      const debuts = Array.from({ length: nombreDeCouches + 1 }, (_, k) => (k < nombreDeCouches ? t.debuts[k] ?? null : t.indices.length));
      for (let k = nombreDeCouches - 1; k >= 0; k -= 1) if (debuts[k] === null) debuts[k] = debuts[k + 1];
      const geometrie = new THREE.BufferGeometry();
      geometrie.setAttribute("position", new THREE.Float32BufferAttribute(t.positions, 3));
      geometrie.setAttribute("normal", new THREE.Float32BufferAttribute(t.normales, 3));
      geometrie.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(t.positions.length), 3));
      geometrie.setIndex(new THREE.Uint32BufferAttribute(t.indices, 1));
      geometrie.computeBoundingSphere();
      const maillage = new THREE.Mesh(geometrie, new THREE.MeshLambertMaterial());
      groupe.add(maillage);
      parType.set(type, { maillage, debuts, valeurs: new Float32Array(t.valeurs) });
    }

    coutures = [];
    for (const piece of donnees.pieces) {
      const c = piece.coutures ?? [];
      for (let i = 0; i < c.length; i += 3) coutures.push([c[i] - decalage[0], c[i + 1] - decalage[1], hauteurs[c[i + 2]], c[i + 2]]);
    }
    if (coutures.length > 0) {
      maillageCoutures = new THREE.InstancedMesh(geometrieCouture, matiereCouture, coutures.length);
      groupe.add(maillageCoutures);
    }
  }

  // ── Plage de dessin : couches de bas à haut, et parcours de la couche du haut ──
  function appliquerLaPlage() {
    const bas = Math.min(plage[0], nombreDeCouches);
    const haut = Math.min(plage[1], nombreDeCouches - 1);
    // Ce que chaque type montre de la couche du haut, jusqu'au point du parcours.
    const dansLeHaut = new Map();
    let reste = avancement;
    let pointDeBuse = null;
    for (const morceau of haut >= 0 ? ordre[haut] ?? [] : []) {
      const montre = Math.min(reste, morceau.segments);
      const indices = montre === morceau.segments ? morceau.fin - morceau.debut : montre * INDICES_PAR_SEGMENT;
      dansLeHaut.set(morceau.type, (dansLeHaut.get(morceau.type) ?? 0) + indices);
      if (montre < morceau.segments && pointDeBuse === null) pointDeBuse = pointDuParcours(morceau, montre, haut);
      reste -= montre;
      if (reste <= 0 && pointDeBuse === null) pointDeBuse = pointDuParcours(morceau, montre, haut);
      if (reste <= 0) break;
    }
    for (const [type, { maillage, debuts }] of parType) {
      if (haut < bas) {
        maillage.geometry.setDrawRange(0, 0);
        continue;
      }
      const debut = debuts[bas];
      maillage.geometry.setDrawRange(debut, Math.max(0, debuts[haut] - debut) + (dansLeHaut.get(type) ?? 0));
    }
    // La buse ne se montre que quand on parcourt une couche.
    buse.visible = avancement !== Infinity && pointDeBuse !== null;
    if (buse.visible) buse.position.set(...pointDeBuse);
    placerLesCoutures(bas, haut);
  }

  /* Le point où en est la buse : le début du segment « rang » du chemin. */
  function pointDuParcours(morceau, rang, couche) {
    const { points, chemins } = morceau.piece;
    const [premier, nombre] = [morceau.piece.chemins[morceau.c + 2], chemins[morceau.c + 3]];
    const i = premier + (rang % nombre);
    return [points[i * 2] - decalage[0], points[i * 2 + 1] - decalage[1], donnees.couches.hauteurs[couche]];
  }

  function placerLesCoutures(bas, haut) {
    if (maillageCoutures === null) return;
    const matrice = new THREE.Matrix4();
    let n = 0;
    for (const [x, y, z, couche] of coutures) {
      if (couche < bas || couche > haut) continue;
      matrice.makeTranslation(x, y, z);
      maillageCoutures.setMatrixAt(n, matrice);
      n += 1;
    }
    maillageCoutures.count = n;
    maillageCoutures.instanceMatrix.needsUpdate = true;
    maillageCoutures.visible = couturesVisibles;
  }

  // ── Coloration ──
  /* La valeur de chaque sommet selon le mode : [largeur, vitesse, couche, débit] → nombre. */
  function lecteur() {
    const { epaisseurs } = donnees.couches;
    switch (mode) {
      case "largeur": return (l) => l;
      case "vitesse": return (l, v, k) => ralentie(v, k);
      case "debit": return (l, v, k, d) => ralentie(v, k) * sectionDeLigne(l, epaisseurs[k]) * d;
      case "hauteur": return (l, v, k) => epaisseurs[k];
      default: return null;
    }
  }

  function couleurDuDegrade(t, cible) {
    const x = Math.min(1, Math.max(0, t)) * (degrade.length - 1);
    const i = Math.min(degrade.length - 2, Math.floor(x));
    return cible.copy(degrade[i]).lerp(degrade[i + 1], x - i);
  }

  function colorer() {
    const lire = lecteur();
    for (const [type, { maillage }] of parType) {
      maillage.material.vertexColors = lire !== null;
      maillage.material.color = lire === null
        ? new THREE.Color(couleurs.parType[type] ?? couleurs.parType.defaut).multiplyScalar(LUMIERE_RECUE)
        : new THREE.Color(1, 1, 1).multiplyScalar(LUMIERE_RECUE);
      maillage.material.needsUpdate = true;
    }
    if (lire === null) return null;
    // L'échelle couvre les types affichés : masquer un type resserre le dégradé sur les autres.
    let [min, max] = [Infinity, -Infinity];
    for (const [type, { valeurs }] of parType) {
      if (typesVisibles !== null && !typesVisibles.has(type)) continue;
      for (let i = 0; i < valeurs.length; i += CHAMPS_PAR_SOMMET) {
        const v = lire(valeurs[i], valeurs[i + 1], valeurs[i + 2], valeurs[i + 3]);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min === Infinity) return null;
    const etendue = max - min || 1;
    const couleur = new THREE.Color();
    for (const { maillage, valeurs } of parType.values()) {
      const attribut = maillage.geometry.getAttribute("color");
      for (let s = 0; s < valeurs.length / CHAMPS_PAR_SOMMET; s += 1) {
        const i = s * CHAMPS_PAR_SOMMET;
        couleurDuDegrade((lire(valeurs[i], valeurs[i + 1], valeurs[i + 2], valeurs[i + 3]) - min) / etendue, couleur);
        attribut.setXYZ(s, couleur.r, couleur.g, couleur.b);
      }
      attribut.needsUpdate = true;
    }
    return { min, max };
  }

  return {
    /* nouvelles : { couches: { hauteurs, epaisseurs }, facteurs, pieces: [{ points, chemins, coutures }] },
       en repère machine ; ecart : ce qui le ramène au repère du monde. */
    afficher(nouvelles, ecart) {
      vider();
      nombreDeCouches = 0;
      donnees = nouvelles;
      decalage = ecart;
      if (donnees !== null) {
        construire();
        colorer();
        if (typesVisibles !== null) this.typesVisibles(typesVisibles);
      }
      appliquerLaPlage();
    },

    /* Les couches de bas à haut incluses (rangs depuis 0) ; la couche du haut est montrée entière. */
    montrerLesCouches(bas, haut) {
      plage = [bas, haut];
      avancement = Infinity;
      appliquerLaPlage();
    },

    /* Le nombre de segments de la couche du haut : l'étendue du curseur horizontal. */
    segmentsDeLaCouche(couche) {
      return (ordre[couche] ?? []).reduce((s, m) => s + m.segments, 0);
    },

    /* Montre la couche du haut jusqu'au segment « rang » ; rend ce qui s'imprime à cet endroit. */
    avancer(rang) {
      avancement = rang;
      appliquerLaPlage();
      const haut = Math.min(plage[1], nombreDeCouches - 1);
      let reste = rang;
      for (const morceau of ordre[haut] ?? []) {
        if (reste < morceau.segments || morceau === ordre[haut].at(-1)) {
          const { chemins } = morceau.piece;
          const vitesse = ralentie(vitesseVoulueA(haut, chemins[morceau.c + 6] / 100), haut);
          return { type: morceau.type, largeur: chemins[morceau.c + 4] / 1000, vitesse };
        }
        reste -= morceau.segments;
      }
      return null;
    },

    /* mode : "type", "vitesse", "largeur", "debit" ou "hauteur". Rend l'échelle { min, max }, ou null. */
    colorer(nouveauMode) {
      mode = nouveauMode;
      return donnees === null ? null : colorer();
    },

    typesVisibles(types) {
      typesVisibles = types;
      for (const [type, { maillage }] of parType) maillage.visible = types.has(type);
      return mode === "type" || donnees === null ? null : colorer();
    },

    montrerLesCoutures(visible) {
      couturesVisibles = visible;
      if (maillageCoutures !== null) maillageCoutures.visible = visible;
    },

    montrer(visible) {
      groupe.visible = visible;
    },
  };
}

const normaliser = ([x, y]) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const gauche = ([dx, dy]) => [-dy, dx];

/*
 * Un cordon : une suite de points, fermée ou non. Pour chaque point, un anneau
 * de six sommets (le profil), posé en onglet entre les deux segments voisins.
 * valeur : [largeur, vitesse, couche, rapport de débit], posée sur chaque sommet pour la coloration.
 * Rend le nombre de segments écrits (leurs indices d'abord, les bouchons ensuite).
 */
function ecrireCordon(tampon, points, ferme, demi, zBas, zHaut, valeur) {
  // Des points confondus donneraient des directions nulles.
  const propres = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-4);
  if (ferme && propres.length > 1 && Math.hypot(propres[0][0] - propres.at(-1)[0], propres[0][1] - propres.at(-1)[1]) <= 1e-4) propres.pop();
  const n = propres.length;
  if (n < 2) return 0;
  const segments = ferme ? n : n - 1;
  const directions = [];
  for (let i = 0; i < segments; i += 1) {
    const [a, b] = [propres[i], propres[(i + 1) % n]];
    directions.push(normaliser([b[0] - a[0], b[1] - a[1]]));
  }
  // Les bouts d'une ligne ouverte avancent d'une demi-largeur.
  if (!ferme) {
    const [d0, d1] = [directions[0], directions.at(-1)];
    propres[0] = [propres[0][0] - d0[0] * demi, propres[0][1] - d0[1] * demi];
    propres[n - 1] = [propres[n - 1][0] + d1[0] * demi, propres[n - 1][1] + d1[1] * demi];
  }

  const anneau = (point, lateral, normaleLaterale) => {
    const base = tampon.positions.length / 3;
    for (const [s, t, ns, nt] of PROFIL) {
      tampon.positions.push(point[0] + lateral[0] * s * demi, point[1] + lateral[1] * s * demi, zBas + t * (zHaut - zBas));
      tampon.normales.push(normaleLaterale[0] * ns, normaleLaterale[1] * ns, nt);
      tampon.valeurs.push(valeur[0], valeur[1], valeur[2], valeur[3]);
    }
    return base;
  };

  // Pour chaque point : l'anneau d'arrivée (du segment d'avant) et celui de départ (du segment d'après).
  const arrivees = new Array(n);
  const departs = new Array(n);
  for (let j = 0; j < n; j += 1) {
    const avant = ferme ? directions[(j - 1 + segments) % segments] : directions[j - 1];
    const apres = ferme ? directions[j % segments] : directions[j];
    if (avant === undefined || apres === undefined) {
      const l = gauche(avant ?? apres);
      const indice = anneau(propres[j], l, l);
      arrivees[j] = indice;
      departs[j] = indice;
      continue;
    }
    const [la, lb] = [gauche(avant), gauche(apres)];
    const onglet = normaliser([la[0] + lb[0], la[1] + lb[1]]);
    const facteur = Math.min(ONGLET_MAX, 1 / Math.max(1e-6, onglet[0] * lb[0] + onglet[1] * lb[1]));
    const lateral = [onglet[0] * facteur, onglet[1] * facteur];
    if (avant[0] * apres[0] + avant[1] * apres[1] >= COS_VIRAGE_LISSE) {
      const indice = anneau(propres[j], lateral, onglet);
      arrivees[j] = indice;
      departs[j] = indice;
    } else {
      // Coin vif : même position, mais chaque segment garde ses normales.
      arrivees[j] = anneau(propres[j], lateral, la);
      departs[j] = anneau(propres[j], lateral, lb);
    }
  }

  for (let i = 0; i < segments; i += 1) {
    const a = departs[i];
    const b = arrivees[(i + 1) % n];
    for (let k = 0; k < COTES; k += 1) {
      const k1 = (k + 1) % COTES;
      tampon.indices.push(a + k, b + k, b + k1, a + k, b + k1, a + k1);
    }
  }
  // Les bouts d'une ligne ouverte sont bouchés.
  if (!ferme) {
    boucher(tampon, departs[0], false);
    boucher(tampon, arrivees[n - 1], true);
  }
  return segments;
}

function boucher(tampon, anneau, versLAvant) {
  for (let k = 1; k + 1 < COTES; k += 1) {
    // Vu de face, le profil tourne dans le sens des aiguilles d'une montre au bout d'arrivée.
    if (versLAvant) tampon.indices.push(anneau, anneau + k + 1, anneau + k);
    else tampon.indices.push(anneau, anneau + k, anneau + k + 1);
  }
}
