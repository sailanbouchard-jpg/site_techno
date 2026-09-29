/*
 * noyau/reglages_impression.js
 * ────────────────────────────
 * Les réglages du tranchage : leur description (une ligne par réglage), les
 * préréglages fournis, et le calcul des valeurs effectives d'un plateau.
 *
 * CINQ préréglages se complètent, dans cet ordre — chacun suppose celui qui
 * le précède, et c'est cet ordre qu'on suit pour choisir comme pour calibrer :
 *   imprimante  la machine : limites de mouvement, levée, essuyage, sortie G-code
 *   buse        le diamètre de la buse et les largeurs de ligne qu'elle pose
 *   plaque      ce qui touche le plateau : hauteur de la première couche sur
 *               CETTE plaque, écrasement, patte d'éléphant, bordure, jupe
 *   materiau    la bobine : températures, débit, avance de pression, rétraction,
 *               refroidissement
 *   reglages    l'intention d'impression : couches, parois, remplissage, vitesses
 *
 * Le diamètre de buse commande les trois derniers : un préréglage de plaque, de
 * matériau ou d'impression porte la buse pour laquelle il a été calibré, et ne
 * se propose que pour elle. Changer de buse change donc tout ce qui suit.
 *
 * Chaque réglage dit de quel préréglage il vient (source). Un plateau retient :
 *   impression.imprimante, .buse, .plaque, .materiau, .reglages  les identifiants
 *   impression.ecarts                                            ce qui en diffère
 * Valeur effective = écart s'il existe, sinon valeur du préréglage, sinon défaut.
 *
 * Chaque réglage :
 *   cle, onglet, groupe, etiquette, aide, unite, niveau ("simple" | "avance"),
 *   defaut, min, max, entier, valeursUsuelles, choix [{ valeur, etiquette }],
 *   source ("reglages" par défaut, ou une des quatre autres),
 *   orca : le nom du réglage dans OrcaSlicer, pour retrouver la référence.
 * Ajouter un réglage = une ligne ici ; le panneau le montre sans autre code.
 *
 * Chaque réglage reçoit aussi un RÔLE, qui dit comment on arrive à sa valeur :
 *   "fixe"          on le choisit, il n'y a rien à mesurer : c'est une intention
 *                   (hauteur de couche, nombre de parois, densité de remplissage) ;
 *   "a_determiner"  un essai de calibration le trouve ; determinePar dit lequel ;
 *   "independant"   il ne change rien à ce que les essais mesurent.
 * Dans l'espace de calibration, les deux premiers ne s'éditent pas à la main :
 * les « fixes » viennent de la combinaison choisie, les autres de leur essai.
 */

export const ONGLETS = Object.freeze([
  { id: "qualite", etiquette: "Qualité" },
  { id: "resistance", etiquette: "Résistance" },
  { id: "vitesse", etiquette: "Vitesse" },
  { id: "adherence", etiquette: "Adhérence" },
  { id: "extrusion", etiquette: "Extrusion" },
  { id: "matiere", etiquette: "Matière" },
]);

const LARGEURS_USUELLES = [0.35, 0.4, 0.42, 0.45, 0.5, 0.55, 0.6];
const largeur = (cle, groupe, etiquette, defaut, niveau, orca, aide) => ({
  cle, onglet: "qualite", groupe, etiquette, unite: "mm", niveau, defaut, min: 0.2, max: 1, valeursUsuelles: LARGEURS_USUELLES, orca, aide,
});
const vitesse = (cle, etiquette, defaut, niveau, orca, aide) => ({
  cle, onglet: "vitesse", groupe: "Vitesses", etiquette, unite: "mm/s", niveau, defaut, min: 5, max: 1000, orca, aide,
});
const vitesseDeSurplomb = (cle, etiquette, defaut, orca, aide) => ({
  cle, onglet: "vitesse", groupe: "Surplombs", etiquette, unite: "mm/s", niveau: "avance", defaut, min: 5, max: 200, orca, aide,
});
const acceleration = (cle, etiquette, defaut, orca, aide) => ({
  cle, onglet: "vitesse", groupe: "Accélérations", etiquette, unite: "mm/s²", niveau: "avance", defaut, min: 100, max: 20000, orca, aide,
});

export const MOTIFS_DE_SURFACE = Object.freeze([
  { valeur: "monotone", etiquette: "Monotone" },
  { valeur: "monotone_lignes", etiquette: "Monotone, lignes séparées" },
  { valeur: "rectiligne", etiquette: "Rectiligne" },
  { valeur: "concentrique", etiquette: "Concentrique" },
]);

