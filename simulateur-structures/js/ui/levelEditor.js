// ui/levelEditor.js
// ─────────────────
// L'ÉDITEUR DE NIVEAUX, réservé à l'administrateur. Il occupe le bas du dialogue
// « Niveaux ».
//
// Tout ce qui se DESSINE se dessine sur la scène, avec les outils ordinaires :
// le relief et sa nature, les appuis, les éléments de base, les véhicules et
// leur point de départ, les bateaux. « Enregistrer » sauve la fiche ET la scène
// à l'écran d'un seul geste : c'est le SEUL bouton qui enregistre quoi que ce
// soit. Tout ce que la scène contient devient intouchable pour le joueur.
//
// Rien n'est exigé pour enregistrer : un niveau se construit en plusieurs fois,
// et un brouillon vide est légitime. Ce qui manque est simplement DIT.
//
// Ce formulaire ne garde donc que ce qui ne se dessine PAS : la catégorie, le
// nom, l'énoncé, les matériaux ouverts au joueur, l'objectif 3 étoiles (les deux
// autres notes s'en déduisent) et le cadrage de départ.
//
// Ni physique ni géométrie ici : on lit et on réécrit les FICHES de levels.js.

import {
  LEVEL_CATEGORIES, appliquerCatalogue, catalogueFiches, massePont, seuilsMasse,
} from "../model/levels.js";
import { enregistrerCatalogue } from "../model/catalogue.js";
import { exportStructure } from "../model/Structure.js";
import { BEAM_TYPES } from "../model/materials.js";
import { state, MODES } from "../state.js";
import { ZOOM_LEVEL_MIN, ZOOM_LEVEL_MAX } from "../render/styleConfig.js";
import { categorie, ligne } from "./proprietes.js";
import { formatKilograms } from "../units.js";

let champs = null; // les contrôles du formulaire, construits une fois
let ficheEnCours = null; // copie de travail de la fiche sélectionnée
let surCatalogueModifie = null; // rappel vers levelHud pour rebâtir la liste

export function initEditeurNiveaux({ surModification }) {
  surCatalogueModifie = surModification;
  const corps = document.getElementById("editeur-champs");
  if (!corps) return;
  champs = construireFormulaire(corps);

  brancher("editeur-nouveau", nouveauNiveau);
  brancher("editeur-enregistrer", enregistrer);
  brancher("editeur-supprimer", supprimer);
  brancher("editeur-monter", () => deplacer(-1));
  brancher("editeur-descendre", () => deplacer(1));
}

// Un clic doit TOUJOURS aboutir à un message : sans cela, une panne interne ne
// se voit pas et le bouton a l'air mort. L'erreur est affichée telle quelle,
// pour qu'on puisse la rapporter.
function brancher(id, action) {
  document.getElementById(id).addEventListener("click", async () => {
    try {
      await action();
    } catch (erreur) {
      message(`Échec : ${erreur && erreur.message ? erreur.message : erreur}`, true);
      throw erreur; // la console garde la pile complète
    }
  });
}

// ── Formulaire ───────────────────────────────────────────────────────────────

