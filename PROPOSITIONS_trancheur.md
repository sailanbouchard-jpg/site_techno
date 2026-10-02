# Trancheur de l'Atelier 3D — les cas critiques, sous-algorithme par sous-algorithme

> **État : réalisé le 1er octobre 2026.** Ce document a commencé comme une analyse ;
> il est maintenant le **compte rendu de ce qui a été mis en place**, avec, pour chaque
> cas critique, ce qu'on faisait, ce qui se fait ailleurs (PrusaSlicer, OrcaSlicer, Cura,
> Bambu Studio), et ce qui a été écrit — ou volontairement laissé de côté, avec la raison.
>
> Fichiers : `atelier-3d/tranchage/` (13 modules) et `atelier-3d/noyau/reglages_impression.js`.
> Les **supports** sont hors sujet (§9.1), à la demande.

---

## 0. Ce qui a changé, en bref

Le trancheur était déjà avancé — paliers de surplomb, ancrage des ponts, ponts
intérieurs, couture en biseau, parois à largeur variable, évitement des parois en
déplacement, arcs G2/G3. Rien n'a été jeté. Treize chantiers s'y sont ajoutés, et
**un défaut de fond a été découvert en chemin** (le classement par milieu de segment,
§2.A1) qui faussait tout le traitement des surplombs sur les pièces à faces planes —
c'est-à-dire la plupart des pièces de techno.

| Ce qui ne marchait pas | Ce qui a été fait |
|---|---|
| Une arête droite de 30 mm recevait **un seul verdict de surplomb**, lu en son milieu | Le tracé est redécoupé à 0,5 mm avant d'être classé |
| Un pont était **sous-extrudé de 43 %** (traité comme une ligne écrasée) | Section ronde, comme chez tout le monde, plus un réglage de débit |
| **Une seule direction de pont par couche** | Une direction par portée connexe, choisie avant l'ancrage, pas de 5° |
| Les parois plus fines qu'une ligne devenaient un **peigne de moignons jetés** | Axe médian : un cordon posé au milieu, à la largeur du filet |
| Rien ne voyait venir un **bord qui s'enroule** | Une note cumulée de couche en couche, qui pilote vitesse, ventilation, déplacements et diagnostic |
| Les îles d'une couche étaient **imprimées en alternance** | Une île est finie avant qu'on passe à la suivante |
| Le diagnostic conseillait d'« activer les supports » **qui n'existent pas** | Message corrigé, et quatre nouveaux constats |

Trois modules sont nés : `appuis.js` (ce qui porte quoi), `axe_median.js` (les filets),
`enroulement.js` (les bords qui se retroussent). `tranchage_piece.js` est passé de deux
passes à **une seule passe montante**, ce qui lui permet enfin de transmettre d'une
couche à l'autre ce qu'elle a de stable.

**Dix-sept réglages** sont apparus, **deux** ont changé de sens, **un** a été retiré.

---

## 1. Pourquoi découper en sous-algorithmes

« Surplomb » n'est pas *un* cas mais **sept**, qui n'ont ni la même cause ni le même
remède. Un trancheur moderne ne demande pas « est-ce un surplomb ? » mais **« qu'est-ce
qui porte cette ligne, et sur quelle longueur ? »** :

| Ce qui porte la ligne | Nom du cas | Remède | État |
|---|---|---|---|
| Toute la largeur | paroi ordinaire | rien | — |
| 75 / 50 / 25 % de la largeur | surplomb partiel | vitesse + ventilation + débit, par cran ou en continu | ✅ |
| Rien, mais les **deux bouts** sont posés | débord ancré | le tendre comme un pont, s'il n'est pas trop long | ✅ |
| Rien, mais une **portée franche** entre deux appuis | pont | direction propre + ancrage dans cette direction + débit rond | ✅ |
| Rien, et en dessous du remplissage clairsemé | pont intérieur | direction propre, appuis de place en place | ✅ |
| Rien du tout, **sur plusieurs couches** | surplomb progressif, enroulement | note cumulée → vitesse, ventilation, déplacements | ✅ |
| Rien du tout, et rien en dessous non plus | **îlot flottant** | support, ou refuser | ⬜ pas de support |

Le même découpage vaut pour les parois fines (§4), les coques pleines (§5), la première
couche (§6) et la robustesse géométrique (§8).

---

## 2. Famille A — Surplombs

### A1. Classement d'une paroi par part dans le vide ✅

**Avant** — trois décalages de la couche d'en dessous (−25 %, 0, +25 % de la largeur), et
le palier d'un segment lu **au milieu du segment**.

**Le défaut de fond, découvert à l'essai** — une arête DROITE n'a qu'un segment. Une pièce
de 30 × 10 mm avec une encoche de 6 mm donnait quatre morceaux de 29,6 mm : l'arête
entière passait en surplomb ou n'y passait pas, selon ce qui se trouvait sous son unique
point du milieu. Autrement dit, sur une pièce à faces planes — un boîtier, un support, un
clip — le classement des surplombs était **à peu près aléatoire**. Sur une pièce ronde,
finement facettée, il était correct : c'est pourquoi ça ne se voyait pas.

