/**
 * test-headless.js — Vérification du moteur SANS navigateur.
 *
 *   node test-headless.js      (depuis /simulateur-cmd/)
 *
 * Couvre les critères d'acceptation de la Partie A (machine pilotée par
 * commandes, sérialisation, chemins) et le flux du défi de la Partie B
 * (flags, validation par état, persistance au niveau réussi uniquement).
 */

import { Machine, Session, createMemoryIO, NullAdapter } from "./engine/engine.js";
import { createChallenge, machineSeed, FLAG_NIVEAU_1, FLAG_NIVEAU_2 } from "./challenges/00-prise-en-main/challenge.def.js";

let tests = 0;
let echecs = 0;

function verifie(condition, libelle) {
  tests++;
  if (condition) {
    console.log(`  ✓ ${libelle}`);
  } else {
    echecs++;
    console.error(`  ✗ ÉCHEC : ${libelle}`);
  }
}

// ── 1. DoD : piloter une machine en chaînes de caractères, sans DOM ──────────

console.log("\n[1] Machine pilotée par commandes (headless)");
{
  const machine = Machine.create({ hostname: "test-01", user: "eleve" });
  machine.power = "on";
  const io = createMemoryIO();
  const session = Session.create(machine, io);

  await session.execute("mkdir dossier");
  await session.execute("cd dossier");
  await session.execute("touch a.txt");

  verifie(machine.cwd === "/home/eleve/dossier", "cd a bien changé le dossier courant");
  verifie(machine.fs.exists("/home/eleve/dossier/a.txt"), "touch a créé le fichier");
  verifie(session.history.length === 3, "l'historique contient les 3 lignes");

  await session.execute("pwd");
  verifie(io.texte().includes("/home/eleve/dossier"), "pwd écrit le chemin dans io");

  await session.execute("commande_inconnue");
  verifie(io.texte().includes("Commande introuvable"), "commande inconnue → message clair");
}

// ── 2. Sérialisation aller-retour ─────────────────────────────────────────────

console.log("\n[2] serialize() → JSON → deserialize()");
{
  const machine = Machine.create(
    { hostname: "poste", user: "eleve" },
    { "/home/eleve/x.txt": "contenu x", "/home/eleve/Dossier/.cache": "secret" }
  );
  machine.power = "on";
  machine.cwd = "/home/eleve/Dossier";
  machine.state.flagsFound = ["a", "b"];

  const json = JSON.stringify(machine.serialize());
  const copie = Machine.deserialize(json);

  verifie(copie.cwd === machine.cwd, "cwd restauré");
  verifie(copie.power === "on", "état d'alimentation restauré");
  verifie(copie.fs.read("/home/eleve/x.txt") === "contenu x", "contenu des fichiers restauré");
  verifie(copie.fs.exists("/home/eleve/Dossier/.cache"), "fichiers cachés restaurés");
  verifie(JSON.stringify(copie.state) === JSON.stringify(machine.state), "state restauré");
  verifie(JSON.stringify(copie.serialize()) === json, "re-sérialisation identique");
}

// ── 3. Résolution de chemins ──────────────────────────────────────────────────

console.log("\n[3] Chemins : . .. / relatifs, absolus, slash final");
{
  const machine = Machine.create({ user: "eleve" });
  const fs = machine.fs;
  verifie(fs.resolve(".", "/home/eleve") === "/home/eleve", "« . » → dossier courant");
  verifie(fs.resolve("..", "/home/eleve") === "/home", "« .. » → parent");
  verifie(fs.resolve("../..", "/home/eleve") === "/", "« ../.. » → racine");
  verifie(fs.resolve("../../..", "/home") === "/", "« .. » ne dépasse pas la racine");
  verifie(fs.resolve("a/b/../c", "/home") === "/home/a/c", "« a/b/../c » simplifié");
  verifie(fs.resolve("/abs/./chemin/", "/home") === "/abs/chemin", "absolu + slash final normalisés");
  verifie(fs.resolve("a//b", "/") === "/a/b", "slashs multiples ignorés");
}

// ── 4. Fichiers cachés, ls, rm -r, erreurs en français ────────────────────────

