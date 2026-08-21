/**
 * filesystem.js — Système de fichiers virtuel (VFS).
 *
 * Arbre de nœuds entièrement sérialisable en JSON :
 *   fichier : { type:'file', name, content, owner, perms:{r,w,x}, mtime, modifiedBy }
 *   dossier : { type:'dir',  name, owner, perms:{r,w,x}, mtime, modifiedBy, children:{} }
 *
 * Toutes les erreurs sont des FsError avec un message clair en français.
 * Cette couche ne connaît ni le shell, ni le DOM.
 */

export class FsError extends Error {}

// ── Constantes ────────────────────────────────────────────────────────────────

const PROPRIETAIRE_DEFAUT = "systeme";

// ── Helpers de création de nœuds ──────────────────────────────────────────────

function maintenant() {
  return new Date().toISOString();
}

function permsDefaut() {
  return { r: true, w: true, x: true };
}

/** Crée un nœud fichier prêt à insérer dans l'arbre. */
export function creerFichier({ name, content = "", owner = PROPRIETAIRE_DEFAUT, perms = null, mtime = null, modifiedBy = null } = {}) {
  return {
    type: "file",
    name,
    content,
    owner,
    perms: perms || permsDefaut(),
    mtime: mtime || maintenant(),
    modifiedBy: modifiedBy || owner,
  };
}

/** Crée un nœud dossier prêt à insérer dans l'arbre. */
export function creerDossier({ name, owner = PROPRIETAIRE_DEFAUT, perms = null, mtime = null, modifiedBy = null } = {}) {
  return {
    type: "dir",
    name,
    owner,
    perms: perms || permsDefaut(),
    mtime: mtime || maintenant(),
    modifiedBy: modifiedBy || owner,
    children: {},
  };
}

// ── VFS ───────────────────────────────────────────────────────────────────────

export class VFS {
  /** @param {object|null} root Nœud racine existant (sinon une racine vide est créée). */
  constructor(root = null) {
    this.root = root || creerDossier({ name: "/" });
  }

  /**
   * Normalise un chemin en chemin absolu. Gère « . », « .. », les slashs
   * multiples et le slash final. Ne vérifie PAS l'existence.
   * @param {string} path   Chemin absolu ou relatif.
   * @param {string} cwd    Dossier courant servant de base pour les relatifs.
   * @returns {string}      Chemin absolu normalisé (sans slash final, sauf « / »).
   */
  resolve(path, cwd = "/") {
    const brut = path === "" || path == null ? "." : String(path);
    const complet = brut.startsWith("/") ? brut : `${cwd}/${brut}`;
    const pile = [];
    for (const segment of complet.split("/")) {
      if (segment === "" || segment === ".") continue;
      if (segment === "..") pile.pop();
      else pile.push(segment);
    }
    return "/" + pile.join("/");
  }

  /** @returns {boolean} Vrai si le chemin (absolu) existe. */
  exists(path) {
    return this._noeud(this.resolve(path)) !== null;
  }

  /**
   * Métadonnées d'un nœud.
   * @throws {FsError} si le chemin n'existe pas.
   */
  stat(path) {
    const abs = this.resolve(path);
    const noeud = this._noeud(abs);
    if (!noeud) throw new FsError(`Chemin introuvable : « ${abs} »`);
    return noeud;
  }