function construireFormulaire(corps) {
  corps.innerHTML = "";
  const c = {};

  categorie(corps, "Niveau");
  c.categorie = selection(LEVEL_CATEGORIES.map((cat) => [cat.id, cat.label]));
  ligne(corps, "Catégorie", c.categorie);

  c.label = texte();
  ligne(corps, "Nom", c.label);

  c.enonce = document.createElement("textarea");
  c.enonce.rows = 3;
  c.enonce.className = "champ-texte";
  ligne(corps, "Énoncé", c.enonce);

  // ── L'énoncé se dessine, il ne se saisit pas ──
  categorie(corps, "Scène de l'énoncé");
  c.resume = document.createElement("span");
  ligne(corps, "Contenu", c.resume).title =
    "Ce que « Enregistrer » figera comme point de départ du niveau : la scène "
    + "telle qu'elle est à l'écran. Pour la changer, la dessiner avec les outils.";

  // ── Matériaux ──
  // Contrainte d'énoncé : franchir un vide en bois seul n'est pas le même
  // problème qu'en acier. Tout coché = aucune contrainte (la fiche ne porte
  // alors rien) ; décocher retire le matériau de la barre des éléments du joueur.
  categorie(corps, "Matériaux autorisés");
  c.materiaux = new Map();
  const liste = document.createElement("div");
  liste.className = "editeur-materiaux";
  for (const beamType of BEAM_TYPES) {
    const coche = document.createElement("input");
    coche.type = "checkbox";
    const etiquette = document.createElement("label");
    etiquette.className = "editeur-materiau";
    etiquette.append(coche, beamType.label);
    liste.appendChild(etiquette);
    c.materiaux.set(beamType.id, coche);
  }
  ligne(corps, "Le joueur peut poser", liste).title =
    "Les matériaux décochés disparaissent de la barre des éléments pour ce niveau. "
    + "Tout cocher n'impose aucune contrainte.";

  const boutonsMateriaux = document.createElement("span");
  boutonsMateriaux.className = "editeur-cadrage-boutons";
  boutonsMateriaux.append(
    petitBouton("Tout", "Ouvrir tout le catalogue", () => cocherMateriaux(BEAM_TYPES.map((t) => t.id))),
    petitBouton("Aucun", "Tout décocher, pour n'en rouvrir que quelques-uns", () => cocherMateriaux([])),
  );
  ligne(corps, "", boutonsMateriaux);

  // ── Notation ──
  categorie(corps, "Notation");
  c.objectif3 = nombre(0, 1e6, 100);
  ligne(corps, "Objectif 3 étoiles (kg)", c.objectif3).title =
    "Masse maximale du pont pour la note maximale.";
  // Laissés vides, ces deux seuils se déduisent de l'objectif (×1,4 et ×2,1).
  // Les renseigner sert quand la règle proportionnelle tombe mal sur ce niveau.
  c.objectif2 = nombre(0, 1e6, 100);
  ligne(corps, "Objectif 2 étoiles (kg)", c.objectif2).title =
    "Laisser vide pour le calcul automatique (1,4 × l'objectif 3 étoiles).";
  c.objectif1 = nombre(0, 1e6, 100);
  ligne(corps, "Objectif 1 étoile (kg)", c.objectif1).title =
    "Laisser vide pour le calcul automatique (2,1 × l'objectif 3 étoiles). Au-delà, le pont est validé mais ne rapporte rien.";
  c.bareme = document.createElement("span");
  ligne(corps, "Barème appliqué", c.bareme);
  ligne(corps, "", petitBouton(
    "Prendre la masse du pont actuel",
    "Recopier ici la masse de ce qui est construit par-dessus l'énoncé",
    () => {
      c.objectif3.value = String(Math.round(massePont(state.structure)));
      majBareme();
      message("Objectif repris du pont à l'écran. Il reste à enregistrer.");
    },
  ));
  for (const champ of [c.objectif3, c.objectif2, c.objectif1]) champ.addEventListener("input", majBareme);

  // ── Cadrage ──
  // Trois champs vides = cadrage automatique (la zone de travail du niveau tient
  // à l'écran). Renseignés, ils l'imposent.
  categorie(corps, "Cadrage de la vue");
  c.zoom = nombre(ZOOM_LEVEL_MIN, ZOOM_LEVEL_MAX, 0.05);
  ligne(corps, "Zoom de départ (×)", c.zoom).title =
    "Laisser vide pour un cadrage automatique sur la zone de travail.";
  c.centreX = nombre(0, 50, 0.5);
  ligne(corps, "Centre — x (m)", c.centreX);
  c.centreY = nombre(0, 24, 0.5);
  ligne(corps, "Centre — y (m)", c.centreY).title =
    "Y descend : plus la valeur est petite, plus la vue regarde haut.";

  const boutonsCadrage = document.createElement("span");
  boutonsCadrage.className = "editeur-cadrage-boutons";
  boutonsCadrage.append(
    petitBouton("Reprendre la vue actuelle", "Recopier le zoom et le centre de la vue affichée derrière ce dialogue", () => {
      c.zoom.value = String(Math.round(state.zoomLevel * 100) / 100);
      c.centreX.value = String(Math.round(state.cameraX * 2) / 2);
      c.centreY.value = String(Math.round(state.cameraY * 2) / 2);
      message("Cadrage repris de la vue actuelle. Il reste à enregistrer.");
    }),
    petitBouton("Automatique", "Revenir au cadrage calculé sur la zone de travail", () => {
      c.zoom.value = "";
      c.centreX.value = "";
      c.centreY.value = "";
      message("Cadrage automatique. Il reste à enregistrer.");
    }),
  );
  ligne(corps, "", boutonsCadrage);

  return c;
}

function petitBouton(libelle, aide, surClic) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "bouton bouton-lien";
  bouton.textContent = libelle;
  bouton.title = aide;
  bouton.addEventListener("click", surClic);
  return bouton;
}

function texte() {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "champ-texte";
  return input;
}

