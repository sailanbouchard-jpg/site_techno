/**
 * pwd — affiche le dossier courant.
 * Syntaxe : pwd
 */

export default {
  name: "pwd",
  aliases: [],
  description: "Affiche le chemin du dossier courant",
  usage: "pwd",

  run(ctx, _args) {
    ctx.io.writeLine(ctx.machine.cwd);
  },
};
