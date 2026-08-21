/**
 * command-registry.js — Registre des commandes.
 *
 * Une commande = {
 *   name,            // ex. 'ls'
 *   aliases: [],     // optionnel
 *   description,     // une ligne, affichée par help
 *   usage,           // ex. 'ls [-a] [-l] [chemin]'
 *   run(ctx, args)   // -> void | Promise<void> — n'écrit QUE via ctx.io
 * }
 *
 * Ajouter une commande = un fichier dans /commands/ + une ligne dans index.js.
 * Le cœur du moteur n'est jamais modifié.
 */

export class CommandRegistry {
  constructor() {
    this._commandes = new Map(); // nom → commande
    this._alias = new Map();     // alias → nom
  }

  /** Enregistre une commande (et ses alias). */
  register(commande) {
    if (!commande || !commande.name || typeof commande.run !== "function") {
      throw new Error("Commande invalide : il faut au minimum { name, run }");
    }
    this._commandes.set(commande.name, commande);
    for (const alias of commande.aliases || []) this._alias.set(alias, commande.name);
  }

  /**
   * Retrouve une commande par nom ou alias.
   * @returns {object|null}
   */
  get(nom) {
    const reel = this._alias.get(nom) || nom;
    return this._commandes.get(reel) || null;
  }

  /** @returns {object[]} Toutes les commandes, triées par nom. */
  list() {
    return [...this._commandes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

/**
 * Registre par défaut, peuplé par engine.js avec les commandes de base.
 * Les pages qui veulent un registre isolé peuvent créer le leur.
 */
export const defaultRegistry = new CommandRegistry();
