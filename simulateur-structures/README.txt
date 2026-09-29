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
  3. Être connecté en élève (la progression est rattachée au compte), et en
     ADMINISTRATEUR pour éditer les niveaux.

(build.py copie ce dossier tel quel dans site/, servi par le même serveur Flask
sur la même origine que les routes /api/sim-niveaux et /api/sim-catalogue. Un
simple « python -m http.server » dans ce dossier suffit pour tester la PHYSIQUE
seule, mais sans la progression ni l'édition des niveaux.)

Deux interfaces
---------------
La MÊME page sert deux publics (voir js/mode.js) :

  JOUEUR  http://…/simulateur-structures/        (par défaut)
     On enchaîne les niveaux. Barre des éléments, outil Sélection, Lancer /
     Arrêter l'essai, zoom, taux de travail, dialogue des niveaux. Rien d'autre : le
     joueur ne pose ni véhicule, ni appui, ni sol, ne règle ni le vent ni la
     taille de grille, et ne peut pas toucher aux pièces de l'énoncé
     (routes d'accès, appuis, véhicules) — ni les modifier, ni les supprimer.

  DEV     http://…/simulateur-structures/?dev
     L'atelier complet : tous les outils d'édition (Sol, Appui, Poids, Voiture,
     Camion), le vent, la taille de grille, l'inspecteur modifiable et
     l'ouverture d'un niveau avec sa solution.

Tout ce qui est réservé au dev porte l'attribut `data-dev` dans index.html ;
style.css le masque en mode joueur. Pour ajouter un bouton réservé au dev, il
suffit donc de lui poser cet attribut.

Administrateur : éditer les niveaux
-----------------------------------
Connecté en ADMINISTRATEUR sur le site (session admin de server.py), l'interface
débloque DEUX choses : tous les outils de fabrication (Sol, Appui, Poids,
Voiture, Camion, Bateau, vent, taille de grille) et, dans le dialogue
« Niveaux », un cadre « Édition du niveau ».

L'ÉNONCÉ SE DESSINE. Un niveau n'est rien d'autre que la SCÈNE enregistrée : le
relief et sa nature, les appuis (à poser, déplacer, retirer), les éléments de
base, les véhicules et l'endroit d'où ils s'élancent, les bateaux. On dessine
tout cela sur le plan avec les outils ordinaires, et « Enregistrer » fige
l'ensemble comme point de départ du niveau. Tout ce que la scène contient
devient intouchable pour le joueur (marqué `duNiveau`) et ne compte pas dans la
masse de son pont.

UN SEUL BOUTON ENREGISTRE : « Enregistrer » sauve la fiche ET la scène à l'écran,
d'un seul geste. Choisir une ligne de la liste met ce niveau en place derrière le
dialogue — la scène affichée est donc toujours celle de la fiche qu'on édite, et
rouvrir le dialogue sur le niveau en cours ne touche pas au travail commencé.
Attention : ce qui a été bâti PAR-DESSUS l'énoncé (une solution de référence,
par exemple) y entre aussi ; la ligne « Contenu » le signale.

RIEN N'EST EXIGÉ pour enregistrer, pas même une route ou un véhicule : un niveau
se construit en plusieurs fois et un brouillon vide est légitime. Ce qui lui
manque pour être jouable est simplement listé dans le message.

Le formulaire ne garde donc que ce qui ne se dessine PAS :

  Catégorie, Nom, Énoncé
  Matériaux autorisés      liste cochable : ce que le joueur a le droit de
                           poser. Les matériaux décochés disparaissent de sa
                           barre des éléments et de l'inspecteur — franchir un
                           vide en bois seul n'est pas le même problème qu'en
                           acier. Tout coché = aucune contrainte, et la fiche ne
                           porte alors rien. L'administrateur, lui, garde
                           TOUJOURS le catalogue entier : sinon il ne pourrait
                           plus dessiner la route d'un niveau qui l'interdit au
                           joueur. Le dialogue « Niveaux » annonce la contrainte
                           sous l'énoncé.
  Objectif 3 étoiles (kg)  masse maximale du pont pour la note maximale.
                           « Prendre la masse du pont actuel » recopie ici la
                           masse de ce qui est construit par-dessus l'énoncé :
                           on bâtit sa solution de référence, on clique.
  Objectif 2 / 1 étoile    les deux autres seuils, en kg. LAISSÉS VIDES, ils se
                           déduisent de l'objectif (×1,4 et ×2,1) — c'est le
                           comportement d'origine, et les fiches enregistrées
                           avant ce réglage n'en portent pas. Les renseigner
                           sert quand la règle proportionnelle tombe mal sur un
                           niveau : le champ vide montre en filigrane la valeur
                           qu'il prendrait, et la ligne « Barème appliqué »
                           affiche les trois seuils réellement en vigueur. Des
                           seuils en désordre (3 ★ > 2 ★, par exemple) rendent
                           une note inatteignable : c'est signalé après
                           l'enregistrement, sans le bloquer.
  Cadrage de la vue        zoom de départ et point central. Les trois champs
                           vides = cadrage automatique sur la zone de travail.
                           « Reprendre la vue actuelle » capture la vue affichée.

  Nouveau      crée un niveau à partir de la scène à l'écran
  Supprimer    retire le niveau du catalogue
  ▲ / ▼        déplace le niveau dans sa catégorie (l'ordre de la liste est
               celui du jeu, et décide du « niveau suivant »)
  Enregistrer  envoie le catalogue COMPLET au serveur ; il devient aussitôt
               celui de tout le monde.

Portée, point d'arrivée et cadrage automatique se LISENT dans la scène (emprise
des routes) : rien à saisir. La puissance d'un véhicule se déduit de sa masse et
de sa vitesse, sinon on publierait des niveaux où il ne démarre pas.