function nombre(min, max, pas) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(pas);
  return input;
}

function selection(options) {
  const select = document.createElement("select");
  for (const [valeur, libelle] of options) {
    const option = document.createElement("option");
    option.value = valeur;
    option.textContent = libelle;
    select.appendChild(option);
  }
  return select;
}

// ── Remplissage / lecture ────────────────────────────────────────────────────

// Montre la fiche du niveau choisi, ou une fiche BLANCHE (niveau null) quand il
// n'y a encore rien à choisir : « Enregistrer » crée alors le premier niveau.
// Appelé par levelHud à chaque sélection.
export function montrerNiveau(niveau) {
  if (!champs) return;
  if (!niveau) return ficheBlanche();
  ficheEnCours = structuredClone(niveau.fiche);
  // Un niveau encore décrit par ses paramètres (ceux livrés avec le code) devient
  // une SCÈNE au premier enregistrement : c'est la scène à l'écran qui part avec
  // la fiche, et choisir la ligne vient justement de la mettre en place.
  if (!Number.isFinite(ficheEnCours.objectif3)) ficheEnCours.objectif3 = Math.round(niveau.objectif3);

  champs.categorie.value = categorieDe(niveau.id);
  champs.label.value = ficheEnCours.label || "";
  champs.enonce.value = ficheEnCours.enonce || "";
  champs.objectif3.value = String(Math.round(ficheEnCours.objectif3));
  champs.objectif2.value = Number.isFinite(ficheEnCours.objectif2) ? String(Math.round(ficheEnCours.objectif2)) : "";
  champs.objectif1.value = Number.isFinite(ficheEnCours.objectif1) ? String(Math.round(ficheEnCours.objectif1)) : "";
  // Pas de liste sur la fiche = niveau sans contrainte : tout est coché.
  cocherMateriaux(ficheEnCours.materiaux || BEAM_TYPES.map((type) => type.id));
  champs.zoom.value = Number.isFinite(ficheEnCours.zoom) ? String(ficheEnCours.zoom) : "";
  champs.centreX.value = Number.isFinite(ficheEnCours.centreX) ? String(ficheEnCours.centreX) : "";
  champs.centreY.value = Number.isFinite(ficheEnCours.centreY) ? String(ficheEnCours.centreY) : "";
  majResume();
  majBareme();
  message("");
}

function ficheBlanche() {
  ficheEnCours = null;
  champs.label.value = "";
  champs.enonce.value = "";
  champs.objectif3.value = "";
  champs.objectif2.value = "";
  champs.objectif1.value = "";
  cocherMateriaux(BEAM_TYPES.map((type) => type.id));
  champs.zoom.value = "";
  champs.centreX.value = "";
  champs.centreY.value = "";
  majResume();
  majBareme();
  message("Aucun niveau : « Enregistrer » créera le premier à partir de la scène à l'écran.");
}

function cocherMateriaux(ids) {
  for (const [id, coche] of champs.materiaux) coche.checked = ids.includes(id);
}

function materiauxCoches() {
  return [...champs.materiaux].filter(([, coche]) => coche.checked).map(([id]) => id);
}

// La scène qui part avec la fiche : celle de l'écran. Pendant un essai, c'est
// l'instantané pris au lancement — on n'enregistre pas un pont à moitié cassé.
// Choisir un niveau dans la liste le met en place derrière le dialogue
// (levelHud::choisirNiveau) : la scène à l'écran est donc toujours celle de la
// fiche qu'on édite.
function sceneAEnregistrer() {
  const source = state.mode === MODES.EDIT ? state.structure : state.structureSnapshot;
  return exportStructure(source || state.structure);
}

function majResume() {
  const scene = sceneAEnregistrer();
  const poutres = scene.beams || [];
  // Ce qui a été bâti PAR-DESSUS l'énoncé (une solution de référence, un essai)
  // serait figé dans l'énoncé lui-même : le dire, puisqu'on n'empêche rien.
  const ajoutes = poutres.filter((beam) => !beam.duNiveau).length;
  const resume = [
    `${poutres.length} élément(s)`,
    `${(scene.nodes || []).filter((n) => n.fixed && n.kind === "joint").length} appui(s)`,
    `${(scene.mobileLoads || []).length} véhicule(s)`,
    `${(scene.terrain || []).length} île(s) de sol`,
    `${(scene.bateaux || []).length} bateau(x)`,
  ].join(" · ");
  champs.resume.textContent = ajoutes > 0
    ? `${resume} — dont ${ajoutes} bâti(s) par-dessus, qui passera(ont) dans l'énoncé`
    : resume;
}

