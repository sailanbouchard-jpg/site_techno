/**
 * cat — affiche le contenu d'un ou plusieurs fichiers.
 * Syntaxe : cat <fichier> [fichier2…]
 */

export default {
  name: "cat",
  aliases: ["lire"],
  description: "Affiche le contenu d'un fichier",
  usage: "cat <fichier> [fichier2…]",

  run(ctx, args) {
    const { io, fs, machine } = ctx;
    const fichiers = args.filter((a) => !a.startsWith("-"));
    if (fichiers.length === 0) {
      io.writeError("Utilisation : cat <fichier>");
      return;
    }
    for (const chemin of fichiers) {
      const abs = fs.resolve(chemin, machine.cwd);
      const contenu = fs.read(abs); // FsError claire si introuvable / pas un fichier
      for (const ligne of contenu.split("\n")) io.writeLine(ligne);
    }
  },
};
