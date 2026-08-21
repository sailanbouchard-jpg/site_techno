/**
 * mkdir — crée un dossier.
 * Syntaxe : mkdir <dossier>
 */

export default {
  name: "mkdir",
  aliases: [],
  description: "Crée un dossier",
  usage: "mkdir <dossier>",

  run(ctx, args) {
    const { io, fs, machine } = ctx;
    const cibles = args.filter((a) => !a.startsWith("-"));
    if (cibles.length === 0) {
      io.writeError("Utilisation : mkdir <dossier>");
      return;
    }
    for (const chemin of cibles) {
      const abs = fs.resolve(chemin, machine.cwd);
      fs.mkdir(abs, { by: machine.profile.user });
    }
  },
};
