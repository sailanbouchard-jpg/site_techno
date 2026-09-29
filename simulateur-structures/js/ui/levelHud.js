// ui/levelHud.js
// ──────────────
// Tout ce que le JOUEUR voit autour d'un niveau :
//   - le dialogue « Niveaux » : liste en colonnes (niveau, portée, véhicules,
//     note), regroupée par catégorie, avec l'énoncé du niveau choisi ;
//   - la fenêtre « Rapport d'essai », à droite après un essai (validé ou non,
//     masse, note) : elle ne masque rien, la simulation continue derrière ;
//   - les afficheurs de la barre d'outils : masse du pont, objectif, état.
//
// Le dialogue est le même pour tout le monde ; l'administrateur y gagne en plus
// le cadre « Édition du niveau » (ui/levelEditor.js).
//
// Ni physique ni arbitrage ici : le verdict vient de model/essai.js, la notation
// de model/levels.js.

import { state, loadStructure, MODES, appliquerMateriauxAutorises } from "../state.js";
import {
  LEVEL_CATEGORIES, buildLevel, niveauSuivant, seuilsMasse, massePont, tousLesNiveaux,
  signatureEnonce,
} from "../model/levels.js";
import { exportStructure } from "../model/Structure.js";
import { ESSAI, annulerEssai } from "../model/essai.js";
import { chargerCatalogue, estAdmin } from "../model/catalogue.js";
import { appliquerModeAdmin } from "../mode.js";
import { initEditeurNiveaux, montrerNiveau } from "./levelEditor.js";
import {
  chargerProgression, etoilesDe, enregistrerReussite,
  meilleureMasse, niveauReussi, aUnPont, pontPerime, chargerPont,
} from "../model/progression.js";
import { getBeamTypeById } from "../model/materials.js";
import { formatKilograms, formatDecimal } from "../units.js";
import { refreshAfterModeChange, arreterEssai } from "./toolbar.js";
import { enregistrerCommande } from "./menus.js";
import { ligne } from "./proprietes.js";
import { fitView } from "./viewControls.js";

const CHEMIN_ETOILE = "M6.5 1l1.6 3.4 3.7.5-2.7 2.6.7 3.7-3.3-1.8-3.3 1.8.7-3.7L1.2 4.9l3.7-.5z";
// Ce qu'on demande avant de jeter le pont en cours de construction. Le pont
// ENREGISTRÉ, lui, ne risque rien : seul un pont plus léger le remplace.
const CONFIRMATION_NOUVEAU_PONT = [
  "Repartir d'un pont vide ?",
  "",
  "Ton pont enregistré est conservé ; seule la construction actuellement à l'écran sera perdue.",
].join("\n");

// Coche « niveau validé ». Elle dit ce que les étoiles ne disent pas : un niveau
// fini avec 0 étoile reste un niveau fini.
const COCHE = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.2l2.6 2.6L10 3.2"/></svg>`;

// Pastilles d'état (afficheur « État » et rapport) : carrées, comme le reste.
const ICONES_ETAT = {
  conception: `<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="etat-anneau" x="1.75" y="1.75" width="10.5" height="10.5"/></svg>`,
  essai: `<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="etat-fond-essai" x="1" y="1" width="12" height="12"/><path class="etat-glyphe-plein" d="M5.2 4v6L10 7z"/></svg>`,
  pause: `<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="etat-fond-essai" x="1" y="1" width="12" height="12"/><rect class="etat-glyphe-plein" x="4.5" y="4" width="1.8" height="6"/><rect class="etat-glyphe-plein" x="7.7" y="4" width="1.8" height="6"/></svg>`,
  reussi: `<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="etat-fond-ok" x="1" y="1" width="12" height="12"/><path class="etat-glyphe" d="M4 7.3l2 2 4-4.3"/></svg>`,
  echoue: `<svg viewBox="0 0 14 14" aria-hidden="true"><rect class="etat-fond-danger" x="1" y="1" width="12" height="12"/><path class="etat-glyphe" d="M4.6 4.6l4.8 4.8M9.4 4.6l-4.8 4.8"/></svg>`,
};

