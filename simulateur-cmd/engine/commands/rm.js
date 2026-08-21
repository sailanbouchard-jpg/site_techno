/**
 * rm — supprime un fichier, ou un dossier avec -r.
 * Syntaxe : rm [-r] <chemin>
 */

export default {
  name: "rm",
  aliases: ["del"],
  description: "Supprime un fichier (ou un dossier avec -r)",
  usage: "rm [-r] <chemin>",

  run(ctx, args) {
    const { io, fs, machine } = ctx;
    const recursive = args.some((a) => a.startsWith("-") && a.includes("r"));
    const cibles = args.filter((a) => !a.startsWith("-"));
    if (cibles.length === 0) {
      io.writeError("Utilisation : rm [-r] <chemin>");
      return;
    }
    for (const chemin of cibles) {
      const abs = fs.resolve(chemin, machine.cwd);
      fs.rm(abs, { recursive });
      // Si on vient de supprimer le dossier où l'on se trouvait, on remonte.
      if (machine.cwd === abs || machine.cwd.startsWith(abs + "/")) {
        machine.cwd = fs.resolve(abs + "/..");
      }
    }
  },
};
