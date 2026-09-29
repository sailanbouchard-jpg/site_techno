/*
 * mesures/rapport_performance.js
 * ──────────────────────────────
 * La raison d'être de V0 : savoir ce que ça donne sur les postes du collège,
 * chiffres à l'appui, avant d'écrire le vrai logiciel.
 *
 * Trois choses à mesurer, et rien d'autre :
 *   1. ce qu'il faut télécharger pour ouvrir la page ;
 *   2. combien de temps met le premier calcul, puis les suivants ;
 *   3. si la vue tient les 60 images par seconde pendant qu'on tourne autour.
 *
 * Deux pièges que ce fichier contourne, et qui rendraient la mesure fausse :
 *   - l'ouvrier a son propre chronomètre de ressources : le .wasm, qui pèse le
 *     plus lourd, n'apparaît PAS dans celui du fil principal ;
 *   - une ressource relue depuis le cache annonce une taille de zéro. Un second
 *     chargement afficherait donc « 40 ko » et mentirait sur le premier.
 *
 * Ce module n'existe pas en V1 : il disparaît avec la page jetable.
 */

const FENETRE_IMAGES = 60;   // moyenne glissante sur environ une seconde

// Un navigateur suspend requestAnimationFrame dès que la fenêtre passe en
// arrière-plan. Afficher « 0 image par seconde » ferait croire à un écroulement
// alors que la page ne dessine simplement plus rien.
const SEUIL_ARRIERE_PLAN_MS = 1500;

export function creerRapport() {
  const instants = [];
  let imagesParSeconde = 0;
  let imagesParSecondeMinimale = Infinity;
  let derniereImage = 0;

  return {
    compterUneImage(maintenant) {
      derniereImage = maintenant;
      instants.push(maintenant);
      if (instants.length > FENETRE_IMAGES) instants.shift();
      if (instants.length < 2) return;

      const duree = instants[instants.length - 1] - instants[0];
      imagesParSeconde = ((instants.length - 1) * 1000) / duree;

      // On ignore les deux premières secondes : la compilation des shaders y
      // écrase la mesure et ne se reproduira pas.
      if (maintenant > 2000 && imagesParSeconde < imagesParSecondeMinimale) {
        imagesParSecondeMinimale = imagesParSeconde;
      }
    },

    images() {
      return {
        courant: imagesParSeconde,
        minimum: Number.isFinite(imagesParSecondeMinimale) ? imagesParSecondeMinimale : 0,
        enPause: performance.now() - derniereImage > SEUIL_ARRIERE_PLAN_MS,
      };
    },
  };
}

// ── Poids du chargement ─────────────────────────────────────────────────────

function lireRessource(entree) {
  return {
    nom: entree.name,
    reseau: entree.encodedBodySize,
    decompresse: entree.decodedBodySize,
    // transferSize à zéro avec un corps non vide = servi par le cache du
    // navigateur ; 304 = revalidé, donc pas retéléchargé non plus.
    depuisLeCache: entree.transferSize === 0 || entree.encodedBodySize === 0,
  };
}

/*
 * ressourcesDeLOuvrier : la liste que l'ouvrier envoie dans son message « prêt ».
 * Sans elle, le .wasm du moteur de géométrie ne serait compté nulle part.
 */
export function poidsDuChargement(ressourcesDeLOuvrier = []) {
  const navigation = performance.getEntriesByType("navigation")[0];
  const entrees = performance.getEntriesByType("resource").map(lireRessource);

  if (navigation) {
    entrees.unshift({
      nom: "index.html",
      reseau: navigation.encodedBodySize,
      decompresse: navigation.decodedBodySize,
      depuisLeCache: navigation.transferSize === 0,
    });
  }

  // Une même URL peut apparaître plusieurs fois : le worker la voit de son
  // côté, et la mesure à froid la redemande. On garde le relevé le plus gros,
  // c'est-à-dire celui qui a réellement traversé le réseau.
  const parUrl = new Map();
  for (const ressource of [...entrees, ...ressourcesDeLOuvrier]) {
    const connue = parUrl.get(ressource.nom);
    if (connue === undefined || ressource.decompresse > connue.decompresse) {
      parUrl.set(ressource.nom, ressource);
    }
  }
  const toutes = [...parUrl.values()];

  const total = { reseau: 0, decompresse: 0, enCache: 0 };
  for (const ressource of toutes) {
    total.reseau += ressource.reseau;
    total.decompresse += ressource.decompresse;
    if (ressource.depuisLeCache) total.enCache += 1;
  }

  const lourdes = toutes
    .filter((ressource) => ressource.decompresse > 30000)
    .sort((a, b) => b.decompresse - a.decompresse)
    .map((ressource) => ({ ...ressource, nom: ressource.nom.split("/").pop() }));

  return { ...total, nombreDeRequetes: toutes.length, lourdes, ressources: toutes };
}

/*
 * Retélécharge tout en court-circuitant le cache, et rend le vrai poids d'un
 * premier chargement. C'est le chiffre qui compte pour quinze postes qui
 * ouvrent la page en même temps sur la connexion du collège — et le seul qu'on
 * ne peut pas obtenir en rechargeant simplement la page.
 */
export async function mesurerChargementAFroid(ressources) {
  const origine = globalThis.location.origin;
  const urls = ressources.map((ressource) => ressource.nom).filter((nom) => nom.startsWith(origine));

  const debut = performance.now();
  let reseau = 0;
  let decompresse = 0;

  for (const url of urls) {
    const reponse = await fetch(url, { cache: "reload" });
    if (!reponse.ok) continue;
    const contenu = await reponse.arrayBuffer();
    decompresse += contenu.byteLength;

    const entree = performance.getEntriesByName(url).pop();
    reseau += entree && entree.encodedBodySize > 0 ? entree.encodedBodySize : contenu.byteLength;
  }

  return { reseau, decompresse, dureeMs: performance.now() - debut, fichiers: urls.length };
}

/* Toute requête vers un autre domaine est un défaut : le logiciel doit
   fonctionner sur un réseau coupé du monde. On le vérifie, on ne le suppose pas. */
export function requetesExterieures() {
  const origine = globalThis.location.origin;
  return performance.getEntriesByType("resource")
    .filter((ressource) => !ressource.name.startsWith(origine) && !ressource.name.startsWith("blob:"))
    .map((ressource) => ressource.name);
}

export function enKilooctets(octets) {
  return (octets / 1024).toFixed(0) + " ko";
}
