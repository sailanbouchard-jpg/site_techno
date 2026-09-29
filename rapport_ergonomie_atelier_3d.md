# Atelier 3D — critique d'usage (2026-09-17)

Ce rapport sert de feuille de route pour les corrections. Il s'appuie sur une prise en main réelle dans le navigateur, sur un écran d'environ 970 px de large, la navbar du site ouverte. J'y ai construit quatre objets à imprimer :

- **Porte-clés gravé :** plaque 50 × 15 × 4, trou pour l'anneau, prénom « LÉO » gravé.
- **Pot à crayons :** cylindre de rayon 35, creusé par un cylindre de rayon 32.
- **Support de téléphone :** un profil en L dessiné en esquisse, qui n'a pas pu être extrudé (voir 4.2), puis une extrusion d'essai à partir d'un simple rectangle au sol.
- **Répétitions :** une symétrie et une répétition en cercle.

Le fil conducteur : un élève de 12 ans doit toujours savoir **ce qu'il est en train de faire**, **ce que le logiciel attend de lui** et **comment revenir en arrière**.

---

## 1. Les cinq problèmes de fond

1. **Les opérations s'appliquent tout de suite, avec des réglages par défaut invisibles.**
   - Symétrie, répétitions, extrusion et révolution créent le résultat dès le clic.
   - L'élève découvre ensuite, dans l'inspecteur, des réglages qu'il n'a pas choisis : un plan de symétrie à 10 mm qu'on ne voit pas, un cercle centré sur l'objet lui-même.
   - Rien ne lui dit « à toi de choisir ».
2. **Les booléens reposent sur une règle cachée : « un trou ne creuse qu'une fois groupé ».**
   - Il faut cocher une case, sélectionner à plusieurs, puis grouper.
   - Un enfant ne relie pas ces trois gestes à l'idée de « percer ».
3. **Placer une pièce par rapport à une autre est laborieux.**
   - Il n'y a ni alignement ni centrage.
   - Les nouvelles pièces naissent hors de la vue, et les copies sont décalées de 5 mm.
   - La seule méthode sûre est de taper des coordonnées.
4. **La disposition ne tient pas sur les écrans du collège.**
   - Vers 1000 px de large, le bandeau d'outils est tronqué (« Orien… », « Vali… »), les boutons de vue recouvrent la 3D et la colonne de gauche doit défiler.
   - Vers 600 px, la vue 3D disparaît complètement (0 px de large).
5. **Le logiciel parle peu, et au mauvais endroit.**
   - Les consignes (« Clique la face… », « Clique le plan… ») s'affichent tronquées dans la barre d'état, en bas à gauche, loin du regard.
   - Les erreurs de dessin (profil invalide) ne sont pas expliquées du tout.

Les sections suivantes détaillent chaque constat et proposent des solutions **structurelles** : un mécanisme commun plutôt qu'une rustine par outil.

---

## 2. Principe d'interaction : la « fenêtre d'opération »

### Constats
| Opération | Ce qui se passe aujourd'hui |
|---|---|
| Symétrie | Appliquée instantanément, plan YZ décalé de 10 mm, **plan non dessiné dans la vue**. |
| Répéter en cercle | Appliquée instantanément, 6 copies **autour du centre de l'objet** : les copies se superposent en étoile. Ni le centre ni l'axe ne sont dessinés. |
| Répéter en ligne | Même principe : il n'y a ni flèche de direction ni écart visible. |
| Extruder | Solide de 10 mm créé tout de suite. La vue revient à l'ancienne caméra, et le solide est caché derrière d'autres pièces et sous le gizmo. |
| Coller le texte | Un mode « clique une face » s'active, signalé seulement par la barre d'état, sans bouton Annuler. |
| Esquisse | Même mode « clique un plan » : les plans sont minuscules, cachés derrière les pièces et le gizmo. |

Les réglages arrivent **après coup**, mêlés au reste de l'inspecteur (nom, couleur, position…), avec des boutons au vocabulaire technique : « Plan par l'objet », « Centre à l'origine », et même « Retirer la répétition » pour une symétrie.