const CATALOGUE = [
  // ── Qualité ──
  {
    cle: "diametre_buse", onglet: "qualite", groupe: "Buse", etiquette: "Diamètre de la buse",
    unite: "mm", niveau: "simple", defaut: 0.4, min: 0.2, max: 1, valeursUsuelles: [0.2, 0.4, 0.6, 0.8],
    source: "buse", orca: "nozzle_diameter",
    aide: "La buse montée sur la machine. Elle commande tout ce qui suit : les largeurs de ligne, la hauteur de couche possible, le débit que la buse sait fondre. Les préréglages de plaque, de matériau et d'impression sont calibrés pour une buse donnée et ne se proposent que pour elle.",
  },
  {
    cle: "hauteur_couche", onglet: "qualite", groupe: "Hauteur de couche", etiquette: "Hauteur de couche",
    unite: "mm", niveau: "simple", defaut: 0.2, min: 0.04, max: 0.32, valeursUsuelles: [0.08, 0.12, 0.16, 0.2, 0.24, 0.28],
    orca: "layer_height",
    aide: "Épaisseur de chaque couche. Plus fine : surfaces courbes plus lisses, impression plus longue. Commune à tout le plateau.",
  },
  {
    cle: "hauteur_premiere_couche", onglet: "qualite", groupe: "Hauteur de couche", etiquette: "Première couche",
    unite: "mm", niveau: "simple", defaut: 0.2, min: 0.08, max: 0.35, valeursUsuelles: [0.16, 0.2, 0.24, 0.28],
    orca: "initial_layer_print_height",
    aide: "Épaisseur de la couche posée sur le plateau. Plus épaisse, elle rattrape mieux les défauts de planéité.",
  },
  largeur("largeur_ligne", "Largeur de ligne", "Par défaut", 0.42, "avance", "line_width", "Largeur des lignes qui n'ont pas de réglage propre (jupe, bordure)."),
  largeur("largeur_premiere_couche", "Largeur de ligne", "Première couche", 0.5, "avance", "initial_layer_line_width", "Plus large que les autres couches : la première couche adhère mieux au plateau."),
  largeur("largeur_paroi_exterieure", "Largeur de ligne", "Paroi extérieure", 0.42, "simple", "outer_wall_line_width", "La ligne visible de la pièce. Autour de 105 à 120 % de la buse : bonne précision des cotes et bel aspect."),
  largeur("largeur_parois_interieures", "Largeur de ligne", "Parois intérieures", 0.45, "simple", "inner_wall_line_width", "Plus larges, les parois intérieures rendent la pièce plus solide."),
  largeur("largeur_dessus", "Largeur de ligne", "Surface du dessus", 0.42, "avance", "top_surface_line_width", "Plus fine : dessus plus lisse."),
  largeur("largeur_remplissage", "Largeur de ligne", "Remplissage", 0.45, "avance", "sparse_infill_line_width", "Autour de 115 % de la buse : meilleure liaison entre couches sans dépasser le débit."),
  largeur("largeur_plein_interieur", "Largeur de ligne", "Plein intérieur", 0.42, "avance", "internal_solid_infill_line_width", "Largeur des couches pleines cachées sous le dessus et sur le dessous."),
  largeur("largeur_pont", "Largeur de ligne", "Ponts", 0.4, "avance", "bridge_line_width", "Pas plus large que la buse : une ligne tendue dans le vide ne s'étale pas."),
  {
    cle: "position_couture", onglet: "qualite", groupe: "Couture", etiquette: "Position",
    niveau: "simple", defaut: "alignee",
    choix: [
      { valeur: "alignee", etiquette: "Alignée" },
      { valeur: "proche", etiquette: "Au plus près" },
      { valeur: "arriere", etiquette: "À l'arrière" },
      { valeur: "aleatoire", etiquette: "Aléatoire" },
    ],
    orca: "seam_position",
    aide: "Là où chaque tour de paroi commence et finit : un petit défaut. Alignée : une seule couture verticale, cachée dans un angle si possible. Au plus près : dans les angles, là où la buse arrive. À l'arrière : face au fond de la machine. Aléatoire : dispersée, sans ligne visible mais avec des points partout.",
  },
  {
    cle: "couture_biseau", onglet: "qualite", groupe: "Couture", etiquette: "Couture en biseau",
    niveau: "simple", defaut: "non",
    choix: [
      { valeur: "non", etiquette: "Non" },
      { valeur: "oui", etiquette: "Oui" },
    ],
    orca: "seam_slope_type",
    aide: "Au lieu de s'arrêter net, le tour de paroi se termine en fondu et le suivant démarre en fondu par-dessus : la couture devient un biseau, presque invisible. Demande une machine régulière en débit ; à essayer sur une pièce d'aspect.",
  },
  {
    cle: "longueur_biseau", onglet: "qualite", groupe: "Couture", etiquette: "Longueur du biseau",
    unite: "mm", niveau: "avance", defaut: 10, min: 1, max: 50, valeursUsuelles: [5, 10, 15, 20],
    orca: "seam_slope_start_height",
    aide: "Longueur sur laquelle la matière monte puis redescend. Plus long : plus discret, mais la paroi est un peu plus maigre sur cette longueur.",
  },
  {
    cle: "repassage", onglet: "qualite", groupe: "Repassage", etiquette: "Repasser les surfaces",
    niveau: "simple", defaut: "non",
    choix: [
      { valeur: "non", etiquette: "Non" },
      { valeur: "dessus", etiquette: "Surfaces du dessus" },
    ],
    orca: "ironing_type",
    aide: "La buse repasse sur la dernière couche en déposant à peine de matière : elle fond et lisse les sillons. Le dessus devient net, au prix de quelques minutes par surface.",
  },
  {
    cle: "espacement_repassage", onglet: "qualite", groupe: "Repassage", etiquette: "Espacement",
    unite: "mm", niveau: "avance", defaut: 0.1, min: 0.05, max: 0.5, valeursUsuelles: [0.08, 0.1, 0.15, 0.2],
    orca: "ironing_spacing",
    aide: "Écart entre deux passages. Serré : plus lisse, plus long.",
  },
  {
    cle: "debit_repassage", onglet: "qualite", groupe: "Repassage", etiquette: "Débit",
    unite: "%", niveau: "avance", defaut: 10, min: 0, max: 40, entier: true, valeursUsuelles: [0, 8, 10, 15, 20],
    orca: "ironing_flow",
    aide: "Matière déposée pendant le repassage, en part d'une ligne normale. Juste de quoi combler les sillons : trop, et la surface gonfle.",
  },
  {
    cle: "parois_variables", onglet: "qualite", groupe: "Parois", etiquette: "Parois à largeur variable",
    niveau: "simple", defaut: "oui",
    choix: [
      { valeur: "oui", etiquette: "Oui" },
      { valeur: "non", etiquette: "Non" },
    ],
    orca: "wall_generator",
    aide: "Dans une nervure fine ou un coin aigu, la largeur ne tombe jamais juste : il reste un filet de vide. Plutôt que d'y poser un cordon fin à part, la paroi voisine est élargie sur cette longueur. La matière est soudée au lieu d'être juxtaposée.",
  },
  {
    cle: "remplir_interstices", onglet: "qualite", groupe: "Parois", etiquette: "Remplir les interstices",
    niveau: "avance", defaut: "partout",
    choix: [
      { valeur: "partout", etiquette: "Partout" },
      { valeur: "dessus_dessous", etiquette: "Dessus et dessous" },
      { valeur: "nulle_part", etiquette: "Nulle part" },
    ],
    orca: "gap_fill_target",
    aide: "Les espaces trop étroits pour une paroi entière (entre deux parois, dans une partie fine) sont remplis de lignes plus fines. Sans eux, ces zones restent creuses.",
  },
  {
    cle: "compensation_premiere_couche", onglet: "qualite", groupe: "Compensations", etiquette: "Patte d'éléphant",
    unite: "mm", niveau: "avance", defaut: 0.15, min: 0, max: 1, valeursUsuelles: [0, 0.1, 0.15, 0.2, 0.3],
    orca: "elefant_foot_compensation",
    aide: "La première couche s'écrase et déborde : son contour est rentré d'autant. Une pièce dont le pied est plus large que le reste demande plus.",
  },
  {
    cle: "compensation_trous", onglet: "qualite", groupe: "Compensations", etiquette: "Compensation des trous",
    unite: "mm", niveau: "avance", defaut: 0, min: -0.5, max: 0.5, valeursUsuelles: [0, 0.05, 0.1, 0.15, 0.2],
    orca: "hole_size_compensation",
    aide: "Un trou sort toujours trop petit : la matière se contracte vers l'intérieur de la courbe. Cette valeur agrandit chaque trou de son diamètre. À mesurer sur une pièce d'essai.",
  },
  {
    cle: "compensation_contours", onglet: "qualite", groupe: "Compensations", etiquette: "Compensation des contours",
    unite: "mm", niveau: "avance", defaut: 0, min: -0.5, max: 0.5,
    orca: "xy_contour_compensation",
    aide: "Rétrécit (valeur négative) ou élargit tous les contours extérieurs, pour rattraper une cote systématiquement fausse.",
  },
  {
    cle: "ordre_parois", onglet: "qualite", groupe: "Parois", etiquette: "Ordre des parois",
    niveau: "avance", defaut: "interieures_puis_exterieure",
    choix: [
      { valeur: "interieures_puis_exterieure", etiquette: "Intérieures puis extérieure" },
      { valeur: "exterieure_puis_interieures", etiquette: "Extérieure puis intérieures" },
    ],
    orca: "wall_sequence",
    aide: "Extérieure d'abord : cotes plus justes. Intérieures d'abord : meilleurs surplombs et plus bel aspect.",
  },
  // ── Résistance ──
  {
    cle: "nombre_parois", onglet: "resistance", groupe: "Parois", etiquette: "Nombre de parois",
    niveau: "simple", defaut: 2, min: 1, max: 20, entier: true, orca: "wall_loops",
    aide: "Nombre de lignes qui forment le tour de la pièce. Plus de parois : pièce plus solide, surtout en flexion.",
  },
  {
    cle: "couches_dessus", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Couches du dessus",
    niveau: "simple", defaut: 5, min: 0, max: 50, entier: true, orca: "top_shell_layers",
    aide: "Couches pleines sous chaque surface du dessus, surface comprise. Trop peu : le remplissage se devine au travers.",
  },
  {
    cle: "epaisseur_dessus", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Épaisseur min. du dessus",
    unite: "mm", niveau: "avance", defaut: 1, min: 0, max: 10, orca: "top_shell_thickness",
    aide: "Si les couches du dessus sont plus minces que ça (couches fines), on en ajoute jusqu'à cette épaisseur.",
  },
  {
    cle: "couches_dessous", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Couches du dessous",
    niveau: "simple", defaut: 3, min: 0, max: 50, entier: true, orca: "bottom_shell_layers",
    aide: "Couches pleines au-dessus de chaque surface du dessous, surface comprise.",
  },
  {
    cle: "epaisseur_dessous", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Épaisseur min. du dessous",
    unite: "mm", niveau: "avance", defaut: 0, min: 0, max: 10, orca: "bottom_shell_thickness",
    aide: "Comme pour le dessus : une épaisseur minimale, atteinte en ajoutant des couches.",
  },
  {
    cle: "motif_dessus", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Motif du dessus",
    niveau: "simple", defaut: "monotone", choix: MOTIFS_DE_SURFACE, orca: "top_surface_pattern",
    aide: "Monotone : lignes parallèles posées toujours dans le même sens et reliées entre elles, l'aspect le plus régulier. Lignes séparées : chaque ligne est posée seule, sans demi-tour au bord, mais chaque départ et chaque arrêt marque la surface tant que l'avance de pression n'est pas calibrée.",
  },
  {
    cle: "motif_dessous", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Motif du dessous",
    niveau: "avance", defaut: "monotone", choix: MOTIFS_DE_SURFACE, orca: "bottom_surface_pattern",
    aide: "Le motif de la face posée sur le plateau et des dessous des surplombs.",
  },
  {
    cle: "densite_remplissage", onglet: "resistance", groupe: "Remplissage", etiquette: "Densité",
    unite: "%", niveau: "simple", defaut: 15, min: 0, max: 100, valeursUsuelles: [0, 10, 15, 20, 25, 30, 40, 50, 100],
    orca: "sparse_infill_density",
    aide: "Part du volume intérieur remplie de matière. 15 % suffit à une pièce d'aspect ; 30 à 50 % pour une pièce qui travaille.",
  },
  {
    cle: "motif_remplissage", onglet: "resistance", groupe: "Remplissage", etiquette: "Motif",
    niveau: "simple", defaut: "gyroide",
    choix: [
      { valeur: "gyroide", etiquette: "Gyroïde" },
      { valeur: "rectiligne", etiquette: "Rectiligne" },
    ],
    orca: "sparse_infill_pattern",
    aide: "Gyroïde : résistance égale dans toutes les directions, jamais deux lignes au même endroit. Rectiligne : le plus rapide, une direction par couche. Les motifs qui repassent sur un point déjà posé (grille, triangles) ne sont pas proposés : le bourrelet fait taper la buse à la couche suivante.",
  },
  {
    cle: "angle_remplissage", onglet: "resistance", groupe: "Remplissage", etiquette: "Direction",
    unite: "°", niveau: "avance", defaut: 45, min: -90, max: 90, orca: "infill_direction",
    aide: "Angle des lignes de remplissage par rapport à l'axe X de la machine.",
  },
  {
    cle: "chevauchement_remplissage", onglet: "resistance", groupe: "Remplissage", etiquette: "Chevauchement avec les parois",
    unite: "%", niveau: "avance", defaut: 15, min: 0, max: 50, orca: "infill_wall_overlap",
    aide: "De combien le remplissage mord sur la dernière paroi (en % de sa largeur) : il s'y accroche mieux.",
  },
  // ── Vitesse (P1P/P1S) ──
  vitesse("vitesse_premiere_couche", "Première couche", 50, "simple", "initial_layer_speed", "Lente : la première couche doit bien s'écraser sur le plateau."),
  vitesse("vitesse_paroi_exterieure", "Paroi extérieure", 200, "simple", "outer_wall_speed", "Plus lente que le reste : c'est la surface qu'on voit."),
  vitesse("vitesse_parois_interieures", "Parois intérieures", 300, "simple", "inner_wall_speed", "Cachées : elles peuvent aller plus vite."),
  vitesse("vitesse_remplissage", "Remplissage", 270, "simple", "sparse_infill_speed", "Souvent plafonnée par le débit maximal du filament."),
  vitesse("vitesse_plein_interieur", "Plein intérieur", 250, "avance", "internal_solid_infill_speed", "Couches pleines cachées."),
  vitesse("vitesse_dessus", "Surface du dessus", 200, "simple", "top_surface_speed", "Plus lente : dessus plus lisse."),
  {
    cle: "strategie_surplomb", onglet: "vitesse", groupe: "Surplombs", etiquette: "Traitement des surplombs",
    niveau: "simple", defaut: "paliers",
    choix: [
      { valeur: "paliers", etiquette: "Paliers de vitesse" },
      { valeur: "unique", etiquette: "Vitesse unique" },
      { valeur: "ponts", etiquette: "Ponts sur les débords" },
      { valeur: "appui", etiquette: "Appui maximal" },
    ],
    orca: "enable_overhang_speed",
    aide: "Comment imprimer une paroi qui dépasse dans le vide. Paliers : la vitesse baisse par crans selon ce qui dépasse, comme dans OrcaSlicer. Vitesse unique : tout débord passe à la vitesse moyenne, simple à régler. Ponts sur les débords : un débord dont les deux bouts reposent sur la couche d'en dessous est tendu comme un pont, ligne fine et rapide, sans retomber. Appui maximal : paliers, plus parois intérieures d'abord et débit réduit, pour les pièces qui se retroussent.",
  },
  vitesseDeSurplomb("vitesse_surplomb_leger", "Surplomb léger (25 %)", 50, "overhang_2_4_speed", "Un quart de la ligne dans le vide : le reste porte encore bien."),
  vitesseDeSurplomb("vitesse_surplomb_moyen", "Surplomb moyen (50 %)", 30, "overhang_3_4_speed", "La moitié de la ligne dans le vide. C'est aussi la vitesse de la stratégie « vitesse unique »."),
  vitesseDeSurplomb("vitesse_surplomb_fort", "Surplomb fort (75 %)", 10, "overhang_4_4_speed", "Presque toute la ligne dans le vide : très lent, la matière a le temps de figer."),
  {
    cle: "debit_surplomb", onglet: "vitesse", groupe: "Surplombs", etiquette: "Débit des surplombs",
    unite: "%", niveau: "avance", defaut: 100, min: 50, max: 120, entier: true, valeursUsuelles: [85, 90, 95, 100],
    orca: "overhang_totally_speed",
    aide: "Matière poussée dans un surplomb, en part du normal. Un peu moins : la ligne pend moins et se retrousse moins, au prix d'un dessous plus ouvert. La stratégie « appui maximal » le descend à 90 %.",
  },
  vitesse("vitesse_pont", "Ponts", 50, "avance", "bridge_speed", "Une ligne tendue dans le vide : lente, elle a le temps de figer avant de s'affaisser."),
  vitesse("vitesse_pont_interieur", "Ponts intérieurs", 80, "avance", "internal_bridge_speed", "Une couche pleine tendue au-dessus du remplissage : elle s'appuie de place en place, on peut aller plus vite qu'un vrai pont."),
  vitesse("vitesse_repassage", "Repassage", 60, "avance", "ironing_speed", "Lent : la buse doit avoir le temps de faire fondre le sillon qu'elle lisse."),
  vitesse("vitesse_interstices", "Interstices", 250, "avance", "gap_infill_speed", "Les lignes fines qui comblent les espaces étroits."),
  vitesse("vitesse_deplacement", "Déplacements", 500, "avance", "travel_speed", "Mouvements sans extrusion, d'une ligne à la suivante."),
  acceleration("acceleration_defaut", "Par défaut", 10000, "default_acceleration", "Accélération des lignes qui n'ont pas de réglage propre."),
  acceleration("acceleration_paroi_exterieure", "Paroi extérieure", 5000, "outer_wall_acceleration", "Plus douce sur la face visible : moins de vibrations."),
  acceleration("acceleration_dessus", "Surface du dessus", 2000, "top_surface_acceleration", "Plus douce sur le dessus visible."),
  acceleration("acceleration_premiere_couche", "Première couche", 500, "initial_layer_acceleration", "Douce, pour que la première couche ne décolle pas."),
  acceleration("acceleration_deplacement", "Déplacements", 10000, "travel_acceleration", "Mouvements sans extrusion. Trop forte, la tête secoue la machine et peut arracher une pièce mal collée."),
  {
    cle: "couches_transition", onglet: "vitesse", groupe: "Vitesses", etiquette: "Couches de transition",
    niveau: "simple", defaut: 0, min: 0, max: 10, entier: true, orca: "slow_down_layers",
    aide: "Après la première couche, les vitesses et accélérations montent par paliers sur ce nombre de couches. Évite qu'une première couche encore tendre soit arrachée par des couches rapides.",
  },
  // ── Extrusion (rétraction, essuyage) ──
  {
    cle: "longueur_retraction", onglet: "extrusion", groupe: "Rétraction", etiquette: "Longueur",
    unite: "mm", niveau: "simple", defaut: 0.8, min: 0, max: 5, valeursUsuelles: [0, 0.4, 0.6, 0.8, 1, 1.5],
    orca: "retraction_length",
    aide: "Filament ramené en arrière avant un déplacement : sans lui, la matière coule et laisse des fils. Trop : la buse se désamorce et la ligne suivante commence trop maigre. 0,8 mm sur les P1 à entraînement direct.",
  },
  {
    cle: "vitesse_retraction", onglet: "extrusion", groupe: "Rétraction", etiquette: "Vitesse",
    unite: "mm/s", niveau: "avance", defaut: 30, min: 5, max: 100, orca: "retraction_speed",
    aide: "Vitesse du retour en arrière. Trop vite, le filament mou peut se hacher dans l'entraîneur.",
  },
  {
    cle: "deplacement_sans_retraction", onglet: "extrusion", groupe: "Rétraction", etiquette: "Déplacement minimal",
    unite: "mm", niveau: "avance", defaut: 1, min: 0, max: 10, orca: "retraction_minimum_travel",
    aide: "Un saut plus court que ça ne rétracte pas : la buse n'a pas le temps de couler, et chaque rétraction use le filament.",
  },
  {
    cle: "levee_buse", onglet: "extrusion", groupe: "Rétraction", etiquette: "Levée de buse",
    unite: "mm", niveau: "avance", defaut: 0.4, min: 0, max: 2, valeursUsuelles: [0, 0.2, 0.4, 0.6],
    orca: "z_hop",
    aide: "La buse monte avant de se déplacer, pour ne pas frotter la pièce. Sur les P1, c'est le plateau qui bouge : trop de levées secouent la machine.",
  },
  {
    cle: "pression_avance", onglet: "extrusion", groupe: "Avance de pression", etiquette: "Coefficient K",
    niveau: "avance", defaut: 0.02, min: 0, max: 0.3, pasFixe: 0.005, valeursUsuelles: [0, 0.01, 0.02, 0.03, 0.05],
    orca: "pressure_advance",
    aide: "L'extrudeur pousse un peu en avance quand la tête accélère, et relâche quand elle freine : sans cela, les coins gonflent et les débuts de ligne manquent de matière. 0 désactive. La valeur se trouve avec l'outil de calibration « Avance de pression ».",
  },
  {
    cle: "arcs", onglet: "extrusion", groupe: "Sortie", etiquette: "Arcs dans le G-code",
    niveau: "avance", defaut: "oui",
    choix: [
      { valeur: "oui", etiquette: "Oui" },
      { valeur: "non", etiquette: "Non" },
    ],
    orca: "enable_arc_fitting",
    aide: "Les suites de petits segments qui suivent un cercle deviennent des arcs (G2/G3) : fichier bien plus petit, et courbes plus fluides, l'imprimante n'ayant plus à lire des milliers de lignes.",
  },
  {
    cle: "tolerance_arcs", onglet: "extrusion", groupe: "Sortie", etiquette: "Tolérance des arcs",
    unite: "mm", niveau: "avance", defaut: 0.05, min: 0.005, max: 0.2, valeursUsuelles: [0.01, 0.025, 0.05, 0.1],
    orca: "resolution",
    aide: "Écart maximal entre l'arc et les points d'origine. Plus grand : moins de lignes, mais la forme s'arrondit.",
  },
  {
    cle: "longueur_essuyage", onglet: "extrusion", groupe: "Essuyage", etiquette: "Longueur d'essuyage",
    unite: "mm", niveau: "avance", defaut: 2, min: 0, max: 10, orca: "wipe_distance",
    aide: "Avant de partir, la buse repasse sur la fin de la ligne en rétractant : ce qui suinte se dépose sur la pièce au lieu de faire un fil. 0 : pas d'essuyage.",
  },
  // ── Adhérence ──
  {
    cle: "tours_jupe", onglet: "adherence", groupe: "Jupe", etiquette: "Nombre de tours",
    niveau: "simple", defaut: 0, min: 0, max: 20, entier: true, orca: "skirt_loops",
    aide: "Une ligne autour de toutes les pièces, avant de les imprimer : elle amorce la buse. 0 : pas de jupe.",
  },
  {
    cle: "distance_jupe", onglet: "adherence", groupe: "Jupe", etiquette: "Distance aux pièces",
    unite: "mm", niveau: "avance", defaut: 2, min: 0, max: 50, orca: "skirt_distance",
    aide: "Écart entre la jupe et les pièces.",
  },
  {
    cle: "type_plaque", onglet: "adherence", groupe: "Plateau", etiquette: "Type de plaque",
    niveau: "simple", defaut: "texturee", source: "plaque",
    choix: [
      { valeur: "texturee", etiquette: "PEI texturée" },
      { valeur: "lisse", etiquette: "PEI lisse / haute température" },
      { valeur: "froide", etiquette: "Cool Plate" },
      { valeur: "engineering", etiquette: "Engineering" },
    ],
    orca: "curr_bed_type",
    aide: "La famille à laquelle la plaque appartient. C'est elle qui est transmise à l'imprimante, qui vérifie qu'elle correspond à la plaque posée. Une plaque du commerce qui imite la PEI texturée se déclare texturée.",
  },
  {
    cle: "decalage_z_plaque", onglet: "adherence", groupe: "Plateau", etiquette: "Décalage Z de la plaque",
    unite: "mm", niveau: "simple", defaut: 0, min: -0.2, max: 0.2, pasFixe: 0.01, decimales: 3, source: "plaque",
    orca: "z_offset",
    aide: "Corrige la hauteur de la buse à la première couche, pour CETTE plaque. Négatif : la buse descend, la matière s'écrase davantage. La texture d'une plaque est plus haute que la surface que le palpeur touche, et deux plaques n'ont jamais la même épaisseur : c'est ce décalage qui les remet d'accord. Il est mesuré par l'essai d'écrasement de la première couche.",
  },
  {
    cle: "largeur_bordure", onglet: "adherence", groupe: "Bordure", etiquette: "Largeur",
    unite: "mm", niveau: "simple", defaut: 0, min: 0, max: 50, valeursUsuelles: [0, 3, 5, 8, 10],
    orca: "brim_width",
    aide: "Une collerette plate collée au pied de la pièce, qui l'empêche de se décoller. À retirer après impression. 0 : pas de bordure.",
  },
  {
    cle: "ecart_bordure", onglet: "adherence", groupe: "Bordure", etiquette: "Écart avec la pièce",
    unite: "mm", niveau: "avance", defaut: 0.1, min: 0, max: 2, orca: "brim_object_gap",
    aide: "Un petit écart rend la bordure plus facile à détacher.",
  },
  // ── Matière ──
  {
    cle: "debit_maximal", onglet: "matiere", groupe: "Débit", etiquette: "Débit volumétrique max.",
    unite: "mm³/s", niveau: "simple", defaut: 12, min: 1, max: 60, orca: "filament_max_volumetric_speed",
    aide: "Ce que la buse arrive à fondre par seconde. Toutes les vitesses sont plafonnées par lui : c'est la vraie limite des P1.",
  },
  {
    cle: "temps_couche_min", onglet: "matiere", groupe: "Refroidissement", etiquette: "Temps de couche minimal",
    unite: "s", niveau: "simple", defaut: 8, min: 0, max: 60, orca: "slow_down_layer_time",
    aide: "Une couche imprimée plus vite que ça n'a pas le temps de refroidir : l'imprimante ralentit. Sur une pièce haute et fine, c'est ce qui fait l'essentiel de la durée.",
  },
  {
    cle: "temperature_buse_premiere", onglet: "matiere", groupe: "Températures", etiquette: "Buse, première couche",
    unite: "°C", niveau: "simple", defaut: 220, min: 150, max: 300, entier: true, orca: "nozzle_temperature_initial_layer",
    aide: "Un peu plus chaude que la suite : la première couche adhère mieux.",
  },
  {
    cle: "temperature_buse", onglet: "matiere", groupe: "Températures", etiquette: "Buse, autres couches",
    unite: "°C", niveau: "simple", defaut: 220, min: 150, max: 300, entier: true, orca: "nozzle_temperature",
    aide: "La température de la buse à partir de la deuxième couche.",
  },
  {
    cle: "temperature_plateau_premiere", onglet: "matiere", groupe: "Températures", etiquette: "Plateau, première couche",
    unite: "°C", niveau: "simple", defaut: 55, min: 0, max: 120, entier: true, orca: "textured_plate_temp_initial_layer",
    aide: "Pour la plaque choisie dans Adhérence.",
  },
  {
    cle: "temperature_plateau", onglet: "matiere", groupe: "Températures", etiquette: "Plateau, autres couches",
    unite: "°C", niveau: "simple", defaut: 55, min: 0, max: 120, entier: true, orca: "textured_plate_temp",
    aide: "Pour la plaque choisie dans Adhérence.",
  },
  {
    cle: "rapport_debit", onglet: "matiere", groupe: "Débit", etiquette: "Rapport de débit",
    niveau: "avance", defaut: 1, min: 0.5, max: 1.5, decimales: 3, orca: "filament_flow_ratio",
    aide: "Multiplie la matière poussée. Au-dessous de 1 : le filament gonfle un peu en sortant de la buse, on en pousse moins.",
  },
  {
    cle: "ventilateur_min", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur minimal",
    unite: "%", niveau: "avance", defaut: 100, min: 0, max: 100, entier: true, orca: "fan_min_speed",
    aide: "Vitesse du ventilateur de pièce sur une couche longue à imprimer (plus longue que « Couche longue »).",
  },
  {
    cle: "ventilateur_max", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur maximal",
    unite: "%", niveau: "avance", defaut: 100, min: 0, max: 100, entier: true, orca: "fan_max_speed",
    aide: "Vitesse du ventilateur sur une couche courte (au temps de couche minimal). Entre les deux, la vitesse varie avec le temps de la couche.",
  },
  {
    cle: "temps_couche_ventilateur", onglet: "matiere", groupe: "Refroidissement", etiquette: "Couche longue",
    unite: "s", niveau: "avance", defaut: 100, min: 0, max: 600, orca: "fan_cooling_layer_time",
    aide: "Une couche plus longue que ça refroidit d'elle-même : le ventilateur reste au minimal.",
  },
  {
    cle: "couches_sans_ventilateur", onglet: "matiere", groupe: "Refroidissement", etiquette: "Couches sans ventilateur",
    niveau: "avance", defaut: 1, min: 0, max: 10, entier: true, orca: "close_fan_the_first_x_layers",
    aide: "Les premières couches restent chaudes : elles collent mieux au plateau.",
  },
  {
    cle: "ventilateur_paroi_exterieure", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur, paroi extérieure",
    unite: "%", niveau: "avance", defaut: 0, min: 0, max: 100, entier: true, 
    orca: "dont_slow_down_outer_wall",
    aide: "Ventilation propre à la face visible, quand elle doit être plus refroidie que le reste. 0 : même ventilateur que la couche.",
  },
  {
    cle: "ventilateur_dessus", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur, surface du dessus",
    unite: "%", niveau: "avance", defaut: 0, min: 0, max: 100, entier: true, 
    orca: "top_surface_fan_speed",
    aide: "Une couche du dessus bien refroidie reste plane. 0 : même ventilateur que la couche.",
  },
  {
    cle: "ventilateur_surplomb", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur, ponts et surplombs",
    unite: "%", niveau: "avance", defaut: 100, min: 0, max: 100, entier: true, 
    orca: "overhang_fan_speed",
    aide: "Une ligne tendue dans le vide doit figer avant de pendre : ventilateur à fond, quel que soit le temps de la couche.",
  },
  {
    cle: "modele_machine", onglet: "extrusion", groupe: "Machine", etiquette: "Machine visée",
    niveau: "simple", defaut: "p1s", source: "imprimante",
    choix: [
      { valeur: "p1s", etiquette: "P1S" },
      { valeur: "p1p", etiquette: "P1P" },
    ],
    orca: "printer_model",
    aide: "La P1P et la P1S tranchent pareil : même volume, même extrudeur, mêmes limites. Seul l'en-tête du fichier diffère (la P1S a un ventilateur de carte et un ventilateur de caisson). Envoyée par le réseau, l'impression prend d'elle-même le modèle de l'imprimante choisie ; ce réglage ne sert qu'au fichier qu'on met sur la carte SD.",
  },
  {
    cle: "ventilateur_auxiliaire", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur auxiliaire",
    unite: "%", niveau: "avance", defaut: 70, min: 0, max: 100, entier: true, orca: "additional_cooling_fan_speed",
    aide: "Le gros ventilateur latéral du P1S (absent du P1P). Il souffle sur toute la pièce dès que le ventilateur de pièce tourne.",
  },
  {
    cle: "vitesse_min_refroidissement", onglet: "matiere", groupe: "Refroidissement", etiquette: "Vitesse minimale",
    unite: "mm/s", niveau: "avance", defaut: 20, min: 1, max: 100, orca: "slow_down_min_speed",
    aide: "Pour atteindre le temps de couche minimal, l'imprimante ralentit, mais jamais au-dessous de cette vitesse.",
  },
  {
    cle: "densite_filament", onglet: "matiere", groupe: "Matière", etiquette: "Densité",
    unite: "g/cm³", niveau: "avance", defaut: 1.24, min: 0.5, max: 3, orca: "filament_density",
    aide: "Sert à estimer la masse de filament.",
  },
  {
    cle: "diametre_filament", onglet: "matiere", groupe: "Matière", etiquette: "Diamètre",
    unite: "mm", niveau: "avance", defaut: 1.75, min: 1, max: 3, orca: "filament_diameter",
    aide: "Sert à convertir le volume déposé en longueur de filament.",
  },
];

