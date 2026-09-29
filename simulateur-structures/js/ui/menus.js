// ui/menus.js
// ───────────
// Les COMMANDES du logiciel et la barre de menus.
//
// Une commande a un nom et une action, plus deux prédicats facultatifs :
// `actif()` (sinon elle est grisée) et `coche()` (bascule cochée dans un menu,
// bouton enfoncé dans une barre d'outils). Le même nom sert à l'entrée de menu
// et au bouton de barre d'outils (attribut data-commande) comme au raccourci
// clavier : une seule définition, trois accès. Les modules qui possèdent les
// actions les enregistrent (toolbar.js, levelHud.js).
//
// La barre de menus se comporte comme sous Windows : un clic ouvre un menu, le
// survol passe d'un menu à l'autre tant qu'un menu est ouvert, un clic ailleurs
// ou Échap referme.

const commandes = new Map();
let menuOuvert = null;

// Raccourcis clavier → nom de commande. Clé : touche, préfixée de « ctrl+ ».
const RACCOURCIS = {
  " ": "basculer-essai",
  "+": "zoom-avant",
  "=": "zoom-avant",
  "-": "zoom-arriere",
  "0": "vue-ensemble",
  "ctrl+o": "niveaux",
  "F1": "aide-commandes",
};

export function enregistrerCommande(nom, executer, options = {}) {
  commandes.set(nom, { executer, actif: options.actif, coche: options.coche, libelle: options.libelle });
}

export function executerCommande(nom) {
  const commande = commandes.get(nom);
  if (!commande || (commande.actif && !commande.actif())) return false;
  commande.executer();
  rafraichirCommandes();
  return true;
}

// Aligne l'état (grisé, coché, libellé) de tous les éléments [data-commande].
// Appelée à chaque ouverture de menu et au rythme des affichages (main.js) ;
// n'écrit dans le DOM que ce qui change.
export function rafraichirCommandes() {
  for (const el of document.querySelectorAll("[data-commande]")) {
    const commande = commandes.get(el.dataset.commande);
    if (!commande) continue;
    const grise = commande.actif ? !commande.actif() : false;
    if (el.disabled !== grise) el.disabled = grise;
    const estMenu = el.classList.contains("menu-item");
    if (commande.coche) {
      const attribut = estMenu ? "aria-checked" : "aria-pressed";
      const valeur = String(Boolean(commande.coche()));
      if (el.getAttribute(attribut) !== valeur) el.setAttribute(attribut, valeur);
    }
    // Libellé variable : dans un menu il vit dans .menu-libelle, sur un bouton de
    // barre dans son <span> de texte. Un bouton sans texte (icône seule) n'a rien
    // à mettre à jour — son infobulle suffit.
    if (commande.libelle) {
      const span = el.querySelector(estMenu ? ".menu-libelle" : "span");
      const texte = commande.libelle();
      if (span && span.textContent !== texte) span.textContent = texte;
    }
  }
}

export function initMenus() {
  // Clic sur tout élément porteur d'une commande (menus, barres, palettes).
  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-commande]");
    if (!el || el.disabled) return;
    fermerMenus();
    executerCommande(el.dataset.commande);
  });

  // Les boutons de barre ne prennent pas le focus (comme dans un logiciel de
  // bureau) : la barre d'espace reste ainsi au raccourci « Lancer / Pause ».
  document.addEventListener("mousedown", (event) => {
    if (event.target.closest(".bouton-barre, .element, .bouton-outil, .menu-item, .menu-titre")) event.preventDefault();
    if (menuOuvert && !event.target.closest(".barre-menus")) fermerMenus();
  });

  for (const menu of document.querySelectorAll(".barre-menus .menu")) {
    const titre = menu.querySelector(".menu-titre");
    titre.addEventListener("mousedown", () => {
      if (menuOuvert === menu) fermerMenus();
      else ouvrirMenu(menu);
    });
    titre.addEventListener("mouseenter", () => {
      if (menuOuvert && menuOuvert !== menu) ouvrirMenu(menu);
    });
  }

  document.addEventListener("keydown", surTouche, true);
}

function ouvrirMenu(menu) {
  fermerMenus();
  rafraichirCommandes();
  menu.classList.add("ouvert");
  menu.querySelector(".menu-liste").hidden = false;
  menuOuvert = menu;
}

export function fermerMenus() {
  if (!menuOuvert) return;
  menuOuvert.classList.remove("ouvert");
  menuOuvert.querySelector(".menu-liste").hidden = true;
  menuOuvert = null;
}

// Écouteur en phase de CAPTURE : Échap referme d'abord un menu ouvert, avant
// que l'éditeur ne l'interprète (fin de pose, retour à la sélection).
function surTouche(event) {
  if (event.key === "Escape" && menuOuvert) {
    fermerMenus();
    event.stopPropagation();
    return;
  }
  const tag = (event.target && event.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (document.querySelector(".voile:not([hidden])")) return; // un dialogue gère ses touches
  const cle = (event.ctrlKey || event.metaKey ? "ctrl+" : "") + (event.key.length === 1 ? event.key.toLowerCase() : event.key);
  const nom = RACCOURCIS[cle];
  if (!nom || !commandes.has(nom)) return;
  event.preventDefault();
  executerCommande(nom);
}
