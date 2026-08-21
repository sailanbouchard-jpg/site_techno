/**
 * ls — liste le contenu d'un dossier.
 * Syntaxe : ls [-a] [-l] [chemin]
 *   -a : montre aussi les entrées cachées (commençant par « . »)
 *   -l : format détaillé (droits, propriétaire, date, taille)
 */

export default {
  name: "ls",
  aliases: ["dir"],
  description: "Liste le contenu d'un dossier",
  usage: "ls [-a] [-l] [chemin]",

  run(ctx, args) {
    const { io, fs, machine } = ctx;
    const drapeaux = args.filter((a) => a.startsWith("-")).join("");
    const tousVisibles = drapeaux.includes("a");
    const detaille = drapeaux.includes("l");
    const cible = args.find((a) => !a.startsWith("-")) || ".";
    const abs = fs.resolve(cible, machine.cwd);

    const noeud = fs.stat(abs); // lève une FsError claire si introuvable

    // ls sur un fichier : on affiche juste sa ligne.
    const entrees = noeud.type === "file" ? [noeud] : fs.list(abs, { all: tousVisibles });

    if (entrees.length === 0) {
      io.writeLine("[[gris]](dossier vide)[[/]]");
      return;
    }

    if (detaille) {
      for (const e of entrees) io.writeLine(ligneDetaillee(e));
      return;
    }
    io.writeLine(entrees.map(nomColore).join("   "));
  },
};

// ── Helpers d'affichage ───────────────────────────────────────────────────────

function nomColore(entree) {
  if (entree.name.startsWith(".")) return `[[cache]]${entree.name}[[/]]`;
  if (entree.type === "dir") return `[[dossier]]${entree.name}/[[/]]`;
  return `[[fichier]]${entree.name}[[/]]`;
}

function ligneDetaillee(entree) {
  const type = entree.type === "dir" ? "d" : "-";
  const droits = (entree.perms.r ? "r" : "-") + (entree.perms.w ? "w" : "-") + (entree.perms.x ? "x" : "-");
  const taille = entree.type === "dir" ? Object.keys(entree.children).length : entree.content.length;
  const date = (entree.mtime || "").slice(0, 16).replace("T", " ");
  return (
    `[[gris]]${type}${droits}[[/]]  ` +
    `${String(entree.owner).padEnd(10)}  ` +
    `[[gris]]${date}[[/]]  ` +
    `${String(taille).padStart(6)}  ` +
    nomColore(entree)
  );
}
