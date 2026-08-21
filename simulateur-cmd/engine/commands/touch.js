/**
 * touch — crée un fichier vide (ou met à jour sa date s'il existe).
 * Syntaxe : touch <fichier>
 */

export default {
  name: "touch",
  aliases: [],
  description: "Crée un fichier vide",
  usage: "touch <fichier>",

  run(ctx, args) {
    const { io, fs, machine } = ctx;
    const cibles = args.filter((a) => !a.startsWith("-"));
    if (cibles.length === 0) {
      io.writeError("Utilisation : touch <fichier>");
      return;
    }
    for (const chemin of cibles) {
      const abs = fs.resolve(chemin, machine.cwd);
      // S'il existe : réécrire son contenu à l'identique met à jour mtime.
      const contenu = fs.exists(abs) ? fs.read(abs) : "";
      fs.write(abs, contenu, { by: machine.profile.user });
    }
  },
};