// ── Familles et rôles ───────────────────────────────────────────────────────

// ── D'où vient chaque réglage ───────────────────────────────────────────────
// Un réglage appartient au préréglage qui le décide vraiment. La règle est
// simple : si deux combinaisons qui partagent ce préréglage doivent y trouver
// la même valeur, c'est là qu'il va. C'est ce qui permet de calibrer le même
// matériau sur deux plaques différentes et de comparer : ce qui sort de la
// matière doit tomber pareil, ce qui sort de la plaque a le droit de différer.

// La machine et rien d'autre : ses limites de mouvement, sa mécanique, sa sortie.
const DE_L_IMPRIMANTE = new Set([
  "modele_machine", "deplacement_sans_retraction", "levee_buse", "longueur_essuyage",
  "arcs", "tolerance_arcs", "ventilateur_auxiliaire", "vitesse_deplacement",
  "acceleration_defaut", "acceleration_paroi_exterieure", "acceleration_dessus",
  "acceleration_premiere_couche", "acceleration_deplacement",
]);

// La buse : son diamètre, et les largeurs de ligne qui en découlent.
const DE_LA_BUSE = new Set([
  "diametre_buse", "largeur_ligne", "largeur_premiere_couche", "largeur_paroi_exterieure",
  "largeur_parois_interieures", "largeur_dessus", "largeur_remplissage",
  "largeur_plein_interieur", "largeur_pont",
]);

