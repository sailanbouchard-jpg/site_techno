/**
 * index.js — Enregistre toutes les commandes de base.
 *
 * Ajouter une commande = créer son fichier dans /commands/ puis l'ajouter
 * à la liste ci-dessous. Rien d'autre à modifier.
 */

import help from "./help.js";
import pwd from "./pwd.js";
import ls from "./ls.js";
import cd from "./cd.js";
import cat from "./cat.js";
import mkdir from "./mkdir.js";
import touch from "./touch.js";
import rm from "./rm.js";
import echo from "./echo.js";
import clear from "./clear.js";
import whoami from "./whoami.js";
import tree from "./tree.js";
import edit from "./edit.js";
import power from "./power.js"; // exporte [poweron, poweroff, reboot]

const COMMANDES_DE_BASE = [
  help, pwd, ls, cd, cat, mkdir, touch, rm,
  echo, clear, whoami, tree, edit, ...power,
];

/**
 * Enregistre le jeu de commandes de base dans un registre.
 * @param {CommandRegistry} registry
 */
export function registerCoreCommands(registry) {
  for (const commande of COMMANDES_DE_BASE) registry.register(commande);
}
