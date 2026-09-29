# Refonte des préréglages d'impression — Atelier 3D

## Contexte

Tu travailles dans l'atelier de CAO, dossier `atelier-3d/`. Lis `CLAUDE.md` si tu ne l'as pas
déjà fait. Conventions : modules ES vanilla, aucun CDN, commentaires en français, couleurs
uniquement par tokens CSS. Il n'y a pas de tests automatisés, on vérifie dans le navigateur.

Tu modifies directement les fichiers existants. Pas de git, pas de branche, pas de commit :
chaque fichier que tu touches est sauvegardé automatiquement avant modification.

## Le fichier central

`atelier-3d/noyau/reglages_impression.js`. Il contient deux choses distinctes, ne les confonds pas :

- le **catalogue** `REGLAGES` : la liste de tous les réglages existants, avec leur clé et leur onglet ;
- les **préréglages** `PREREGLAGES_TRAITEMENT` et `PREREGLAGES_FILAMENT` : des jeux de valeurs
  toutes faites qu'on applique d'un coup.

Les machines sont ailleurs, dans `atelier-3d/noyau/plateau.js`, constante `MACHINES`. Elles ne
sont pas des préréglages aujourd'hui, et elles devraient l'être.

---

## TÂCHE 1 — Trois familles de préréglages, et rien d'autre

À l'arrivée il doit exister exactement **cinq préréglages**, répartis en trois familles :

| Famille | Préréglages | Contenu |
|---|---|---|
| machine | « P1P défaut », « P1S défaut » | valeurs constructeur Bambu Lab |
| filament | « PLA défaut », « PETG défaut » | valeurs typiques de la matière |
| traitement | « 0.20 défaut » | hauteur de couche 0,20 mm |

Supprime tous les préréglages actuels (`0.20_prudent`, `essai_orca`, `pla_polyterra`, et les autres).

**Chaque préréglage ne porte que les réglages de sa propre famille.** Un réglage a déjà une source
déduite de son onglet : regarde la fonction `sourceDe` pour savoir à quelle famille il appartient.
Un préréglage machine ne contient donc aucun réglage de filament, et réciproquement.

### Comment choisir les valeurs

Ces valeurs sont un point de départ avant calibration, pas un réglage optimal.

Le critère est qu'elles doivent **marchouiller partout** et surtout permettre de **converger**
pendant la calibration, quel que soit le but visé ensuite : vitesse, étanchéité, résistance ou
esthétique.

Donc : conservateur plutôt qu'optimal. Et surtout, **jamais une valeur qui masque un défaut qu'un
essai doit révéler** — si un réglage trop généreux cache le problème que l'essai cherche à mettre
en évidence, l'essai ne sert plus à rien.

Tu peux chercher sur le web les valeurs constructeur Bambu Lab et les plages usuelles PLA/PETG.

---

## TÂCHE 2 — Classer chaque réglage du catalogue

Ajoute à **chaque** entrée de `REGLAGES` un champ `role`, avec une seule de ces trois valeurs :

- `"fixe"` — choisi une fois, jamais déterminé par un essai. C'est une intention, pas une inconnue.
  Exemples : hauteur de couche, diamètre de buse, nombre de parois.
- `"a_determiner"` — trouvé par un essai de calibration.
  Exemples : rapport de débit, température, avance de pression, compensations.
- `"independant"` — sans influence sur les essais ni sur leur résultat.

Sur les `"a_determiner"` uniquement, ajoute aussi `determinePar: "<id de l'outil>"`.
Les ids existent déjà dans `atelier-3d/noyau/calibration.js` : `diametre`, `temperature`, `debit`,
`pression`, `debit_max`, `retraction`, `dimensions`, `surplombs`, `ponts`, `vitesse`, `validation`.

Si une des trois catégories te paraît vide, mal nommée ou mal découpée : **dis-le et explique
pourquoi**. Ne force pas un réglage dans une case qui ne lui va pas.

---

## Ce qu'il ne faut pas casser

**Les clés.** N'enlève et ne renomme aucune clé de réglage (`cle`). Le G-code, le trancheur et
les projets déjà enregistrés s'en servent. Tu ajoutes des champs, tu ne retires rien.

**Les projets existants.** Les identifiants de préréglage changent, donc un projet enregistré
référencera un id qui n'existe plus. Ajoute une migration pour qu'il retombe sur le nouveau
défaut au lieu de planter. Les deux endroits à regarder :
`atelier-3d/noyau/migrations_document.js` et `impressionDepuisBrut` dans `plateau.js`.

**Les signatures.** `valeursEffectives`, `valeurDuPrereglage`, `prereglage` et `ecartsNettoyes`
gardent exactement leur signature actuelle : tout le reste de l'application les appelle.

**Le trancheur.** Ne modifie rien dans `atelier-3d/tranchage/`. Tu peux le lire.

---

## Vérifier avant de rendre

Le serveur Flask de l'utilisateur tourne déjà sur le port 5000, ne le relance pas.
Pour regarder l'atelier, si le port 5057 ne répond pas déjà :

    python serveur_statique_atelier.py 5057

et arrête-le quand tu as fini.

Ce que tu peux vérifier toi-même : que les pages se servent sans erreur, que la syntaxe des
modules modifiés est correcte, qu'aucun identifiant de préréglage n'est resté orphelin ailleurs
dans le code, que la migration couvre bien tous les anciens ids.

Ce que tu **ne peux pas** vérifier : le rendu et la console du navigateur, puisque tu n'exécutes
pas le JS. Ne dis jamais « vérifié » pour ces points-là. Liste-les à part, l'utilisateur ira
regarder l'onglet Impression, les trois listes de préréglages, le tranchage du plateau et
l'ouverture d'un projet existant.

---

## Pour finir

Donne la liste des valeurs retenues pour chacun des cinq préréglages, avec la raison de chaque
choix, puis arrête-toi. La suite arrivera dans une consigne séparée.