### Solution structurelle
Créer **un seul composant**, la *fenêtre d'opération*, utilisé par toutes les opérations qui demandent un choix (symétrie, répétitions, extrusion, révolution, épaississement, coller un texte, percer, choisir un plan…).

- **Apparence :** un encadré flottant, ancré en haut de la vue 3D et bien visible, avec un titre verbal (« Faire une symétrie »). Le reste de l'interface est légèrement estompé.
- **Contenu :** uniquement les 1 à 3 choix nécessaires, présentés avec des images plutôt qu'avec du jargon :
  - symétrie : trois boutons illustrés « gauche ↔ droite », « avant ↔ arrière », « haut ↔ bas », puis « miroir collé à l'objet / au centre du plateau » ;
  - répétition en cercle : nombre de copies, et « autour de : le centre du plateau / un point que je clique ».
- **Aperçu vivant dans la vue :** le plan, l'axe ou le centre sont dessinés en couleur, et le résultat en transparence. Ils sont manipulables à la souris (tirer le plan, tirer la flèche d'extrusion).
- **Deux gros boutons, « Valider » et « Annuler » :** Entrée et Échap y sont reliés. Tant qu'on n'a pas validé, **le document ne change pas** : le résultat n'est qu'un aperçu.
- **Étape par étape si besoin :** « 1. Choisis la face → 2. Choisis gravé ou en relief → Valider ». L'étape en cours est surlignée.
- **Modifier plus tard :** un double-clic sur l'opération dans l'arbre rouvre la même fenêtre avec les valeurs actuelles. On garde ainsi la modification paramétrique sans exposer les réglages en permanence dans l'inspecteur.

Avec ce mécanisme, les boutons « Plan par l'objet », « Centre sur l'objet », « Coller sur une face », « En relief / Gravé »… disparaissent de l'inspecteur : ils deviennent des choix dans la fenêtre.

**Techniquement :** un module `interface/fenetre_operation.js`. Chaque opération fournit ses champs, son aperçu (via les aperçus de scène qui existent déjà) et sa commande finale. `choix_dans_la_vue.js` devient une étape possible de cette fenêtre.

---

## 3. Booléens : rendre « percer » explicite

### Constats
- Pour percer le porte-clés, il faut :
  1. créer un cylindre ;
  2. cocher « Trou — creuse une fois groupé » ;
  3. sélectionner la plaque et le cylindre avec Maj ;
  4. cliquer « Grouper ».
- La case « Trou » et le mot « Grouper » ne disent pas « percer ». Le sous-titre du groupe, « union et différence booléennes », est du jargon.
- Un trou non groupé est exporté… en étant ignoré, et l'élève ne comprend pas pourquoi son objet n'est pas percé.
- Après le groupement, la position du groupe affiche **Z = −3** alors que la pièce est posée au sol : la boîte du groupe inclut le cylindre-trou qui dépasse dessous.

### Solution structurelle
Trois opérations nommées par ce qu'elles font, présentées dans une section « Assembler », chacune via la fenêtre d'opération :

| Opération | Fenêtre |
|---|---|
| **Coller ensemble** (union) | Sélectionner les pièces → Valider. |
| **Percer / Creuser** (différence) | « 1. Clique la pièce à garder » → « 2. Clique la ou les pièces qui creusent » → aperçu en rouge transparent → Valider. |
| **Garder le commun** (intersection) | Optionnelle, plus tard. |

- **Garder la case « Trou »,** mais afficher dans la vue, sur un trou non assemblé, une étiquette « Ce trou ne creuse rien : Percer avec… ».
- **Arbre :** afficher « Plaque *percée par* Cylindre, Texte » plutôt que « Groupe ▸ Pavé, Cylindre, Texte ».
- **Position d'un groupe :** la calculer sur la **matière visible** (hors trous).

---

## 4. Placement, alignement, caméra

