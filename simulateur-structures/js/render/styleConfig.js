// render/styleConfig.js
// ─────────────────────
// TOUTES les valeurs visuelles du canvas (couleurs, tailles, échelles). Aucune
// couleur ni taille de dessin ne doit être écrite en dur ailleurs. N'influe
// JAMAIS sur la physique.
//
// Direction artistique : une vue d'ingénierie réaliste, pas un dessin animé.
// Tons naturels et désaturés (perspective atmosphérique), matériaux reconnaissables
// à leur texture, un seul accent bleu pour ce qui relève de l'interface
// (sélection, accrochage, aperçu de pose).

// ── Échelle monde → écran ──
export const PIXELS_PER_METER = 20; // "pixels de base" = mètres × 20, à zoom ×1

// ── Zoom / déplacement de la vue ──
export const ZOOM_LEVEL_MIN = 0.5;
export const ZOOM_LEVEL_MAX = 5;
export const DEFAULT_ZOOM_LEVEL = 1;
export const ZOOM_STEP = 1.25; // facteur d'un cran de zoom (boutons, menu, clavier)
export const ZOOM_WHEEL_SENSITIVITY = 0.0015; // par unité de deltaY de la molette
export const FIT_VIEW_FILL = 0.8; // part de la largeur occupée par la grille (carte libre)
// À l'ouverture d'un niveau, sa zone de travail occupe TOUJOURS la même part de
// l'écran : un petit pont arrive zoomé, un grand viaduc en vue large.
export const LEVEL_VIEW_FILL_WIDTH = 0.7;
export const LEVEL_VIEW_FILL_HEIGHT = 0.95; // la hauteur n'est qu'une contrainte : tout doit tenir

// Fin de dégradé transparente (fondus du décor).
export const TRANSPARENT = "rgba(0, 0, 0, 0)";

// ── Accent de l'interface (sélection, accrochage, aperçu) ──
// Même bleu que --color-accent (style-config.css) : l'accent est UNIQUE.
export const ACCENT_COLOR = "#1a73d9";

// ── Ciel ──
// Dégradé atmosphérique en repère écran : zénith bleu, horizon voilé. La ligne
// d'horizon suit le plan de montagnes le plus lointain (environment.js).
export const SKY_ZENITH = "#6a9bcc";
export const SKY_UPPER = "#93bade";
export const SKY_LOWER = "#c8ddec";
export const SKY_HAZE = "#e9f1f6";

// ── Nuages (texture procédurale, voir textures.js) ──
export const CLOUD_LIT = "#ffffff";
export const CLOUD_SHADE = "#a9b5c3";
export const CLOUD_OPACITY = 0.9;
export const CLOUD_PARALLAX = 0.04; // part du déplacement de la vue suivie par les nuages

// ── Relief lointain (plans en parallaxe, du plus loin au plus proche) ──
// depth   : 0 = figé à l'écran, 1 = suit le premier plan (parallaxe et zoom) ;
// horizon : altitude (m, Y vers le bas) du pied du plan ;
// height  : hauteur max des crêtes (m) ; period : largeur typique d'une crête (m) ;
// canopy  : amplitude (m) de la frange d'arbres sur la crête ;
// top/base: couleur au sommet et au pied (brume de vallée).
export const BACKDROP_LAYERS = [
  { depth: 0.12, horizon: 16.5, height: 10, period: 38, seed: 7, canopy: 0, top: "#afc0cf", base: "#dfe8ef" },
  { depth: 0.28, horizon: 18.5, height: 6.5, period: 21, seed: 19, canopy: 0.18, top: "#9bb2b2", base: "#d0dcdd" },
  { depth: 0.5, horizon: 21.5, height: 5.5, period: 13, seed: 31, canopy: 0.35, top: "#80a07a", base: "#bdd0c0" },
];

// ── Rivière au fond de la gorge (altitude fixe du monde) ──
export const WATER_LEVEL_M = 22.4;
export const WATER_SURFACE = "#b6d0d8";
export const WATER_MID = "#8fb5c2";
export const WATER_DEEP = "#6593a4";
export const WATER_GRADIENT_DEPTH_M = 6;
export const WATER_REFLECTION = "#7f9f79"; // reflet des versants boisés, juste sous la surface
export const WATER_REFLECTION_ALPHA = 0.3;
export const WATER_REFLECTION_DEPTH_M = 1.1;
export const WATER_LINE = "rgba(255, 255, 255, 0.75)";
export const WATER_STREAK = "#ffffff";

