# Calibration des cinq préréglages — base conservatrice, résistance d'abord

> **État : APPLIQUÉ le 2026-10-02.** Les cinq préréglages sont à jour dans
> `atelier-3d/noyau/reglages_impression.js`, et six défauts du logiciel trouvés
> en chemin sont corrigés (§7). Pour chacun des 104 réglages, ce document donne
> la **valeur d'avant**, la **valeur retenue**, son **statut** (mesurable ou non)
> et la **source**.
>
> **Quatre réglages sont fixés par l'utilisateur et n'ont pas bougé** :
> remplissage gyroïde, couches du dessus = couches du dessous = 3, parois = 2.
>
> Contraintes de départ, posées :
> 1. **buse à 215 °C** en cours d'impression (au-delà, l'aspect se dégrade) ;
> 2. **les pièces collent trop** aux plaques BQ — on en détruit en les arrachant ;
> 3. on **favorise la résistance mécanique**, l'aspect vient ensuite.
>
> Préréglages visés : `p1` (P1P/P1S), `bq_smooth`, `bq_textured`, `pla_polyterra`,
> `qualite_0_2`. Fichier : `atelier-3d/noyau/reglages_impression.js`.

---

## 0. Ce qui change, en bref

| | Actuel | Proposé | Pourquoi |
|---|---|---|---|
| Buse, autres couches | 210 °C | **215 °C** | contrainte posée, et c'est le bon bout de la plage : l'adhésion entre couches du PLA monte jusqu'à ~230 °C |
| Buse, première couche | 215 °C | **215 °C** (inchangé) | mais plus de *bonus* au-dessus des autres couches : une première couche plus chaude colle plus |
| Plateau, première couche | 55 °C | **45 °C** | 55 °C, c'est 6 °C sous la Tg du PolyTerra mat (61 °C) : la première couche reste molle et s'ancre dans la surface |
| Plateau, autres couches | 55 °C | **40 °C** | le plateau ne sert plus qu'à ne pas gauchir ; la liaison cesse de « cuire » pendant toute l'impression. Bambu imprime le PLA à 35 °C sur sa Cool Plate : 40 reste au-dessus. |
| Première couche | 0,20 mm | **0,24 mm** | moins écrasée dans la texture, donc moins accrochée — et plus facile à régler |
| Vitesse première couche | 50 mm/s | **30 mm/s** | à 500 mm/s², 50 mm/s n'est atteint qu'après 2,5 mm : la couche est posée à vitesse variable |
| Ventilateur paroi extérieure | 100 % | **0 %** (= celui de la couche) | la coque porte la charge ; c'est là que la ventilation coûte le plus en résistance |
| Ventilateur, min / max | 60 / 100 % | **40 / 80 %** | moins on refroidit, mieux les couches se soudent |
| Parois, couches dessus/dessous | 2 / 5 / 4 | **2 / 3 / 3** *(fixé)* | choix de l'utilisateur, non négociable |
| Épaisseur min. dessus/dessous | 1 mm / 0 *(défaut)* | **0 / 0** | **c'est la correction qui rend le verrou vrai** : à 0,2 mm de couche, 3 couches font 0,6 mm, et le défaut de 1 mm en rajoutait deux en silence |
| Densité de remplissage | 15 % | **15 %** | avec 2 parois fixées, le remplissage est le levier le moins rentable pour la résistance : le monter seul coûterait de la matière sans rendre la pièce solide |
| Vitesses d'impression | 100 à 180 mm/s | **40 à 70 mm/s** | la vitesse est le **dernier** paramètre à calibrer ; d'ici là elle ne doit expliquer aucun défaut |
| Échelle des surplombs | 50 / 30 / 10 | **35 / 25 / 15** | le rapport paroi → surplomb fort passe de **10×** à **3,3×** : c'est lui qui fait le coup de frein (§5) |
| Accélérations | 10 000 / 5 000 / 2 000 | **1 500 partout** | une seule valeur : un M204 quasi constant, donc une variable en moins pendant qu'on vérifie le trancheur |
| Accélération déplacements | 10 000 | **3 000** | 10 000 est de toute façon écrêté à 9 000 par le micrologiciel ; c'est le mouvement le plus brutal de la machine |
| Vitesse de déplacement | 500 mm/s | **250 mm/s** | à 3 000 mm/s², 500 mm/s demanderait 42 mm d'élan : la valeur était fictive |
| Couches de transition | 2 | **4** | la montée en régime après la première couche s'étale davantage |
| Parois à largeur variable | Oui | **Non** *(phase de validation)* | des lignes à largeur constante, le temps de vérifier que le débit est juste |
| Tolérance des arcs | 0,05 mm | **0,012 mm** | 0,05 arrondit les formes ; 0,012 est la valeur des profils Bambu |
| Densité du filament | 1,24 | **1,31 g/cm³** | le PolyTerra est chargé : le profil Polymaker officiel dit 1,31 |
| Forme de la bordure | Complète | **Oreilles** | sur une plaque qui colle trop, une collerette complète est le pire cas |

**Rien d'autre ne change.** Les autres réglages sont soit déjà justes (ils viennent
des profils système Bambu), soit des inconnues qu'un essai doit mesurer et qu'il ne
faut surtout pas pré-remplir.

---

## 1. Pourquoi les pièces collent trop — et les quatre leviers

Le PLA ne « colle » pas au PEI par une colle : il s'y lie par **contact intime
établi au-dessus de sa température de transition vitreuse**, et il s'y **ancre
mécaniquement** dans le relief de la plaque. Le profil Polymaker officiel donne
**Tg = 61 °C** pour le PLA mat. Un plateau à 55 °C maintient donc la galette du
pied à 6 °C de sa Tg pendant *toute* l'impression : la matière y reste assez
souple pour continuer à épouser la texture, puis se contracte autour d'elle en
refroidissant. C'est exactement la recette d'une pièce impossible à décoller.

Quatre leviers, dans l'ordre d'efficacité :

