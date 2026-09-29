/*
 * interface/panneau_imprimantes.js
 * ────────────────────────────────
 * Les imprimantes du réseau local : leur état (relu toutes les 3 secondes
 * tant que le panneau est ouvert), l'envoi du plateau, pause, reprise et
 * arrêt, et la fiche de connexion d'une imprimante.
 */

import { creer, bouton, vider } from "./elements.js";
import { icone } from "./icones.js";

const RELECTURE_MS = 3000;
const MODELES = [{ valeur: "C12", etiquette: "P1S" }, { valeur: "C11", etiquette: "P1P" }];
// FINISH et FAILED décrivent la dernière impression, pas la machine : elle reste libre
// (FAILED aussi après un arrêt demandé), jusqu'au travail suivant.
const ETATS = {
  IDLE: "Prête", PREPARE: "Préparation", RUNNING: "Impression", PAUSE: "En pause",
  FINISH: "Prête · dernière impression terminée", FAILED: "Prête · dernière impression interrompue", SLICING: "Préparation",
};
const OCCUPEE = new Set(["PREPARE", "RUNNING", "PAUSE"]);

const duree = (minutes) => (minutes >= 60 ? Math.floor(minutes / 60) + " h " + String(minutes % 60).padStart(2, "0") : minutes + " min");
const temperature = (mesure, cible) => (mesure === undefined ? "–" : Math.round(mesure) + (cible > 0 ? " / " + Math.round(cible) : "") + " °C");

/*
 * actions : { lister(), enregistrer(id, champs), retirer(id), commande(id, action),
 *             imprimer(id, emplacement, modele), estAdministrateur(), fermer(), annoncer(texte, erreur) }
 */
