// ui/proprietes.js
// ────────────────
// Petits constructeurs de la GRILLE DE PROPRIÉTÉS — deux colonnes nom | valeur,
// catégories en bandeau — partagés par l'inspecteur et le rapport d'essai.

export function categorie(grille, titre) {
  const bandeau = document.createElement("div");
  bandeau.className = "prop-categorie";
  bandeau.textContent = titre;
  grille.appendChild(bandeau);
}

// Ajoute une ligne ; `contenu` est un texte ou un élément (champ, pastille…).
// Renvoie la cellule de valeur, pour la mettre à jour en direct au besoin.
export function ligne(grille, nom, contenu) {
  const rangee = document.createElement("div");
  rangee.className = "prop-ligne";
  const cellNom = document.createElement("span");
  cellNom.className = "prop-nom";
  cellNom.textContent = nom;
  const cellValeur = document.createElement("span");
  cellValeur.className = "prop-valeur";
  if (contenu instanceof Node) cellValeur.appendChild(contenu);
  else cellValeur.textContent = contenu;
  rangee.append(cellNom, cellValeur);
  grille.appendChild(rangee);
  return cellValeur;
}

// Fenêtre d'outil vide : barre de titre (avec bouton de fermeture facultatif),
// grille de propriétés, zone de boutons.
export function remplirFenetre(fenetre, titre, surFermeture) {
  fenetre.innerHTML = "";
  const entete = document.createElement("header");
  entete.className = "fenetre-titre";
  const libelle = document.createElement("span");
  libelle.textContent = titre;
  entete.appendChild(libelle);
  if (surFermeture) {
    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.className = "fenetre-fermer";
    fermer.title = "Fermer";
    fermer.innerHTML = `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8"/></svg>`;
    fermer.addEventListener("click", surFermeture);
    entete.appendChild(fermer);
  }
  const grille = document.createElement("div");
  grille.className = "grille-proprietes";
  const actions = document.createElement("div");
  actions.className = "fenetre-actions";
  fenetre.append(entete, grille, actions);
  return { grille, actions };
}