  /**
   * Liste les entrées d'un dossier, dossiers d'abord puis ordre alphabétique.
   * @param {string}  path
   * @param {object}  [options]
   * @param {boolean} [options.all=false] Inclut les entrées cachées (préfixe « . »).
   * @returns {object[]} Les nœuds enfants.
   */
  list(path, { all = false } = {}) {
    const noeud = this.stat(path);
    if (noeud.type !== "dir") throw new FsError(`N'est pas un dossier : « ${this.resolve(path)} »`);
    if (!noeud.perms.r) throw new FsError(`Permission refusée : lecture de « ${this.resolve(path)} »`);
    return Object.values(noeud.children)
      .filter((e) => all || !e.name.startsWith("."))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name, "fr");
      });
  }

  /**
   * Contenu texte d'un fichier.
   * @throws {FsError} chemin introuvable, pas un fichier, ou lecture interdite.
   */
  read(path) {
    const abs = this.resolve(path);
    const noeud = this.stat(abs);
    if (noeud.type !== "file") throw new FsError(`N'est pas un fichier : « ${abs} »`);
    if (!noeud.perms.r) throw new FsError(`Permission refusée : lecture de « ${abs} »`);
    return noeud.content;
  }

  /**
   * Écrit (ou crée) un fichier et met à jour mtime + modifiedBy.
   * @param {string} path
   * @param {string} content
   * @param {object} [options]
   * @param {string} [options.by] Auteur de la modification.
   */
  write(path, content, { by = PROPRIETAIRE_DEFAUT } = {}) {
    const abs = this.resolve(path);
    const existant = this._noeud(abs);
    if (existant && existant.type === "dir") throw new FsError(`Est un dossier : « ${abs} »`);
    if (existant) {
      if (!existant.perms.w) throw new FsError(`Permission refusée : écriture dans « ${abs} »`);
      existant.content = String(content);
      existant.mtime = maintenant();
      existant.modifiedBy = by;
      return;
    }
    const { parent, nom } = this._parentDe(abs);
    if (!parent.perms.w) throw new FsError(`Permission refusée : écriture dans « ${this.resolve(abs + "/..")} »`);
    parent.children[nom] = creerFichier({ name: nom, content: String(content), owner: by, modifiedBy: by });
  }

  /**
   * Crée un dossier.
   * @param {object}  [options]
   * @param {string}  [options.by]            Auteur.
   * @param {boolean} [options.parents=false] Crée aussi les dossiers intermédiaires.
   */
  mkdir(path, { by = PROPRIETAIRE_DEFAUT, parents = false } = {}) {
    const abs = this.resolve(path);
    if (abs === "/") return;
    if (this._noeud(abs)) throw new FsError(`Existe déjà : « ${abs} »`);
    if (parents) {
      // Crée la chaîne segment par segment.
      let courant = "/";
      for (const segment of abs.split("/").filter(Boolean)) {
        courant = this.resolve(segment, courant);
        const noeud = this._noeud(courant);
        if (noeud && noeud.type !== "dir") throw new FsError(`N'est pas un dossier : « ${courant} »`);
        if (!noeud) this.mkdir(courant, { by });
      }
      return;
    }
    const { parent, nom } = this._parentDe(abs);
    if (!parent.perms.w) throw new FsError(`Permission refusée : écriture dans le dossier parent de « ${abs} »`);
    parent.children[nom] = creerDossier({ name: nom, owner: by, modifiedBy: by });
  }

  /**
   * Supprime un fichier, ou un dossier si recursive est vrai.
   * @param {object}  [options]
   * @param {boolean} [options.recursive=false]
   */
  rm(path, { recursive = false } = {}) {
    const abs = this.resolve(path);
    if (abs === "/") throw new FsError("Impossible de supprimer la racine « / »");
    const noeud = this.stat(abs);
    if (noeud.type === "dir" && !recursive) {
      throw new FsError(`Est un dossier : « ${abs} » (utilise rm -r)`);
    }
    const { parent, nom } = this._parentDe(abs);
    if (!parent.perms.w) throw new FsError(`Permission refusée : suppression dans « ${abs} »`);
    delete parent.children[nom];
  }

  /** @returns {object} Copie profonde de l'arbre, prête pour JSON.stringify. */
  serialize() {
    return JSON.parse(JSON.stringify(this.root));
  }

  /** @param {object|string} json Arbre sérialisé (objet ou chaîne JSON). */
  static deserialize(json) {
    const racine = typeof json === "string" ? JSON.parse(json) : json;
    return new VFS(JSON.parse(JSON.stringify(racine)));
  }

  // ── Interne ─────────────────────────────────────────────────────────────────

  /** Descend l'arbre depuis la racine. @returns {object|null} */
  _noeud(abs) {
    if (abs === "/") return this.root;
    let courant = this.root;
    for (const segment of abs.split("/").filter(Boolean)) {
      if (!courant || courant.type !== "dir") return null;
      courant = courant.children[segment] || null;
    }
    return courant;
  }

  /** Parent d'un chemin absolu. @throws {FsError} si le parent n'existe pas. */
  _parentDe(abs) {
    const segments = abs.split("/").filter(Boolean);
    const nom = segments.pop();
    const chemin = "/" + segments.join("/");
    const parent = this._noeud(chemin);
    if (!parent) throw new FsError(`Chemin introuvable : « ${chemin} »`);
    if (parent.type !== "dir") throw new FsError(`N'est pas un dossier : « ${chemin} »`);
    return { parent, nom };
  }
}