// La plaque : tout ce qui se joue au contact du plateau, et rien d'autre.
const DE_LA_PLAQUE = new Set([
  "type_plaque", "decalage_z_plaque", "compensation_premiere_couche", "vitesse_premiere_couche",
  "largeur_bordure", "ecart_bordure", "tours_jupe", "distance_jupe",
]);

// La bobine : ce qui dépend de la matière, et se retrouve identique d'une plaque à l'autre.
const DU_MATERIAU = new Set([
  "diametre_filament", "densite_filament", "rapport_debit", "pression_avance", "debit_maximal",
  "temperature_buse", "temperature_buse_premiere", "temperature_plateau", "temperature_plateau_premiere",
  "longueur_retraction", "vitesse_retraction",
  "ventilateur_min", "ventilateur_max", "ventilateur_paroi_exterieure", "ventilateur_dessus",
  "ventilateur_surplomb", "temps_couche_ventilateur", "couches_sans_ventilateur",
  "temps_couche_min", "vitesse_min_refroidissement",
]);

/* Le préréglage d'où vient un réglage. Tout le reste est une intention d'impression. */
function sourceDUnReglage(r) {
  if (r.source !== undefined) return r.source;
  if (DE_L_IMPRIMANTE.has(r.cle)) return "imprimante";
  if (DE_LA_BUSE.has(r.cle)) return "buse";
  if (DE_LA_PLAQUE.has(r.cle)) return "plaque";
  if (DU_MATERIAU.has(r.cle)) return "materiau";
  return "reglages";
}

