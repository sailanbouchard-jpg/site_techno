/**
 * terminal.js — Le terminal à l'écran : la SEULE couche qui touche le DOM.
 *
 * Un terminal est une vue branchée sur une Machine : boot animé, invite,
 * saisie, historique (flèches), sortie stylée, éditeur plein écran,
 * allumage/extinction. Les commandes n'écrivent que du texte balisé
 * (voir core/markup.js) ; c'est ici qu'il devient du HTML.
 *
 * Usage :
 *   const terminal = Terminal.mount(element, machine, { onCommand });
 */

import { renderInline, escapeHtml } from "../core/markup.js";
import { Session } from "../core/session.js";
import { Editor } from "./editor.js";

export const Terminal = {
  /**
   * Monte un terminal dans un élément DOM.
   * @param {HTMLElement} element
   * @param {Machine}     machine
   * @param {object}      [options]
   * @param {object}      [options.adapter]      Adaptateur de persistance (transmis aux défis).
   * @param {Function}    [options.onCommand]    Hook (ligne, terminal) après chaque commande.
   * @param {boolean}     [options.skipBootKey]  Une touche passe l'animation de boot (défaut vrai).
   * @param {CommandRegistry} [options.registry] Registre de commandes (défaut : global).
   */
  mount(element, machine, options = {}) {
    return new TerminalView(element, machine, options);
  },
};

// ── Vue terminal ──────────────────────────────────────────────────────────────

class TerminalView {
  constructor(element, machine, { adapter = null, onCommand = null, skipBootKey = true, registry } = {}) {
    this.element = element;
    this.machine = machine;
    this.adapter = adapter;
    this.onCommand = onCommand;
    this.skipBootKey = skipBootKey;

    this._occupe = false;      // animation ou commande en cours
    this._animation = null;    // promesse d'animation déclenchée par un événement power
    this._bootSkip = false;
    this._histIndex = null;    // position dans l'historique (flèches)
    this._saisieMemo = "";     // ce que l'élève tapait avant de remonter l'historique
    this._desabonnements = [];

    this._construireDom();
    this.editor = new Editor(this.ecran, machine);

    this.io = this._creerIo();
    this.session = Session.create(machine, this.io, { registry });
    this.shell = this.session.shell;

    this._brancherEvenements();

    // État initial : machine allumée → accueil direct ; éteinte → écran noir.
    if (machine.power === "on") {
      this._afficherAccueil();
    } else {
      this._ecranEteint();
    }
    this._majInvite();
    this.focus();
  }

  /** Donne le focus clavier au terminal. */
  focus() {
    this.entree.focus();
  }

  /** Démonte le terminal (désabonne tout, vide l'élément). */
  destroy() {
    for (const off of this._desabonnements) off();
    this.element.innerHTML = "";
    this.element.classList.remove("sim-terminal");
  }

  // ── Construction du DOM ─────────────────────────────────────────────────────

  _construireDom() {
    const profil = this.machine.profile;
    this.element.classList.add("sim-terminal", `theme-${profil.theme || "hacker"}`);
    this.element.innerHTML = `
      <div class="term-cadre">
        <div class="term-barre">
          <span class="term-barre-points"><i></i><i></i><i></i></span>
          <span class="term-barre-titre">${escapeHtml(profil.user)}@${escapeHtml(profil.hostname)} — terminal</span>
        </div>
        <div class="term-ecran">
          <div class="term-defile">
            <div class="term-sortie"></div>
            <div class="term-saisie">
              <span class="term-invite"></span>
              <input class="term-entree" type="text" spellcheck="false"
                     autocomplete="off" autocapitalize="off" aria-label="ligne de commande">
            </div>
          </div>
        </div>
      </div>`;
    this.ecran = this.element.querySelector(".term-ecran");
    this.defile = this.element.querySelector(".term-defile");
    this.sortie = this.element.querySelector(".term-sortie");
    this.saisie = this.element.querySelector(".term-saisie");
    this.invite = this.element.querySelector(".term-invite");
    this.entree = this.element.querySelector(".term-entree");
    this._ligneOuverte = null; // ligne en cours de construction par io.write()
  }

  // ── io : le pont commandes → écran ──────────────────────────────────────────

  _creerIo() {
    return {
      write: (texte) => {
        if (!this._ligneOuverte) this._ligneOuverte = this._nouvelleLigne();
        this._ligneOuverte.innerHTML += renderInline(texte);
        this._defiler();
      },
      writeLine: (texte = "") => {
        if (!this._ligneOuverte) this._ligneOuverte = this._nouvelleLigne();
        this._ligneOuverte.innerHTML += renderInline(texte);
        this._ligneOuverte = null;
        this._defiler();
      },
      writeError: (texte) => {
        const ligne = this._nouvelleLigne();
        ligne.classList.add("term-err");
        ligne.innerHTML = renderInline(texte);
        this._ligneOuverte = null;
        this._defiler();
      },
      clear: () => {
        this.sortie.innerHTML = "";
        this._ligneOuverte = null;
      },
      openEditor: async (chemin) => {
        this.saisie.classList.add("term-cache-saisie");
        await this.editor.open(chemin);
        this.saisie.classList.remove("term-cache-saisie");
        this.focus();
      },
    };
  }

