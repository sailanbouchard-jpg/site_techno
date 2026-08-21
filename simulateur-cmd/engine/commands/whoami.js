/**
 * whoami — affiche le nom de l'utilisateur connecté.
 * Syntaxe : whoami
 */

export default {
  name: "whoami",
  aliases: [],
  description: "Affiche le nom de l'utilisateur",
  usage: "whoami",

  run(ctx, _args) {
    ctx.io.writeLine(ctx.machine.profile.user);
  },
};
