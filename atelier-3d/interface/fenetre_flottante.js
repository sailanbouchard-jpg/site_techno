/*
 * interface/fenetre_flottante.js
 * ──────────────────────────────
 * Une fenêtre posée sur la vue, qu'on déplace en tirant son titre (tout
 * élément .titre-panneau qu'elle contient) et qui revient là où on l'a
 * laissée, d'une sélection à l'autre et d'une séance à l'autre. Elle reste
 * toujours entière dans la vue, même quand la fenêtre du navigateur rétrécit.
 */

const MARGE_PX = 6;

function lirePosition(cle) {
  try {
    const lue = JSON.parse(localStorage.getItem(cle) ?? "null");
    return lue !== null && Number.isFinite(lue.droite) && Number.isFinite(lue.haut) ? lue : null;
  } catch (_erreur) {
    return null;
  }
}

function ecrirePosition(cle, position) {
  try {
    localStorage.setItem(cle, JSON.stringify(position));
  } catch (_erreur) {
    // Stockage refusé (navigation privée) : la position vaut pour la séance.
  }
}

/*
 * fenetre : l'élément à déplacer, placé en absolu dans la zone de la vue ;
 * zone : l'élément dont il épouse les bords (la vue) ;
 * parDefaut : { droite, haut } en pixels depuis le coin haut-droit de la zone.
 * On retient la distance au bord droit : la vue qui s'élargit ne décolle pas
 * la fenêtre du côté où l'élève l'a rangée.
 */
export function creerFenetreFlottante(fenetre, zone, cle, parDefaut) {
  let position = lirePosition(cle) ?? { ...parDefaut };
  let glisse = null;

  function appliquer() {
    const cadre = zone.getBoundingClientRect();
    const largeur = fenetre.offsetWidth;
    const droite = Math.min(Math.max(MARGE_PX, position.droite), Math.max(MARGE_PX, cadre.width - largeur - MARGE_PX));
    const haut = Math.min(Math.max(MARGE_PX, position.haut), Math.max(MARGE_PX, cadre.height - 80));
    // La zone de la vue commence sous le bandeau : top et right comptent depuis elle.
    fenetre.style.right = droite + "px";
    fenetre.style.top = haut + "px";
    fenetre.style.maxHeight = Math.max(120, cadre.height - haut - MARGE_PX) + "px";
  }

  fenetre.addEventListener("pointerdown", (evenement) => {
    if (evenement.button !== 0 || evenement.target.closest(".titre-panneau") === null) return;
    if (evenement.target.closest("button, input, select")) return;
    evenement.preventDefault();
    fenetre.setPointerCapture(evenement.pointerId);
    glisse = { x: evenement.clientX, y: evenement.clientY, depart: { ...position } };
    fenetre.classList.add("en-deplacement");
  });
  fenetre.addEventListener("pointermove", (evenement) => {
    if (glisse === null) return;
    position = {
      droite: glisse.depart.droite - (evenement.clientX - glisse.x),
      haut: glisse.depart.haut + (evenement.clientY - glisse.y),
    };
    appliquer();
  });
  const finir = () => {
    if (glisse === null) return;
    glisse = null;
    fenetre.classList.remove("en-deplacement");
    // On retient la place réelle, une fois ramenée dans la vue.
    position = { droite: parseFloat(fenetre.style.right), haut: parseFloat(fenetre.style.top) };
    ecrirePosition(cle, position);
  };
  fenetre.addEventListener("pointerup", finir);
  fenetre.addEventListener("pointercancel", finir);
  new ResizeObserver(() => {
    if (!fenetre.hidden) appliquer();
  }).observe(zone);

  return {
    montrer(visible) {
      if (fenetre.hidden === !visible) return;
      fenetre.hidden = !visible;
      if (visible) appliquer();
    },
  };
}
