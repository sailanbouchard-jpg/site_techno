// ui/aide.js
// ──────────
// Le dialogue « Souris et clavier » (menu ?, touche F1) : la liste des gestes
// et des raccourcis, rien de plus.

import { enregistrerCommande } from "./menus.js";

export function initAide() {
  const ecran = document.getElementById("ecran-aide");
  const ok = document.getElementById("aide-ok");
  const fermer = () => { ecran.hidden = true; };
  enregistrerCommande("aide-commandes", () => {
    ecran.hidden = false;
    ok.focus();
  });
  document.getElementById("aide-fermer").addEventListener("click", fermer);
  ok.addEventListener("click", fermer);
  ecran.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      fermer();
    }
  });
}
