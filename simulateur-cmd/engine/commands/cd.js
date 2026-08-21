/**
 * cd — change de dossier courant.
 * Syntaxe : cd [chemin]   (sans argument ou avec « ~ » : retour au dossier personnel)
 */

import { FsError } from "../core/filesystem.js";

export default {
  name: "cd",
  aliases: [],
  description: "Change de dossier courant",
  usage: "cd [chemin]",

  run(ctx, args) {
    const { fs, machine } = ctx;
    let cible = args[0] || "~";

    // Expansion du « ~ » vers le dossier personnel.
    if (cible === "~") cible = machine.home;
    else if (cible.startsWith("~/")) cible = machine.home + cible.slice(1);

    const abs = fs.resolve(cible, machine.cwd);
    const noeud = fs.stat(abs);
    if (noeud.type !== "dir") throw new FsError(`N'est pas un dossier : « ${abs} »`);
    if (!noeud.perms.x) throw new FsError(`Permission refusée : accès à « ${abs} »`);
    machine.cwd = abs;
  },
};
