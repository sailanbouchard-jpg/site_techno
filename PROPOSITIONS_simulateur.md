# Simulateur de structures — Diagnostic & propositions d'évolution

> Document de **propositions** (aucun code modifié). Objectif : transformer le simulateur actuel
> en **bac à sable de génie structurel** pédagogique (ponts, immeubles, grues, hangars…), avec
> **flexion/flambement**, **cahier des charges fonctionnel**, **budget réel** et **notation 3 étoiles**,
> tout en restant 100 % local et fluide sur 30 PC modestes.

---

## 1. Synthèse (à lire en premier)

Le code est **propre, bien découpé et bien commenté** (model / physics / render / ui strictement séparés,
unités SI réelles, valeurs Eurocode). La base est saine. Trois chantiers structurants :

1. **Le calcul.** Le moteur est un **solveur dynamique par relaxation** (masses-ressorts, intégration
   explicite), **purement axial** (loi de Hooke dans l'axe). Conséquences : (a) les efforts affichés ne
   sont fiables qu'**à l'équilibre** (pas pendant l'oscillation) ; (b) **aucune flexion possible** — une
   poutre ne peut que s'allonger, jamais se courber, et toute structure non triangulée s'effondre comme
   un mécanisme. C'est le verrou n°1.

2. **L'interface.** Pas d'**accrochage sur maillage** (les nœuds tombent sur des coordonnées flottantes
   quelconques), pas de **déplacement de nœud**, pas d'**aperçu** du tracé, pas d'**annuler**, et le coût
   n'apparaît **nulle part**. Pour ressembler au jeu de la photo (maillage discret, on relie des points,
   on choisit un matériau) il manque surtout le snap et un retour visuel « jeu ».

3. **La pédagogie.** Il n'existe **aucun système de niveaux** : ni cahier des charges, ni budget, ni
   validation, ni score. C'est aujourd'hui un bac à sable libre. Tout le dispositif « cahier des charges →
   validation → 3 étoiles » est à construire (et l'engine s'y prête bien, en restant *data-driven*).

Le contexte technique (30 PC simultanés sur un petit serveur maison) est **rassurant** : tout le calcul
est **côté navigateur**, le serveur ne sert que des fichiers statiques. Le vrai budget de performance est
le **CPU de chaque poste élève** — c'est lui qu'il faut surveiller quand on ajoute la flexion.

---

## 2. Ce qui est déjà solide (à garder)

- **Architecture** : séparation nette `model/` (données) · `physics/` (calcul) · `render/` (dessin) ·
  `ui/` (interaction). Chaque fichier a un rôle clair, les dépendances sont documentées en tête. À conserver
  absolument : toutes les propositions ci-dessous s'y insèrent sans casser ce découpage.
- **Unités SI réelles** partout (m, kg, N, Pa), conversions d'affichage isolées dans `units.js`. Valeurs
  matériaux Eurocode (`materials.js`).
- **Pas de temps fixe découplé du framerate** (`main.js`, accumulateur + `MAX_STEPS_PER_FRAME`) : comportement
  stable même sur machine lente. Bon réflexe.
- **Intégration semi-implicite (Euler-Cromer)** : choix correct pour des ressorts (énergie qui ne diverge pas).
- **Amplification visuelle de la déformation par parcours BFS** (`displayTransform.js`) : astuce nécessaire
  (les déformations réelles sont micrométriques) et bien pensée (on amplifie l'élongation, pas la rotation).
- **Modèle de rupture** déjà présent (traction = contrainte limite × section ; compression plafonnée par le
  **flambement d'Euler**). Bonne base pour la notion de ruine.
- **Charges mobiles** (voiture/camion) avec répartition au prorata sur les deux nœuds : très utile pour les ponts.
- **100 % autonome, zéro dépendance externe** : conforme à la philosophie du projet et idéal pour le déploiement local.

---

## 3. Diagnostic — Calcul / physique

### 3.1 C'est un solveur *dynamique*, pas *statique* — à assumer pédagogiquement

Le moteur ne « résout » pas l'équilibre : il **laisse la structure osciller puis se stabiliser** grâce à
l'amortissement (`VELOCITY_DAMPING_PER_SECOND = 0.2`). À convergence, pour un **treillis** (barres articulées),
la position d'équilibre est correcte (la raideur `k = E·A/L` est juste). **Mais :**

- Les valeurs **« Force interne »** et **« % de l'effort de rupture »** affichées sur les poutres **oscillent**
  tant que la structure n'est pas stabilisée. Un élève qui lit un chiffre en plein ballottement lit une valeur
  **transitoire**, pas l'effort réel. La **rupture** peut même se déclencher sur un **pic d'oscillation** plutôt
  que sur la charge statique vraie. La *rampe de gravité* (`GRAVITY_RAMP_DURATION = 3s`) atténue ça pour le poids
  propre, mais **les efforts ponctuels définis par l'utilisateur ne sont pas rampés**.
  **Pistes :** ① **détecter la convergence** (énergie cinétique totale sous un seuil) et n'afficher / ne noter
  les efforts qu'une fois « **stabilisé** » (badge « ✓ stabilisé » / « … en cours ») ; ② **lisser** l'affichage
  (moyenne glissante des efforts sur une fenêtre de temps) pour masquer l'oscillation ; ③ **augmenter
  l'amortissement** par défaut pour converger plus vite (au prix du réalisme du transitoire) ; ④ pour les valeurs
  *notées*, **lire l'analyse statique** (§4.3) plutôt que la simulation. — **Reco :** ① pour l'affichage (et c'est
  un **point pédagogique** : « une structure vibre puis se stabilise ; on lit les efforts à l'équilibre ») + ④
  pour la note.

- L'**amortissement est un réglage de confort visuel**, pas une grandeur physique. À garder, mais à **expliciter**
  (et éventuellement exposer en mode prof : « vitesse de stabilisation »).

### 3.2 Aucune flexion — le verrou central (détaillé au §4)

`springForces.js` le dit explicitement : *« Modèle barre : la poutre ne résiste qu'à l'étirement/compression
dans son axe, pas à la flexion. »* Conséquences concrètes :

- Une **poutre seule ne fléchit jamais** : un porte-à-faux (poutre en L, charge au bout) ne **descend** pas,
  il s'**allonge** imperceptiblement. Impossible de montrer une **flèche**.
- **Toute structure non triangulée est un mécanisme** : un carré de 4 barres articulées se **déforme en
  losange** et s'effondre. Donc, en l'état, **impossible de modéliser** un portique, un plancher d'immeuble,
  une charpente ou une flèche de grue **sans tout trianguler**. C'est physiquement juste pour des barres
  *articulées*, mais ça **interdit** les structures à nœuds rigides (justement celles des immeubles/grues/hangars).
- Le **flambement n'est qu'un seuil de rupture** : la poutre « casse » mais ne se **courbe** jamais à l'écran.
  Or l'utilisateur veut **voir** flamber.

C'est le point qui débloque le plus de contenu. Traité en détail au **§4**.

### 3.3 Rupture & matériaux — asymétrie et coefficient de sécurité

- `getMaxCompressionForce` prend `min(flambement d'Euler, limite de traction)` et le commentaire assume
  « **même valeur absolue** en traction et en compression ». Or les matériaux réels sont **asymétriques** :
  le **béton** est costaud en compression (~20–30 MPa) mais **très faible en traction** (~2 MPa) ; un **câble**
  ne reprend **que** la traction (déjà géré via `isCable`). Cette asymétrie **est** une notion de SI majeure
  (« pourquoi le béton est armé », « pourquoi les câbles d'un pont suspendu »).
  **Pistes :** ① au minimum, **renommer/clarifier** que `ruptureStress` vaut pour les deux sens (statu quo
  assumé) ; ② **deux résistances séparées** par matériau (**`tensileStrength` + `compressiveStrength`**), en
  gardant le flambement comme plafond *géométrique* en compression ; ③ aller plus loin avec un **béton armé**
  (compression béton + traction reprise par des « câbles/aciers ») comme matériau composite pédagogique.
  — **Reco :** ② (peu de code, gros gain pédagogique), ③ en bonus pour une séquence dédiée.

- Pas de notion de **coefficient de sécurité** : la rupture est binaire à 100 %. En ingénierie on dimensionne
  avec une **marge** (charge admissible = rupture / γ). C'est exactement le bon support pour les **étoiles**
  (cf. §6.4) et ça évite l'effet « ça tient à 99 %, donc c'est bon » qui n'a aucun sens en construction.
  **Pistes :** ① afficher le **taux de travail** (% de la charge admissible) ; ② afficher le **coefficient de
  sécurité** `γ = F_rupture / F_réel` (langage d'ingénieur) ; ③ imposer un **γ minimal par niveau** dans le CdCF
  (ex. « γ ≥ 2 »), ce qui interdit le « ça tient à 99 % ». — **Reco :** ② pour la lecture + ③ pour la validation
  et les étoiles (§6.4).

- **Doc rot mineur :** le commentaire de `materials.js` affirme que `ruptureStress` *« n'est pas encore utilisé »* —
  c'est **faux**, `rupture.js` l'utilise. Plusieurs références internes « phase 1 / phase 2 » traînent aussi.
  À nettoyer (cosmétique).

### 3.4 Section & inertie — convention « profondeur 1 m » à clarifier

La section est modélisée comme un **rectangle de 1 m de profondeur**, donc `sectionArea (m²) = épaisseur (m)`,
et le moment quadratique devient `I = épaisseur³/12`. C'est **cohérent en interne**, mais : (a) on ne peut pas
régler **largeur et hauteur indépendamment** ; (b) impossible de représenter de **vrais profilés** (IPE, tube,
cornière) où `I` n'a aucun rapport simple avec l'aire. Pour rester pédagogique en 2D, ça suffit aujourd'hui ; si
un jour vous voulez « choisir un profilé », il faudra stocker **`sectionArea` ET `I` explicitement** dans le
catalogue (et non plus dériver `I` de l'épaisseur).

### 3.5 Charge d'exploitation traitée comme une *masse* (donc de l'inertie)

`mass.js` ajoute la charge de plancher (`FLOOR_LIVE_LOAD_PER_LENGTH`) à la **masse effective** du nœud. Elle
agit donc aussi comme de l'**inertie** dans la dynamique, pas seulement comme un **poids**. C'est un petit écart
au sens physique (une charge d'exploitation est un effort, pas une inertie de la structure). Sans gravité elle
« n'existe » plus, ce qui est l'effet voulu, mais elle ralentit les oscillations du nœud. Anecdotique tant qu'on
reste en statique ; à garder en tête si vous faites des scénarios dynamiques (séisme, choc).

### 3.6 Performance numérique vs réalisme

`PHYSICS_DT = 0.5 ms` (2000 pas/s, ~33 sous-pas par image à 60 fps). Imposé par la **raideur de l'acier**
(E = 210 GPa) : l'intégration **explicite** exige un pas petit pour rester stable. Le coût par image ≈
`33 × (nb d'éléments)`. Aujourd'hui (petites structures, barres seules) c'est négligeable. **Mais** la flexion
va **multiplier le nombre d'éléments** (subdivision des poutres, §4) et donc le coût. C'est le point de vigilance
n°1 pour les 30 PC (cf. §8).

---

## 4. La brique **flexion / flambement** (proposition technique)

C'est l'évolution qui débloque le plus : porte-à-faux qui fléchit, colonnes qui flambent *visiblement*, portiques
et structures à nœuds rigides (immeubles, grues, hangars). Deux familles de solutions, plus une recommandation.

### 4.1 Pourquoi le modèle barre ne suffit pas

Une barre = un ressort axial entre 2 points. Elle ignore **l'angle** que font entre elles deux poutres qui se
rejoignent, et l'angle d'une poutre par rapport à elle-même. Or **fléchir = faire varier ces angles** en y
opposant une résistance (la rigidité de flexion `EI`). Il faut donc introduire une **résistance angulaire**.

### 4.2 Option A — **Ressorts angulaires** + subdivision *(recommandé : réaliste à l'œil, fidèle à la philo du projet)*

Idée : ajouter, **en plus** des ressorts axiaux existants, des **ressorts de rotation** qui s'opposent au
changement d'angle. Deux usages complémentaires :

**(a) Nœud rigide (encastrement) entre deux poutres.** À un nœud reliant deux poutres, on ajoute un ressort
angulaire qui pénalise la variation de l'angle entre elles. Un **moment de rappel** `M = k_θ · Δθ` se traduit en
un petit **couple de forces** réparti sur les 3 nœuds concernés. Résultat : un **portique tient debout** sans
être triangulé, un cadre résiste au **dévers** sous le vent. On rend l'**encastrement** activable par nœud :
**« rotule (articulation) » vs « nœud rigide (encastrement) »** — c'est *exactement* la notion de **liaisons**
du programme de techno/SI (pivot vs encastrement), rendue **visible et manipulable**.

**(b) Poutre qui fléchit.** Une poutre « fléchissable » est **automatiquement subdivisée** en *n* segments
(nœuds internes), avec un ressort angulaire à chaque nœud interne, calibré sur `k_θ ≈ E·I / L_segment`. Alors :
- un **porte-à-faux** (poutre en L, masse au bout) **descend visiblement** → on **mesure la flèche**, on compare
  bois/acier, fin/large (lien direct avec `EI`) ;
- une **colonne élancée** comprimée se **courbe** continûment quand la charge dépasse la charge critique : du
  **vrai flambement animé**, pas un simple « ça casse ». Pédagogiquement imbattable pour Euler / l'élancement /
  « pourquoi on contrevente ».

**Pourquoi c'est le bon choix ici :** ça reste dans le **paradigme existant** (intégration explicite locale, pas
de matrice globale, pas de dépendance), donc **conforme à `CLAUDE.md`** (« local d'abord, code rudimentaire »).
On réutilise l'intégrateur, le rendu, la rupture. C'est la technique standard des simulations de tiges/cheveux/tissu
(« angular springs » / *discrete elastic rods*).

**Coûts / pièges à anticiper :**
- **Performance** : subdiviser multiplie les éléments. → ne subdiviser **que** les poutres marquées « fléchissable »,
  plafonner *n* (ex. 3–6 segments), et garder les treillis en 1 segment.
- **Calibrage** : il faut régler `k_θ` pour retomber sur la flèche théorique d'un cas connu (poutre encastrée
  chargée en bout : `f = F·L³/(3EI)`). À **valider sur un cas test** (vous avez déjà un dossier `testCases/` parfait
  pour ça).
- **Stabilité** : les ressorts angulaires raides peuvent exiger un `dt` encore plus petit. Prévoir un **garde-fou**
  (raideur angulaire bornée, ou sous-pas adaptatif).

### 4.3 Option B — **Solveur matriciel (méthode des rigidités / FEM)** *(efforts exacts, idéal pour la note)*

Assembler la matrice de rigidité globale `K` et résoudre `K·u = F` une fois pour obtenir directement déplacements,
**efforts normaux, efforts tranchants et moments**. Avec des éléments **« poutre » (3 DDL/nœud : 2 translations +
1 rotation)**, la flexion est **native et exacte** (pas besoin de subdiviser), et il n'y a **plus de problème de
pas de temps**.

- **Avantages :** résultats **justes du premier coup** (parfait pour **noter** : flèche, moment, coefficient de
  sécurité fiables) ; instantané ; gère les nœuds rigides sans bricolage.
- **Inconvénients :** il faut un **petit solveur linéaire** (Cholesky/Gauss, ~100–150 lignes, **sans dépendance
  externe**, donc compatible avec la philo) ; le modèle est **statique linéaire** (petits déplacements) : **pas**
  d'animation de grande déformation ni d'effondrement « spectaculaire », et le flambement se traite par **analyse
  linéaire de flambement** (valeur critique) plutôt que par une courbure animée.

### 4.4 Recommandation : **hybride**

- **Garder le moteur dynamique** (ressorts axiaux + **ressorts angulaires** de l'Option A) pour le **bac à sable
  vivant** : on **voit** ça bouger, fléchir, flamber, s'effondrer — c'est ce qui motive les élèves.
- **Ajouter une « analyse statique » (Option B)** déclenchable sur la structure stabilisée, qui fournit les
  **chiffres de référence fiables** (flèche, efforts, coef. de sécurité) servant à la **validation du niveau et au
  calcul des étoiles**. On ne note pas sur une valeur qui oscille : on note sur l'analyse statique.

> En résumé : **le dynamique pour le ressenti et la pédagogie de la ruine ; le statique pour la note.** Les deux
> partagent le même modèle de données (nœuds/poutres/liaisons), donc pas de duplication conceptuelle.

### 4.5 Ce que la flexion débloque côté contenu

Liaisons **pivot vs encastrement** (manipulable) · **flèche** d'un porte-à-faux et rôle de `EI` · **flambement**
animé et élancement · **contreventement** (cadre avec/sans diagonale sous le vent) · **descente de charges** dans
un immeuble · **moment** dans une flèche de grue (bras de levier). Voir la maquette « flexion/flambement » plus bas.

---

## 5. Diagnostic — Interface / UX

Objectif : se rapprocher du jeu de la photo (**maillage discret**, on relie des points, on choisit un matériau)
et rendre la construction **propre, rapide, et notable**.

### 5.1 Accrochage sur maillage discret — *le manque n°1 vs la photo*

Aujourd'hui `handleAddNode` place le nœud à la coordonnée flottante du clic ; la grille est un **simple décor**
(`grid.js`), elle n'accroche rien. Le jeu de référence, lui, repose sur un **réseau de points discret**.
→ **Propositions :**
- **Snap au maillage** : tout nœud créé/déplacé se cale sur l'intersection de grille la plus proche (pas configurable :
  1 m, 0,5 m…). Construction **précise, propre et comparable** d'un élève à l'autre (indispensable pour noter).
- **Point fantôme** : surligner sous le curseur le point de grille visé avant le clic.
- **Mode « maillage prédéfini »** (façon photo) : un niveau peut **pré-poser un réseau de points** (et des **points
  d'ancrage imposés** aux appuis) qu'on se contente de **relier** — c'est exactement votre description.

### 5.2 Construction du tracé

- **Pas de déplacement de nœud** : on ne peut qu'ajouter/supprimer. Déplacer = supprimer + reconstruire (on perd
  les poutres). → **outil Déplacer** (glisser un nœud, avec snap).
- **Pas d'aperçu** lors du tracé d'une poutre (clic A puis clic B « à l'aveugle »). → **ligne élastique** qui suit le
  curseur + **infobulle live** (longueur, matériau, **coût**) pendant le tracé.
- **Pas de glisser-pour-tracer**, pas de multi-sélection, **pas d'annuler (Undo)**. L'**undo** est crucial pour des
  collégiens qui se trompent de clic. → pile d'**annuler/refaire** (facile : vous avez déjà `structuredClone` pour
  les snapshots), **glisser pour tracer**, **sélection rectangle** + suppression groupée.

### 5.3 Lecture des efforts

- L'étiquette **« % de rupture » est affichée en permanence sur chaque poutre** → illisible dès qu'il y a beaucoup
  d'éléments. **Pistes :** ① **code couleur** (**bleu = compression, rouge = traction**, **intensité = taux de
  travail**) + étiquette chiffrée **au survol/sélection** seulement + **légende** ; ② **épaisseur du trait**
  proportionnelle à l'effort (lisible même en noir et blanc) ; ③ **flèches d'effort** le long des barres
  (traction vers l'extérieur, compression vers l'intérieur) ; ④ un **bouton « afficher les efforts »** activable
  à la demande. — **Reco :** ① + ④ ; ② et ③ en options d'accessibilité. Visualiser « où passe l'effort »
  est *en soi* la grande leçon de SI (chemin des charges, traction vs compression).

### 5.4 Charges & forces

- L'**éditeur de forces** (sinus/keyframes, axe x/y, affectation par cases à cocher) est **puissant mais trop
  abstrait** pour des collégiens. → pour les niveaux, une **bibliothèque de charges illustrées** (« camion 3,5 t »,
  « vent », « charge d'exploitation », « neige sur toiture ») posées en un clic ; on **garde** l'éditeur avancé pour
  le **mode bac à sable / prof**.

### 5.5 Sauvegarde & comptes élèves

- La persistance est en **`localStorage`** uniquement (piégée par navigateur/poste). `exportStructure()` existe déjà
  mais **n'est pas branché** au backend. **Pistes :** ① garder `localStorage` mais ajouter **import/export d'un
  fichier** `.json` (l'élève emporte son travail, le prof le récupère) — minimal ; ② brancher
  **sauvegarde/chargement sur `/api/` + SQLite** (comptes élèves déjà présents dans `server.py`) : l'élève
  retrouve son travail sur **n'importe quel poste** ; ③ idem + **collecte/notation côté prof** (le prof voit les
  rendus et les étoiles de chaque élève). — **Reco :** ② puis ③. Le chapitre « **s07 Ponts** » (aujourd'hui un
  fichier placeholder) est précisément la place d'accueil de tout ça.

### 5.6 Divers UX

Canvas à résolution fixe 800×500 (un **redimensionnement responsive** aiderait sur des écrans variés) · pas de
**raccourcis clavier** · pas de tactile. Mineur, mais à planifier si déploiement large.

> **Note de lecture.** À partir d'ici (et rétro-appliqué aux §3 et §5), chaque problème est présenté avec
> **plusieurs pistes** ①②③ classées de la plus simple à la plus ambitieuse, suivies d'une **Reco**. À vous de
> doser selon le temps disponible et l'âge des classes.

---

## 6. Le **système de niveaux** (cœur pédagogique)

Rien de tout cela n'existe aujourd'hui. C'est le gros morceau « jeu sérieux ». On le veut **exigeant** : on
**découvre** les notions de SI **parce qu'on est obligé** de satisfaire un vrai cahier des charges.

### 6.1 Le cahier des charges fonctionnel (CdCF) — comment le représenter

**Le problème :** définir, par niveau, un ensemble de contraintes vérifiables, et le rendre lisible par l'élève.

- **Piste ① — Liste de critères vérifiés un par un (checklist).** Chaque critère est une ligne avec son
  **état (✓/✗)**, la **valeur exigée** et la **valeur atteinte**. Le plus clair et le plus pédagogique.
- **Piste ② — Fonctions de validation paramétriques.** Chaque critère = une petite fonction
  `(structure, analyse) → {ok, valeurAtteinte, valeurRequise, message}`. Catalogue de critères réutilisables
  (budget, matériaux, portée, charge, flèche, gabarit…). Extensible sans toucher au reste.
- **Piste ③ — DSL/déclaratif** (un mini-langage de critères dans un fichier de niveau). Élégant mais sans doute
  **sur-ingénierie** au regard de `CLAUDE.md`.

**Reco :** ② **pour le moteur** + ① **pour l'affichage**. Catalogue de critères typiques : budget max, matériaux
autorisés/interdits, **points d'ancrage imposés**, **portée à franchir**, **gabarit à laisser libre** (un trou
H×L pour le passage d'un bateau/d'une route), **charge à supporter** (camion, vent, neige) **sans rupture**,
**flèche max** (ex. portée/300), nombre de poutres max, masse max, **rester dans une boîte de construction**.

### 6.2 Le budget réel — répondre précisément à votre point « (500 €) »

**Le problème actuel :** aucun coût n'est affiché ; on ne « sent » pas qu'on dépasse.

- **Piste ① — Coût comparé en clair : `Coût : 540 € / 500 € ✗`.** On voit en direct le **dépensé vs le plafond**,
  la ligne devient **rouge** au dépassement, et le niveau **n'est pas validé**. C'est exactement votre demande :
  ne pas afficher juste « (500 €) » mais bien **dépensé / autorisé**, pour comprendre **pourquoi** ça échoue.
- **Piste ② — Jauge/barre de budget** qui se remplit et **passe en rouge** au dépassement (plus visuel).
- **Piste ③ — Décompte par poste** (tant d'acier, tant de bois, tant de câble) pour analyser *où* part l'argent.

**Coût d'une poutre :** `prix = coût_unitaire(matériau) [€/m] × longueur`. Ajouter un **`coûtParMètre`** à chaque
type de poutre dans `materials.js`. Le **prix porte la leçon** : bois pas cher mais faible, acier cher mais
résistant, câble pas cher mais traction seule, béton pas cher/lourd/compression seule. **Reco : ① + ② ensemble**
(chiffre exact + jauge), ③ en bonus « analyse ».

### 6.3 La validation — « tout le cahier doit être respecté »

**Le problème :** comment décider qu'un niveau est réussi, sans donner l'impression que « presque » suffit.

- **Piste ① — ET logique strict :** validé **si et seulement si** *tous* les critères obligatoires sont ✓.
  Un seul ✗ (budget, matériau, flèche…) ⇒ **non validé**, et la checklist montre **lequel**. Conforme à votre
  exigence.
- **Piste ② — Critères obligatoires + optionnels :** les obligatoires conditionnent la validation ; les
  optionnels (esthétique, économie) ne servent **qu'aux étoiles** (§6.4).
- **Piste ③ — Critères durs + avertissements :** certains points bloquants, d'autres en simple « ⚠ attention »
  (utile pour des notions secondaires sans pénaliser).

**Reco :** ② — un **noyau dur obligatoire** (sécurité + budget + cahier) en ET strict, plus des **critères
d'excellence** qui ne jouent que sur les étoiles. On **teste d'abord la charge** (simulation) **puis** on évalue
le CdCF sur la **structure stabilisée / l'analyse statique** (§4.4).

### 6.4 Le barème **3 étoiles** — transparent et pédagogique

**Le problème :** noter sans que ce soit arbitraire ni « il suffit que ça ne tombe pas ».

- **Piste ① — Paliers fixes :** ★ = CdCF validé · ★★ = + sous le budget d'une marge (ex. ≥ 15 %) **ou** coef.
  sécurité ≥ cible · ★★★ = **les deux** (économique **et** sûr).
- **Piste ② — Score continu seuillé :** un score `f(coût, marge de sécurité, masse, nb de poutres)` converti en
  1–3 étoiles. Plus fin, mais expliquer la formule à l'élève est plus dur.
- **Piste ③ — Étoiles thématiques :** une étoile « **sécurité** » (marge), une « **économie** » (budget), une
  « **sobriété/élégance** » (matière minimale). L'élève voit **quel objectif d'ingénieur** il a atteint.

**Reco :** ① **ou** ③ (les deux sont transparents). Le principe clé : **récompenser les compromis d'ingénieur**
(coût ↔ sécurité ↔ matière), pas seulement « ça tient ». Barème **affiché à l'avance** dans le niveau.

### 6.5 L'écran de **verdict** (fin de test)

**Le problème :** aujourd'hui, rien ne conclut le test.

- **Piste ① — Panneau latéral récap** : checklist CdCF + étoiles + chiffres clés (coût, taux de travail max,
  flèche max, masse) + une phrase « à améliorer ».
- **Piste ② — Modale de fin de niveau** (façon jeu) avec animation des étoiles + boutons *Rejouer / Améliorer /
  Niveau suivant*.
- **Piste ③ — Rapport imprimable / exportable** (PDF ou page) que l'élève rend au prof — s'appuie sur vos skills
  de génération de documents.

**Reco :** ② pour l'élève (motivation) + ③ en option « rendu » (le prof récupère un rapport). Voir la maquette
« verdict 3 étoiles » plus bas.

### 6.6 Architecture des niveaux — *data-driven*, fidèle à `CLAUDE.md`

**Le problème :** où et comment stocker les niveaux sans alourdir l'engine.

- **Piste ① — Un fichier par niveau dans `js/levels/`** (même esprit que `model/testCases/`) : maillage/ancrages
  imposés, obstacles de gabarit, palette de matériaux + coûts disponibles, **liste de critères CdCF**, barème
  d'étoiles, texte d'intro. + un `levelValidator.js` qui évalue les critères sur la structure stabilisée. + un
  panneau verdict. **Engine générique, scénarios en données** = exactement votre règle « tout ce qui peut être
  configuré l'est ».
- **Piste ② — Niveaux en JSON** (éditables sans toucher au JS) : pratique pour qu'un prof crée un niveau, mais il
  faut un mini-format documenté.
- **Piste ③ — Niveaux décrits dans votre Markdown propriétaire** (`contenu/…/s07 Ponts/…`) et compilés par
  `build.py` : intègre les niveaux **dans le parcours pédagogique** existant. Plus de travail d'intégration, mais
  cohérence maximale avec le site.

**Reco :** ① pour démarrer (rapide, typé), puis ② ou ③ quand vous voudrez **déléguer la création de niveaux**.
Dans tous les cas : brancher l'enregistrement des **étoiles par élève** sur `/api/` + SQLite (cf. §5.5).

---

## 7. Élargir le bac à sable — d'autres structures que les ponts

L'engine (nœuds + poutres + ancrages + charges) est déjà **générique** : ce sont surtout des **scénarios** + la
**flexion** (§4) + quelques **charges typées** (§5.4) qui manquent. Idées de familles, avec la notion de SI visée :

- **Ponts** (déjà bien outillé) : franchir une travée, **camion qui passe** (charges mobiles ✓), laisser un
  **gabarit de navigation**. Notions : triangulation, traction/compression, tablier.
- **Immeuble / tour** : vertical, supporter **poids propre + planchers (charge d'exploitation) + vent latéral**.
  Notions : **descente de charges**, **contreventement**, pourquoi un plancher n'est pas qu'un sol.
- **Grue** : **flèche en porte-à-faux** portant une charge au bout + **contrepoids**. Notions : **moment**, **bras
  de levier**, équilibre, tension du tirant / compression de la flèche. *(Nécessite la flexion ou une flèche bien
  triangulée.)*
- **Hangar / charpente** : **ferme de toiture** ou **portique** de grande portée, **charge de neige** au-dessus.
  Notions : fermes, portiques, dévers, pourquoi on triangule.
- **Porte-à-faux / balcon** : la **démo de flèche** par excellence (§4.5).
- **Pylône / tour télécom**, **passerelle**, **téléphérique** (câbles), **échafaudage**.
- **Bac à sable libre** (comportement actuel) : conservé pour l'exploration et les démos du prof.

**Piste de mise en œuvre :** chaque famille = surtout un **jeu de niveaux** (CdCF + charges + décor) au-dessus du
**même** engine. Peu de code spécifique si la flexion et les charges typées sont en place.

---

## 8. Performance & déploiement (30 PC, serveur maison)

**Le problème :** garder la simulation fluide sur des postes modestes, surtout une fois la flexion ajoutée.

D'abord, **rassurant** : le serveur ne fait que **servir des fichiers statiques** (le simulateur est copié tel
quel par `build.py`, tout le calcul est **dans le navigateur**). 30 élèves = 30 requêtes statiques de quelques
centaines de Ko : **trivial** pour un serveur maison. Le seul vrai budget est le **CPU de chaque poste**.

- **Piste ① — Plafonner la taille des structures par niveau** (nb de nœuds/poutres) : le levier le plus simple et
  le plus efficace.
- **Piste ② — Réglage « Qualité »** (sous-pas / précision) : un mode « fluide » sur les vieux PC, un mode
  « précis » sur les bons. `MAX_STEPS_PER_FRAME` ralentit déjà gracieusement, à exposer.
- **Piste ③ — Limiter la flexion** : ne subdiviser que les poutres « fléchissables », plafonner *n* segments,
  garder les treillis en 1 segment (cf. §4.2).
- **Piste ④ — Basculer les cas raides/grands sur le solveur statique** (§4.3) : pas de sous-pas, donc coût
  indépendant de la raideur.
- **Piste ⑤ — Geler les structures stabilisées** : une fois l'énergie cinétique ≈ 0, **stopper l'intégration**
  (plus rien ne bouge) jusqu'à la prochaine interaction → CPU quasi nul au repos.

**Reco :** ① + ⑤ d'emblée (gros gain, peu de risque), ② et ③ avec la flexion, ④ si vous visez de grandes
structures. **Profilez sur le PC le plus faible de la salle** avant de fixer les plafonds.

---

## 9. Roadmap proposée (par lots indépendants)

Chaque lot apporte de la valeur seul ; l'ordre privilégie « effet pédagogique / effort ».

1. **Lot UX de base** *(rapide, fort impact)* : snap au maillage · point fantôme · déplacement de nœud · aperçu
   du tracé · **annuler** · code couleur traction/compression + légende. → la construction devient « jeu ».
2. **Lot Budget & coûts** *(rapide)* : coût/m par matériau · affichage `dépensé / autorisé` + jauge. Indépendant
   du reste, déjà très parlant.
3. **Lot Niveaux & verdict** : `levels/` + `levelValidator.js` (CdCF en ET strict) · écran verdict · **3 étoiles**.
   S'appuie sur le lot 2. Brancher la sauvegarde sur `/api/` + SQLite.
4. **Lot Matériaux réalistes** : `tensileStrength`/`compressiveStrength` séparés · coefficient de sécurité ·
   stabilisation détectée (efforts lus à l'équilibre).
5. **Lot Flexion** *(le plus technique)* : ressorts angulaires · liaisons rotule/encastrement · subdivision des
   poutres fléchissables · **flambement animé**. Valider sur un cas test (flèche `F·L³/3EI`).
6. **Lot Analyse statique** *(optionnel, pour la note exacte)* : solveur matriciel pour flèche/efforts/coef. de
   sécurité fiables.
7. **Lot Scénarios** : packs de niveaux ponts → immeubles → grues → hangars, chacun ciblant des notions de SI.

---

## 10. Petits correctifs / dette technique

- **Commentaire faux** dans `materials.js` (« `ruptureStress` pas encore utilisé » → il l'est dans `rupture.js`).
- Références internes **« phase 1 / phase 2 »** éparpillées (historique de dev qui fuite dans le code livré).
- `ruptureStress` **identique en traction et compression** (cf. §3.3).
- Étiquette « % de rupture » **toujours affichée** (cf. §5.3) → bruit visuel.
- **Persistance `localStorage` seule**, `exportStructure()` non branché au backend (cf. §5.5).
- **Convention section = épaisseur** (profondeur 1 m) à documenter si on vise de vrais profilés (cf. §3.4).

---

*Fin du document. Les maquettes (grille discrète, cahier des charges + budget, verdict 3 étoiles, flexion/flambement)
sont fournies séparément dans le fil de discussion.*