// ── Bateaux (gabarit à laisser libre sous le pont) ──
// Coque claire de bateau de plaisance : blanc cassé au pont, gris-bleu à la
// carène, liseré de flottaison foncé. La partie immergée est peinte en
// transparence, on la devine sous l'eau.
export const BOAT_HULL_TOP = "#f4f6f7";
export const BOAT_HULL_BOTTOM = "#b4c1ca";
export const BOAT_HULL_LINE = "#5c6a74";
export const BOAT_WATERLINE = "#2f4a5c";
export const BOAT_CABIN = "#e3eaee";
export const BOAT_CABIN_LINE = "#6d7a84";
export const BOAT_GLASS = "#8fb2c4";
export const BOAT_MAST = "#d2d9de";
export const BOAT_MAST_LINE = "#78848d";
// Drapeau d'arrivée (damier planté sur le point à atteindre).
export const ARRIVEE_MAT = "#4a5560";
export const ARRIVEE_CLAIR = "#ffffff";
export const ARRIVEE_SOMBRE = "#2f3941";
export const ARRIVEE_MAT_PX = 34;
export const ARRIVEE_DRAPEAU_PX = 18;

export const BOAT_SAIL = "#f7f4ee";
export const BOAT_SAIL_SHADE = "#dfd9cd";
export const BOAT_SAIL_LINE = "#8a8378";
export const BOAT_SUBMERGED_ALPHA = 0.42;
export const BOAT_LINE_WIDTH_M = 0.05;

// ── Sol construit (relief des niveaux) ──
// Roche calcaire claire, texture discrète, couches géologiques HORIZONTALES (les
// mêmes des deux côtés d'une gorge, comme dans la réalité), herbe en liseré net.
export const ROCK_LIGHT = "#eae2d1";
export const ROCK_DARK = "#cbbd9e";
export const STRATA_TINTS = ["#f1e9d9", "#d6c4a2", "#e0d6c4", "#cab897"]; // clair, chaud, gris, ocre
export const STRATA_BAND_ALPHA = 0.5;
export const STRATA_LINE_COLOR = "rgba(140, 118, 84, 0.26)";
export const TERRAIN_DEPTH_SHADE = "rgba(112, 100, 82, 0.26)"; // léger assombrissement en profondeur
export const TERRAIN_DEPTH_SHADE_M = 16; // profondeur (m) de l'assombrissement complet
export const CLIFF_SHADE = "rgba(140, 116, 80, 0.16)"; // ombre douce le long des falaises
export const CLIFF_SHADE_M = 0.9;
export const CLIFF_EDGE = "rgba(150, 126, 90, 0.45)";
export const CLIFF_ROUGHNESS_M = 0.14; // irrégularité (vers l'intérieur) des parois verticales
export const GRASS_TOP = "#9dc767";
export const GRASS_BOTTOM = "#74a247";
export const GRASS_HIGHLIGHT = "#b8da86";
export const GRASS_EDGE = "rgba(80, 110, 46, 0.5)";
export const GRASS_THICKNESS_M = 0.32;
export const GRASS_MAX_SLOPE = 1.1; // au-delà (pente dy/dx), roche nue
export const TERRAIN_EXTENSION_M = 150; // prolongement visuel du sol au-delà de la grille

// ── Grille de conception (visible en mode Conception seulement) ──
export const GRID_VEIL = "rgba(255, 255, 255, 0.04)"; // voile sur la zone constructible
export const GRID_LINE_RGB = "255, 255, 255";
export const GRID_FINE_ALPHA = 0.045; // 50 cm (seulement si assez zoomé)
export const GRID_MEDIUM_ALPHA = 0.085; // 1 m
export const GRID_MAJOR_ALPHA = 0.16; // 5 m
export const GRID_FRAME_ALPHA = 0.3;
export const GRID_MAJOR_EVERY = 10; // ligne forte toutes les 10 mailles (5 m)
export const GRID_MEDIUM_EVERY = 2; // ligne moyenne toutes les 2 mailles (1 m)
export const GRID_FINE_MIN_PX = 12; // espacement écran mini pour tracer les lignes de 50 cm

