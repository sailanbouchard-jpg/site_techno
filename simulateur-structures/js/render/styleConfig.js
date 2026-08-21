// render/styleConfig.js
// ─────────────────────
// TOUTES les valeurs visuelles du canvas (couleurs, tailles, échelles). Aucune
// couleur/taille de dessin ne doit être écrite en dur ailleurs. N'influe JAMAIS
// sur la physique.

// ── Échelle monde → écran ──
export const PIXELS_PER_METER = 20; // ~40 m × 25 m visibles à zoom ×1

// ── Zoom / déplacement de la vue ──
// On peut DÉZOOMER jusqu'à ×0,5 (vue 2× plus large, pratique avec une grande
// grille) et ZOOMER jusqu'à ×5. ×1 = échelle de référence (PIXELS_PER_METER).
export const ZOOM_LEVEL_MIN = 0.5;
export const ZOOM_LEVEL_MAX = 5;
export const DEFAULT_ZOOM_LEVEL = 1;

// ── Ciel (fond) ──
// Dégradé doux haut → horizon, plus quelques nuages simples. Tons calmes (pas
// de couleurs criardes) pour un rendu "vrai jeu" lisible.
export const SKY_TOP_COLOR = "#5ea6da";
export const SKY_HORIZON_COLOR = "#cde9f3";
export const CLOUD_COLOR = "#ffffff";
export const CLOUD_SHADE_COLOR = "#e4eef5"; // bas du nuage, très légère ombre

// ── Quadrillage (papier millimétré / blueprint) ──
// Trois niveaux, du plus fin au plus fort : 50 cm (la maille) très fin, 1 m
// moyen, 5 m épais. Le pas vient du maillage (model/mesh.js : MESH.spacing).
export const GRID_MAJOR_EVERY = 10; // ligne FORTE toutes les 10 mailles (5 m)
export const GRID_MEDIUM_EVERY = 2; // ligne MOYENNE toutes les 2 mailles (1 m)
export const GRID_FINE_COLOR = "rgba(255,255,255,0.09)"; // 50 cm : très discret
export const GRID_MEDIUM_COLOR = "rgba(255,255,255,0.20)"; // 1 m
export const GRID_MAJOR_COLOR = "rgba(255,255,255,0.42)"; // 5 m
export const GRID_FINE_WIDTH = 0.7;
export const GRID_MEDIUM_WIDTH = 1.0;
export const GRID_MAJOR_WIDTH = 1.7;
export const GRID_FRAME_COLOR = "rgba(255,255,255,0.55)"; // cadre du plan de travail
// Marqueur du point survolé (où le prochain clic va s'accrocher).
export const GRID_HOVER_COLOR = "#ffd24a";
export const GRID_HOVER_RING = "#b9831a";
export const GRID_HOVER_RADIUS = 5;

// ── Sol (terrain) ──
export const TERRAIN_SOIL_TOP = "#7d5b39"; // terre, haut
export const TERRAIN_SOIL_BOTTOM = "#543c25"; // terre, profondeur
export const TERRAIN_GRASS_COLOR = "#74b14b"; // herbe (bande supérieure)
export const TERRAIN_GRASS_DARK = "#4f8233"; // ombre sous l'herbe
export const TERRAIN_GRASS_THICKNESS_M = 0.85; // épaisseur de la bande d'herbe (m)
export const TERRAIN_EDGE_COLOR = "rgba(40,27,15,0.55)"; // liseré sombre du bord
export const TERRAIN_STRATA_COLOR = "rgba(58,38,21,0.22)"; // strates discrètes dans la terre

// ── Nœuds (assemblages / rivets) ──
export const NODE_RADIUS = 4.2;
export const JOINT_CORE_COLOR = "#fbeacc"; // cœur clair du rivet
export const JOINT_RING_COLOR = "#33291f"; // contour sombre
export const FIXED_NODE_COLOR = "#2c333b"; // appui ancré
export const NODE_CLICK_RADIUS = 9; // tolérance de clic/accrochage (maillage 50 cm = 10 px : on reste précis)