### Constats
- **Nouvelles pièces hors de vue :** le cylindre et le texte sont nés hors de la vue ou dans une pièce existante (le texte couché *dans* la plaque). La caméra ne suit pas.
- **Copies décalées :** « Dupliquer » décale de 5 × 5 mm ; pour centrer le cylindre intérieur du pot, il a fallu retaper X et Y.
- **Texte collé mal placé :**
  - il se pose **au point cliqué**, pas au centre de la face, et dépasse du bord ;
  - après un recentrage à la main, « Gravé » **ramène le texte au point cliqué** : défaut à corriger en priorité.
- **Rien pour placer les pièces entre elles :** il n'existe aucun outil « aligner / centrer / poser sur », ni aucune mesure de distance entre deux pièces.
- **« Cadrer » ne suffit pas :** après une extrusion ou une symétrie, la pièce créée reste cachée derrière d'autres.

### Solutions structurelles
- **Naissance au centre visible :** une forme ajoutée apparaît au centre de ce que l'on voit, posée sur le plateau (ou sur la pièce sélectionnée, comme Tinkercad). La vue s'ajuste doucement si elle n'est pas visible. Même règle pour le résultat d'une opération.
- **Outil « Aligner » :** sélectionner deux pièces fait apparaître, autour d'elles, des pastilles « gauche / centre / droite » sur chaque axe (modèle Tinkercad). On clique une pastille ; la pièce de référence est la première cliquée.
- **Accrochage centre sur centre :** en déplaçant une pièce, elle s'aimante au centre et aux bords des autres, avec des guides pointillés. La mécanique existe déjà dans les esquisses (`accrochages.js`) et peut être généralisée aux objets.
- **Coller un texte :** centrer par défaut sur la face cliquée, puis laisser le glisser *sur* la face. La position choisie devient la référence (plus de retour au point cliqué).
- **Dupliquer :** copie à la même place, prête à être déplacée, mise en surbrillance (ou décalée d'une taille entière, visible). Proposer aussi « Dupliquer et placer » (la copie suit la souris jusqu'au clic).
- **Outil « Mesurer » :** cliquer deux points ou deux faces pour afficher la distance. Indispensable pour vérifier « mon trou fait bien 5 mm ».

---

## 5. Manipulation directe

### Constats
- **Gizmo encombrant :** les anneaux de rotation sont affichés en permanence et très grands. Sur une pièce allongée, ils couvrent la moitié de la vue ; sur une petite pièce (le cylindre de 5 mm), les poignées noires **recouvrent entièrement l'objet**, qu'on ne peut plus attraper.
- **Trois modes de déplacement (Poser, Libre, Axe)** dont la différence n'est pas évidente. Le bandeau affiche leurs réglages (« Orienter selon la surface », « Enfoncement », « Rotation par ») tronqués.
- **Pas de poignée d'extrusion :** la hauteur d'une extrusion ou d'un texte se règle seulement par un champ.

### Solutions structurelles
- **Un seul mode par défaut, « Déplacer » :** glisser = poser sur ce qui est dessous (le mode Poser actuel), Maj = verrouiller un axe. Les modes Libre et Axe passent en options avancées.
- **Gizmo à la demande :**
  - flèches de déplacement **à l'extérieur** de la boîte, taille fixe à l'écran ;
  - rotation par un **seul petit anneau** qu'on choisit (touche ou bouton « Tourner ») plutôt que trois grands anneaux permanents ;
  - sous une certaine taille à l'écran, les poignées de taille se cachent et seule la flèche « déplacer » reste.
- **Poignées de cotes :** sur une extrusion, un texte ou un cylindre, une flèche à tirer avec la cote qui s'affiche au bout (« 12 mm »). Un clic sur la cote la rend éditable.

---

## 6. Esquisse

