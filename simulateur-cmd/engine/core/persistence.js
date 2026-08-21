/**
 * persistence.js — Adaptateurs de persistance.
 *
 * Le moteur appelle load()/save() sans jamais savoir s'il parle à
 * localStorage, au backend du site, ou à rien du tout. C'est le point de
 * couture avec les comptes élèves : en production, on écrira un adaptateur
 * qui fait fetch('/api/…') avec la même interface, sans toucher au moteur.
 */

/**
 * Interface de référence. Un adaptateur doit fournir :
 *   load(key) -> Promise<object|null>
 *   save(key, data) -> Promise<void>
 */
export class PersistenceAdapter {
  async load(_key) {
    throw new Error("PersistenceAdapter.load() doit être implémenté");
  }

  async save(_key, _data) {
    throw new Error("PersistenceAdapter.save() doit être implémenté");
  }
}

/** Adaptateur localStorage — pour le développement et les tests navigateur. */
export class LocalStorageAdapter extends PersistenceAdapter {
  /** @param {string} [prefix] Préfixe des clés pour ne pas polluer le stockage. */
  constructor(prefix = "simulateur-cmd:") {
    super();
    this.prefix = prefix;
  }

  async load(key) {
    const brut = localStorage.getItem(this.prefix + key);
    if (brut == null) return null;
    try {
      return JSON.parse(brut);
    } catch {
      return null; // sauvegarde corrompue → on repart de zéro
    }
  }

  async save(key, data) {
    if (data == null) localStorage.removeItem(this.prefix + key);
    else localStorage.setItem(this.prefix + key, JSON.stringify(data));
  }
}

/** Adaptateur nul — ne sauvegarde rien (tests headless). */
export class NullAdapter extends PersistenceAdapter {
  async load(_key) {
    return null;
  }

  async save(_key, _data) {
    /* volontairement vide */
  }
}
