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

// ── Pas de temps ADAPTATIF ───────────────────────────────────────────────────
// L'intégration explicite n'est stable que si le pas reste sous 2/ω, où ω est la
// pulsation propre la plus haute de la scène (√(raideur/masse) du nœud le plus
// « dur »). Ce plafond ne dépend PAS du nombre de poutres : il est fixé par le
// matériau le plus raide POSÉ. Un pas figé à 0,5 ms devait donc convenir au pire
// cas imaginable — et faisait payer à TOUT LE MONDE le prix du béton large.
// Le pas est désormais calculé pour la scène réelle (physics/solveur.js) :
// une scène tout en bois tourne 5× moins cher sans rien changer à sa physique.
// PHYSICS_DT_REF n'est plus le pas de calcul : c'est le pas de RÉFÉRENCE auquel
// les amortissements ci-dessous ont été réglés, et qui sert à les convertir en
// taux par seconde (seule façon d'avoir le même comportement à pas variable).
export const PHYSICS_DT_REF = 0.0005; // 0,5 ms
export const PHYSICS_DT_MIN = 0.0002; // plancher de sécurité
export const PHYSICS_DT_MAX = 0.004; // plafond : au-delà, le mouvement saccade
// Fraction de la limite théorique 2/ω qu'on s'autorise. Mesuré : la divergence
// réelle arrive vers 0,85 × 2/ω (le couplage entre nœuds est un peu plus sévère
// que l'estimation nœud par nœud) — 0,6 laisse donc une marge confortable.
export const MARGE_STABILITE = 0.6;

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
// Réglé en TEMPS simulé (et non en nombre de pas) : le pas étant adaptatif, un
// compte de pas ne voudrait plus rien dire. En scène allégée on espace encore —
// 12 ms restent 7× plus fins que les 80 ms de surcharge exigés pour rompre.
export const EFFORT_SCAN_PERIOD = 0.004; // s entre deux scans
export const EFFORT_SCAN_PERIOD_ALLEGE = 0.012; // s, scène lourde

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
// secondes. Réglé pour PHYSICS_DT_REF, puis converti en TAUX par seconde
// (voir plus bas) : le même amortissement réel quel que soit le pas choisi.
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

// Les deux amortissements ci-dessus, exprimés en s⁻¹ : le moteur applique
// exp(−taux · dt) à chaque pas. À dt = PHYSICS_DT_REF c'est EXACTEMENT le
// facteur réglé plus haut ; à tout autre pas, c'est le même amortissement par
// seconde de simulation. Ne rien régler ici : régler les facteurs au-dessus.
export const TAUX_AMORTISSEMENT = -Math.log(VELOCITY_DAMPING_PER_STEP) / PHYSICS_DT_REF;
export const TAUX_AMORTISSEMENT_STABILISATION = -Math.log(SETTLE_VELOCITY_DAMPING) / PHYSICS_DT_REF;