// Ce qu'un essai de calibration détermine, et quel essai le détermine
// (les identifiants sont ceux de noyau/calibration.js).
const DETERMINES_PAR = Object.freeze({
  diametre_filament: "diametre",
  temperature_buse: "temperature",
  temperature_buse_premiere: "temperature",
  rapport_debit: "debit",
  pression_avance: "pression",
  debit_maximal: "debit_max",
  longueur_retraction: "retraction",
  vitesse_retraction: "retraction",
  decalage_z_plaque: "premiere_couche",
  vitesse_premiere_couche: "premiere_couche",
  compensation_premiere_couche: "cotes",
  compensation_trous: "cotes",
  compensation_contours: "cotes",
  strategie_surplomb: "surplombs",
  vitesse_surplomb_leger: "surplombs",
  vitesse_surplomb_moyen: "surplombs",
  vitesse_surplomb_fort: "surplombs",
  vitesse_pont: "surplombs",
  ventilateur_surplomb: "surplombs",
  vitesse_paroi_exterieure: "vitesse",
  vitesse_parois_interieures: "vitesse",
});

// Ce qui ne change rien à ce que les essais mesurent : on peut y toucher à tout
// moment sans rien invalider.
const INDEPENDANTS = new Set(["tours_jupe", "distance_jupe", "largeur_bordure", "ecart_bordure"]);

