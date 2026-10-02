/*
 * application/calibration.js
 * ──────────────────────────
 * Les essais de calibration, dans le slicer. Comme dans OrcaSlicer : on choisit
 * un essai dans le ruban Impression, une boîte demande ses valeurs, et
 * l'éprouvette arrive sur le plateau avec les réglages que l'essai impose.
 *
 * Il n'y a plus d'espace à part. Les réglages restent éditables à gauche, c'est
 * le même plateau, le même tranchage, le même envoi à l'imprimante. Ce qui
 * change, c'est que le plateau porte en plus des PARAMÈTRES D'ESSAI : le G-code
 * en tire des modulations couche par couche (M104, M900, une vitesse imposée)
 * et des écarts pièce par pièce. C'est le `set_calib_params` d'Orca.
 *
 * Et rien ne se conclut tout seul : l'utilisateur lit son impression et tape la
 * valeur trouvée dans les réglages. Le logiciel ne devine pas à sa place.
 */

import { ESSAIS, essaiDe, parametresParDefaut, echelleDeLEssai, DOSSIER_DES_MODELES } from "../noyau/calibration.js";

const CHEMIN_DES_PLAQUES = new URL(DOSSIER_DES_MODELES + "plaques_de_debit.json", import.meta.url);

/*
 * dependances : { fenetre, plateau, annoncer, surChangement() }
 *   fenetre  la fenêtre d'opération, qui sait afficher des champs déclarés ;
 *   plateau  l'espace d'impression : c'est lui qui reçoit l'éprouvette.
 */
