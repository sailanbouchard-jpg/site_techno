# Cadrage — Cyber-défis (challenges type CTF)

> **Ce document est le cadrage initial (25/09/2026).** Il a été suivi d'une refonte complète,
> décrite dans `PROPOSITIONS_cyberdefis.md`, elle-même **livrée en entier le 26/09/2026** :
> 5 catégories, 24 défis (Réseaux, Web, Manipulation de fichiers, Codes secrets, Identité et
> enquête), avec outils intégrés maison et vrais fichiers manipulés. Le corrigé du professeur est
> dans `livret_professeur_cyberdefis.md` (généré depuis `core/cyberdefis.py`). Décisions retenues :
> **flags généraux**, stockés **en clair** dans `core/cyberdefis.py` et validés côté serveur (le
> flag ne descend jamais dans la page). Se reporter à `PROPOSITIONS_cyberdefis.md` pour l'état réel.

Document de cadrage, pas de plan d'exécution. Il part de ce que fait **challenges-kids.fr** (visité et
analysé épreuve par épreuve), dit **ce qui est trop dur ou impraticable pour un collégien en salle info**,
et propose une série de défis ancrés sur le programme de technologie cycle 4.

Principe : l'élève cherche un **flag** (mot de passe, message déchiffré, information cachée). Il ne
trouve pas le flag en devinant — il le trouve **parce qu'il a compris une notion**.

---

## 1. Ce que fait challenges-kids.fr

30 épreuves, 5 catégories : **Web** (8), **Crypto** (7), **Stégano** (5), **Réseaux** (5), **Culture** (5),
plus une page **Aide & CyberChef**.

Structure d'une épreuve — c'est la bonne trame, à reprendre telle quelle :

```
📒 Instructions      énoncé court + le matériel (trame, capture, image, lien)
👉 Prérequis         l'outil nécessaire
Indice [afficher]    replié par défaut
🏁 Flag : [______]   un seul champ, une seule réponse
⇢ Challenge suivant  enchaînement linéaire
```

