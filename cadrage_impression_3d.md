# Cadrage — Impression 3D intégrée à l'Atelier 3D

Document de cadrage, pas de plan d'exécution. Il fixe ce qu'on veut **maintenant**, **plus tard** et **jamais**, à partir de l'état réel du code (septembre 2026) et du fonctionnement des trancheurs de référence (OrcaSlicer, Bambu Studio, PrusaSlicer, Cura).

Machines visées : **Bambu Lab P1P et P1S**, avec ou sans **AMS**.

---

## 1. Où en est l'Atelier 3D (ce sur quoi on construit)

Ce que le code offre déjà, et qui compte pour l'impression :

| Existant | Où | Intérêt pour l'impression |
|---|---|---|
| Document = arbre de nœuds immuable, sérialisé en JSON léger, versionné avec migrations | `noyau/document.js`, `serialisation_document.js`, `migrations_document.js` | On peut y ajouter une section `impression` sans casser les projets existants (format v3 + migration). |
| Chaque objet a **une** transformation (position, rotation, échelle, appui) | `noyau/noeud.js` | C'est la position **d'assemblage**. La position **sur le plateau** doit être une seconde transformation, stockée à part (voir §3). |
| Les maillages sont construits **à l'origine**, la transformation n'est appliquée qu'à l'affichage | `protocole_ouvrier.js` | Replacer une pièce sur le plateau ne recalcule aucune géométrie. |
| Liste des pièces visibles (groupes fondus, esquisses exclues) | `noyau/objets_affichables.js` | C'est la liste de départ des « pièces imprimables ». |
| Moteur Manifold 3.5.3 (WASM) dans un Web Worker, avec `CrossSection` (Clipper2 : décalages, booléens 2D) | `geometrie/ouvrier_geometrie.js`, `construction_du_solide.js` | La découpe en couches et les parois reposent sur ces deux briques. **À vérifier :** que `slice(z)` est bien exposé dans cette version. |
| Suivi des parties d'un groupe (`originalID` → chemin) et couleurs par partie | `construction_du_solide.js` | Base naturelle pour l'attribution des filaments AMS. |
| Voyant d'étanchéité | maillage `etanche` | Garde-fou avant découpe : un solide non étanche ne se découpe pas proprement. |
| Pose sur une face, normale d'appui | `outil_poser.js`, `pose_sur_face.js` | Réutilisable pour « poser à plat sur cette face » sur le plateau. |
| Variables bornées et formules, bibliothèque d'objets paramétriques | `noyau/variables.js`, `bibliotheque_d_objets.js` | Le Clip A contient **déjà** `clip_ligne` et `clip_couche` : la conception dépend du réglage d'impression. C'est le lien à exploiter. |
| Export STL binaire | `geometrie/export_stl.js` | Reste la sortie de secours vers Orca pendant toute la transition. |
| Serveur Flask + hébergeur en ligne, Raspberry Pi prévu | `server.py` | **Contrainte majeure** : un serveur en ligne ne voit pas les imprimantes du réseau local (§6). |

Ce qui n'existe pas encore : aucune notion de plateau, de machine, de filament, de réglage d'impression, ni de trajet d'outil.

L'Atelier n'a pas encore servi en conditions réelles. Le trancheur doit donc **dépendre le moins possible** des détails internes du modeleur : il consomme des maillages étanches positionnés et quelques informations de nœud (nom, couleur, réglages attachés), rien d'autre.

---

## 2. Principe directeur

> Orca ne reçoit qu'un maillage. L'Atelier connaît l'intention : ce qui est un clip, un trou, une variable, une pièce.

Le trancheur est utile s'il exploite cette connaissance. Sinon, on refait Orca en moins bien. Donc :