Un catalogue serveur SANS LE MOINDRE niveau (des catégories toutes vides) n'est
pas appliqué : ce n'est pas un catalogue, c'est un accident, et il laisserait le
jeu sans rien à jouer. Celui du code reprend alors la main. Supprimer le dernier
niveau fait donc réapparaître les niveaux livrés au prochain chargement.

Chaque bouton de l'éditeur DIT ce qu'il a fait, y compris quand il échoue (panne
interne comprise) : un bouton muet passerait pour un bouton mort.

Les niveaux livrés avec le code (levels.js::CATALOGUE_DEFAUT) restent décrits par
leurs paramètres — c'est plus lisible qu'une structure sérialisée. Le premier
enregistrement les convertit en scène. Tant que le serveur n'a pas de catalogue,
c'est celui du code qui sert : le simulateur marche donc sans serveur.

Bateaux et natures de sol
-------------------------
BATEAU (outil, administrateur) : cliquer sur l'eau pose un bateau. Ensuite il se
manipule comme tout le reste — l'outil SÉLECTION suffit : cliquer le choisit (ses
propriétés s'ouvrent : modèle et position), le glisser le déplace au demi-mètre,
Suppr l'efface, Ctrl+Z revient en arrière. L'outil Bateau, lui, en pose un de
plus à chaque clic sur l'eau.

Trois modèles de 5 m de large, qui ne diffèrent que par ce qui monte au-dessus
du pont, donc par le tirant d'air qu'ils exigent :
  bateau à moteur       une timonerie, PAS de mât            2,5 m
  voilier               un mât et UNE voile carrée           6 m
  voilier à deux voiles un mât et DEUX voiles superposées    8,5 m

Un bateau est complètement STATIQUE : il ne flotte pas, ne pèse rien. Il ne sert
qu'à matérialiser le GABARIT à laisser libre sous le pont. On ne peut ni poser
un point dedans, ni y déplacer un point, ni faire passer une poutre au travers.
La silhouette qui interdit est exactement celle qu'on voit — carène en demi-
ellipse, voiles évasées et creusées par le vent —, pas un rectangle englobant
(model/bateau.js). En poser plusieurs de tailles différentes dessine un gabarit
aussi compliqué qu'on veut.

SOL : chaque île de relief est de roche avec herbe (par défaut) ou de roche nue,
au choix dans les options de l'outil Sol. Cela ne change que le dessin.

TAILLE DE LA GRILLE (deux réglages − / + dans la barre d'outils, administrateur),
mémorisée avec le niveau. Dans les deux cas les positions MONDE de ce qui est
déjà posé ne bougent pas : seuls les indices de maillage glissent.
  Largeur   la grille s'étend des DEUX côtés à la fois (2 m par côté et par
            clic, de 20 m à 300 m) : la construction reste au centre.
  Hauteur   le PLAFOND monte ou descend (2 m par clic, de 12 m à 200 m). Le bas
            du monde ne bouge pas — le fond du ravin, l'eau et les altitudes de
            la règle restent ce qu'ils étaient, et ce qu'on gagne est du CIEL :
            la place d'un portique, d'une arche, d'un pylône. Abaisser est
            refusé si quelque chose occupe les lignes qu'on retirerait.

