/*
 * geometrie/protocole_ouvrier.js
 * ──────────────────────────────
 * Vocabulaire commun entre le fil principal et l'ouvrier de géométrie. Ce
 * fichier est importé DES DEUX CÔTÉS : aucun import de three.js, de Manifold
 * ni du DOM. Rien que des constantes et des fabriques de messages.
 *
 * Ce que l'ouvrier reçoit, et pourquoi
 * ────────────────────────────────────
 * La charge d'une requête est le sous-arbre sérialisé du nœud à construire,
 * SANS sa propre transformation — elle est appliquée à l'affichage, pas à la
 * géométrie — mais AVEC celles de ses enfants, qui décident où les enfants
 * s'unissent et se percent.
 *
 * Conséquence, à connaître : déplacer un objet posé sur le sol ne recalcule
 * rien ; déplacer un objet à l'intérieur d'un groupe recalcule le groupe.
 * C'est inévitable, et c'est exactement la définition de l'empreinte.
 *
 * Les tableaux de sommets repartent en objets transférables : le maillage
 * change de propriétaire, il n'est pas recopié. Un tableau transféré est
 * détaché — ne jamais le relire côté émetteur.
 */

// ── Types de messages ───────────────────────────────────────────────────────

export const REQUETE = Object.freeze({
  CONSTRUIRE: "construire",
  ANNULER: "annuler",        // l'élève a changé autre chose : ce calcul ne sert plus
  CHARGER_FICHIER: "charger_fichier",
  CHARGER_POLICE: "charger_police",
  CHARGER_EPROUVETTE: "charger_eprouvette",
});

export const REPONSE = Object.freeze({
  PRET: "pret",              // une seule fois, quand le .wasm est compilé
  RESULTAT: "resultat",
  FICHIER: "fichier",
  ERREUR: "erreur",
});

// ── Requêtes (fil principal → ouvrier) ──────────────────────────────────────

export function requeteConstruire(id, noeudSerialise) {
  return { id, type: REQUETE.CONSTRUIRE, charge: noeudSerialise };
}

export function requeteAnnuler(id) {
  return { id, type: REQUETE.ANNULER };
}

/* Un fichier STL importé ou rouvert : l'ouvrier le lit, le garde, et rend sa
   clé. Les octets partent en transférable — l'appelant en garde une copie s'il
   doit encore les enregistrer. */
export function requeteChargerFichier(id, octets) {
  return { id, type: REQUETE.CHARGER_FICHIER, octets };
}

/* Une police : l'ouvrier la télécharge lui-même, la lit et la garde sous « cle ». */
export function requeteChargerPolice(id, cle, adresse) {
  return { id, type: REQUETE.CHARGER_POLICE, cle, adresse };
}

/* Une éprouvette de calibration (.drc) : même trajet qu'une police, l'ouvrier
   va la chercher dans le catalogue du logiciel et la décompresse. */
export function requeteChargerEprouvette(id, cle, adresse) {
  return { id, type: REQUETE.CHARGER_EPROUVETTE, cle, adresse };
}

// ── Réponses (ouvrier → fil principal) ──────────────────────────────────────

/*
 * maillage :
 *   positions  Float32Array, 3 flottants par sommet, en millimètres
 *   normales   Float32Array, 3 par sommet : lissées sur les surfaces courbes,
 *              franches sur les arêtes vives (voir normales_du_maillage.js)
 *   indices    Uint32Array, 3 entiers par triangle
 *   boite      { min: [x, y, z], max: [x, y, z] } — les dimensions hors-tout de
 *              la barre d'état, sans repasser sur tous les sommets côté vue
 *   etanche    booléen — le voyant, affiché AVANT l'export et pas après
 *   triangles  nombre de triangles
 *   parties    pour un groupe fait de plusieurs pièces : le chemin de chacune
 *              (rangs des enfants depuis le nœud calculé ; null si inconnu).
 *              null pour un objet d'une seule pièce.
 *   groupes    [{ debut, nombre, partie }] : les plages de triangles de chaque
 *              pièce, en indices — la vue les peint chacune de sa couleur
 *
 * mesures :
 *   dureeMs    durée du calcul dans l'ouvrier. V0 doit l'afficher : c'est sa
 *              raison d'être.
 */
export function reponseResultat(id, maillage, mesures) {
  return { id, type: REPONSE.RESULTAT, ok: true, maillage, mesures };
}

/* message : une phrase en français, affichable telle quelle dans la barre
   d'état, qui dit ce qui s'est passé et quoi faire. Pas une pile d'appels. */
export function reponseErreur(id, message) {
  return { id, type: REPONSE.ERREUR, ok: false, erreur: message };
}

/* infos : { cle, triangles, boite: { min, max } } — de quoi créer l'objet importé
   à sa taille réelle sans attendre le calcul de son maillage. */
export function reponseFichierCharge(id, infos) {
  return { id, type: REPONSE.FICHIER, ok: true, ...infos };
}

export function messagePret(informations) {
  return { id: null, type: REPONSE.PRET, ok: true, ...informations };
}

export function estMessagePret(message) {
  return message !== null && typeof message === "object" && message.type === REPONSE.PRET;
}

// ── Transfert ───────────────────────────────────────────────────────────────

/* À passer en second argument de postMessage. Vide si la réponse est une
   erreur ou un solide vide : il n'y a alors aucun tampon à céder. */
export function transferablesDeReponse(reponse) {
  if (!reponse.ok || !reponse.maillage) return [];
  return [reponse.maillage.positions.buffer, reponse.maillage.normales.buffer, reponse.maillage.indices.buffer];
}
