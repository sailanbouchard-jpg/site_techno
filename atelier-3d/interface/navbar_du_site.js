/*
 * interface/navbar_du_site.js
 * ───────────────────────────
 * La navbar du site, posée à gauche de l'atelier par le serveur. Elle est
 * ouverte à l'arrivée, sauf sur un écran trop étroit pour elle et l'atelier ;
 * la languette la replie pour donner la place à la vue, et la rouvre. Ouvert
 * hors du site, l'atelier n'a pas de navbar : la languette reste cachée.
 */

// En dessous de cette largeur de fenêtre, la navbar démarre repliée.
const LARGEUR_POUR_OUVRIR_PX = 1400;

const TITRES = {
  ouverte: "Replier le menu du site",
  repliee: "Ouvrir le menu du site",
};

export function brancherLaNavbarDuSite(languette) {
  const navbar = document.getElementById(languette.getAttribute("aria-controls"));
  if (navbar === null) return;

  document.body.classList.add("avec-navbar");
  document.body.classList.toggle("navbar-repliee", globalThis.innerWidth < LARGEUR_POUR_OUVRIR_PX);
  languette.hidden = false;

  function afficher() {
    const repliee = document.body.classList.contains("navbar-repliee");
    languette.title = repliee ? TITRES.repliee : TITRES.ouverte;
    languette.setAttribute("aria-label", languette.title);
    languette.setAttribute("aria-expanded", String(!repliee));
  }

  languette.addEventListener("click", () => {
    document.body.classList.toggle("navbar-repliee");
    afficher();
  });
  afficher();
}