// ── Poutres ──
export const BEAM_WIDTH_BASE_PX = 3;
export const BEAM_WIDTH_PX_PER_METER_THICKNESS = 52;
export const BEAM_WIDTH_MIN_PX = 4.5;
export const BEAM_WIDTH_MAX_PX = 18;
export const ELEMENT_SELECTED_WIDTH_BONUS_PX = 2;
export const ELEMENT_CLICK_TOLERANCE = 7;

// Rendu "barre" : bord sombre débordant (contour + ombre) sous la poutre, puis
// la couleur du matériau, puis un filet clair central qui simule un reflet —
// c'est ce relief qui éloigne du trait plat "fait par une IA".
export const BEAM_EDGE_EXTRA_PX = 2.4;
export const BEAM_HILIGHT_FRACTION = 0.3; // largeur du reflet (part de la poutre)
export const BEAM_HILIGHT_MIN_PX = 1.1;

// ── Alerte de surcharge (couleur toujours = matériau, voir choix de design) ──
// La poutre garde la teinte de son MATÉRIAU jusqu'à OVERLOAD_START_UTIL, puis
// se teinte progressivement de rouge d'alerte ; rouge plein à la rupture.
export const OVERLOAD_COLOR = "#d83a2c";
export const OVERLOAD_START_UTIL = 0.55;
export const BROKEN_BEAM_COLOR = "#7c241c";

// Anciennes couleurs d'effort (compression/traction). Conservées car certains
// libellés et utilitaires les importent encore ; les poutres, elles, suivent
// désormais la couleur du matériau (+ alerte de surcharge ci-dessus).
export const FORCE_COMPRESSION_COLOR = "#2b6cb0";
export const FORCE_COMPRESSION_DARK = "#0c2c4a";
export const FORCE_TENSION_COLOR = "#e24b4a";
export const FORCE_TENSION_DARK = "#5a1111";
export const FORCE_NEUTRAL_COLOR = "#8a949e";
export const CABLE_DASH_PATTERN = [8, 5];

// ── Câble (matériau "cable") : rendu fil d'acier TORONNÉ ──
// Un cœur sombre + de courts traits diagonaux réguliers (les torons) le long du
// câble pour évoquer le métal torsadé. Reste lisible même quand le câble part
// en vrille (les torons suivent la polyligne).
export const CABLE_CORE_COLOR = "#1b1b1d";
export const CABLE_STRAND_COLOR = "#9398a0"; // reflets clairs des torons
export const CABLE_WIDTH_PX = 3.6;
export const CABLE_STRAND_SPACING_PX = 5.5; // espacement des torons le long du câble
export const CABLE_STRAND_SLANT = 0.7; // inclinaison des torons (0 = perpendiculaire)

// ── Route (marquage pour charges mobiles) ──
export const ROAD_INDICATOR_GAP_PX = 2;
export const ROAD_INDICATOR_WIDTH_PX = 2;
export const ROAD_INDICATOR_COLOR = "#c9a227";
export const ROAD_INDICATOR_DASH_PATTERN = [4, 4];

// ── Poids posés ──
// Icône "poids kg" (trapèze + anneau + texte « kg »), reproduite au canvas.
// Dimensions de BASE (masse de référence), mises à l'échelle avec la masse au
// dessin. Agrandies ~3× par rapport à l'ancien petit bloc.
export const WEIGHT_COLOR = "#2b333b";
export const WEIGHT_TEXT_COLOR = "#ffffff";
export const WEIGHT_ICON_WIDTH_PX = 38;
export const WEIGHT_ICON_HEIGHT_PX = 44;
export const WEIGHT_HANG_GAP_PX = 3; // espace sous le point quand le poids est SUSPENDU
export const WEIGHT_REST_MARGIN_PX = 3; // marge au-dessus quand le poids est POSÉ dessus
export const WEIGHT_SIZE_PX = 13; // (conservé : utilisé ailleurs éventuellement)
export const WEIGHT_CLICK_TOLERANCE = 14;

// ── Étiquette "% de l'effort de rupture" (au survol/sélection d'une poutre) ──
export const RUPTURE_LABEL_OFFSET_PX = 10;
export const RUPTURE_LABEL_FONT = "10px sans-serif";
export const RUPTURE_LABEL_COLOR = "#5a6472";