export const REGLAGES = Object.freeze(CATALOGUE.map((r) => Object.freeze({
  ...r,
  source: sourceDUnReglage(r),
  role: DETERMINES_PAR[r.cle] !== undefined ? "a_determiner" : (INDEPENDANTS.has(r.cle) ? "independant" : "fixe"),
  determinePar: DETERMINES_PAR[r.cle] ?? null,
})));

export const ROLES = Object.freeze([
  { id: "fixe", etiquette: "Choisi", aide: "Une intention, pas une inconnue : c'est la combinaison qui le fixe." },
  { id: "a_determiner", etiquette: "À déterminer", aide: "Un essai de calibration lui donne sa valeur." },
  { id: "independant", etiquette: "Libre", aide: "Sans effet sur ce que les essais mesurent." },
]);

/* Les cinq préréglages, dans l'ordre où on les choisit. */
export const SOURCES = Object.freeze([
  { id: "imprimante", etiquette: "Imprimante", aide: "La machine : limites de mouvement, levée de buse, essuyage, sortie du G-code." },
  { id: "buse", etiquette: "Buse", aide: "Le diamètre de la buse et les largeurs de ligne qu'elle pose. Il commande les trois préréglages suivants." },
  { id: "plaque", etiquette: "Plaque", aide: "Ce qui touche le plateau : décalage Z, écrasement de la première couche, patte d'éléphant, bordure." },
  { id: "materiau", etiquette: "Matériau", aide: "La bobine : températures, débit, avance de pression, rétraction, refroidissement." },
  { id: "reglages", etiquette: "Réglages d'impression", aide: "L'intention : couches, parois, remplissage, vitesses, surplombs." },
]);

// Les trois préréglages qu'un diamètre de buse commande.
const SOUS_LA_BUSE = Object.freeze(["plaque", "materiau", "reglages"]);
export const dependDeLaBuse = (source) => SOUS_LA_BUSE.includes(source);

const PAR_CLE = new Map(REGLAGES.map((r) => [r.cle, r]));
export const reglageDe = (cle) => PAR_CLE.get(cle) ?? null;
const sourceDe = (r) => r.source ?? "reglages";
/* Les réglages qu'un essai de calibration détermine. */
export const reglagesDetermines = (idOutil) => REGLAGES.filter((r) => r.determinePar === idOutil).map((r) => r.cle);

/*
 * Les préréglages fournis. Ils ne cherchent pas à être optimaux : ils cherchent
 * à être un point de départ d'où la calibration CONVERGE, quel que soit le but
 * visé ensuite (vitesse, étanchéité, résistance, aspect). D'où le parti pris :
 *   - jamais une valeur qui cache un défaut qu'un essai doit révéler
 *     (pas de repassage, pas de couture en biseau, débit à 100 %) ;
 *   - des vitesses d'impression en retrait : c'est l'essai de vitesse qui les
 *     remonte, pas l'inverse — les ACCÉLÉRATIONS, elles, sont celles de la
 *     machine, parce qu'aucun essai ne les mesure ;
 *   - le refroidissement et les températures au milieu de la plage de la matière,
 *     pour que la tour de température trouve son optimum dans ses bandes.
 * Un préréglage personnel, lui, naît d'une combinaison calibrée (noyau/combinaisons.js).
 */

