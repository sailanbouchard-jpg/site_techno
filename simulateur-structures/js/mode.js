// mode.js
// ───────
// Le même moteur sert DEUX interfaces :
//
//   JOUEUR (par défaut)  — on enchaîne les niveaux. Palette de matériaux, outil
//     Choisir, Tester / Réinitialiser, zoom, pourcentages. Rien d'autre : pas de
//     véhicules à poser, pas d'appuis, pas de sol, pas de vent, pas de largeur de
//     grille, pas de sauvegarde. Les pièces de l'énoncé sont intouchables.
//
//   DEV (ajouter ?dev à l'URL) — l'atelier complet : tous les outils d'édition,
//     le vent, la grille, les sauvegardes de cartes, et le bouton « Solution »
//     de chaque niveau.
//
// Tout ce qui est réservé au dev porte l'attribut `data-dev` dans index.html ;
// style.css les masque en mode joueur. Ce fichier ne fait que dire dans quel
// mode on est et poser la classe correspondante sur <body>.

export const MODE_DEV = new URLSearchParams(window.location.search).has("dev");

export function appliquerModeInterface() {
  document.body.classList.add(MODE_DEV ? "interface-dev" : "interface-joueur");
}

// L'ADMINISTRATEUR est un troisième cas, indépendant du précédent : il se
// reconnaît à sa session sur le site (voir model/catalogue.js), pas à l'URL,
// et il débloque l'édition des niveaux. Tout ce qui porte `data-admin` reste
// masqué tant que cette classe n'est pas posée.
let modeAdmin = false;

export function appliquerModeAdmin(admin) {
  modeAdmin = Boolean(admin);
  document.body.classList.toggle("interface-admin", modeAdmin);
}

// Lu par le modèle (state.js) : l'administrateur n'a AUCUNE pièce protégée, il
// modifie et déplace tout, y compris ce que le joueur ne peut pas toucher.
export function estModeAdmin() {
  return modeAdmin;
}
