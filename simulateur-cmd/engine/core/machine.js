/**
 * machine.js — La Machine, unité de base du simulateur.
 *
 * Une Machine = un ordinateur virtuel complet : système de fichiers, profil
 * (nom, utilisateur, accueil, thème), environnement, dossier courant, état.
 * Un terminal n'est qu'une VUE branchée sur une machine — plus tard, cliquer
 * sur un PC dans une carte réseau ouvrira un terminal sur sa machine.
 *
 * Tout l'état est sérialisable en JSON via serialize()/deserialize().
 * Cette couche ne connaît ni le shell, ni le DOM.
 */

import { VFS } from "./filesystem.js";
import { Environment } from "./environment.js";
import { EventEmitter } from "./events.js";

// ── Profil par défaut ─────────────────────────────────────────────────────────

const PROFIL_DEFAUT = {
  hostname: "machine",
  user: "utilisateur",
  motd: "Bienvenue. Tape [[jaune]]help[[/]] pour la liste des commandes.",
  bootLines: [
    "[[gris]]BIOS TECHNO v3 — auto-test…[[/]] [[ok]][ OK ][[/]]",
    "[[gris]]Chargement du système…[[/]] [[ok]][ OK ][[/]]",
    "[[vert]]Système prêt.[[/]]",
  ],
  promptFormat: "[[invite]]{user}@{hostname}[[/]]:[[cyan]]{cwd}[[/]][[invite]]$[[/]] ",
  theme: "hacker",
};

export class Machine {
  /**
   * Crée une machine neuve.
   * @param {object} profile  { hostname, user, motd, bootLines[], promptFormat, theme }
   * @param {object} [files]  Arborescence initiale, table plate :
   *                          { "/chemin/fichier.txt": "contenu", "/chemin/dossier/": null }
   *                          (valeur null ou clé finissant par « / » = dossier).
   */
  static create(profile = {}, files = null) {
    const machine = new Machine();
    machine.profile = { ...PROFIL_DEFAUT, ...profile };
    machine.fs = new VFS();
    machine.power = "off";
    machine.state = {}; // objet libre pour les drapeaux de progression
    machine.events = new EventEmitter(); // runtime uniquement, non sérialisé

    // Réservé pour la future simulation réseau (IP, interfaces…). Non utilisé.
    machine.network = null;

    // Squelette : /home/<user> est toujours présent.
    const home = `/home/${machine.profile.user}`;
    machine.fs.mkdir(home, { parents: true });
    machine.cwd = home;

    machine.env = new Environment({
      USER: machine.profile.user,
      HOSTNAME: machine.profile.hostname,
      HOME: home,
    });

    if (files) machine._seed(files);
    return machine;
  }

  /** Dossier personnel de l'utilisateur. */
  get home() {
    return this.env.get("HOME") || `/home/${this.profile.user}`;
  }

  /**
   * Invite de commande formatée depuis profile.promptFormat.
   * {user} {hostname} {cwd} sont substitués ; le home est contracté en « ~ ».
   * @returns {string} Texte balisé (voir markup.js).
   */
  prompt() {
    let cwd = this.cwd;
    if (cwd === this.home) cwd = "~";
    else if (cwd.startsWith(this.home + "/")) cwd = "~" + cwd.slice(this.home.length);
    return this.profile.promptFormat
      .replaceAll("{user}", this.profile.user)
      .replaceAll("{hostname}", this.profile.hostname)
      .replaceAll("{cwd}", cwd);
  }

  /** @returns {object} État complet, prêt pour JSON.stringify. */
  serialize() {
    return {
      profile: { ...this.profile },
      power: this.power,
      cwd: this.cwd,
      state: JSON.parse(JSON.stringify(this.state)),
      env: this.env.serialize(),
      fs: this.fs.serialize(),
    };
  }

  /** @param {object|string} json Restaure une machine identique. */
  static deserialize(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    const machine = new Machine();
    machine.profile = { ...PROFIL_DEFAUT, ...data.profile };
    machine.fs = VFS.deserialize(data.fs);
    machine.env = Environment.deserialize(data.env);
    machine.cwd = data.cwd || "/";
    machine.power = data.power || "off";
    machine.state = data.state ? JSON.parse(JSON.stringify(data.state)) : {};
    machine.events = new EventEmitter();
    machine.network = null;
    return machine;
  }

  // ── Interne ─────────────────────────────────────────────────────────────────

  /** Peuple le VFS depuis une table plate chemin → contenu. */
  _seed(files) {
    const by = this.profile.user;
    // Les dossiers d'abord, pour que les parents existent.
    const chemins = Object.keys(files).sort();
    for (const chemin of chemins) {
      const contenu = files[chemin];
      const estDossier = contenu === null || chemin.endsWith("/");
      const abs = this.fs.resolve(chemin, this.home);
      if (estDossier) {
        if (!this.fs.exists(abs)) this.fs.mkdir(abs, { by, parents: true });
      } else {
        const parent = this.fs.resolve(abs + "/..");
        if (!this.fs.exists(parent)) this.fs.mkdir(parent, { by, parents: true });
        this.fs.write(abs, contenu, { by });
      }
    }
  }
}