let ecranNiveaux = null;
let panneauResultat = null;
let niveauChoisi = null; // ligne sélectionnée dans le dialogue
let statutAffiche = ESSAI.AUCUN; // évite de réafficher le résultat à chaque rafraîchissement

export async function initLevelHud() {
  ecranNiveaux = document.getElementById("ecran-niveaux");
  panneauResultat = document.getElementById("panneau-resultat");

  document.getElementById("niveaux-fermer").addEventListener("click", fermerNiveaux);
  document.getElementById("niveau-annuler").addEventListener("click", fermerNiveaux);
  document.getElementById("niveau-ouvrir").addEventListener("click", () => {
    if (niveauChoisi) chargerNiveau(niveauChoisi);
  });
  document.getElementById("niveau-ouvrir-neuf").addEventListener("click", () => {
    if (niveauChoisi) chargerNiveau(niveauChoisi, true);
  });
  ecranNiveaux.addEventListener("keydown", toucheDialogue);

  document.getElementById("resultat-niveaux").addEventListener("click", () => {
    fermerResultat();
    ouvrirNiveaux();
  });
  // « Modifier le pont » = arrêter l'essai : on revient à SA construction
  // (celle d'avant l'essai), pas au niveau vierge — un échec n'efface pas le travail.
  document.getElementById("resultat-rejouer").addEventListener("click", arreterEssai);
  document.getElementById("resultat-fermer").addEventListener("click", fermerResultat);
  document.getElementById("resultat-suivant").addEventListener("click", () => {
    fermerResultat();
    const suivant = state.niveauCourant && niveauSuivant(state.niveauCourant);
    if (suivant) chargerNiveau(suivant);
    else ouvrirNiveaux();
  });

  enregistrerCommande("niveaux", ouvrirNiveaux);
  enregistrerCommande("nouveau-pont", nouveauPont, {
    actif: () => Boolean(state.niveauCourant),
  });
  enregistrerCommande("niveau-suivant", () => chargerNiveau(niveauSuivant(state.niveauCourant)), {
    actif: () => Boolean(state.niveauCourant && niveauSuivant(state.niveauCourant)),
  });

  // Le catalogue peut venir du serveur (édité par l'administrateur) : on le
  // charge AVANT de bâtir la liste, sinon on afficherait celui du code.
  await chargerCatalogue();
  appliquerModeAdmin(estAdmin());
  if (estAdmin()) initEditeurNiveaux({ surModification: catalogueModifie });

  await chargerProgression();
  construireListe();
  ouvrirNiveaux(); // on démarre toujours par le choix du niveau
}

// ── Dialogue « Niveaux » ─────────────────────────────────────────────────────

