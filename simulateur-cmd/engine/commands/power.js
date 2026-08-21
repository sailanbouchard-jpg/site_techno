/**
 * power — cycle de vie de la machine : poweron / poweroff / reboot.
 *
 * Les commandes changent l'état de la machine et émettent un événement ;
 * l'UI (si elle existe) écoute ces événements pour jouer les animations
 * de démarrage/extinction. En headless, seuls les états changent.
 */

export const poweron = {
  name: "poweron",
  aliases: ["boot"],
  description: "Allume la machine",
  usage: "poweron",

  run(ctx, _args) {
    const { machine, io } = ctx;
    if (machine.power === "on") {
      io.writeLine("La machine est déjà allumée.");
      return;
    }
    machine.power = "on";
    machine.events.emit("power:on");
  },
};

export const poweroff = {
  name: "poweroff",
  aliases: ["shutdown", "exit"],
  description: "Éteint la machine",
  usage: "poweroff",

  run(ctx, _args) {
    const { machine, io } = ctx;
    io.writeLine("[[gris]]Arrêt du système…[[/]]");
    machine.power = "off";
    machine.events.emit("power:off");
  },
};

export const reboot = {
  name: "reboot",
  aliases: ["restart"],
  description: "Redémarre la machine",
  usage: "reboot",

  run(ctx, _args) {
    const { machine, io } = ctx;
    io.writeLine("[[gris]]Redémarrage…[[/]]");
    // La machine reste allumée : l'UI joue extinction + boot via l'événement.
    machine.events.emit("power:reboot");
  },
};

export default [poweron, poweroff, reboot];
