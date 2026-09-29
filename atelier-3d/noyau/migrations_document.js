/*
 * noyau/migrations_document.js
 * ────────────────────────────
 * Une entrée par montée de version : MIGRATIONS[i] transforme un document de
 * version i+1 en document de version i+2. Le chargement les applique en chaîne.
 *
 * Les projets déjà enregistrés par les élèves doivent toujours s'ouvrir. Ne
 * jamais modifier une migration existante — on en ajoute une. Elles
 * travaillent sur le JSON brut et nomment les types en toutes lettres : le
 * registre peut changer, pas les fichiers déjà écrits.
 */

// ── Version 1 → 2 : les esquisses sortent de leurs solides ──────────────────
// En version 1, un solide d'esquisse portait son esquisse en enfant. En
// version 2, l'esquisse vit à la racine et le solide la désigne par son
// identifiant. Elle est masquée, comme après une extrusion.
const SOLIDES_D_ESQUISSE_V1 = new Set(["extrusion", "epaississement", "revolution"]);

function sortirLesEsquisses(racine) {
  const sorties = [];
  const descendre = (noeud) => {
    let parametres = noeud.parametres;
    let enfants = noeud.enfants ?? [];
    if (SOLIDES_D_ESQUISSE_V1.has(noeud.type)) {
      const esquisse = enfants.find((e) => e.type === "esquisse");
      if (esquisse !== undefined) {
        sorties.push({ ...esquisse, visible: false });
        parametres = { ...parametres, esquisse: esquisse.id };
      }
      enfants = enfants.filter((e) => e.type !== "esquisse");
    }
    const copie = { ...noeud, enfants: enfants.map(descendre) };
    if (parametres !== undefined) copie.parametres = parametres;
    if (copie.enfants.length === 0) delete copie.enfants;
    return copie;
  };
  const nouvelle = descendre(racine);
  return { ...nouvelle, enfants: [...(nouvelle.enfants ?? []), ...sorties] };
}

export const MIGRATIONS = [
  (brut) => ({ ...brut, version: 2, racine: sortirLesEsquisses(brut.racine) }),
];

export function versionLaPlusRecente() {
  return MIGRATIONS.length + 1;
}

export function migrer(brut) {
  let document = brut;
  while (document.version < versionLaPlusRecente()) {
    const migration = MIGRATIONS[document.version - 1];
    if (typeof migration !== "function") {
      throw new Error(
        "Ce projet est en version " + document.version +
        " et le logiciel ne sait pas la convertir. Aucune donnée n'a été touchée."
      );
    }
    document = migration(document);
  }
  return document;
}
