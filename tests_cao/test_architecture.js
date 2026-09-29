/*
 * Les criteres de recette du jalon, verifies par lecture des sources plutot
 * que promis dans un document. Si l'un de ces tests echoue, ce n'est pas un
 * detail de style : c'est une dependance qui remonte les couches, et c'est
 * par la que le projet deviendrait une bouillie.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { formesCreables, typeExiste } from "../atelier-3d/noyau/registre_types_de_noeuds.js";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "atelier-3d");
const LIGNES_MAXIMALES = 300;

function typesDeNoeuds() {
  const internes = ["racine", "groupe", "importe"].filter(typeExiste);
  return new Set([...internes, ...formesCreables().map((type) => type.nom)]);
}

function fichiersJs(dossier) {
  const trouves = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom !== "vendor") trouves.push(...fichiersJs(chemin));
    } else if (nom.endsWith(".js")) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

const SOURCES = fichiersJs(RACINE).map((chemin) => ({
  chemin: relative(RACINE, chemin).split(sep).join("/"),
  absolu: chemin,
  texte: readFileSync(chemin, "utf8"),
}));

/* Les chemins importes par un fichier, resolus par rapport a la racine de
   l'atelier. On ne lit que les vraies instructions import, pas les commentaires. */
function importsDe(source) {
  const trouves = [];
  const motif = /^\s*import\s[^;]*?from\s+"([^"]+)"/gms;
  for (const correspondance of source.texte.matchAll(motif)) {
    const cible = resolve(dirname(source.absolu), correspondance[1]);
    trouves.push(relative(RACINE, cible).split(sep).join("/"));
  }
  return trouves;
}

const dans = (dossier) => SOURCES.filter((source) => source.chemin.startsWith(dossier + "/"));

// Les commentaires ont le droit de citer ce que le code n'a pas le droit de faire.
const sansCommentaires = (texte) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("il y a bien des sources a verifier", () => {
  assert.ok(dans("noyau").length >= 10);
  assert.ok(dans("geometrie").length >= 4);
});

test("noyau/ n'importe que noyau/ : ni three.js, ni Manifold, ni rien d'autre", () => {
  for (const source of dans("noyau")) {
    for (const cible of importsDe(source)) {
      assert.ok(cible.startsWith("noyau/"), source.chemin + " importe " + cible);
    }
  }
});

test("noyau/ ne touche jamais au navigateur", () => {
  const interdits = /\b(window|localStorage|sessionStorage|navigator|requestAnimationFrame|getElementById|querySelector|createElement)\b/;
  for (const source of dans("noyau")) {
    assert.equal(interdits.test(sansCommentaires(source.texte)), false,
      source.chemin + " utilise une API du navigateur");
  }
});

test("interface/ n'importe pas three.js", () => {
  for (const source of dans("interface")) {
    for (const cible of importsDe(source)) {
      assert.equal(cible.includes("three"), false, source.chemin + " importe " + cible);
      assert.equal(cible.startsWith("vue/"), false, source.chemin + " importe la vue " + cible);
    }
  }
});

test("geometrie/ ne connait ni la vue, ni l'interface, ni three.js", () => {
  for (const source of dans("geometrie")) {
    for (const cible of importsDe(source)) {
      assert.equal(cible.startsWith("vue/"), false, source.chemin + " importe " + cible);
      assert.equal(cible.startsWith("interface/"), false, source.chemin + " importe " + cible);
      assert.equal(cible.includes("three"), false, source.chemin + " importe " + cible);
    }
  }
});

test("la vue ne peut pas ecrire le document : elle n'importe aucune commande", () => {
  for (const source of dans("vue")) {
    for (const cible of importsDe(source)) {
      assert.equal(cible.startsWith("noyau/commandes/"), false, source.chemin + " importe " + cible);
      assert.equal(cible === "noyau/pile_annulation.js", false, source.chemin + " importe la pile");
    }
  }
});

test("Manifold n'est charge que par l'ouvrier", () => {
  const chargeurs = SOURCES
    .filter((source) => importsDe(source).some((cible) => cible.includes("manifold")))
    .map((source) => source.chemin);
  assert.deepEqual(chargeurs, ["geometrie/ouvrier_geometrie.js"]);
});

