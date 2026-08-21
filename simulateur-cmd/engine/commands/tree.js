/**
 * tree — affiche l'arborescence d'un dossier.
 * Syntaxe : tree [-a] [chemin]
 *   -a : montre aussi les entrées cachées
 */

export default {
  name: "tree",
  aliases: [],
  description: "Affiche l'arborescence des dossiers et fichiers",
  usage: "tree [-a] [chemin]",

  run(ctx, args) {
    const { io, fs, machine } = ctx;
    const tousVisibles = args.some((a) => a.startsWith("-") && a.includes("a"));
    const cible = args.find((a) => !a.startsWith("-")) || ".";
    const abs = fs.resolve(cible, machine.cwd);
    fs.stat(abs); // FsError claire si introuvable

    io.writeLine(`[[dossier]]${abs === "/" ? "/" : abs.split("/").pop()}/[[/]]`);
    const compteur = { dossiers: 0, fichiers: 0 };
    dessiner(fs, abs, "", tousVisibles, io, compteur);
    io.writeLine(`[[gris]]${compteur.dossiers} dossier(s), ${compteur.fichiers} fichier(s)[[/]]`);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function dessiner(fs, chemin, prefixe, tousVisibles, io, compteur) {
  const entrees = fs.list(chemin, { all: tousVisibles });
  entrees.forEach((entree, i) => {
    const dernier = i === entrees.length - 1;
    const branche = dernier ? "└── " : "├── ";
    const suite = dernier ? "    " : "│   ";
    if (entree.type === "dir") {
      compteur.dossiers++;
      io.writeLine(`[[gris]]${prefixe}${branche}[[/]][[dossier]]${entree.name}/[[/]]`);
      dessiner(fs, `${chemin}/${entree.name}`, prefixe + suite, tousVisibles, io, compteur);
    } else {
      compteur.fichiers++;
      const style = entree.name.startsWith(".") ? "cache" : "fichier";
      io.writeLine(`[[gris]]${prefixe}${branche}[[/]][[${style}]]${entree.name}[[/]]`);
    }
  });
}