// ── Allègement des GROSSES scènes ────────────────────────────────────────────
// Au-delà de ce nombre de sous-éléments, la scène est déclarée LOURDE et le
// solveur s'autorise la MISE À L'ÉCHELLE DES MASSES (physics/solveur.js) : on
// ajoute de l'inertie — et RIEN QUE de l'inertie, jamais du poids — aux nœuds
// les plus raides pour abaisser leur pulsation propre et pouvoir allonger le
// pas. L'ÉQUILIBRE n'en dépend pas (une position d'équilibre ne dépend d'aucune
// masse d'inertie) : les déformations, les efforts, les % et les ruptures sont
// les mêmes. Seul le TRANSITOIRE est ralenti pour ces nœuds — sans conséquence
// ici, où la mise en charge est déjà une relaxation fortement amortie.
// Le seuil correspond à peu près au pont de la capture qui faisait ramer.
export const SEUIL_SCENE_LOURDE = 250; // sous-éléments
// Pulsation visée en scène lourde (rad/s) : au-delà, le nœud est alourdi.
// 470 rad/s → un pas de ~2,5 ms, soit 5× moins de pas qu'avant.
export const OMEGA_CIBLE_ALLEGE = 470;
// Hors scène lourde, on n'alourdit rien SAUF pour tenir un PLANCHER : le pas ne
// doit jamais tomber sous celui d'avant (PHYSICS_DT_REF), sinon le calcul
// coûterait plus cher qu'avant le solveur adaptatif. Le cas se produit APRÈS une
// rupture : les débris sont des tronçons courts, donc légers et très raides
// (ω ∝ 1/longueur²) — exactement le moment où la machine a le moins de marge.
export const OMEGA_CIBLE_NORMALE = (2 * MARGE_STABILITE) / PHYSICS_DT_REF;
// Garde-fou : jamais plus de ce facteur d'inertie sur un nœud. Au-delà, un débris
// qui se détache tomberait visiblement au ralenti (son poids est vrai, son
// inertie ne l'est pas) — on préfère alors raccourcir le pas.
export const FACTEUR_INERTIE_MAX = 6;

// ── Amplification de la déformation (diviseurs de raideur) ──
// Ces deux diviseurs ne sont PAS indépendants : c'est leur RAPPORT qui décide du
// chemin par lequel une structure porte sa charge. Divisé par 500, l'axial était
// 500× plus mou que la flexion — autrement dit un treillis, un arc ou un
// haubanage (qui travaillent en TRACTION/COMPRESSION) devenaient 500× moins
// efficaces qu'une simple poutre fléchie. Résultat mesuré : un treillis de 28 m
// ne soulageait pas du tout son tablier (la route restait à 128 % et cassait
// sous son seul poids, l'acier plafonnant à 46 %) — le treillis ne servait à
// rien. Avec 50, le treillis reprend l'effort : même tablier à 41 %, et l'acier
// redevient le matériau dimensionnant.
//
// POURQUOI 50 ET PAS MOINS. Ce diviseur règle aussi ce qu'on VOIT : plus l'axial
// est raide, moins l'ouvrage bouge, et un pont qui ne bouge pas n'apprend rien.
// À 20, un treillis de 28 m ne fléchissait que de 10 cm sous un camion — trois
// pixels à l'écran, autant dire rien. À 50 il en prend 22 à 35, bien lisibles,
// et le jeu redevient exigeant : en acier fin, ce treillis CASSE sous un camion
// de 15 t ; il faut élargir les membrures (il passe alors tout juste, à 100 %)
// ou raccourcir les travées du tablier (panneaux de 2 m : 80 %). Rien ne passe
// confortablement, c'est voulu.
// POURQUOI PAS PLUS. À 100, le remède redevient le mal : le treillis de 28 m
// s'écroule à nouveau sous son seul poids (101 %), comme avec l'ancien 500.
//
// Ce réglage ne touche PAS la portée de ruine d'un tablier seul, fixée par
// l'équilibre (M = pL²/8) et non par la raideur : 12 m tiennent (69 %), 16 m
// cassent (128 %), comme avant. Il coûte un pas de temps plus court (environ
// 2× plus de pas qu'avec 500), largement dans le budget par image.
export const AXIAL_STIFFNESS_DIVISOR = 50;
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
// après intégration, un nœud entré dans la roche en ressort par la face la plus
// proche — le dessus, ou une paroi de falaise (voir physics/ground.js).
//   GROUND_RESTITUTION      : part de la vitesse entrante renvoyée (0 = pas de
//                             rebond, il se pose et reste).
//   GROUND_TANGENTIAL_DAMPING : frottement au contact (la vitesse le long de la
//                             face est multipliée par ce facteur tant que le
//                             nœud touche le sol) → un morceau tombé finit par
//                             s'arrêter, un pied appuyé contre une paroi y tient.
export const GROUND_RESTITUTION = 0;
export const GROUND_TANGENTIAL_DAMPING = 0.82;
