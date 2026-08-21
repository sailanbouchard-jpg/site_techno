/**
 * edit — ouvre l'éditeur plein écran sur un fichier.
 * Syntaxe : edit <fichier>
 *
 * Seul pont autorisé entre une commande et l'UI : io.openEditor(path).
 * En mode headless, openEditor est un bouchon qui ne fait rien.
 */

import { FsError } from "../core/filesystem.js";

export default {
  name: "edit",
  aliases: ["nano", "vim"],
  description: "Ouvre un fichier dans l'éditeur de texte",
  usage: "edit <fichier>",

  async run(ctx, args) {
    const { io, fs, machine } = ctx;
    const cible = args.find((a) => !a.startsWith("-"));
    if (!cible) {
      io.writeError("Utilisation : edit <fichier>");
      return;
    }
    const abs = fs.resolve(cible, machine.cwd);
    if (fs.exists(abs) && fs.stat(abs).type === "dir") {
      throw new FsError(`Est un dossier : « ${abs} »`);
    }
    // Le fichier peut ne pas exister encore, mais son dossier parent doit exister.
    const parent = fs.resolve(abs + "/..");
    if (!fs.exists(parent)) throw new FsError(`Chemin introuvable : « ${parent} »`);

    await io.openEditor(abs);
  },
};
