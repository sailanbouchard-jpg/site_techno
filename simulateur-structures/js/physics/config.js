// physics/config.js
// ─────────────────
// Toutes les constantes qui pilotent le COMPORTEMENT physique. Un enseignant
// peut régler ici le "ressenti" sans toucher aux formules.
//
// AMPLIFICATION DE LA DÉFORMATION (objectif : VOIR la physique, pour des
// collégiens). Les vraies poutres se déforment de façon minuscule ; on divise
// donc la raideur réelle par des facteurs choisis UNE FOIS (plus de slider) :
//   - AXIAL_STIFFNESS_DIVISOR : assouplit l'étirement/compression (et stabilise
//     numériquement l'intégration explicite) ;
//   - BENDING_STIFFNESS_DIVISOR : exagère la FLEXION/le flambement, le plus
//     visible pédagogiquement.
// La RÉSISTANCE (seuils de rupture) reste calculée sur la vraie contrainte
// (force/section, moment/module) : casser reste "vrai", seule la déformation
// est exagérée — voir physics/rupture.js.

export const GRAVITY_ACCELERATION = 9.81; // m/s²

// Pas de temps physique fixe (s). Stable aux raideurs assouplies ci-dessous.
export const PHYSICS_DT = 0.0005; // 0,5 ms

// Plafond de pas "rattrapés" par image (anti "spiral of death").
export const MAX_STEPS_PER_FRAME = 200;

// BUDGET TEMPS RÉEL (ms) de physique par image : mesuré avec performance.now()
// dans la boucle (main.js). Dépassé → on abandonne le retard restant : l'image
// reste fluide (60 fps) et la simulation passe en léger RALENTI gracieux au lieu
// de geler. C'est LA protection pour les machines faibles : le nombre de pas
// s'adapte à la vitesse réelle du CPU, pas à un compteur aveugle.
export const PHYSICS_BUDGET_MS = 8;

// ── Décimation des vérifications d'effort/rupture ──
// Le scan des efforts (taux de travail de chaque poutre : axial + flexion +
// assemblages) refaisait presque tout le calcul de forces À CHAQUE pas (0,5 ms).
// On le fait tous les N pas : avec RUPTURE_PERSIST_TIME = 80 ms, une granularité
// de N×0,5 ms est invisible (la rupture arrive à ±4 ms près). Le résultat du
// scan est mis en CACHE sur chaque poutre (beam._effort) et RÉUTILISÉ par le
// rendu (couleur d'alerte, étiquette %) au lieu d'être recalculé par image.
export const EFFORT_SCAN_EVERY_STEPS = 8; // → un scan toutes les 4 ms simulées

// ── Mise en SOMMEIL de la structure à l'équilibre ──
// Stabilisée, sans vent ni véhicule ni surcharge en cours, et un calme plat qui
// dure : plus rien ne peut bouger → on saute les pas physiques (gain ~100 % au
// repos, cas très fréquent en classe). Réveil : vent activé, véhicule, ou toute
// modification de topologie (invalidateIndex remet _asleep à false).
export const SLEEP_SPEED_THRESHOLD = 0.0015; // m/s : « calme plat »
export const SLEEP_DELAY = 0.5; // s de calme plat avant de dormir

// Amortissement appliqué à chaque pas (la vitesse est multipliée par ce
// facteur). Volontairement fort : RELAXATION quasi-statique qui se stabilise
// sans trop osciller. Compromis : assez fort pour borner le sursaut sous
// charge, assez doux pour atteindre l'équilibre (et donc rompre) en quelques
// secondes.
export const VELOCITY_DAMPING_PER_STEP = 0.999;

// Plafond de vitesse d'un nœud (m/s) : garde-fou de sécurité contre une
// divergence numérique extrême (jamais atteint en usage normal, où les
// vitesses restent faibles). N'altère pas la dynamique courante.
export const MAX_NODE_SPEED = 5;

// Masse plancher d'un nœud (kg) : garde-fou numérique (évite F/m avec m=0).
export const MIN_NODE_MASS = 1;

// Une poutre ne rompt que si elle reste au-delà de sa limite pendant AU MOINS
// ce temps (s) : filtre les pics d'effort TRANSITOIRES (au lancement, à un
// choc) pour ne casser que sous une surcharge SOUTENUE — comme la tolérance
// d'un vrai matériau à une sollicitation brève.
export const RUPTURE_PERSIST_TIME = 0.08;

// ── Mise en charge au lancement : « tout part de zéro », sans faux pic ──
// La structure démarre au repos (0 effort) et la gravité monte en douceur
// (GRAVITY_RAMP_DURATION). Tant qu'elle n'est pas STABILISÉE, on amortit FORT
// (relaxation quasi-statique → l'effort monte de 0 vers sa valeur d'équilibre
// SANS dépassement) et on N'APPLIQUE PAS la rupture : un pic transitoire ne peut
// donc plus casser une poutre qui, à l'équilibre, est peu sollicitée. Les
// véhicules ne s'élancent qu'une fois stabilisé. La rupture s'active ensuite.
export const SETTLE_VELOCITY_DAMPING = 0.99; // amortissement fort pendant la stabilisation (vs 0.999 normal)
export const SETTLE_SPEED_THRESHOLD = 0.08; // m/s : sous ce seuil (rampe finie), on considère stabilisé
export const SETTLE_MIN_TIME = 1.5; // s : durée minimale (≥ rampe de gravité)
export const SETTLE_TIMEOUT = 0.75; // s : au-delà, rupture activée quoi qu'il arrive (anti-blocage)

