/*
 * interface/apercu_couches.js
 * ───────────────────────────
 * Les commandes de l'aperçu du tranchage, posées sur la vue, à la manière
 * d'OrcaSlicer et de Bambu Studio :
 *   - à droite, le curseur vertical des couches, à deux poignées : la couche
 *     du haut et celle du bas de ce qu'on montre ;
 *   - en bas, le curseur horizontal du parcours : la buse avance dans la
 *     couche du haut, dans l'ordre d'impression ;
 *   - en haut à droite, le résultat du tranchage, repliable : le mode de
 *     coloration, puis un tableau par type de ligne (temps, part du temps,
 *     poids, case d'affichage), puis les totaux. Pas de longueur de fil :
 *     le poids dit la même chose, et c'est lui qu'on lit sur la bobine.
 *
 * Les couleurs des pastilles viennent de la feuille de style (classes
 * .type-ligne-N) : le JS n'en écrit aucune.
 */

import { creer } from "./elements.js";

const nombre = (v, decimales = 2) => v.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/* 1 h 05 min, 12 min 30 s, 45 s : la précision qui a un sens à chaque échelle. */
function duree(secondes) {
  const s = Math.round(secondes);
  if (s < 60) return s + " s";
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return minutes + " min " + String(s % 60).padStart(2, "0") + " s";
  return Math.floor(minutes / 60) + " h " + String(minutes % 60).padStart(2, "0") + " min";
}

const grammes = (volume, reglages) => (volume / 1000) * reglages.densite_filament;

/* Les modes de coloration : l'unité et la précision de leur échelle. */
const MODES = [
  { valeur: "type", etiquette: "Type de ligne" },
  { valeur: "vitesse", etiquette: "Vitesse", unite: "mm/s", decimales: 0 },
  { valeur: "largeur", etiquette: "Largeur de ligne", unite: "mm", decimales: 2 },
  { valeur: "debit", etiquette: "Débit volumétrique", unite: "mm³/s", decimales: 1 },
  { valeur: "hauteur", etiquette: "Hauteur de couche", unite: "mm", decimales: 2 },
];
// Le nombre de graduations de l'échelle, bornes comprises.
const GRADUATIONS = 5;

/*
 * types : [{ type, etiquette, aide }]
 * actions : { montrerCouches(bas, haut), typesVisibles(Set) → échelle, colorer(mode) → échelle,
 *             segments(couche) → nombre, avancer(rang) → { type, largeur, vitesse }, coutures(visibles) }
 */
