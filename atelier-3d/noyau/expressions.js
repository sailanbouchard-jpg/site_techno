/*
 * noyau/expressions.js
 * ────────────────────
 * Les calculs qu'on tape dans un champ : « pile_rayon * 2 + 0,3 ». Les quatre
 * opérations, la puissance (^), les parenthèses, le signe moins, la virgule
 * ou le point décimal, et quelques fonctions — de quoi écrire une règle de
 * conception (« ent(clip_T / 0,42) * 0,42 ») sans en faire une calculatrice.
 *
 * Les arguments d'une fonction se séparent par un point-virgule, comme dans
 * un tableur français : la virgule est déjà prise par les décimales.
 *
 * Dans le document, une variable s'écrit par son identifiant entre accolades :
 * « {v3_k2} * 2 + 0,3 ». Renommer la variable ne touche donc à aucune formule ;
 * l'interface remet les noms à l'affichage.
 */

export const NOM_DE_VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ESPACES = /^\s+/;
const NOMBRE = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)/;
const REFERENCE = /^\{([A-Za-z0-9_]+)\}/;
const NOM = /^[A-Za-z_][A-Za-z0-9_]*/;
const SIGNES = "+-*/^();";
// Un nom ou une référence, pour les remplacer sans toucher au reste du texte.
const NOMS_ET_REFERENCES = /\{[A-Za-z0-9_]+\}|[A-Za-z_][A-Za-z0-9_]*/g;
const RADIANS = Math.PI / 180;

/* Les fonctions, angles en degrés comme partout dans l'atelier. « si » est à
   part : elle ne calcule que la branche choisie (voir calculer). */
const FONCTIONS = {
  min: { arguments: [1, Infinity], calcul: (...v) => Math.min(...v) },
  max: { arguments: [1, Infinity], calcul: (...v) => Math.max(...v) },
  abs: { arguments: [1, 1], calcul: Math.abs },
  racine: { arguments: [1, 1], calcul: (v) => {
    if (v < 0) throw new Error("racine d'un nombre négatif.");
    return Math.sqrt(v);
  } },
  arrondi: { arguments: [1, 1], calcul: Math.round },
  ent: { arguments: [1, 1], calcul: (v) => Math.floor(v + 1e-9) },
  sin: { arguments: [1, 1], calcul: (v) => Math.sin(v * RADIANS) },
  cos: { arguments: [1, 1], calcul: (v) => Math.cos(v * RADIANS) },
  tan: { arguments: [1, 1], calcul: (v) => Math.tan(v * RADIANS) },
  atan: { arguments: [1, 1], calcul: (v) => Math.atan(v) / RADIANS },
  si: { arguments: [3, 3] },
};

export const NOMS_DE_FONCTIONS = Object.freeze(Object.keys(FONCTIONS));
export const estUneFonction = (nom) => Object.hasOwn(FONCTIONS, nom.toLowerCase());

function decouper(texte) {
  const jetons = [];
  let reste = texte;
  while (reste.length > 0) {
    const espace = ESPACES.exec(reste);
    if (espace) {
      reste = reste.slice(espace[0].length);
      continue;
    }
    let lu = NOMBRE.exec(reste);
    if (lu) jetons.push({ genre: "nombre", valeur: Number(lu[0].replace(",", ".")), texte: lu[0] });
    else if ((lu = REFERENCE.exec(reste))) jetons.push({ genre: "reference", id: lu[1], texte: lu[0] });
    else if ((lu = NOM.exec(reste))) jetons.push({ genre: "nom", nom: lu[0], texte: lu[0] });
    else if (SIGNES.includes(reste[0])) {
      lu = [reste[0]];
      jetons.push({ genre: "signe", texte: reste[0] });
    } else {
      throw new Error("« " + reste[0] + " » n'a pas sa place dans un calcul.");
    }
    reste = reste.slice(lu[0].length);
  }
  return jetons;
}

// Les arbres déjà construits, par texte : chercher la plage permise d'un
// paramètre recalcule les mêmes formules des centaines de fois.
const ARBRES_GARDES = 2000;
const arbres = new Map();

/* L'arbre du calcul : { genre: "nombre" | "variable" | "operation" | "oppose" | "appel" }. */
function analyser(texte) {
  const connu = arbres.get(texte);
  if (connu !== undefined) return connu;
  const arbre = construireLArbre(texte);
  if (arbres.size >= ARBRES_GARDES) arbres.clear();
  arbres.set(texte, arbre);
  return arbre;
}

