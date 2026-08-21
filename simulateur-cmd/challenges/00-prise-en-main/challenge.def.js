/**
 * challenge.def.js — Défi 00 : « Prise en main du terminal » (3 niveaux).
 *
 * S'appuie UNIQUEMENT sur l'API publique du moteur (engine.js) : la preuve
 * que la base s'étend sans jamais être modifiée.
 *
 * Niveaux 1 et 2 : validation par drapeau (code trouvé dans un fichier).
 * Niveau 3       : validation par état atteint (le bon fichier, au bon
 *                  endroit, avec le bon contenu) — pas de flag.
 */

import { Challenge } from "../../engine/engine.js";

// ── Constantes du défi ────────────────────────────────────────────────────────

export const DEFI_ID = "00-prise-en-main";
export const DEFI_TITRE = "Prise en main du terminal";

export const FLAG_NIVEAU_1 = "TECHNO{PREMIER_PAS}";
export const FLAG_NIVEAU_2 = "TECHNO{RIEN_N_EST_INVISIBLE}";

const CHEMIN_RAPPORT = "/home/eleve/Documents/rapport.txt";
const PHRASE_RAPPORT = "Mission accomplie";

// ── Machine de départ ─────────────────────────────────────────────────────────

export const machineSeed = {
  profile: {
    hostname: "poste-eleve",
    user: "eleve",
    theme: "hacker",
    bootLines: [
      "[[gris]]TECHNO-BIOS v3.0 — auto-test au démarrage…[[/]]",
      "[[gris]]Processeur ………………………………[[/]] [[ok]][ OK ][[/]]",
      "[[gris]]Mémoire 512 Mo ……………………………[[/]] [[ok]][ OK ][[/]]",
      "[[gris]]Disque virtuel …………………………[[/]] [[ok]][ OK ][[/]]",
      "[[gris]]Clavier ………………………………………[[/]] [[ok]][ OK ][[/]]",
      "[[gris]]Chargement de TECHNO-OS…[[/]]",
      "[[gris]]Montage du système de fichiers…[[/]] [[ok]][ OK ][[/]]",
      "[[vert]]Démarrage terminé.[[/]]",
    ],
    motd: [
      "[[titre]]#################################################[[/]]",
      "[[titre]]##                                             ##[[/]]",
      "[[titre]]##      P O S T E - E L E V E  ·  TECHNO-OS    ##[[/]]",
      "[[titre]]##                                             ##[[/]]",
      "[[titre]]#################################################[[/]]",
      "",
      "[[vert]]Session ouverte :[[/]] [[blanc]]eleve[[/]]",
      "[[gris]]Un fichier t'attend dans ton dossier personnel…[[/]]",
      "[[gris]]Tape[[/]] [[jaune]]help[[/]] [[gris]]pour afficher les commandes disponibles.[[/]]",
    ].join("\n"),
  },
  files: {
    "/home/eleve/lisez-moi.txt":
      "Bienvenue à bord, agent.\n" +
      "\n" +
      "Ce poste appartient au réseau du collège. Avant toute mission,\n" +
      "tu dois prouver que tu sais t'en servir.\n" +
      "\n" +
      "Ton premier code d'accès est : TECHNO{PREMIER_PAS}\n" +
      "\n" +
      "Recopie-le dans le panneau de mission, à droite de l'écran.\n",
    "/home/eleve/Documents/": null,
    "/home/eleve/Documents/notes_cours.txt":
      "Notes de cours (techno) :\n- un ordinateur range l'information dans des fichiers ;\n- les fichiers sont rangés dans des dossiers ;\n- le terminal permet de tout faire au clavier.\n",
    "/home/eleve/Exploration/": null,
    "/home/eleve/Exploration/journal.txt":
      "Journal d'exploration :\n- la cave : rien trouvé, à part des toiles d'araignée.\n- le grenier : il a l'air vide… vraiment ?\n",
    "/home/eleve/Exploration/cave/toiles.txt":
      "Des toiles d'araignée. Rien d'autre ici.\n",
    "/home/eleve/Exploration/grenier/.coffre":
      "Bien joué : tu as trouvé la cachette.\n" +
      "\n" +
      "Ce fichier commence par un point : il est invisible pour un simple « ls ».\n" +
      "Retiens la leçon — ce qu'on voit n'est pas tout ce qui existe.\n" +
      "\n" +
      "Code d'accès : TECHNO{RIEN_N_EST_INVISIBLE}\n",
  },
};