1. **La température du plateau.** C'est de loin le premier. Bambu lui-même fait
   imprimer le PLA à **35 °C** sur sa Cool Plate (`cool_plate_temp` = 35) : la
   matière n'a donc nul besoin de 55 °C pour tenir. Les plaques BIQU PEI sont
   données pour **50–60 °C**, les BIQU CryoGrip pour **45–55 °C**. On descend à
   **50 °C** pour la première couche (elle doit encore bien s'étaler) et
   **45 °C** pour la suite — le G-code le gère déjà : `generation_gcode.js:459`
   émet `M140 S{temperature_plateau}` à la deuxième couche.
2. **L'écrasement de la première couche** (décalage Z). Moins la ligne est
   écrasée, moins elle s'ancre dans le relief. Les retours de terrain parlent de
   **+0,1 mm** de distance buse-plateau ; sur un P1 à plaque texturée c'est
   beaucoup, on part de **+0,02 mm**. ⚠️ **C'est le seul levier qu'on ne peut pas
   régler proprement aujourd'hui : l'essai d'écrasement n'existe pas** (§6).
3. **La hauteur de première couche.** 0,20 → **0,24 mm** : à largeur égale, la
   ligne est moins aplatie contre la plaque. Ellis recommande d'ailleurs
   ≥ 0,25 mm pour la première couche, « plus facile à régler et plus tolérant ».
4. **Ne pas surchauffer la première couche.** Aujourd'hui la buse est à 215 °C
   sur la première couche et 210 °C ensuite : un *bonus* de 5 °C dont le seul
   effet est de mieux coller. On met **215 partout** : la contrainte est
   respectée, et le bonus d'adhérence disparaît.

### Ce qui ne relève pas du trancheur

Trois gestes valent plus que n'importe quel réglage, et aucun n'est dans le code :

- **attendre le refroidissement complet de la plaque** avant de décoller : le PLA
  et l'acier ne se contractent pas pareil, et la pièce se détache souvent seule ;
- **flexer la plaque** hors de l'imprimante plutôt que de lever la pièce ;
- sur la **BQ Smooth** uniquement : un **film très fin de bâton de colle** servant
  d'**agent de démoulage**, pas d'adhésif. C'est la pratique recommandée pour le
  PEI lisse, dont le revêtement peut partir avec la pièce : la colle est plus
  faible que le plastique, elle cède la première.

---

## 2. Les sources retenues

On ne part pas d'un billet de blog. La référence est, dans l'ordre :

| Code | Source | Ce qu'on en tire |
|---|---|---|
| **[B-P]** | [Profil process Bambu `0.20mm Standard @BBL P1P`](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/process/0.20mm%20Standard%20%40BBL%20P1P.json) | vitesses et accélérations de référence de la P1 |
| **[B-M]** | [Profil machine Bambu `P1S 0.4 nozzle`](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/Bambu%20Lab%20P1S%200.4%20nozzle.json) | rétraction, levée, essuyage, plafonds du micrologiciel |
| **[B-F]** | [Profil filament Bambu `fdm_filament_pla`](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/filament/fdm_filament_pla.json) | températures, débit max, ventilation du PLA |
| **[O-C]** | [Profil commun `fdm_process_common`](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/process/fdm_process_common.json) | valeurs de repli, résolution, largeurs |
| **[O-P]** | [Profil Orca `Panchroma PLA Matte`](https://github.com/SoftFever/OrcaSlicer/blob/main/resources/profiles/OrcaFilamentLibrary/filament/Polymaker/Panchroma%20PLA%20Matte%20%40base.json) — **c'est le PolyTerra**, rebaptisé Panchroma par Polymaker | densité 1,31, rapport de débit 0,98, Tg 61 °C, débit max 16, plage 190–240 °C |
| **[TDS]** | [Fiche technique PolyTerra PLA V5.3](https://polymaker.com/wp-content/uploads/lana-downloads/PolyTerra-PLA_TDS_V5.3.pdf) ([miroir lisible](https://filaments.ca/pages/polyterra-pla-print-settings)) | buse 190–230 °C, plateau 25–60 °C, vitesse 30–70 mm/s, ventilateur ON, séchage 55 °C / 6 h |
| **[ORC]** | [Guide de calibration OrcaSlicer](https://www.orcaslicer.com/wiki/guides/calibration_guide) | **l'ordre des essais** : température → débit max → avance de pression → rapport de débit → rétraction → coins → lissage → VFA → tolérances |
| **[ELL]** | [Ellis' Print Tuning Guide](https://ellis3dp.com/Print-Tuning-Guide/articles/first_layer_squish.html) | méthode d'écrasement de première couche ; première couche ≥ 0,25 mm et largeur ≥ 120 % |
| **[CNC]** | [CNC Kitchen — température et adhésion entre couches](https://www.cnckitchen.com/blog/the-influence-of-extrusion-temperature-on-layer-adhesion) | PLA mesuré en Z : 20 MPa à 190 °C, 37 à 200, **39 à 210, 40 à 230**, 37 à 250, 32 à 270 |
| **[CNC2]** | [Synthèse « Infill vs Walls »](https://wiki.visionminer.com/docs/all/printing/infill-walls), qui reprend l'essai de crochets de CNC Kitchen (source primaire non relue ici) | à masse égale, la pièce à parois épaisses est **~22 % plus résistante** que celle à remplissage dense |
| **[BIQU]** | [Plaques BIQU Panda PEI](https://biqu.equipment/products/biqu-panda-buildplate-cryogrip-pro) | PEI standard : PLA à 50–60 °C ; CryoGrip Pro : 45–55 °C |

**Deux croisements importants** : [ORC] et [ELL] s'accordent sur *quels* réglages
se mesurent, et [B-P]/[B-F] donnent les valeurs machine qu'aucun essai ne mesure.
Le [TDS] donne des vitesses (30–70 mm/s) héritées des machines à portique lentes :
on ne les suit pas à la lettre, mais elles confirment qu'on peut être lent sans
rien perdre. [CNC] est la seule mesure chiffrée qui tranche la question du
« 215 °C est-il assez chaud » : **oui**, 39 MPa à 210 °C contre 40 au maximum.
La contrainte des 215 °C ne coûte donc **presque rien** en résistance.

---

## 3. Les cinq statuts

| Statut | Sens |
|---|---|
| 🔒 **Fiable** | vient d'un profil système ou d'une fiche technique. Rien à mesurer, ne pas y toucher. |
| 🎯 **À calibrer** | un essai de `noyau/calibration.js` le mesure. La valeur du préréglage n'est qu'un point de départ, choisi pour ne **rien masquer**. |
| 📐 **Essai manquant** | se mesure, mais l'essai n'existe pas encore (§8, étape 11). |
| ✋ **Choix** | une intention d'impression, pas une inconnue. Se décide, ne se mesure pas. |
| 🔒 **Fixé** | verrouillé par l'utilisateur : parois = 2, couches dessus = dessous = 3, remplissage gyroïde. |

Sur 104 réglages : **10 à calibrer** (l'écrasement de la première couche est
désormais du nombre), **1 à mesurer sans essai** (la patte d'éléphant), **le reste
fiable, fixé ou choisi**. C'est peu, et c'est normal : la plupart des réglages d'un
trancheur sont des intentions, pas des mesures.

---

## 4. Les tables, préréglage par préréglage

### 4.1 Imprimante — `p1` (P1P/P1S) — 4 réglages

Les quatre valeurs sont **exactement** celles du profil machine Bambu. Rien à faire.

| Réglage | Actuel | Proposé | Statut | Source |
|---|---|---|---|---|
| `modele_machine` | p1s | p1s | ✋ Choix | — (n'agit que sur l'en-tête du fichier SD) |
| `deplacement_sans_retraction` | 1 mm | **1 mm** | 🔒 Fiable | [B-M] `retraction_minimum_travel` = 1 |
| `levee_buse` | 0,4 mm | **0,4 mm** | 🔒 Fiable | [B-M] `z_hop` = 0,4 |
| `longueur_essuyage` | 2 mm | **2 mm** | 🔒 Fiable | [B-M] `wipe_distance` = 2 |

### 4.2 Buse — `buse_0_4` — 1 réglage

| Réglage | Actuel | Proposé | Statut | Source |
|---|---|---|---|---|
| `diametre_buse` | 0,4 mm | **0,4 mm** | 🔒 Fiable | la buse montée sur la machine |

### 4.3 Plaques — `bq_smooth` et `bq_textured` — 2 réglages chacune

Une plaque ne porte que ce qui se mesure *sur sa surface*. Les deux valeurs sont
donc des inconnues — et l'essai qui les mesure **manque** (§6).

| Réglage | Actuel (les deux) | Proposé BQ Smooth | Proposé BQ Textured | Statut | Source |
|---|---|---|---|---|---|
| `decalage_z_plaque` | 0 | **+0,02 mm** | **+0,02 mm** | 🎯 **Essai ajouté** | [ELL] + retours PEI (« +0,1 mm » est trop sur un P1 : on part au quart). L'essai « Première couche » balaie désormais −0,05 à +0,05 et tranche (§6). |
| `compensation_premiere_couche` | 0 | **0** | **0** | 📐 Essai manquant (§8, étape 11) | reste à 0 **exprès** : une valeur ici masquerait la patte d'éléphant que l'essai doit révéler. (Bambu met 0,15 dans son profil 0.20 — d'où le 0,15 de `bambu_haute_temp`, qui n'est pas calibrée chez nous. Avec moins d'écrasement, la patte diminue d'elle-même.) |

> **Un +0,02 mm, pourquoi si peu ?** Le palpeur du P1 touche les **sommets** de la
> texture : le Z=0 est donc déjà en haut du relief, et les creux sont 0,05 à 0,1 mm
> plus bas. Sur une plaque texturée, trop de Z positif et la première couche ne
> remplit plus rien. +0,02 mm est le pas de la molette : un cran, pas un saut.
>
> **Le vrai levier sur ces deux plaques reste la température** (§4.4), parce qu'elle
> agit sur la liaison chimique **et** sur l'ancrage mécanique, là où le Z n'agit que
> sur le second.

#### Une limite d'architecture à noter

Aujourd'hui `temperature_plateau` est dans le **matériau**, au motif que « c'est la
matière qui dit à quelle température elle colle ». C'est **à moitié vrai** :
l'adhérence est une propriété du **couple matière/surface**. OrcaSlicer le modélise
d'ailleurs correctement — son profil de filament porte **quatre** températures de
plateau, une par type de plaque (`cool_plate_temp` 35, `textured_plate_temp` 55,
`hot_plate_temp` 55, `supertack_plate_temp`).

Deux plaques PEI se comportant pareil, **on ne change rien maintenant**. Mais si une
plaque non-PEI arrive (CryoGrip, PEO, verre), il faudra soit déplacer la température
de plateau dans le préréglage de plaque, soit la dédoubler comme Orca.

### 4.4 Matériau — `pla_polyterra` — 21 réglages

| Réglage | Actuel | Proposé | Statut | Source / raison |
|---|---|---|---|---|
| `diametre_filament` | 1,75 mm | **1,75 mm** | 🔒 Fiable | nominal |
| `densite_filament` | 1,24 g/cm³ | **1,31 g/cm³** | 🔒 Fiable | [O-P] : le PolyTerra est un PLA **chargé**, 1,24 est la valeur du PLA nu. N'agit que sur la masse annoncée. |
| `temperature_buse` | 210 °C | **215 °C** | 🎯 Température | contrainte posée ; [CNC] : 39 MPa à 210, 40 au maximum (230) → le plafond coûte ~2 % |
| `temperature_buse_premiere` | 215 °C | **215 °C** | 🎯 Température | **égale aux autres couches** : plus de bonus d'adhérence sur la première |
| `temperature_plateau_premiere` | 55 °C | **50 °C** | ✋ Choix | [BIQU] 50–60 ; il faut encore que la couche s'étale |
| `temperature_plateau` | 55 °C | **45 °C** | ✋ Choix | [B-F] Cool Plate à 35 → 45 suffit largement ; 16 °C sous la Tg de 61 [O-P] |
| `rapport_debit` | 1 | **1** | 🎯 Rapport de débit | **ne pas pré-remplir** : fausser cette valeur fausse tous les essais suivants. [O-P] attend 0,98 : c'est la zone d'atterrissage, pas le départ. |
| `pression_avance` | 0,02 | **0,02** | 🎯 Avance de pression | départ usuel d'un extrudeur direct Bambu ; l'essai le mesure |
| `debit_maximal` | 12 mm³/s | **12 mm³/s** | 🎯 Débit maximal | [B-F] = 12 pour le PLA générique. [O-P] dit 16 pour ce filament : c'est la valeur attendue **après** l'essai. On garde 12, et **aucune vitesse proposée ne l'atteint** (§4.5 et §5). |
| `longueur_retraction` | 0,8 mm | **0,8 mm** | 🎯 Rétraction | [B-M] = 0,8 — déjà la bonne valeur, l'essai la confirmera |
| `vitesse_retraction` | 30 mm/s | **30 mm/s** | 🔒 Fiable | [B-M] = 30 ; c'est aussi `machine_max_speed_e` = 30, donc le plafond mécanique |
| `ventilateur_min` | 60 % | **40 %** | ✋ Choix | [CNC] : moins de ventilation = meilleure soudure entre couches. 40 % reste une vraie ventilation sur un P1 à flancs ouverts. |
| `ventilateur_max` | 100 % | **80 %** | ✋ Choix | garde de la marge pour les petites couches sans aller au maximum |
| `ventilateur_paroi_exterieure` | 100 % | **0 %** | ✋ Choix | 0 = « comme la couche ». Forcer 100 % sur la coque, c'est refroidir à fond **la partie qui porte la charge**. Le plus gros gain de résistance de la liste. |
| `ventilateur_dessus` | 100 % | **0 %** | ✋ Choix | même raison ; l'aspect du dessus viendra après |
| `ventilateur_surplomb` | 100 % | **100 %** | 🔒 Fiable | `overhang_fan_speed` = 100 dans le profil filament commun Bambu. Un brin dans le vide doit figer : la géométrie prime. |
| `ventilateur_auxiliaire` | 0 % | **0 %** | ✋ Choix | la P1S de l'atelier tourne sans ses caches : pas de ventilateur latéral utile |
| `temps_couche_ventilateur` | 60 s | **60 s** | ✋ Choix | bas exprès : plus de couches comptent comme « longues » et reçoivent le ventilateur **minimal** |
| `couches_sans_ventilateur` | 1 | **1** | 🔒 Fiable | [B-F] `close_fan_the_first_x_layers` = 1 |
| `temps_couche_min` | 6 s | **6 s** | ✋ Choix | encadré par [B-F] (4 s) et [O-C] (8 s) ; allonger refroidit la couche d'en dessous et coûte en soudure |
| `vitesse_min_refroidissement` | 20 mm/s | **20 mm/s** | 🔒 Fiable | [B-F] `slow_down_min_speed` = 20 |

### 4.5 Réglages d'impression — `qualite_0_2` — 76 réglages

#### Qualité — hauteurs, largeurs, couture, précision

| Réglage | Actuel | Proposé | Statut | Source / raison |
|---|---|---|---|---|
| `hauteur_couche` | 0,2 mm | **0,2 mm** | ✋ Choix | [B-P] ; bon compromis durée / soudure / détail |
| `hauteur_premiere_couche` | 0,2 mm | **0,24 mm** | ✋ Choix | **levier d'adhérence n°3** ; [ELL] recommande ≥ 0,25 |
| `largeur_ligne` | 0,42 mm | **0,42 mm** | 🔒 Fiable | [O-C] = 0,42 (105 % de buse) |
| `largeur_premiere_couche` | 0,5 mm | **0,5 mm** | 🔒 Fiable | [O-C] = 0,5 ; [ELL] veut ≥ 120 % pour pouvoir régler l'écrasement. On ne la réduit **pas** : la largeur ne change pas la surface de contact, seulement l'étalement. |
| `largeur_paroi_exterieure` | 0,42 mm | **0,42 mm** | 🔒 Fiable | [O-C] = 0,42 |
| `largeur_parois_interieures` | 0,45 mm | **0,45 mm** | 🔒 Fiable | [O-C] = 0,45 (112 %) — déjà le choix « résistance » de Bambu |
| `largeur_dessus` | 0,42 mm | **0,42 mm** | 🔒 Fiable | [O-C] = 0,42 |
| `largeur_remplissage` | 0,45 mm | **0,45 mm** | 🔒 Fiable | [O-C] = 0,45 |
| `largeur_plein_interieur` | 0,42 mm | **0,42 mm** | 🔒 Fiable | [O-C] = 0,42 |
| `largeur_pont` | 0,4 mm | **0,4 mm** | 🔒 Fiable | au diamètre exact : un brin tendu ne s'étale pas |
| `ancrage_pont` | 3 mm *(défaut)* | **3 mm** *(à écrire)* | ✋ Choix | — |
| `portee_minimale_pont` | 2 mm *(défaut)* | **2 mm** *(à écrire)* | ✋ Choix | — |
| `position_couture` | Alignée | **Alignée** | ✋ Choix | [O-C] `seam_position` = aligned |
| `couture_biseau` | Non | **Non** | ✋ Choix | masquerait un débit faux ; après calibration |
| `jeu_couture` | 0 | **0** | 🎯 *(suit l'avance de pression)* | inutile de le régler avant que K soit mesuré |
| `longueur_biseau` | 10 mm *(défaut)* | **10 mm** *(à écrire)* | ✋ Choix | sans effet tant que le biseau est à Non |
| `repassage` | Non | **Non** | ✋ Choix | masque un débit faux |
| `espacement_repassage` | 0,1 mm *(défaut)* | **0,15 mm** *(à écrire)* | 🔒 Fiable | [O-C] `ironing_spacing` = 0,15 |
| `debit_repassage` | 10 % *(défaut)* | **10 %** *(à écrire)* | 🔒 Fiable | [O-C] `ironing_flow` = 10 % |
| `parois_variables` | Oui | **Non**, puis Oui | ✋ Choix | à terme **Oui** (matière soudée au lieu de juxtaposée dans les filets : gain de résistance sur les nervures fines). Mais `parois_variables.js` + `axe_median.js` modulent la largeur en continu : c'est **notre** interpolation, et une largeur fausse ressemble trait pour trait à un débit faux. Pendant la validation et l'essai de rapport de débit, on veut des lignes de largeur constante. |
| `remplir_interstices` | Partout | **Partout** | ✋ Choix | un interstice non rempli est un vide dans la pièce |
| `une_paroi_sur_dessus` | Non | **Non** | ✋ Choix | garder les parois sous le dessus = plus de matière porteuse ; c'est un réglage d'aspect |
| `compensation_trous` | 0 | **0** | ✋ Choix | déclaré fixe à zéro : aucune lecture à l'œil ne le départage, et le pied à coulisse est écarté par principe sur ce projet |
| `compensation_contours` | 0 | **0** | ✋ Choix | idem |
| `ordre_parois` | Intérieures puis extérieure | **Intérieures puis extérieure** | ✋ Choix | [O-C] `wall_infill_order`. « En sandwich » est le candidat d'après — il demande ≥ 3 parois, ce que les 4 parois proposées rendent possible. À essayer **après** la calibration. |
| `arcs` | Oui | **Oui**, mais à vérifier | ✋ Choix | [O-C] `enable_arc_fitting` = 1. `regrouperEnArcs` et les `I`/`J` de `G2`/`G3` sont **à nous** : un centre d'arc faux est un chemin faux, invisible dans l'aperçu. **Premier suspect si le bruit est bancal sur les courbes** : imprime un cylindre Ø 30 avec puis sans, et compare. Désactiver fait tomber la contrainte de débit de commandes, donc à ne pas laisser sur Non sans raison. |
| `tolerance_arcs` | 0,05 mm | **0,012 mm** | 🔒 Fiable | [O-C] `resolution` = 0,012. **0,05 mm est 4× trop grossier** : il arrondit les arêtes et fausse les cotes des pièces de techno. |

#### Résistance — parois, coques, remplissage

| Réglage | Actuel | Proposé | Statut | Source / raison |
|---|---|---|---|---|
| `nombre_parois` | 2 | **2** | 🔒 **Fixé** | choix de l'utilisateur. [CNC2] dit que c'est ici que se gagne la résistance (+22 % à masse égale) : c'est donc le premier curseur à bouger si les pièces cassent. |
| `couches_dessus` | 5 | **3** | 🔒 **Fixé** | choix de l'utilisateur |
| `epaisseur_dessus` | 1 mm *(défaut)* | **0** | ⚠️ **Corrigé** | [B-P] met 1,0 **parce qu'il met aussi 5 couches** (5 × 0,2 = 1,0) : les deux vont ensemble. Avec 3 couches fixées, 0,6 mm < 1 mm, et le trancheur **en rajoutait deux en silence** — le verrou « 3 couches » n'était pas respecté. À zéro, c'est le nombre de couches qui commande. |
| `couches_dessous` | 4 | **3** | 🔒 **Fixé** | choix de l'utilisateur ; c'est aussi la valeur d'[O-C] |
| `epaisseur_dessous` | 0 *(défaut)* | **0** *(écrit)* | 🔒 Fiable | [O-C] `bottom_shell_thickness` = 0 (le nombre de couches commande) |
| `motif_dessus` | Monotone *(défaut)* | **Monotone** *(à écrire)* | ✋ Choix | le plus régulier ; « lignes séparées » marque la surface tant que K n'est pas mesuré |
| `motif_dessous` | Monotone *(défaut)* | **Monotone** *(à écrire)* | ✋ Choix | [O-C] `bottom_surface_pattern` = monotonic |
| `elargissement_coques` | 0,4 mm | **0,4 mm** | ✋ Choix | évite qu'un flanc incliné laisse voir le remplissage |
| `chevauchement_pleins` | 25 % | **25 %** | ✋ Choix | déjà la valeur usuelle ; trop peu laisse un sillon le long de la paroi, trop fait gonfler le dessus |
| `densite_remplissage` | 15 % | **15 %** | ✋ Choix | la valeur d'[O-C] comme de Bambu. Avec 2 parois fixées, la monter seule serait le levier le moins rentable : la matière irait là où elle sert le moins. |
| `motif_remplissage` | Gyroïde | **Gyroïde** | 🔒 **Fixé** | choix de l'utilisateur, et le bon : résistance égale dans toutes les directions, jamais deux lignes au même endroit |
| `angle_remplissage` | 45° *(défaut)* | **45°** *(à écrire)* | 🔒 Fiable | [O-C] `infill_direction` = 45 |
| `chevauchement_remplissage` | 15 % *(défaut)* | **25 %** *(à écrire)* | 🎯 *(Ellis : infill/perimeter overlap)* | [O-C] = 15 %. Monter à 25 % soude mieux le remplissage à la coque — sans risque, puisqu'avec 4 parois il mord sur une paroi **intérieure**. |
| `couches_densification` | 2 *(défaut)* | **2** *(à écrire)* | ✋ Choix | voir la note §7 : la correspondance Orca de ce réglage est à revoir |

#### Vitesse — vitesses, surplombs, accélérations

> **Le principe de la table ci-dessous a changé** (voir §5) : la vitesse étant le
> **dernier** paramètre qu'on calibrera, elle ne doit expliquer *aucun* défaut
> pendant qu'on vérifie le trancheur. On ne cherche donc pas la vitesse la plus
> haute compatible avec le débit, on cherche la **plus lente qui reste raisonnable**.
> Conséquence : le débit maximal ne touche plus rien (6,3 mm³/s au pire, soit la
> **moitié** du plafond de 12), et l'échelle des surplombs devient géométrique,
> chaque cran valant environ 1,4× le suivant.

| Réglage | Actuel | Proposé | Débit | Statut | Source / raison |
|---|---|---|---|---|---|
| `vitesse_premiere_couche` | 50 mm/s | **30 mm/s** | 3,6 mm³/s | ✋ Choix | à 500 mm/s², 50 mm/s n'est atteint qu'après **2,5 mm** ; à 30 mm/s il faut 0,9 mm → couche posée à vitesse **constante**, donc uniforme. [O-C] en met 20. |
| `vitesse_paroi_exterieure` | 100 mm/s | **50 mm/s** | 4,2 mm³/s | ✋ Choix | c'est elle qui fixe le haut de l'échelle des surplombs : la baisser divise par 4 l'énergie du coup de frein (§5) |
| `vitesse_parois_interieures` | 150 mm/s | **60 mm/s** | 5,4 mm³/s | ✋ Choix | [TDS] donne 30–70 mm/s pour ce filament : on est dedans |
| `vitesse_remplissage` | 180 mm/s | **70 mm/s** | 6,3 mm³/s | ✋ Choix | la plus haute de la liste, et toujours à **la moitié** du plafond de débit |
| `vitesse_plein_interieur` | 150 mm/s | **60 mm/s** | 5,0 mm³/s | ✋ Choix | — |
| `vitesse_dessus` | 100 mm/s | **40 mm/s** | 3,4 mm³/s | ✋ Choix | [O-C] en met 30 |
| `vitesse_petits_contours` | 50 mm/s *(défaut)* | **25 mm/s** *(à écrire)* | — | ✋ Choix | la moitié de la paroi extérieure, comme [B-P] (`small_perimeter_speed` = 50 %) |
| `seuil_petits_contours` | 20 mm *(défaut)* | **20 mm** *(à écrire)* | — | ✋ Choix | ≈ un trou de 6 mm ; [B-P] met 0 (désactivé), ce qu'on ne veut pas |
| `strategie_surplomb` | Paliers | **Paliers** | — | ✋ Choix | **à garder, et pas par prudence seulement** : en mode « Progressive », le code saute `lisserLesMorceaux` et change de vitesse tous les 0,5 mm — c'est le régime bancal, pas son remède (§5) |
| `tendre_les_debords` | Non | **Non** | — | ✋ Choix | [O-C] `bridge_no_support` = 0 ; chemin de code non éprouvé |
| `longueur_debord_tendu` | 12 mm *(défaut)* | **12 mm** *(à écrire)* | — | ✋ Choix | sans effet tant que le précédent est à Non |
| `parois_surplomb_dabord` | Non | **Non** | — | ✋ Choix | idem |
| `detection_enroulement` | Oui | **Oui** | — | ✋ Choix | à garder, mais noter qu'il force `vitesse_surplomb_fort` sur un segment enroulé **sans passer par les crans** : un saut direct 50 → 15. C'est une raison de plus de resserrer l'échelle. |
| `vitesse_surplomb_leger` | 50 mm/s | **35 mm/s** | — | ✋ Choix | 0,7 × la paroi extérieure |
| `vitesse_surplomb_moyen` | 30 mm/s | **25 mm/s** | — | ✋ Choix | 0,5 × la paroi extérieure |
| `vitesse_surplomb_fort` | 10 mm/s | **15 mm/s** | — | ✋ Choix | **on remonte** : 10 mm/s n'avait de sens qu'avec une paroi à 200 (valeur [B-P]). Face à une paroi à 50, 15 mm/s donne le même temps de figeage sans le coup de frein. |
| `debit_surplomb` | 100 % | **100 %** | — | ✋ Choix | 100 % exprès : réduire masquerait un défaut de refroidissement |
| `debit_pont` | 100 % | **100 %** | — | ✋ Choix | `bridge_flow` = 1 dans le profil Bambu 0.20 (le commun met 0,95) |
| `vitesse_pont` | 30 mm/s | **25 mm/s** | 3,1 mm³/s | ✋ Choix | [O-C] = 25 |
| `vitesse_pont_interieur` | 80 mm/s | **40 mm/s** | 3,4 mm³/s | ✋ Choix | un pont intérieur s'appuie de place en place, mais 80 était calé sur des parois à 300 |
| `vitesse_repassage` | 60 mm/s *(défaut)* | **30 mm/s** *(à écrire)* | — | 🔒 Fiable | [O-C] `ironing_speed` = 30 |
| `vitesse_interstices` | 150 mm/s | **40 mm/s** | ≤ 3,4 mm³/s | ✋ Choix | [O-C] = 30. Un interstice est court par définition : à 150 mm/s la vitesse n'était **jamais atteinte**, seule l'accélération décidait. |
| `vitesse_deplacement` | 500 mm/s | **250 mm/s** | — | ✋ Choix | à 3 000 mm/s², 500 mm/s demanderait **42 mm** d'élan ; 250 en demande 10, ce qui correspond à de vrais sauts |
| `acceleration_defaut` | 10 000 | **1 500 mm/s²** | — | ✋ Choix | voir §5. Plancher calculé avec ces vitesses : **758 mm/s²** ; 1 500 laisse le double de marge. |
| `acceleration_paroi_exterieure` | 5 000 | **1 500 mm/s²** | — | ✋ Choix | **même valeur que le défaut, exprès** : une accélération unique rend le flux de `M204` quasi constant, donc une variable en moins pendant qu'on cherche les défauts du trancheur |
| `acceleration_dessus` | 2 000 | **1 500 mm/s²** | — | ✋ Choix | idem |
| `acceleration_premiere_couche` | 500 | **500 mm/s²** | — | 🔒 Fiable | [B-P] `initial_layer_acceleration` = 500 ; à 30 mm/s la vitesse est atteinte en 0,9 mm |
| `acceleration_deplacement` | 10 000 | **3 000 mm/s²** | — | ✋ Choix | [B-M] `machine_max_acceleration_travel` = **9 000** : 10 000 était déjà écrêté par le micrologiciel. C'est le mouvement le plus violent de la machine, et celui qu'on entend le plus. |
| `couches_transition` | 2 | **4** | — | ✋ Choix | la montée en régime s'étale sur quatre couches au lieu de deux |

#### Adhérence — jupe, bordure

| Réglage | Actuel | Proposé | Statut | Source / raison |
|---|---|---|---|---|
| `tours_jupe` | 1 | **1** | ✋ Libre | amorce la buse ; [O-C] met 0 |
| `distance_jupe` | 2 mm | **2 mm** | 🔒 Fiable | [O-C] `skirt_distance` = 2 |
| `largeur_bordure` | 0 | **0** | ✋ Libre | **surtout pas de bordure** sur une plaque qui colle trop : c'est de la surface collée en plus, à arracher |
| `ecart_bordure` | 0,1 mm | **0,1 mm** | 🔒 Fiable | [O-C] `brim_object_gap` = 0,1 |
| `type_bordure` | Complète *(défaut)* | **Oreilles** *(à écrire)* | ✋ Libre | si une bordure devient nécessaire, les oreilles collent **dix fois moins** de matière tout en tenant les angles, qui sont les seuls à décoller |
| `angle_des_oreilles` | 120° *(défaut)* | **120°** *(à écrire)* | ✋ Libre | attrape les coins francs |

---

## 5. La dynamique : pourquoi ça sonne bancal

Le ressenti auditif — « les surplombs sont trop brutaux, les remplissages aussi,
c'est agressif » — se vérifie au chiffre, et il a **une cause précise dans notre
code**. Ce n'est pas un réglage trop grand, c'est un **rapport** trop grand.

### 5.0 Le déséquilibre, visible dans l'historique du préréglage

En comparant le préréglage au profil Bambu dont il est tiré, on voit ce qui s'est
passé :

| | Bambu `0.20 Standard @BBL P1P` | Préréglage actuel | Rapport |
|---|---|---|---|
| Paroi extérieure | 200 mm/s | 100 | **÷ 2** |
| Parois intérieures | 300 mm/s | 150 | **÷ 2** |
| Remplissage | 270 mm/s | 180 | ÷ 1,5 |
| Plein intérieur | 250 mm/s | 150 | ÷ 1,7 |
| Surface du dessus | 200 mm/s | 100 | **÷ 2** |
| | | | |
| Accélération par défaut | 10 000 mm/s² | 10 000 | **÷ 1** |
| Accél. paroi extérieure | 5 000 mm/s² | 5 000 | **÷ 1** |
| Accél. déplacements | 10 000 mm/s² | 10 000 | **÷ 1** |

**Les vitesses ont été divisées par deux, les accélérations pas du tout.** Le
préréglage a donc hérité de la dynamique d'une machine qui va deux fois plus vite
que lui. C'est exactement ce qui produit le ressenti d'agressivité : à vitesse
moitié, une accélération inchangée veut dire que chaque démarrage, chaque arrêt et
chaque changement de régime est **deux fois plus court en distance** que ce pour quoi
ces accélérations ont été réglées. Les surplombs, eux, n'ont pas été touchés du
tout — ils sont restés à 50/30/10, calés sur une paroi à 200 mm/s.

Autrement dit : le préréglage n'est pas « trop rapide », il est **mal proportionné**.

### 5.1 La règle : une transition de vitesse occupe une distance

Pour passer de v₁ à v₂, le micrologiciel a besoin de

> **d = |v₁² − v₂²| / (2 a)**

Deux conséquences, et elles tirent en sens **opposés** :

- si **d est plus grande que le morceau** à imprimer, la vitesse demandée n'est
  jamais atteinte : la tête passe tout le morceau à freiner puis à réaccélérer.
  C'est le régime « bancal » — la machine n'est jamais en régime établi ;
- si **d est très petite**, c'est que la décélération est violente : beaucoup
  d'énergie dissipée en très peu de temps, donc un **coup** dans la structure.

Baisser l'accélération règle le second et aggrave le premier. **Le seul levier qui
règle les deux à la fois est de réduire le rapport v₁/v₂.**

### 5.2 Les deux constantes de notre trancheur qui fixent le cadre

`tranchage/tranchage_piece.js` :

| Constante | Valeur | Rôle |
|---|---|---|
| `PAS_DE_CLASSEMENT_MM` | **0,5 mm** | le tracé est redécoupé à ce pas avant d'être classé en surplomb |
| `LONGUEUR_MINIMALE_D_UN_MORCEAU_MM` | **1,5 mm** | en dessous, `lisserLesMorceaux` fusionne le morceau avec ses voisins |

**Le morceau de surplomb le plus court que le trancheur puisse émettre fait donc
1,5 mm.** C'est lui qui fixe tout : toute transition de vitesse doit tenir dans
1,5 mm, sinon la vitesse de surplomb demandée n'existe que sur le papier.

### 5.3 Le calcul, avant et après

Le pire saut est paroi extérieure → surplomb fort — et il arrive pour de vrai, sur
une arête franche, où un morceau passe directement de « posé » à « dans le vide ».
L'accélération appliquée est `acceleration_paroi_exterieure`.

| | v₁ → v₂ | a | d nécessaire | Tient dans 1,5 mm ? | Décélération subie |
|---|---|---|---|---|---|
| **Aujourd'hui** | 100 → 10 | 5 000 | **0,99 mm** | oui | **0,51 g pendant 18 ms** |
| Première idée (trop basse) | 80 → 10 | 1 000 | **3,15 mm** | **non** → régime bancal | 0,10 g |
| **Proposé** | 50 → 15 | 1 500 | **0,76 mm** | oui, 2× de marge | **0,15 g pendant 23 ms** |

Voilà le diagnostic, en une ligne : **aujourd'hui la machine encaisse un demi-g à
chaque entrée et chaque sortie de surplomb.** C'est ce qu'on entend. Et ce n'est
pas l'accélération qui est coupable toute seule — c'est le rapport de 10× entre
100 mm/s et 10 mm/s, qui est l'échelle d'OrcaSlicer appliquée à une paroi
extérieure qu'on a déjà divisée par deux par rapport à la leur (200 mm/s).

Le jeu proposé ramène le choc à **moins du tiers**, tout en gardant les
transitions largement dans les 1,5 mm.

### 5.4 Le plancher d'accélération, calculé

De `d ≤ 1,5 mm`, on tire l'accélération **minimale** admissible :

> **a_min = (v_paroi² − v_surplomb_fort²) / 3**

Avec 50 et 15 : a_min = (2 500 − 225) / 3 = **758 mm/s²**. Le **1 500** proposé
laisse donc **le double de marge** : la transition occupe 0,76 mm là où 1,5 mm est
disponible. On pourrait descendre à 1 000 mm/s² (1,14 mm, marge 1,3×) ; on ne le
fait pas, parce que la marge doit absorber le cas où un morceau fait tout juste sa
longueur minimale.

Noter que le plancher **dépend des vitesses** : si la paroi extérieure remonte à
100 mm/s, a_min devient (10 000 − 225) / 3 = **3 258 mm/s²**. C'est le couplage
qu'il faut garder en tête à l'étape 12 (§8).

**C'est pour ça qu'on ne peut pas simplement « tout baisser ».** Descendre à
1 000 mm/s² en gardant 10 mm/s de surplomb fort remettrait la machine dans le
régime qu'on cherche à fuir.

### 5.5 Pourquoi garder « Paliers » et pas « Progressive »

Le nom trompe. `separerLesSurplombs` n'appelle `lisserLesMorceaux` **que si la
stratégie n'est pas « lissée »** :

```js
if (reglages.strategie_surplomb !== "lissee") lisserLesMorceaux(parts, points, segments, suivant);
```

En mode progressif, les morceaux ne sont donc **pas** fusionnés : la vitesse peut
changer tous les **0,5 mm**. Or à 1 500 mm/s², un morceau de 0,5 mm ne permet
d'atteindre que √(2 × 1500 × 0,5) ≈ **27 mm/s** en partant de l'arrêt. Les huit
crans progressifs deviennent alors en grande partie décoratifs, et la tête ne fait
plus que monter et descendre en vitesse : **c'est exactement le régime bancal.**

Les huit petits crans sont la bonne idée ; il leur manque la fusion des morceaux.

### 5.6 Les deux corrections faites

1. **`lisserLesMorceaux` tourne maintenant pour TOUTES les stratégies**, la
   progressive comprise. Elle en était exclue au motif que ses huit crans font de
   petites marches : exact pour la marche, faux pour la distance.
2. **`LONGUEUR_MINIMALE_D_UN_MORCEAU_MM` n'est plus la règle, seulement un
   plancher** (deux pas de classement, soit 1 mm). La longueur utile se calcule
   désormais par transition, dans `longueurUtileDUnMorceau` :

   ```js
   Math.max(LONGUEUR_MINIMALE_D_UN_MORCEAU_MM,
            Math.abs(v1 * v1 - v2 * v2) / (2 * a))
   ```

   Et la suite fusionnée n'est plus la plus COURTE mais **la plus en défaut** : un
   long morceau qui doit encaisser un gros saut est plus gênant qu'un morceau
   court dont la transition tient dans un cheveu.

   Deux effets. La fusion suit automatiquement les vitesses et accélérations
   choisies : si la paroi remonte un jour à 100 mm/s, le seuil passe de 0,76 à
   3,26 mm tout seul. Et la gradation fine du mode progressif survit, puisque deux
   crans voisins ont un petit écart, donc une petite distance, donc aucune raison
   d'être fusionnés.

### 5.7 Deux autres sources de brutalité, repérées en passant

- **`detection_enroulement`** (`estimations.js:95`) force `vitesse_surplomb_fort`
  sur un segment enroulé **sans passer par les crans** : saut direct de la vitesse
  de paroi à la vitesse la plus basse. Avec l'échelle actuelle c'est un 100 → 10 ;
  avec celle proposée, un 50 → 15. Le réglage reste bon, c'est l'échelle qui le
  rend acceptable.
- **La progression affichée dérive.** `estimations.js:192` estime le temps avec
  `tempsTrapeze` (elle modélise donc l'accélération), mais le générateur de G-code
  compte `ecoule += longueur / v`, à vitesse constante. Plus les accélérations
  baissent, plus les `M73` annoncent un temps trop court. Sans gravité, mais à
  savoir : **la durée annoncée va devenir fausse quand on baissera les
  accélérations**, et ce n'est pas un symptôme d'impression.

### 5.8 Comment vérifier, puisqu'on a écrit le trancheur nous-mêmes

Quatre pièces courtes, et ce qu'on écoute :

| Pièce | Ce qu'elle montre | Au son |
|---|---|---|
| Cube 20 mm | parois, couture, cotes | un ton **constant** par type de ligne = bon |
| Cylindre Ø 30 | les arcs `G2`/`G3` | un bégaiement sur la courbe → les arcs (§4.5) |
| Cône ou aileron 45° → 70° | l'échelle des surplombs | un **coup** à l'entrée du débord → l'échelle ou l'accélération |
| Pont de 20 mm | ancrage et débit des ponts | — |

Et un contrôle qui ne demande pas d'imprimer : **relire le G-code produit**. Compter
les `M204` et les changements de `F` par couche, et mesurer la distance parcourue
entre deux changements de `F`. Si cette distance est souvent plus courte que le
`d` du §5.1, la machine n'est jamais en régime établi — et le problème est dans le
découpage, pas dans les valeurs.

---

## 6. L'essai qui manquait : l'écrasement de la première couche

**Écrit, et c'est le premier du menu.** Trois endroits du code le mentionnaient
déjà (`reglages_impression.js:465` et `:769`, `vue/apercu_tranchage.js:137`) mais
`noyau/calibration.js` n'en avait aucune trace : les deux valeurs des plaques BQ
étaient restées à zéro faute de pouvoir les mesurer, et le décalage Z — levier
n° 2 de l'adhérence — n'avait jamais été réglé.

### Pourquoi la référence n'est pas OrcaSlicer, pour une fois

**Orca n'a pas cet essai**, et la raison n'est pas qu'il serait inutile : Orca n'a
pas de profil de plaque, donc nulle part où ranger un décalage Z propre à une
plaque. Nous, oui — c'est même le seul profil qui nous soit propre. La référence
est donc **Ellis' Print Tuning Guide**, « First Layer Squish », la méthode de
référence sur le sujet.

Là où Ellis règle le Z **en direct pendant l'impression**, on pose une plaquette
**par** décalage : rien à ajuster à la volée, et le résultat reste sur le plateau,
comparable et conservable. C'est ce que permet le `decalageZ` par pièce de
`generation_gcode.js` — un mécanisme qui existait, mais que la couche application
avait cessé de câbler.

### L'éprouvette : celle d'Orca, sans rien redessiner

Les plaquettes de leur essai de débit « YOLO » sont gravées de **−0,05 à +0,05 par
pas de 0,01**. Gravées en centièmes de millimètre, elles font exactement l'échelle
qu'il faut pour un décalage en Z : **le nombre lu sur la plaquette retenue se tape
tel quel** dans « Décalage Z de la plaque ». Un second jeu, au pas de 0,005 mm
(16 plaquettes), sert si le premier laisse hésiter entre deux voisines.

### Ce que l'essai impose, et pourquoi

| Réglage forcé | Raison |
|---|---|
| `decalage_z_plaque: 0` | c'est lui qu'on mesure : le nombre gravé doit se lire en absolu, pas comme un écart à une valeur encore inconnue |
| `compensation_premiere_couche: 0` | la patte d'éléphant rentre le contour : on lirait une correction, pas un écrasement |
| `nombre_parois: 1`, `couches_dessous: 1`, `motif_dessous: monotone` | une première couche pleine, en lignes parallèles |
| `epaisseur_dessus/dessous: 0` | sinon les épaisseurs minimales rajoutent des couches (§4.5) |
| `remplir_interstices: nulle_part`, `tours_jupe: 0`, `largeur_bordure: 0` | rien qui brouille la lecture ni qu'il faille décoller en plus |

### Comment lire

On retient **la plaquette la MOINS écrasée qui ne laisse aucun trou** entre ses
lignes — pas la plus belle. Trop écrasée : les lignes disparaissent et la surface
ondule. Pas assez : on voit entre les lignes. Pour le problème d'arrachement,
c'est du côté des valeurs **positives** qu'il faut regarder.

Vérifié sur le G-code produit : onze plaquettes, Z de première couche de 0,19 à
0,29 mm par pas de 0,01, chacune annoncée par son `; CALIBRATION: ±0,0x mm`.

---

## 7. Les défauts du logiciel trouvés en chemin, et corrigés

Sept, dont trois qui faussaient silencieusement les impressions.

### 7.1 Les réglages d'un essai restaient sur le plateau après le retrait

**Le plus grave.** Poser une éprouvette écrit les réglages de l'essai dans les
ÉCARTS du plateau — c'est ainsi qu'il se fait trancher comme il l'entend. Mais
`retirerLesEprouvettes` ne retirait que les pièces : **les écarts restaient**.
Après un essai de débit, le plateau gardait une seule paroi, 35 % de remplissage
rectiligne, deux couches de dessous… et la pièce suivante s'imprimait avec, sans
que rien ne le dise. Trente et un réglages sont concernés.

Corrigé : `noyau/calibration.js` expose `CLES_IMPOSEES_PAR_LES_ESSAIS`, calculée
depuis les essais eux-mêmes, et le retrait les rend à leur préréglage.

### 7.2 Après un rechargement, l'essai ne pouvait plus être retiré

`retirer()` sortait si `pose === null`, et le bouton du ruban était activé par
`calibration.pose() !== null`. Or `pose` est une variable de module : un
rechargement de page la perd. L'éprouvette restait donc sur le plateau, le bouton
grisé — et avec elle les réglages du §7.1, définitivement. Les deux regardent
maintenant **le plateau** (`plateau.aUneEprouvette()`), pas la mémoire.

### 7.3 Les épaisseurs minimales défaisaient le nombre de couches

`epaisseur_dessus` valait 1 mm par défaut et n'était pas écrit dans le préréglage.
À 0,2 mm de couche, « 3 couches du dessus » donne 0,6 mm : le trancheur en
rajoutait **deux** pour atteindre 1 mm. Le réglage affiché disait 3, l'impression
en faisait 5. Les deux épaisseurs sont maintenant à 0 et écrites.

### 7.4 La ligne d'amorce était laminée contre la plaque

Deux défauts superposés dans l'en-tête, et c'est ce qui l'empêche de se décoller :

- ses `E` poussent 15 mm de filament sur 222 mm, soit la section d'une ligne de
  **0,5 × 0,3** — mais elle était posée à **Z 0,2**. Elle recevait donc une fois
  et demie ce qu'il lui faut, écrasée dans un passage trop étroit. Z passe à 0,3,
  et la ligne redevient conforme au débit que son propre `F` suppose ;
- le `G29.1` du décalage de plaque était émis **après** elle : l'amorce était la
  seule chose du plateau à ignorer le décalage mesuré pour cette plaque. Il passe
  avant.

### 7.5 Le ventilateur de caisson ne suivait pas

`ventilation_pla` n'avait qu'un cran (`> 45 °C → S180`) et ne regardait que la
première couche. Le profil filament PLA de Bambu en a deux, sur la plus haute des
deux températures de plateau : `> 45 → S255`, `> 35 → S180`. Repris tel quel —
ce qui compte d'autant plus qu'on descend le plateau à 45/40.

### 7.6 Dix noms de réglages OrcaSlicer étaient faux

Le champ `orca` sert à retrouver la référence : s'il ment, la référence est
perdue. Vérifiés un à un contre les 955 clés de leur `PrintConfig.cpp` :

| Réglage | Avant | Après |
|---|---|---|
| `compensation_trous` | `hole_size_compensation` | **`xy_hole_compensation`** |
| `debit_surplomb` | `overhang_totally_speed` *(une vitesse, pas un débit)* | **`overhang_flow_ratio`** |
| `tendre_les_debords` | `overhangs` *(nom PrusaSlicer)* | **`detect_overhang_wall`** |
| `longueur_debord_tendu` | `bridge_no_support` *(un booléen)* | **`max_bridge_length`** |
| `parois_surplomb_dabord` | `wall_sequence` *(déjà pris par `ordre_parois`)* | **`overhang_reverse`** |
| `ancrage_pont` | `bridge_anchor` | **aucun** — Orca le calcule en interne |
| `portee_minimale_pont` | `thin_bridges` | **aucun** |
| `ventilateur_dessus` | `top_surface_fan_speed` | **aucun** — Orca n'a pas de ventilateur par type de ligne |
| `ventilateur_paroi_exterieure` | `dont_slow_down_outer_wall` *(sans rapport)* | **aucun** |
| `couches_densification` | `infill_combination` *(fait tout autre chose : il ÉPAISSIT le remplissage)* | **aucun** — c'est le « Gradual infill steps » de Cura |

Les quatre sans équivalent portent `orca: null` et le disent dans leur aide. La
recherche du panneau plantait sur un `orca` nul : corrigée au passage.

### 7.7 Une durée annoncée qui va dériver

Pas corrigé, mais à savoir. `estimations.js:192` estime le temps avec
`tempsTrapeze`, qui modélise l'accélération ; le générateur de G-code compte
`ecoule += longueur / v`, à vitesse constante. Plus les accélérations baissent,
plus les `M73` annoncent un temps trop court. **La durée affichée par l'imprimante
va donc devenir optimiste** — ce n'est pas un symptôme d'impression.

---

## 8. L'ordre des calibrations à produire

L'ordre est celui d'OrcaSlicer, avec l'essai d'écrasement inséré là où Ellis le
met — **avant tout le reste** — et une **étape zéro** qui n'existe pas chez eux :
chez eux le trancheur est acquis, chez nous il est à prouver.

### Étape 0 — valider le trancheur (aucune mesure, aucun réglage à changer)

Tant que ces quatre pièces ne sortent pas proprement, **aucun essai n'est
interprétable** : on ne saura pas si un défaut vient du filament, de la machine ou
d'une de nos interpolations.

| Pièce | Ce qu'elle prouve | Ce qu'on écoute |
|---|---|---|
| Cube 20 mm | parois, couture, cotes, première couche | un ton **constant** par type de ligne |
| Cylindre Ø 30 | les arcs `G2`/`G3`, qui sont à nous | un bégaiement sur la courbe → couper les arcs et recomparer |
| Cône, ou aileron 45° → 70° | la nouvelle échelle des surplombs | plus de **coup** à l'entrée du débord |
| Pont de 20 mm | ancrage et débit des ponts | — |

C'est aussi là qu'on juge le résultat des trois corrections d'adhérence : plateau
à 45/40, première couche à 0,24, décalage +0,02. **Si les pièces se décollent
encore mal, ne pas remonter la température : descendre encore** (40/35 est encore
au-dessus des 35 °C auxquels Bambu imprime le PLA sur sa Cool Plate).

### Étapes 1 à 11 — la calibration

| # | Essai | Ce qu'il donne | Remarque |
|---|---|---|---|
| **1** | **Première couche** | `decalage_z_plaque` | **nouveau.** À refaire **pour chaque plaque** : c'est le seul réglage vraiment propre à une plaque. C'est lui qui règle l'arrachement. |
| 2 | Température | `temperature_buse` | la plage est **bornée à 215 °C** par la contrainte d'aspect : l'essai sert à vérifier qu'on ne perd rien, pas à chercher un optimum |
| 3 | Débit maximal | `debit_maximal` | **sans urgence** : avec les vitesses posées on plafonne à 6,3 mm³/s, la moitié des 12 déjà en place. À faire avant de remonter les vitesses, pas avant. |
| 4 | Avance de pression | `pression_avance` | c'est **elle** qui compense ce qui reste des changements de vitesse. À faire **avant** de toucher aux accélérations. |
| 5 | Rapport de débit | `rapport_debit` | on attend ~0,98 [O-P]. À faire avec `parois_variables` sur **Non**, sinon on mesure deux choses à la fois. |
| 6 | Rétraction | `longueur_retraction` | 0,8 mm est déjà la valeur machine : l'essai confirme |
| 7 | Passage des coins | jerk | — |
| 8–9 | Lissage d'entrée | fréquence, amortissement | utile seulement quand on voudra remonter les accélérations (étape 12) |
| 10 | VFA | vitesses à éviter | idem |
| 11 | *Patte d'éléphant* | `compensation_premiere_couche` | ⚠️ **reste à écrire.** Se fait **après** l'écrasement, l'ourlet dépendant du décalage Z. |

Une fois 1 à 6 faits, remettre **`parois_variables` sur Oui** : c'est un vrai gain
de résistance sur les nervures fines, qui n'attendait que le débit mesuré.

### Étape 12 — et seulement là, la vitesse

C'est le **dernier** paramètre, et il se remonte dans cet ordre, jamais l'inverse :

1. **l'accélération d'abord**, vitesses basses. Elle ne change ni le débit, ni la
   température, ni la géométrie : elle ne peut dégrader que l'aspect, donc elle se
   teste sans rien casser. Si le cube et le cylindre restent nets de 1 500 à
   3 000 puis 5 000 mm/s², la mécanique suit ;
2. **les vitesses ensuite**, en gardant le rapport paroi → surplomb fort sous 4×.

Les deux se compensent dans la formule de `d` (§5.1) : remonter la vitesse
d'abord ferait retomber dans le régime bancal sans qu'on comprenne pourquoi. La
fusion des morceaux, elle, suit toute seule désormais (§5.6).

**Ce qui se décide après tout cela** : l'ordre des parois « en sandwich » (il
demande ≥ 3 parois, donc d'abord lever le verrou des 2), la couture en biseau,
« une seule paroi sur les dessus », le repassage, et la stratégie de surplomb
**progressive** — qui est maintenant utilisable, puisque ses morceaux sont
fusionnés comme les autres.
