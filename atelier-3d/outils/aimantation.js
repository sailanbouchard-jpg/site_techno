/*
 * outils/aimantation.js
 * ─────────────────────
 * Pendant un glisser, la pièce s'aligne sur les centres et les bords des
 * objets voisins, et sur les axes du monde. Calcul pur sur des boîtes
 * englobantes : pas de three.js, testable sous Node.
 *
 * Une boîte : { min: [x, y, z], max: [x, y, z] }, en millimètres.
 */

const AXES = [["x", 0, 1], ["y", 1, 0]];

function lignes(boite, i) {
  return [boite.min[i], (boite.min[i] + boite.max[i]) / 2, boite.max[i]];
}

/*
 * Rend le décalage à appliquer à la pièce pour qu'elle s'aligne, et les traits
 * d'aide à dessiner. Chaque axe s'aimante indépendamment : on peut s'aligner
 * sur le bord d'un objet en X et sur le centre d'un autre en Y.
 *
 * seuil : distance en millimètres en dessous de laquelle on aimante. Il dépend
 * du zoom — c'est à l'appelant de le calculer.
 */
export function aimanter(boiteMobile, voisines, seuil) {
  const resultat = { dx: 0, dy: 0, guides: [] };

  for (const [axe, i, autre] of AXES) {
    let meilleur = null;

    const candidats = [{ valeur: 0, boite: null }];   // l'axe du monde
    for (const voisine of voisines) {
      for (const valeur of lignes(voisine, i)) candidats.push({ valeur, boite: voisine });
    }

    for (const ligne of lignes(boiteMobile, i)) {
      for (const candidat of candidats) {
        const ecart = candidat.valeur - ligne;
        if (Math.abs(ecart) > seuil) continue;
        if (meilleur === null || Math.abs(ecart) < Math.abs(meilleur.ecart)) {
          meilleur = { ecart, ...candidat };
        }
      }
    }

    if (meilleur === null) continue;
    resultat["d" + axe] = meilleur.ecart;

    // Le trait d'aide va d'un objet à l'autre, au sol, le long de l'autre axe.
    const etendue = meilleur.boite === null ? [boiteMobile] : [boiteMobile, meilleur.boite];
    const debut = Math.min(...etendue.map((b) => b.min[autre]));
    const fin = Math.max(...etendue.map((b) => b.max[autre]));
    const de = [0, 0, 0];
    const a = [0, 0, 0];
    de[i] = meilleur.valeur;
    a[i] = meilleur.valeur;
    de[autre] = debut;
    a[autre] = fin;
    resultat.guides.push({ axe, valeur: meilleur.valeur, de, a });
  }

  return resultat;
}

export function arrondirAuPas(valeur, pas) {
  const arrondie = Math.round(valeur / pas) * pas;
  // Dix chiffres suffisent à effacer l'écume des flottants (0.30000000000000004).
  return Number(arrondie.toFixed(10));
}

export function deplacerBoite(boite, dx, dy, dz = 0) {
  return {
    min: [boite.min[0] + dx, boite.min[1] + dy, boite.min[2] + dz],
    max: [boite.max[0] + dx, boite.max[1] + dy, boite.max[2] + dz],
  };
}

/*
 * Une place au sol où une pièce neuve ne chevauche rien : on part du point
 * visé et on tourne autour, par pas réguliers. Sans cela, chaque forme ajoutée
 * naît dans la précédente et l'élève ne voit rien apparaître.
 * taille : [largeur, profondeur] de la pièce ; rend [x, y].
 */
export function trouverPlaceLibre([cx, cy], [largeur, profondeur], occupees, marge = 2) {
  const libre = (x, y) => occupees.every((b) =>
    x + largeur / 2 + marge <= b.min[0] || x - largeur / 2 - marge >= b.max[0]
    || y + profondeur / 2 + marge <= b.min[1] || y - profondeur / 2 - marge >= b.max[1]);

  const pas = Math.max(5, Math.round(Math.max(largeur, profondeur) / 2));
  for (let anneau = 0; anneau <= 20; anneau += 1) {
    for (let i = -anneau; i <= anneau; i += 1) {
      for (const [dx, dy] of [[i, -anneau], [i, anneau], [-anneau, i], [anneau, i]]) {
        const [x, y] = [cx + dx * pas, cy + dy * pas];
        if (libre(x, y)) return [x, y];
      }
    }
  }
  return [cx, cy];
}
