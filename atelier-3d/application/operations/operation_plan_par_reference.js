/*
 * application/operations/operation_plan_par_reference.js
 * ──────────────────────────────────────────────────────
 * « Plan par un point » : les points de référence des esquisses précédentes
 * s'allument dans la vue ; en cliquer un fait passer le plan de l'esquisse
 * par lui. Le plan glisse le long de sa normale, sans tourner, et suivra le
 * point quand son esquisse changera.
 */

const TOLERANCE_PX = 12;

/*
 * outils : { scene, references() → [{ esquisse, numero, point, monde }],
 *            choisir(reference), terminer() }
 */
export function operationPlanParReference(outils) {
  let survolee = null;

  function sous(evenement) {
    let meilleure = null;
    let ecart = TOLERANCE_PX;
    for (const r of outils.references()) {
      const [x, y] = outils.scene.versEcran(r.monde);
      const d = Math.hypot(x - evenement.clientX, y - evenement.clientY);
      if (d < ecart) {
        ecart = d;
        meilleure = r;
      }
    }
    return meilleure;
  }

  return {
    titre: "Plan par un point de référence",
    icone: "sur_reference",
    libelle: "Plan par un point",
    sansValider: true,
    champs: [{ genre: "note", texte: () => (survolee === null ? "" : "Point de l'esquisse n°" + survolee.numero + ".") }],
    consigne: () => "Cliquer dans la vue le point de référence (en jaune) par lequel le plan doit passer.",
    preparer: () => ({}),
    changer: (cle, valeur, valeurs) => ({ ...valeurs, [cle]: valeur }),

    aides() {
      const meme = (r) => survolee !== null && r.esquisse === survolee.esquisse && r.point === survolee.point;
      return outils.references().map((r) => ({ genre: "reference", position: r.monde, fort: meme(r) }));
    },

    geste(genre, evenement) {
      if (genre === "survol") {
        const r = sous(evenement);
        const cle = (x) => (x === null ? "" : x.esquisse + ":" + x.point);
        if (cle(r) !== cle(survolee)) {
          survolee = r;
          outils.rafraichir();
        }
        return false;
      }
      if (genre !== "appui" || evenement.button !== 0) return false;
      const r = sous(evenement);
      if (r === null) return false;
      outils.terminer();
      outils.choisir(r);
      return true;
    },
  };
}
