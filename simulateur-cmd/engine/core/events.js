/**
 * events.js — Mini émetteur d'événements.
 *
 * Utilisé par les machines (power:on, power:off, power:reboot) et par les
 * défis (level:complete, level:enter, challenge:complete).
 * Aucune dépendance, aucun DOM.
 */

export class EventEmitter {
  constructor() {
    this._auditeurs = new Map(); // nom → Set<fonction>
  }

  /**
   * Abonne une fonction à un événement.
   * @returns {Function} Fonction de désabonnement.
   */
  on(nom, fn) {
    if (!this._auditeurs.has(nom)) this._auditeurs.set(nom, new Set());
    this._auditeurs.get(nom).add(fn);
    return () => this.off(nom, fn);
  }

  /** Désabonne une fonction. */
  off(nom, fn) {
    this._auditeurs.get(nom)?.delete(fn);
  }

  /** Abonne pour une seule occurrence. */
  once(nom, fn) {
    const desabonner = this.on(nom, (...args) => {
      desabonner();
      fn(...args);
    });
    return desabonner;
  }

  /** Émet un événement vers tous les abonnés. */
  emit(nom, ...args) {
    for (const fn of this._auditeurs.get(nom) || []) fn(...args);
  }
}
