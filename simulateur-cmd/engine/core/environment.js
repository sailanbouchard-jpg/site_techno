/**
 * environment.js — Variables d'environnement d'une machine.
 *
 * Simple table clé → valeur, sérialisable en JSON.
 */

export class Environment {
  /** @param {object} [vars] Variables initiales. */
  constructor(vars = {}) {
    this._vars = { ...vars };
  }

  /** @returns {string|undefined} */
  get(nom) {
    return this._vars[nom];
  }

  set(nom, valeur) {
    this._vars[nom] = String(valeur);
  }

  unset(nom) {
    delete this._vars[nom];
  }

  /** @returns {object} Copie de toutes les variables. */
  all() {
    return { ...this._vars };
  }

  /** @returns {object} Prêt pour JSON.stringify. */
  serialize() {
    return { ...this._vars };
  }

  /** @param {object|string} json */
  static deserialize(json) {
    const vars = typeof json === "string" ? JSON.parse(json) : json;
    return new Environment(vars || {});
  }
}