// ── Helpers de validation ─────────────────────────────────────────────────────

/** Compare un flag saisi au flag attendu (espaces et casse tolérés). */
function valideFlag(attendu) {
  return (_ctx, soumission) =>
    String(soumission || "").trim().toUpperCase() === attendu.toUpperCase();
}

/** Normalise un texte pour une comparaison tolérante (casse, espaces). */
function normalise(texte) {
  return String(texte).toLowerCase().replace(/\s+/g, " ").trim();
}

// ── Les 3 niveaux ─────────────────────────────────────────────────────────────

export const levels = [
  {
    id: "niveau-1",
    title: "L'ordinateur est vivant",
    mode: "flag",
    brief:
      "Ce poste vient de t'être confié. Il est temps de regarder autour de toi.\n" +
      "Quelque part dans ton dossier personnel, un fichier t'est adressé : " +
      "trouve-le, lis-le — il contient ton premier code d'accès.\n" +
      "Saisis ce code ci-dessous pour valider le niveau.",
    hints: [
      "Tape « help » : la machine te dira tout ce qu'elle sait faire.",
      "« pwd » te dit où tu es, « ls » affiche ce qui s'y trouve. Un fichier semble t'être destiné…",
      "Tape exactement : cat lisez-moi.txt — le code est dedans.",
    ],
    validate: valideFlag(FLAG_NIVEAU_1),
  },
  {
    id: "niveau-2",
    title: "Explorer et fouiller",
    mode: "flag",
    brief:
      "On raconte qu'un second code est caché quelque part dans le dossier Exploration.\n" +
      "Les dossiers se visitent avec « cd », et souviens-toi : " +
      "ce que tu vois n'est pas forcément tout ce qui existe…",
    hints: [
      "Entre dans le dossier : cd Exploration — puis regarde avec ls. Le journal peut t'aider.",
      "Va voir le grenier (cd grenier). Il a l'air vide ? Les fichiers cachés commencent par un point : essaie ls -a.",
      "Tape exactement : cat .coffre (une fois dans Exploration/grenier).",
    ],
    validate: valideFlag(FLAG_NIVEAU_2),
  },
  {
    id: "niveau-3",
    title: "Créer et écrire",
    mode: "etat",
    brief:
      "Fini d'observer : à toi de produire. Rédige ton rapport de mission :\n" +
      "1) dans ton dossier Documents, crée un fichier nommé rapport.txt ;\n" +
      "2) écris dedans la phrase : Mission accomplie\n" +
      "Utilise « edit » pour écrire (Ctrl+S pour sauvegarder, Échap pour quitter), " +
      "puis clique sur « Vérifier » : cette fois, pas de code — " +
      "c'est l'état de ta machine qui prouve ta réussite.",
    hints: [
      "Reviens dans ton dossier personnel avec « cd » (sans rien derrière), puis « cd Documents ».",
      "« edit rapport.txt » ouvre l'éditeur et crée le fichier s'il n'existe pas. Écris la phrase, puis Ctrl+S.",
      "Le fichier attendu est exactement /home/eleve/Documents/rapport.txt et doit contenir « Mission accomplie ». Vérifie avec : cat rapport.txt",
    ],
    // Prépare le terrain : si l'élève a supprimé Documents au passage, on le recrée.
    onEnter(machine) {
      if (!machine.fs.exists("/home/eleve/Documents")) {
        machine.fs.mkdir("/home/eleve/Documents", { by: "systeme", parents: true });
      }
    },
    // Validation PAR ÉTAT : on inspecte la machine, pas de flag.
    validate(ctx, _soumission) {
      const fs = ctx.machine.fs;
      if (!fs.exists(CHEMIN_RAPPORT)) return false;
      if (fs.stat(CHEMIN_RAPPORT).type !== "file") return false;
      return normalise(fs.read(CHEMIN_RAPPORT)).includes(normalise(PHRASE_RAPPORT));
    },
  },
];

// ── Fabrique du défi ──────────────────────────────────────────────────────────

/**
 * Crée le défi complet, prêt à init().
 * @param {string} studentId  Identifiant élève (compte du site, ou factice en dev).
 * @param {object} adapter    Adaptateur de persistance.
 * @returns {Challenge}
 */
export function createChallenge(studentId, adapter) {
  return Challenge.create({
    id: DEFI_ID,
    title: DEFI_TITRE,
    studentId,
    adapter,
    machineSeed,
    levels,
  });
}