### Constats
1. **Choix du plan :** les trois plans font 60 mm, sont placés à l'origine, souvent cachés derrière les pièces et sous le gizmo de la sélection. La vue ne se recentre pas sur eux.
2. **Profil refusé sans explication :** deux rectangles qui se chevauchent (un socle et un dossier en L, geste très naturel) ne forment pas de région : pas d'aplat bleu, « Extruder » reste grisé, aucune bulle d'aide ni aucun message ne l'explique.
3. **Profil en L tracé segment par segment :** chaque segment demande de viser le bout du précédent, puis de taper longueur, Tab, angle, Entrée. Les points à 5 mm d'écart sont à 8 px l'un de l'autre, et l'accrochage hésite.
4. **Saisie au clavier invisible :** les cotes tapées n'apparaissent que dans la barre d'état en bas. On tape « à l'aveugle », loin du curseur.
5. **Bandeau à la largeur du collège :** les outils ne sont que des icônes sans nom, et « Valider l'esquisse » est coupé (« Vali… »).
6. **Sortie de l'esquisse par l'annulation :** annuler trop de fois fait sortir de l'esquisse sans prévenir (l'annulation supprime l'esquisse elle-même), puis continue d'annuler des opérations d'avant (le pot a été dégroupé).
7. **Après « Extruder » :** la caméra revient à la vue d'avant, et le solide créé n'est pas forcément visible.

### Solutions structurelles
- **Fusion automatique des formes fermées qui se chevauchent** (union des régions) : deux rectangles en L donnent un L. Avec un outil « Découper » (ou une forme dessinée en mode trou), on peut aussi retirer une zone. C'est le modèle mental d'un enfant : on empile des formes.
- **Diagnostic visuel :** si un tracé ne peut pas devenir un solide, afficher dans la vue le point en défaut (extrémité libre en rouge, croisement entouré) et un message clair : « Ce contour n'est pas fermé : relie ce point rouge ».
- **Saisie dans une bulle près du curseur :** deux petites cases « Longueur », « Angle » qui suivent le trait, pré-remplies par la souris, modifiables au clavier. C'est le modèle de Fusion ou SketchUp.
- **Outil « Polyligne » distinct du « Trait » :** le trait simple reste à deux clics (demande récente), mais un outil « Contour » enchaîne les points jusqu'à revenir au premier. C'est le geste naturel pour dessiner un profil.
- **Choix du plan en plein écran :** les plans s'agrandissent à la taille de la vue, les pièces s'estompent, et la sélection et son gizmo sont masqués. Mieux : **un clic sur une face d'une pièce** ouvre une esquisse sur cette face (le plus intuitif).
- **Bandeau d'esquisse sur deux niveaux :** les outils de tracé en grandes icônes **avec** leur nom, et le bouton « Valider » dans la fenêtre d'opération (voir §2), toujours visible.
- **Annulation bornée pendant une esquisse :** Ctrl+Z ne remonte pas au-delà de l'ouverture de l'esquisse. Un message l'indique.
- **Après une extrusion :** rester sur une vue 3D qui cadre le nouveau solide, avec la flèche de hauteur prête à tirer (voir §5).

---

## 7. Inspecteur