// ── Imprimante ──
// Une seule machine : la P1P et la P1S tranchent à l'identique. Ce qui les
// sépare (ventilateur de carte, ventilateur de caisson) tient dans l'en-tête du
// fichier, et se décide à l'envoi. Un préréglage commun évite donc de calibrer
// deux fois exactement la même chose.
export const PREREGLAGES_IMPRIMANTE = Object.freeze([
  {
    id: "p1", nom: "P1P/P1S", machine: "p1s",
    valeurs: {
      modele_machine: "p1s",
      // Les limites des P1 d'après leur profil machine Bambu Lab : aucun essai
      // ne les mesure, elles n'ont donc pas à être prises avec de la marge.
      acceleration_defaut: 10000, acceleration_paroi_exterieure: 5000, acceleration_dessus: 2000,
      acceleration_premiere_couche: 500, acceleration_deplacement: 10000,
      vitesse_deplacement: 500,
      deplacement_sans_retraction: 1, levee_buse: 0.4, longueur_essuyage: 2,
      // La P1S de l'atelier tourne sans ses caches latéraux : elle se comporte
      // comme une P1P. Le préréglage ne s'appuie donc sur aucun ventilateur que
      // l'une des deux machines n'aurait pas.
      ventilateur_auxiliaire: 0,
      arcs: "oui", tolerance_arcs: 0.05,
    },
  },
]);
export const IMPRIMANTE_PAR_DEFAUT = "p1";

// ── Buse ──
// Un diamètre de buse ouvre sa famille de préréglages : tout ce qui est calibré
// l'est pour une buse, et ne vaut pas pour une autre. Les largeurs partent des
// proportions usuelles : paroi extérieure à 105 % de la buse, lignes cachées à
// 112 %, première couche à 125 %, pont au diamètre exact.
const largeursDeBuse = (d) => ({
  diametre_buse: d,
  largeur_ligne: Math.round(d * 105) / 100,
  largeur_premiere_couche: Math.round(d * 125) / 100,
  largeur_paroi_exterieure: Math.round(d * 105) / 100,
  largeur_parois_interieures: Math.round(d * 112) / 100,
  largeur_dessus: Math.round(d * 105) / 100,
  largeur_remplissage: Math.round(d * 112) / 100,
  largeur_plein_interieur: Math.round(d * 105) / 100,
  largeur_pont: d,
});

export const PREREGLAGES_BUSE = Object.freeze([
  { id: "buse_0_4", nom: "0.4", valeurs: largeursDeBuse(0.4) },
  { id: "buse_0_6", nom: "0.6", valeurs: largeursDeBuse(0.6) },
]);
export const BUSE_PAR_DEFAUT = "buse_0_4";

// ── Plaque ──
// Une plaque, c'est une épaisseur et un état de surface : d'où un décalage Z et
// une patte d'éléphant qui lui sont propres. Les deux partent de zéro, l'essai
// d'écrasement de la première couche les mesure. La température du plateau, elle,
// appartient au matériau : c'est la matière qui dit à combien elle colle.
export const PREREGLAGES_PLAQUE = Object.freeze([
  {
    id: "bq_smooth", nom: "BQ Smooth", buse: "buse_0_4",
    valeurs: {
      type_plaque: "lisse", decalage_z_plaque: 0,
      compensation_premiere_couche: 0, vitesse_premiere_couche: 50,
      largeur_bordure: 0, ecart_bordure: 0.1, tours_jupe: 1, distance_jupe: 2,
    },
  },
  {
    id: "bq_textured", nom: "BQ Textured", buse: "buse_0_4",
    valeurs: {
      type_plaque: "texturee", decalage_z_plaque: 0,
      compensation_premiere_couche: 0, vitesse_premiere_couche: 50,
      largeur_bordure: 0, ecart_bordure: 0.1, tours_jupe: 1, distance_jupe: 2,
    },
  },
  {
    // La plaque d'origine Bambu Lab : elle n'est pas calibrée ici, elle part
    // donc des valeurs du constructeur plutôt que de zéro.
    id: "bambu_haute_temp", nom: "Bambu High Temp", buse: "buse_0_4",
    valeurs: {
      type_plaque: "lisse", decalage_z_plaque: 0,
      compensation_premiere_couche: 0.15, vitesse_premiere_couche: 50,
      largeur_bordure: 0, ecart_bordure: 0.1, tours_jupe: 1, distance_jupe: 2,
    },
  },
]);
export const PLAQUE_PAR_DEFAUT = "bq_textured";

// ── Matériau ──
export const PREREGLAGES_MATERIAU = Object.freeze([
  {
    id: "pla_polyterra", nom: "PLA Polyterra", matiere: "PLA", buse: "buse_0_4",
    valeurs: {
      // La densité est celle du PLA courant : elle ne sert qu'à annoncer un poids.
      diametre_filament: 1.75, densite_filament: 1.24,
      // Milieu de la plage annoncée pour le PolyTerra (190 à 230) : la tour de
      // température l'encadre des deux côtés.
      temperature_buse: 210, temperature_buse_premiere: 215,
      temperature_plateau: 55, temperature_plateau_premiere: 55,
      // 100 % : le rapport de débit est une inconnue de la calibration, pas un
      // réglage de départ. Le fausser ici fausserait tous les essais suivants.
      rapport_debit: 1, pression_avance: 0.02,
      // Prudent : l'essai de débit maximal le remonte, il ne doit jamais brider
      // au point de masquer un défaut de vitesse.
      debit_maximal: 12,
      // Extrudeur direct, tube court : une rétraction courte suffit au PLA.
      longueur_retraction: 0.8, vitesse_retraction: 30,
      ventilateur_min: 60, ventilateur_max: 100, ventilateur_paroi_exterieure: 100,
      ventilateur_dessus: 100, ventilateur_surplomb: 100,
      temps_couche_ventilateur: 60, couches_sans_ventilateur: 1,
      temps_couche_min: 6, vitesse_min_refroidissement: 20,
    },
  },
  {
    id: "petg_sunlu", nom: "PETG Sunlu", matiere: "PETG", buse: "buse_0_4",
    valeurs: {
      diametre_filament: 1.75, densite_filament: 1.27,
      temperature_buse: 240, temperature_buse_premiere: 245,
      temperature_plateau: 70, temperature_plateau_premiere: 70,
      rapport_debit: 1, pression_avance: 0.04,
      debit_maximal: 10,
      // Le PETG file davantage : une rétraction plus longue, pas plus rapide,
      // sous peine de broyer le filament.
      longueur_retraction: 1.2, vitesse_retraction: 30,
      // Il file dès qu'il est trop ventilé et colle mal s'il l'est trop tôt.
      ventilateur_min: 30, ventilateur_max: 60, ventilateur_paroi_exterieure: 50,
      ventilateur_dessus: 50, ventilateur_surplomb: 80,
      temps_couche_ventilateur: 30, couches_sans_ventilateur: 3,
      temps_couche_min: 12, vitesse_min_refroidissement: 20,
    },
  },
]);
export const MATERIAU_PAR_DEFAUT = "pla_polyterra";

