/**
 * markup.js — Mini balisage de style pour la sortie du terminal.
 *
 * Convention partagée entre les commandes (qui écrivent du texte) et l'UI
 * (qui l'affiche). Une commande ne touche jamais le DOM : elle écrit du texte
 * contenant des balises [[style]] … [[/]] que l'UI transforme en <span>.
 *
 * Exemple : io.writeLine("[[vert]]Bravo ![[/]] Continue.")
 *
 * Styles disponibles (classes CSS .mk-<style> définies dans ui/theme.css) :
 *   vert cyan bleu jaune orange rouge violet gris blanc
 *   titre gras dim ok err warn flag dossier fichier cache invite
 *
 * En mode headless (tests sans navigateur), stripMarkup() retire les balises.
 */

const BALISE_RE = /\[\[([a-z-]+|\/)\]\]/g;

/** Échappe les caractères spéciaux HTML. */
export function escapeHtml(texte) {
  return String(texte)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Transforme un texte balisé en HTML sûr : le texte est échappé puis les
 * balises [[style]]/[[/]] deviennent des <span class="mk-style">.
 * Les balises non refermées sont refermées automatiquement.
 * @returns {string} HTML prêt à insérer.
 */
export function renderInline(texte) {
  const source = escapeHtml(texte);
  let html = "";
  let profondeur = 0;
  let dernier = 0;
  let m;
  BALISE_RE.lastIndex = 0;
  while ((m = BALISE_RE.exec(source)) !== null) {
    html += source.slice(dernier, m.index);
    if (m[1] === "/") {
      if (profondeur > 0) {
        html += "</span>";
        profondeur--;
      }
    } else {
      html += `<span class="mk-${m[1]}">`;
      profondeur++;
    }
    dernier = BALISE_RE.lastIndex;
  }
  html += source.slice(dernier);
  html += "</span>".repeat(profondeur);
  return html;
}

/** Retire toutes les balises de style (pour les tests headless). */
export function stripMarkup(texte) {
  return String(texte).replace(BALISE_RE, "");
}