### Constats
- **Ordre des champs :** pour un texte, **le mot à écrire** vient après nom, couleur, trou, position, rotation et dimensions. C'est pourtant le premier réglage que l'élève cherche.
- **Libellés tronqués :** la colonne fait 62 px (« Hauteur d… », « Cintrage (… », « Position d… »).
- **Doublons :** texte et extrusion affichent « Dimensions L/l/h » **et** « Hauteur des lettres / Épaisseur » ou « Hauteur ». Deux façons de changer la même chose.
- **Jargon :** « union et différence booléennes », « extrusion d'un contour », « Facettes », « Plan par l'origine », « Retirer la répétition » (pour une symétrie), « Figer ».
- **Arbre illisible :** « Groupe », « Groupe », « Cylindre », « Cylindre », « Esquisse ». Impossible de savoir lequel est le pot.
- **Barre d'état bruitée :** « Modifications en attente / Enregistré dans ce navigateur » clignote en haut à chaque geste.

### Solutions structurelles
- **Ordre fixe en trois blocs :**
  1. **« Ce que c'est »** : les réglages propres au type (texte, cotes, nombre de copies…), en tête, dans l'encadré mis en valeur (comme les cotes des formes de base) ;
  2. **« Où c'est »** : position, rotation ;
  3. **« Apparence »** : nom, couleur, trou.
- **Libellés au-dessus des champs** (ou colonne élargie à environ 100 px) : jamais de libellé coupé.
- **Une seule façon de régler la taille :** pour les types qui ont des cotes propres, masquer le trio L/l/h (comme pour les formes de base).
- **Noms automatiques parlants :** « Cylindre Ø70 », « Texte « LÉO » », « Plaque percée ». Une icône d'opération dans l'arbre (percé, symétrie, cercle).
- **Glossaire en survol :** le mot du programme de techno (« extrusion ») reste, mais **après** un verbe courant (« Tirer une forme dessinée »).

---

## 8. Disposition générale

### Constats (écran d'environ 970 px, navbar ouverte)
- **Tout est serré :** colonne de gauche 150 px, vue 3D environ 350 px, colonne de droite 230 px. La vue 3D est la plus petite zone de l'écran.
- **Colonne de gauche trop longue :** la section **Assembler** (Grouper, Trou, Supprimer…) est sous la ligne de flottaison et il faut défiler pour la trouver.
- **Boutons de vue sur deux lignes :** « Iso Dessus Dessous Face Dos Gauche Droite Cadrer » recouvrent le haut de la vue 3D.
- **Colonne de droite vide :** sans sélection, elle n'affiche qu'une phrase.
- **Vers 600 px :** la vue 3D disparaît (largeur 0).

### Solutions structurelles
- **Replier la navbar automatiquement** quand la fenêtre fait moins d'environ 1400 px. La languette reste, et un clic la rouvre.
- **Barre d'outils du haut par catégories** (grandes icônes avec nom) : *Formes ▾ · Dessiner · Modifier ▾ · Répéter ▾ · Assembler ▾ · Imprimer*. Chaque catégorie ouvre une palette.
  - La colonne de gauche est libérée et peut accueillir **l'arbre de construction** (sa place habituelle).
  - L'inspecteur garde la colonne de droite.
- **Barre d'actions contextuelle :** près de la sélection, quelques boutons (Dupliquer, Percer, Aligner, Supprimer). On agit là où l'on regarde.
- **Cube de vue** (« ViewCube ») dans un coin, cliquable, à la place des huit boutons texte.
- **Largeur minimale :** en dessous d'environ 900 px, afficher « Agrandis la fenêtre » plutôt qu'une interface cassée.

---

## 9. Guidage et retours

### Constats
- **Consignes loin du regard :** elles s'affichent en bas à gauche, en petit et tronquées.
- **Focus coincé après Entrée :** après Entrée dans un champ, le curseur reste dans le champ, et la touche suivante (F pour cadrer) s'écrit dans la case (« 4f »).
- **Raccourcis parfois sans effet :** juste après un clic sur un bouton du panneau de gauche (« Esquisse »), la touche R n'a pas activé l'outil Rectangle. Le cas n'a pas été isolé : à vérifier.
- **Aucune aide à l'ouverture :** pas de visite guidée, pas de liste des raccourcis.

### Solutions structurelles
- **Bandeau de consigne dans la vue 3D :** en haut, gros texte, icône et bouton Annuler. C'est la même zone que la fenêtre d'opération. La barre d'état ne garde que les informations passives (taille, étanchéité).
- **Entrée valide et rend la main à la vue.** Tab passe au champ suivant.
- **Touche « ? » :** une surcouche liste les raccourcis.
- **Premier lancement :** trois bulles successives (« Ajoute une forme », « Tourne la vue avec le clic droit », « Exporte pour imprimer »), qu'on peut fermer.
- **Défis guidés** (plus tard) : « Fabrique un porte-clés », avec étapes cochées automatiquement. Ils s'intègrent aux activités du site.

---

## 10. Préparation à l'impression

### Constats
- **Aucun plateau d'imprimante :** la grille de 400 mm ne dit rien de la place réellement disponible.
- **Tout part dans un seul STL :** l'export mélange tous les objets visibles, y compris des pièces qui se chevauchent sans être assemblées.
- **Aucune vérification d'imprimabilité :** pièce flottante, paroi trop fine, texte gravé trop fin, pièce plus grande que le plateau. Seules existent l'alerte « sous le sol » et l'étanchéité.
- **Le « O » gravé coupé par le bord** n'a déclenché aucune remarque.

### Solutions structurelles
- **Plateau réglable dessiné** (par ex. 220 × 220 mm, réglage enseignant) avec sa zone utile.
- **Bouton « Imprimer » qui ouvre une fenêtre de vérification** listant chaque problème :
  - pièce en l'air ;
  - pièces qui se touchent sans être assemblées ;
  - paroi inférieure à 0,8 mm ;
  - texte trop fin ;
  - pièce hors plateau.

  Chaque ligne a un bouton « Montrer ». On exporte ensuite, avec un choix « tout / la sélection ».
- **Bouton « Poser à plat sur le plateau »** pour une pièce.

---

## 11. Fonctions manquantes pour les objets typiques

| Besoin | Constat | Proposition |
|---|---|---|
| Bords arrondis (porte-clés, boîte) | Impossible sur un solide | **Arrondir les arêtes** d'un pavé ou d'une extrusion (rayon unique, pas de sélection d'arête). Au minimum, une option « coins arrondis » sur le pavé. |
| Pot, boîte, coque | Deux cylindres, trou, groupe | **Évider** (coque) : épaisseur de paroi, face ouverte au choix. |
| Tube | Idem | Forme de base **Tube** (rayon extérieur, épaisseur). |
| Vérifier une cote | Aucun outil | **Mesurer** (§4). |
| Texte sur deux lignes | Impossible | Texte multi-lignes, alignement centré. |
| Placer précisément | Coordonnées à taper | **Aligner** (§4). |

---

## 12. Défauts à corriger en premier (bugs)

1. **« Gravé » et « En relief » ramènent le texte au point cliqué**, en écrasant un déplacement fait à la main.
2. **La position d'un groupe inclut les trous** : Z = −3 affiché pour une pièce posée au sol.
3. **Entrée laisse le focus dans le champ** : les raccourcis s'écrivent dans la case.
4. **La répétition en cercle tourne par défaut autour du centre de l'objet** : les copies se superposent.
5. **Des régions qui se chevauchent dans une esquisse** empêchent l'extrusion sans message.
6. **L'annulation sort de l'esquisse** et continue sur les opérations précédentes.
7. **La vue 3D disparaît quand la fenêtre est étroite** (navbar ouverte).
8. **À vérifier :**
   - un zoom à la molette en vue à plat a vidé la vue, et seul « Cadrer » l'a rétablie ; ce test a été fait avec la page zoomée à 60 %, ce qui peut fausser le calcul du point visé ;
   - un raccourci ignoré juste après un clic dans le panneau de gauche.

---

## 13. Ordre de travail proposé

| Lot | Contenu | Pourquoi d'abord |
|---|---|---|
| **1. Fondations** | Bugs du §12 ; disposition responsive et repli automatique de la navbar ; bandeau de consigne dans la vue ; Entrée rend la main | Rend le logiciel utilisable sur les postes du collège. |
| **2. Fenêtre d'opération** | Composant commun ; migration de symétrie, répétitions, extrusion, révolution, épaississement, coller un texte, choix du plan | Le cœur de la demande : l'élève sait qu'il a quelque chose à choisir. |
| **3. Assembler** | Percer / Coller ensemble explicites ; noms automatiques ; arbre lisible | Les booléens sont le concept clé du programme. |
| **4. Placer** | Naissance au centre visible ; Aligner ; accrochage entre objets ; Mesurer ; gizmo allégé ; poignées de cotes | Supprime la saisie de coordonnées pour les cas courants. |
| **5. Esquisse 2** | Fusion des régions ; diagnostic visuel ; bulle de saisie ; outil Contour ; esquisse sur une face | Rend le dessin accessible sans connaître les contraintes. |
| **6. Impression** | Plateau ; fenêtre de vérification ; poser à plat ; arrondir ; évider ; tube | Ferme la boucle jusqu'à l'imprimante. |
| **7. Réorganisation** | Barre d'outils par catégories ; arbre à gauche ; cube de vue ; barre d'actions contextuelle | Changement le plus visible : à faire quand les briques ci-dessus existent. |
