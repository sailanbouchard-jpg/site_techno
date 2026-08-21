/**
 * clear — efface l'écran du terminal.
 * Syntaxe : clear
 */

export default {
  name: "clear",
  aliases: ["cls"],
  description: "Efface l'écran",
  usage: "clear",

  run(ctx, _args) {
    ctx.io.clear();
  },
};