// Le barème RÉELLEMENT appliqué, seuils imposés compris, tel que le joueur le
// vivra. Les champs vides affichent en filigrane ce que le calcul leur donnerait.
function majBareme() {
  const objectif = Number(champs.objectif3.value) || 0;
  const auto = seuilsMasse({ objectif3: objectif });
  champs.objectif2.placeholder = objectif > 0 ? String(Math.round(auto[1])) : "";
  champs.objectif1.placeholder = objectif > 0 ? String(Math.round(auto[2])) : "";
  const seuils = seuilsMasse(seuilsSaisis(objectif));
  champs.bareme.textContent = objectif > 0
    ? `3 ★ ≤ ${formatKilograms(seuils[0])} · 2 ★ ≤ ${formatKilograms(seuils[1])} · 1 ★ ≤ ${formatKilograms(seuils[2])}`
    : "à définir";
}

// Les trois objectifs tels que le formulaire les décrit (null = automatique).
function seuilsSaisis(objectif3) {
  return {
    objectif3,
    objectif2: valeurOuNull(champs.objectif2),
    objectif1: valeurOuNull(champs.objectif1),
  };
}

// La fiche telle que le formulaire la décrit maintenant.
function lireFormulaire() {
  const fiche = {
    // Pas de fiche sélectionnée (catalogue vide) : on en crée une.
    id: ficheEnCours ? ficheEnCours.id : identifiantLibre(champs.categorie.value),
    label: champs.label.value.trim() || "Sans nom",
    enonce: champs.enonce.value.trim(),
    structure: sceneAEnregistrer(),
    objectif3: Math.max(0, Number(champs.objectif3.value) || 0),
  };
  // Seuil laissé vide = pas de champ sur la fiche : le calcul automatique
  // reprend la main, et suivra un changement futur des facteurs par défaut.
  const objectif2 = valeurOuNull(champs.objectif2);
  const objectif1 = valeurOuNull(champs.objectif1);
  if (objectif2 !== null) fiche.objectif2 = Math.max(0, objectif2);
  if (objectif1 !== null) fiche.objectif1 = Math.max(0, objectif1);
  // Tout coché = pas de contrainte : la fiche ne porte alors pas de liste, ce qui
  // la garde lisible et la rend insensible à un ajout futur au catalogue.
  const materiaux = materiauxCoches();
  if (materiaux.length < BEAM_TYPES.length) fiche.materiaux = materiaux;
  // Le cadrage n'est imposé que si les TROIS champs sont renseignés ; sinon la
  // fiche n'en porte aucun et le cadrage automatique reprend la main.
  const zoom = valeurOuNull(champs.zoom);
  const centreX = valeurOuNull(champs.centreX);
  const centreY = valeurOuNull(champs.centreY);
  if (zoom !== null && centreX !== null && centreY !== null) {
    Object.assign(fiche, { zoom, centreX, centreY });
  }
  return fiche;
}

function valeurOuNull(champ) {
  if (champ.value.trim() === "") return null;
  const valeur = Number(champ.value);
  return Number.isFinite(valeur) ? valeur : null;
}

// Ce qui manque encore au niveau pour être JOUABLE. Rien de tout cela n'empêche
// d'enregistrer : on le dit après coup, pour que l'administrateur sache où il en
// est sans être bloqué au milieu de son travail.
function manques(fiche) {
  const scene = fiche.structure || {};
  const liste = [];
  if (!(scene.beams || []).some((beam) => beam.isRoad)) liste.push("pas de route");
  if ((scene.mobileLoads || []).length === 0) liste.push("pas de véhicule");
  if (!(fiche.objectif3 > 0)) liste.push("pas d'objectif");
  // Un seuil imposé plus SÉVÈRE que le précédent rend sa note inatteignable :
  // le joueur sauterait directement de 3 étoiles à 1, sans rien pour l'expliquer.
  const [s3, s2, s1] = seuilsMasse(fiche);
  if (s2 < s3 || s1 < s2) liste.push("seuils d'étoiles dans le désordre (3 ★ ≤ 2 ★ ≤ 1 ★)");
  if (fiche.materiaux && fiche.materiaux.length === 0) liste.push("aucun matériau autorisé");
  return liste;
}

// ── Actions ──────────────────────────────────────────────────────────────────

function categorieDe(idNiveau) {
  const trouvee = LEVEL_CATEGORIES.find((cat) => cat.levels.some((n) => n.id === idNiveau));
  return trouvee ? trouvee.id : LEVEL_CATEGORIES[0].id;
}