**Fait** — le tracé est redécoupé en segments d'au plus **0,5 mm** avant d'être classé
(`subdiviser`, `tranchage_piece.js`). Les points ajoutés sont alignés sur les anciens : la
forme ne bouge pas d'un micron, et `simplifier` les recolle à l'écriture du G-code. La
même encoche donne maintenant quatre morceaux de 6,0 mm, exactement la largeur du vide.

**Fait aussi** — le classement passe par `appuis.js` :
- les bandes sont **emboîtées** (le porteur décalé de (part − ½) × largeur), donc « être
  dehors » est vrai pour les petites parts et faux ensuite : une **dichotomie** trouve la
  part en 3 tests au lieu de 8 ;
- un quatrième cran, **part = 1** (toute la ligne en l'air), a été ajouté aux paliers. Il
  ne change aucune vitesse, mais sans lui une ligne qui ne touche rien était rapportée à
  0,75 : le débit n'était pas assez réduit et l'enroulement s'accumulait trop lentement ;
- un **mode progressif** (`strategie_surplomb: "lissee"`) mesure au huitième et interpole
  la vitesse entre les quatre repères, au lieu de marcher par crans. C'est la réponse au
  défaut que le code signalait lui-même : chaque changement de cran laisse un bourrelet.

**Ailleurs** — mêmes crans chez OrcaSlicer (`overhang_1_4_speed`…), qui a ajouté depuis
une variante à vitesse lissée pour la même raison.

### A2. Ordre des parois sur une couche en surplomb ✅

**Avant** — un choix global : soit « appui maximal » inversait l'ordre sur *toutes* les
couches, soit `ordre_parois` valait pour la pièce entière.

**Fait** — `parois_surplomb_dabord` n'inverse l'ordre que **sur les couches qui débordent**
(`appuis.aUnSurplomb`). Les 95 % de couches sans surplomb gardent l'ordre choisi, donc la
précision de cote. Et `ordre_parois` a un troisième choix, **« extérieure en sandwich »**
(une paroi intérieure, puis l'extérieure, puis les autres), l'`inner-outer-inner` d'Orca :
l'extérieure a un appui derrière elle sans perdre sa précision. Trois parois au moins ;
sinon on retombe sur intérieures-puis-extérieure.

### A3. Débord ancré aux deux bouts → pont de paroi ✅

**Avant** — une stratégie **exclusive** : la choisir faisait perdre les paliers de vitesse
ailleurs sur la même pièce. Et le critère était purement topologique : un débord ancré mais
long de 40 mm était tendu comme un pont de 2 mm.

**Fait** — `tendre_les_debords` est une case à cocher qui **se cumule** avec tout le reste
(c'est le `overhangs` de Prusa), et `longueur_debord_tendu` (12 mm par défaut) borne ce
qu'on accepte de tendre. Au-delà, le morceau repasse en vitesse de surplomb.

> Vérifié : sur une encoche de 6 mm, les quatre morceaux de paroi deviennent des ponts ;
> sur un tablier de 29 mm, aucun — ce qui est le bon comportement dans les deux cas.

### A4. Surplomb progressif et **enroulement** ✅ — nouveau

**Le cas** — un dôme, un cône renversé, une lettre en relief. Chaque couche ne déborde que
de 0,2 mm, aucun palier ne se déclenche, le diagnostic ne voit qu'un porte-à-faux
négligeable — mais au bout de dix couches le bord s'est **enroulé vers le haut** et la buse
tape dedans. Première cause de pièce arrachée en cours d'impression, et invisible couche
par couche.

**Ailleurs** — PrusaSlicer 2.6 en a fait un modèle de prédiction, repris par Orca :
ralentissement supplémentaire, et interdiction aux déplacements de passer au-dessus.

**Fait** — `tranchage/enroulement.js`, 70 lignes :

```
note = 0                                         si la ligne repose assez
note = part dans le vide + 0,7 × note du dessous  sinon
```

« Repose assez » = moins de la moitié de la largeur dans le vide — un chanfrein à 45° est
à 48 % et s'imprime très bien. Les notes sont rangées dans une **grille** de la taille
d'une ligne (d'une couche à l'autre, les segments ne se correspondent pas), lue sur les
neuf cases voisines. Elles sont calculées sur les parts **brutes**, avant le lissage des
morceaux : le lissage sert à éviter les changements de vitesse, et il effacerait justement
l'accumulation qu'on cherche.

La note critique est à **1,2**, choisie pour qu'une seule couche ne suffise jamais (une
ligne entièrement en l'air note 1 à elle seule, et c'est le cas normal d'un pont) : il faut
deux couches de suite entièrement dans le vide, ou quatre à moitié.

Au-delà, quatre choses : la **vitesse** tombe à celle du surplomb fort, la **ventilation**
passe au réglage des surplombs, les **déplacements** ne passent plus au-dessus (la zone en
débord est retirée du contour de circulation), et le **diagnostic** le dit.

> Vérifié : rien sur un cône à 48°, rien sur un pont d'une couche ; la note monte à 1,67 sur
> un cône très ouvert et déclenche sur le haut d'un perçage horizontal de Ø 8.

### A5. Débit réduit en surplomb ✅

**Avant** — une réduction uniforme (`debit_surplomb`), plus une valeur imposée par la
stratégie « appui ».

**Fait** — la réduction suit la part dans le vide : `1 − (1 − debit_surplomb/100) × part`.
Une ligne posée au quart dans le vide ne perd qu'un quart de la réduction. C'est le champ
`surplomb` du protocole, transmis au fil principal pour ça.

### A6. Ventilation des surplombs ✅

**Avant** — le ventilateur était commuté **au moment** du chemin. Or il met plus d'une
seconde à monter en régime sur un P1 : un surplomb de 3 mm ne recevait jamais le souffle
demandé.

**Fait** — l'ordre d'émission de la couche est établi d'avance, et la ventilation voulue de
chaque chemin est relevée **un chemin plus tôt** (seulement vers le haut : elle ne
redescend jamais avant l'heure). C'est ce que fait Bambu Studio.

### A7. Géométrie : rendre le surplomb imprimable ⬜ — volontairement non fait

Cura (`conical_overhang`) et Orca chanfreinent **le modèle**. Ici c'est un atelier de CAO :
le trancheur signale, l'élève corrige. Le constat d'enroulement dit explicitement quoi
faire (« chanfreiner ce bord, ou poser la pièce autrement »). Une opération « chanfreiner
les surplombs » dans l'onglet Conception serait utile, mais c'est une opération de
modélisation, pas de tranchage : elle a sa place dans `application/operations/`.

### A8. Îlot flottant ✅ (message) / ⬜ (traitement)

Le diagnostic repérait bien les contours entièrement en l'air, mais concluait : *« ou
activer les supports »* — **qui n'existent pas** (le mot n'apparaissait nulle part ailleurs
dans `atelier-3d/`). Le message dit maintenant la vérité : retourner la pièce, la couper en
deux morceaux à coller, ou ajouter de la matière jusqu'au plateau. Voir §9.1.

---

## 3. Famille B — Ponts

### B1. Ce qui porte vraiment ✅ — nouveau

**Avant** — la référence était `sections[k−1]`, le **contour** de la couche d'en dessous.
Une couche entièrement constituée d'un pont servait donc d'appui à la suivante comme si
c'était du plein. Sur un tube couché ou un empilement de fenêtres, l'erreur s'accumulait.

**Fait** — `appuis.js` introduit le **porteur** : la section d'une couche, moins ce qui n'a
trouvé aucun appui (une portée dont aucun brin n'est ancré). C'est lui, et non la section
brute, que la couche d'au-dessus prend pour sol. Un pont correctement ancré, lui, compte
comme du plein — il est tendu ; c'est aussi le choix de PrusaSlicer.

C'est ce qui a imposé le passage à **une seule passe montante** : une couche ne peut
transmettre ce qu'elle a de stable que si elle est entièrement traitée avant la suivante.

### B2. Direction du pont — une par portée ✅

**Avant** — toute la zone de vide de la couche était hachurée d'un seul angle, choisi parmi
douze (pas de 15°). Deux fenêtres perpendiculaires : l'une des deux était forcément mal
tendue. Et la note était presque toujours 1,0, parce que les brins étaient comptés sur la
zone **déjà élargie de l'ancrage** : leurs bouts tombaient en plein dans la matière quelle
que soit la direction. Le choix se réduisait au départage par longueur.

**Fait** — `decouperEnPortees` découpe le vide en morceaux connexes
(`CrossSection.decompose()`) et juge chacun pour lui-même :
- la direction est choisie sur la portée **nue**, avant tout ancrage ;
- la note est la **longueur** de brins ancrés aux deux bouts rapportée à la longueur
  totale (et non leur nombre) ; à égalité, la direction dont le **plus long brin** est le
  plus court, car un brin long pend et casse ;
- le pas est de **5°**, comme PrusaSlicer. Le balayage d'essai est volontairement grossier
  (la note ne dépend pas du pas), donc trente-six directions ne coûtent rien.

Une portée trop petite pour recevoir un seul brin reste une portée : sans cela elle
retombait dans la surface du dessus et se faisait remplir en diagonales au-dessus du vide.

### B3. Débit d'un pont ✅

**Avant** — `sectionDeLigne(0,4 ; 0,2)` = **0,0714 mm²** : un rectangle à bouts ronds,
c'est-à-dire une ligne écrasée. Or un brin tendu dans l'air ne s'écrase sur rien, il reste
**rond** : π/4 × 0,4² = **0,1257 mm²**. Nos ponts recevaient **57 %** de la matière d'un
pont de Bambu Studio, alors que leurs brins étaient espacés comme s'ils étaient ronds et
pleins. D'où des brins maigres, du jour entre eux, de l'affaissement, parfois la rupture.

**Fait** — section circulaire pour `T.pont`, plus un réglage `debit_pont` (100 % par
défaut, plage 50–130). Le pont **intérieur** garde la section écrasée : il repose de place
en place sur le remplissage, il n'est pas dans le vide.

> À surveiller au premier essai : les ponts vont devenir sensiblement plus gras. Si la
> surface du dessous remonte trop, c'est `debit_pont` qu'on baisse, pas la formule.

### B4. Ancrage ✅

**Avant** — 3 mm en dur, tout autour de la portée. Un pont mord sur la matière qui le porte
**aux deux bouts de ses brins**, et seulement là : élargir tout autour recouvrait aussi ses
côtés, qui ne portent rien, et faussait du même coup le choix de la direction (§B2).

**Fait** — l'ordre est inversé : direction d'abord, ancrage ensuite, et **dans la direction
des brins seulement**. L'ancrage est l'intersection de trois choses : la portée dilatée de
`ancrage_pont`, le porteur, et une **bande rectangulaire orientée** selon la direction
choisie, allongée du seul ancrage le long des brins. Deux opérations de plus, pas davantage.
`ancrage_pont` (3 mm) et `portee_minimale_pont` (2 mm) sont devenus des réglages.

### B5. Pont intérieur et densification ✅

Le pont intérieur (une couche pleine tendue au-dessus du remplissage clairsemé) existait
déjà et est bien fait — c'est une fonctionnalité récente d'OrcaSlicer. Il bénéficie
maintenant du découpage en portées, comme les vrais ponts.

**Ajouté** — `couches_densification` (2 par défaut) : juste sous les couches pleines d'un
dessus, le remplissage **double de densité** sur ce nombre de couches, plafonné à 60 %.
Le pas est divisé par deux, donc une ligne sur deux retombe exactement sur celle de la
couche d'en dessous : la zone dense s'empile proprement avec la zone normale. C'est la
version simple du *gradual infill* de Cura. Coût mesuré sur une boîte de 30 × 30 × 10 :
+0,1 g et +1 min.

Le **remplissage foudre** (*lightning infill*) reste une piste ; c'est un gros morceau.

### B6. Trous horizontaux ✅ (par B2)

Le haut d'un perçage horizontal est un surplomb à 90° sur une courte portée — un classique
en techno. Le découpage par portée connexe le règle à lui seul : un petit disque non
soutenu obtient la direction qui minimise la longueur des brins, c'est-à-dire l'horizontale
du trou. Rien de plus n'a été écrit.

---

## 4. Famille C — Parois fines et petits détails

### C1. Une paroi plus fine qu'une ligne ✅ — nouveau module

**Avant** — une nervure de 0,4 mm ne recevait aucune paroi (le décalage rendait le vide) et
devenait un « interstice », rempli par des hachures **en travers** de son axe. Pour une
nervure de 0,4 × 20 mm : ≈ 70 segments de 0,4 mm perpendiculaires, reliés en zigzag, au
lieu d'un seul trait de 20 mm. Et comme `hachures` jette tout intervalle de moins de
0,3 mm, **sous 0,3 mm de large la nervure disparaissait purement et simplement**.

**Fait** — `tranchage/axe_median.js`, sans dépendance. Un filet n'est pas une forme
quelconque, c'est une **bande** : deux longs côtés et deux bouts. D'où un squelette direct :

1. le contour est coupé en deux chaînes, une par long côté ;
2. on avance le long d'une chaîne et, à chaque pas, on cherche le point le plus proche sur
   l'autre : le milieu des deux est sur l'axe, leur distance est la largeur à y déposer ;
3. les pas voisins de même largeur sont recollés en tronçons, pour que la buse ne change
   pas de débit tous les dixièmes de millimètre.

Le point délicat est **où couper**. Le réflexe — « aux deux sommets les plus pointus » — ne
marche pas : dans un filet rectangulaire tous les coins font le même angle, et l'on coupe
alors les deux bouts du *même* long côté, ce qui laisse la moitié du filet de côté (c'est
exactement ce que faisait une première version, qui perdait un bras sur deux dans un filet
coudé). On procède donc à l'envers : chaque coupe envisagée associe un sommet à son
**antipode** (à mi-périmètre, car les deux côtés d'une bande ont la même longueur), et on
garde la coupe dont la bande est la plus étroite partout. C'est la définition d'une bande,
vérifiée au lieu d'être devinée. Dix coupes essayées, six mesures chacune : le coût est
borné.

Deux cas particuliers : une bande **en anneau** (le filet entre une paroi ronde et sa
voisine) arrive en deux contours et s'apparie directement, en rendant un cordon fermé ; une
forme qui n'est pas une bande (trois branches en Y) est **refusée**, et l'appelant retombe
sur l'ancien zigzag, faute de mieux.

> Vérifié sur huit formes : nervure droite, filet qui s'affine, coin aigu en triangle,
> anneau de 0,3 mm, bande coudée en L, carré (refusé), filet de 0,08 mm (rien à déposer),
> et des dégénérés. Une nervure de 0,4 × 20 mm donne maintenant **un cordon de 19,3 mm**
> posé sur l'axe, contre un peigne de moignons avant.

**Arachne complet** (diagramme de Voronoï, nombre de perles décidé localement) reste hors
de portée raisonnable, et la version « bande » couvre les pièces de techno.

### C2. Parois à largeur variable ✅

Le module existait. Deux défauts corrigés :

- **un filet n'a plus qu'UN propriétaire.** Un filet coincé entre deux parois était à
  portée des deux, et chacune l'absorbait : la matière était poussée deux fois et la pièce
  gonflait là où elle devait être comblée. L'attribution se fait maintenant d'abord, pour
  toutes les parois à la fois, avec la même mesure de distance que l'absorption ;
- **les largeurs sont lissées** d'un tronçon au suivant (moyenne glissante sur trois).
  Passer de 0,42 à 0,75 mm en 1,2 mm de tracé, c'est +80 % de débit d'un coup : l'extrudeur
  ne suit pas et laisse un bourrelet. C'est maintenant une rampe.

### C3. Petits contours ✅

Un trou de Ø 3 mm parcouru à 200 mm/s n'atteint jamais sa vitesse : l'accélération et
l'avance de pression le déforment, et il sort ovale et bouché. `vitesse_petits_contours`
(50 mm/s) et `seuil_petits_contours` (20 mm de périmètre, soit un trou de Ø 6) plafonnent
la vitesse des boucles courtes. C'est l'explication directe du « mes trous sont trop
petits », plus honnête que d'augmenter `compensation_trous`.

### C4. Plein intérieur étroit ✅

Une bande pleine de 0,6 mm hachurée à 45° ne donnait qu'une poignée de moignons, la plupart
jetés faute de longueur. Une zone pleine dont l'épaisseur moyenne (2 × aire ÷ périmètre)
descend sous **deux largeurs de ligne** bascule d'office en **concentrique**, qui épouse sa
forme. C'est le `detect_narrow_internal_solid_infill` d'Orca, en une ligne de test.

### C5. Détail plus mince qu'une couche ✅ (partiellement)

Une plaque de 0,15 mm à une hauteur de couche de 0,2 : le plan de coupe passe à côté.

**Fait** — un constat « **couche vide dans la pièce** » quand une couche ne contient rien
alors que la pièce continue au-dessus. Cela attrape le cas des morceaux séparés en hauteur,
qui n'était signalé **par rien** jusqu'ici (le détecteur d'îlots ignorait les couches vides).

**Non fait** — le détail mince mais *rattaché* à une paroi. Le repérer demanderait une
seconde passe de coupe aux frontières de couche, ou la hauteur de couche adaptative (§9.2).

### C6. Couture ✅ (jeu) / ⬜ (décalage des intérieures)

Ajouté : `jeu_couture`, le tour de paroi s'arrête un peu avant son point de départ et la
matière encore sous pression comble le reste. Sans lui, la fin du tour s'ajoute au début et
la couture fait un bourrelet. Inutile avec la couture en biseau, qui règle le même problème
autrement.

Non fait : les coutures intérieures décalées (*staggered inner seams* d'Orca). Elles
**contredisent** le dessin actuel, qui aligne volontairement les parois intérieures sur
l'extérieure pour que les défauts s'empilent au même endroit au lieu de se disperser. Ce
serait un choix à trancher, pas un manque.

### C7. Précision de cote de la paroi extérieure ⬜ — retiré

Un réglage `paroi_precise` avait été ajouté puis **retiré**. La correction qu'il devrait
appliquer ne se dérive pas proprement : ce que fait `precise_outer_wall` chez Orca tient à
des détails d'implémentation de leur générateur de parois, et la valeur qu'on en tirerait
ici (un demi-arrondi, ≈ 0,02 mm) est trop petite pour être le biais qu'on observe.
`compensation_contours` fait le travail une fois la cote mesurée. Mieux vaut pas de réglage
qu'un réglage dont on ne sait pas justifier la formule.

---

## 5. Famille D — Coques pleines (dessus, dessous)

### D1. Classement ✅ (inchangé)

Intersections des N couches au-dessus et en dessous, priorité du pont sur le dessus (« la
tenue prime sur l'aspect »), plein intérieur = ce qui reste. La méthode classique,
correctement écrite. Rien à y toucher.

### D2. Épaisseur de coque sur les flancs inclinés ✅

Les couches pleines sont comptées **à la verticale**. Sur un flanc incliné, la coque mesurée
perpendiculairement est bien plus mince, et le remplissage se devine au travers.
`elargissement_coques` (0,4 mm) élargit latéralement les couches pleines du dessus et du
dessous, en les ramenant à l'intérieur. C'est la version simple d'`ensure_vertical_shell_thickness` ;
0 la désactive.

### D3. Une seule paroi sur les dessus ✅

C'est la principale raison pour laquelle les dessus d'Orca sont plus beaux. La surface du
dessus est connue **avant** les parois (elle se lit sur les sections seules), et les parois
intérieures y sont **coupées** : le motif du dessus couvre alors la surface d'un seul
tenant. L'intérieur à remplir devient double — après la dernière paroi partout, après la
première sur cette surface.

Le cas où la couche **entière** est un dessus (la dernière couche d'une pièce) est traité à
part : elle n'a qu'une paroi, et son intérieur commence juste derrière.

> `une_paroi_sur_dessus` est à **« non » par défaut**, le temps d'un essai au navigateur :
> c'est le seul changement qui touche à la façon dont les parois sont découpées, et il
> change l'aspect sans rien améliorer à la tenue.

### D4. Chevauchement des pleins ✅

`CHEVAUCHEMENT_DES_PLEINS = 0.25` était en dur, alors que le chevauchement du remplissage
clairsemé était réglable. C'est maintenant `chevauchement_pleins` (25 %), par cohérence
avec le principe « tout ce qui peut être configuré, l'est ».

### D5. Repassage ✅ (inchangé)

---

## 6. Famille E — Première couche et adhérence

### E1. Patte d'éléphant ✅ (inchangé)

### E2. Bordure ✅ — oreilles

`type_bordure` ajoute les **oreilles** (*brim ears* de Prusa) : de petits disques posés dans
les angles pointus seulement — c'est là que le décollement commence, un coin franc tirant
sur la matière des deux côtés — et il y a dix fois moins de matière à retirer après.
`angle_des_oreilles` (120°) dit à partir de quelle pointe un coin en reçoit une. Deux
pointes voisines ne valent qu'une oreille, et une oreille ne recouvre jamais la pièce.

> Mesuré sur une pièce à deux pieds : 2 409 mm³ de matière en bordure complète,
> **2 352 mm³** en oreilles, pour le même effet d'ancrage.

**Bordure automatique : volontairement non faite.** Le diagnostic sait détecter le pied
fragile et la pièce élancée, et le dit. Mais poser une bordure d'office changerait
l'impression sans que l'élève l'ait décidé — c'est exactement ce que §12 interdit.

### E3. Pièce haute et étroite ✅

Un mât de 8 × 8 × 80 : la buse le fait vibrer, puis le couche. Nouveau constat « pièce
élancée » au-delà d'un rapport hauteur / plus petit côté au sol de 8.

### E4. Radeau ⬜ — hors sujet

Peu utile sur plateau texturé Bambu.

---

## 7. Famille F — Thermique et ordre d'impression

### F1. Temps de couche minimal — ⚠️ **l'analyse de départ était fausse**

Ce document affirmait d'abord que le calcul plateau-entier était un défaut, et qu'une pointe
fine à côté d'une grosse pièce « n'était jamais ralentie, et fondait ». **C'est faux**, et
le correctif a été abandonné après vérification.

Le trancheur imprime **toutes les pièces couche par couche**. Le temps qui sépare deux
couches d'une même pièce est donc le temps de la couche ENTIÈRE du plateau, y compris ce
qui s'imprime sur les autres pièces. Une pointe fine à côté d'une grosse pièce a donc eu,
en réalité, les quarante secondes de la grosse pièce pour refroidir. Le calcul
plateau-entier est la bonne mesure dans ce mode d'impression — c'est aussi ce que fait
OrcaSlicer. Le calcul par pièce n'aurait de sens qu'en **impression séquentielle** (§F4),
qui n'existe pas ici.

Rien n'a donc été changé. Ce qui manquait vraiment, c'était de le **dire** : voir F2.

### F2. Dire quand ça ralentit ✅

Nouveau constat : « N couches ralenties pour refroidir », avec le facteur le plus fort et la
hauteur où il se produit. Il explique l'essentiel de la durée d'impression d'une pièce
élancée, et rappelle que le ralentissement s'arrête à la vitesse minimale de refroidissement.

### F3. Ordre des chemins dans une couche ✅

**Avant** — les parois arrivaient par **rang** (toutes les parois intérieures de la couche,
puis toutes les extérieures) et les remplissages par **type**. Sur une couche à deux îles,
la buse faisait l'aller-retour entre elles à chaque rang et à chaque type : des déplacements
pour rien, des fils entre les deux, et chaque île laissée à refroidir au milieu de son
propre cycle.

**Fait** — `rangerParIlot` groupe les chemins par composante connexe de la section et range
les îles par **plus proche voisin**, depuis le dernier point tracé de la couche précédente.
L'ordre relatif à l'intérieur d'une île est conservé : il porte déjà le bon enchaînement.

> Vérifié sur une pièce à deux îles : **0 couche entrelacée sur 30**.

### F4. Impression séquentielle ⬜ — plus tard

Utile contre les fils, mais demande un test de collision avec le portique.

### F5. Déplacements ✅

Le module était déjà au niveau de ce qui se fait ailleurs (rester dans la matière,
contourner par graphe de visibilité, rétracter en dernier recours). Ajouté : **les zones en
débord d'une couche qui s'enroule sont retirées du contour de circulation**, donc la buse
ne passe plus au-dessus de ce qui s'est retroussé. C'est l'`avoid_crossing_curled_overhangs`
de Prusa, obtenu sans nouvelle géométrie — la zone de débord est déjà calculée.

---

## 8. Famille G — Robustesse géométrique

### G1 et G2. Maillage ouvert, recollage ✅

**Avant** — « un bout qui ne se referme pas est abandonné ». Un STL importé légèrement troué
perdait donc des îlots entiers, **sans aucun message**. Et le recollage se faisait par
arrondi au dix-millième de millimètre utilisé comme **clé de hachage** : ce n'est pas une
tolérance, deux points distants d'un cent-millième mais de part et d'autre d'une frontière
de grille recevaient des clés différentes, et la chaîne cassait.

**Fait** — le chaînage regarde les **neuf cases voisines** et retient le bout le plus proche
sous la tolérance ; un contour dont les deux bouts se rejoignent à la tolérance près est
refermé. Ce qui ne se referme toujours pas est **compté** et remonté jusqu'au diagnostic,
qui affiche une alerte « maillage troué » avec le nombre de contours perdus.

> Vérifié : un cylindre privé de deux de ses faces latérales déclenche l'alerte, là où il
> produisait silencieusement une pièce vide.

### G3 et G4. Auto-intersections, slivers ✅ (inchangé)

Gérés par la règle de remplissage `"Positive"` de Manifold et les seuils d'aire minimale.

---

## 9. Les grands absents

### 9.1 Supports ⬜ — exclus à la demande

Rien n'existe, et c'est assumé : le diagnostic ne renvoie plus vers une fonction
inexistante. Le découpage du problème, le jour venu, reste celui-ci :

1. **détection des zones à soutenir** — déjà là à 90 % : `appuis.js` calcule exactement la
   matière non portée, il suffirait de l'accumuler ;
2. **projection vers le bas**, avec élargissement XY et angle de dépouille ;
3. **interface** : 2 à 3 couches denses sous la pièce, séparées d'un **jeu en Z**. C'est
   l'interface et le jeu qui rendent un support détachable ; sans eux, l'élève casse sa
   pièce en l'arrachant ;
4. **corps** : hachures espacées, aucun contact latéral avec la pièce.

Les étapes 1 à 4 donnent des supports utilisables (~500 lignes, un `tranchage/supports.js`,
un type de ligne, quelques réglages). Les supports arborescents sont hors de portée.

### 9.2 Hauteur de couche adaptative ⬜

Hors périmètre initial. La brique est prête : `couchesDuPlateau` construit la liste des
hauteurs et rien ailleurs ne suppose qu'elles soient régulières (`epaisseurs[]` est un
tableau). Ce serait essentiellement un nouveau générateur de hauteurs.

### 9.3 Multi-matériau, AMS, tour de purge ⬜

---

## 10. La restructuration

### 10.1 Le problème

Trois modules calculaient chacun leur propre idée de « ce qui porte » : les parois par trois
décalages, les ponts par une différence booléenne, le diagnostic par un échantillon de
points. Trois vocabulaires, trois seuils, et aucun ne savait ce que les autres avaient
décidé. C'est ce qui empêchait d'écrire « inverser l'ordre des parois seulement sur les
couches qui débordent » ou « ne pas s'appuyer sur un pont ».

### 10.2 `tranchage/appuis.js`

Deux notions, et c'est tout :

- le **porteur** : la matière d'une couche sur laquelle on peut compter (§B1) ;
- la **part dans le vide** : pour un point du tracé, la fraction de la largeur de sa ligne
  qui n'a rien en dessous, de 0 à 1 — lue sur des bandes emboîtées, par dichotomie.

`trancherPiece` fait désormais **une seule passe montante**, et chaque couche suit six
étapes dans l'ordre : appuis → parois → classement de l'intérieur → remplissages →
rangement île par île → ce qu'elle laisse de stable.

### 10.3 La table de décision, en remplacement du bouton radio

`strategie_surplomb` proposait quatre stratégies **exclusives** (`paliers`, `unique`,
`ponts`, `appui`). Ce n'étaient pas des stratégies concurrentes mais **quatre mécanismes qui
s'additionnent**. Elles sont devenues :

| Réglage | Rôle |
|---|---|
| `strategie_surplomb` : paliers / progressive / vitesse unique | **comment** la vitesse baisse |
| `tendre_les_debords` + `longueur_debord_tendu` | tendre les débords ancrés et courts |
| `parois_surplomb_dabord` | inverser l'ordre, sur les seules couches qui débordent |
| `detection_enroulement` | la note cumulée du §A4 |
| `debit_surplomb` | la matière, à proportion de la part dans le vide |

L'essai de calibration « Surplombs et ponts » a suivi : ses quatre peignes ne comparent plus
quatre valeurs d'un même réglage mais quatre **combinaisons** de ces mécanismes, et sa
conclusion écrit la combinaison gagnante telle quelle.

---

## 11. Les réglages, avant et après

**Dix-sept nouveaux**, groupés là où on les cherche :

| Onglet · groupe | Réglages |
|---|---|
| Qualité · Ponts | `ancrage_pont`, `portee_minimale_pont` |
| Qualité · Parois | `une_paroi_sur_dessus` ; `ordre_parois` gagne « extérieure en sandwich » |
| Qualité · Couture | `jeu_couture` |
| Résistance · Dessus et dessous | `elargissement_coques`, `chevauchement_pleins` |
| Résistance · Remplissage | `couches_densification` |
| Vitesse · Vitesses | `vitesse_petits_contours`, `seuil_petits_contours` |
| Vitesse · Surplombs | `tendre_les_debords`, `longueur_debord_tendu`, `parois_surplomb_dabord`, `detection_enroulement`, `debit_pont` |
| Adhérence · Bordure | `type_bordure`, `angle_des_oreilles` |

**Deux redéfinis** : `strategie_surplomb` (trois choix au lieu de quatre, et il ne parle plus
que de vitesse), `debit_surplomb` (proportionnel à la part dans le vide).
**Un retiré** : `paroi_precise` (§C7).

Un filet a été ajouté au passage : `valeursEffectives` **valide** maintenant chaque écart
contre son réglage. Un projet enregistré avec `strategie_surplomb: "ponts"` — un choix qui
n'existe plus — retombe sur le préréglage au lieu de fausser tout un tranchage en silence.

---

## 12. Ce qu'il ne faut pas faire (inchangé)

- **Ne pas déformer le modèle en silence** (chanfreins automatiques, trous agrandis
  d'office, bordure posée sans le dire). L'Atelier est un outil de CAO : le trancheur
  signale, l'élève corrige. La seule exception légitime reste la patte d'éléphant, qui
  compense la machine, pas le dessin.
- **Ne pas empiler les options.** La table du §10.3 *retire* un réglage en même temps
  qu'elle en ajoute quatre plus clairs ; `paroi_precise` a été retiré faute de pouvoir
  justifier sa formule.
- **Ne pas ajouter de dépendance.** Tout ce qui précède tient en géométrie 2D et en offsets
  Clipper, déjà fournis par Manifold — y compris l'axe médian.
- **Ne pas coder Arachne avant d'avoir usé la version « bande ».**

---

## 13. Ce qui reste à faire

| | Chantier | Pourquoi plus tard |
|---|---|---|
| 1 | **Supports** (§9.1) | exclus à la demande ; c'est le seul vrai trou fonctionnel |
| 2 | Opération « chanfreiner les surplombs » en Conception (§A7) | c'est de la modélisation, pas du tranchage |
| 3 | Hauteur de couche adaptative (§9.2) | hors périmètre ; la brique est prête |
| 4 | Impression séquentielle (§F4) | demande un test de collision avec le portique |
| 5 | Remplissage foudre (§B5) | gros morceau ; la densification couvre déjà le besoin |
| 6 | Arachne complet (§C1) | à n'envisager que si la version « bande » montre ses limites |

### À vérifier au navigateur, sur de vraies pièces

Le trancheur a été exercé hors ligne sur une trentaine de formes (ponts, encoches, cônes,
anneaux, nervures, trous horizontaux, maillages troués, deux îles, pièces élancées) et dans
l'atelier sur un pavé. Trois réglages méritent un essai à l'impression avant d'être adoptés :

- **`debit_pont`** — les ponts reçoivent maintenant presque le double de matière (§B3).
  C'est la valeur juste en théorie ; c'est aussi le changement le plus visible.
- **`une_paroi_sur_dessus`** — laissé à « non » (§D3).
- **`couches_densification`** — à 2 par défaut ; à comparer avec 0 sur une pièce à grand
  dessus.
