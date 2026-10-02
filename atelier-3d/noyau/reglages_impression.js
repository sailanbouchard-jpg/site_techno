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
 *   plaque      ce qui touche le plateau : le décalage Z propre à CETTE plaque,
 *               la vitesse et l'écrasement de la première couche, la patte
 *               d'éléphant, la bordure et la jupe
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
 *   orca : le nom du réglage dans OrcaSlicer, pour retrouver la référence,
 *          ou null quand le réglage n'a pas d'équivalent chez eux (l'aide dit
 *          alors d'où il vient). Les noms sont ceux de leur PrintConfig.cpp.
 * Ajouter un réglage = une ligne ici ; le panneau le montre sans autre code.
 *
 * Chaque réglage reçoit aussi un RÔLE, qui dit comment on arrive à sa valeur :
 *   "fixe"          on le choisit, il n'y a rien à mesurer : c'est une intention
 *                   (hauteur de couche, nombre de parois, densité de remplissage) ;
 *   "a_determiner"  un essai de calibration le trouve ; determinePar dit lequel ;
 *   "independant"   il ne change rien à ce que les essais mesurent.
 * Dans l'espace de calibration, les deux premiers ne s'éditent pas à la main :
 * les « fixes » viennent des préréglages choisis, les autres de leur essai.
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
    cle: "ancrage_pont", onglet: "qualite", groupe: "Ponts", etiquette: "Ancrage",
    unite: "mm", niveau: "avance", defaut: 3, min: 0, max: 10, valeursUsuelles: [0, 2, 3, 5],
    orca: null,
    aide: "De combien un pont mord sur la matière qui le porte, à chaque bout de ses brins. Sans ancrage, les brins s’arrêtent au bord du vide, ne sont retenus par rien, et le pont tombe. L’ancrage est posé dans le SENS des brins seulement : il ne recouvre pas les côtés, qui ne portent rien. OrcaSlicer n'expose pas ce réglage : il calcule l'ancrage en interne.",
  },
  {
    cle: "portee_minimale_pont", onglet: "qualite", groupe: "Ponts", etiquette: "Portée minimale",
    unite: "mm", niveau: "avance", defaut: 2, min: 0.5, max: 10, valeursUsuelles: [1, 1.5, 2, 3],
    orca: null,
    aide: "En deçà, ce n’est pas une portée mais le liseré que laisse une paroi inclinée d’une couche à l’autre : il est rempli comme une surface du dessous ordinaire. Sans ce seuil, chaque flanc en pente se couvrirait de brins de pont ancrés de part et d’autre. Pas d'équivalent chez OrcaSlicer, qui tranche la question autrement (« ponts épais »).",
  },
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
    cle: "jeu_couture", onglet: "qualite", groupe: "Couture", etiquette: "Jeu de fermeture",
    unite: "mm", niveau: "avance", defaut: 0, min: 0, max: 1, valeursUsuelles: [0, 0.05, 0.1, 0.15, 0.2],
    orca: "seam_gap",
    aide: "Le tour de paroi s’arrête un peu avant son point de départ : la matière qui reste sous pression dans la buse comble le reste. Sans ce jeu, la fin du tour s’ajoute au début et la couture fait un bourrelet. Inutile si la couture en biseau est activée.",
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
    cle: "une_paroi_sur_dessus", onglet: "qualite", groupe: "Parois", etiquette: "Une seule paroi sur les dessus",
    niveau: "avance", defaut: "non",
    choix: [
      { valeur: "non", etiquette: "Non" },
      { valeur: "oui", etiquette: "Oui" },
    ],
    orca: "only_one_wall_top",
    aide: "Sur une surface du dessus, les parois intérieures laissent des boucles visibles au milieu de la face. Elles sont alors supprimées là et seulement là : le motif du dessus couvre toute la surface d’un seul tenant. Plus bel aspect, légèrement moins de matière sous la peau.",
  },
  {
    cle: "compensation_premiere_couche", onglet: "qualite", groupe: "Précision", etiquette: "Patte d'éléphant",
    unite: "mm", niveau: "avance", defaut: 0.15, min: 0, max: 1, valeursUsuelles: [0, 0.1, 0.15, 0.2, 0.3],
    orca: "elefant_foot_compensation",
    aide: "La première couche s'écrase et déborde : son contour est rentré d'autant. Une pièce dont le pied est plus large que le reste demande plus.",
  },
  {
    cle: "compensation_trous", onglet: "qualite", groupe: "Précision", etiquette: "Compensation des trous",
    unite: "mm", niveau: "avance", defaut: 0, min: -0.5, max: 0.5, valeursUsuelles: [0, 0.05, 0.1, 0.15, 0.2],
    orca: "xy_hole_compensation",
    aide: "Un trou sort toujours trop petit : la matière se contracte vers l'intérieur de la courbe. Cette valeur agrandit chaque trou de son diamètre. À mesurer sur une pièce d'essai.",
  },
  {
    cle: "compensation_contours", onglet: "qualite", groupe: "Précision", etiquette: "Compensation des contours",
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
      { valeur: "exterieure_en_sandwich", etiquette: "Extérieure en sandwich" },
    ],
    orca: "wall_sequence",
    aide: "Extérieure d'abord : cotes plus justes. Intérieures d'abord : meilleurs surplombs et plus bel aspect. En sandwich : une paroi intérieure, puis l'extérieure, puis les autres intérieures — l'extérieure a un appui derrière elle sans perdre sa précision. Demande au moins trois parois ; sinon l'ordre intérieures-puis-extérieure s'applique.",
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
    cle: "elargissement_coques", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Élargissement des coques",
    unite: "mm", niveau: "avance", defaut: 0.4, min: 0, max: 3, valeursUsuelles: [0, 0.4, 0.8, 1.2],
    orca: "ensure_vertical_shell_thickness",
    aide: "Les couches pleines du dessus et du dessous sont comptées à la VERTICALE. Sur un flanc incliné, la coque mesurée perpendiculairement est donc bien plus mince, et le remplissage se devine au travers. Cette valeur élargit latéralement ces couches pleines. 0 : aucun élargissement.",
  },
  {
    cle: "chevauchement_pleins", onglet: "resistance", groupe: "Dessus et dessous", etiquette: "Chevauchement avec les parois",
    unite: "%", niveau: "avance", defaut: 25, min: 0, max: 50, entier: true, valeursUsuelles: [0, 15, 25, 35],
    orca: "top_bottom_infill_wall_overlap",
    aide: "De combien les couches PLEINES mordent sur la dernière paroi, en part de leur largeur. Un dessus qui ne mord pas assez laisse un sillon le long de la paroi ; trop, et il gonfle.",
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
  {
    cle: "couches_densification", onglet: "resistance", groupe: "Remplissage", etiquette: "Couches densifiées sous les surfaces",
    niveau: "avance", defaut: 2, min: 0, max: 10, entier: true, valeursUsuelles: [0, 2, 3, 5],
    orca: null,
    aide: "Juste sous les couches pleines d'une surface du dessus, le remplissage double de densité sur ce nombre de couches : les couches pleines ont alors assez d'appuis pour ne pas s'affaisser entre deux lignes. 0 désactive. Coûte un peu de matière et de temps, seulement là où c'est utile. C'est le « Gradual infill steps » de Cura ; OrcaSlicer n'a pas ce mécanisme (son infill_combination fait tout autre chose : il ÉPAISSIT le remplissage pour aller plus vite).",
  },
  // ── Vitesse (P1P/P1S) ──
  vitesse("vitesse_premiere_couche", "Première couche", 50, "simple", "initial_layer_speed", "Lente : la première couche doit bien s'écraser sur le plateau."),
  vitesse("vitesse_paroi_exterieure", "Paroi extérieure", 200, "simple", "outer_wall_speed", "Plus lente que le reste : c'est la surface qu'on voit."),
  vitesse("vitesse_parois_interieures", "Parois intérieures", 300, "simple", "inner_wall_speed", "Cachées : elles peuvent aller plus vite."),
  vitesse("vitesse_remplissage", "Remplissage", 270, "simple", "sparse_infill_speed", "Souvent plafonnée par le débit maximal du filament."),
  vitesse("vitesse_plein_interieur", "Plein intérieur", 250, "avance", "internal_solid_infill_speed", "Couches pleines cachées."),
  vitesse("vitesse_dessus", "Surface du dessus", 200, "simple", "top_surface_speed", "Plus lente : dessus plus lisse."),
  vitesse("vitesse_petits_contours", "Petits contours", 50, "avance", "small_perimeter_speed", "Un petit trou parcouru vite n'atteint jamais sa vitesse : l'accélération et l'avance de pression le déforment, et il sort ovale et trop petit. Les boucles plus courtes que le seuil passent à cette vitesse."),
  {
    cle: "seuil_petits_contours", onglet: "vitesse", groupe: "Vitesses", etiquette: "Seuil des petits contours",
    unite: "mm", niveau: "avance", defaut: 20, min: 0, max: 200, valeursUsuelles: [0, 10, 20, 30, 50],
    orca: "small_perimeter_threshold",
    aide: "Périmètre en dessous duquel une boucle de paroi est tenue pour un petit contour. 20 mm, c'est un trou d'environ 6 mm de diamètre. 0 désactive.",
  },
  {
    cle: "strategie_surplomb", onglet: "vitesse", groupe: "Surplombs", etiquette: "Vitesse des surplombs",
    niveau: "simple", defaut: "paliers",
    choix: [
      { valeur: "paliers", etiquette: "Paliers" },
      { valeur: "lissee", etiquette: "Progressive" },
      { valeur: "unique", etiquette: "Vitesse unique" },
    ],
    orca: "enable_overhang_speed",
    aide: "Comment la vitesse baisse quand une paroi dépasse dans le vide. Paliers : trois crans (un quart, la moitié, trois quarts de la ligne dans le vide), comme dans OrcaSlicer — chaque changement de cran laisse un léger bourrelet. Progressive : la vitesse suit la part réellement dans le vide, sans marche ; c’est le mode le plus propre une fois l’avance de pression calibrée. Vitesse unique : tout débord passe à la vitesse du surplomb moyen, simple à régler.",
  },
  {
    cle: "tendre_les_debords", onglet: "vitesse", groupe: "Surplombs", etiquette: "Tendre les débords ancrés",
    niveau: "simple", defaut: "non",
    choix: [
      { valeur: "non", etiquette: "Non" },
      { valeur: "oui", etiquette: "Oui" },
    ],
    orca: "detect_overhang_wall",
    aide: "Un morceau de paroi qui dépasse dans le vide mais dont les DEUX bouts reposent sur la couche d’en dessous est tendu comme un pont : ligne fine, rapide, tirée d’un appui à l’autre, au lieu d’un cordon lent qui pend. Ne s’applique qu’aux débords plus courts que la portée tendue maximale.",
  },
  {
    cle: "longueur_debord_tendu", onglet: "vitesse", groupe: "Surplombs", etiquette: "Portée tendue maximale",
    unite: "mm", niveau: "avance", defaut: 12, min: 1, max: 60, valeursUsuelles: [6, 10, 12, 20, 30],
    orca: "max_bridge_length",
    aide: "Au-delà de cette longueur, un débord ancré aux deux bouts n’est plus tendu comme un pont : il repasse en vitesse de surplomb. Un brin de 40 mm tendu comme un pont de 2 mm tombe.",
  },
  {
    cle: "parois_surplomb_dabord", onglet: "vitesse", groupe: "Surplombs", etiquette: "Parois intérieures d’abord en surplomb",
    niveau: "simple", defaut: "non",
    choix: [
      { valeur: "non", etiquette: "Non" },
      { valeur: "oui", etiquette: "Oui" },
    ],
    orca: "overhang_reverse",
    aide: "Sur les SEULES couches qui ont un débord, les parois intérieures sont posées avant l’extérieure, pour qu’elle s’y appuie. Les autres couches gardent l’ordre des parois choisi, donc la précision de cote. Pour les pièces dont le bord se retrousse.",
  },
  {
    cle: "detection_enroulement", onglet: "vitesse", groupe: "Surplombs", etiquette: "Détecter l’enroulement",
    niveau: "simple", defaut: "oui",
    choix: [
      { valeur: "oui", etiquette: "Oui" },
      { valeur: "non", etiquette: "Non" },
    ],
    orca: "slowdown_for_curled_perimeters",
    aide: "Un flanc qui déborde d’un rien à chaque couche ne déclenche aucun palier, mais au bout de dix couches son bord s’est enroulé vers le haut et la buse tape dedans. Le trancheur cumule le débord d’une couche à l’autre : au-delà d’un seuil, ces lignes passent à la vitesse de surplomb fort, ventilateur à fond, et les déplacements ne passent plus au-dessus.",
  },
  vitesseDeSurplomb("vitesse_surplomb_leger", "Surplomb léger (25 %)", 50, "overhang_2_4_speed", "Un quart de la ligne dans le vide : le reste porte encore bien."),
  vitesseDeSurplomb("vitesse_surplomb_moyen", "Surplomb moyen (50 %)", 30, "overhang_3_4_speed", "La moitié de la ligne dans le vide. C'est aussi la vitesse de la stratégie « vitesse unique »."),
  vitesseDeSurplomb("vitesse_surplomb_fort", "Surplomb fort (75 %)", 10, "overhang_4_4_speed", "Presque toute la ligne dans le vide : très lent, la matière a le temps de figer."),
  {
    cle: "debit_surplomb", onglet: "vitesse", groupe: "Surplombs", etiquette: "Débit des surplombs",
    unite: "%", niveau: "avance", defaut: 100, min: 50, max: 120, entier: true, valeursUsuelles: [85, 90, 95, 100],
    orca: "overhang_flow_ratio",
    aide: "Matière poussée dans un surplomb entièrement dans le vide, en part du normal. Un peu moins : la ligne pend moins et se retrousse moins, au prix d’un dessous plus ouvert. La réduction suit la part de la ligne qui est dans le vide : une ligne posée au quart dans le vide ne perd qu’un quart de la réduction.",
  },
  {
    cle: "debit_pont", onglet: "vitesse", groupe: "Surplombs", etiquette: "Débit des ponts",
    unite: "%", niveau: "avance", defaut: 100, min: 50, max: 130, entier: true, valeursUsuelles: [85, 90, 95, 100, 110],
    orca: "bridge_flow",
    aide: "Matière poussée dans un pont, en part de ce qu’il faut pour un brin ROND du diamètre de la largeur des ponts. Un brin tendu dans le vide ne s’écrase sur rien : il reste rond, et demande donc nettement plus de matière qu’une ligne posée de même largeur. Trop peu : des brins maigres, qui pendent ou cassent. Trop : le pont gonfle et la couche suivante tape dedans.",
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
    cle: "arcs", onglet: "qualite", groupe: "Précision", etiquette: "Arcs dans le G-code",
    niveau: "avance", defaut: "oui",
    choix: [
      { valeur: "oui", etiquette: "Oui" },
      { valeur: "non", etiquette: "Non" },
    ],
    orca: "enable_arc_fitting",
    aide: "Les suites de petits segments qui suivent un cercle deviennent des arcs (G2/G3) : fichier bien plus petit, et courbes plus fluides, l'imprimante n'ayant plus à lire des milliers de lignes.",
  },
  {
    cle: "tolerance_arcs", onglet: "qualite", groupe: "Précision", etiquette: "Tolérance des arcs",
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
  {
    cle: "type_bordure", onglet: "adherence", groupe: "Bordure", etiquette: "Forme",
    niveau: "simple", defaut: "complete",
    choix: [
      { valeur: "complete", etiquette: "Complète" },
      { valeur: "oreilles", etiquette: "Oreilles" },
    ],
    orca: "brim_type",
    aide: "Complète : une collerette tout autour du pied. Oreilles : de petits disques posés dans les angles pointus seulement — c'est là que le décollement commence, et il y a dix fois moins de matière à retirer. Dans les deux cas, la largeur ci-dessus commande la taille, et 0 veut dire pas de bordure.",
  },
  {
    cle: "angle_des_oreilles", onglet: "adherence", groupe: "Bordure", etiquette: "Angle maximal des oreilles",
    unite: "°", niveau: "avance", defaut: 120, min: 30, max: 170, entier: true, valeursUsuelles: [90, 110, 120, 150],
    orca: "brim_ears_max_angle",
    aide: "Un angle du pied reçoit une oreille si sa pointe est plus fermée que cette valeur. 180° serait un bord droit ; 120° attrape les coins francs, 150° en attrape bien plus.",
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
    aide: "C'est la matière qui dit à quelle température elle colle, pas la plaque : la même bobine chauffe pareil sur l'une ou l'autre. Ce que la plaque change, c'est la hauteur de la buse (décalage Z, onglet Adhérence).",
  },
  {
    cle: "temperature_plateau", onglet: "matiere", groupe: "Températures", etiquette: "Plateau, autres couches",
    unite: "°C", niveau: "simple", defaut: 55, min: 0, max: 120, entier: true, orca: "textured_plate_temp",
    aide: "Après la première couche. Elle tient la pièce collée ; trop haute, elle ramollit le pied.",
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
    orca: null,
    aide: "Ventilation propre à la face visible, quand elle doit être plus refroidie que le reste. 0 : même ventilateur que la couche. OrcaSlicer n'a pas de ventilateur par type de ligne, sauf pour les surplombs.",
  },
  {
    cle: "ventilateur_dessus", onglet: "matiere", groupe: "Refroidissement", etiquette: "Ventilateur, surface du dessus",
    unite: "%", niveau: "avance", defaut: 0, min: 0, max: 100, entier: true, 
    orca: null,
    aide: "Une couche du dessus bien refroidie reste plane. 0 : même ventilateur que la couche. Comme pour la paroi extérieure, OrcaSlicer n'a pas l'équivalent.",
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
    cle: "vitesse_max_machine", onglet: "vitesse", groupe: "Limites de la machine", etiquette: "Vitesse maximale",
    unite: "mm/s", niveau: "avance", defaut: 500, min: 10, max: 2000, source: "imprimante",
    orca: "machine_max_speed_x",
    aide: "Ce que la mécanique ne dépassera jamais, quoi qu'on lui demande. Elle ne sert pas à imprimer : rien ici n'est bridé par elle. Elle sert aux essais de DYNAMIQUE — passage des coins, lissage d'entrée — qui doivent pousser la machine à sa limite, parce que le défaut qu'ils mesurent n'existe que là. Mesurer le lissage à 50 mm/s ne mesure rien.",
  },
  {
    cle: "acceleration_max_machine", onglet: "vitesse", groupe: "Limites de la machine", etiquette: "Accélération maximale",
    unite: "mm/s²", niveau: "avance", defaut: 20000, min: 100, max: 50000, source: "imprimante",
    orca: "machine_max_acceleration_extruding",
    aide: "L'accélération que le micrologiciel accepte au plus, en extrusion. Comme la vitesse maximale, elle ne sert qu'aux essais de dynamique : c'est la secousse qui fait apparaître l'écho qu'ils cherchent.",
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
// Le rangement est celui d'OrcaSlicer, relevé dans leurs trois onglets
// (src/slic3r/GUI/Tab.cpp : TabPrinter, TabFilament, TabPrint) :
//   Printer   → notre « Imprimante » et notre « Buse »
//   Filament  → notre « Matériau »
//   Process   → nos « Réglages d'impression »
// Un réglage est donc sous le profil où EUX le mettent, et non sous celui où
// l'objet physique se trouve : la vitesse de déplacement est une intention
// d'impression (Process → Speed → Travel speed), pas une propriété de la
// machine ; les largeurs de ligne sont dans Process → Quality → Line width,
// parce qu'un profil d'impression est déjà fait pour une buse donnée.
//
// Deux exceptions, assumées, parce qu'Orca a de quoi les exprimer et nous non :
//   — la rétraction (Printer chez eux) reste sous Matériau : ils ont des
//     surcharges par filament (filament_retraction_length), nous n'en avons
//     pas, et nos bobines ne rétractent pas pareil (PLA 0,8 / PETG 1,2) ;
//   — la patte d'éléphant (Process chez eux) reste sous Plaque : ils ont un
//     profil d'impression par plateau, nous un profil de plaque, et la valeur
//     diffère bel et bien d'une plaque à l'autre (0 / 0,15).
// La plaque, enfin, n'existe pas chez Orca : elle ne garde que ce qui se mesure
// sur la surface posée.

// La machine : sa mécanique et sa sortie. Chez Orca, l'onglet Printer.
const DE_L_IMPRIMANTE = new Set([
  "modele_machine", "deplacement_sans_retraction", "levee_buse", "longueur_essuyage",
  "vitesse_max_machine", "acceleration_max_machine",
]);

// La buse : son diamètre. Les largeurs de ligne qu'elle pose sont un réglage
// d'impression chez Orca, parce qu'on les choisit aussi pour aller vite ou pour
// soigner le détail — et qu'un profil d'impression vaut déjà pour une buse.
const DE_LA_BUSE = new Set(["diametre_buse"]);

// La plaque : ce qui se mesure sur la surface posée, et rien d'autre.
const DE_LA_PLAQUE = new Set(["decalage_z_plaque", "compensation_premiere_couche"]);

// La bobine : ce qui dépend de la matière. Chez Orca, l'onglet Filament.
const DU_MATERIAU = new Set([
  "diametre_filament", "densite_filament", "rapport_debit", "pression_avance", "debit_maximal",
  "temperature_buse", "temperature_buse_premiere", "temperature_plateau", "temperature_plateau_premiere",
  "longueur_retraction", "vitesse_retraction",
  "ventilateur_min", "ventilateur_max", "ventilateur_paroi_exterieure", "ventilateur_dessus",
  "ventilateur_surplomb", "ventilateur_auxiliaire", "temps_couche_ventilateur",
  "couches_sans_ventilateur", "temps_couche_min", "vitesse_min_refroidissement",
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

// Ce qu'un essai de calibration trouve, et lequel (les identifiants sont ceux
// de noyau/calibration.js). L'essai ne l'écrit pas lui-même : il imprime une
// éprouvette, l'utilisateur la lit et tape la valeur ici. La mention sert
// seulement à dire où aller la chercher.
const DETERMINES_PAR = Object.freeze({
  temperature_buse: "temperature",
  temperature_buse_premiere: "temperature",
  debit_maximal: "debit_max",
  pression_avance: "pression",
  rapport_debit: "debit",
  longueur_retraction: "retraction",
});

// Ce qui ne change rien à ce que les essais mesurent : on peut y toucher à tout
// moment sans rien invalider.
const INDEPENDANTS = new Set(["tours_jupe", "distance_jupe", "largeur_bordure", "ecart_bordure",
  "type_bordure", "angle_des_oreilles"]);

export const REGLAGES = Object.freeze(CATALOGUE.map((r) => Object.freeze({
  ...r,
  source: sourceDUnReglage(r),
  role: DETERMINES_PAR[r.cle] !== undefined ? "a_determiner" : (INDEPENDANTS.has(r.cle) ? "independant" : "fixe"),
  determinePar: DETERMINES_PAR[r.cle] ?? null,
})));

export const ROLES = Object.freeze([
  { id: "fixe", etiquette: "Choisi", aide: "Une intention, pas une inconnue : c'est le préréglage qui le fixe." },
  { id: "a_determiner", etiquette: "À déterminer", aide: "Un essai de calibration lui donne sa valeur." },
  { id: "independant", etiquette: "Libre", aide: "Sans effet sur ce que les essais mesurent." },
]);

/* Les cinq préréglages, dans l'ordre où on les choisit. */
export const SOURCES = Object.freeze([
  { id: "imprimante", etiquette: "Imprimante", aide: "La machine : levée de buse, essuyage, seuil de rétraction, sortie du G-code. L'onglet Printer d'OrcaSlicer." },
  { id: "buse", etiquette: "Buse", aide: "Le diamètre monté sur la machine. Il commande les trois profils suivants : une plaque, une bobine et des réglages sont calibrés pour un diamètre, et pas pour un autre." },
  { id: "plaque", etiquette: "Plaque", aide: "Ce qui se mesure sur la surface posée : décalage Z et patte d'éléphant. OrcaSlicer n'a pas de profil de plaque ; c'est le seul qui nous soit propre." },
  { id: "materiau", etiquette: "Matériau", aide: "La bobine : températures, débit, avance de pression, rétraction, refroidissement. L'onglet Filament d'OrcaSlicer." },
  { id: "reglages", etiquette: "Réglages d'impression", aide: "L'intention : couches, largeurs de ligne, parois, remplissage, vitesses, accélérations, surplombs, bordure. L'onglet Process d'OrcaSlicer, fait pour une buse donnée." },
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
 * Un préréglage personnel, lui, naît du bouton « Enregistrer » du panneau de
 * droite : les réglages en vigueur, gardés sous un nom, dans la base du site.
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
      deplacement_sans_retraction: 1, levee_buse: 0.4, longueur_essuyage: 2,
      // Les limites du micrologiciel des P1, relevées dans leur profil machine
      // Bambu Lab (machine_max_speed_x/y = 500, machine_max_acceleration_extruding
      // = 20000). Elles ne brident rien ici : seuls les essais de dynamique s'en
      // servent, pour pousser la machine là où leur défaut apparaît.
      vitesse_max_machine: 500, acceleration_max_machine: 20000,
    },
  },
]);
export const IMPRIMANTE_PAR_DEFAUT = "p1";

// ── Buse ──
// Un diamètre de buse ouvre sa famille de profils : tout ce qui est calibré
// l'est pour une buse, et ne vaut pas pour une autre.
/*
 * Les largeurs de ligne d'une buse, aux proportions usuelles : paroi extérieure
 * à 105 % du diamètre, lignes cachées à 112 %, première couche à 125 %, pont au
 * diamètre exact. Elles vont dans un PROFIL D'IMPRESSION, pas dans celui de la
 * buse : c'est là qu'Orca les met (Process → Quality → Line width), et un
 * profil d'impression est déjà fait pour une buse donnée. Monter une 0,6 veut
 * donc dire dupliquer son profil d'impression avec ces largeurs-là.
 */
export const largeursDeLigne = (d) => ({
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
  { id: "buse_0_4", nom: "0.4", valeurs: { diametre_buse: 0.4 } },
  { id: "buse_0_6", nom: "0.6", valeurs: { diametre_buse: 0.6 } },
]);
export const BUSE_PAR_DEFAUT = "buse_0_4";

// ── Plaque ──
// Une plaque, c'est une épaisseur et un état de surface : d'où un décalage Z et
// une patte d'éléphant qui lui sont propres. Les deux partent de zéro, l'essai
// d'écrasement de la première couche les mesure. La température du plateau, elle,
// appartient au matériau : c'est la matière qui dit à combien elle colle.
export const PREREGLAGES_PLAQUE = Object.freeze([
  {
    // Les deux plaques BQ collent trop : on en détruit des pièces en les
    // arrachant. Le décalage part donc en POSITIF — la buse un cran plus haut,
    // la première couche moins écrasée, donc moins ancrée dans la surface.
    // +0,02 mm est un cran de molette, pas un saut ; l'essai d'écrasement
    // balaie de −0,05 à +0,05 et tranche. Le levier principal reste la
    // température du plateau, dans le matériau.
    id: "bq_smooth", nom: "BQ Smooth", buse: "buse_0_4",
    valeurs: {
      decalage_z_plaque: 0.02, compensation_premiere_couche: 0,
    },
  },
  {
    id: "bq_textured", nom: "BQ Textured", buse: "buse_0_4",
    valeurs: {
      decalage_z_plaque: 0.02, compensation_premiere_couche: 0,
    },
  },
  {
    // La plaque d'origine Bambu Lab : elle n'est pas calibrée ici, elle part
    // donc des valeurs du constructeur plutôt que de zéro.
    id: "bambu_haute_temp", nom: "Bambu High Temp", buse: "buse_0_4",
    valeurs: {
      decalage_z_plaque: 0, compensation_premiere_couche: 0.15,
    },
  },
]);
export const PLAQUE_PAR_DEFAUT = "bq_textured";

// ── Matériau ──
export const PREREGLAGES_MATERIAU = Object.freeze([
  {
    /*
     * Le PolyTerra est le PLA mat de Polymaker, rebaptisé « Panchroma PLA Matte »
     * depuis. Il a donc un profil officiel dans la bibliothèque de filaments
     * d'OrcaSlicer (Polymaker/Panchroma PLA Matte), d'où viennent la densité, la
     * plage de températures et la température de transition vitreuse.
     */
    id: "pla_polyterra", nom: "PLA Polyterra", matiere: "PLA", buse: "buse_0_4",
    valeurs: {
      // 1,31 et non 1,24 : un PLA MAT est chargé, il est plus dense que le PLA nu
      // (profil Orca « Panchroma PLA Matte »). Ne sert qu'à annoncer un poids.
      diametre_filament: 1.75, densite_filament: 1.31,
      // La P1S de l'atelier tourne sans ses caches latéraux : elle se comporte
      // comme une P1P, et aucun préréglage ne s'appuie sur son ventilateur auxiliaire.
      ventilateur_auxiliaire: 0,
      // 215 °C PARTOUT, et c'est un choix : au-dessus l'aspect se dégrade, et la
      // première couche n'a surtout pas à être plus chaude que les autres — ce
      // bonus de 5 °C n'avait d'autre effet que de mieux la coller au plateau.
      // Côté résistance on ne perd presque rien : l'adhésion entre couches du PLA
      // vaut 39 MPa à 210 °C contre 40 au maximum (CNC Kitchen).
      temperature_buse: 215, temperature_buse_premiere: 215,
      // La transition vitreuse de ce filament est à 61 °C (profil Orca). Un
      // plateau à 55 °C maintient donc le pied de la pièce à 6 °C de sa Tg
      // pendant TOUTE l'impression : il reste assez souple pour épouser la
      // surface, puis se contracte autour d'elle. C'est ce qui rend les pièces
      // impossibles à décoller des plaques BQ. Bambu fait imprimer le PLA à
      // 35 °C sur sa Cool Plate : 45 puis 40 reste au-dessus de ça, et 20 °C
      // sous la Tg. Le plateau ne sert plus qu'à ne pas gauchir.
      temperature_plateau_premiere: 45, temperature_plateau: 40,
      // 100 % : le rapport de débit est une inconnue de la calibration, pas un
      // réglage de départ. Le fausser ici fausserait tous les essais suivants.
      // Le profil Orca attend 0,98 — c'est la zone d'atterrissage, pas le départ.
      rapport_debit: 1, pression_avance: 0.02,
      // Prudent : l'essai de débit maximal le remonte, il ne doit jamais brider
      // au point de masquer un défaut de vitesse. Le profil Orca de ce filament
      // annonce 16 ; avec les vitesses ci-dessous on plafonne à 6,3, donc rien
      // n'est bridé et le débit n'interfère avec aucun essai.
      debit_maximal: 12,
      // Extrudeur direct, tube court : une rétraction courte suffit au PLA.
      longueur_retraction: 0.8, vitesse_retraction: 30,
      // Moins on refroidit, mieux les couches se soudent. On garde donc une vraie
      // ventilation sur les géométries qui en ont besoin (surplombs) et on la
      // laisse suivre la couche partout ailleurs : forcer 100 % sur la paroi
      // extérieure, c'était refroidir à fond la partie qui porte la charge.
      // 0 veut dire « comme la couche ».
      ventilateur_min: 40, ventilateur_max: 80, ventilateur_paroi_exterieure: 0,
      ventilateur_dessus: 0, ventilateur_surplomb: 100,
      temps_couche_ventilateur: 60, couches_sans_ventilateur: 1,
      temps_couche_min: 6, vitesse_min_refroidissement: 20,
    },
  },
  {
    id: "petg_sunlu", nom: "PETG Sunlu", matiere: "PETG", buse: "buse_0_4",
    valeurs: {
      diametre_filament: 1.75, densite_filament: 1.27,
      // La P1S de l'atelier tourne sans ses caches latéraux : elle se comporte
      // comme une P1P, et aucun préréglage ne s'appuie sur son ventilateur auxiliaire.
      ventilateur_auxiliaire: 0,
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
    /*
     * Un préréglage écrit EN ENTIER : les 76 réglages d'impression y sont, aucun
     * ne retombe en silence sur le défaut du catalogue. Sans cela, « la valeur
     * actuelle » dépend d'un défaut qu'on peut changer sans s'en apercevoir, et
     * deux réglages au moins en dépendaient vraiment (voir epaisseur_dessus).
     *
     * Parti pris : une base LENTE et PROPORTIONNÉE. Le trancheur est écrit à la
     * main ; tant que ses sorties ne sont pas prouvées, la vitesse ne doit
     * expliquer aucun défaut. On remonte d'abord l'accélération, ensuite la
     * vitesse — jamais l'inverse (voir le bloc des vitesses).
     */
    id: "qualite_0_2", nom: "Qualité 0.2", buse: "buse_0_4",
    valeurs: {
      // ── Qualité ──
      // Les largeurs de ligne appartiennent au profil d'impression, et celui-ci
      // est fait pour la buse de 0,4.
      ...largeursDeLigne(0.4),
      hauteur_couche: 0.2,
      // 0,24 et non 0,20 : une première couche plus épaisse est moins aplatie
      // contre la plaque, donc moins ancrée dans sa surface — c'est l'un des
      // leviers contre les pièces qu'on ne décolle plus. Ellis recommande
      // d'ailleurs 0,25 ou plus, « plus facile à régler et plus tolérant ».
      hauteur_premiere_couche: 0.24,
      ancrage_pont: 3, portee_minimale_pont: 2,
      position_couture: "alignee", couture_biseau: "non", jeu_couture: 0, longueur_biseau: 10,
      repassage: "non", espacement_repassage: 0.15, debit_repassage: 10,
      // Les parois à largeur variable modulent la largeur en continu, et c'est
      // NOTRE interpolation (parois_variables.js, axe_median.js) : une largeur
      // fausse ressemble trait pour trait à un débit faux, et corromprait
      // l'essai de rapport de débit. On les remet à « oui » quand la base est
      // validée et le débit mesuré.
      parois_variables: "non",
      remplir_interstices: "partout", une_paroi_sur_dessus: "non",
      compensation_trous: 0, compensation_contours: 0,
      ordre_parois: "interieures_puis_exterieure",
      // 0,012 mm, la valeur des profils Bambu. 0,05 était quatre fois trop
      // grossier : il arrondissait les arêtes et faussait les cotes.
      arcs: "oui", tolerance_arcs: 0.012,

      // ── Résistance ──
      // Ces quatre-là sont FIXÉS par l'utilisateur : on n'y touche pas.
      nombre_parois: 2, couches_dessus: 3, couches_dessous: 3,
      motif_remplissage: "gyroide",
      // ... et c'est précisément pour cela que les épaisseurs minimales doivent
      // être à ZÉRO. À 0,2 mm de couche, trois couches font 0,6 mm : le défaut
      // de 1 mm aurait ajouté deux couches pleines en silence, et « couches du
      // dessus = 3 » n'aurait pas été respecté. À zéro, c'est le NOMBRE de
      // couches qui commande, comme demandé.
      epaisseur_dessus: 0, epaisseur_dessous: 0,
      motif_dessus: "monotone", motif_dessous: "monotone",
      elargissement_coques: 0.4, chevauchement_pleins: 25,
      // 15 % est la valeur d'Orca comme de Bambu. Avec deux parois et trois
      // couches fixées, le remplissage est de loin le levier le MOINS rentable
      // pour la résistance (à masse égale, les parois rapportent davantage) :
      // le monter seul coûterait de la matière sans rendre la pièce solide.
      densite_remplissage: 15, angle_remplissage: 45,
      // 25 % : le remplissage mord un peu plus sur la dernière paroi et s'y
      // soude mieux. Sans risque, puisqu'il mord sur une paroi INTÉRIEURE.
      chevauchement_remplissage: 25,
      couches_densification: 2,

      /*
       * ── Vitesse ──
       * Une transition de vitesse occupe une distance : d = |v1² − v2²| / 2a.
       * Deux pièges opposés en découlent. Si d dépasse la longueur du morceau à
       * imprimer, la vitesse demandée n'est jamais atteinte et la tête ne fait
       * que freiner et réaccélérer. Si d est minuscule, c'est que la machine
       * encaisse un coup. Le seul levier qui règle les deux à la fois est de
       * réduire le RAPPORT v1/v2.
       *
       * Le morceau de surplomb le plus court que le trancheur émette est fixé
       * par longueurMinimaleDUnMorceau (tranchage_piece.js). Toute transition
       * doit y tenir. D'où le plancher d'accélération :
       *     a_min = (v_paroi² − v_surplomb_fort²) / (2 × longueur minimale)
       * soit ici (50² − 15²) / 3 = 758 mm/s². Le 1500 retenu laisse le double.
       *
       * Ce que ces valeurs corrigent : les vitesses avaient été divisées par
       * deux par rapport au profil Bambu, les ACCÉLÉRATIONS pas du tout, et les
       * surplombs non plus. Le préréglage avait donc la dynamique d'une machine
       * deux fois plus rapide que lui, avec un rapport de 10× entre la paroi
       * (100) et le surplomb fort (10) : un demi-g encaissé à chaque entrée et
       * chaque sortie de débord.
       */
      // À 500 mm/s², 50 mm/s n'est atteint qu'après 2,5 mm : la première couche
      // était posée à vitesse variable. À 30 mm/s il faut 0,9 mm.
      vitesse_premiere_couche: 30,
      vitesse_paroi_exterieure: 50, vitesse_parois_interieures: 60,
      vitesse_remplissage: 70, vitesse_plein_interieur: 60, vitesse_dessus: 40,
      vitesse_petits_contours: 25, seuil_petits_contours: 20,
      // Une échelle géométrique : chaque cran vaut environ 1,4× le suivant, et
      // le rapport paroi → surplomb fort tombe de 10× à 3,3×. Le 10 mm/s
      // d'OrcaSlicer n'avait de sens que face à une paroi à 200 mm/s.
      vitesse_surplomb_leger: 35, vitesse_surplomb_moyen: 25, vitesse_surplomb_fort: 15,
      // Les surplombs : les paliers d'OrcaSlicer, et aucun mécanisme en plus.
      // « Progressive » est à éviter POUR L'INSTANT : ce mode sautait la fusion
      // des morceaux et changeait de vitesse tous les 0,5 mm, ce qui est le
      // régime qu'on cherche à fuir. Une fois la fusion corrigée, il redevient
      // le meilleur choix.
      strategie_surplomb: "paliers", debit_surplomb: 100, debit_pont: 100,
      tendre_les_debords: "non", longueur_debord_tendu: 12,
      parois_surplomb_dabord: "non", detection_enroulement: "oui",
      vitesse_pont: 25, vitesse_pont_interieur: 40,
      vitesse_repassage: 30, vitesse_interstices: 40,
      // À 3000 mm/s², 500 mm/s demanderait 42 mm d'élan : la valeur était
      // fictive sur la plupart des sauts. 250 en demande 10.
      vitesse_deplacement: 250,
      // UNE SEULE accélération pour l'impression, exprès : le flux de M204
      // devient quasi constant, ce qui fait une variable de moins pendant qu'on
      // cherche les défauts du trancheur. On la différenciera à nouveau quand la
      // base sera validée. Les déplacements restent à part : c'est le mouvement
      // le plus violent de la machine, et 10000 était de toute façon écrêté par
      // le micrologiciel (machine_max_acceleration_travel = 9000).
      acceleration_defaut: 1500, acceleration_paroi_exterieure: 1500,
      acceleration_dessus: 1500, acceleration_premiere_couche: 500,
      acceleration_deplacement: 3000,
      couches_transition: 4,

      // ── Adhérence ──
      // Pas de bordure : sur une plaque qui colle trop, c'est de la surface
      // collée en plus, à arracher. Si elle devient nécessaire, les oreilles ne
      // collent que les angles — les seuls qui décollent — avec dix fois moins
      // de matière à retirer.
      tours_jupe: 1, distance_jupe: 2,
      largeur_bordure: 0, ecart_bordure: 0.1,
      type_bordure: "oreilles", angle_des_oreilles: 120,
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

/*
 * Les profils du site
 * ───────────────────
 * Le logiciel livre les profils ci-dessus dans son code. Ce que
 * l'ADMINISTRATEUR en change va dans la base de données du site, et tout le
 * monde lit la même chose : un réglage n'a aucune raison de dépendre du poste.
 * Rien n'est rangé dans le navigateur — une copie locale finit par masquer le
 * profil livré sans que rien ne le dise, et aucune mise à jour du logiciel ne
 * la corrige.
 *
 * Une seule liste par source, et un seul geste pour la remplir : Enregistrer
 * écrit les valeurs en vigueur DANS le profil choisi, sous son nom, sans rien
 * demander. Un profil fourni avec le logiciel s'enregistre comme les autres :
 * la version du site prend sa place, au même rang et sous le même nom, et
 * Supprimer la retire pour retrouver celle d'origine.
 *
 * Le nom n'appartient donc qu'à l'administrateur : rien ne lui accole jamais de
 * suffixe. Renommer et Dupliquer sont des gestes à part, qu'il demande.
 *
 * Fusion par identifiant : un profil du site qui porte l'identifiant d'un
 * profil fourni le remplace là où il est ; les autres viennent à la suite.
 */
let duSite = Object.fromEntries(SOURCES.map(({ id }) => [id, []]));

/* Remplace les profils du site (au démarrage, puis à chaque enregistrement). */
export function definirLesPrereglagesDuSite(parSource) {
  duSite = Object.fromEntries(SOURCES.map(({ id }) => [id, parSource[id] ?? []]));
}

/* Tous les profils du site, tels qu'il faut les envoyer au serveur. */
export const tousLesPrereglagesDuSite = () => ({ ...duSite });

const fournisDe = (source) => LISTES[source] ?? [];
const siteDe = (source) => duSite[source] ?? [];

/* Ce profil vient-il avec le logiciel ? On peut alors toujours le réinitialiser. */
export const estPrereglageFourni = (source, id) => fournisDe(source).some((p) => p.id === id);

/* Ce profil a-t-il une version enregistrée sur le site ? */
export const estPrereglageDuSite = (source, id) => siteDe(source).some((p) => p.id === id);

/*
 * Les profils d'une source. Passer une buse ne garde que ceux qui ont été faits
 * pour elle : c'est ce qui fait qu'un diamètre de buse « débloque » sa propre
 * famille de plaques, de matériaux et de réglages d'impression.
 */
export function listeDesPrereglages(source, buse = null) {
  const duSiteParId = new Map(siteDe(source).map((p) => [p.id, p]));
  const idsFournis = new Set(fournisDe(source).map((p) => p.id));
  const tous = [
    ...fournisDe(source).map((p) => duSiteParId.get(p.id) ?? p),
    ...siteDe(source).filter((p) => !idsFournis.has(p.id)),
  ];
  if (buse === null || !dependDeLaBuse(source)) return tous;
  return tous.filter((p) => p.buse === buse);
}

/* Remplace la liste du site pour une source, en gardant les autres. */
function poser(source, liste) {
  duSite = { ...duSite, [source]: liste };
}

/* Range le profil à sa place dans la liste du site, ou l'y ajoute. */
function ranger(source, profil) {
  const liste = siteDe(source);
  poser(source, liste.some((p) => p.id === profil.id)
    ? liste.map((p) => (p.id === profil.id ? profil : p))
    : [...liste, profil]);
}

/* La phrase qui dit pourquoi ce nom ne va pas, ou null s'il convient. */
function nomRefuse(source, nom, saufId = null) {
  const propre = nom.trim();
  if (propre === "") return "Donner un nom au profil.";
  if (listeDesPrereglages(source).some((p) => p.nom === propre && p.id !== saufId)) {
    return "« " + propre + " » existe déjà : choisir un autre nom.";
  }
  return null;
}

/* Les valeurs que le profil doit porter : les siennes, écrasées par ce qui a changé. */
function valeursAEnregistrer(source, id, impression) {
  return { ...prereglage(source, id).valeurs, ...ecartsDeLaSource(impression.ecarts ?? {}, source) };
}

/*
 * ENREGISTRER. Les valeurs en vigueur entrent dans le profil choisi, sous son
 * nom et à son rang. Aucune question : c'est le geste courant, et c'est
 * toujours le même profil qu'on reprend d'une séance à l'autre.
 */
export function enregistrerPrereglage(source, id, impression) {
  const courant = prereglage(source, id);
  const enregistre = { ...courant, valeurs: valeursAEnregistrer(source, id, impression) };
  ranger(source, enregistre);
  return enregistre;
}

/*
 * DUPLIQUER. Un profil de plus, avec les valeurs en vigueur et le nom demandé :
 * c'est ainsi qu'on garde l'ancien réglage à côté du nouveau.
 * Rend { erreur } ou { cree }.
 */
export function dupliquerPrereglage(source, id, nom, impression) {
  const erreur = nomRefuse(source, nom);
  if (erreur !== null) return { erreur };
  const cree = {
    ...prereglage(source, id),
    id: "poste_" + source + "_" + Date.now().toString(36),
    nom: nom.trim(),
    valeurs: valeursAEnregistrer(source, id, impression),
  };
  poser(source, [...siteDe(source), cree]);
  return { cree };
}

/* RENOMMER. Rend { erreur }, ou un objet vide si c'est fait. */
export function renommerPrereglage(source, id, nom) {
  const erreur = nomRefuse(source, nom, id);
  if (erreur !== null) return { erreur };
  ranger(source, { ...prereglage(source, id), nom: nom.trim() });
  return {};
}

/*
 * SUPPRIMER. Un profil fourni retrouve ses valeurs et son nom d'origine ; un
 * profil créé ici disparaît. Rend l'identifiant à choisir ensuite : le même si
 * le profil d'origine revient, un autre s'il n'y a plus rien sous celui-là.
 */
export function supprimerPrereglage(source, id, buse) {
  poser(source, siteDe(source).filter((p) => p.id !== id));
  return estPrereglageFourni(source, id) ? id : prereglageParDefaut(source, buse);
}

/* Un nom de copie libre : « BQ Textured 2 », « BQ Textured 3 »… */
export function nomDeCopieDisponible(source, id) {
  const base = prereglage(source, id).nom.replace(/\s+\d+$/, "");
  const pris = new Set(listeDesPrereglages(source).map((p) => p.nom));
  for (let n = 2; n < 1000; n += 1) {
    if (!pris.has(base + " " + n)) return base + " " + n;
  }
  return base + " " + Date.now().toString(36);
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

/*
 * Toutes les valeurs effectives d'un plateau : { cle: valeur }.
 * Un écart venu d'un projet enregistré avant un changement de réglage peut ne
 * plus avoir de sens (un choix qui n'existe plus, un nombre hors plage) : il est
 * alors ignoré au profit du préréglage. Sans ce filet, une seule valeur périmée
 * suffirait à fausser tout un tranchage sans rien dire.
 */
export function valeursEffectives(impression) {
  const ecarts = impression.ecarts ?? {};
  const resultat = {};
  for (const r of REGLAGES) {
    const ecart = r.cle in ecarts ? valeurValide(r.cle, ecarts[r.cle]) : null;
    resultat[r.cle] = ecart === null ? valeurDuPrereglage(impression, r.cle) : ecart;
  }
  return resultat;
}

/* La valeur effective d'un seul réglage, sans tout recalculer (même filet que ci-dessus). */
export function valeurEffective(impression, cle) {
  const ecarts = impression.ecarts ?? {};
  const ecart = cle in ecarts ? valeurValide(cle, ecarts[cle]) : null;
  return ecart === null ? valeurDuPrereglage(impression, cle) : ecart;
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