function construireListe() {
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th>Niveau</th><th class="col-nombre">Portée</th><th>Véhicules</th><th class="col-pont">Ton pont</th><th class="col-note">Note</th></tr></thead>`;
  const corps = document.createElement("tbody");
  for (const categorie of LEVEL_CATEGORIES) {
    const groupe = document.createElement("tr");
    groupe.className = "groupe";
    const titre = document.createElement("td");
    titre.colSpan = 5;
    titre.textContent = categorie.label;
    groupe.appendChild(titre);
    corps.appendChild(groupe);
    categorie.levels.forEach((niveau, index) => corps.appendChild(ligneNiveau(niveau, index + 1)));
  }
  table.appendChild(corps);
  const liste = document.getElementById("niveaux-grille");
  liste.innerHTML = "";
  liste.appendChild(table);
}

function ligneNiveau(niveau, numero) {
  const tr = document.createElement("tr");
  tr.className = "niveau";
  tr.dataset.niveau = niveau.id;
  const cellules = [
    ["col-nom", `${numero}. ${niveau.label}`],
    ["col-nombre", `${niveau.portee} m`],
    ["", niveau.vehicules.map((v) => v.nom).join(", ")],
    ["col-pont", ""], // rempli par rafraichirNotes : validé + masse du meilleur pont
    ["col-note", ""],
  ];
  for (const [classe, texte] of cellules) {
    const td = document.createElement("td");
    if (classe) td.className = classe;
    td.textContent = texte;
    tr.appendChild(td);
  }
  tr.addEventListener("click", () => choisirNiveau(niveau));
  tr.addEventListener("dblclick", () => chargerNiveau(niveau));
  return tr;
}

function choisirNiveau(niveau) {
  niveauChoisi = niveau || null;
  for (const tr of document.querySelectorAll("#niveaux-grille tr.niveau")) {
    const choisi = Boolean(niveau) && tr.dataset.niveau === niveau.id;
    tr.classList.toggle("choisi", choisi);
    if (choisi) tr.scrollIntoView({ block: "nearest" });
  }
  document.getElementById("niveau-enonce").textContent = niveau ? niveau.enonce : "";
  majContrainte(niveau);
  majProgression(niveau);
  // L'administrateur arrive directement sur la fiche du niveau : choisir une
  // ligne, c'est ouvrir son édition. Le niveau est AUSSI mis en place derrière
  // le dialogue, pour que « Enregistrer » sauve bien la scène de cette fiche-là
  // et pas le dessin d'un autre niveau resté à l'écran.
  if (!estAdmin()) return;
  // Catalogue encore vide : l'éditeur repart d'une fiche blanche, pour que
  // « Enregistrer » crée le premier niveau au lieu de ne rien faire.
  if (!niveau) return montrerNiveau(null);
  // Même niveau qu'à l'écran : on ne recharge SURTOUT pas la scène, sinon
  // ouvrir le dialogue effacerait le travail en cours. On adopte juste la
  // fiche, qui peut venir d'être réenregistrée.
  if (state.niveauCourant && state.niveauCourant.id === niveau.id) adopterNiveau(niveau);
  else appliquerNiveau(niveau);
  montrerNiveau(niveau);
}

// Les matériaux imposés par le niveau, annoncés sous l'énoncé. Rien à dire quand
// tout le catalogue est ouvert.
function majContrainte(niveau) {
  const zone = document.getElementById("niveau-contrainte");
  const noms = ((niveau && niveau.materiaux) || []).map((id) => getBeamTypeById(id).label);
  zone.hidden = noms.length === 0;
  zone.textContent = `Matériaux imposés : ${noms.join(", ")}.`;
}

// Ce que l'élève a déjà réussi sur ce niveau, et ce qu'« Ouvrir » va faire.
// Sans cette ligne, rouvrir un niveau sur un pont déjà construit surprendrait :
// il faut dire d'où vient ce qui apparaît à l'écran.
function majProgression(niveau) {
  const zone = document.getElementById("niveau-progression");
  const boutonNeuf = document.getElementById("niveau-ouvrir-neuf");
  const reussi = Boolean(niveau) && niveauReussi(niveau.id);
  zone.hidden = !reussi;
  boutonNeuf.hidden = true;
  if (!reussi) return;

  const signature = signatureEnonce(niveau);
  const masse = formatKilograms(meilleureMasse(niveau.id));
  const etoiles = etoilesDe(niveau.id);
  const note = `${etoiles} étoile${etoiles > 1 ? "s" : ""}`;
  if (aUnPont(niveau.id, signature)) {
    boutonNeuf.hidden = estAdmin();
    zone.textContent = `Validé — ton pont pèse ${masse} (${note}). « Ouvrir » le recharge tel quel ; « Nouveau pont » repart de zéro.`;
  } else if (pontPerime(niveau.id, signature)) {
    zone.textContent = `Validé — ton pont pesait ${masse} (${note}), mais le niveau a été modifié depuis : tu repars d'une base neuve.`;
  } else {
    zone.textContent = `Validé — ton meilleur pont pesait ${masse} (${note}). Il n'a pas été conservé : tu repars d'une base neuve.`;
  }
}

// Appelé par l'éditeur quand le catalogue a changé : la liste est rebâtie et la
// sélection rétablie sur le niveau concerné (ou le premier, s'il a disparu).
function catalogueModifie(idSelection) {
  construireListe();
  rafraichirNotes();
  const tous = tousLesNiveaux();
  // Le niveau en cours vient peut-être d'être supprimé : ne pas garder un
  // fantôme, sinon le dialogue rouvrirait sur une fiche qui n'existe plus.
  if (state.niveauCourant && !tous.some((niveau) => niveau.id === state.niveauCourant.id)) {
    state.niveauCourant = null;
    majTitre();
  }
  choisirNiveau(tous.find((niveau) => niveau.id === idSelection) || tous[0] || null);
}