export function creerCalibration({ fenetre, plateau, annoncer, surChangement }) {
  // L'essai posé sur le plateau, ou null. Il porte ce que le G-code doit savoir.
  let pose = null;            // { essai, parametres, ecartsParPiece }
  let ouvert = null;          // l'essai dont la boîte est ouverte
  let valeurs = {};           // ce qui est tapé dans la boîte
  let registreDesPlaques = null;

  /* Le registre des plaquettes du débit, lu une fois. */
  async function plaquesDeDebit() {
    if (registreDesPlaques === null) {
      const reponse = await fetch(CHEMIN_DES_PLAQUES);
      registreDesPlaques = await reponse.json();
    }
    return registreDesPlaques;
  }

  const reglagesCourants = () => plateau.reglagesEffectifs();

  /* Ce que la boîte affiche : les champs de l'essai, plus son avertissement. */
  function montrer() {
    const essai = ouvert;
    const erreur = essai.valider(valeurs);
    const lignes = [essai.but];
    if (essai.avertissement) lignes.push(essai.avertissement);
    if (erreur !== null) lignes.push(erreur);
    fenetre.definir(valeurs, lignes.join("\n"), erreur === null);
  }

  return {
    /* Les essais, pour le ruban. */
    essais: () => ESSAIS,

    /* L'essai posé sur le plateau, ou null : le ruban et le G-code le lisent. */
    pose() {
      if (pose !== null && !plateau.aUneEprouvette()) pose = null;
      return pose;
    },

    /* Ouvre la boîte d'un essai. Rien n'est posé tant qu'on n'a pas validé. */
    ouvrir(idEssai) {
      const essai = essaiDe(idEssai);
      if (essai === null) return;
      ouvert = essai;
      valeurs = parametresParDefaut(essai, reglagesCourants());
      fenetre.ouvrir({
        titre: essai.titre,
        icone: "regle",
        champs: essai.champs,
        valeurs,
        texteValider: "Poser l'éprouvette",
        surChanger: (cle, valeur) => {
          valeurs = { ...valeurs, [cle]: valeur };
          // Certains champs en recalculent d'autres : la matière recharge sa
          // plage de températures, un Bowden ses K.
          const suite = essai.surChangement ? essai.surChangement(cle, valeurs) : null;
          if (suite !== null) valeurs = { ...valeurs, ...suite };
          montrer();
        },
        surValider: () => this.poser(),
        surAnnuler: () => {
          ouvert = null;
          fenetre.fermer();
          surChangement();
        },
      });
      montrer();
    },

    /* Pose l'éprouvette sur le plateau, avec les réglages que l'essai impose. */
    async poser() {
      const essai = ouvert;
      if (essai === null) return;
      const erreur = essai.valider(valeurs);
      if (erreur !== null) {
        annoncer(erreur, true);
        return;
      }
      const reglages = reglagesCourants();
      const parametres = { ...valeurs };
      try {
        const pieces = essai.plaques
          ? essai.plaques(parametres, reglages, await plaquesDeDebit())
          : [{ fichier: essai.modele(parametres), nom: essai.titre, x: 0, y: 0, ecarts: null }];
        const posees = plateau.actions.poserDesEprouvettes({
          pieces,
          coupe: essai.coupe(parametres),
          echelle: echelleDeLEssai(essai, parametres, reglages),
          ecarts: essai.reglages(parametres, reglages),
        });
        // Ce qui est propre à chaque plaquette : le G-code le retrouvera par
        // l'identifiant de la pièce, quel que soit l'ordre du tranchage. Une
        // plaquette porte des écarts de réglages (les débits), ou un décalage en
        // Z (les écrasements de première couche), ou les deux.
        const ecartsParPiece = new Map(posees
          .map(({ id, ecarts }, rang) => [id, {
            ecarts, decalageZ: pieces[rang].decalageZ ?? 0, etiquette: pieces[rang].nom,
          }])
          // Une plaquette sans écart NI décalage reste de la partie dès qu'il y
          // en a plusieurs : c'est le zéro de l'essai, et le G-code doit porter
          // son étiquette comme les autres, sans quoi la plaquette de référence
          // est la seule anonyme. Une éprouvette unique, elle, n'a rien à dire :
          // ce sont ses modulations par couche qui s'annoncent.
          .filter(([, { ecarts, decalageZ }]) => ecarts !== null || decalageZ !== 0 || pieces.length > 1));
        pose = { essai, parametres, ecartsParPiece };
        ouvert = null;
        fenetre.fermer();
        annoncer("« " + essai.titre + " » : éprouvette posée, le plateau ne porte qu'elle. "
          + "Imprimer, lire le résultat, puis taper la valeur dans les réglages.");
      } catch (e) {
        annoncer("L'éprouvette n'a pas pu être posée : " + e.message, true);
      }
      surChangement();
    },

    /* Retire l'essai : l'éprouvette s'en va, le plateau redevient celui du projet. */
    retirer() {
      // Sans condition sur « pose » : après un rechargement de la page, le
      // plateau porte toujours son éprouvette mais plus personne ne se souvient
      // de l'essai. Le bouton ne faisait alors plus rien, et les réglages
      // imposés restaient en place sans aucun moyen de les enlever.
      pose = null;
      plateau.actions.retirerLesEprouvettes();
      surChangement();
    },

    /*
     * Ce que le G-code ajoute pour l'essai posé : les modulations par couche
     * (M104, M900, une vitesse imposée) et celles de chaque pièce (les
     * plaquettes du débit). Sans essai, rien — le plateau s'imprime comme
     * n'importe quel plateau.
     *
     * modulationsDePiece est RANGÉE dans l'ordre des pièces tranchées, jupe
     * exclue : c'est ce qu'attend generation_gcode.
     */
    modulationsPour(etat) {
      // L'éprouvette a pu être supprimée à la main : l'essai s'arrête avec elle.
      if (pose !== null && !plateau.aUneEprouvette()) pose = null;
      if (pose === null) return { modulations: [], modulationsDePiece: [] };
      const nombreDeCouches = etat.couches?.hauteurs?.length ?? 0;
      const modulations = pose.essai.modulations && nombreDeCouches > 0
        ? pose.essai.modulations(pose.parametres, nombreDeCouches, etat.reglages, etat.couches)
        : [];
      const modulationsDePiece = etat.pieces
        .filter((piece) => piece.jupe !== true)
        .map((piece) => {
          const propre = pose.ecartsParPiece.get(piece.idNoeud);
          return propre === undefined ? null : {
            reglages: propre.ecarts, decalageZ: propre.decalageZ, etiquette: propre.etiquette,
          };
        });
      return { modulations, modulationsDePiece };
    },
  };
}