console.log("\n[4] VFS : cachés, suppression, erreurs claires");
{
  const machine = Machine.create({ user: "eleve" }, {
    "/home/eleve/visible.txt": "v",
    "/home/eleve/.cache.txt": "c",
    "/home/eleve/Plein/sous/fichier.txt": "f",
  });
  const fs = machine.fs;

  const noms = fs.list("/home/eleve").map((e) => e.name);
  verifie(!noms.includes(".cache.txt"), "ls sans -a masque les fichiers cachés");
  const tous = fs.list("/home/eleve", { all: true }).map((e) => e.name);
  verifie(tous.includes(".cache.txt"), "list({all:true}) montre les cachés");

  let message = "";
  try { fs.rm("/home/eleve/Plein"); } catch (e) { message = e.message; }
  verifie(message.includes("rm -r"), "rm sur dossier sans -r → message clair");
  fs.rm("/home/eleve/Plein", { recursive: true });
  verifie(!fs.exists("/home/eleve/Plein"), "rm -r supprime le dossier");

  message = "";
  try { fs.read("/nulle/part"); } catch (e) { message = e.message; }
  verifie(message.includes("introuvable"), "lecture d'un chemin inexistant → erreur en français");
}

// ── 5. Cycle de vie : machine éteinte ─────────────────────────────────────────

console.log("\n[5] Alimentation : éteinte → seules poweron répond");
{
  const machine = Machine.create({ user: "eleve" }); // power = off
  const io = createMemoryIO();
  const session = Session.create(machine, io);

  await session.execute("ls");
  verifie(io.texte().includes("éteinte"), "commande refusée machine éteinte");
  await session.execute("poweron");
  verifie(machine.power === "on", "poweron allume la machine");
  await session.execute("poweroff");
  verifie(machine.power === "off", "poweroff éteint la machine");
}

// ── 6. Défi 00 : flux complet (flags, état, persistance) ──────────────────────

console.log("\n[6] Défi 00-prise-en-main : 3 niveaux");
{
  // Adaptateur mémoire : vérifie QUAND on sauvegarde.
  const memoire = new Map();
  const adapter = {
    async load(cle) { return memoire.get(cle) ?? null; },
    async save(cle, data) { data == null ? memoire.delete(cle) : memoire.set(cle, JSON.parse(JSON.stringify(data))); },
  };

  const defi = createChallenge("eleve-test", adapter);
  await defi.init();
  defi.machine.power = "on";
  const io = createMemoryIO();
  const session = Session.create(defi.machine, io);
  defi.attachSession(session);

  // Niveau 1 : le flag est lisible via ls + cat.
  await session.execute("cat lisez-moi.txt");
  verifie(io.texte().includes(FLAG_NIVEAU_1), "le flag 1 se lit avec cat");
  verifie(!(await defi.submit("TECHNO{FAUX}")).success, "mauvais flag refusé");
  verifie(memoire.size === 0, "AUCUNE sauvegarde avant la première réussite");
  verifie((await defi.submit(FLAG_NIVEAU_1)).success, "flag 1 accepté");
  verifie(memoire.size === 1, "sauvegarde déclenchée à la réussite du niveau 1");

  // Niveau 2 : fichier caché dans Exploration/grenier.
  await session.execute("cd Exploration/grenier");
  await session.execute("ls");
  verifie(!io.texte().split("cd Exploration")[1]?.includes(".coffre"), "ls simple ne montre pas .coffre");
  await session.execute("cat .coffre");
  verifie(io.texte().includes(FLAG_NIVEAU_2), "le flag 2 se lit dans le fichier caché");
  verifie((await defi.submit(FLAG_NIVEAU_2)).success, "flag 2 accepté");

  // Niveau 3 : validation PAR ÉTAT (pas de flag).
  verifie(!(await defi.submit("")).success, "niveau 3 refusé tant que le rapport n'existe pas");
  defi.machine.fs.write("/home/eleve/Documents/rapport.txt", "  mission  ACCOMPLIE !\n", { by: "eleve" });
  const fin = await defi.submit("");
  verifie(fin.success && fin.done, "niveau 3 validé par l'état de la machine → défi terminé");

  // Rechargement : on repart du niveau le plus avancé, machine restaurée.
  const defi2 = createChallenge("eleve-test", adapter);
  await defi2.init();
  verifie(defi2.done, "après rechargement : progression restaurée (défi terminé)");
  verifie(defi2.machine.fs.exists("/home/eleve/Documents/rapport.txt"), "machine restaurée avec le rapport");

  // Un autre élève ne voit pas cette progression.
  const defi3 = createChallenge("eleve-autre", new NullAdapter());
  await defi3.init();
  verifie(defi3.currentLevelIndex === 0, "autre élève → niveau 1");
}

// ── Bilan ─────────────────────────────────────────────────────────────────────

console.log(`\n${tests - echecs}/${tests} vérifications réussies.`);
if (echecs > 0) {
  console.error("DES TESTS ONT ÉCHOUÉ.");
  process.exit(1);
}
console.log("Tout est bon : le moteur tourne sans navigateur.\n");
