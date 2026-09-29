/*
 * interface/bulle_d_aide.js
 * ─────────────────────────
 * Au survol d'un bouton, une bulle dit ce qu'il fait : son nom et son
 * raccourci, une phrase d'explication et, s'il est grisé, ce qu'il faut pour
 * s'en servir. Les élèves n'ont pas l'habitude d'un logiciel de 3D : le nom
 * seul ne suffit pas toujours.
 *
 * Un élément déclare sa bulle avec aider() (attributs data-aide-*). Un simple
 * title est repris au premier survol, pour que toutes les bulles se
 * ressemblent : la bulle native du navigateur n'apparaît plus.
 */

// elements.js s'appuie sur ce module : on n'importe rien d'elle en retour.
function creer(balise, { classe, texte, attributs } = {}, enfants = []) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  for (const [nom, valeur] of Object.entries(attributs ?? {})) element.setAttribute(nom, valeur);
  element.append(...enfants.filter((enfant) => enfant !== null));
  return element;
}

// Le temps de viser : la bulle ne clignote pas quand la souris ne fait que passer.
const DELAI_MS = 450;
// D'un bouton à son voisin, la bulle suit presque tout de suite.
const DELAI_ENCHAINE_MS = 40;
const FENETRE_ENCHAINEMENT_MS = 600;
const ECART_PX = 6;
const BORD_PX = 4;

// « Grouper (Ctrl+G) » : ce qui est entre parenthèses à la fin est un raccourci.
const RACCOURCI_EN_FIN = /\s*\(((?:Ctrl|Maj|Alt|Suppr|Échap|Entrée|F\d*|[A-Z])(?:\+[^()]+)?)\)\s*$/;

/*
 * aide : { nom, terme?, raccourci?, texte?, geste?, condition? }
 *   terme      le mot du programme, en petit après le nom
 *   geste      comment s'en servir (« Clic ou glisser dans la vue »)
 *   condition  ce qui manque, montré seulement quand l'élément est grisé
 */
export function aider(element, aide) {
  element.removeAttribute("title");
  for (const cle of ["nom", "terme", "raccourci", "texte", "geste", "condition"]) {
    const attribut = "aide" + cle[0].toUpperCase() + cle.slice(1);
    if (aide[cle]) element.dataset[attribut] = aide[cle];
    else delete element.dataset[attribut];
  }
  // Un bouton sans texte garde un nom pour les lecteurs d'écran.
  if (aide.nom && element.textContent.trim() === "") element.setAttribute("aria-label", aide.nom);
  return element;
}

/* Change seulement ce qui manque pour activer l'élément. */
export function definirCondition(element, condition) {
  if (condition) element.dataset.aideCondition = condition;
  else delete element.dataset.aideCondition;
}

/* Un title devient une bulle : « Nom (raccourci) ». */
function reprendreLeTitre(element) {
  const titre = element.getAttribute("title");
  element.removeAttribute("title");
  if (!titre) return;
  const raccourci = titre.match(RACCOURCI_EN_FIN);
  aider(element, {
    nom: raccourci ? titre.slice(0, raccourci.index) : titre,
    raccourci: raccourci ? raccourci[1] : "",
    texte: element.dataset.aideTexte,
    condition: element.dataset.aideCondition,
  });
}

function trouver(cible) {
  const element = cible?.closest?.("[data-aide-nom], [title]") ?? null;
  if (element === null) return null;
  if (element.hasAttribute("title")) reprendreLeTitre(element);
  return element.dataset.aideNom ? element : null;
}

const estGrise = (element) => element.disabled === true || element.getAttribute("aria-disabled") === "true";

export function brancherLesBullesDAide() {
  const bulle = creer("div", { classe: "bulle-aide", attributs: { role: "tooltip" } });
  bulle.hidden = true;
  document.body.append(bulle);

  let cible = null;
  let minuterie = null;
  let fermeeA = 0;

  function remplir(element) {
    const d = element.dataset;
    const grise = estGrise(element) && d.aideCondition;
    const lignes = [
      creer("div", { classe: "tete-aide" }, [
        creer("strong", { texte: d.aideNom }),
        d.aideTerme ? creer("span", { classe: "terme-aide", texte: d.aideTerme }) : null,
        d.aideRaccourci ? creer("kbd", { texte: d.aideRaccourci }) : null,
      ]),
      d.aideTexte ? creer("p", { texte: d.aideTexte }) : null,
      d.aideGeste && !grise ? creer("p", { classe: "geste-aide", texte: d.aideGeste }) : null,
      grise ? creer("p", { classe: "condition-aide", texte: d.aideCondition }) : null,
    ];
    bulle.replaceChildren(...lignes.filter((ligne) => ligne !== null));
  }

  /* Sous l'élément, centrée ; au-dessus s'il n'y a pas la place ; jamais hors de la fenêtre. */
  function placer(element) {
    const r = element.getBoundingClientRect();
    const b = bulle.getBoundingClientRect();
    let haut = r.bottom + ECART_PX;
    if (haut + b.height > innerHeight - BORD_PX) haut = r.top - ECART_PX - b.height;
    const gauche = Math.min(Math.max(BORD_PX, r.left + r.width / 2 - b.width / 2), innerWidth - b.width - BORD_PX);
    bulle.style.left = gauche + "px";
    bulle.style.top = Math.max(BORD_PX, haut) + "px";
  }

  function montrer() {
    minuterie = null;
    if (cible === null || !cible.isConnected) return;
    remplir(cible);
    bulle.hidden = false;
    placer(cible);
  }

  function cacher() {
    clearTimeout(minuterie);
    minuterie = null;
    if (!bulle.hidden) fermeeA = performance.now();
    bulle.hidden = true;
    cible = null;
  }

  function viser(element) {
    if (element === cible) return;
    cacher();
    if (element === null) return;
    cible = element;
    const enchaine = performance.now() - fermeeA < FENETRE_ENCHAINEMENT_MS;
    minuterie = setTimeout(montrer, enchaine ? DELAI_ENCHAINE_MS : DELAI_MS);
  }

  document.addEventListener("pointerover", (evenement) => {
    if (evenement.pointerType === "touch") return;
    viser(trouver(evenement.target));
  });
  document.addEventListener("pointerout", (evenement) => {
    if (cible !== null && !cible.contains(evenement.relatedTarget)) cacher();
  });
  // Cliquer, taper ou faire défiler : la bulle a fait son travail.
  document.addEventListener("pointerdown", cacher, true);
  document.addEventListener("keydown", cacher, true);
  document.addEventListener("wheel", cacher, { capture: true, passive: true });
  // Au clavier, la bulle suit le focus.
  document.addEventListener("focusin", (evenement) => {
    if (evenement.target.matches?.(":focus-visible")) viser(trouver(evenement.target));
  });
  document.addEventListener("focusout", cacher);
}
