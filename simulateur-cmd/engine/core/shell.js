/**
 * shell.js — Le shell : lit une ligne, la découpe, exécute la commande.
 *
 * Ne connaît pas le DOM. Écrit uniquement via l'objet io fourni, qui doit
 * exposer : write(text), writeLine(text), writeError(text), clear(),
 * openEditor(path) -> Promise<void>.
 */

import { defaultRegistry } from "./command-registry.js";
import { FsError } from "./filesystem.js";

export class Shell {
  /**
   * @param {Machine} machine  La machine sur laquelle tourne le shell.
   * @param {object}  io       Flux d'entrée/sortie (voir en-tête).
   * @param {object}  [options]
   * @param {CommandRegistry} [options.registry] Registre (défaut : registre global).
   * @param {object}  [options.session]          Session propriétaire (posée par Session.create).
   */
  static create(machine, io, { registry = defaultRegistry, session = null } = {}) {
    const shell = new Shell();
    shell.machine = machine;
    shell.io = io;
    shell.registry = registry;
    shell.session = session;
    shell.history = []; // lignes exécutées, dans l'ordre
    return shell;
  }

  /**
   * Exécute une ligne complète : découpe, dispatch, gestion des erreurs.
   * Une commande inconnue ou une FsError produit un message clair, jamais
   * une exception brute.
   * @param {string} line
   */
  async execute(line) {
    const propre = String(line).trim();
    if (propre === "") return;
    this.history.push(propre);

    let tokens;
    try {
      tokens = decouperLigne(propre);
    } catch (e) {
      this.io.writeError(e.message);
      return;
    }
    const [nom, ...args] = tokens;

    // Machine éteinte : seule la commande d'allumage répond.
    if (this.machine.power === "off" && nom !== "poweron") {
      this.io.writeError("La machine est éteinte. Tape « poweron » pour la démarrer.");
      return;
    }

    const commande = this.registry.get(nom);
    if (!commande) {
      this.io.writeError(`Commande introuvable : ${nom}. Tape [[jaune]]help[[/]] pour la liste.`);
      return;
    }

    const ctx = this._contexte();
    try {
      await commande.run(ctx, args);
    } catch (e) {
      if (e instanceof FsError) this.io.writeError(e.message);
      else this.io.writeError(`Erreur interne (${nom}) : ${e.message}`);
    }
  }

  // ── Interne ─────────────────────────────────────────────────────────────────

  /**
   * Contexte d'exécution passé à chaque commande. C'est LE point d'extension :
   * la future simulation réseau remplira ctx.network sans rien changer d'autre.
   */
  _contexte() {
    return {
      machine: this.machine,
      session: this.session,
      fs: this.machine.fs,
      env: this.machine.env,
      registry: this.registry,
      io: this.io,
      network: this.machine.network, // RÉSERVÉ — null pour l'instant
    };
  }
}

/**
 * Découpe une ligne en tokens. Les guillemets simples et doubles permettent
 * de grouper des mots ("mon fichier.txt").
 * @throws {Error} si un guillemet n'est pas refermé.
 */
export function decouperLigne(ligne) {
  const tokens = [];
  let courant = "";
  let guillemet = null;
  let vide = false; // vrai si "" explicite (token vide volontaire)
  for (const c of ligne) {
    if (guillemet) {
      if (c === guillemet) guillemet = null;
      else courant += c;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      vide = true;
    } else if (c === " " || c === "\t") {
      if (courant !== "" || vide) {
        tokens.push(courant);
        courant = "";
        vide = false;
      }
    } else {
      courant += c;
    }
  }
  if (guillemet) throw new Error("Guillemet non refermé dans la commande.");
  if (courant !== "" || vide) tokens.push(courant);
  return tokens;
}