1. **Parité de base avec Orca sur ce qu'on utilise vraiment** : une pièce PLA/PETG ordinaire doit sortir aussi bien qu'avec Orca.
2. **Réglages attachés aux objets de la conception**, pas à des volumes modificateurs posés à la main.
3. **Aller-retour entre la conception et l'impression** : le résultat de la découpe se relit dans la vue 3D (sens des lignes, parois, zones fragiles).
4. **Données de référence reprises, code non copié** (§7).

---

## 3. Les deux mondes : « Conception » et « Impression »

### Ce que l'utilisateur voit
- Deux onglets en haut : **Conception** (l'atelier actuel) et **Impression**.
- **Impression** : un plateau P1 (256 × 256 mm, hauteur 256 mm), les pièces imprimables posées dessus, les réglages à droite, le bouton **Découper** puis **Imprimer**.
- Retour dans **Conception** : l'assemblage est intact. Retour dans **Impression** : chaque pièce est là où on l'avait laissée sur le plateau.
- Après une découpe, la vue **Conception** peut afficher chaque pièce **telle qu'elle sera imprimée** : couches, parois, sens du remplissage, **dans le repère de l'assemblage**. Une pièce couchée sur le plateau montre ses couches dans le bon sens une fois remontée dans l'assemblage. C'est l'outil pour repérer les zones fragiles (efforts perpendiculaires aux couches, parois trop fines).

### Modèle de données proposé
Une section `impression` dans le document, à côté de `racine`, `coupes`, `variables` :

```
impression: {
  machine:  "p1s",                       // profil machine choisi
  plateaux: [{
    id, nom,
    reglages: "pla_standard_020",        // profil de réglages de base
    pieces: [{
      source,                            // id du nœud d'origine (objet affichable)
      partie?,                           // chemin d'une partie si on imprime une pièce d'un groupe séparément
      placement: { position, rotation }, // transformation SUR LE PLATEAU, indépendante de l'assemblage
      exemplaires?,                      // nombre de copies
      reglages?: { ... },                // écarts par rapport au profil (§5)
      filament?: 1..4                    // emplacement AMS
    }]
  }]
}
```

Règles :
- La transformation d'assemblage et le placement sur le plateau sont **indépendants**. Déplacer une pièce dans l'assemblage ne la déplace pas sur le plateau, et inversement.
- Une pièce modifiée en conception (paramètres, esquisse) reste à sa place sur le plateau. Seule la géométrie change. Si elle déborde du plateau ou chevauche une autre pièce, on l'**avertit**, on ne la déplace pas d'office.
- Une pièce supprimée en conception disparaît du plateau. Une pièce ajoutée n'y apparaît **pas** d'office : on l'ajoute explicitement (« Mettre sur le plateau »), sinon les vis et les pièces du commerce de l'assemblage s'imprimeraient.
- Un objet paramétrique à plusieurs pièces (le Clip A : mâle + femelle dans un seul objet) doit pouvoir être **éclaté sur le plateau** sans être dégroupé en conception. D'où le champ `partie`.

---

## 4. Inventaire des fonctions des trancheurs, trié

Base : onglets de réglages d'OrcaSlicer (Qualité, Résistance, Vitesse, Supports, Multimatériau, Autres) et barre d'outils du plateau, comparés à PrusaSlicer et Cura.

### 4.1 Maintenant — le socle (on ne peut pas imprimer sans)

**Plateau**
- Ajouter/retirer une pièce, déplacer, tourner autour de Z, poser à plat sur une face
- Disposition automatique simple (rangement en rangées ; pas d'imbrication optimale)
- Détection de débordement du volume et de chevauchement
- Plusieurs exemplaires d'une pièce

**Qualité**
- Hauteur de couche unique (0,08 à 0,28 mm) et hauteur de la première couche
- Largeur de ligne : par défaut, parois extérieures, parois intérieures, dessus, remplissage, première couche
- Ordre des parois (intérieur puis extérieur, ou l'inverse)
- Couture : **alignée** ou **au plus près** (les deux modes les plus utilisés)

**Résistance**
- Nombre de parois
- Nombre de couches pleines dessus/dessous, ou épaisseur minimale
- Motif des couches pleines : lignes rectilignes, alternées à 90°
- Remplissage : densité, motifs **lignes, grille, gyroïde** (couvrent l'essentiel des usages)
- Chevauchement remplissage/parois

**Vitesse, accélération, refroidissement**
- Vitesses par type de ligne, vitesse de première couche, vitesse de déplacement
- Accélérations (le P1 les encaisse ; reprises des profils Bambu)
- Débit volumétrique maximal par filament : c'est **la** limite réelle des P1, elle plafonne toutes les vitesses
- Ventilateur pièce : couches sans ventilation, vitesse min/max selon le temps de couche, ralentissement des petites couches

**Adhérence**
- Jupe, bordure (largeur), pas de radeau

**Machine et G-code**
- Profils P1P et P1S : volume, G-code de début et de fin de Bambu, ventilateurs (auxiliaire et caisson sur P1S uniquement)
- Rétraction (longueur, vitesse), Z-hop, éviter de traverser les parois
- Températures buse/plateau par filament, types de plateau (Cool/Engineering/High Temp/Textured PEI)
- Sortie **`.gcode.3mf`** au format attendu par le firmware Bambu, plus l'export `.gcode` brut pour contrôle

**Aperçu**
- Vue couche par couche, curseur de couche, couleurs par type de ligne
- Estimation du temps et de la quantité de filament (en mètres et en grammes)

**Profils**
- Trois niveaux, comme Orca : **machine**, **filament**, **réglages**. Valeurs de départ reprises des profils Bambu pour PLA et PETG (§7).
- Profils enregistrables et modifiables ; un écart local s'affiche comme dans Orca (valeur modifiée signalée, retour à la valeur du profil en un clic).

**Envoi**
- Envoi à l'imprimante en réseau local, lancement, état (couche en cours, temps restant, températures), pause et arrêt.

### 4.2 Maintenant — ce qui justifie le projet (différence avec Orca)

- **Réglages par pièce** (§5) : largeur de ligne, parois, dessus/dessous, remplissage, vitesses, attribués à une pièce ou à un groupe de pièces du plateau.
- **Réglages portés par la conception** : un nœud (ou un objet de la bibliothèque) déclare les réglages dont il a besoin. Exemple : le Clip A exige `largeur de ligne = clip_ligne` et `hauteur de couche = clip_couche`. Au passage sur le plateau, ces valeurs s'appliquent, ou un conflit est signalé (couche du clip ≠ couche du plateau).
- **Lien variables ↔ réglages** : une variable de projet peut lire un réglage d'impression (`impression.couche`, `impression.ligne`) pour dimensionner une pièce (épaisseur de paroi = 3 × largeur de ligne).
- **Aperçu de la découpe dans la vue Conception** (§3).

### 4.3 Plus tard — utile, mais après un socle fiable

Ordre approximatif de priorité :

1. **AMS et multicouleur** : association couleur de la pièce → emplacement AMS, lecture des bobines chargées (type, couleur, via l'état MQTT de l'imprimante), changements de filament, **tour de purge**, volumes de purge par paire de couleurs, purge dans le remplissage ou dans un objet. C'est un gros chantier : la tour de purge et l'ordre des changements pèsent autant que tout le reste du trancheur. Placé en premier dans « plus tard » parce que c'est l'objectif affiché.
2. **Supports** : d'abord les supports classiques (grille, angle seuil, distance Z, interface), puis arborescents. Les supports arborescents d'Orca sont ce qu'il y a de plus complexe dans le logiciel.
3. **Zones de réglage** dans une pièce : un volume de l'atelier marqué « zone » (comme on marque un « trou » aujourd'hui) qui change les réglages à l'intérieur (plus de parois autour d'une fixation, remplissage 100 % dans une accroche). C'est l'équivalent des modificateurs d'Orca, mais dessiné et paramétré dans la conception.
4. **Hauteur de couche adaptative** selon la pente des surfaces, **pour tout le plateau**. Un seul jeu de couches par plateau (cf. §5).
5. **Ponts** : détection, sens optimal, débit et vitesse propres. **Surplombs** : ralentissement selon l'angle.
6. **Largeur de ligne variable** (type Arachne) dans les parois fines, et **remplissage des vides** entre parois.
7. **Lissage** (ironing) des faces du dessus.
8. **Motifs de remplissage supplémentaires** : cubique, nid d'abeille, adaptatif, remplissage renforcé seulement là où il porte le dessus.
9. **Couture** choisie ou peinte, masquée dans un angle.
10. **Arcs G2/G3** (arc fitting), réduction du nombre de lignes de G-code.
11. **Calibrations** : débit, pression d'avance (le P1 l'a en automatique sur plateau, mais le réglage manuel reste utile), température, rétraction, avec leurs objets de test générés par l'atelier.
12. **Suivi à distance** : image de la caméra, timelapse.
13. **Plusieurs plateaux** dans un même projet, envoyés l'un après l'autre.
14. **Innovations propres** (à explorer une fois le socle en place) : orientation proposée selon les efforts déclarés dans la conception (sens des couches perpendiculaire à l'effort), avertissement sur les parois trop fines pour le nombre de lignes réglé, réglages suggérés par l'objet de bibliothèque.

### 4.4 Non — ce qu'on ne fera pas

Sûr :
- **Autres marques d'imprimantes** (Prusa, Creality, Klipper, Marlin générique, OctoPrint). Deux machines, un seul firmware : chaque imprimante ajoutée multiplie les cas.
- **Cloud Bambu** : pas de compte Bambu, pas de serveurs Bambu. Réseau local uniquement.
- **Hauteur de couche différente d'une pièce à l'autre sur un même plateau** : écarté par l'utilisateur (Orca le permet, au prix de collisions et de trajets compliqués).
- **Impression pièce par pièce** (« by object », chaque pièce terminée avant la suivante) : sur les P1, elle impose des règles de hauteur et de collision avec la tête qui ne valent pas l'effort.
- **Radeau** : inutile sur plateaux PEI.
- **Impression non plane, axes supplémentaires, découpe en coordonnées cylindriques.**
- **Résines, découpe laser, fraisage.**
- **Import STEP/3MF externe complet** : l'atelier importe déjà du STL. Réimporter les projets Orca (3MF avec leurs réglages) n'apporte rien.

Probable, à confirmer à l'usage :
- **Peinture de couleur sur la surface** (MMU painting d'Orca) : dans l'atelier, la couleur est portée par les pièces et les parties, ce qui couvre le besoin sans pinceau.
- **Texture floue (fuzzy skin), motifs de surface** : gadget pour un usage technique.
- **Découpe d'objet dans le trancheur** (outil Couper d'Orca) : se fait dans la conception.
- **Imbrication optimale** des pièces sur le plateau : la disposition simple suffit.
- **Réglages « par plage de hauteur »** (changer un réglage entre deux hauteurs) : couverts plus proprement par les zones de réglage.

---

## 5. Réglages par pièce : ce qui peut varier, et ce qui ne peut pas

La règle physique : **toutes les pièces d'un plateau partagent les mêmes couches.** Le plateau monte d'une couche à la fois pour tout le monde, avec une seule buse.

| Réglage | Par pièce ? | Remarque |
|---|---|---|
| Hauteur de couche, première couche | ❌ plateau | Choix de l'utilisateur. |
| Hauteur adaptative | ❌ plateau | La même pour toutes les pièces : c'est la pièce la plus exigeante à chaque hauteur qui fixe la couche. |
| Diamètre de buse, machine, type de plateau | ❌ plateau | |
| Températures buse et plateau | ❌ plateau | Par filament, pas par pièce. |
| Ventilation | ❌ plateau | Un seul ventilateur pièce ; ralentissement des petites couches calculé sur la couche entière. |
| Largeur de ligne (toutes catégories) | ✅ | Voir transitions ci-dessous. |
| Nombre de parois, ordre, couture | ✅ | |
| Dessus/dessous (nombre, motif) | ✅ | |
| Remplissage (densité, motif, angle) | ✅ | |
| Vitesses, accélérations | ✅ | Limitées par le débit max du filament. |
| Filament (AMS) | ✅ | Plus tard. |
| Supports | ✅ | Plus tard. |

**Transitions.** Entre deux pièces séparées, il n'y en a pas : chaque pièce a ses propres lignes. Le cas délicat est une **zone de réglage à l'intérieur d'une pièce** (plus tard) : là où deux largeurs de ligne se rencontrent, il faut un recouvrement à la frontière (comme le chevauchement remplissage/parois). On le traitera avec les zones, pas avant.

**Priorité des valeurs** (de la plus faible à la plus forte) : profil de réglages du plateau → valeurs exigées par l'objet de conception → écart posé à la main sur la pièce du plateau. Toute valeur exigée par la conception et contredite à la main est signalée.

---

## 6. Machine et réseau : ce qu'il faut savoir avant d'écrire une ligne

**Liaison avec les P1P/P1S en réseau local :**
- État et commandes : **MQTT sur TLS**, port **8883**, identifiant `bblp`, mot de passe = **code d'accès** affiché sur l'écran de l'imprimante.
- Envoi du fichier : **FTPS implicite**, port **990**, même code d'accès, puis ordre MQTT « imprimer ce fichier » avec le plateau, l'usage de l'AMS et la correspondance des emplacements.
- État AMS reçu en MQTT : bobines présentes, type, couleur, humidité. C'est ce qui permettra plus tard de proposer l'association couleur → emplacement.

**Contraintes :**
- **Un navigateur ne peut parler ni MQTT/TLS brut ni FTPS.** Tout passe par le serveur Python (`server.py`, stdlib : `ssl`, `socket`, `ftplib.FTP_TLS`, petit client MQTT maison).
- **Le serveur doit être sur le même réseau que les imprimantes.** L'hébergeur en ligne actuel ne peut pas les joindre. L'envoi à l'imprimante suppose donc le **Raspberry Pi** (ou le poste local qui fait tourner Flask). Tant qu'il n'est pas en place : export `.gcode.3mf` à envoyer par carte SD ou via Bambu Studio.
- **Firmware Bambu** : depuis 2025, le contrôle par des logiciels tiers est restreint. Il faudra activer le **mode LAN** et le **mode développeur** sur chaque imprimante, ce qui coupe l'application Bambu Handy et le cloud. **À vérifier sur le firmware installé avant de commencer ce jalon.** C'est le seul point qui peut bloquer l'envoi direct ; tout le reste du projet (découpe, aperçu, export) n'en dépend pas.
- **P1P ≠ P1S** dans le G-code : le P1S a un ventilateur auxiliaire et un ventilateur de caisson, le P1P non (sauf kit). Deux profils machine distincts.

**Le `.gcode.3mf` Bambu** : une archive ZIP (stdlib `zipfile` côté serveur, ou écriture ZIP simple côté navigateur) avec `Metadata/plate_1.gcode`, son empreinte MD5, `plate_1.json`/`slice_info.config` (filaments utilisés, temps, poids) et une vignette. On reproduira la structure produite par Bambu Studio/Orca, à partir d'un fichier réel qu'ils ont généré.

---

## 7. Références : ce qu'on reprend, et comment

- **Licence.** OrcaSlicer, Bambu Studio et PrusaSlicer sont sous **AGPL-3.0**. Copier ou traduire leur code en JavaScript ferait de l'Atelier une œuvre dérivée AGPL, avec obligation de publier les sources du site. **On ne copie pas le code** : on s'inspire des algorithmes décrits (publications, documentation, lecture du code pour comprendre) et on réécrit.
- **Données.** Les **valeurs** des profils Bambu (températures, vitesses, débits max, G-code de début et de fin) sont des réglages de fabricant. On les reprend comme point de départ, avec leur source notée dans le profil.
- **Algorithmes de référence** :
  - découpe d'un maillage en contours : intersection triangle/plan et chaînage des segments (ou `slice` de Manifold) ;
  - parois : décalages successifs (Clipper2, déjà dans Manifold) ;
  - dessus/dessous : différences booléennes entre la couche et ses voisines ;
  - remplissage : hachures découpées par la zone intérieure ; gyroïde par isolignes ;
  - parois de largeur variable : Arachne (article de Kuipers et al., 2020) ;
  - supports arborescents : organiques de PrusaSlicer/Cura, plus tard.
- **Validation** : découper la même pièce dans Orca et dans l'Atelier, comparer couche par couche (aperçu côte à côte), temps estimé et quantité de filament. C'est le critère « aussi bien qu'Orca » du §4.1.

---

## 8. Découpage en jalons

Chaque jalon se termine par quelque chose d'utilisable. Aucun ne suppose le suivant.

| Jalon | Contenu | Livré quand |
|---|---|---|
| **I0 — Plateau** | Onglet Impression, section `impression` du document (format v3 + migration), mettre sur le plateau, placer/tourner/poser à plat, aller-retour avec la Conception, export STL du plateau | On prépare un plateau dans l'Atelier et on l'ouvre dans Orca à l'identique. |
| **I1 — Couches et parois** | Découpe en couches dans l'ouvrier, parois, aperçu couche par couche | L'aperçu des parois correspond à celui d'Orca sur 3 pièces de test. |
| **I2 — Premier G-code** | Dessus/dessous, remplissage (lignes, grille, gyroïde), jupe/bordure, vitesses, rétraction, ventilation, profils P1P/P1S + PLA/PETG, `.gcode.3mf` | Une pièce imprimée depuis la carte SD, de qualité comparable à Orca. |
| **I3 — Réglages par pièce** | Écarts par pièce, valeurs exigées par la conception, lien variables ↔ réglages | Le Clip A sort avec sa largeur de ligne pendant qu'une autre pièce du même plateau en a une autre. |
| **I4 — Imprimante** | Pont réseau dans `server.py` (Raspberry Pi), envoi, état, pause/arrêt | Impression lancée et suivie depuis l'Atelier. |
| **I5 — Lecture de la découpe en conception** | Pièces affichées découpées dans l'assemblage, sens des couches et des lignes | On repère une pièce mal orientée depuis la vue Conception. |
| **I6 et suivants** | Dans l'ordre du §4.3 : AMS, supports, zones, adaptatif… | — |

---

## 9. Questions ouvertes

1. **Firmware** : version installée sur les P1P/P1S, et acceptation du mode LAN + développeur (perte de Bambu Handy).
2. **Lieu d'exécution** : la découpe tourne dans le navigateur (ouvrier WASM, comme la géométrie) ou sur le serveur ? Recommandation : **dans le navigateur**. Le moteur y est déjà, et le Raspberry Pi serait trop lent pour découper. Le serveur ne sert qu'à parler aux imprimantes.
3. **Filaments** : PLA et PETG suffisent-ils au départ ? (TPU, ABS/ASA sur P1S à ajouter plus tard.)
4. **Plateau des P1** : quels plateaux sont utilisés (Textured PEI, Cool Plate…) ? Cela fixe les températures et le décalage Z par défaut.
5. **Usage collège ou personnel** : l'onglet Impression est-il réservé à l'administrateur, ou visible des élèves (en lecture seule, ou avec des réglages verrouillés) ? Cela change la présentation des réglages, pas le moteur.
6. **Pièces du commerce** dans l'assemblage (vis, roulements) : un marqueur « ne s'imprime pas » sur le nœud, pour qu'elles ne soient jamais proposées au plateau ?