test("aucun test noeud.type === \"...\" hors des fichiers de type", () => {
  // Le critere vise les types de NOEUDS : une option de bandeau a aussi un
  // champ « type » (case, nombre), et la comparer n'est pas une faute.
  const noms = [...typesDeNoeuds()].join("|");
  const motif = new RegExp(String.raw`\.type\s*[!=]==?\s*["'](` + noms + String.raw`)["']`);
  for (const source of SOURCES) {
    if (source.chemin.startsWith("noyau/types/")) continue;
    assert.equal(motif.test(sansCommentaires(source.texte)), false,
      source.chemin + " teste un type de noeud en dur");
  }
});

test("la pile d'annulation ne connait aucun type de commande", () => {
  const pile = SOURCES.find((source) => source.chemin === "noyau/pile_annulation.js");
  for (const cible of importsDe(pile)) {
    assert.equal(cible, "noyau/commandes/registre_commandes.js", "la pile importe " + cible);
  }
});

test("aucun fichier ne depasse " + LIGNES_MAXIMALES + " lignes", () => {
  for (const source of SOURCES) {
    const lignes = source.texte.split("\n").length;
    assert.ok(lignes <= LIGNES_MAXIMALES, source.chemin + " fait " + lignes + " lignes");
  }
});

test("aucune adresse exterieure dans les sources : tout est servi par le site", () => {
  // Texte brut, et non sansCommentaires() : retirer les « // » couperait
  // justement les adresses « https://… » qu'on cherche.
  const exterieur = /["'`]https?:\/\//;
  // L'espace de noms SVG a la forme d'une adresse, mais n'est jamais téléchargé.
  const espacesDeNoms = /["'`]http:\/\/www\.w3\.org\/2000\/svg["'`]/g;
  for (const source of SOURCES) {
    assert.equal(exterieur.test(source.texte.replace(espacesDeNoms, "")), false,
      source.chemin + " contient une adresse exterieure");
  }
  for (const nom of ["index.html", "v0/index.html"]) {
    const page = readFileSync(join(RACINE, nom), "utf8");
    assert.equal(/(src|href)="https?:/.test(page), false, nom + " charge une ressource exterieure");
  }
  const feuilles = readdirSync(join(RACINE, "styles")).map((f) => readFileSync(join(RACINE, "styles", f), "utf8"));
  assert.equal(feuilles.some((css) => /url\(\s*["']?https?:|@import/.test(css)), false, "une feuille de style charge une ressource exterieure");
});

test("les feuilles de style respectent le §7 : un seul degrade, aucun arrondi hors champs, aucune ombre hors menus", () => {
  // Les commentaires expliquent les règles (« aucune transition ») : on ne les lit pas comme du code.
  const feuilles = readdirSync(join(RACINE, "styles"))
    .map((f) => [f, readFileSync(join(RACINE, "styles", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")]);
  let degrades = 0;
  for (const [nom, css] of feuilles) {
    degrades += (css.match(/gradient\(/g) ?? []).length;
    for (const [, valeur] of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      assert.ok(/^(0|var\(--rayon-champ\)|0 var\(--rayon-champ\) var\(--rayon-champ\) 0|var\(--rayon-champ\) 0 0 var\(--rayon-champ\))$/.test(valeur.trim()),
        nom + " arrondit autre chose que les champs : " + valeur);
    }
    for (const [, valeur] of css.matchAll(/box-shadow:\s*([^;]+);/g)) {
      assert.equal(valeur.trim(), "var(--ombre-menu)", nom + " pose une ombre hors d'un menu");
    }
    assert.equal(/transition\s*:/.test(css), false, nom + " anime un survol");
  }
  assert.equal(degrades, 1, "seul le fond de la vue 3D a droit a un degrade");
});

test("aucun alert(), confirm() ni prompt() : les erreurs vont dans la barre d'etat", () => {
  for (const source of SOURCES) {
    assert.equal(/\b(alert|confirm|prompt)\s*\(/.test(sansCommentaires(source.texte)), false, source.chemin);
  }
});

test("chaque jeton de couleur lu par la vue existe dans les deux feuilles de reglages", () => {
  // Un jeton oublié fait tomber la page au démarrage : c'est arrivé à la page V0.
  const lecteur = readFileSync(join(RACINE, "interface", "couleurs_de_la_vue.js"), "utf8");
  const jetons = [...new Set([...lecteur.matchAll(/"(--[a-z0-9-]*[a-z0-9])"/g)].map((m) => m[1]))];
  assert.ok(jetons.length >= 10);
  for (const feuille of ["styles/reglages_interface.css", "v0/v0_provisoire.css"]) {
    const css = readFileSync(join(RACINE, feuille), "utf8");
    for (const jeton of jetons) {
      assert.ok(new RegExp(jeton + "\s*:").test(css), feuille + " ne definit pas " + jeton);
    }
  }
});
