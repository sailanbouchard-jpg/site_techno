/**
 * session.js — Session : une vue ouverte sur une machine.
 *
 * La session assemble machine + io + shell et porte l'état runtime propre à
 * cette vue (date d'ouverture, etc.). Un terminal DOM crée une session ; un
 * test headless aussi — c'est exactement le même objet.
 */

import { Shell } from "./shell.js";
import { stripMarkup } from "./markup.js";

export class Session {
  /**
   * @param {Machine} machine
   * @param {object}  io  Voir l'interface io dans shell.js.
   * @param {object}  [options]
   * @param {CommandRegistry} [options.registry]
   */
  static create(machine, io, { registry } = {}) {
    const session = new Session();
    session.machine = machine;
    session.io = io;
    session.startedAt = new Date().toISOString();
    session.shell = Shell.create(machine, io, { registry, session });
    return session;
  }

  /** Raccourci : exécute une ligne dans le shell de la session. */
  async execute(ligne) {
    return this.shell.execute(ligne);
  }

  /** Historique des lignes exécutées (utile aux validateurs de défis). */
  get history() {
    return this.shell.history;
  }
}

/**
 * io en mémoire pour les tests headless : capture la sortie en texte brut
 * (balises de style retirées), openEditor est un bouchon.
 * @returns {object} io + .texte() pour lire tout ce qui a été écrit.
 */
export function createMemoryIO() {
  const lignes = [""];
  const ajouter = (texte) => {
    lignes[lignes.length - 1] += stripMarkup(texte);
  };
  return {
    write(texte) {
      ajouter(texte);
    },
    writeLine(texte = "") {
      ajouter(texte);
      lignes.push("");
    },
    writeError(texte) {
      ajouter("[ERREUR] " + texte);
      lignes.push("");
    },
    clear() {
      lignes.length = 0;
      lignes.push("");
    },
    async openEditor(_path) {
      /* bouchon headless : l'éditeur n'existe que dans l'UI */
    },
    /** Toute la sortie capturée, en texte brut. */
    texte() {
      return lignes.join("\n");
    },
  };
}