// Flèches : niveau précédent / suivant ; Entrée : ouvrir ; Échap : fermer.
function toucheDialogue(event) {
  const tous = tousLesNiveaux();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const index = niveauChoisi ? tous.indexOf(niveauChoisi) : -1;
    const cible = event.key === "ArrowDown" ? Math.min(tous.length - 1, index + 1) : Math.max(0, index - 1);
    choisirNiveau(tous[cible]);
  } else if (event.key === "Enter" && niveauChoisi && event.target.tagName !== "BUTTON") {
    event.preventDefault();
    chargerNiveau(niveauChoisi);
  } else if (event.key === "Escape") {
    event.preventDefault();
    fermerNiveaux();
  }
}

export function ouvrirNiveaux() {
  rafraichirNotes();
  const tous = tousLesNiveaux();
  // Présélection : le niveau en cours, sinon le premier qui n'a pas la note
  // maximale. On le retrouve par son ID : après un enregistrement, le catalogue
  // a été rebâti et l'objet de state.niveauCourant n'est plus celui de la liste.
  const courant = state.niveauCourant && tous.find((n) => n.id === state.niveauCourant.id);
  const aJouer = courant || tous.find((n) => etoilesDe(n.id) < 3) || tous[0] || null;
  for (const tr of document.querySelectorAll("#niveaux-grille tr.niveau")) {
    tr.classList.toggle("courant", Boolean(state.niveauCourant) && tr.dataset.niveau === state.niveauCourant.id);
  }
  ecranNiveaux.hidden = false;
  choisirNiveau(aJouer);
  document.getElementById("niveaux-grille").focus();
}

function fermerNiveaux() {
  ecranNiveaux.hidden = true;
}

function rafraichirNotes() {
  const niveaux = tousLesNiveaux();
  for (const tr of document.querySelectorAll("#niveaux-grille tr.niveau")) {
    const niveau = niveaux.find((n) => n.id === tr.dataset.niveau);
    if (!niveau) continue;
    tr.querySelector(".col-note").innerHTML = etoilesSvg(etoilesDe(niveau.id));
    // Le coche VALIDÉ est indispensable : un niveau fini avec 0 étoile n'allume
    // aucune étoile, et sans lui l'élève le croirait jamais réussi.
    const reussi = niveauReussi(niveau.id);
    tr.classList.toggle("niveau-valide", reussi);
    tr.querySelector(".col-pont").innerHTML = reussi
      ? `<span class="valide" title="Niveau validé">${COCHE}</span>${formatKilograms(meilleureMasse(niveau.id))}`
      : "—";
  }
}

function etoilesSvg(nombre) {
  let html = `<span class="etoiles" title="${nombre} sur 3">`;
  for (let k = 0; k < 3; k++) {
    html += `<svg viewBox="0 0 13 13" aria-hidden="true"><path class="${k < nombre ? "etoile-pleine" : "etoile-vide"}" d="${CHEMIN_ETOILE}"/></svg>`;
  }
  return `${html}</span>`;
}

// ── Chargement d'un niveau ───────────────────────────────────────────────────

// Ouvrir un niveau, c'est reprendre SON pont là où il l'avait laissé : le
// dernier validé est rechargé tel quel. `neuf` force la page blanche — c'est
// « Faire un nouveau pont ». L'administrateur, lui, édite les niveaux et repart
// toujours de l'énoncé : son propre pont n'a rien à faire dans la fiche.
async function chargerNiveau(niveau, neuf = false) {
  if (!niveau) return;
  const pont = neuf || estAdmin() ? null : await pontSauvegarde(niveau);
  appliquerNiveau(niveau, pont);
  fermerNiveaux();
  fermerResultat();
}

// Le pont enregistré pour ce niveau, s'il correspond encore à l'énoncé actuel.
async function pontSauvegarde(niveau) {
  if (!aUnPont(niveau.id, signatureEnonce(niveau))) return null;
  return chargerPont(niveau.id);
}