  _nouvelleLigne() {
    const div = document.createElement("div");
    this.sortie.appendChild(div);
    return div;
  }

  _defiler() {
    this.defile.scrollTop = this.defile.scrollHeight;
  }

  // ── Événements ──────────────────────────────────────────────────────────────

  _brancherEvenements() {
    const { machine } = this;

    // Cycle de vie : les commandes power émettent, l'UI anime.
    this._desabonnements.push(
      machine.events.on("power:on", () => { this._animation = this._boot(); }),
      machine.events.on("power:off", () => { this._animation = this._extinction(); }),
      machine.events.on("power:reboot", () => { this._animation = this._redemarrage(); }),
    );

    // Saisie clavier.
    this.entree.addEventListener("keydown", (e) => this._surTouche(e));

    // Cliquer n'importe où sur le terminal redonne le focus (sauf sélection de texte).
    this.element.addEventListener("click", () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) this.focus();
    });
  }

  async _surTouche(e) {
    if (this._occupe) {
      // Pendant le boot : une touche passe l'animation.
      if (this.skipBootKey) this._bootSkip = true;
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      // Machine éteinte : Entrée = allumer, quoi qu'on ait tapé.
      const ligne = this.machine.power === "off" ? "poweron" : this.entree.value;
      this.entree.value = "";
      await this._soumettre(ligne);
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this._naviguerHistorique(e.key === "ArrowUp" ? -1 : 1);
      return;
    }

    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      this.io.clear();
    }
  }

  async _soumettre(ligne) {
    if (String(ligne).trim() === "") {
      this._echo("");
      return;
    }
    this._echo(ligne);
    this._histIndex = null;
    this._saisieMemo = "";
    this._occupe = true;
    this.saisie.classList.add("term-cache-saisie");

    await this.session.execute(ligne);
    if (this._animation) {
      await this._animation;
      this._animation = null;
    }

    this._occupe = false;
    this._majInvite();
    this.saisie.classList.remove("term-cache-saisie");
    this._defiler();
    this.focus();
    if (this.onCommand) this.onCommand(ligne, this);
  }

  /** Recopie la commande tapée dans la sortie, précédée de l'invite. */
  _echo(ligne) {
    const div = this._nouvelleLigne();
    div.classList.add("term-echo");
    const invite = this.machine.power === "off" ? "" : renderInline(this.machine.prompt());
    div.innerHTML = invite + `<span class="mk-blanc">${escapeHtml(ligne)}</span>`;
    this._ligneOuverte = null;
    this._defiler();
  }

  _naviguerHistorique(sens) {
    const historique = this.shell.history;
    if (historique.length === 0) return;
    if (this._histIndex === null) {
      if (sens === 1) return;
      this._saisieMemo = this.entree.value;
      this._histIndex = historique.length;
    }
    this._histIndex += sens;
    if (this._histIndex < 0) this._histIndex = 0;
    if (this._histIndex >= historique.length) {
      this._histIndex = null;
      this.entree.value = this._saisieMemo;
      return;
    }
    this.entree.value = historique[this._histIndex];
  }

  // ── Cycle de vie animé ──────────────────────────────────────────────────────

  /** Séquence de boot : lignes du profil affichées progressivement. */
  async _boot() {
    this._occupe = true;
    this._bootSkip = false;
    this.saisie.classList.add("term-cache-saisie");
    this.io.clear();
    await this._pause(350);
    for (const ligne of this.machine.profile.bootLines || []) {
      this.io.writeLine(ligne);
      await this._pause(90 + Math.random() * 260);
    }
    await this._pause(400);
    this._afficherAccueil();
    this._occupe = false;
  }

  async _extinction() {
    this._occupe = true;
    this.saisie.classList.add("term-cache-saisie");
    await this._pause(700);
    this._ecranEteint();
    this._occupe = false;
  }

  async _redemarrage() {
    this._occupe = true;
    this.saisie.classList.add("term-cache-saisie");
    await this._pause(600);
    await this._boot();
  }

  /** Bannière d'accueil (motd) après le boot. */
  _afficherAccueil() {
    this.io.writeLine("");
    for (const ligne of String(this.machine.profile.motd || "").split("\n")) {
      this.io.writeLine(ligne);
    }
    this.io.writeLine("");
  }

  /** Écran « machine éteinte ». */
  _ecranEteint() {
    this.io.clear();
    this.io.writeLine("");
    this.io.writeLine("[[gris]]  ·  ·  ·  machine éteinte  ·  ·  ·[[/]]");
    this.io.writeLine("");
    this.io.writeLine("[[gris]]  Appuie sur [Entrée] pour l'allumer.[[/]]");
  }

  /** Met l'invite à jour (elle dépend du dossier courant et de l'alimentation). */
  _majInvite() {
    this.invite.innerHTML =
      this.machine.power === "off"
        ? renderInline("[[gris]]⏻ [[/]]")
        : renderInline(this.machine.prompt());
  }

  _pause(ms) {
    return new Promise((r) => setTimeout(r, this._bootSkip ? 0 : ms));
  }
}
