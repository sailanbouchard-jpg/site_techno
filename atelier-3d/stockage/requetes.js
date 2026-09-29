/*
 * stockage/requetes.js
 * ────────────────────
 * Les appels à l'API du site, avec des erreurs en français. Le serveur répond
 * { erreur: "…" } quand il refuse : c'est ce message que l'élève doit lire,
 * pas « HTTP 413 ».
 */

export async function requete(url, options = {}) {
  let reponse;
  try {
    reponse = await fetch(url, { credentials: "same-origin", ...options });
  } catch (_erreur) {
    throw new Error("Le site ne répond pas : vérifie la connexion du poste.");
  }

  if (reponse.status === 401) {
    throw new Error("Tu n'es plus connecté : reconnecte-toi sur le site, ton travail reste dans cet onglet.");
  }
  if (!reponse.ok) {
    let message = "le site a refusé la demande (" + reponse.status + ")";
    try {
      const corps = await reponse.json();
      if (corps && typeof corps.erreur === "string") message = corps.erreur;
    } catch (_erreur) {
      // Pas de JSON : on garde le message générique.
    }
    throw new Error(message);
  }
  return reponse;
}

export async function requeteJson(url, options = {}) {
  const reponse = await requete(url, options);
  return reponse.json();
}

export function corpsJson(methode, donnees, autres = {}) {
  return {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(donnees),
    ...autres,
  };
}

/* L'élève est-il connecté ? /api/me répond 401 sinon — ce n'est pas une erreur. */
export async function eleveConnecte() {
  try {
    const reponse = await fetch("/api/me", { credentials: "same-origin" });
    if (!reponse.ok) return null;
    const moi = await reponse.json();
    return moi.connecte ? moi : null;
  } catch (_erreur) {
    return null;
  }
}