function construireLArbre(texte) {
  const jetons = decouper(texte);
  if (jetons.length === 0) throw new Error("Le champ est vide.");
  let i = 0;
  const estSigne = (jeton, signes) => jeton?.genre === "signe" && signes.includes(jeton.texte);

  function somme() {
    let gauche = produit();
    while (estSigne(jetons[i], "+-")) {
      const signe = jetons[i++].texte;
      gauche = { genre: "operation", signe, gauche, droite: produit() };
    }
    return gauche;
  }
  function produit() {
    let gauche = facteur();
    while (estSigne(jetons[i], "*/")) {
      const signe = jetons[i++].texte;
      gauche = { genre: "operation", signe, gauche, droite: facteur() };
    }
    return gauche;
  }
  // Le signe moins passe après la puissance : -2^2 vaut -4, comme au tableau.
  function facteur() {
    if (estSigne(jetons[i], "+-")) {
      const signe = jetons[i++].texte;
      const terme = facteur();
      return signe === "-" ? { genre: "oppose", terme } : terme;
    }
    const base = atome();
    if (!estSigne(jetons[i], "^")) return base;
    i += 1;
    return { genre: "operation", signe: "^", gauche: base, droite: facteur() };
  }
  function appel(nom) {
    const fonction = FONCTIONS[nom.toLowerCase()];
    i += 1;   // la parenthèse ouvrante
    const argumentsLus = [];
    if (!estSigne(jetons[i], ")")) {
      argumentsLus.push(somme());
      while (estSigne(jetons[i], ";")) {
        i += 1;
        argumentsLus.push(somme());
      }
    }
    if (!estSigne(jetons[i], ")")) {
      throw new Error("La parenthèse de « " + nom + " » n'est pas refermée (arguments séparés par « ; »).");
    }
    i += 1;
    const [moins, plus] = fonction.arguments;
    if (argumentsLus.length < moins || argumentsLus.length > plus) {
      throw new Error("« " + nom + " » attend " + (moins === plus ? moins : "au moins " + moins) + " valeur" + (moins > 1 ? "s" : "") + ", séparées par « ; ».");
    }
    return { genre: "appel", nom: nom.toLowerCase(), arguments: argumentsLus };
  }
  function atome() {
    const jeton = jetons[i];
    if (jeton === undefined) throw new Error("Le calcul s'arrête sur un signe : il manque un nombre.");
    if (jeton.genre === "nom" && estUneFonction(jeton.nom) && estSigne(jetons[i + 1], "(")) {
      i += 1;
      return appel(jeton.nom);
    }
    i += 1;
    if (estSigne(jeton, "(")) {
      const dedans = somme();
      if (!estSigne(jetons[i], ")")) throw new Error("Une parenthèse n'est pas refermée.");
      i += 1;
      return dedans;
    }
    if (jeton.genre === "nombre") return { genre: "nombre", valeur: jeton.valeur };
    if (jeton.genre === "reference") return { genre: "variable", id: jeton.id };
    if (jeton.genre === "nom") return { genre: "variable", nom: jeton.nom };
    if (estSigne(jeton, ";")) throw new Error("« ; » sépare les valeurs d'une fonction, ex. max(2; clip_T).");
    throw new Error("« " + jeton.texte + " » est mal placé.");
  }

  const arbre = somme();
  if (i < jetons.length) {
    throw new Error("« " + jetons[i].texte + " » est de trop : il manque un signe (+ − × ÷) avant ?");
  }
  return arbre;
}

function calculer(arbre, valeurDe) {
  if (arbre.genre === "nombre") return arbre.valeur;
  if (arbre.genre === "variable") return valeurDe(arbre);
  if (arbre.genre === "oppose") return -calculer(arbre.terme, valeurDe);
  if (arbre.genre === "appel") {
    // si(test; alors; sinon) : test non nul = vrai. L'autre branche n'est pas
    // calculée — elle peut très bien diviser par zéro dans ce cas-là.
    if (arbre.nom === "si") {
      const [test, alors, sinon] = arbre.arguments;
      return calculer(Math.abs(calculer(test, valeurDe)) > 1e-12 ? alors : sinon, valeurDe);
    }
    const valeurs = arbre.arguments.map((a) => calculer(a, valeurDe));
    return FONCTIONS[arbre.nom].calcul(...valeurs);
  }
  const a = calculer(arbre.gauche, valeurDe);
  const b = calculer(arbre.droite, valeurDe);
  if (arbre.signe === "+") return a + b;
  if (arbre.signe === "-") return a - b;
  if (arbre.signe === "*") return a * b;
  if (arbre.signe === "^") return a ** b;
  if (b === 0) throw new Error("Division par zéro.");
  return a / b;
}

/* valeurDe({ id } ou { nom }) → nombre, ou lève une erreur. */
export function evaluer(texte, valeurDe) {
  const valeur = calculer(analyser(texte), valeurDe);
  if (!Number.isFinite(valeur)) throw new Error("Ce calcul ne donne pas un nombre.");
  return valeur;
}

/* Vérifie l'écriture, sans rien calculer. */
export function verifierEcriture(texte) {
  analyser(texte);
}

export function referencesDe(formule) {
  return new Set(decouper(formule).filter((j) => j.genre === "reference").map((j) => j.id));
}

/* Remplace chaque nom (remplacerNom) et chaque {id} (remplacerReference) ;
   les nombres, les signes, les espaces et les noms de fonctions restent tels
   que l'élève les a tapés. */
export function reecrire(texte, { remplacerNom = (nom) => nom, remplacerReference = (id) => "{" + id + "}" }) {
  return texte.replace(NOMS_ET_REFERENCES, (morceau, position) => {
    if (morceau.startsWith("{")) return remplacerReference(morceau.slice(1, -1));
    if (estUneFonction(morceau) && /^\s*\(/.test(texte.slice(position + morceau.length))) return morceau;
    return remplacerNom(morceau);
  });
}