// ── Réglages d'impression ──
export const PREREGLAGES_REGLAGES = Object.freeze([
  {
    id: "qualite_0_2", nom: "Qualité 0.2", buse: "buse_0_4",
    valeurs: {
      hauteur_couche: 0.2, hauteur_premiere_couche: 0.2,
      nombre_parois: 2, couches_dessus: 5, couches_dessous: 4,
      densite_remplissage: 15, motif_remplissage: "gyroide",
      // Des vitesses en retrait : l'essai de vitesse les remonte jusqu'au point
      // où la mécanique marque la pièce, ce qu'un départ rapide empêcherait de voir.
      vitesse_paroi_exterieure: 100, vitesse_parois_interieures: 150,
      vitesse_remplissage: 180, vitesse_plein_interieur: 150, vitesse_dessus: 100,
      vitesse_pont: 30, vitesse_pont_interieur: 80, vitesse_interstices: 150,
      vitesse_surplomb_leger: 50, vitesse_surplomb_moyen: 30, vitesse_surplomb_fort: 10,
      couches_transition: 2,
      // Rien qui embellisse avant d'avoir mesuré : le repassage et la couture en
      // biseau masquent un débit faux, les compensations partent de zéro.
      repassage: "non", couture_biseau: "non",
      compensation_trous: 0, compensation_contours: 0,
      position_couture: "alignee", ordre_parois: "interieures_puis_exterieure",
      parois_variables: "oui", remplir_interstices: "partout",
      strategie_surplomb: "paliers", debit_surplomb: 100,
    },
  },
]);
export const REGLAGES_PAR_DEFAUT = "qualite_0_2";

const LISTES = Object.freeze({
  imprimante: PREREGLAGES_IMPRIMANTE,
  buse: PREREGLAGES_BUSE,
  plaque: PREREGLAGES_PLAQUE,
  materiau: PREREGLAGES_MATERIAU,
  reglages: PREREGLAGES_REGLAGES,
});
const DEFAUTS = Object.freeze({
  imprimante: IMPRIMANTE_PAR_DEFAUT,
  buse: BUSE_PAR_DEFAUT,
  plaque: PLAQUE_PAR_DEFAUT,
  materiau: MATERIAU_PAR_DEFAUT,
  reglages: REGLAGES_PAR_DEFAUT,
});

// Les préréglages personnels, exportés depuis une combinaison calibrée. Ils
// s'ajoutent aux préréglages fournis, sans jamais les remplacer.
let personnels = Object.fromEntries(SOURCES.map(({ id }) => [id, []]));

/* Remplace la liste des préréglages personnels (appelé au démarrage, puis à chaque export). */
export function definirLesPrereglagesPersonnels(parSource) {
  personnels = Object.fromEntries(SOURCES.map(({ id }) => [id, parSource[id] ?? []]));
}

export const prereglagesPersonnels = (source) => personnels[source] ?? [];

/*
 * Les préréglages d'une source. Passer une buse ne garde que ceux qui ont été
 * faits pour elle : c'est ce qui fait qu'un diamètre de buse « débloque » sa
 * propre famille de plaques, de matériaux et de réglages d'impression.
 */
export function listeDesPrereglages(source, buse = null) {
  const tous = [...(LISTES[source] ?? []), ...(personnels[source] ?? [])];
  if (buse === null || !dependDeLaBuse(source)) return tous;
  return tous.filter((p) => p.buse === buse);
}

const parDefautDe = (source) => DEFAUTS[source] ?? REGLAGES_PAR_DEFAUT;

export function prereglage(source, id) {
  const liste = listeDesPrereglages(source);
  return liste.find((p) => p.id === id)
    ?? liste.find((p) => p.id === parDefautDe(source))
    ?? liste[0]
    ?? { id, nom: id, valeurs: {} };
}

/*
 * Le préréglage proposé d'office pour cette buse, quand celui qui était choisi
 * n'existe plus. null : cette buse n'a encore aucun préréglage de cette sorte —
 * c'est le cas normal d'un diamètre qu'on n'a pas encore rempli.
 */
export function prereglageParDefaut(source, buse) {
  const liste = listeDesPrereglages(source, buse);
  return liste.find((p) => p.id === parDefautDe(source))?.id ?? liste[0]?.id ?? null;
}

/* Les sources qui n'ont aucun préréglage pour la buse choisie : le panneau le dit. */
export function prereglagesManquants(choix) {
  return SOUS_LA_BUSE.filter((source) => listeDesPrereglages(source, choix.buse).length === 0);
}

/*
 * Les cinq identifiants d'un plateau ramenés à quelque chose de cohérent : un
 * préréglage inconnu, ou fait pour une autre buse, retombe sur celui par défaut.
 */
export function choixCoherents(choix) {
  const buse = listeDesPrereglages("buse").some((p) => p.id === choix.buse) ? choix.buse : BUSE_PAR_DEFAUT;
  const propre = {
    imprimante: listeDesPrereglages("imprimante").some((p) => p.id === choix.imprimante)
      ? choix.imprimante : IMPRIMANTE_PAR_DEFAUT,
    buse,
  };
  for (const source of SOUS_LA_BUSE) {
    propre[source] = listeDesPrereglages(source, buse).some((p) => p.id === choix[source])
      ? choix[source] : prereglageParDefaut(source, buse);
  }
  return propre;
}

/* La valeur que les préréglages donnent à un réglage, sans les écarts.
   choix : { imprimante, buse, plaque, materiau, reglages } — les préréglages retenus. */
export function valeurDuPrereglage(choix, cle) {
  const r = reglageDe(cle);
  const source = sourceDe(r);
  const valeurs = prereglage(source, choix[source]).valeurs;
  return cle in valeurs ? valeurs[cle] : r.defaut;
}

/* Toutes les valeurs effectives d'un plateau : { cle: valeur }. */
export function valeursEffectives(impression) {
  const ecarts = impression.ecarts ?? {};
  const resultat = {};
  for (const r of REGLAGES) resultat[r.cle] = r.cle in ecarts ? ecarts[r.cle] : valeurDuPrereglage(impression, r.cle);
  return resultat;
}

/* La valeur effective d'un seul réglage, sans tout recalculer. */
export function valeurEffective(impression, cle) {
  const ecarts = impression.ecarts ?? {};
  return cle in ecarts ? ecarts[cle] : valeurDuPrereglage(impression, cle);
}

/* Une valeur reçue d'un fichier ou d'un champ, ramenée à ce que le réglage accepte ; null si elle n'a pas de sens. */
export function valeurValide(cle, valeur) {
  const r = reglageDe(cle);
  if (r === null) return null;
  if (r.choix) return r.choix.some((c) => c.valeur === valeur) ? valeur : null;
  if (!Number.isFinite(valeur)) return null;
  let v = Math.min(r.max ?? Infinity, Math.max(r.min ?? -Infinity, valeur));
  if (r.entier) v = Math.round(v);
  return v;
}

/* Les écarts qui diffèrent vraiment des préréglages : un écart égal à la valeur du préréglage disparaît. */
export function ecartsNettoyes(choix, ecarts) {
  const propres = {};
  for (const [cle, valeur] of Object.entries(ecarts ?? {})) {
    const v = valeurValide(cle, valeur);
    if (v !== null && v !== valeurDuPrereglage(choix, cle)) propres[cle] = v;
  }
  return propres;
}

/* Les écarts qui portent sur les réglages d'une source (pour « garder ou abandonner » en changeant de préréglage). */
export function ecartsDeLaSource(ecarts, source) {
  return Object.fromEntries(Object.entries(ecarts).filter(([cle]) => sourceDe(reglageDe(cle) ?? {}) === source));
}