export function creerPanneauImprimantes(conteneur, actions) {
  const fermer = bouton({ icone: "fermer", classe: "fermer-panneau", aide: { nom: "Fermer" }, surClic: () => actions.fermer() });
  const entete = creer("div", { classe: "titre-panneau" }, [icone("imprimante"), creer("span", { texte: "Imprimantes" }), fermer]);
  const corps = creer("div", { classe: "inspecteur-corps panneau-imprimantes" });
  conteneur.append(entete, corps);

  let ouvert = false;
  let minuterie = null;
  let envoiEnCours = null;       // id de l'imprimante qui reçoit le plateau
  let fiche = null;              // null, ou { id, nouvelle } : la fiche de connexion ouverte
  let cameraOuverte = null;      // id de l'imprimante dont on regarde la caméra
  const bobineChoisie = new Map(); // id de l'imprimante → valeur du choix de bobine ("externe" ou n° d'emplacement)

  // ── Fiche de connexion ──
  function champ(etiquette, attributs, aide) {
    const entree = creer("input", { classe: "champ-texte", attributs: { spellcheck: "false", ...attributs } });
    return { entree, rangee: creer("label", { classe: "rangee-fiche", aide }, [creer("span", { texte: etiquette }), entree]) };
  }

  function dessinerFiche(imprimante) {
    const nom = champ("Nom", { value: imprimante?.nom ?? "", placeholder: "P1S de la salle" });
    const ip = champ("Adresse IP", { value: imprimante?.ip ?? "", placeholder: "192.168.1.50" },
      { nom: "Adresse IP", texte: "Sur l'écran de l'imprimante : Réglages › Réseau. Mieux vaut la fixer dans la box : elle ne changera plus." });
    const serie = champ("N° de série", { value: imprimante?.numero_serie ?? "", placeholder: "01P00A000000000" },
      { nom: "Numéro de série", texte: "Sur l'écran : Réglages › Appareil. 15 caractères, lettres et chiffres." });
    const code = champ("Code d'accès", { type: "password", autocomplete: "off", placeholder: imprimante ? "inchangé" : "8 caractères" },
      { nom: "Code d'accès", texte: "Sur l'écran : Réglages › Réseau › Code d'accès (LAN). Il reste sur le serveur du poste et n'est jamais relu par l'Atelier." });
    const modele = creer("select", { classe: "champ-texte" }, MODELES.map((m) => creer("option", { texte: m.etiquette, attributs: { value: m.valeur } })));
    modele.value = imprimante?.modele ?? "C12";
    const valider = bouton({
      icone: "valider", texte: "Enregistrer", classe: "principal",
      surClic: async () => {
        const id = fiche.id ?? (nom.entree.value.trim() || serie.entree.value.trim()).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
        try {
          await actions.enregistrer(id || "imprimante", {
            nom: nom.entree.value, ip: ip.entree.value, numero_serie: serie.entree.value,
            code_acces: code.entree.value, modele: modele.value,
          });
          fiche = null;
          await relire();
        } catch (erreur) {
          actions.annoncer(erreur.message, true);
        }
      },
    });
    const annuler = bouton({ texte: "Annuler", surClic: () => { fiche = null; relire(); } });
    const retirer = imprimante ? bouton({
      icone: "supprimer", texte: "Retirer",
      aide: { nom: "Retirer l'imprimante", texte: "L'Atelier oublie cette imprimante et son code d'accès." },
      surClic: async () => {
        try {
          await actions.retirer(imprimante.id);
          fiche = null;
          await relire();
        } catch (erreur) {
          actions.annoncer(erreur.message, true);
        }
      },
    }) : null;
    return creer("section", { classe: "bloc-inspecteur fiche-imprimante" }, [
      creer("div", { classe: "titre-bloc", texte: imprimante ? "Connexion de « " + imprimante.nom + " »" : "Nouvelle imprimante" }),
      nom.rangee, creer("label", { classe: "rangee-fiche" }, [creer("span", { texte: "Modèle" }), modele]), ip.rangee, serie.rangee, code.rangee,
      creer("p", {
        classe: "note-imprimante",
        texte: "Sur l'imprimante : Réglages › Réseau, activer « LAN uniquement » puis le mode développeur. Sans lui, l'imprimante refuse les fichiers envoyés par un autre logiciel que Bambu Studio.",
      }),
      creer("div", { classe: "ligne-actions" }, [valider, annuler, retirer]),
    ]);
  }

  // ── Une imprimante ──
  function carte(imprimante) {
    const etat = imprimante.etat ?? {};
    const code = etat.gcode_state;
    const occupee = OCCUPEE.has(code);
    const libelle = !etat.connectee ? "Injoignable" : ETATS[code] ?? (code ?? "Connexion…");
    const details = [];
    if (occupee && Number.isFinite(etat.mc_percent)) details.push(etat.mc_percent + " %");
    if (occupee && etat.total_layer_num > 0) details.push("couche " + etat.layer_num + " / " + etat.total_layer_num);
    if (occupee && etat.mc_remaining_time > 0) details.push("reste " + duree(etat.mc_remaining_time));

    const envoyer = bouton({
      icone: "imprimante", texte: envoiEnCours === imprimante.id ? "Envoi…" : "Imprimer le plateau", classe: "principal",
      aide: { nom: "Imprimer le plateau", texte: "Tranche le plateau, l'envoie à l'imprimante et lance l'impression : chauffe, nivellement, purge, puis la première couche." },
      surClic: async () => {
        envoiEnCours = imprimante.id;
        dessiner(dernieres);
        try {
          actions.annoncer("Tranchage et envoi à « " + imprimante.nom + " »…");
          const choix = bobineChoisie.get(imprimante.id) ?? choixParDefaut;
          // Le modèle de CETTE imprimante : le même préréglage sert aux deux P1,
          // c'est l'envoi qui adapte l'en-tête du fichier.
          await actions.imprimer(imprimante.id, choix === "externe" ? null : Number(choix), imprimante.modele);
          actions.annoncer("Impression lancée sur « " + imprimante.nom + " ».");
        } catch (erreur) {
          actions.annoncer(erreur.message, true);
        }
        envoiEnCours = null;
        await relire();
      },
    });
    envoyer.disabled = !etat.connectee || occupee || envoiEnCours !== null;
    const commande = (action, iconeNom, texte, aide) => bouton({
      icone: iconeNom, texte, aide,
      surClic: async () => {
        try {
          await actions.commande(imprimante.id, action);
          setTimeout(relire, 800);
        } catch (erreur) {
          actions.annoncer(erreur.message, true);
        }
      },
    });
    const pause = code === "PAUSE"
      ? commande("reprendre", "valider", "Reprendre", { nom: "Reprendre l'impression" })
      : commande("pause", "pause", "Pause", { nom: "Mettre en pause", texte: "La buse se range et reste chaude ; reprendre repart de la même ligne." });
    const arreter = commande("arreter", "arret", "Arrêter", { nom: "Arrêter l'impression", texte: "Définitif : l'impression ne pourra pas reprendre." });
    pause.hidden = !occupee || !etat.connectee;
    arreter.hidden = !occupee || !etat.connectee;
    const modifier = bouton({ icone: "construction", classe: "seul", aide: { nom: "Connexion", texte: "Adresse, numéro de série et code d'accès de l'imprimante." }, surClic: () => { fiche = { id: imprimante.id }; dessiner(dernieres); } });

    // La bobine qui imprime : le G-code demande « le filament 1 », l'imprimante doit savoir où le prendre.
    const bobines = etat.bobines ?? [];
    const choixParDefaut = bobines.length > 0 ? String(bobines[0].emplacement) : "externe";
    const bobine = creer("select", { classe: "champ-texte", attributs: { "aria-label": "Bobine" } }, [
      ...bobines.map((b) => creer("option", {
        texte: "AMS " + (Math.floor(b.emplacement / 4) > 0 ? Math.floor(b.emplacement / 4) + 1 + " · " : "") + "emplacement " + (b.emplacement % 4 + 1) + " — " + b.type,
        attributs: { value: String(b.emplacement) },
      })),
      creer("option", { texte: "Bobine externe", attributs: { value: "externe" } }),
    ]);
    bobine.value = bobineChoisie.get(imprimante.id) ?? choixParDefaut;
    bobine.addEventListener("change", () => bobineChoisie.set(imprimante.id, bobine.value));
    const rangeeBobine = creer("label", {
      classe: "rangee-fiche",
      aide: { nom: "Bobine", texte: "La bobine qui imprime le plateau : un emplacement de l'AMS, ou la bobine accrochée à l'arrière de l'imprimante." },
    }, [creer("span", { texte: "Bobine" }), bobine]);
    rangeeBobine.hidden = occupee;

    // La caméra : l'image est gardée d'un rafraîchissement à l'autre, sinon le flux se reconnecterait toutes les 3 s.
    const voirCamera = bouton({
      icone: "oeil", texte: cameraOuverte === imprimante.id ? "Masquer la caméra" : "Caméra",
      aide: { nom: "Caméra en direct", texte: "L'image de la caméra de l'imprimante, une à deux images par seconde." },
      surClic: () => { cameraOuverte = cameraOuverte === imprimante.id ? null : imprimante.id; dessiner(dernieres); },
    });
    voirCamera.disabled = !etat.connectee;
    let video = null;
    if (cameraOuverte === imprimante.id && etat.connectee) {
      video = images.get(imprimante.id);
      if (video === undefined) {
        video = creer("img", { classe: "camera-imprimante", attributs: { alt: "Caméra de " + imprimante.nom } });
        video.src = "/api/imprimantes/" + encodeURIComponent(imprimante.id) + "/camera";
        images.set(imprimante.id, video);
      }
    }

    const barre = creer("div", { classe: "barre-progression" }, [creer("div", { classe: "progression" })]);
    barre.firstChild.style.width = (occupee ? etat.mc_percent ?? 0 : 0) + "%";
    barre.hidden = !occupee;

    return creer("section", { classe: "bloc-inspecteur carte-imprimante" + (etat.connectee ? "" : " injoignable") }, [
      creer("div", { classe: "entete-imprimante" }, [
        creer("span", { classe: "nom-imprimante", texte: imprimante.nom }),
        creer("span", { classe: "modele-imprimante", texte: MODELES.find((m) => m.valeur === imprimante.modele)?.etiquette ?? "" }),
        modifier,
      ]),
      creer("div", { classe: "etat-imprimante", aide: etat.erreur ? { nom: "Connexion", texte: etat.erreur } : undefined }, [
        creer("span", { classe: "pastille-etat " + (etat.connectee ? (code ?? "").toLowerCase() : "hors-ligne") }),
        creer("span", { texte: [libelle, ...details].join(" · ") }),
      ]),
      barre,
      creer("div", { classe: "temperatures-imprimante" }, [
        creer("span", { texte: "Buse " + temperature(etat.nozzle_temper, etat.nozzle_target_temper) }),
        creer("span", { texte: "Plateau " + temperature(etat.bed_temper, etat.bed_target_temper) }),
      ]),
      etat.subtask_name && occupee ? creer("div", { classe: "tache-imprimante", texte: etat.subtask_name }) : null,
      video,
      rangeeBobine,
      creer("div", { classe: "ligne-actions" }, [envoyer, pause, arreter, voirCamera]),
    ]);
  }

  const images = new Map();       // id → <img> du flux en cours
  let dernieres = [];
  function dessiner(imprimantes) {
    dernieres = imprimantes;
    // Un flux qu'on ne regarde plus est coupé : sinon le serveur continuerait à le relayer.
    for (const [id, img] of images) {
      if (id === cameraOuverte) continue;
      img.src = "";
      images.delete(id);
    }
    vider(corps);
    if (fiche !== null) {
      corps.append(dessinerFiche(fiche.id ? imprimantes.find((i) => i.id === fiche.id) : null));
      return;
    }
    if (imprimantes.length === 0) {
      corps.append(creer("p", { classe: "note-imprimante", texte: "Aucune imprimante. Il faut son adresse IP, son numéro de série et son code d'accès, lus sur son écran." }));
    }
    corps.append(...imprimantes.map(carte));
    corps.append(creer("div", { classe: "ligne-actions" }, [
      bouton({ icone: "plus", texte: "Ajouter une imprimante", surClic: () => { fiche = { id: null }; dessiner(dernieres); } }),
    ]));
  }

  async function relire() {
    if (!ouvert) return;
    if (!(await actions.estAdministrateur())) {
      vider(corps);
      corps.append(creer("p", {
        classe: "note-imprimante",
        texte: "L'envoi aux imprimantes est réservé à l'administrateur du site, sur le poste relié au réseau des imprimantes. Le fichier .gcode.3mf (ruban, Exporter) reste disponible pour la carte SD.",
      }));
      return;
    }
    try {
      const imprimantes = await actions.lister();
      // Une fiche ouverte n'est pas redessinée : on y perdrait la saisie en cours.
      if (fiche === null) dessiner(imprimantes);
      else dernieres = imprimantes;
    } catch (erreur) {
      vider(corps);
      corps.append(creer("p", { classe: "note-imprimante", texte: "Serveur injoignable : " + erreur.message }));
    }
  }

  return {
    ouvrir() {
      if (ouvert) return;
      ouvert = true;
      relire();
      minuterie = setInterval(relire, RELECTURE_MS);
    },
    fermer() {
      ouvert = false;
      cameraOuverte = null;
      for (const img of images.values()) img.src = "";
      images.clear();
      clearInterval(minuterie);
      minuterie = null;
      fiche = null;
    },
    estOuvert: () => ouvert,
  };
}
