/*
 * interface/champ_numerique.js
 * ────────────────────────────
 * Le champ numérique, un seul composant réutilisé partout :
 *   - aligné à droite, l'unité en gris clair dans le champ ;
 *   - l'étiquette se fait glisser pour régler la valeur (comme Onshape ou Blender) ;
 *   - deux petites flèches à droite ajoutent ou retirent un pas (maintenues,
 *     elles répètent) ; au clavier, flèches haut et bas ;
 *   - le pas suit la valeur (voir pas_automatique.js) : 0,6 → 0,7, 15 → 16 ;
 *     10 pas avec Maj, un dixième avec Ctrl ; monter puis redescendre revient
 *     toujours exactement au point de départ ;
 *   - des valeurs usuelles (largeurs de ligne des buses courantes…) : les
 *     flèches passent de l'une à l'autre, et le bouton ▾ les propose ;
 *   - les flèches s'arrêtent aux bornes, et une valeur tapée au-delà y est
 *     ramenée, avec la raison sous le champ ;
 *   - Entrée valide et quitte le champ, Échap annule et rend la valeur d'avant ;
 *   - le contenu est sélectionné au focus.
 *
 * Pendant un réglage (flèches, glisser), seul surApercu est appelé : la vue
 * montre le résultat, le document ne bouge pas. surValider n'arrive qu'une
 * fois, quand l'élève confirme — d'où une seule entrée d'annulation. Le champ
 * n'a pas besoin d'avoir le focus : un clic sur une flèche suffit.
 *
 * On peut taper un calcul (« 20 / 3 + 1 ») ; avec l'option avecFormules, aussi
 * les variables du projet (« pile_rayon * 2 »). Le champ montre alors la
 * valeur, marquée ƒ, et la formule revient dès qu'on clique dedans.
 */

import { creer } from "./elements.js";
import { lireSaisie, texteDeFormule } from "./saisie_de_formules.js";
import { brancherCompletion, montrerErreurSous } from "./completion_de_variables.js";
import { decimalesDe, pasPour, valeurAuRang, valeurUsuelleSuivante } from "./pas_automatique.js";

const PIXELS_PAR_PAS = 3;
// Flèche maintenue : un premier pas, une pause, puis des pas rapprochés.
const PAUSE_AVANT_REPETITION_MS = 400;
const INTERVALLE_DE_REPETITION_MS = 70;
// Une rafale de clics sur les flèches ne fait qu'une validation, donc une annulation.
const DELAI_DE_VALIDATION_MS = 500;
// Au-delà, l'affichage arrondit : un calcul donne vite 0,4199999.
const DECIMALES_AFFICHEES_MAX = 4;

const aUneBorne = (b) => b !== undefined && b !== null;

/*
 * options : { etiquette, titre, unite, valeur, min, max, entier, pasFixe,
 *             valeursUsuelles, decimales = 1, avecFormules, accepteVide,
 *             surApercu(valeur), surValider(valeur, formule), surAnnuler() }
 * pasFixe : un pas qui a un sens propre (15° pour une rotation, 5 % pour un
 *           creux) ; sans lui, le pas suit la valeur.
 * valeursUsuelles : [nombres] entre lesquels les flèches sautent.
 * decimales : le minimum affiché ; une valeur plus précise l'est entièrement.
 * accepteVide : un champ vidé est valide et rend surValider(null, null) —
 *           pour une borne qu'on retire, par exemple.
 * surValider peut rendre un texte : la raison d'un refus, montrée sous le champ.
 * formule : le calcul sur les variables (identifiants du document), ou null
 *           pour un nombre — qui retire alors la formule d'avant.
 * surAnnuler : l'aperçu est fini, qu'il soit abandonné ou validé.
 */