// Met le niveau en place SANS toucher aux fenêtres : le dialogue peut rester
// ouvert par-dessus (c'est ce dont l'administrateur a besoin pour éditer).
// `pont` (facultatif) remplace la scène de l'énoncé par la construction de
// l'élève — qui CONTIENT déjà l'énoncé, marqué comme tel au moment où elle a
// été sauvée : rien d'autre à recoller.
function appliquerNiveau(niveau, pont = null) {
  loadStructure(pont ? structuredClone(pont) : buildLevel(niveau));
  annulerEssai();
  statutAffiche = ESSAI.AUCUN;
  state.wind.enabled = false; // les niveaux se jouent sans vent
  adopterNiveau(niveau);
  fitView();
}

// « Faire un nouveau pont » : on repart de l'énoncé nu. Sans danger pour le
// score — seul un pont PLUS LÉGER remplace l'enregistré — mais le brouillon à
// l'écran, lui, est perdu : on ne le jette pas sans demander.
function nouveauPont() {
  const niveau = state.niveauCourant;
  if (!niveau) return;
  if (massePont(state.structure) > 0
      && !window.confirm(CONFIRMATION_NOUVEAU_PONT)) {
    return;
  }
  appliquerNiveau(niveau, null);
  fermerResultat();
}

// Le bouton n'a de sens que si l'élève a un pont à quitter — et à retrouver.
function majBoutonNouveauPont() {
  const niveau = state.niveauCourant;
  const utile = Boolean(niveau) && !estAdmin() && aUnPont(niveau.id, signatureEnonce(niveau));
  document.getElementById("nouveau-pont-button").hidden = !utile;
}

// Prend la FICHE du niveau (nom, barème, matériaux) sans toucher à la scène.
function adopterNiveau(niveau) {
  state.niveauCourant = niveau;
  majBoutonNouveauPont();
  appliquerMateriauxAutorises(niveau.materiaux); // le niveau peut n'ouvrir qu'une partie du catalogue
  majTitre();
  refreshAfterModeChange();
}

function majTitre() {
  const titre = document.getElementById("niveau-courant");
  titre.textContent = state.niveauCourant ? state.niveauCourant.label : "";
  titre.title = state.niveauCourant ? state.niveauCourant.enonce : "";
}

// ── Afficheurs de la barre d'outils ──────────────────────────────────────────

export function majObjectif() {
  // Pendant un essai, la masse RELEVÉE au lancement : une fois le pont cassé, la
  // structure est pleine de morceaux et sa masse ne veut plus rien dire.
  const courante = state.essai.statut === ESSAI.AUCUN ? massePont(state.structure) : state.essai.masse;
  ecrire("structure-weight-display", formatKilograms(courante));

  const objectif = document.getElementById("objectif-display");
  if (state.niveauCourant) {
    const [troisEtoiles] = seuilsMasse(state.niveauCourant);
    ecrire("objectif-display", `≤ ${formatKilograms(troisEtoiles)}`);
    objectif.classList.toggle("objectif-atteint", courante > 0 && courante <= troisEtoiles);
  } else {
    ecrire("objectif-display", "—");
    objectif.classList.remove("objectif-atteint");
  }
  majEtat();
}

function majEtat() {
  const el = document.getElementById("etat-essai");
  let cle = "conception";
  let texte = "Non testé";
  if (state.essai.statut === ESSAI.REUSSI) {
    cle = "reussi";
    texte = "Validé";
  } else if (state.essai.statut === ESSAI.ECHOUE) {
    cle = "echoue";
    texte = "Non validé";
  } else if (state.mode === MODES.SIMULATION) {
    cle = state.isRunning ? "essai" : "pause";
    texte = state.isRunning ? "Essai en cours" : "En pause";
  }
  if (el.dataset.etat === cle) return;
  el.dataset.etat = cle;
  el.innerHTML = `${ICONES_ETAT[cle]}<span></span>`;
  el.lastChild.textContent = texte;
}

function ecrire(id, texte) {
  const el = document.getElementById(id);
  if (el.textContent !== texte) el.textContent = texte;
}

// ── Rapport d'essai ──────────────────────────────────────────────────────────

