/*
 * interface/commandes_de_vue.js
 * ─────────────────────────────
 * Ce qui entoure la vue 3D sans en faire partie : les boutons Iso et Cadrer
 * sous le cube d'orientation, le dépôt d'un fichier STL, et les poignées qui
 * élargissent les colonnes.
 */

import { creer, bouton } from "./elements.js";
import { aider } from "./bulle_d_aide.js";
import { TYPE_DE_GLISSER } from "./ruban.js";

const CLE_LARGEURS = "atelier-3d:largeurs";

/* Sans 3D, la vue explique ce qui se passe au lieu de rester blanche. */
export function afficherPanneDeLaVue(vue, message) {
  vue.replaceChildren(creer("p", { classe: "inspecteur-vide", texte: message }));
}

/* actions : { placer(nom), cadrer(), vueEn3D(actif) }. Les autres vues se choisissent sur le cube. */
export function creerBoutonsDeVue(conteneur, actions) {
  const iso = bouton({ icone: "vue", texte: "3D", aide: { nom: "Vue 3D", texte: "Revient à la vue en perspective, de trois quarts." }, surClic: () => actions.placer("iso") });

  // Pendant une esquisse : face au plan (2D), ou libre de tourner autour (3D).
  const caseDeLInterrupteur = creer("input", { attributs: { type: "checkbox", role: "switch" } });
  const interrupteur = creer("label", { classe: "interrupteur-vue" }, [creer("span", { classe: "pilule" }, [
    creer("span", { classe: "libelle-interrupteur", texte: "2D" }),
    caseDeLInterrupteur,
    creer("span", { classe: "glissiere", attributs: { "aria-hidden": "true" } }),
    creer("span", { classe: "libelle-interrupteur", texte: "3D" }),
  ])]);
  aider(interrupteur, {
    nom: "Esquisse en 3D",
    texte: "En 3D, la vue tourne librement autour de l'esquisse, à partir de la vue actuelle : pour viser un point de référence parmi plusieurs confondus. Le tracé reste dans le plan de l'esquisse. En 2D, la vue revient face au plan.",
  });
  caseDeLInterrupteur.addEventListener("change", () => actions.vueEn3D(caseDeLInterrupteur.checked));
  interrupteur.hidden = true;

  conteneur.append(interrupteur, iso, bouton({ icone: "cadrer", texte: "Cadrer", aide: { nom: "Cadrer", raccourci: "F", texte: "Ajuste la vue pour montrer tout le projet." }, surClic: actions.cadrer }));
  return {
    /* Pendant une esquisse en 2D, la vue reste face au plan : seul « Cadrer » sert. */
    autoriserLesVues(autorise) {
      iso.disabled = !autorise;
    },
    /* L'interrupteur 2D / 3D n'existe que dans une esquisse ouverte. */
    montrerInterrupteur(visible, en3D) {
      interrupteur.hidden = !visible;
      caseDeLInterrupteur.checked = en3D;
    },
  };
}

/*
 * La vue accepte deux sortes de dépôts : des fichiers STL venus de
 * l'explorateur, et une forme glissée depuis la colonne de gauche.
 * actions : { importer(fichiers), deposerForme(nomDuType, x, y) }
 */
export function activerDepotSurLaVue(vue, zoneDeDepot, actions) {
  const porteDesFichiers = (evenement) => [...evenement.dataTransfer.types].includes("Files");
  const porteUneForme = (evenement) => [...evenement.dataTransfer.types].includes(TYPE_DE_GLISSER);

  vue.addEventListener("dragover", (evenement) => {
    if (!porteDesFichiers(evenement) && !porteUneForme(evenement)) return;
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = "copy";
    zoneDeDepot.hidden = !porteDesFichiers(evenement);
  });
  vue.addEventListener("dragleave", (evenement) => {
    if (!vue.contains(evenement.relatedTarget)) zoneDeDepot.hidden = true;
  });
  vue.addEventListener("drop", (evenement) => {
    zoneDeDepot.hidden = true;
    if (porteUneForme(evenement)) {
      evenement.preventDefault();
      actions.deposerForme(evenement.dataTransfer.getData(TYPE_DE_GLISSER), evenement.clientX, evenement.clientY);
    } else if (porteDesFichiers(evenement)) {
      evenement.preventDefault();
      actions.importer([...evenement.dataTransfer.files]);
    }
  });
}

/* Les largeurs choisies sont une commodité de ce poste : gardées dans le
   navigateur, et tant pis si le stockage est refusé. */
function lireLargeurs() {
  try {
    return JSON.parse(localStorage.getItem(CLE_LARGEURS)) ?? {};
  } catch (_erreur) {
    return {};
  }
}

function ecrireLargeurs(largeurs) {
  try {
    localStorage.setItem(CLE_LARGEURS, JSON.stringify(largeurs));
  } catch (_erreur) {
    // Sans stockage, les colonnes reprendront leur largeur au prochain chargement.
  }
}

/* surChangement() : appelé à chaque pas, pour que la vue 3D se redimensionne. */
export function activerPoigneesDeColonnes(racine, surChangement) {
  const style = document.documentElement.style;
  const largeurs = lireLargeurs();
  for (const [variable, valeur] of Object.entries(largeurs)) style.setProperty(variable, valeur + "px");

  for (const poignee of racine.querySelectorAll(".poignee-colonne")) {
    const { variable, sens } = poignee.dataset;
    const [min, max] = [Number(poignee.dataset.min), Number(poignee.dataset.max)];
    let depart = null;

    poignee.addEventListener("pointerdown", (evenement) => {
      evenement.preventDefault();
      poignee.setPointerCapture(evenement.pointerId);
      poignee.classList.add("en-cours");
      depart = { x: evenement.clientX, largeur: poignee.parentElement.getBoundingClientRect().width };
    });
    poignee.addEventListener("pointermove", (evenement) => {
      if (depart === null) return;
      const largeur = Math.round(Math.min(max, Math.max(min, depart.largeur + (evenement.clientX - depart.x) * Number(sens))));
      style.setProperty(variable, largeur + "px");
      largeurs[variable] = largeur;
      surChangement();
    });
    const finir = () => {
      if (depart === null) return;
      depart = null;
      poignee.classList.remove("en-cours");
      ecrireLargeurs(largeurs);
    };
    poignee.addEventListener("pointerup", finir);
    poignee.addEventListener("pointercancel", finir);
  }
}
