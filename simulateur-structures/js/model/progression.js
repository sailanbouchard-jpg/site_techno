// model/progression.js
// ────────────────────
// Ce qu'un élève GARDE d'un niveau : ses étoiles, la masse de son meilleur pont,
// et LE PONT lui-même. Persisté côté serveur (routes /api/sim-niveaux, cookie de
// session élève) : il retrouve sa progression et ses constructions d'un poste à
// l'autre. Sans connexion ou sans serveur, la partie se joue quand même — tout
// reste alors en mémoire, le temps de la séance.
//
// Le résumé (étoiles, masse, « a un pont ») est chargé UNE fois au démarrage :
// l'affichage de la liste est donc synchrone. Le PONT, lui, est gros et se
// demande à la carte, au moment où l'élève ouvre ce niveau-là.
//
// RÈGLE DU MEILLEUR ESSAI : seul un pont plus LÉGER remplace le précédent.
// Rejouer moins bien ne fait donc jamais perdre ni ses étoiles ni son pont —
// c'est ce qui rend « Faire un nouveau pont » sans danger.

const API = "/api/sim-niveaux";

// niveauId → { etoiles, masse, aPont, signature }
let parNiveau = new Map();
// Ponts déjà rapatriés du serveur, pour ne pas les redemander à chaque ouverture.
const pontsEnCache = new Map();

export async function chargerProgression() {
  try {
    const res = await fetch(API, { headers: { Accept: "application/json" } });
    if (!res.ok) return; // 401 (non connecté) ou serveur absent : on joue sans
    const data = await res.json();
    if (Array.isArray(data)) {
      parNiveau = new Map(data.map((r) => [r.niveau_id, {
        etoiles: r.etoiles,
        masse: r.masse_kg,
        aPont: Boolean(r.a_pont),
        signature: r.signature || null,
      }]));
    }
  } catch {
    // Pas de serveur (simulateur ouvert en fichier statique) : on continue.
  }
}

export function etoilesDe(niveauId) {
  const entree = parNiveau.get(niveauId);
  return entree ? entree.etoiles : 0;
}

export function meilleureMasse(niveauId) {
  const entree = parNiveau.get(niveauId);
  return entree ? entree.masse : null;
}

export function niveauReussi(niveauId) {
  return parNiveau.has(niveauId);
}

// Vrai s'il y a un pont à rouvrir POUR CET ÉNONCÉ-LÀ. Un énoncé retouché depuis
// la réussite invalide le pont : l'élève garde son score, mais repart d'une base
// neuve plutôt que d'une scène qui ne correspond plus (voir levels::signatureEnonce).
export function aUnPont(niveauId, signature) {
  const entree = parNiveau.get(niveauId);
  if (!entree || !entree.aPont) return false;
  return !entree.signature || !signature || entree.signature === signature;
}

// Vrai quand un pont existe mais a été bâti sur un énoncé modifié depuis : c'est
// à dire à l'élève, sinon « validé » sans pont à rouvrir passerait pour une panne.
export function pontPerime(niveauId, signature) {
  const entree = parNiveau.get(niveauId);
  return Boolean(entree && entree.aPont && entree.signature && signature && entree.signature !== signature);
}

// Le pont sauvegardé, rapatrié du serveur au besoin. null s'il n'y en a pas.
export async function chargerPont(niveauId) {
  if (pontsEnCache.has(niveauId)) return pontsEnCache.get(niveauId);
  try {
    const res = await fetch(`${API}/${encodeURIComponent(niveauId)}/pont`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    pontsEnCache.set(niveauId, data.pont || null);
    return data.pont || null;
  } catch {
    return null;
  }
}

// Enregistre une réussite. Renvoie ce qui s'est passé, pour que le rapport
// d'essai puisse le DIRE à l'élève :
//   { record, ancienneMasse, ancienEtoiles } — record = ce pont remplace l'autre.
export function enregistrerReussite(niveauId, etoiles, masse, pont, signature) {
  const ancien = parNiveau.get(niveauId) || null;
  const record = !ancien || masse < ancien.masse;
  // Pont orphelin : la ligne existe sans pont (réussite d'avant cette
  // fonctionnalité) ou avec un pont périmé. On le remplace sans toucher au score,
  // sinon « validé » resterait sans rien à rouvrir. Même règle que le serveur.
  const orphelin = Boolean(ancien) && (!ancien.aPont || (ancien.signature && ancien.signature !== signature));
  if (!record && !orphelin) return { record: false, ancienneMasse: ancien.masse, ancienEtoiles: ancien.etoiles };

  parNiveau.set(niveauId, {
    etoiles: record ? etoiles : ancien.etoiles,
    masse: record ? masse : ancien.masse,
    aPont: true,
    signature,
  });
  pontsEnCache.set(niveauId, pont);
  fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ niveau_id: niveauId, etoiles, masse_kg: masse, pont, signature }),
  }).catch(() => {
    // Best effort : la progression de la séance reste correcte en mémoire.
  });
  return {
    record,
    ancienneMasse: ancien ? ancien.masse : null,
    ancienEtoiles: ancien ? ancien.etoiles : null,
  };
}