// ── Amplification de la déformation (diviseurs de raideur) ──
export const AXIAL_STIFFNESS_DIVISOR = 500;
export const BENDING_STIFFNESS_DIVISOR = 1;
// (Plus de raideur d'ENCASTREMENT : un APPUI ANCRÉ est désormais un PIVOT PUR —
// position figée, rotation LIBRE, aucun moment transmis. Il n'y a donc plus rien
// à régler ici pour les appuis. La continuité entre poutres d'un assemblage NON
// ancré est gérée à part — bending.js, k = 2·kθ — pour que des tronçons se
// comportent comme une poutre entière.)

// ── Subdivision des poutres en sous-éléments ──
// ~ un sous-élément par SEGMENT_TARGET_LENGTH mètres, borné (coût ∝ nb total).
// On vise des segments d'environ 1 m, JAMAIS plus courts : un segment court rend
// la flexion kθ=EI/L très raide (haute fréquence) → l'intégration explicite à pas
// fixe devient instable ET la contrainte de flexion s'enfle au droit des appuis.
// C'est ce qui faisait qu'une travée DÉCOUPÉE en petits tronçons (pour y fixer
// des attaches) « prenait cher » par rapport à la même poutre entière. En gardant
// ~1 m, une poutre découpée se comporte comme une poutre entière (segments
// alignés). MIN = 1 : un tronçon court (≈ 1 m) est UN seul segment ~1 m qui
// fléchit à ses JOINTS d'extrémité (continuité gérée par bending.js), au lieu
// d'être forcé à 2 segments de 0,5 m.
export const SEGMENT_TARGET_LENGTH = 1; // mètres (≈ une maille)
export const MIN_SEGMENTS_PER_BEAM = 1;
export const MAX_SEGMENTS_PER_BEAM = 40;

// Imperfection latérale (fraction de la longueur) des nœuds internes à la
// construction : minuscule courbure de départ qui donne au FLAMBEMENT une
// direction définie et reproductible (une poutre parfaitement droite serait en
// équilibre instable). Une vraie asymétrie de chargement domine cette graine.
export const BUCKLING_IMPERFECTION = 0.004;

// Montée progressive de la gravité au lancement (évite l'à-coup à t=0).
export const GRAVITY_RAMP_DURATION = 1; // secondes

// ── Vent : conversion VITESSE → FORCE (couplage fluide → structure) ──
// Traînée aérodynamique sur une poutre, appliquée SEGMENT par segment :
//   F = ½ · ρ · Cd · A · v_n · |v_n|
// où v_n est la composante du vent NORMALE à la poutre (relative à la vitesse du
// segment) et A = longueur × profondeur (profondeur conventionnelle 1 m, comme la
// section). Le v_n rend le sens physique voulu : une planche PERPENDICULAIRE prend
// tout le vent, une planche DANS L'AXE presque rien. La force pousse dans le sens
// du vent (composante normale), et s'auto-amortit (une poutre qui fuit le vent en
// prend moins).
//
// CALIBRAGE (repère : résistances des matériaux). ρ et Cd sont RÉELS, donc la force
// est à la même échelle que la gravité (non amplifiée) → cohérente. Avec ces
// valeurs : une brise (< 10 m/s) ne fait presque rien ; vers 18 m/s une poutre bois
// fine perpendiculaire (~5 m) atteint sa flexion de rupture ; une acier fine tient
// jusqu'à ~40-45 m/s. WIND_FORCE_GAIN règle globalement ce ressenti sans changer les
// rapports entre matériaux.
export const AIR_DENSITY = 1.225; // kg/m³
export const WIND_DRAG_CD = 2.0; // coefficient de traînée (plaque plane ≈ 1,2–2,0)
export const WIND_BEAM_DEPTH_M = 1.0; // profondeur hors-plan (convention de section)
export const WIND_FORCE_GAIN = 1.0; // multiplicateur global (réglage pédagogique)

// ── Charges mobiles (voitures, camions) ──
export const WATTS_PER_HORSEPOWER = 735.5;
export const MAX_VEHICLE_SPEED = 30; // m/s, garde-fou numérique
export const ROLLING_RESISTANCE = 0.15;

// ── Sol (terrain) ──
// Contact unilatéral : un nœud libre ne peut pas PÉNÉTRER le sol. À chaque pas,
// après intégration, un nœud passé sous la surface est remonté pile dessus.
//   GROUND_RESTITUTION      : part de la vitesse descendante renvoyée (0 = pas
//                             de rebond, il se pose et reste).
//   GROUND_TANGENTIAL_DAMPING : frottement au contact (le glissement horizontal
//                             est multiplié par ce facteur tant que le nœud
//                             touche le sol) → un morceau tombé finit par s'arrêter.
export const GROUND_RESTITUTION = 0;
export const GROUND_TANGENTIAL_DAMPING = 0.82;
// Léger RETRAIT (m) du bord du sol, UNIQUEMENT pour le contact (pas pour le
// dessin) : le contour de collision est rentré de ce delta vers l'intérieur du
// terrain. Sans lui, un point posé EXACTEMENT sur le bord d'une falaise (même
// colonne du maillage) coïncide avec le sol → il est vu « dans » le terrain et
// propulsé vers le haut (bug des poutres collées aux falaises verticales). Une
// poutre tracée pile sur l'arête se retrouve ainsi juste à l'extérieur du solide.
// Quelques centimètres suffisent : invisible (≈ 1 px), mais lève l'ambiguïté.
export const GROUND_COLLISION_INSET = 0.06;
