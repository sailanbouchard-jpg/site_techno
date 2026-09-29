/*
 * noyau/empreinte_de_noeud.js
 * ───────────────────────────
 * L'empreinte est la clé du cache de maillages : deux nœuds de même empreinte
 * produisent exactement le même maillage, et le calcul n'est fait qu'une fois.
 *
 * Ce qui entre dans l'empreinte d'un nœud : son type, ses paramètres, et pour
 * chacun de ses enfants — dans l'ordre — la case trou, la visibilité, la
 * transformation et l'empreinte de l'enfant.
 *
 * Ce qui n'y entre PAS : l'identifiant, le nom, la couleur, et surtout la
 * transformation du nœud lui-même. Conséquences voulues :
 *   - déplacer un objet ne recalcule rien, sa transformation est appliquée à
 *     l'affichage ;
 *   - deux pavés de mêmes dimensions partagent un seul maillage ;
 *   - déplacer un objet A L'INTERIEUR d'un groupe recalcule le groupe, parce
 *     que sa position décide d'où il perce et d'où il s'unit. C'est inévitable,
 *     et c'est la seule exception au point précédent.
 */

// FNV-1a 32 bits : quelques lignes, aucune dépendance, et suffisant pour une
// clé de cache — une collision coûterait un mauvais maillage, pas une faille.
function empreinteDeTexte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Arrondi au millième de millimètre : en dessous, deux valeurs issues d'un
// glisser de souris donnent le même objet imprimé.
function texteDeNombre(valeur) {
  return Number.isFinite(valeur) ? valeur.toFixed(3) : "0.000";
}

function texteDeVecteur(v) {
  return texteDeNombre(v.x) + "," + texteDeNombre(v.y) + "," + texteDeNombre(v.z);
}

function texteDeTransformation(t) {
  return texteDeVecteur(t.position) + "|" + texteDeVecteur(t.rotation) + "|" + texteDeVecteur(t.echelle);
}

// Les paramètres d'une esquisse pèsent lourd à écrire : ils ne changent
// jamais sans changer d'objet (tout est figé), on retient donc leur texte.
const textesConnus = new WeakMap();
const empreintesConnues = new WeakMap();

// Clés triées : l'empreinte ne doit pas dépendre de l'ordre dans lequel les
// paramètres ont été écrits dans le fichier de l'élève.
function texteDeParametres(parametres) {
  const connu = textesConnus.get(parametres);
  if (connu !== undefined) return connu;
  const texte = ecrireLesParametres(parametres);
  textesConnus.set(parametres, texte);
  return texte;
}

function ecrireLesParametres(parametres) {
  return Object.keys(parametres)
    .sort()
    .map((cle) => {
      const valeur = parametres[cle];
      if (typeof valeur === "number") return cle + "=" + texteDeNombre(valeur);
      // Les tracés d'une esquisse sont des objets : on les écrit en entier.
      return cle + "=" + (typeof valeur === "object" ? JSON.stringify(valeur) : String(valeur));
    })
    .join(";");
}

export function texteEmpreinte(noeud) {
  const enfants = noeud.enfants
    .map((enfant) => [
      enfant.trou ? "t" : "-",
      enfant.visible ? "v" : "-",
      texteDeTransformation(enfant.transformation),
      texteEmpreinte(enfant),
    ].join(":"))
    .join("+");
  return noeud.type + "(" + texteDeParametres(noeud.parametres) + ")[" + enfants + "]";
}

export function empreinteDeNoeud(noeud) {
  const connue = empreintesConnues.get(noeud);
  if (connue !== undefined) return connue;
  const empreinte = empreinteDeTexte(texteEmpreinte(noeud));
  empreintesConnues.set(noeud, empreinte);
  return empreinte;
}
