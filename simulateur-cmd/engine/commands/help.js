/**
 * help — liste les commandes, ou détaille une commande.
 * Syntaxe : help | help <commande>
 */

export default {
  name: "help",
  aliases: ["aide", "?"],
  description: "Affiche la liste des commandes, ou l'aide d'une commande",
  usage: "help [commande]",

  run(ctx, args) {
    const { io, registry } = ctx;

    // ── Détail d'une commande ──
    if (args.length > 0) {
      const commande = registry.get(args[0]);
      if (!commande) {
        io.writeError(`Commande inconnue : ${args[0]}`);
        return;
      }
      io.writeLine(`[[titre]]### AIDE : ${commande.name} ###[[/]]`);
      io.writeLine(`  ${commande.description}`);
      io.writeLine(`  [[gris]]Syntaxe :[[/]] [[jaune]]${commande.usage}[[/]]`);
      if (commande.aliases && commande.aliases.length > 0) {
        io.writeLine(`  [[gris]]Alias   :[[/]] ${commande.aliases.join(", ")}`);
      }
      return;
    }

    // ── Liste complète ──
    io.writeLine("");
    io.writeLine("[[titre]]╔══════════════[ AIDE — COMMANDES ]══════════════╗[[/]]");
    for (const commande of registry.list()) {
      const nom = commande.name.padEnd(10, " ");
      io.writeLine(`  [[vert]]${nom}[[/]] ${commande.description}`);
    }
    io.writeLine("[[titre]]╚═════════════════════════════════════════════════╝[[/]]");
    io.writeLine("[[gris]]Astuce : help <commande> pour le détail.[[/]]");
    io.writeLine("");
  },
};
