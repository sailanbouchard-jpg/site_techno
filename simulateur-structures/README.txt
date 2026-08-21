Simulateur de structures 2D
============================

Dossier autonome : aucune dépendance externe, aucun outil de build. Tout le
HTML/CSS/JS nécessaire est dans ce dossier.

Pour le lancer
--------------
Modules JavaScript natifs (import/export) : il faut servir le dossier via un
serveur local (le double-clic en file:// ne marche pas).

Les SAUVEGARDES passent par le serveur du projet (Flask + SQLite). Pour en
profiter, lancer le serveur depuis la RACINE du projet, puis ouvrir le simulateur
servi par lui :

  1. Depuis la racine du projet :   python server.py
  2. Ouvrir :   http://127.0.0.1:5000/simulateur-structures/
  3. Être connecté en élève (les sauvegardes sont rattachées au compte).

(build.py copie ce dossier tel quel dans site/, servi par le même serveur Flask
sur la même origine que les routes /api/sim-structures. Un simple
« python -m http.server » dans ce dossier suffit pour tester la PHYSIQUE seule,
mais sans les sauvegardes.)

Utilisation
-----------
On construit sur un MAILLAGE de points (grille de blueprint sur fond de ciel).
Le canvas occupe TOUT l'écran ; l'interface flotte dessus en panneaux sombres :
palette de matériaux + outils EN BAS, lecture/vue EN HAUT, inspecteur À DROITE
(n'apparaît que si un élément est sélectionné), BIBLIOTHÈQUE en tiroir à gauche.

1. PALETTE DE MATÉRIAUX (bas gauche) : groupée par FAMILLE (léger séparateur),
   les déclinaisons fin/large côte à côte ; la barre témoin montre la couleur et
   l'épaisseur relative. Cliquer sélectionne le matériau ET active le placement
   — plus de bouton "Poutre". Couleurs distinctes même pour un daltonien :
     - Bois (orange), Acier (bleu), Béton (gris) — fin ou large ;
     - ROUTE : tablier bitume sombre, résistance type béton armé. SEULES les
       poutres ROUTE portent les véhicules (plus de case "Route" à cocher) ;
     - CÂBLE : fil d'acier toronné (noir), NE TRAVAILLE QU'EN TRACTION. Comprimé,
       il part en vrille (flambement total, zéro résistance) sans jamais casser,
       comme une corde lâche. Sa "Tension initiale (%)" se règle dans le bandeau
       contextuel à la pose, puis dans l'inspecteur (> 0 = tendu, < 0 = mou).
   Clic GAUCHE sur une poutre existante (avec n'importe quel outil) ouvre ses
   propriétés à droite : poids en kg, et en SIMULATION son ALLONGEMENT en direct
   (+ = traction, − = compression).
2. Cliquer DEUX points du maillage pour les relier par une poutre (droite, on
   peut sauter des points ; interdit là où une autre poutre occupe déjà le chemin).
   Le maillage est à 50 cm (lignes fines 50 cm, moyennes 1 m, fortes 5 m) : on
   place donc les extrémités finement, mais une poutre fait TOUJOURS au moins 1 m
   (un tracé trop court apparaît en rouge et n'est pas posé).
   LONGUEUR MAX PAR TYPE (model/materials.js : maxLength) : bois 4 m, acier 6 m,
   béton 3 m, route 4 m, câble 12 m. Cliquer PLUS LOIN que la longueur max pose
   un élément de longueur max DANS LA DIRECTION du clic (l'aperçu montre le
   tronçon posable en plein, le reste du chemin en pointillé, avec la longueur
   en m) : cliquer plusieurs fois SANS bouger la souris construit une SÉRIE
   d'éléments vers le point visé.
   POSE À LA SUITE : une fois une poutre posée, on RESTE en pose en repartant du
   point d'arrivée — on enchaîne les poutres en cliquant les points l'un après
   l'autre. Échap (ou un autre outil / matériau) arrête la chaîne.
3. CLIC DROIT (glissé) n'importe où sur le canvas : DÉPLACE LA VUE (plus de menu
   contextuel, plus de bouton « Déplacer »). Fonctionne en édition comme en
   simulation. Pour SUPPRIMER un élément : le sélectionner (clic gauche) puis
   Suppr/⌫, ou utiliser le bouton « Supprimer… » de l'inspecteur.
4. "Sol" : dessiner le RELIEF en cliquant des points du maillage = le HAUT du
   terrain (tout ce qui est dessous est plein). "Nouvelle colline" valide la
   partie et en commence une autre (plusieurs massifs possibles, avec des vides).
   En simulation, les nœuds ne peuvent pas pénétrer le sol.
5. "Ancrer" : poser des POINTS ANCRÉS (appuis) sur le maillage. Une poutre reliée
   à un point ancré est ancrée à cette extrémité. Recliquer un point ancré encore
   VIDE le retire (s'il porte déjà des poutres : le sélectionner puis Suppr).
   Chaque point ancré a DEUX types de LIAISON AU SOL, à choisir dans l'inspecteur :
     - PIVOT (rotation libre) : fige la POSITION mais laisse tourner librement
       (aucun moment). Une poutre sur un seul pivot bascule — il faut deux appuis
       (ou un triangle) pour tenir. Symbole : un petit triangle (rotule).
     - ENCASTREMENT : fige la POSITION ET l'ORIENTATION → transmet un MOMENT
       (comportement de console : une poutre tient debout sur un seul encastrement,
       et peut rompre à sa base sous charge/vent). Symbole : un mur hachuré.
6. "Poids" : régler la masse, cliquer un point pour y suspendre une charge.
7. "Voiture"/"Camion" : cliquer une poutre cochée "Route" (inspecteur ou clic
   droit) pour y placer un véhicule (masse/puissance/vitesse réglables).
8. "Lancer la simulation" : tout part de ZÉRO et se met en charge en douceur (la
   gravité monte progressivement, la structure se stabilise SANS sursaut). Les
   poutres gardent la COULEUR DE LEUR MATÉRIAU et virent au ROUGE à l'approche de
   la rupture (un % d'effort s'affiche sur les plus chargées). Aucune poutre ne
   casse sur un PIC TRANSITOIRE de démarrage : la rupture ne s'active qu'une fois
   la structure stabilisée, donc seule une surcharge RÉELLE (>100 % à l'équilibre)
   rompt. "Réinitialiser" revient à l'état de conception.

Raccourcis clavier
------------------
  Échap        passe en mode Sélection (depuis n'importe quel outil).
  Suppr / ⌫    en Sélection, supprime l'élément sélectionné.
  Ctrl/Cmd + Z annule la DERNIÈRE suppression — mais seulement juste après :
               tout autre geste (clic sur le canvas, lecture…) l'annule.

BIBLIOTHÈQUE (bouton en haut à gauche, tiroir) : démonstrations — ★ Paysage
(pont sur ravin, relief + ciel), ★ Banc d'essai matériaux, porte-à-faux,
colonne, pont poutre — et "Mes structures". "Sauvegarder" enregistre la
structure CÔTÉ SERVEUR, rattachée à l'élève connecté (le sol est sauvegardé
avec). Réenregistrer sous le même nom écrase l'ancienne version. La sauvegarde
repart toujours de l'état de CONCEPTION (jamais l'état déformé d'un test),
pour rouvrir une structure propre.

Structure du projet
--------------------
  index.html          page hôte (canvas + barre d'outils + panneaux)
  style-config.css    couleurs/tailles/marges de l'interface
  style.css           mise en page
  js/main.js          point d'entrée (boucle d'animation)
  js/model/           données : maillage, poutres (subdivisées en segments),
                      nœuds, matériaux, SOL (terrain.js), démos, sauvegardes
  js/physics/         moteur : gravité, ressorts axiaux, FLEXION (ressorts
                      angulaires par différences finies), rupture, CONTACT SOL
                      (ground.js), véhicules. config.js = constantes réglables.
  js/render/          dessin sur le canvas : ciel+nuages (sky.js), quadrillage
                      (grid.js), sol (terrainRenderer.js), poutres (renderer.js).
                      styleConfig.js = tout le style visuel.
  js/ui/              palette de matériaux, outil Sol, éditeur (clic maillage),
                      menu du clic droit (contextMenu.js), inspecteur

Réglages physiques (js/physics/config.js)
-----------------------------------------
  AXIAL_STIFFNESS_DIVISOR / BENDING_STIFFNESS_DIVISOR : amplification (fixe) de
    la déformation pour bien la VOIR. La résistance (rupture) reste calculée sur
    la vraie contrainte, donc casser reste réaliste — seule la déformation est
    exagérée.
  VELOCITY_DAMPING_PER_STEP : vitesse de stabilisation (relaxation).
  RUPTURE_PERSIST_TIME : durée de surcharge avant rupture (filtre les à-coups).
  SEGMENT_TARGET_LENGTH / MIN/MAX_SEGMENTS_PER_BEAM : finesse de subdivision.

Note : quelques fichiers de l'ancienne version ne sont plus utilisés et peuvent
être supprimés (Force.js, ui/forceEditor.js, render/forceGraphRenderer.js,
model/Element.js, model/MobileLoad.js, model/testCases/).