// ── Règles graduées (bords haut et gauche, mode Conception) ──
export const RULER_SIZE_PX = 18;
export const RULER_BG_TOP = "#f8f9fa";
export const RULER_BG_BOTTOM = "#e3e7eb";
export const RULER_BORDER = "#a9b1b9";
export const RULER_TICK = "#6c757d";
export const RULER_TEXT = "#3b434a";
export const RULER_FONT = "10px 'Segoe UI', system-ui, sans-serif";
export const RULER_MIN_LABEL_SPACING_PX = 56;

// ── Poutres : largeur à l'écran ──
export const BEAM_WIDTH_BASE_PX = 3;
export const BEAM_WIDTH_PX_PER_METER_THICKNESS = 52;
export const BEAM_WIDTH_MIN_PX = 4.5;
export const BEAM_WIDTH_MAX_PX = 18;
export const MEMBER_EDGE_FRACTION = 0.07; // cerne sombre (part de la largeur)
export const MEMBER_EDGE_MIN_PX = 0.7;
export const ELEMENT_CLICK_TOLERANCE = 7;

// ── Poutres : aspect des matériaux ──
// body : face ; edge : cerne ; light : arête éclairée (dessus) ; shadow : arête
// d'ombre (dessous) ; detail : ailes d'un profilé, fil du bois ; asphalt : enrobé.
export const MEMBER_LOOKS = {
  wood: { body: "#b7895a", edge: "#5e4127", light: "#dcb17f", shadow: "#855f39", detail: "#6f4a29" },
  steel: { body: "#4d6379", edge: "#26323e", light: "#b3c5d6", shadow: "#33434f", detail: "#6a839b" },
  concrete: { body: "#b3b2ac", edge: "#6d6c66", light: "#dedcd6", shadow: "#8a8983" },
  road: { body: "#a3a5a2", edge: "#2b2f33", light: "#d0d2cf", shadow: "#7b7e7b", asphalt: "#383b3f" },
  cable: { body: "#363b41", edge: "#16191c", light: "#aab1b8" },
};
export const MEMBER_FALLBACK_LOOK = MEMBER_LOOKS.steel;
export const CONCRETE_LIGHT = "#cfcdc6";
export const CONCRETE_DARK = "#9a9892";

// ── Alerte de surcharge (voilage rouge au-delà d'un taux de travail) ──
export const OVERLOAD_COLOR = "#d4372a";
export const OVERLOAD_START_UTIL = 0.55;
export const OVERLOAD_MAX_ALPHA = 0.85;
export const BROKEN_COLOR = "#5e1712";
export const BROKEN_ALPHA = 0.6;

// ── Câble : fil d'acier toronné ──
export const CABLE_WIDTH_PX = 2.4;
export const CABLE_STRAND_SPACING_PX = 2.8;
export const CABLE_STRAND_SLANT = 0.8;
export const CABLE_STRAND_ALPHA = 0.75;

// ── Goussets d'assemblage (nœuds) ──
// Tôle plate tendue entre les poutres qui se rejoignent, dessinée DERRIÈRE elles :
// elle ne se voit que dans les angles, comme sur un vrai treillis.
export const NODE_RADIUS = 4; // rayon de référence (accroche des poids suspendus)
export const GUSSET_PLATE = "#6b7e91";
export const GUSSET_EDGE = "#3a4855";
export const GUSSET_REACH_FACTOR = 1.1; // × largeur de la plus grosse poutre du nœud
export const GUSSET_REACH_EXTRA_PX = 2;
export const GUSSET_MARGIN_PX = 0.8;
export const NODE_CLICK_RADIUS = 9; // tolérance de clic / accrochage (maille 50 cm = 10 px)

