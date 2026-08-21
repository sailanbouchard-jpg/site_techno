/**
 * engine.js — POINT D'ENTRÉE PUBLIC du simulateur.
 *
 * Assemble le registre par défaut avec les commandes de base et ré-exporte
 * tout ce dont une page (démo ou défi) a besoin. Une page de défi n'importe
 * QUE ce fichier (plus sa propre définition de défi).
 *
 *   import { Machine, Terminal, Challenge, LocalStorageAdapter } from '…/engine.js'
 */

import { defaultRegistry } from "./core/command-registry.js";
import { registerCoreCommands } from "./commands/index.js";

// Peuple le registre global une seule fois, à l'import.
registerCoreCommands(defaultRegistry);

// ── Noyau ──
export { Machine } from "./core/machine.js";
export { VFS, FsError, creerFichier, creerDossier } from "./core/filesystem.js";
export { Environment } from "./core/environment.js";
export { Shell, decouperLigne } from "./core/shell.js";
export { Session, createMemoryIO } from "./core/session.js";
export { CommandRegistry, defaultRegistry } from "./core/command-registry.js";
export { EventEmitter } from "./core/events.js";
export { PersistenceAdapter, LocalStorageAdapter, NullAdapter } from "./core/persistence.js";
export { renderInline, stripMarkup, escapeHtml } from "./core/markup.js";
export { registerCoreCommands } from "./commands/index.js";

// ── UI (seule couche qui touche le DOM — ne pas importer en headless…
//    l'import est sans effet DOM, mais Terminal.mount exige un navigateur) ──
export { Terminal } from "./ui/terminal.js";
export { Editor } from "./ui/editor.js";

// ── Défis ──
export { Challenge, buildMachineFromSeed } from "./challenge/challenge.js";