ON NE S'ÉLOIGNE PAS DE LA GRILLE, en haut comme en bas. La vue peut déborder de
10 % de la hauteur de grille de chaque côté — juste assez d'air pour que le
maillage ne colle pas aux bords —, et pas plus : au-delà il n'y a que du vide,
sans repère ni rien à y construire. Le zoom arrière s'arrête donc là où cette
bande (grille + 20 %) remplit la vue, et la vue se recale si on la pousse trop
haut ou trop bas. Le plancher de zoom suit la HAUTEUR de la grille : l'agrandir,
c'est s'autoriser à dézoomer davantage. La règle vaut pour le joueur comme pour
l'administrateur, et pour tous les chemins qui bougent la vue : molette,
boutons, glissement, cadrage d'un niveau (ui/viewControls.js::clampView, appelée
à chaque image).


Véhicules et point d'arrivée
-----------------------------
TROIS MODÈLES, du plus léger au plus lourd — et du plus rapide au plus lent.
Chacun a DEUX masses, et c'est voulu :

                  annoncée   au calcul   vitesse
  voiture           1,5 t      1,5 t     2,0 m/s
  camionnette       3,5 t      2,5 t     1,9 m/s
  camion             15 t        8 t     1,7 m/s

La masse ANNONCÉE est celle qu'on écrit partout où un élève la lit (liste des
niveaux, inspecteur) : c'est l'ordre de grandeur réel d'un tel véhicule, et
c'est ce qu'il doit retenir. La masse AU CALCUL est ce que la structure encaisse
vraiment ; elle est plus basse parce qu'un tablier de jeu n'a ni la largeur ni
le nombre de poutres d'un ouvrage réel — à 15 t pour de bon, presque aucun pont
d'élève ne passait et le jeu n'apprenait plus rien. Régler la masse annoncée
dans l'inspecteur ajuste l'autre du même rapport (model/vehiclePresets.js).

La PUISSANCE ne se règle pas : elle se déduit de la masse et de la vitesse visée
(model/vehiclePresets.js). Le modèle de traction donne une vitesse d'équilibre
v = P / (µ·m·g) : puissance et vitesse ne sont donc pas indépendantes. Une
puissance choisie à la main « parce qu'un camion fait 400 ch » donnait un camion
de 15 t bloqué à 0,5 m/s, très loin de sa vitesse annoncée. Changer la masse ou
la vitesse d'un véhicule dans l'inspecteur remotorise le véhicule tout seul.

ARRIVÉE (outil, administrateur) : cliquer un point de la ROUTE y plante le
drapeau à damier que TOUS les véhicules doivent atteindre pour valider le niveau
(recliquer le retire ; un seul drapeau par niveau). Sans drapeau, l'arrivée est
le bout de la route la plus à droite.

Comment sait-on où va un véhicule ? Un véhicule va TOUJOURS vers la droite et ne
rebrousse jamais chemin : à chaque nœud, il prend la route connectée qui repart
le plus à droite. Cela suffit à le guider dans n'importe quel tracé, sans rien
demander au joueur. Au drapeau, il s'arrête : c'est un terminus, même s'il reste
de la route derrière. Et s'il atteint un bout de route SANS suite, il n'y a plus
rien sous ses roues : il TOMBE, et le niveau est perdu. Une route qui s'arrête
dans le vide n'est pas un passage.

