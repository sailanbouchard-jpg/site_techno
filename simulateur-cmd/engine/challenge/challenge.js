/**
 * challenge.js — Modèle de défi : niveaux, validation, progression, persistance.
 *
 * Un défi = une machine + une liste de niveaux à franchir dans l'ordre.
 * Deux modes de validation par niveau :
 *   - par drapeau : l'élève saisit un code, validate() le compare ;
 *   - par état atteint : validate() inspecte la machine (fichier présent,
 *     contenu correct, cwd…). C'est ce mode qui prépare les défis futurs
 *     (« se connecter au wifi » = atteindre un état, sans flag).
 *
 * Persistance : UNIQUEMENT à la réussite d'un niveau. Un élève qui recharge
 * en cours de niveau repart au début de ce niveau, sur l'état sauvegardé à
 * la fin du niveau précédent.
 *
 * Niveau attendu :
 *   { id, title, brief, hints:[…], mode:'flag'|'etat',
 *     validate(ctx, submission) -> bool|Promise<bool>,   ctx = { machine, session }
 *     onEnter(machine)  // optionnel : prépare la machine à l'entrée du niveau
 *   }
 */

import { Machine } from "../core/machine.js";
import { EventEmitter } from "../core/events.js";
import { NullAdapter } from "../core/persistence.js";

export class Challenge {
  /**
   * @param {object} config
   * @param {string} config.id           Identifiant du défi (ex. '00-prise-en-main').
   * @param {string} config.title        Titre affiché.
   * @param {string} config.studentId    Identifiant de l'élève (compte du site, ou valeur factice en dev).
   * @param {object} config.adapter      Adaptateur de persistance (LocalStorageAdapter, backend…).
   * @param {object} config.machineSeed  { profile, files } — machine de départ.
   * @param {object[]} config.levels     Niveaux, dans l'ordre.
   */
  static create({ id, title, studentId, adapter = null, machineSeed, levels }) {
    const defi = new Challenge();
    defi.id = id;
    defi.title = title;
    defi.studentId = studentId;
    defi.adapter = adapter || new NullAdapter();
    defi.machineSeed = machineSeed;
    defi.levels = levels;
    defi.events = new EventEmitter();
    defi.machine = null;
    defi.session = null;
    defi.currentLevelIndex = 0;
    defi.completedLevels = [];
    defi._indicesReveles = {}; // levelId → nombre d'indices déjà montrés
    return defi;
  }

  /** Clé de sauvegarde : un enregistrement par élève et par défi. */
  get storageKey() {
    return `${this.studentId}:${this.id}`;
  }

  /** Vrai quand tous les niveaux sont réussis. */
  get done() {
    return this.currentLevelIndex >= this.levels.length;
  }

  /** Niveau en cours (ou null si le défi est terminé). */
  get currentLevel() {
    return this.done ? null : this.levels[this.currentLevelIndex];
  }

  /**
   * Charge la sauvegarde s'il y en a une, sinon construit la machine de départ.
   * Émet 'level:enter' (ou 'challenge:complete' si tout était déjà fini).
   * @returns {Promise<Challenge>} this
   */
  async init() {
    const sauvegarde = await this.adapter.load(this.storageKey);
    if (sauvegarde && sauvegarde.machineState) {
      this.machine = Machine.deserialize(sauvegarde.machineState);
      this.currentLevelIndex = sauvegarde.currentLevelIndex ?? 0;
      this.completedLevels = sauvegarde.completedLevels || [];
    } else {
      this.machine = buildMachineFromSeed(this.machineSeed);
      this.currentLevelIndex = 0;
      this.completedLevels = [];
      this.currentLevel?.onEnter?.(this.machine);
    }
    if (this.done) this.events.emit("challenge:complete", { challenge: this });
    else this.events.emit("level:enter", { level: this.currentLevel, index: this.currentLevelIndex });
    return this;
  }

  /** Branche la session du terminal (utilisée par les validateurs d'état). */
  attachSession(session) {
    this.session = session;
  }

  /**
   * Révèle l'indice suivant du niveau courant.
   * @returns {string|null} L'indice, ou null s'il n'y en a plus.
   */
  revealHint() {
    const niveau = this.currentLevel;
    if (!niveau || !niveau.hints) return null;
    const deja = this._indicesReveles[niveau.id] || 0;
    if (deja >= niveau.hints.length) return null;
    this._indicesReveles[niveau.id] = deja + 1;
    return niveau.hints[deja];
  }

  /** Indices déjà révélés pour le niveau courant. */
  get revealedHints() {
    const niveau = this.currentLevel;
    if (!niveau || !niveau.hints) return [];
    return niveau.hints.slice(0, this._indicesReveles[niveau.id] || 0);
  }

  /**
   * Soumet une tentative pour le niveau courant (flag saisi, ou rien pour
   * une validation par état). En cas de succès : avance, prépare le niveau
   * suivant (onEnter), puis sauvegarde — et seulement là.
   * @param {string} [submission]
   * @returns {Promise<{success:boolean, done:boolean}>}
   */
  async submit(submission = "") {
    if (this.done) return { success: true, done: true };
    const niveau = this.currentLevel;
    const ctx = { machine: this.machine, session: this.session };

    const reussi = await niveau.validate(ctx, submission);
    if (!reussi) return { success: false, done: false };

    this.completedLevels.push(niveau.id);
    this.events.emit("level:complete", { level: niveau, index: this.currentLevelIndex });

    this.currentLevelIndex++;
    // onEnter AVANT la sauvegarde : ainsi l'état préparé du niveau suivant
    // fait partie de ce qui est restauré au rechargement.
    if (!this.done) this.currentLevel.onEnter?.(this.machine);
    await this.save();

    if (this.done) this.events.emit("challenge:complete", { challenge: this });
    else this.events.emit("level:enter", { level: this.currentLevel, index: this.currentLevelIndex });
    return { success: true, done: this.done };
  }

  /** Sauvegarde le payload complet (appelée uniquement par submit). */
  async save() {
    await this.adapter.save(this.storageKey, {
      challengeId: this.id,
      studentId: this.studentId,
      currentLevelIndex: this.currentLevelIndex,
      completedLevels: [...this.completedLevels],
      machineState: this.machine.serialize(),
    });
  }

  /** Efface la sauvegarde et reconstruit la machine de départ (dev/enseignant). */
  async reset() {
    await this.adapter.save(this.storageKey, null);
    this.machine = buildMachineFromSeed(this.machineSeed);
    this.currentLevelIndex = 0;
    this.completedLevels = [];
    this._indicesReveles = {};
    this.currentLevel?.onEnter?.(this.machine);
    this.events.emit("level:enter", { level: this.currentLevel, index: this.currentLevelIndex });
  }
}

/**
 * Construit une machine depuis une graine { profile, files }.
 * @param {object} seed
 * @returns {Machine}
 */
export function buildMachineFromSeed(seed) {
  return Machine.create(seed.profile || {}, seed.files || null);
}
