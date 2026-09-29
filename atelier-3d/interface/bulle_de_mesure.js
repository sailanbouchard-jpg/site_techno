/*
 * interface/bulle_de_mesure.js
 * ────────────────────────────
 * Les cotes d'un tracé en cours (longueur, angle…), affichées dans une bulle
 * qui suit le curseur : l'élève les lit là où il regarde, et voit ce qu'il
 * tape au clavier. Une ligne par cote ; celle qu'on tape est mise en valeur.
 */

import { creer } from "./elements.js";

const DECALAGE_PX = 18;
const SEPARATEUR = " · ";
// Le conseil que les tracés ajoutent en fin de texte, rangé à part dans la bulle.
const CONSEIL = /\s*\(([^)]*)\)\s*$/;

export function creerBulleDeMesure(vue, canvas) {
  const bulle = creer("div", { classe: "bulle-mesure", attributs: { "aria-live": "polite" } });
  bulle.hidden = true;
  vue.append(bulle);
  let position = { x: 0, y: 0 };

  function placer() {
    const cadre = vue.getBoundingClientRect();
    // La bulle reste dans la vue : près d'un bord, elle passe de l'autre côté du curseur.
    let x = position.x - cadre.left + DECALAGE_PX;
    let y = position.y - cadre.top + DECALAGE_PX;
    if (x + bulle.offsetWidth > cadre.width) x -= bulle.offsetWidth + DECALAGE_PX * 2;
    if (y + bulle.offsetHeight > cadre.height) y -= bulle.offsetHeight + DECALAGE_PX * 2;
    bulle.style.transform = "translate(" + Math.max(0, x) + "px, " + Math.max(0, y) + "px)";
  }

  canvas.addEventListener("pointermove", (evenement) => {
    position = { x: evenement.clientX, y: evenement.clientY };
    if (!bulle.hidden) placer();
  });

  return {
    afficher(texte) {
      bulle.hidden = !texte;
      if (!texte) return;
      const conseil = texte.match(CONSEIL);
      const lignes = texte.replace(CONSEIL, "").split(SEPARATEUR);
      const elements = lignes.map((ligne) => creer("div", { classe: /[▌=]/.test(ligne) ? "ligne-bulle tapee" : "ligne-bulle", texte: ligne }));
      if (conseil) elements.push(creer("div", { classe: "conseil-bulle", texte: conseil[1] }));
      bulle.replaceChildren(...elements);
      placer();
    },
  };
}