// Appelé à chaque rafraîchissement. La fenêtre de rapport n'est qu'un AFFICHAGE
// de l'essai en cours : elle s'ouvre quand le verdict tombe et se referme dès
// qu'il n'y a plus d'essai. C'est ce qui fait que les DEUX retours à la
// conception la font disparaître — « Arrêter l'essai » (barre d'outils ou menu)
// comme « Modifier le pont » (le rapport lui-même) passent tous deux par
// arreterEssai(), qui remet l'essai à zéro.
export function surVerdict() {
  const essai = state.essai;
  if (essai.statut === statutAffiche) return;
  statutAffiche = essai.statut;
  if (essai.statut === ESSAI.REUSSI) montrerReussite(essai);
  else if (essai.statut === ESSAI.ECHOUE) montrerEchec(essai);
  else fermerResultat();
}

function ouvrirRapport(reussi, titre) {
  document.getElementById("resultat-icone").innerHTML = ICONES_ETAT[reussi ? "reussi" : "echoue"];
  const titreEl = document.getElementById("resultat-titre");
  titreEl.textContent = titre;
  titreEl.className = reussi ? "resultat-reussi" : "resultat-echoue";
  const lignes = document.getElementById("resultat-lignes");
  lignes.innerHTML = "";
  return lignes;
}

function montrerReussite(essai) {
  const niveau = state.niveauCourant;
  // Le pont TEL QUE CONÇU, pas la structure déformée de fin d'essai : c'est
  // l'instantané pris au lancement (state.js::takeStructureSnapshot).
  const pont = exportStructure(state.structureSnapshot || state.structure);
  const bilan = enregistrerReussite(niveau.id, essai.etoiles, essai.masse, pont, signatureEnonce(niveau));
  rafraichirNotes();
  majBoutonNouveauPont();

  const seuils = seuilsMasse(niveau);
  const lignes = ouvrirRapport(true, "Pont validé");
  ligne(lignes, "Masse du pont", formatKilograms(essai.masse));
  const note = document.createElement("span");
  note.innerHTML = etoilesSvg(essai.etoiles);
  ligne(lignes, "Note", note);
  ligne(lignes, "Note maximale", `≤ ${formatKilograms(seuils[0])}`);
  if (essai.etoiles > 0 && essai.etoiles < 3) {
    ligne(lignes, "Étoile suivante", `≤ ${formatKilograms(seuils[3 - essai.etoiles - 1])}`);
  }
  // Ce qu'il advient de sa sauvegarde : l'élève doit savoir si ce pont-là est
  // celui qui restera, sans quoi il ne peut pas décider s'il doit recommencer.
  document.getElementById("resultat-detail").textContent = bilanSauvegarde(bilan);
  document.getElementById("resultat-suivant").hidden = !niveauSuivant(niveau);
  document.getElementById("resultat-niveaux").hidden = false;
  panneauResultat.hidden = false;
}

// Une phrase, en clair, sur ce que devient le pont qui vient d'être validé.
function bilanSauvegarde(bilan) {
  if (bilan.ancienneMasse === null) return "Pont enregistré : ce niveau rouvrira sur cette construction.";
  if (bilan.record) return `Nouveau record : ton pont précédent pesait ${formatKilograms(bilan.ancienneMasse)}. C'est celui-ci qui est conservé.`;
  return `Ton meilleur pont reste celui de ${formatKilograms(bilan.ancienneMasse)} : c'est lui qui est conservé.`;
}

function montrerEchec(essai) {
  const lignes = ouvrirRapport(false, "Pont non validé");
  ligne(lignes, "Masse du pont", formatKilograms(essai.masse));
  ligne(lignes, "Instant", `t = ${formatDecimal(state.simulationTime, 2)} s`);
  document.getElementById("resultat-detail").textContent = essai.raison;
  // Échec : une seule sortie, retourner à son pont. Ni « niveau suivant » ni
  // « liste des niveaux » — on ne propose pas de fuir, on propose de réparer.
  document.getElementById("resultat-suivant").hidden = true;
  document.getElementById("resultat-niveaux").hidden = true;
  panneauResultat.hidden = false;
}

function fermerResultat() {
  panneauResultat.hidden = true;
}
