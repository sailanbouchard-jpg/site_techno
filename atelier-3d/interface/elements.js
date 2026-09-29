/*
 * interface/elements.js
 * ─────────────────────
 * Deux fabriques d'éléments, parce que chaque panneau en crée des dizaines :
 * sans elles, la mise en page se noierait dans les createElement.
 */

import { icone } from "./icones.js";
import { aider } from "./bulle_d_aide.js";

/* proprietes : { classe, texte, titre, aide, attributs: {…} } ; enfants : éléments ou textes.
   aide : la bulle de survol (voir bulle_d_aide.js) ; titre en est la forme courte. */
export function creer(balise, proprietes = {}, enfants = []) {
  const element = document.createElement(balise);
  if (proprietes.classe) element.className = proprietes.classe;
  if (proprietes.texte !== undefined) element.textContent = proprietes.texte;
  if (proprietes.titre) element.title = proprietes.titre;
  for (const [nom, valeur] of Object.entries(proprietes.attributs ?? {})) {
    element.setAttribute(nom, valeur);
  }
  for (const enfant of enfants) {
    if (enfant !== null && enfant !== undefined) element.append(enfant);
  }
  if (proprietes.aide) aider(element, proprietes.aide);
  return element;
}

/*
 * options : { icone, texte, terme, titre, aide, classe, surClic }
 * « terme » ajoute sous le texte, en petit et en gris, le mot du programme.
 */
export function bouton(options) {
  const classes = ["bouton", options.classe ?? ""];
  if (options.terme) classes.push("double");
  if (options.icone && !options.texte) classes.push("seul");

  const element = creer("button", { classe: classes.join(" ").trim(), titre: options.titre, attributs: { type: "button" } });
  if (options.icone) element.append(icone(options.icone));
  if (options.texte && options.terme) {
    element.append(creer("span", { classe: "libelles" }, [
      creer("span", { texte: options.texte }),
      creer("span", { classe: "terme", texte: options.terme }),
    ]));
  } else if (options.texte) {
    element.append(creer("span", { texte: options.texte }));
  }
  if (options.aide) aider(element, options.aide);
  if (options.surClic) element.addEventListener("click", options.surClic);
  return element;
}

export function separateur() {
  return creer("span", { classe: "separateur", attributs: { "aria-hidden": "true" } });
}

export function vider(element) {
  element.replaceChildren();
}
