# Prompt — Trancheur intégré à l'Atelier 3D (visualisation seulement)

> À donner tel quel à l'IA de code. Contexte complet : `cadrage_impression_3d.md` à la racine du dépôt. Lis-le, ainsi que `CLAUDE.md`, avant de commencer.

---

## Ce que je veux, en une phrase

Je veux voir, **dans l'Atelier 3D et en direct**, comment mes pièces vont être tranchées : couches, parois, remplissage, couture, sens des lignes, comme dans l'aperçu d'OrcaSlicer, avec des réglages et des préréglages comparables. Le but est de repérer les défauts et les zones fragiles **pendant que je conçois**.

## Ce qui est hors sujet pour cette fois

- **Aucune connexion aux imprimantes.** Pas d'envoi, pas de suivi, pas de réseau, rien côté serveur pour la machine.
- Pas d'AMS ni de multicouleur (mais ne ferme pas la porte : voir « Pour plus tard »).
- Pas de supports, pas de hauteur de couche adaptative, pas de zones de réglage à l'intérieur d'une pièce.
- Un fichier G-code exportable est un **bonus** : fais-le si le reste est solide, mais ce n'est pas l'objectif. L'objectif est l'aperçu.

## Les machines

Bambu Lab **P1P** et **P1S**, buse 0,4 mm, plateau 256 × 256 mm, hauteur 256 mm. Les deux profils machine existent dès le départ (ils diffèrent par la présence du caisson et des ventilateurs sur le P1S).

---

## 1. Deux onglets : « Conception » et « Impression »

