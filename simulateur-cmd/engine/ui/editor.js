/**
 * editor.js — Éditeur plein écran type « vim allégé ».
 *
 * Ouvert par la commande edit via io.openEditor(path). Recouvre l'écran du
 * terminal, affiche le contenu du fichier, et rappelle les raccourcis :
 *   Ctrl+S  → sauvegarder (écrit via vfs.write, avec l'auteur)
 *   Échap   → quitter (avertit une fois si des modifications sont perdues)
 */

import { escapeHtml } from "../core/markup.js";
import { FsError } from "../core/filesystem.js";

export class Editor {
  /**
   * @param {HTMLElement} hote     Élément .term-ecran qui accueille l'overlay.
   * @param {Machine}     machine
   */
  constructor(hote, machine) {
    this.hote = hote;
    this.machine = machine;
  }

  /**
   * Ouvre l'éditeur sur un fichier (existant ou à créer).
   * @param {string} chemin  Chemin absolu.
   * @returns {Promise<void>} Résolue quand l'éditeur se ferme.
   */
  open(chemin) {
    return new Promise((resolve) => {
      const fs = this.machine.fs;
      const contenu = fs.exists(chemin) ? fs.read(chemin) : "";

      const overlay = document.createElement("div");
      overlay.className = "term-editeur";
      overlay.innerHTML = `
        <div class="term-editeur-entete">── ÉDITEUR ── ${escapeHtml(chemin)}</div>
        <textarea class="term-editeur-zone" spellcheck="false"></textarea>
        <div class="term-editeur-pied">
          <span class="term-editeur-statut"></span>
          <span class="term-editeur-raccourcis">[Ctrl+S] Sauvegarder &nbsp;&nbsp; [Échap] Quitter</span>
        </div>`;
      this.hote.appendChild(overlay);

      const zone = overlay.querySelector(".term-editeur-zone");
      const statut = overlay.querySelector(".term-editeur-statut");
      zone.value = contenu;

      let modifie = false;
      let averti = false; // premier Échap avec modifications non sauvées → avertissement

      const afficherStatut = (texte, classe = "") => {
        statut.textContent = texte;
        statut.className = "term-editeur-statut " + classe;
      };

      const sauvegarder = () => {
        try {
          fs.write(chemin, zone.value, { by: this.machine.profile.user });
          modifie = false;
          averti = false;
          afficherStatut("✓ Sauvegardé", "est-ok");
        } catch (e) {
          afficherStatut(e instanceof FsError ? e.message : "Erreur de sauvegarde", "est-erreur");
        }
      };

      const fermer = () => {
        overlay.remove();
        resolve();
      };

      zone.addEventListener("input", () => {
        modifie = true;
        averti = false;
        afficherStatut("(modifié)");
      });

      zone.addEventListener("keydown", (e) => {
        e.stopPropagation(); // le terminal ne doit pas réagir pendant l'édition
        if (e.key === "s" && e.ctrlKey) {
          e.preventDefault();
          sauvegarder();
        } else if (e.key === "Escape" || (e.key === "q" && e.ctrlKey)) {
          e.preventDefault();
          if (modifie && !averti) {
            averti = true;
            afficherStatut("Modifications non sauvegardées — appuie encore sur Échap pour quitter sans sauvegarder", "est-alerte");
          } else {
            fermer();
          }
        }
      });

      zone.focus();
    });
  }
}