// ── Appuis ──
// Sur le sol (à moins de SUPPORT_MAX_HEIGHT_M) : vrai appareil d'appui — pile en
// béton + sabot d'acier (pivot) ou massif d'encastrement. Dans le vide : symbole
// normalisé (triangle + hachures).
export const SUPPORT_MAX_HEIGHT_M = 4;
export const SUPPORT_PIER_WIDTH_M = 0.9;
export const SUPPORT_CAP_WIDTH_M = 1.2;
export const SUPPORT_CAP_HEIGHT_M = 0.14;
export const SUPPORT_BEARING_HEIGHT_M = 0.3;
export const SUPPORT_EMBED_M = 0.2;
export const SUPPORT_FOOTING_WIDTH_M = 1.6;
export const SUPPORT_FOOTING_HEIGHT_M = 0.34;
export const SUPPORT_CLAMP_WIDTH_M = 1.1;
export const SUPPORT_CLAMP_ABOVE_M = 0.45;
export const SUPPORT_EDGE = "#55544f";
export const SUPPORT_SIDE_LIGHT = "rgba(255, 255, 255, 0.22)";
export const SUPPORT_SIDE_SHADE = "rgba(0, 0, 0, 0.22)";
export const BEARING_COLOR = "#3b4249";
export const BEARING_EDGE = "#191d21";
export const ANCHOR_SYMBOL_COLOR = "#2d343b";
export const ANCHOR_SYMBOL_WIDTH = 16;
export const ANCHOR_SYMBOL_OFFSET_Y = 8;
export const ANCHOR_HATCH_COUNT = 4;
export const ANCHOR_HATCH_LENGTH = 8;

// ── Flèches (utilitaire canvasUtils) ──
export const FORCE_ARROW_HEAD_LENGTH = 8;
export const FORCE_ARROW_LINE_WIDTH = 2;

// ── Poids posés : bloc de lest en béton, avec son anneau de levage ──
export const WEIGHT_BLOCK_WIDTH_PX = 34;
export const WEIGHT_BLOCK_HEIGHT_PX = 26;
export const WEIGHT_EYE_RADIUS_PX = 3.4;
export const WEIGHT_CABLE_COLOR = "#2b2f33";
export const WEIGHT_LABEL_COLOR = "#2a2e33";
export const WEIGHT_LABEL_FONT_FAMILY = "'Segoe UI', system-ui, sans-serif";
export const WEIGHT_HANG_GAP_PX = 3;
export const WEIGHT_REST_MARGIN_PX = 1;
export const WEIGHT_CLICK_TOLERANCE = 14;

// ── Véhicules (dimensions réelles en m, converties au dessin) ──
export const VEHICLE_CAR_LENGTH_M = 2.7;
export const VEHICLE_CAR_HEIGHT_M = 1.1;
export const VEHICLE_VAN_LENGTH_M = 3.4;
export const VEHICLE_VAN_HEIGHT_M = 1.65;
export const VEHICLE_TRUCK_LENGTH_M = 4.4;
export const VEHICLE_TRUCK_HEIGHT_M = 2.1;
export const CAR_PAINT = "#8b2530";
export const CAR_PAINT_LIGHT = "#bf4d57";
export const CAR_PAINT_DARK = "#5a141c";
export const VAN_PAINT_LIGHT = "#f7f8f9";
export const VAN_PAINT = "#e7eaec";
export const VAN_PAINT_DARK = "#b3b9be";
export const VAN_PROTECTION_STRIP = "rgba(35, 39, 43, 0.75)";
export const TRUCK_CAB_PAINT = "#d9a21f";
export const TRUCK_CAB_DARK = "#a2750f";
export const TRUCK_BOX_LIGHT = "#fafbfb";
export const TRUCK_BOX = "#eef0f1";
export const TRUCK_BOX_DARK = "#bfc5ca";
export const TRUCK_BOX_RIB = "#cdd2d6";
export const TRUCK_RAIL = "#8f969c";
export const TRUCK_TANK = "#8d949a";
export const VEHICLE_GLASS_TOP = "#2b3844";
export const VEHICLE_GLASS_BOTTOM = "#71879a";
export const VEHICLE_TRIM = "#23272b";
export const VEHICLE_LINE = "rgba(0, 0, 0, 0.28)";
export const VEHICLE_SHOULDER_LINE = "rgba(255, 255, 255, 0.22)"; // ligne d'épaule (reflet)
export const VEHICLE_DOOR_RAIL = "rgba(0, 0, 0, 0.18)";
export const VEHICLE_TIRE = "#1b1c1e";
export const VEHICLE_RIM = "#bcc1c6";
export const VEHICLE_HUB = "#666c72";
export const VEHICLE_HEADLIGHT = "#f4f0d8";
export const VEHICLE_TAILLIGHT = "#b0231c";
export const VEHICLE_SHADOW = "rgba(0, 0, 0, 0.3)";
export const VEHICLE_CLICK_TOLERANCE = 32;