// ── Étiquette de % d'effort affichée en permanence sur chaque poutre CHARGÉE ──
// Montre le taux de travail (effort / effort max) au point le plus sollicité,
// avec le mode dominant. Couleur de la flexion (compression/traction réutilisent
// le code couleur des efforts ci-dessus).
export const FORCE_BENDING_COLOR = "#c97a1f"; // flexion = orange
export const EFFORT_LABEL_FONT = "bold 8px sans-serif"; // petit : juste le %
export const EFFORT_LABEL_BG = "rgba(255, 255, 255, 0.82)";
export const EFFORT_LABEL_OFFSET_PX = 11; // décalage au-dessus de la poutre (px de base)
export const EFFORT_LABEL_MIN_UTIL = 0.03; // n'affiche qu'au-delà (poutre "chargée")
export const EFFORT_LABEL_DANGER_COLOR = "#b00020"; // proche / au-delà de la rupture

// ── Sélection / surbrillance ──
export const SELECTION_COLOR = "#e6a23c";
export const SELECTION_RING_MARGIN = 5;
export const SELECTION_RING_WIDTH = 2;
export const SELECTION_OUTLINE_WIDTH = 2;
export const SELECTION_OUTLINE_DASH = [5, 4];
// Rectangle de SÉLECTION élastique (clic gauche maintenu dans le vide, outil
// Sélectionner) : remplissage translucide + bord en pointillé.
export const SELECTION_RECT_FILL = "rgba(230, 162, 60, 0.12)";
export const SELECTION_RECT_DASH = [6, 4];

// ── Vent : particules (traînées) dessinées dans le monde ──
// Teinte fraîche, presque blanche, pour évoquer des filets d'air. Largeur et
// rayon en pixels ÉCRAN (divisés par le zoom au dessin → constants à l'écran).
export const WIND_PARTICLE_COLOR = "#eaf4ff";
export const WIND_PARTICLE_WIDTH_PX = 1.5;
export const WIND_TRAIL_ALPHA = 0.28; // corps de la traînée (fondu)
export const WIND_HEAD_ALPHA = 0.62; // tiers récent (plus net → donne le sens)
export const WIND_HEAD_RADIUS_PX = 1.4; // petite tête lumineuse

// ── Vent : courbe de prévisualisation (30 s) dans l'éditeur ──
export const WIND_CURVE_BG = "#0f1b2a";
export const WIND_CURVE_GRID = "rgba(255,255,255,0.08)";
export const WIND_CURVE_ZERO = "rgba(255,255,255,0.45)";
export const WIND_CURVE_AXIS_TEXT = "rgba(224,236,248,0.7)";
export const WIND_CURVE_LINE = "#7cc6ff";
export const WIND_CURVE_FILL_POS = "rgba(124,198,255,0.20)"; // vent vers la droite
export const WIND_CURVE_FILL_NEG = "rgba(255,176,120,0.20)"; // vent vers la gauche

// ── Symbole d'ancrage (nœud fixe) ──
export const ANCHOR_SYMBOL_WIDTH = 16;
export const ANCHOR_SYMBOL_OFFSET_Y = 8;
export const ANCHOR_HATCH_COUNT = 4;
export const ANCHOR_HATCH_LENGTH = 8;

// ── Flèches (poids / aperçu) ──
export const FORCE_ARROW_HEAD_LENGTH = 8;
export const FORCE_ARROW_LINE_WIDTH = 2;

// ── Charges mobiles (silhouettes voiture / camion, une seule couleur) ──
// Dimensions en MÈTRES réels (converties en pixels via PIXELS_PER_METER au
// dessin) : le véhicule est ainsi à l'échelle du monde et du maillage 1 m.
export const VEHICLE_CAR_COLOR = "#2f6f4f";
export const VEHICLE_TRUCK_COLOR = "#7a3b2e";
export const VEHICLE_CAR_LENGTH_M = 2.5; // une berline ≈ 4,5 m
export const VEHICLE_CAR_HEIGHT_M = 1;
export const VEHICLE_TRUCK_LENGTH_M = 4; // semi-remorque ≈ 12 m
export const VEHICLE_TRUCK_HEIGHT_M = 1.5;
export const VEHICLE_CLICK_TOLERANCE = 32;