Dans la barre du haut, deux onglets bien visibles, **Conception** (l'atelier actuel) et **Impression**. On passe de l'un à l'autre en un clic, sans rechargement ni attente perceptible, autant de fois qu'on veut.

### Onglet Impression — ce que je vois
- Au centre, le **plateau** du P1 en 3D : surface du plateau à l'échelle, contour du volume imprimable, origine repérée. Même caméra et mêmes gestes de souris que dans Conception.
- À gauche, la **liste des pièces du plateau** (nom, nombre d'exemplaires, voyant si la pièce a des réglages propres, voyant d'erreur).
- À droite, le **panneau de réglages** (§3).
- En bas ou en surimpression, la **barre d'aperçu** : curseur de couche, légende, estimations (§4).

### Placer les pièces
- **« Mettre sur le plateau »** depuis Conception (clic droit sur un objet, ou bouton) et depuis Impression (liste des objets du projet pas encore placés). Une pièce n'arrive **jamais** toute seule sur le plateau.
- Sur le plateau : **déplacer**, **tourner autour de la verticale**, **poser à plat sur une face** (clic sur la face), **dupliquer / nombre d'exemplaires**, **retirer du plateau**.
- **Disposer automatiquement** : range les pièces sans chevauchement, avec un espacement réglable.
- Une pièce qui déborde du volume ou en chevauche une autre est **signalée** (couleur et message), jamais déplacée d'office.
- Un objet de la bibliothèque qui contient plusieurs pièces (le Clip A : mâle + femelle) peut être **éclaté sur le plateau** en pièces séparées, **sans être dégroupé** dans Conception.

### Les deux mondes restent indépendants, et restent synchronisés
- La position sur le plateau est **indépendante** de la position dans l'assemblage. Je peux coucher une pièce sur le plateau sans que l'assemblage bouge, et inversement.
- Je modifie une pièce dans Conception (un paramètre, une esquisse) → je reviens dans Impression : elle est **à la même place sur le plateau**, avec sa nouvelle forme, et l'aperçu est retranché.
- Je supprime une pièce dans Conception → elle disparaît du plateau.
- Tout ceci est **enregistré dans le projet** : je rouvre le projet demain, le plateau est comme je l'ai laissé, réglages compris. Les anciens projets s'ouvrent sans erreur (plateau vide).
- Annuler/Refaire fonctionne aussi pour les gestes faits sur le plateau et pour les changements de réglages.

---

## 2. La vue tranchée dans l'onglet Conception

C'est la fonction la plus importante pour moi.

- Dans Conception, un bouton **« Vue tranchée »** (bascule, avec raccourci clavier) remplace l'affichage des solides par leur **résultat de tranchage**, **dans la position d'assemblage**.
- Une pièce couchée sur le plateau apparaît donc remontée dans l'assemblage **avec ses couches dans le sens où elles seront réellement imprimées**. C'est là que je vois qu'un clip a ses couches dans le mauvais sens, ou qu'une paroi n'a qu'une ligne.
- Les pièces qui ne sont pas sur le plateau restent affichées normalement (ou en gris clair, à ton choix, mais distinguables).
- Les mêmes réglages de couleur (§4) que dans l'aperçu d'Impression s'appliquent : type de ligne, largeur, etc.
- Le **curseur de couche** existe aussi ici (il coupe chaque pièce à une hauteur **d'impression**, pas à une hauteur du monde). Les vues en coupe existantes de l'atelier doivent continuer à fonctionner sur la vue tranchée : couper une pièce tranchée pour voir ses parois intérieures et son remplissage est exactement ce que je veux.
- Sélectionner une pièce en vue tranchée affiche dans l'inspecteur ses réglages effectifs et ses estimations.

---

## 3. Réglages et préréglages

Même logique qu'OrcaSlicer, que j'utilise tous les jours : **trois préréglages** empilés.

| Préréglage | Contient |
|---|---|
| **Imprimante** | P1P ou P1S, buse, plateau, volume, limites de vitesse et d'accélération |
| **Filament** | Type (PLA, PETG au départ), couleur, températures, débit volumétrique maximal, refroidissement, rétraction propre au filament |
| **Traitement** | Tout le reste : couches, lignes, parois, remplissage, vitesses… |

- Des préréglages **fournis** (non modifiables), avec des valeurs reprises des profils Bambu pour P1P/P1S, PLA et PETG : « 0,20 mm Standard », « 0,12 mm Fin », « 0,28 mm Brouillon » au minimum.
- Des préréglages **personnels** : enregistrer, enregistrer sous, renommer, supprimer. Stockage à décider (projet, navigateur ou serveur) : je veux les retrouver d'un projet à l'autre.
- **Valeur modifiée** : comme dans Orca, un réglage changé par rapport au préréglage est marqué (couleur, icône), avec un bouton pour revenir à la valeur du préréglage. Le nom du préréglage affiche « (modifié) ».
- **Changer de préréglage avec des modifications en cours** : proposer de les garder, de les abandonner ou de les enregistrer.
- **Niveaux d'affichage** : un mode **Simple** (les réglages qu'on touche tous les jours) et un mode **Avancé** (tout). Une recherche de réglage par nom en haut du panneau.
- Chaque réglage a sa **bulle d'aide** au survol : ce qu'il fait, l'effet d'une valeur haute ou basse, l'unité. Textes professionnels et impersonnels.

### Liste des réglages attendus (onglets du panneau Traitement)

Noms en français ; entre parenthèses, le nom Orca pour que tu retrouves la référence.

**Qualité**
- Hauteur de couche (`layer_height`), hauteur de la première couche (`initial_layer_print_height`)
- Largeurs de ligne, en mm ou en % de la buse : par défaut (`line_width`), première couche, paroi extérieure, parois intérieures, surface du dessus, remplissage, remplissage plein intérieur
- Couture (`seam_position`) : au plus près, alignée, à l'arrière, aléatoire
- Générateur de parois (`wall_generator`) : **classique** au départ. Arachne est « plus tard », mais prévois la place.
- Ordre des parois : intérieures puis extérieure, extérieure puis intérieures
- Détection des parois fines (`detect_thin_wall`)

**Résistance**
- Nombre de parois (`wall_loops`)
- Couches pleines du dessus / du dessous (`top_shell_layers`, `bottom_shell_layers`) et épaisseur minimale correspondante (`top_shell_thickness`, `bottom_shell_thickness`)
- Motif du dessus / du dessous (`top_surface_pattern`, `bottom_surface_pattern`) : **monotone** et **rectiligne** au minimum, concentrique en option
- Remplissage : densité (`sparse_infill_density`), motif (`sparse_infill_pattern`) : **rectiligne, grille, gyroïde** au minimum ; cubique, nid d'abeille et éclair (`lightning`) plus tard
- Direction du remplissage (`infill_direction`)
- Chevauchement remplissage/parois (`infill_wall_overlap`)
- Remplissage des interstices (`gap_fill_target`) : partout, dessus/dessous seulement, nulle part

**Vitesse**
- Première couche, paroi extérieure, parois intérieures, remplissage, remplissage plein, dessus, déplacements
- Plafond automatique par le **débit volumétrique maximal** du filament : la vitesse réellement atteinte doit se voir dans l'aperçu (§4)

**Refroidissement** (préréglage Filament)
- Ventilateur désactivé sur les N premières couches, vitesse min/max, temps de couche minimal (ralentissement des petites couches)

**Adhérence** (onglet « Autres » d'Orca)
- Jupe : nombre de tours, distance
- Bordure : largeur, écart avec la pièce

**Rétraction** (préréglage Imprimante, surchargeable par le filament)
- Longueur, vitesse, levée en Z, éviter de traverser les parois

Tout réglage ajouté doit trouver sa place dans cette organisation, pas dans un panneau à part.

---

## 4. L'aperçu

### Mise à jour en direct
- Je change un réglage → l'aperçu se **retranche tout seul**, sans bouton à cliquer. Un indicateur discret montre qu'un calcul est en cours ; l'ancien aperçu reste affiché jusqu'au nouveau (pas d'écran vide).
- Je modifie une pièce dans Conception → **seules les pièces touchées** sont retranchées.
- Sur une pièce ordinaire (un boîtier de 60 mm, un clip), le résultat doit arriver en **quelques secondes au plus** sur un poste du collège. Si c'est plus long, montre la progression pièce par pièce.
- Le calcul ne doit **jamais figer l'interface** : je peux continuer à tourner la vue, changer d'onglet, modifier d'autres réglages pendant qu'il tourne.

### Modes de coloration (liste déroulante, comme Orca)
1. **Type de ligne** (par défaut) : chaque catégorie a sa couleur, avec une légende où chaque type peut être **affiché ou masqué** par une case à cocher, et son **pourcentage de temps** à côté :
   - Paroi extérieure, parois intérieures, surface du dessus, surface du dessous, remplissage plein intérieur, remplissage, remplissage des interstices, jupe, bordure, couture (points), déplacements (masqués par défaut), rétractions (points, masquées par défaut)
2. **Largeur de ligne** : dégradé avec valeurs min/max en légende
3. **Hauteur de couche**
4. **Vitesse** (vitesse réellement atteinte, après plafonnement par le débit)
5. **Débit volumétrique**
6. **Ventilateur**
7. **Filament** (couleur du filament de chaque pièce ; prépare l'AMS)
8. **Réglages propres** : met en évidence les pièces qui ont des réglages différents du plateau (§5)

Les couleurs de la légende suivent la palette de l'Atelier et fonctionnent en thème clair comme en thème sombre.

### Navigation dans l'aperçu
- **Curseur vertical de couche** avec double poignée (couche basse / couche haute), numéro de couche et hauteur en mm. Flèches haut/bas pour avancer d'une couche.
- **Curseur horizontal dans la couche** : fait avancer la tête le long des trajets de la couche courante, pour voir l'ordre d'impression (parois, puis remplissage, couture…).
- Affichage des lignes **avec leur épaisseur réelle** (pas des traits d'un pixel), de sorte qu'un espace entre deux lignes ou un chevauchement se voie.
- Survol d'une ligne : bulle avec type, largeur, hauteur, vitesse, débit.

### Estimations
- Temps d'impression total et par pièce ; longueur et masse de filament (m, g). Détail par type de ligne dans la légende.
- Les estimations restent visibles quel que soit le mode de coloration.

### Signalements
Une liste d'avertissements cliquables (clic = la vue va à la couche et à l'endroit concernés) :
- pièce hors du plateau, pièces qui se chevauchent ;
- pièce non étanche (le voyant existe déjà dans l'atelier) ;
- zone trop fine pour être imprimée avec la largeur de ligne réglée (elle disparaît du tranchage) ;
- paroi réduite à une seule ligne là où le nombre de parois demandé ne tient pas ;
- surplombs importants sans support ;
- vitesse demandée plafonnée par le débit du filament.

---

## 5. Réglages par pièce

- Sur une pièce du plateau (ou une sélection de plusieurs), je peux **surcharger** une partie des réglages : largeur de ligne, nombre de parois, couches dessus/dessous et leur motif, remplissage (densité, motif, direction), couture, vitesses, filament.
- **Ne sont pas surchargeables** (communs à tout le plateau, grisés avec une bulle qui explique pourquoi) : hauteur de couche, première couche, températures, ventilation, préréglage imprimante.
- Dans la liste des pièces, une pièce qui a des réglages propres porte un voyant ; un clic ouvre la liste de ses écarts, chacun réinitialisable.
- **Réglages exigés par la conception** : un objet de la bibliothèque peut déclarer des réglages d'impression dont il dépend. Le Clip A a déjà les variables `clip_ligne` et `clip_couche`. Posé sur le plateau, il applique sa largeur de ligne ; si la hauteur de couche du plateau n'est pas la sienne, un avertissement le dit clairement (« Clip A conçu pour 0,20 mm, plateau à 0,16 mm »). Je veux choisir dans l'éditeur de modèle quelles variables sont liées à quel réglage.
- **Sens inverse** : une variable de projet peut lire un réglage du plateau (par exemple une épaisseur de paroi égale à 3 × la largeur de ligne). Propose une syntaxe dans les formules existantes.

---

## 6. Critère de réussite

Je prends trois pièces : un boîtier simple, le Clip A, une pièce avec texte en relief. Je les tranche dans l'Atelier et dans OrcaSlicer avec les mêmes réglages (P1S, PLA, 0,20 mm Standard). En comparant les aperçus couche par couche :
- mêmes contours, même nombre de parois, mêmes zones de dessus/dessous, remplissage du même motif et de la même densité ;
- temps et masse estimés du même ordre (écart < 15 %) ;
- la vue tranchée dans Conception me montre les pièces dans leur assemblage avec le bon sens de couches.

Vérifie dans le navigateur (pas de tests automatisés pour l'Atelier, c'est une règle du projet), à 1280 px de large, thèmes clair et sombre.

---

## 7. Pour plus tard — ne pas coder, mais ne pas bloquer

L'organisation des données et de l'interface doit laisser la place à :
- l'**AMS** : un filament par pièce ou par partie (4 emplacements), couleur de la pièce ↔ emplacement, tour de purge ;
- la **connexion aux P1P/P1S** en réseau local et l'envoi d'un `.gcode.3mf` ;
- les **supports** (classiques puis arborescents) ;
- la **hauteur de couche adaptative** (commune à tout le plateau) ;
- des **zones de réglage** dessinées dans Conception (comme on marque un objet en « trou » aujourd'hui) qui changent les réglages à l'intérieur d'une pièce ;
- le générateur de parois **Arachne**, le lissage des dessus, les ponts, les surplombs ;
- plusieurs plateaux par projet.

## 8. À ne pas faire du tout
- D'autres marques d'imprimantes ; le cloud Bambu ; une hauteur de couche différente par pièce ; l'impression pièce par pièce ; le radeau ; la peinture de couleur sur les faces ; la texture floue.
- **Ne copie pas de code d'OrcaSlicer, de Bambu Studio ou de PrusaSlicer** (licence AGPL). Inspire-toi de leurs algorithmes et reprends les valeurs de leurs profils, mais écris ton propre code.

## 9. Quand tu hésites
Pose-moi la question plutôt que de trancher seul, surtout sur : l'endroit où sont stockés les préréglages personnels, la syntaxe de liaison variables ↔ réglages, et tout ce qui changerait le format des projets existants. Découpe le travail en étapes livrables (plateau et aller-retour d'abord, puis aperçu des couches et parois, puis le reste du tranchage, puis la vue tranchée dans Conception, puis les réglages par pièce), et montre-moi chaque étape avant la suivante.
