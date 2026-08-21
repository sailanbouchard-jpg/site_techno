/**
 * echo — affiche un texte.
 * Syntaxe : echo [texte…]
 */

export default {
  name: "echo",
  aliases: [],
  description: "Affiche un texte à l'écran",
  usage: "echo [texte…]",

  run(ctx, args) {
    ctx.io.writeLine(args.join(" "));
  },
};