// ── Étiquettes de taux de travail (en essai, taille constante à l'écran) ──
// TROIS PROFILS, parcourus en boucle par le bouton « Taux de travail ». Le choix
// dépend de la scène : sur un pont en treillis serré les grosses bulles se
// touchent et masquent les poutres qu'elles annotent, sur un tablier simple
// elles se lisent de loin. Masquer complètement sert à regarder la déformation.
// `hauteur` est entière : le cadre se dessine sur un demi-pixel pour rester net.
// `marge` est la largeur ajoutée AU TOTAL à celle du texte.
// L'ordre du tableau est celui de la boucle ; `aucun` n'a pas de géométrie.
export const PROFILS_TAUX = [
  { id: "gros", libelle: "Taux : gros", font: "600 10px 'Segoe UI', system-ui, sans-serif", hauteur: 15, marge: 8 },
  { id: "petit", libelle: "Taux : petit", font: "600 7.5px 'Segoe UI', system-ui, sans-serif", hauteur: 11, marge: 6 },
  { id: "aucun", libelle: "Taux : masqué" },
];

export function profilTauxPar(id) {
  return PROFILS_TAUX.find((profil) => profil.id === id) || PROFILS_TAUX[0];
}

export const LABEL_BG = "rgba(255, 255, 255, 0.94)";
export const LABEL_CALM = "#4f5963";
export const LABEL_WARN = "#b06400";
export const LABEL_DANGER = "#c4271c";
export const LABEL_OFFSET_PX = 12;
export const EFFORT_LABEL_MIN_UTIL = 0.03;

// ── Aperçu de pose et cote ──
export const PREVIEW_OK_COLOR = ACCENT_COLOR;
export const PREVIEW_BAD_COLOR = "#d23b2e";
export const PREVIEW_ALPHA = 0.6;
export const PREVIEW_OVERFLOW_COLOR = "rgba(30, 40, 50, 0.45)";
export const DIMENSION_FONT = "600 11px 'Segoe UI', system-ui, sans-serif";
export const DIMENSION_BG = "#ffffff";
export const DIMENSION_BORDER = "#56626d";
export const DIMENSION_TEXT = "#1d242a";
export const DIMENSION_OFFSET_PX = 16;

// ── Repères des nœuds (mode Conception) ──
// Petit carré à chaque nœud, pour voir où accrocher une poutre : creux pour un
// nœud libre, plein pour un appui. Taille constante à l'écran.
export const JOINT_MARKER_PX = 6;
export const JOINT_MARKER_FILL = "rgba(255, 255, 255, 0.92)";
export const JOINT_MARKER_BORDER = "#3d4751";
export const JOINT_MARKER_FIXED_FILL = "#3d4751";
export const JOINT_MARKER_FIXED_BORDER = "#ffffff";

// ── Marqueur d'accrochage (point du maillage visé) ──
export const SNAP_SIZE_PX = 9;
export const SNAP_FILL = "rgba(255, 255, 255, 0.85)";

// ── Sélection ──
export const SELECTION_COLOR = ACCENT_COLOR;
export const SELECTION_HALO_ALPHA = 0.4;
export const SELECTION_HALO_EXTRA_PX = 6; // à l'écran, autour de la poutre
export const SELECTION_GRIP_PX = 6; // poignées carrées aux extrémités
export const SELECTION_GRIP_BORDER = "#ffffff";
export const SELECTION_OUTLINE_DASH = [4, 3];
export const SELECTION_RECT_FILL = "rgba(26, 115, 217, 0.1)";

// ── Vent : particules (traînées) dessinées dans le monde ──
export const WIND_PARTICLE_COLOR = "#f2f7fb";
export const WIND_PARTICLE_WIDTH_PX = 1.2;
export const WIND_TRAIL_ALPHA = 0.25;
export const WIND_HEAD_ALPHA = 0.55;
export const WIND_HEAD_RADIUS_PX = 1.2;

// ── Vent : courbe de prévisualisation (30 s) dans le panneau ──
export const WIND_CURVE_BG = "#ffffff";
export const WIND_CURVE_GRID = "rgba(30, 45, 60, 0.1)";
export const WIND_CURVE_ZERO = "rgba(30, 45, 60, 0.45)";
export const WIND_CURVE_AXIS_TEXT = "#5a646d";
export const WIND_CURVE_LINE = ACCENT_COLOR;
export const WIND_CURVE_FILL_POS = "rgba(26, 115, 217, 0.15)";
export const WIND_CURVE_FILL_NEG = "rgba(210, 120, 40, 0.18)";