Utilisation
-----------Utilisation
-----------
L'interface est celle d'un logiciel d'ingénierie de bureau, de haut en bas :
  - barre de MENUS : Fichier (niveaux), Édition (annuler, supprimer), Affichage
    (zoom, taux de travail), Essai (lancer, pause, recommencer, arrêter, ralenti), ? ;
  - barre d'outils STANDARD : Niveaux, Lancer l'essai (le seul bouton plein),
    annuler / supprimer, zoom, taux de travail ; à droite, les afficheurs du
    projet : masse du pont, objectif (masse à ne pas dépasser pour 3 étoiles),
    état de l'essai ;
    Le bouton « Taux » parcourt TROIS profils d'affichage en boucle (gros, petit,
    masqué — voir render/styleConfig.js::PROFILS_TAUX) : les grosses bulles se
    lisent de loin sur un tablier simple, les petites évitent de se chevaucher
    sur un treillis serré, et les masquer laisse voir la déformation seule. Le
    bouton et l'entrée de menu affichent le profil en cours ;
  - barre des ÉLÉMENTS : outil Sélection, un bouton par type de poutre (sa
    vignette est dessinée comme la vraie poutre), et à droite les
    caractéristiques du type choisi (épaisseur, masse par mètre, longueur max) ou
    les réglages de l'outil d'atelier en cours ;
  - la VUE : la scène, avec en mode Conception une grille et des règles graduées
    (x en m, hauteur au-dessus du bas de la grille — ce bas ne bouge JAMAIS, même
    quand on change la taille de la grille, si bien qu'une altitude lue reste
    valable) ; à droite les fenêtres
    « Propriétés » (élément sélectionné) et « Rapport d'essai » ; pendant l'essai,
    la palette flottante « Essai de charge » (recommencer, pause, vitesse, temps),
    déplaçable par sa barre de titre ;
  - la BARRE D'ÉTAT : consigne de l'outil en cours, coordonnées du point visé,
    zoom, temps simulé.
Menus, boutons et raccourcis partagent les mêmes COMMANDES (js/ui/menus.js).

La scène est une vue d'élévation réaliste : ciel atmosphérique et nuages,
montagnes en parallaxe, rivière au fond de la gorge, sol en coupe (roche claire,
couches géologiques, herbe), poutres texturées selon leur matériau, goussets
d'assemblage, appareils d'appui en béton et acier, véhicules dessinés à
l'échelle. Tout est procédural : aucune image chargée. En conception, un petit
carré marque chaque nœud (creux : nœud libre, plein : appui) ; la grille reste
à peine visible.