export function creerApercuCouches(zone, types, actions) {
  // ── Curseur des couches ──
  const rail = creer("div", { classe: "rail-couches" });
  const plein = creer("div", { classe: "plage-couches" });
  const poigneeHaut = creer("button", { classe: "poignee-couche haut", attributs: { type: "button", "aria-label": "Couche du haut" } });
  const poigneeBas = creer("button", { classe: "poignee-couche bas", attributs: { type: "button", "aria-label": "Couche du bas" } });
  const etiquetteHaut = creer("div", { classe: "etiquette-couche haut" });
  const etiquetteBas = creer("div", { classe: "etiquette-couche bas" });
  rail.append(plein, poigneeBas, poigneeHaut);
  const curseur = creer("div", {
    classe: "curseur-couches",
    aide: { nom: "Couches", texte: "Glisser la poignée du haut pour descendre dans la pièce, celle du bas pour masquer les premières couches.", geste: "Flèches haut et bas : une couche ; avec Maj : dix couches." },
  }, [etiquetteHaut, rail, etiquetteBas]);

  // ── Résultat du tranchage ──
  const mode = creer("select", { classe: "champ-texte", attributs: { "aria-label": "Mode d'affichage" } },
    MODES.map((m) => creer("option", { texte: m.etiquette, attributs: { value: m.valeur } })));
  // L'échelle d'une coloration par valeur : le dégradé, et ses graduations.
  const graduations = creer("div", { classe: "graduations" });
  const echelle = creer("div", { classe: "echelle-coloration", attributs: { hidden: "" } }, [creer("div", { classe: "barre-degrade" }), graduations]);
  function montrerLEchelle(valeurs) {
    const choisi = MODES.find((m) => m.valeur === mode.value);
    echelle.hidden = valeurs === null || choisi.valeur === "type";
    if (echelle.hidden) return;
    graduations.replaceChildren(...Array.from({ length: GRADUATIONS }, (_, i) => {
      const v = valeurs.min + ((valeurs.max - valeurs.min) * i) / (GRADUATIONS - 1);
      return creer("span", { texte: nombre(v, choisi.decimales) + (i === GRADUATIONS - 1 ? " " + choisi.unite : "") });
    }));
  }
  mode.addEventListener("change", () => montrerLEchelle(actions.colorer(mode.value)));
  const visibles = new Set(types.map((t) => t.type));
  const lignes = new Map();
  const corpsTableau = creer("tbody");
  for (const t of types) {
    const caseACocher = creer("input", { attributs: { type: "checkbox", checked: "", "aria-label": "Afficher : " + t.etiquette } });
    caseACocher.addEventListener("change", () => {
      if (caseACocher.checked) visibles.add(t.type);
      else visibles.delete(t.type);
      montrerLEchelle(actions.typesVisibles(new Set(visibles)));
    });
    const [temps, part, poids] = [creer("td", { classe: "nombre" }), creer("td", { classe: "nombre" }), creer("td", { classe: "nombre" })];
    const ligne = creer("tr", {}, [
      creer("td", { aide: { nom: t.etiquette, texte: t.aide } }, [creer("span", { classe: "pastille-type type-ligne-" + t.type }), creer("span", { texte: t.etiquette })]),
      temps, part, poids,
      creer("td", { classe: "case" }, [caseACocher]),
    ]);
    lignes.set(t.type, { ligne, temps, part, poids });
    corpsTableau.append(ligne);
  }
  // Les coutures : des repères, sans temps ni poids.
  const caseCoutures = creer("input", { attributs: { type: "checkbox", checked: "", "aria-label": "Afficher : coutures" } });
  caseCoutures.addEventListener("change", () => actions.coutures(caseCoutures.checked));
  const ligneCoutures = creer("tr", { classe: "deplacements" }, [
    creer("td", { aide: { nom: "Coutures", texte: "Le point où chaque tour de paroi commence et finit. Sa place se règle dans Qualité › Couture." } }, [creer("span", { classe: "pastille-type couture" }), creer("span", { texte: "Coutures" })]),
    creer("td"), creer("td"), creer("td"), creer("td", { classe: "case" }, [caseCoutures]),
  ]);
  corpsTableau.append(ligneCoutures);
  // Les déplacements ne se dessinent pas : une ligne du tableau, sans case.
  const tempsDeplacements = creer("td", { classe: "nombre" });
  const partDeplacements = creer("td", { classe: "nombre" });
  corpsTableau.append(creer("tr", { classe: "deplacements" }, [
    creer("td", { aide: { nom: "Déplacements", texte: "La buse passe d'une ligne à la suivante sans extruder." } }, [creer("span", { classe: "pastille-type deplacement" }), creer("span", { texte: "Déplacements" })]),
    tempsDeplacements, partDeplacements, creer("td"), creer("td"),
  ]));
  const tableau = creer("table", { classe: "tableau-tranchage" }, [
    creer("thead", {}, [creer("tr", {}, [
      creer("th", { texte: "Type de ligne" }), creer("th", { classe: "nombre", texte: "Temps" }),
      creer("th", { classe: "nombre", texte: "%" }), creer("th", { classe: "nombre", texte: "Poids" }), creer("th", { classe: "case" }),
    ])]),
    corpsTableau,
  ]);
  const totaux = creer("dl", { classe: "totaux-tranchage" });
  const texteAvancement = creer("div");
  const jauge = creer("div", { classe: "progression" });
  const avancement = creer("div", { classe: "avancement-tranchage" }, [
    texteAvancement, creer("div", { classe: "barre-progression" }, [jauge]),
  ]);

  const replier = creer("button", { classe: "replier-resultat", attributs: { type: "button", "aria-expanded": "true" }, aide: { nom: "Replier", texte: "Réduit le résultat à sa durée et son poids." } });
  const resume = creer("span", { classe: "resume-tranchage" });
  const entete = creer("div", { classe: "entete-resultat" }, [creer("span", { classe: "titre", texte: "Résultat du tranchage" }), resume, replier]);
  const corps = creer("div", { classe: "corps-resultat" }, [
    creer("label", { classe: "mode-affichage" }, [creer("span", { texte: "Mode d'affichage" }), mode]),
    echelle, tableau, totaux,
  ]);
  const resultat = creer("div", { classe: "resultat-tranchage" }, [entete, avancement, corps]);
  replier.addEventListener("click", () => {
    const replie = resultat.classList.toggle("replie");
    replier.setAttribute("aria-expanded", String(!replie));
  });

  // ── Curseur du parcours dans la couche du haut ──
  const parcours = creer("input", { classe: "curseur-parcours", attributs: { type: "range", min: "0", max: "0", step: "1", "aria-label": "Parcours de la buse dans la couche" } });
  const etiquetteParcours = creer("span", { classe: "etiquette-parcours" });
  const barreParcours = creer("div", {
    classe: "barre-parcours",
    aide: { nom: "Parcours", texte: "Fait avancer la buse dans la couche du haut, dans l'ordre d'impression.", geste: "Flèches gauche et droite : un segment ; avec Maj : dix." },
  }, [parcours, etiquetteParcours]);
  const nomDuType = new Map(types.map((t) => [t.type, t.etiquette]));
  function suivreLeParcours() {
    const rang = Number(parcours.value);
    const fin = Number(parcours.max);
    // Au bout du parcours, la couche est entière : pas de buse.
    const info = rang >= fin ? (actions.montrerCouches(bas, haut), null) : actions.avancer(rang);
    etiquetteParcours.textContent = info === null
      ? "Couche entière"
      : nomDuType.get(info.type) + " · " + nombre(info.vitesse, 0) + " mm/s · " + nombre(info.largeur, 2) + " mm";
  }
  parcours.addEventListener("input", suivreLeParcours);

  zone.append(curseur, resultat, barreParcours);

  let couches = { hauteurs: [], epaisseurs: [] };
  let [bas, haut] = [0, 0];
  let toutEnHaut = true;       // la poignée du haut suit le sommet quand de nouvelles couches arrivent
  let parcoursDe = { haut: -1, segments: -1 };   // la couche que le curseur horizontal parcourt

  function dernier() {
    return Math.max(0, couches.hauteurs.length - 1);
  }

  function afficher() {
    const n = couches.hauteurs.length;
    const vers = (k) => (n <= 1 ? 0 : (k / (n - 1)) * 100);
    poigneeHaut.style.bottom = vers(haut) + "%";
    poigneeBas.style.bottom = vers(bas) + "%";
    plein.style.bottom = vers(bas) + "%";
    plein.style.height = (vers(haut) - vers(bas)) + "%";
    const texte = (k) => (n === 0 ? "—" : (k + 1) + " · " + nombre(couches.hauteurs[k]) + " mm");
    etiquetteHaut.textContent = texte(haut);
    etiquetteBas.textContent = texte(bas);
    // Une autre couche du haut, ou un nouveau tranchage : le parcours repart de la fin (couche entière).
    const segments = n === 0 ? 0 : actions.segments(haut);
    if (haut !== parcoursDe.haut || segments !== parcoursDe.segments || Number(parcours.value) >= segments) {
      parcoursDe = { haut, segments };
      actions.montrerCouches(bas, haut);
      parcours.max = String(segments);
      parcours.value = String(segments);
      etiquetteParcours.textContent = "Couche entière";
    } else {
      // Même couche du haut, autre couche du bas : la buse reste où elle était.
      actions.montrerCouches(bas, haut);
      suivreLeParcours();
    }
  }

  function regler(nouveauBas, nouveauHaut) {
    bas = Math.max(0, Math.min(nouveauBas, dernier()));
    haut = Math.max(bas, Math.min(nouveauHaut, dernier()));
    toutEnHaut = haut === dernier();
    afficher();
  }

  function glisserPoignee(poignee, estHaut) {
    poignee.addEventListener("pointerdown", (evenement) => {
      evenement.preventDefault();
      poignee.setPointerCapture(evenement.pointerId);
      const suivre = (e) => {
        const cadre = rail.getBoundingClientRect();
        const f = 1 - Math.min(1, Math.max(0, (e.clientY - cadre.top) / cadre.height));
        const k = Math.round(f * dernier());
        if (estHaut) regler(Math.min(bas, k), Math.max(k, bas));
        else regler(Math.min(k, haut), haut);
      };
      const finir = () => {
        poignee.removeEventListener("pointermove", suivre);
        poignee.removeEventListener("pointerup", finir);
      };
      poignee.addEventListener("pointermove", suivre);
      poignee.addEventListener("pointerup", finir);
    });
  }
  glisserPoignee(poigneeHaut, true);
  glisserPoignee(poigneeBas, false);

  const ligneTotal = (terme, valeur, aide) => [creer("dt", { texte: terme, aide }), creer("dd", { texte: valeur })];

  return {
    montrer(visible) {
      curseur.hidden = !visible;
      resultat.hidden = !visible;
      barreParcours.hidden = !visible;
    },

    /*
     * N'afficher que ces types de ligne, ou tous quand la liste est vide : le
     * diagnostic s'en sert pour isoler ce dont il parle.
     */
    isolerLesTypes(voulus) {
      const garde = voulus.length === 0 ? types.map((t) => t.type) : voulus;
      visibles.clear();
      for (const type of garde) visibles.add(type);
      for (const [type, { ligne }] of lignes) {
        const caseACocher = ligne.querySelector("input");
        if (caseACocher !== null) caseACocher.checked = visibles.has(type);
      }
      montrerLEchelle(actions.typesVisibles(new Set(visibles)));
    },

    /* Après un nouveau tranchage : la coloration choisie s'applique aux nouvelles lignes. */
    recolorer() {
      montrerLEchelle(actions.colorer(mode.value));
    },

    /* etat : voir tranchage_en_direct.etat() ; machine : pour le temps de préparation. */
    mettreAJour(etat, machine) {
      const avant = couches.hauteurs.length;
      couches = etat.couches;
      if (couches.hauteurs.length !== avant) {
        if (toutEnHaut || haut > dernier()) haut = dernier();
        bas = Math.min(bas, haut);
      }
      afficher();

      const enCours = etat.restantes > 0 || etat.total === 0;
      avancement.hidden = !enCours;
      const part = Math.round((etat.avancement ?? 0) * 100);
      texteAvancement.textContent = etat.total === 0 ? "Aucune pièce sur le plateau."
        : "Tranchage : " + part + " % · " + (etat.total - etat.restantes) + " / " + etat.total
          + (etat.total > 1 ? " pièces" : " pièce");
      jauge.style.width = part + "%";
      jauge.parentElement.hidden = etat.total === 0;
      corps.hidden = enCours;
      if (enCours || etat.reglages === null) return;

      // La part de chaque type : son temps d'impression, comme dans les trancheurs.
      const tempsDesLignes = [...etat.parType.values()].reduce((t, b) => t + b.temps, 0);
      const tempsImpression = tempsDesLignes + etat.deplacements;
      for (const [type, cellules] of lignes) {
        const bilan = etat.parType.get(type);
        cellules.ligne.hidden = bilan === undefined;
        if (bilan === undefined) continue;
        cellules.temps.textContent = duree(bilan.temps);
        cellules.part.textContent = nombre((bilan.temps / tempsImpression) * 100, 1);
        cellules.poids.textContent = nombre(grammes(bilan.volume, etat.reglages), 2) + " g";
      }
      tempsDeplacements.textContent = duree(etat.deplacements);
      partDeplacements.textContent = tempsImpression > 0 ? nombre((etat.deplacements / tempsImpression) * 100, 1) : "";

      const poids = grammes([...etat.parType.values()].reduce((v, b) => v + b.volume, 0), etat.reglages);
      const total = tempsImpression + machine.preparation;
      totaux.replaceChildren(
        ...ligneTotal("Poids total", nombre(poids, 2) + " g"),
        ...ligneTotal("Durée d'impression", duree(tempsImpression), {
          nom: "Durée d'impression",
          texte: "Lignes et déplacements, accélérations comprises, avec le ralentissement des couches trop courtes pour refroidir"
            + (etat.ralentissement > 1 ? " (" + duree(etat.ralentissement) + " sur ce plateau)" : "") + ". Les changements de couche ne sont pas comptés.",
        }),
        ...ligneTotal("Préparation", duree(machine.preparation), { nom: "Préparation", texte: "Chauffe, nivellement du plateau et purge avant la première couche." }),
        ...ligneTotal("Durée totale", duree(total)),
        ...ligneTotal("Couches", String(couches.hauteurs.length)),
      );
      resume.textContent = duree(total) + " · " + nombre(poids, 1) + " g";
    },

    /* pas : +1 monte d'une couche, -10 descend de dix. */
    deplacerHaut(pas) {
      regler(bas, haut + pas);
    },

    /* pas : +1 avance la buse d'un segment dans la couche du haut. */
    deplacerParcours(pas) {
      parcours.value = String(Math.max(0, Math.min(Number(parcours.max), Number(parcours.value) + pas)));
      suivreLeParcours();
    },
  };
}
