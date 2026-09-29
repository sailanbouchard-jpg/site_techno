/*
 * interface/telechargement.js
 * Donne un fichier à l'élève. Le lien est libéré aussitôt : garder l'objet en
 * mémoire coûterait le poids du STL à chaque export d'une séance.
 */

export function telecharger(contenu, nomDeFichier, typeMime) {
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([contenu], { type: typeMime }));
  lien.download = nomDeFichier;
  document.body.append(lien);
  lien.click();
  lien.remove();
  // Certains navigateurs lisent l'adresse après coup : on la libère un peu plus tard.
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}