À garder aussi : catégories thématiques, numérotation continue (#1 → #30), score, ton léger,
illustrations, indice masqué (on ne le voit que si on le demande).

---

## 2. Ce qui ne passe pas en collège

Analysé sur les épreuves réelles. Trois familles de problèmes.

### 2.1 L'outil est inaccessible sur un poste de collège

| Épreuve | Ce qu'elle exige | Pourquoi ça bloque |
|---|---|---|
| **#23 Telnet** | installer **Wireshark** | Aucun élève n'est administrateur de sa session. L'épreuve est morte avant de commencer. |
| **#24 Her-cURL** | ouvrir l'**invite de commande** et taper `curl` | Souvent désactivée par stratégie de groupe. Et la syntaxe des options n'est pas devinable. |
| **#16 Page blanche** | ouvrir un **.docx** | Dépend de ce qui est installé et du téléchargement autorisé. |
| **#18, #19** | ouvrir un fichier « avec autre chose », lire les **EXIF** | Suppose un éditeur hexadécimal ou exiftool. |
| toutes les crypto | **CyberChef** en ligne | Dépend du filtrage web de l'établissement — et c'est contraire à la règle « zéro dépendance externe » du projet. |

**Conséquence de cadrage : l'outil doit être dans la page.** Un décodeur base64, une roue de César, une
table ASCII, un compteur de fréquences, un lecteur EXIF, un visualiseur de paquets — tous en JS local dans
`static/libs/`. Si un défi a besoin d'un logiciel à installer, le défi est mal conçu.

### 2.2 La notion est hors de portée

| Épreuve | Ce qu'elle demande vraiment | Verdict |
|---|---|---|
| **#21 Adresse MAC** | savoir qu'une trame Ethernet commence par 6 octets de MAC destination puis 6 de MAC source, et les lire dans un dump hexadécimal brut | Niveau BTS. L'idée est bonne, la présentation est à refaire entièrement. |
| **#11 Une drôle d'empreinte** | « casser » un hash, donc passer par un site de reverse-hash | Faux du point de vue pédagogique : ça installe l'idée qu'un hash se déchiffre. Il faut inverser l'exercice (voir C5). |
| **#15 Grille tournante** | grille de Fleissner, rotations successives | 30 à 45 min de manipulation pour un élève, avec un fort taux d'abandon. Réservé à un atelier, pas à une série. |
| **#27 QR code cassé** | reconstruire les motifs de repérage d'un QR code | Exercice d'expert. |
| **#25 Résolution de noms** | connaître le port 53 | Ce n'est pas une énigme, c'est une question de cours déguisée. |

### 2.3 Ce qui manque

- **Pas de progressivité.** Le #1 est trivial, le #3 demande de deviner l'existence de `robots.txt`. Aucun
  palier annoncé, donc l'élève ne sait pas si bloquer est normal.
- **Pas d'apprentissage après coup.** Une fois le flag trouvé, rien n'explique *pourquoi* ça marchait. Le
  moment où l'élève vient de réussir est justement celui où il est prêt à lire l'explication.
- **Pas d'ancrage programme.** Rien ne rattache une épreuve à une séquence de technologie.
- **Vocabulaire non traduit** (« flag », « Her-cURL ») sans jamais l'expliquer.
- **Positionnement.** « Apprendre le hacking aux enfants » est un slogan à ne pas reprendre tel quel dans
  un cadre scolaire. Ici : **Cyber-défis**, avec une charte en défi n°0 (on ne teste que sur ce site).

---

## 3. La série proposée

Six catégories, trois paliers, une trentaine de défis. Paliers annoncés sur chaque carte :

- 🟢 **Découverte** — 5 à 10 min, tout est dans la page, l'indice suffit.
- 🟠 **Confirmé** — 10 à 20 min, il faut combiner deux notions.
- 🔴 **Expert** — au-delà, pour ceux qui finissent avant les autres.

Chaque défi est décrit par : *ce que fait l'élève* → **la notion qu'il en retire**.

### Catégorie 1 — 🛜 Réseaux informatiques

Ancrage : *5e — Utiliser le réseau informatique du collège* · *4e — Les réseaux informatiques*.

| # | Défi | Ce que fait l'élève | Notion | Palier |
|---|---|---|---|---|
| R1 | **Qui est mon voisin ?** | Schéma du réseau du collège (postes, switch, routeur, box, serveur). Quatre machines avec IP + masque ; trouver la seule qui est sur le **même réseau local** que le poste A. Flag = son nom. | Adresse IP, masque, réseau local ≠ Internet | 🟢 |
| R2 | **L'adresse gravée** | Une étiquette de carte réseau. Avec un extrait de la table des constructeurs fourni dans la page, retrouver **qui a fabriqué** la machine inconnue branchée sur le switch. Flag = le constructeur. | Adresse MAC, unicité, matériel ≠ logiciel | 🟢 |
| R3 | **Le mot de passe en clair** | Une **visionneuse de paquets maison** rejoue deux connexions : une en HTTP, une en HTTPS. Retrouver le mot de passe lisible dans la première. | Pourquoi HTTPS existe. *La* leçon de l'année. | 🟠 |
| R4 | **Le bon tuyau** | Cinq scénarios (consulter un site, envoyer un mail, traduire un nom en adresse…). Associer chacun à son port. Flag = les numéros dans l'ordre. | Ports et services, une machine rend plusieurs services | 🟠 |
| R5 | **Le voyage du paquet** | Un traceroute rejoué saut par saut vers un serveur. Dire **dans quel pays** se trouve la machine qui héberge le site. | Routage, Internet = réseau de réseaux, le « cloud » est physique | 🟠 |
| R6 | **Le poste muet** | Trois postes, un seul ne se connecte pas. Son IP est en `169.254.x.x`. Diagnostiquer. Flag = le service en panne. | DHCP, démarche de dépannage | 🔴 |

> R3 est le défi central de la catégorie. Il remplace le #23 de challenges-kids sans Wireshark : la capture
> est un fichier JSON servi par le site, la visionneuse est un module JS local (liste de paquets à gauche,
> contenu à droite). C'est du développement, mais c'est ce qui fait basculer la compréhension.

### Catégorie 2 — 🌎 Le Web vu de l'intérieur

| # | Défi | Ce que fait l'élève | Notion | Palier |
|---|---|---|---|---|
| W1 | **123456** | Une liste de mots de passe réellement très utilisés. Trouver celui qui ouvre le coffre de la page. | Force d'un mot de passe, pourquoi une liste suffit | 🟢 |
| W2 | **Sous le capot** | `Ctrl+U`. Le flag est dans un commentaire HTML. | Une page = du code envoyé à ton ordinateur | 🟢 |
| W3 | **Le fichier oublié** | Suivre `robots.txt` jusqu'à un dossier laissé ouvert. | Ce qui n'est pas lié reste accessible ; « caché » ≠ « protégé » | 🟠 |
| W4 | **Le bouton grisé** | Réactiver un champ `disabled` avec l'inspecteur pour envoyer le formulaire. | Le navigateur t'appartient ; ne jamais faire confiance au client | 🟠 |
| W5 | **Le cookie bavard** | Un cookie contient `role=eleve`. Le passer à `prof` pour voir la page réservée. | Cookies, sessions, où se vérifie vraiment une autorisation | 🟠 |
| W6 | **Le code qui parle trop** | La fonction JS qui valide le mot de passe est lisible dans le source. | Le code côté client n'est jamais un secret | 🔴 |

### Catégorie 3 — 🔑 Cryptographie

| # | Défi | Ce que fait l'élève | Notion | Palier |
|---|---|---|---|---|
| C1 | **Avé César** | Une **roue de César interactive** intégrée : faire tourner jusqu'à ce que le message apparaisse. | Chiffrement par décalage, la clé | 🟢 |
| C2 | **Zéros et uns** | Une phrase en binaire, table ASCII fournie. | Tout est nombre dans une machine ; encoder ≠ chiffrer | 🟢 |
| C3 | **Le 64e caractère** | Reconnaître du base64 (`==` en fin) et le décoder avec l'outil de la page. | Encodage de transport, ce n'est **pas** une protection | 🟢 |
| C4 | **Le message trop long** | Substitution quelconque + **compteur de fréquences** intégré : la lettre la plus fréquente est probablement un E. | Analyse de fréquences, pourquoi les codes anciens sont tombés | 🔴 |
| C5 | **L'empreinte** | Cinq mots de passe candidats, une empreinte SHA-256. Hacher soi-même chaque candidat avec l'outil et comparer. | **Un hash ne se déchiffre pas, il se compare.** Corrige l'erreur du #11. | 🟠 |
| C6 | **Vigenère** | Même principe que César, mais la clé est un mot. | Clé répétée, robustesse | 🔴 |

### Catégorie 4 — 🎨 Ce que cachent les fichiers

| # | Défi | Ce que fait l'élève | Notion | Palier |
|---|---|---|---|---|
| S1 | **Blanc sur blanc** | `Ctrl+A` sur la page. | Ce qui est invisible à l'écran existe dans le fichier | 🟢 |
| S2 | **La loupe** | Visionneuse d'image avec zoom : le flag fait trois pixels de haut. | Résolution, l'œil n'est pas l'ordinateur | 🟢 |
| S3 | **Ta photo parle** | **Lecteur EXIF maison** : ouvrir une photo, y lire le modèle de téléphone, la date et les **coordonnées GPS**. | Métadonnées, traces numériques. Le défi le plus marquant de la série. | 🟠 |
| S4 | **Le faux .jpg** | Un fichier `photo.jpg` qui n'en est pas un ; **lecteur d'en-tête** intégré (les premiers octets). | L'extension est une étiquette, pas une nature. Base du réflexe anti-pièce-jointe. | 🟠 |
| S5 | **Dans les pixels** | Message caché dans les bits de poids faible, outil d'extraction fourni. | Stéganographie réelle | 🔴 |

### Catégorie 5 — 🎣 Pièges et arnaques

Ancrage : EMI, et la séquence *Utilisation raisonnée de l'IAG*.

| # | Défi | Ce que fait l'élève | Notion | Palier |
|---|---|---|---|---|
| P1 | **Le mail qui sent le poisson** | Quatre mails ; désigner le seul authentique. | Expéditeur affiché ≠ expéditeur réel, urgence artificielle | 🟢 |
| P2 | **L'adresse trompeuse** | Six URL très proches (`paypa1`, `paypal.compte-securise.xyz`…). Trouver la vraie. | **Lire une URL de droite à gauche** : le domaine est juste avant le premier `/` | 🟢 |
| P3 | **Le faux profil** | Un profil fabriqué ; relever les trois indices qui trahissent un compte automatisé. | Vérification de source | 🟠 |
| P4 | **Vrai ou généré ?** | Six images ou textes, dire lesquels sortent d'une IA générative. | Limites et marqueurs des contenus générés | 🟠 |
| P5 | **Le mot de passe de ton voisin** | À partir d'un profil public fictif (chien, club, année de naissance), retrouver son mot de passe parmi des tentatives. | Pourquoi un mot de passe personnel est devinable | 🟠 |

### Catégorie 6 — ⚙️ Logique et programmation *(optionnelle, plus tard)*

Lire un petit algorithme affiché et trouver l'entrée qui ouvre la porte ; corriger une condition ;
suivre une boucle à la main. Trois défis suffisent.

---

## 4. Ce que ça change dans le site

### 4.1 Deux nouveaux blocs

Les blocs existants ne suffisent pas : `=verif>` place les réponses dans `data-answers`, donc **dans le
HTML livré**. Acceptable pour un exercice, inacceptable pour un flag.

- **`=flag>`** — champ + bouton. La proposition part au serveur, qui compare
  `sha256(normalisation(proposition) + sel)` à la valeur stockée. Le flag n'apparaît **jamais** dans la page.
  Normalisation : minuscules, espaces et accents retirés — un élève ne doit pas échouer sur une majuscule.
- **`=indice>`** — replié par défaut. L'ouvrir est enregistré et coûte des points.

Plus une section `[challenge]` dans `defaut.palette` (états non tenté / en cours / résolu, couleurs des
paliers) — aucune couleur dans les renderers, comme partout ailleurs.

### 4.2 Serveur

Une section `# ── Cyber-défis ──` dans `server.py`, trois routes :

- `POST /api/challenge/verifier` → `{resolu: true/false}`, avec limitation du nombre de tentatives par
  minute (sinon le premier réflexe sera d'écrire une boucle).
- `POST /api/challenge/indice` → renvoie l'indice et l'enregistre.
- `GET /api/challenge/progression` → l'état de l'élève.

Une table `challenge_resolutions(eleve_id, challenge_id, tentatives, indices_vus, resolu_le)` dans
`init_db()`, comme les autres.

### 4.3 La boîte à outils

Une page `/outils/` et des modules dans `static/libs/`, réutilisables à l'intérieur des défis :
roue de César · base64 · table ASCII/hexadécimal · compteur de fréquences · SHA-256 · lecteur EXIF ·
lecteur d'en-tête de fichier · visionneuse de paquets.

C'est **le vrai travail de développement** de ce chantier, et il vaut au-delà des défis : ces outils
servent en cours. Tout est local, aucun CDN — comme le reste du projet.

### 4.4 Contenu

`contenu/challenges/c1_reseaux/challenge_01_qui_est_mon_voisin.md`, etc. Les défis sont des pages du
pipeline Markdown existant, avec les blocs ci-dessus. Aucune page spéciale à maintenir à la main.

---

## 5. Trois décisions à prendre avant d'écrire le contenu

1. **Le flag circule-t-il entre élèves ?** Oui, en vingt minutes. Deux réponses possibles : (a) l'assumer,
   le score n'est qu'un décor ; (b) **flag personnalisé** — le défi est généré à partir de l'identifiant
   de l'élève, donc le flag du voisin ne marche pas. Faisable sur la moitié des défis (César, base64,
   EXIF, cookie), impossible sur les autres. Ce choix change la conception des défis.
2. **Classement visible ?** Un classement de classe motive beaucoup et décourage beaucoup. Proposition :
   affichage par groupe, activable par toi, désactivé par défaut.
3. **Après le flag ?** Fortement recommandé : un encadré **« Ce que tu viens de faire »** qui n'apparaît
   qu'une fois le défi résolu. C'est ce qui manque le plus au site de référence, et c'est ce qui transforme
   le jeu en cours.

---

## 6. Ordre de livraison

| Vague | Contenu | Pourquoi d'abord |
|---|---|---|
| **1** | Blocs `=flag>` / `=indice>`, routes, table SQLite, page catégorie + 6 défis (R1, R2, W1, W2, C1, S1) | Toute la mécanique validée sur des défis sans outil. Testable en classe tout de suite. |
| **2** | Boîte à outils (César, base64, ASCII, SHA-256, fréquences) + C2→C6, W3→W6, P1, P2 | Le gros du volume, une fois la mécanique éprouvée. |
| **3** | Lecteur EXIF, lecteur d'en-tête, visionneuse de paquets + R3, R5, S3, S4, P3→P5 | Les modules les plus coûteux, sur les défis les plus marquants. |
| **4** | Catégorie 6, classement, défis personnalisés | Selon ce que donnent les trois premières vagues en classe. |