À l'ouverture d'un niveau, la vue CADRE SA ZONE DE TRAVAIL (le vide et ses deux
routes d'accès) : cette zone occupe toujours la même part de l'écran, donc un
petit pont arrive zoomé et un grand viaduc en vue large (cadre défini dans
levels.js, part de l'écran dans styleConfig.js). Affichage > Cadrer la zone de
travail (touche 0) y revient.

1. BARRE DES ÉLÉMENTS : un bouton par type, les familles côte à côte ; la
   vignette montre la matière et l'épaisseur relative. Cliquer sélectionne le type
   ET active la pose — pas de bouton "Poutre". Matières distinctes même pour un
   daltonien :
     - Bois (fil du bois, brun clair), Acier (profilé bleu-gris), Béton (gris
       clair grenu) — fin ou large ;
     - ROUTE : tablier (dalle claire sous un enrobé sombre),
       résistance type béton armé. SEULES les poutres ROUTE portent les véhicules ;
     - CÂBLE : fil d'acier toronné (noir), NE TRAVAILLE QU'EN TRACTION. Comprimé,
       il part en vrille (flambement total, zéro résistance) sans jamais casser,
       comme une corde lâche. Sa "Tension initiale (%)" se règle à droite de la
       barre des éléments à la pose (atelier), puis dans la fenêtre Propriétés
       (> 0 = tendu, < 0 = mou).
   Clic GAUCHE sur une poutre existante (avec n'importe quel outil) ouvre ses
   propriétés à droite : type, longueur, masse, matériau, et pendant l'ESSAI son
   ALLONGEMENT en direct (+ = traction, − = compression) et son taux de travail.
2. Cliquer DEUX points du maillage pour les relier par une poutre (droite, on
   peut sauter des points ; interdit là où une autre poutre occupe déjà le chemin).
   Le maillage est à 50 cm (lignes fines 50 cm, moyennes 1 m, fortes 5 m) : on
   place donc les extrémités finement, mais une poutre fait TOUJOURS au moins 1 m
   (un tracé trop court apparaît en rouge et n'est pas posé).
   LONGUEUR MAX PAR TYPE (model/materials.js : maxLength) : bois 8 m (fin) et
   10 m (large), acier 10 m, béton 6 m (fin) et 10 m (large), route 4 m, câble
   40 m. Ce n'est pas une limite de résistance mais de FABRICATION et de
   TRANSPORT : la longueur d'un élément livrable d'une pièce sur un chantier
   (un profilé laminé tient sur un semi-remorque, un câble se déroule d'une
   bobine). Cliquer PLUS LOIN que la longueur max pose
   un élément de longueur max DANS LA DIRECTION du clic (l'aperçu montre le
   tronçon posable en plein, le reste du chemin en pointillé, avec la longueur
   en m) : cliquer plusieurs fois SANS bouger la souris construit une SÉRIE
   d'éléments vers le point visé.
   POSE À LA SUITE : une fois une poutre posée, on RESTE en pose en repartant du
   point d'arrivée — on enchaîne les poutres en cliquant les points l'un après
   l'autre. Échap (ou un autre outil / matériau) arrête la chaîne.
3. CLIC DROIT (glissé) n'importe où sur la vue : DÉPLACE LA VUE ; la MOLETTE
   zoome autour du pointeur. Fonctionne en conception comme pendant l'essai. Pour
   SUPPRIMER un élément : le sélectionner (clic gauche) puis Suppr/⌫, le bouton
   de la barre d'outils, ou le bouton « Supprimer… » de la fenêtre Propriétés.
4. "Sol" : dessiner le RELIEF en cliquant des points du maillage = le HAUT du
   terrain (tout ce qui est dessous est plein). "Nouvelle colline" valide la
   partie et en commence une autre (plusieurs massifs possibles, avec des vides).
   En simulation, les nœuds ne peuvent pas pénétrer le sol : un nœud qui y entre
   en ressort par la face la PLUS PROCHE (le dessus, ou une paroi de falaise), et
   le frottement le retient — une béquille peut s'appuyer contre le flanc d'un
   ravin. On ne pose aucun nœud à l'intérieur de la roche (le point n'accroche
   pas) ; sur le dessus ou contre une paroi, c'est permis.
5. "Ancrer" : poser des POINTS ANCRÉS (appuis) sur le maillage. Une poutre reliée
   à un point ancré est ancrée à cette extrémité. Recliquer un point ancré encore
   VIDE le retire (s'il porte déjà des poutres : le sélectionner puis Suppr).
   Chaque point ancré a DEUX types de LIAISON AU SOL, à choisir dans l'inspecteur :
     - PIVOT (rotation libre) : fige la POSITION mais laisse tourner librement
       (aucun moment). Une poutre sur un seul pivot bascule — il faut deux appuis
       (ou un triangle) pour tenir. Dessin : pile en béton et sabot d'acier.
     - ENCASTREMENT : fige la POSITION ET l'ORIENTATION → transmet un MOMENT
       (comportement de console : une poutre tient debout sur un seul encastrement,
       et peut rompre à sa base sous charge/vent). Dessin : massif en béton qui
       enrobe l'extrémité de la poutre.
   Un appui posé dans le vide (loin du sol) garde le symbole normalisé (triangle
   ou mur hachuré).
6. "Poids" : régler la masse, cliquer un point pour y suspendre une charge.
7. "Voiture"/"Camionnette"/"Camion" : cliquer une poutre de route pour y placer un véhicule
   (masse/puissance/vitesse réglables).
8. "Lancer l'essai" : tout part de ZÉRO et se met en charge en douceur (la
   gravité monte progressivement, la structure se stabilise SANS sursaut). Les
   poutres gardent la COULEUR DE LEUR MATÉRIAU et virent au ROUGE à l'approche de
   la rupture (un % d'effort s'affiche sur les plus chargées). Aucune poutre ne
   casse sur un PIC TRANSITOIRE de démarrage : la rupture ne s'active qu'une fois
   la structure stabilisée, donc seule une surcharge RÉELLE (>100 % à l'équilibre)
   rompt. La grille et les règles disparaissent : on regarde l'ouvrage nu.
   "Arrêter l'essai" revient à l'état de conception.

Raccourcis clavier (aussi dans le menu ? > Souris et clavier, touche F1)
------------------
  Échap        interrompt la pose, puis passe en mode Sélection.
  Suppr / ⌫    supprime la sélection.
  Ctrl/Cmd + Z annule la DERNIÈRE modification (suppression ou déplacement de
               point) — mais seulement juste après : tout autre geste (clic sur
               la vue, essai…) l'annule.
  Espace       lance l'essai, puis pause / reprise.
  + / − / 0    zoom avant, zoom arrière, cadrer la zone de travail.
  Ctrl + O     dialogue des niveaux.

PROMENER UN POINT (outil Choisir, en édition) : cliquer-glisser SUR un point le
déplace sur le maillage ; toutes les poutres qui s'y rattachent s'allongent ou
se raccourcissent avec lui et sont reconstruites (leur nombre de sous-éléments
dépend de leur longueur). Le déplacement n'est accepté que s'il laisse chaque
poutre valide : longueur maximale de son type, 1 m minimum, pas de
recouvrement, point d'arrivée libre. Sinon le point reste à sa dernière
position tenable et on peut continuer à chercher. Voir Structure.js::moveJoint.
Un point de l'énoncé d'un niveau ne se déplace pas (mode joueur).

NIVEAUX, VALIDATION ET ÉTOILES
------------------------------
Le bouton « Niveaux » (ou Fichier > Niveaux…) ouvre le dialogue des niveaux :
une liste en colonnes (niveau, portée, véhicules, note) regroupée par catégorie
— Tutoriel, Moyen, Difficile, Impossible. L'énoncé du niveau choisi s'affiche
dessous ; double-clic ou « Ouvrir » pour le charger.

Un niveau FIXE tout l'énoncé : le relief, les appuis, les routes d'accès, les
véhicules (masse et vitesse imposées, aucun tirage aléatoire) et les bateaux.
Pas de vent : charger un niveau le coupe.

RÈGLE UNIQUE — le pont est validé si TOUS les véhicules atteignent le POINT
D'ARRIVÉE sans qu'une seule poutre ne casse. Un véhicule qui tombe (la route
s'arrête dans le vide), une poutre qui rompt, ou un véhicule bloqué plus de
2 s : c'est perdu.

Le verdict N'INTERROMPT RIEN : il s'affiche dans la fenêtre « Rapport d'essai »
à droite (qui ne masque pas la scène) et la simulation continue tant qu'on ne
l'arrête pas — on regarde le pont finir de s'écrouler aussi longtemps qu'on veut.

DEUX chemins ramènent à la conception, et tous deux referment le rapport :
« Arrêter l'essai » (bouton principal, ou menu Essai) et « Modifier le pont »
(dans le rapport lui-même). Les deux passent par arreterEssai() : on revient à
SA construction, sans recharger le niveau — un échec n'efface jamais le travail.
Le rapport n'est qu'un AFFICHAGE de l'essai en cours : plus d'essai, plus de
rapport. Après un échec, « Modifier le pont » est d'ailleurs la seule sortie
proposée.

NOTE — une fois le pont validé, tout se joue sur sa MASSE (ce que le joueur a
posé ; l'énoncé ne compte pas). Le barème se déduit de l'OBJECTIF 3 ÉTOILES du
niveau, une masse en kg fixée par l'administrateur : ≤ 1× l'objectif → 3 étoiles,
≤ 1,4× → 2, ≤ 2,1× → 1, au-delà 0. Ces deux derniers seuils ne sont que des
valeurs PAR DÉFAUT : un niveau peut les fixer lui-même en kilogrammes (champs
« Objectif 2 / 1 étoile » de l'éditeur). Choisir le bon matériau est donc l'essentiel
du jeu : sur 8 m un treillis en bois tient et pèse cinq fois moins qu'en acier
large ; sur 16 m seul l'acier large tient. La masse courante et le seuil
« 3 étoiles » sont affichés à droite de la barre d'outils pendant la construction.

CE QU'UN ÉLÈVE GARDE — étoiles, meilleure masse, et SON PONT
-----------------------------------------------------------
Tout est enregistré CÔTÉ SERVEUR par élève connecté (routes /api/sim-niveaux,
table sim_niveaux ; le pont dans la colonne pont_json). Sans connexion ou sans
serveur, on joue quand même : la progression reste en mémoire pour la séance.

RÈGLE UNIQUE : seul un pont plus LÉGER remplace le précédent. Rejouer moins bien
ne fait donc perdre ni ses étoiles ni son pont — c'est ce qui rend « Faire un
nouveau pont » sans danger.

  À LA RÉUSSITE (quel que soit le nombre d'étoiles, zéro compris), le pont est
    enregistré : c'est l'instantané pris au LANCEMENT de l'essai, pas la
    structure déformée de la fin. Le rapport d'essai dit ce qu'il advient de la
    sauvegarde — « pont enregistré », « nouveau record », ou « ton meilleur pont
    reste celui de … ». Sans cette phrase, l'élève ne peut pas décider s'il doit
    recommencer.
  DANS LA LISTE, la colonne « Ton pont » porte une COCHE verte et la masse du
    meilleur essai. La coche est indispensable : un niveau fini avec 0 étoile
    n'allume aucune étoile, et sans elle il passerait pour jamais réussi.
  OUVRIR un niveau déjà validé recharge SON pont, pas l'énoncé nu. La ligne sous
    l'énoncé le dit avant de cliquer, et le bouton « Nouveau pont » (dialogue,
    barre d'outils, menu Fichier) repart d'une page blanche. Ce bouton demande
    confirmation dès qu'il y a quelque chose à jeter à l'écran.
  SI L'ADMINISTRATEUR MODIFIE LE NIVEAU entre-temps, le pont ne correspond plus
    à l'énoncé : le rouvrir donnerait une scène incohérente (route déplacée,
    appui disparu, matériau devenu interdit). Une empreinte de l'énoncé est donc
    enregistrée avec le pont (levels.js::signatureEnonce) ; si elle ne
    correspond plus, l'élève garde son score mais repart d'une base neuve, et le
    dialogue le lui dit. Le premier essai réussi suivant y dépose un pont à jour.
    Même chose pour les réussites d'AVANT cette fonctionnalité, qui n'ont pas de
    pont : le score est intact, le prochain essai réussi en dépose un.

L'administrateur, lui, ne rouvre jamais un pont d'élève : il édite les niveaux et
part toujours de l'énoncé.

Les niveaux édités par l'administrateur sont une scène et un objectif en kg.
Voir js/model/levels.js ; tout ce que la scène de départ pose est `duNiveau`.

Ce que coûte une grosse scène (le solveur adaptatif)
-----------------------------------------------------
Le moteur avance par petits pas de temps. Un pas trop long et le calcul explose :
la limite vaut 2/ω, où ω est la pulsation propre la plus haute de la scène —
racine de (raideur / masse) de l'élément le plus « dur ». Ce plafond ne dépend
PAS du nombre de poutres : il est fixé par le matériau le plus raide POSÉ, et en
pratique par la FLEXION d'une poutre épaisse (la raideur de flexion croît comme
le cube de l'épaisseur). Le pas était figé à 0,5 ms, c'est-à-dire réglé pour le
pire cas imaginable : 2 000 pas à calculer pour chaque seconde de simulation,
même quand la scène ne le demandait pas. Passé une centaine de poutres, une
machine de collège ne suivait plus — la simulation partait au ralenti.

js/physics/solveur.js règle cela pour la scène RÉELLE, une fois par changement
de topologie (donc aussi après chaque rupture). Deux leviers :

  1. PAS DE TEMPS ADAPTATIF — toujours actif, aucun compromis. On mesure ω sur la
     scène et on prend 0,6 × 2/ω. Un pont tout en bois, beaucoup plus souple que
     le béton, tourne d'emblée 2 à 5 fois moins cher. La physique ne change pas :
     on relaxe vers un ÉQUILIBRE, dont la position ne dépend pas du pas.

  2. MISE À L'ÉCHELLE DES MASSES — au-delà de SEUIL_SCENE_LOURDE sous-éléments
     (~60 poutres). On ajoute de l'INERTIE, et rien que de l'inertie, aux quelques
     nœuds qui tirent ω vers le haut, pour ramener leur pulsation à la cible et
     pouvoir allonger le pas. C'est la technique classique des codes de calcul
     explicites, et elle est légitime ici pour une raison simple : un ÉQUILIBRE
     STATIQUE ne dépend d'AUCUNE masse d'inertie. Flèches, efforts, taux de
     travail, ruptures, verdict : identiques. Le POIDS, lui, reste calculé sur la
     vraie masse — la structure porte exactement ce qu'elle portait.
     Seul le transitoire de mise en charge est un peu plus mou pour ces nœuds, et
     un débris détaché met un peu plus longtemps à atteindre sa vitesse de chute
     (plafonnée de toute façon). FACTEUR_INERTIE_MAX borne l'effet.

Hors scène lourde, le second levier ne sert qu'à tenir un PLANCHER : le pas ne
descend jamais sous les 0,5 ms d'avant. Sans cela il s'effondrerait juste après
une rupture, les débris étant des tronçons courts donc très raides pour leur
masse — exactement au pire moment.

Mesuré sur un viaduc à treillis acier avec piles béton et une voiture dessus
(millisecondes de calcul par seconde simulée, même machine, même page) :

                   avant    après   pas de temps        flèche
   39 poutres      448 ms   200 ms  0,5 → 1,05 ms   173,3 → 173,3 mm
   75 poutres      709 ms   157 ms  0,5 → 2,55 ms   173,1 → 171,2 mm
  147 poutres    1 410 ms   274 ms  0,5 → 2,55 ms   172,8 → 171,3 mm

La traversée complète d'un véhicule dure exactement le même temps (12,68 s dans
les deux cas), et un pont trop faible casse au même instant, à la même poutre.

VITESSE D'AFFICHAGE (curseur « Vitesse » de la palette d'essai, ou menu Essai) :
de ×0,1 à ×2, réglable en direct. Elle ne change RIEN à la physique — le pas de
temps reste celui que la scène impose (voir plus haut) : on injecte seulement
plus ou moins de temps d'horloge par image. En ralenti on regarde de près une
rupture ; en accéléré ×2 on abrège l'attente d'une longue traversée. Si la
machine ne tient pas le ×2, le budget de calcul par image abandonne le retard :
on obtient moins que ×2, jamais un calcul dégradé.

CE QUE LA BARRE D'ÉTAT EN DIT, pendant un essai seulement :
  « Calcul allégé » — la scène est assez grosse pour que le levier 2 soit actif.
  « Ralenti ×0,4 » — la machine ne tient pas le temps réel malgré tout. Le budget
    de calcul par image (PHYSICS_BUDGET_MS) est volontairement borné : plutôt que
    de figer l'écran, la simulation prend du retard sur l'horloge. Le pont se
    comporte pareil, il met juste plus longtemps à le montrer.

Structure du projet
--------------------
  index.html          page hôte (menus, barres d'outils, vue, fenêtres, barre d'état)
  style-config.css    couleurs/tailles/marges de l'interface
  style.css           mise en page
  js/main.js          point d'entrée (boucle d'animation)
  js/mode.js          interface joueur ou dev (?dev), et mode administrateur
  js/model/           données : maillage, poutres (subdivisées en segments),
                      nœuds, matériaux, SOL (terrain.js), NIVEAUX (levels.js),
                      arbitrage d'un essai (essai.js), catalogue de niveaux
                      (catalogue.js), progression, sauvegardes
  js/physics/         moteur : gravité, ressorts axiaux, FLEXION (ressorts
                      angulaires, gradients analytiques), rupture, CONTACT SOL
                      (ground.js), véhicules, RÉGLAGE AUTOMATIQUE du pas de temps
                      et des masses d'inertie (solveur.js — voir plus haut).
                      config.js = constantes réglables.
  js/render/          dessin sur le canvas : décor (environment.js : ciel,
                      nuages, montagnes, rivière), textures procédurales
                      (textures.js), grille de conception (grid.js), règles
                      (rulers.js), sol (terrainRenderer.js), poutres, goussets et
                      appuis (memberRenderer.js), véhicules, annotations
                      (sélection, cote, taux de travail), orchestration
                      (renderer.js). styleConfig.js = tout le style visuel.
  js/ui/              commandes et menus (menus.js), barres d'outils (toolbar.js),
                      barre des éléments, éditeur (clic maillage), vue (zoom),
                      fenêtre Propriétés, niveaux et rapport (levelHud.js),
                      barre d'état, aide

Réglages physiques (js/physics/config.js)
-----------------------------------------
  AXIAL_STIFFNESS_DIVISOR / BENDING_STIFFNESS_DIVISOR : amplification (fixe) de
    la déformation pour bien la VOIR. La résistance (rupture) reste calculée sur
    la vraie contrainte, donc casser reste réaliste — seule la déformation est
    exagérée.
  VELOCITY_DAMPING_PER_STEP : vitesse de stabilisation (relaxation). Réglé pour
    PHYSICS_DT_REF, puis converti en taux par seconde — le pas n'est plus fixe.
  RUPTURE_PERSIST_TIME : durée de surcharge avant rupture (filtre les à-coups).
  SEGMENT_TARGET_LENGTH / MIN/MAX_SEGMENTS_PER_BEAM : finesse de subdivision.
  MARGE_STABILITE, PHYSICS_DT_MIN/MAX : bornes du pas de temps adaptatif.
  SEUIL_SCENE_LOURDE, OMEGA_CIBLE_ALLEGE, FACTEUR_INERTIE_MAX : quand la scène
    est déclarée lourde, et jusqu'où on l'allège (voir la section précédente).
  PHYSICS_BUDGET_MS : temps de calcul accordé à la physique par image.

Note : quelques fichiers de l'ancienne version ne sont plus utilisés et peuvent
être supprimés (Force.js, ui/forceEditor.js, render/forceGraphRenderer.js,
model/Element.js, model/MobileLoad.js, model/testCases/).
