/*
 * geometrie/cle_de_fichier.js
 * ───────────────────────────
 * La clé sous laquelle un fichier importé est rangé : elle dépend de son
 * contenu, pas de son nom. Réimporter le même boîtier ne le stocke pas deux
 * fois, et un projet désigne son fichier sans ambiguïté.
 *
 * Pas de SHA-256 : crypto.subtle n'existe qu'en contexte sécurisé, et le site
 * est servi en http sur le réseau du collège. Quatre hachages de 32 bits,
 * indépendants, plus la taille : 128 bits, largement assez pour ranger les
 * fichiers d'un élève. Ce n'est pas une signature — un élève qui falsifierait
 * une clé n'abîmerait que ses propres projets.
 */

const GRAINES = [0x811c9dc5, 0x2545f491, 0x9e3779b9, 0x6a09e667];
const MULTIPLICATEURS = [0x01000193, 0x5bd1e995, 0x85ebca6b, 0xc2b2ae35];

export const FORMAT_CLE = /^[0-9a-f]{40}$/;

export function cleDeFichier(octets) {
  const donnees = new Uint8Array(octets);
  const etats = new Uint32Array(GRAINES);

  for (let i = 0; i < donnees.length; i += 1) {
    const octet = donnees[i];
    for (let k = 0; k < 4; k += 1) {
      etats[k] = Math.imul(etats[k] ^ octet, MULTIPLICATEURS[k]);
    }
  }

  // Brassage final : sans lui, deux fichiers qui ne diffèrent que par leur
  // dernier octet auraient des clés trop proches.
  let texte = "";
  for (let k = 0; k < 4; k += 1) {
    let h = etats[k] ^ donnees.length;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    texte += (h >>> 0).toString(16).padStart(8, "0");
  }
  return texte + (donnees.length >>> 0).toString(16).padStart(8, "0");
}