function identifiantLibre(idCategorie) {
  const pris = new Set(catalogueFiches().flatMap((cat) => cat.niveaux.map((n) => n.id)));
  let numero = 1;
  while (pris.has(`${idCategorie}-${numero}`)) numero += 1;
  return `${idCategorie}-${numero}`;
}

function appliquer(fiches, idSelection) {
  appliquerCatalogue(fiches);
  surCatalogueModifie(idSelection);
}

function nouveauNiveau() {
  const idCategorie = champs.categorie.value;
  const fiches = catalogueFiches();
  const cible = fiches.find((cat) => cat.id === idCategorie);
  const neuve = {
    id: identifiantLibre(idCategorie),
    label: "Nouveau niveau",
    enonce: "",
    structure: sceneAEnregistrer(), // on part de ce qui est à l'écran
    objectif3: 0,
  };
  cible.niveaux.push(neuve);
  appliquer(fiches, neuve.id);
  message("Niveau créé à partir de la scène actuelle. Règle l'objectif, puis enregistre.");
}

async function enregistrer() {
  const fiche = lireFormulaire();
  const idCategorie = champs.categorie.value;
  const fiches = catalogueFiches();
  // On retire la fiche de partout, puis on la repose dans sa catégorie : c'est
  // ce qui permet de la DÉPLACER d'une catégorie à l'autre.
  let rangInitial = -1;
  for (const cat of fiches) {
    const rang = cat.niveaux.findIndex((n) => n.id === fiche.id);
    if (rang !== -1) {
      if (cat.id === idCategorie) rangInitial = rang;
      cat.niveaux.splice(rang, 1);
    }
  }
  const cible = fiches.find((cat) => cat.id === idCategorie);
  if (rangInitial === -1) cible.niveaux.push(fiche);
  else cible.niveaux.splice(rangInitial, 0, fiche);

  appliquer(fiches, fiche.id);
  message("Enregistrement…");
  const erreur = await enregistrerCatalogue(fiches);
  if (erreur) return message(erreur, true);
  const restant = manques(fiche);
  message(restant.length === 0
    ? "Niveau enregistré."
    : `Niveau enregistré, encore en brouillon : ${restant.join(", ")}.`);
}

async function supprimer() {
  if (!ficheEnCours) return message("Aucun niveau sélectionné : il n'y a rien à supprimer.", true);
  if (!window.confirm(`Supprimer définitivement « ${ficheEnCours.label} » ?`)) {
    return message("Suppression annulée.");
  }
  const fiches = catalogueFiches();
  for (const cat of fiches) {
    const rang = cat.niveaux.findIndex((n) => n.id === ficheEnCours.id);
    if (rang !== -1) cat.niveaux.splice(rang, 1);
  }
  appliquer(fiches, null);
  const erreur = await enregistrerCatalogue(fiches);
  if (erreur) return message(erreur, true);
  const reste = catalogueFiches().some((cat) => cat.niveaux.length > 0);
  message(reste ? "Niveau supprimé." : "Dernier niveau supprimé : le catalogue est vide.");
}

// Monte ou descend le niveau dans sa catégorie (l'ordre de la liste est celui du
// jeu, et décide du « niveau suivant »).
async function deplacer(sens) {
  if (!ficheEnCours) return message("Aucun niveau sélectionné : il n'y a rien à déplacer.", true);
  const fiches = catalogueFiches();
  const cat = fiches.find((c) => c.niveaux.some((n) => n.id === ficheEnCours.id));
  if (!cat) return message("Ce niveau n'est pas encore enregistré : enregistre-le d'abord.", true);
  const rang = cat.niveaux.findIndex((n) => n.id === ficheEnCours.id);
  const cible = rang + sens;
  if (cible < 0 || cible >= cat.niveaux.length) {
    return message(sens < 0 ? "Déjà en tête de sa catégorie." : "Déjà en fin de catégorie.");
  }
  const [fiche] = cat.niveaux.splice(rang, 1);
  cat.niveaux.splice(cible, 0, fiche);
  appliquer(fiches, fiche.id);
  const erreur = await enregistrerCatalogue(fiches);
  message(erreur || `Déplacé : ${sens < 0 ? "monté" : "descendu"} d'un rang.`, Boolean(erreur));
}

function message(texteMessage, erreur = false) {
  const zone = document.getElementById("editeur-message");
  if (!zone) return;
  zone.textContent = texteMessage;
  zone.classList.toggle("editeur-message-erreur", erreur);
}