export function creerChampNumerique(options) {
  const decimales = options.entier ? 0 : (options.decimales ?? 1);
  let valeur = options.valeur ?? null;
  let valeurDeDepart = valeur;
  let formule = null;          // celle du document, pas celle qu'on tape
  let texteDeDepart = null;    // le contenu du champ avant la frappe
  let enReglage = false;
  // La grille des flèches : ancre + n × pas. Elle reste la même tant qu'on ne
  // retape pas la valeur, même au-delà d'une validation : descendre depuis
  // une borne retombe sur la grille, donc sur le point de départ.
  let grille = null;           // { ancre, pas }
  let raisons = { min: null, max: null };

  const etiquette = creer("span", { classe: "etiquette", texte: options.etiquette ?? "", titre: options.titre ?? "Glisser pour régler" });
  const saisie = creer("input", {
    attributs: {
      type: "text", inputmode: options.avecFormules ? "text" : "decimal", autocomplete: "off", spellcheck: "false",
      "aria-label": options.titre ?? options.etiquette ?? "",
    },
  });
  // Avant nos propres écoutes du clavier : liste ouverte, Entrée choisit une variable.
  if (options.avecFormules) brancherCompletion(saisie);
  const unite = creer("span", { classe: "unite", texte: options.unite ?? "" });
  const fleche = (sens, texte) => creer("button", {
    classe: sens > 0 ? "fleche plus" : "fleche moins",
    titre: texte + " (Maj : ×10, Ctrl : ÷10)",
    attributs: { type: "button", tabindex: "-1", "aria-label": texte },
  });
  const plus = fleche(1, "Augmenter");
  const moins = fleche(-1, "Diminuer");
  const usuelles = creer("button", { classe: "bouton-usuelles", titre: "Valeurs usuelles", texte: "▾", attributs: { type: "button", tabindex: "-1" } });
  const racine = creer("div", { classe: "champ-numerique" }, [
    options.etiquette ? etiquette : null, saisie, unite, usuelles,
    creer("div", { classe: "fleches" }, [plus, moins]),
  ]);

  function formater(v) {
    if (v === null) return "";
    const chiffres = Math.max(decimales, Math.min(DECIMALES_AFFICHEES_MAX, decimalesDe(v)));
    // −0,0004 s'afficherait « -0 » : ce qui s'arrondit à zéro s'écrit zéro.
    const propre = Number(v.toFixed(chiffres)) === 0 ? 0 : v;
    return propre.toLocaleString("fr-FR", { maximumFractionDigits: chiffres, useGrouping: false });
  }

  const bornee = (v) => {
    let resultat = v;
    if (aUneBorne(options.min)) resultat = Math.max(options.min, resultat);
    if (aUneBorne(options.max)) resultat = Math.min(options.max, resultat);
    return resultat;
  };
  function borner(v) {
    const resultat = bornee(v);
    return options.entier ? Math.round(resultat) : Number(resultat.toFixed(DECIMALES_AFFICHEES_MAX + 2));
  }

  function afficher(v) {
    saisie.value = formater(v);
  }

  function texteDesBornes() {
    const u = options.unite ? " " + options.unite : "";
    if (aUneBorne(options.min) && aUneBorne(options.max)) return "permis de " + formater(options.min) + " à " + formater(options.max) + u;
    return aUneBorne(options.min) ? "au moins " + formater(options.min) + u : "au plus " + formater(options.max) + u;
  }

  function marquerFormule() {
    const texte = texteDeFormule(formule);
    racine.classList.toggle("a-formule", texte !== null);
    saisie.title = texte === null ? "" : "= " + texte + " — cliquer pour modifier la formule";
  }

  function marquerUsuelles() {
    const liste = options.valeursUsuelles ?? [];
    usuelles.hidden = liste.length === 0;
    racine.classList.toggle("avec-usuelles", liste.length > 0);
  }

  /* Le nombre affiché, pour partir de lui aux flèches ; la valeur si le
     champ montre une formule ou un calcul en cours de frappe. */
  function nombreAffiche() {
    try {
      return lireSaisie(saisie.value, options.avecFormules === true).valeur;
    } catch (_erreur) {
      return valeur ?? 0;
    }
  }

  function regler(v) {
    valeur = borner(v);
    afficher(valeur);
    options.surApercu?.(valeur);
  }

  // ── Le pas ──────────────────────────────────────────────────────────────

  function grilleCourante() {
    if (grille === null) {
      const ancre = nombreAffiche() ?? 0;
      const bornes = { min: options.min ?? null, max: options.max ?? null, entier: options.entier };
      grille = { ancre, pas: options.pasFixe ?? pasPour(ancre, bornes) };
    }
    return grille;
  }

  const facteurDe = (touches) => (touches.ctrlKey || touches.metaKey ? 0.1 : touches.shiftKey ? 10 : 1);

  /* La valeur au cran n d'une grille de pas « pas × facteur », bornée. */
  function auCran(cran, facteur) {
    const { ancre, pas } = grilleCourante();
    return bornee(valeurAuRang(ancre, cran, pas * facteur));
  }

  /* Le cran suivant dans ce sens, depuis la valeur actuelle : une valeur hors
     de la grille (arrêtée sur une borne) retombe sur le cran voisin. */
  function pousser(sens, touches) {
    const liste = options.valeursUsuelles ?? [];
    const facteur = facteurDe(touches);
    const actuelle = valeur ?? nombreAffiche() ?? 0;
    if (liste.length > 0 && facteur === 1) {
      const suivante = valeurUsuelleSuivante(liste.filter((v) => bornee(v) === v), actuelle, sens);
      if (suivante !== null) regler(suivante);
      return;
    }
    const { ancre, pas } = grilleCourante();
    const position = (actuelle - ancre) / (pas * facteur);
    const cran = sens > 0 ? Math.floor(position + 1e-9) + 1 : Math.ceil(position - 1e-9) - 1;
    regler(auCran(cran, facteur));
  }

  // ── Valider, annuler ────────────────────────────────────────────────────

  function signalerRetour(retour) {
    if (typeof retour === "string" && retour !== "") montrerErreurSous(saisie, retour);
  }

  function valider() {
    // Rien de tapé (la formule revenue au focus, ou Entrée puis la sortie du
    // champ) : rien ne change — relire le nombre affiché effacerait la formule.
    if (formule !== null && saisie.value === texteDeDepart) {
      afficher(valeur);
      texteDeDepart = saisie.value;
      options.surAnnuler?.();
      return;
    }
    if (options.accepteVide && saisie.value.trim() === "") {
      const changee = valeur !== null || formule !== null;
      valeur = null;
      formule = null;
      marquerFormule();
      options.surAnnuler?.();
      if (changee) signalerRetour(options.surValider(null, null));
      valeurDeDepart = null;
      texteDeDepart = "";
      return;
    }
    let lue;
    try {
      lue = lireSaisie(saisie.value, options.avecFormules === true);
    } catch (erreur) {
      racine.classList.add("erreur");
      montrerErreurSous(saisie, erreur.message);
      valeur = valeurDeDepart;
      afficher(valeur);
      texteDeDepart = saisie.value;
      options.surAnnuler?.();
      return;
    }
    const avaitUneFormule = formule !== null;
    valeur = borner(lue.valeur);
    afficher(valeur);
    // Une valeur tapée hors des bornes est ramenée dedans : on dit pourquoi, sans bloquer.
    if (lue.formule === null && Math.abs(bornee(lue.valeur) - lue.valeur) > 1e-12) {
      const raison = lue.valeur < valeur ? raisons.min : raisons.max;
      montrerErreurSous(saisie, "Valeur ramenée à " + formater(valeur) + (options.unite ? " " + options.unite : "") + " : " + (raison ?? texteDesBornes()) + ".");
    }
    // L'aperçu s'arrête : c'est le document qui place l'objet désormais, et
    // une annulation doit pouvoir le déplacer.
    options.surAnnuler?.();
    if (lue.formule !== null || avaitUneFormule || valeur !== valeurDeDepart) {
      formule = lue.formule;
      marquerFormule();
      signalerRetour(options.surValider(valeur, lue.formule));
    }
    valeurDeDepart = valeur;
    texteDeDepart = saisie.value;
  }

  function annuler() {
    valeur = valeurDeDepart;
    afficher(valeur);
    texteDeDepart = saisie.value;
    options.surAnnuler?.();
  }

  saisie.addEventListener("focus", () => {
    valeurDeDepart = valeur;
    const texte = texteDeFormule(formule);
    if (texte !== null && !enReglage) saisie.value = texte;
    texteDeDepart = saisie.value;
    saisie.select();
  });
  // Une valeur tapée a sa propre précision : le pas repart d'elle.
  saisie.addEventListener("input", () => {
    racine.classList.remove("erreur");
    grille = null;
  });
  saisie.addEventListener("blur", () => {
    if (!enReglage) valider();
  });
  saisie.addEventListener("keydown", (evenement) => {
    if (evenement.key === "Enter") {
      // Entrée valide et rend la main : la touche suivante (F, Suppr…) agit sur la vue, pas dans la case.
      evenement.preventDefault();
      valider();
      saisie.blur();
    } else if (evenement.key === "Escape") {
      evenement.preventDefault();
      annuler();
      saisie.blur();
    } else if (evenement.key === "ArrowUp" || evenement.key === "ArrowDown") {
      evenement.preventDefault();
      pousser(evenement.key === "ArrowUp" ? 1 : -1, evenement);
      saisie.select();
    }
    // Les raccourcis de l'atelier (Suppr, Ctrl+Z…) ne doivent pas agir pendant la frappe.
    evenement.stopPropagation();
  });

  // ── Flèches ─────────────────────────────────────────────────────────────
  let repetition = null;
  let validationDifferee = null;

  function appuyerSurFleche(bouton, sens, evenement) {
    if (saisie.disabled || evenement.button !== 0) return;
    evenement.preventDefault();   // le focus reste où il est
    bouton.setPointerCapture(evenement.pointerId);
    clearTimeout(validationDifferee);
    // Une frappe en cours compte : elle devient le point de départ.
    if (!enReglage) valeurDeDepart = valeur;
    enReglage = true;
    const touches = { shiftKey: evenement.shiftKey, ctrlKey: evenement.ctrlKey, metaKey: evenement.metaKey };
    pousser(sens, touches);
    const repeter = () => {
      pousser(sens, touches);
      repetition = setTimeout(repeter, INTERVALLE_DE_REPETITION_MS);
    };
    repetition = setTimeout(repeter, PAUSE_AVANT_REPETITION_MS);
  }

  /* Relâchée : la valeur est validée un instant plus tard, même si le champ n'a
     jamais eu le focus. S'il l'a, on attend sa sortie ou Entrée. */
  function relacherFleche() {
    if (repetition === null) return;
    clearTimeout(repetition);
    repetition = null;
    validationDifferee = setTimeout(() => {
      enReglage = false;
      if (document.activeElement !== saisie) valider();
    }, DELAI_DE_VALIDATION_MS);
  }

  for (const [bouton, sens] of [[plus, 1], [moins, -1]]) {
    bouton.addEventListener("pointerdown", (evenement) => appuyerSurFleche(bouton, sens, evenement));
    bouton.addEventListener("pointerup", relacherFleche);
    bouton.addEventListener("pointercancel", relacherFleche);
  }

  // ── Valeurs usuelles ────────────────────────────────────────────────────
  let menuUsuelles = null;
  const fermerUsuelles = () => {
    menuUsuelles?.remove();
    menuUsuelles = null;
  };
  usuelles.addEventListener("pointerdown", (evenement) => evenement.preventDefault());
  usuelles.addEventListener("click", () => {
    if (menuUsuelles !== null) return fermerUsuelles();
    const cadre = racine.getBoundingClientRect();
    menuUsuelles = creer("div", { classe: "cadre-completion menu-usuelles", attributs: { role: "listbox" } },
      (options.valeursUsuelles ?? []).map((v) => {
        const permise = bornee(v) === v;
        const ligne = creer("div", {
          classe: "choix-completion" + (valeur !== null && Math.abs(v - valeur) < 1e-9 ? " actif" : "") + (permise ? "" : " hors-bornes"),
          texte: formater(v) + (options.unite ? " " + options.unite : ""),
          titre: permise ? "" : "Hors des bornes actuelles",
        });
        ligne.addEventListener("pointerdown", (evenement) => {
          evenement.preventDefault();
          fermerUsuelles();
          if (!permise) return;
          regler(v);
          valider();
        });
        return ligne;
      }));
    menuUsuelles.style.left = Math.round(cadre.left) + "px";
    menuUsuelles.style.top = Math.round(cadre.bottom + 2) + "px";
    menuUsuelles.style.minWidth = Math.round(cadre.width) + "px";
    document.body.append(menuUsuelles);
    const ailleurs = (evenement) => {
      if (menuUsuelles?.contains(evenement.target) || usuelles.contains(evenement.target)) return;
      fermerUsuelles();
      document.removeEventListener("pointerdown", ailleurs, true);
    };
    document.addEventListener("pointerdown", ailleurs, true);
  });

  // ── Étiquette glissable ─────────────────────────────────────────────────
  let glisser = null;
  etiquette.addEventListener("pointerdown", (evenement) => {
    if (saisie.disabled || evenement.button !== 0) return;
    evenement.preventDefault();
    etiquette.setPointerCapture(evenement.pointerId);
    valeurDeDepart = valeur;
    const { ancre, pas } = grilleCourante();
    glisser = { x: evenement.clientX, bouge: false, rang: Math.round(((valeur ?? ancre) - ancre) / pas) };
    enReglage = true;
  });
  etiquette.addEventListener("pointermove", (evenement) => {
    if (glisser === null) return;
    const pixels = evenement.clientX - glisser.x;
    if (Math.abs(pixels) < PIXELS_PAR_PAS && !glisser.bouge) return;
    glisser.bouge = true;
    const facteur = facteurDe(evenement);
    regler(auCran(Math.round(glisser.rang / facteur) + Math.round(pixels / PIXELS_PAR_PAS), facteur));
  });
  const finirGlisser = (evenement) => {
    if (glisser === null) return;
    const bouge = glisser.bouge;
    glisser = null;
    enReglage = false;
    if (etiquette.hasPointerCapture(evenement.pointerId)) etiquette.releasePointerCapture(evenement.pointerId);
    if (bouge) valider();
    else saisie.focus();
  };
  etiquette.addEventListener("pointerup", finirGlisser);
  etiquette.addEventListener("pointercancel", finirGlisser);

  afficher(valeur);
  marquerUsuelles();
  unite.hidden = !options.unite;

  return {
    element: racine,

    /* Une mise à jour venue du document ne doit pas écraser ce que l'élève
       est en train de taper ou de régler. f : la formule du champ, s'il en a une.
       Une valeur changée ailleurs (annulation, autre champ) a sa propre précision. */
    definirValeur(v, f = null) {
      if (document.activeElement === saisie || enReglage) return;
      if (v === null || valeur === null || Math.abs(v - valeur) > 1e-9) grille = null;
      valeur = v;
      valeurDeDepart = v;
      formule = f;
      afficher(v);
      texteDeDepart = saisie.value;
      marquerFormule();
    },

    /* Des bornes qui dépendent d'autres valeurs changent avec elles.
       raisonsDesBornes : { min, max } — pourquoi on ne peut pas aller au-delà. */
    definirBornes(min, max, raisonsDesBornes = {}) {
      options.min = min ?? undefined;
      options.max = max ?? undefined;
      raisons = { min: raisonsDesBornes.min ?? null, max: raisonsDesBornes.max ?? null };
    },

    definirValeursUsuelles(liste) {
      options.valeursUsuelles = liste ?? [];
      marquerUsuelles();
    },

    definirUnite(texte) {
      options.unite = texte;
      unite.textContent = texte ?? "";
      unite.hidden = !texte;
    },

    activer(actif) {
      saisie.disabled = !actif;
      plus.disabled = !actif;
      moins.disabled = !actif;
      usuelles.disabled = !actif;
      racine.classList.toggle("desactive", !actif);
    },
  };
}
