# Cyber-défis — refonte complète (proposition)

> Document de **proposition** : aucun code touché. Il remplace mentalement le set des 12 défis
> déjà en place, jugé trop guidé et pas assez « on manipule vraiment ». Objectif : un public de
> **11-14 ans** qui s'initie à la cybersécurité en **faisant** un geste réel à chaque défi, avec
> le droit de **chercher sur le web** quand c'est cadré.

---

## 1. Ce qui n'allait pas dans le set actuel

En relisant les 12 défis livrés, le même défaut revient :

- **Tout est dans la page.** La liste des mots de passe, la table des constructeurs, la table des
  ports, les codes de ville : l'élève lit un tableau et recopie une case. Ce n'est pas chercher,
  c'est retrouver. On lui mâche le travail.
- **Peu de geste réel.** Sur 12 défis, seuls 4 font vraiment *faire* quelque chose (Ctrl+U,
  robots.txt, inspecteur, cookie). Les 8 autres sont des exercices de lecture déguisés.
- **Rien qu'on télécharge, renomme, ouvre, décompresse.** Or « bricoler un fichier pour obtenir
  un résultat » est exactement ce qui accroche à cet âge, et ce qui manque totalement.
- **Aucune enquête.** L'OSINT bien fait (sur une cible **inventée**) est le format le plus
  parlant pour parler de traces numériques — il n'existe pas encore.

## 2. Les quatre principes de la refonte

1. **Un geste réel par défi.** L'élève télécharge, renomme, décompresse, ouvre avec un autre
   outil, inspecte, décale, hache. Le flag est le *résultat* de ce geste, pas une case à recopier.
2. **La recherche web est autorisée et cadrée.** Quand un défi envoie sur le web, il **fixe la
   source et l'année** pour qu'il y ait **une seule bonne réponse vérifiable** — par exemple « le
   mot de passe classé n°2 en France dans le palmarès NordPass 2023 », et non « un mot de passe
   courant ». On apprend à chercher *et* à citer une source datée.
3. **Le site sert de vrais fichiers.** Une fausse image, une archive dans une archive, une photo
   avec ses métadonnées : générés une fois, servis tels quels, manipulés pour de bon.
4. **Cadre éthique explicite** (voir §8). Toute « enquête » se fait sur un **personnage fictif**
   fourni par le site. Jamais sur une personne réelle, jamais sur un compte qui n'est pas à soi.

Conservés du set actuel : flags **généraux** (ton choix), l'encadré **« Ce que tu viens de
faire »** après réussite, les indices à la demande, les paliers 🟢🟠🔴, l'habillage « années 2000 ».

---

## 3. Le set proposé — 24 défis, 5 catégories, + une charte

Notation des cellules : **Le geste** = ce que l'élève fait concrètement · **Recherche / Outil** =
ce qu'on lui donne ou l'envoie chercher · **Notion** = ce qu'il retient.

### Défi 0 — 🤝 La charte (lu, non noté)
On lit et on valide trois règles avant d'entrer (voir §8). C'est le « contrat » du module.

---

### Catégorie 1 — 🛜 Réseaux informatiques
*Ancrage : 5e réseau du collège · 4e les réseaux. On garde le meilleur, on rend les autres actifs.*

| # | Défi | Le geste | Recherche / Outil | Notion | Palier |
|---|------|----------|-------------------|--------|--------|
| R1 | **Le bon sous-réseau** | Manipuler un **calculateur de sous-réseau** intégré : tester des adresses jusqu'à isoler la seule machine joignable directement | Outil calculateur (dans la page) | IP, masque, réseau local ≠ Internet | 🟢 |
| R2 | **Qui a fabriqué ça ?** | Prendre une adresse MAC et **chercher sur le web** le constructeur à qui appartiennent ses 3 premiers octets (bases OUI publiques) | Recherche web (« MAC address lookup ») | L'adresse MAC identifie le matériel ; l'attribution est publique | 🟢 |
| R3 | **Le mot de passe en clair** | Ouvrir la **visionneuse de paquets** intégrée, comparer HTTP et HTTPS, lire le mot de passe dans le POST non chiffré | Visionneuse maison (déjà écrite, à garder) | Pourquoi HTTPS existe. *Le* défi phare. | 🟠 |
| R4 | **Le bon port** | Pour un service donné, **chercher son numéro de port** dans le registre officiel et le vérifier | Recherche web (registre IANA / doc citée) | Adresse = machine, port = service | 🟠 |
| R5 | **Le voyage du paquet** | Lire un traceroute, **chercher le code de ville/aéroport** des routeurs pour situer le serveur | Recherche web (codes IATA) | Routage, « le cloud » est physique | 🟠 |

*Abandonné : R6 (poste muet) — bon raisonnement mais 100 % lecture, redondant avec R1. Reversé en indice de R1.*

### Catégorie 2 — 🌎 Sous le capot du Web
*On garde les quatre « vrais gestes » du set actuel, on durcit un cran.*

| # | Défi | Le geste | Recherche / Outil | Notion | Palier |
|---|------|----------|-------------------|--------|--------|
| W1 | **Le code source** | `Ctrl+U`, puis `Ctrl+F` pour trouver le flag caché dans un commentaire | Navigateur | Une page = du code envoyé chez toi | 🟢 |
| W2 | **Le fichier oublié** | Lire `robots.txt`, suivre la ligne `Disallow` jusqu'à la page non liée | Navigateur (vrais fichiers servis) | « Caché » ≠ « protégé » | 🟠 |
| W3 | **Le bouton grisé** | Ouvrir l'**inspecteur**, retirer `disabled`, envoyer le profil interdit | Inspecteur du navigateur | Le client t'appartient ; la vérif compte côté serveur | 🟠 |
| W4 | **Le cookie bavard** | Modifier le cookie `role=eleve` → `prof` et redemander l'accès | Onglet Application/Stockage | Cookies, sessions, où se vérifie une autorisation | 🟠 |
| W5 | **Le code qui parle trop** | Lire une fonction JS livrée avec la page, l'inverser, avec banc d'essai | Navigateur | Le JavaScript d'une page n'est jamais un secret | 🔴 |

### Catégorie 3 — 🗂️ Manipulation de fichiers *(nouvelle — le « bricolage »)*
*C'est le cœur de ta demande : renommer, décompresser, ouvrir autrement. Vrais fichiers servis.*

| # | Défi | Le geste | Recherche / Outil | Notion | Palier |
|---|------|----------|-------------------|--------|--------|
| F1 | **La fausse image** | Télécharger `photo.jpg`, comprendre qu'elle ne s'ouvre pas, **renommer son extension** en `.txt` (ou `.zip`), l'ouvrir, lire le flag | Fichier réel + note « voir/changer l'extension » | L'extension est une étiquette, pas la nature du fichier | 🟢 |
| F2 | **Le blanc sur blanc** | Télécharger un document, tout **sélectionner** (`Ctrl+A`) pour révéler le texte blanc sur fond blanc | Fichier réel | Invisible à l'écran ≠ absent du fichier | 🟢 |
| F3 | **La photo qui parle** | Télécharger une photo, lire ses **métadonnées EXIF** : appareil, date, et lieu | Lecteur EXIF intégré **ou** recherche web (« exif viewer ») | Une photo transporte des informations cachées | 🟠 |
| F4 | **Les poupées russes** | **Décompresser** une archive… qui contient une archive… plusieurs fois, jusqu'au flag | Fichier `.zip` réel | Un fichier peut en contenir d'autres ; la patience méthodique | 🟠 |
| F5 | **Le message dans l'image** | Ouvrir une image **avec un autre programme** (bloc-notes / visionneur de texte) pour lire le message ajouté à la fin | Fichier image réel + note méthode | Un même fichier se lit de plusieurs façons | 🔴 |

### Catégorie 4 — 🔑 Codes secrets (cryptographie)
*Déchiffrer, mais aussi encoder soi-même. Outils intégrés, recherche web tolérée.*

| # | Défi | Le geste | Recherche / Outil | Notion | Palier |
|---|------|----------|-------------------|--------|--------|
| C1 | **Avé César** | Faire tourner une **roue de César** interactive pour déchiffrer, puis **chiffrer** une réponse demandée | Roue intégrée | Chiffrement par décalage, la clé | 🟢 |
| C2 | **Zéros et uns** | Convertir une phrase en binaire vers du texte | Table ASCII intégrée / recherche web | Tout est nombre ; encoder ≠ chiffrer | 🟢 |
| C3 | **Le 64ᵉ caractère** | Reconnaître du base64 (`==`), le décoder | Décodeur intégré **ou** recherche web | Encodage de transport, pas une protection | 🟢 |
| C4 | **L'empreinte** | **Hacher soi-même** cinq mots de passe candidats et comparer à l'empreinte donnée | Hacheur SHA-256 intégré (Web Crypto, sans lib) | Un hash ne se déchiffre pas, il se **compare** | 🟠 |
| C5 | **Le message trop long** | Utiliser un **compteur de fréquences** pour casser une substitution (la lettre la plus fréquente ≈ E) | Compteur intégré | Analyse de fréquences, pourquoi les vieux codes tombent | 🔴 |

### Catégorie 5 — 🕵️ Identité & enquête numérique *(OSINT éthique, cible fictive)*
*Le fil rouge : « regarde ce que **toi** tu laisses filtrer ». Toujours sur un personnage inventé.*

| # | Défi | Le geste | Recherche / Outil | Notion | Palier |
|---|------|----------|-------------------|--------|--------|
| I1 | **Les pires mots de passe** | **Chercher sur le web** le palmarès des mots de passe les plus courants d'une **année précise**, en extraire celui d'un rang donné | Recherche web (source + année fixées) | Un mot de passe courant tombe en une seconde | 🟢 |
| I2 | **Le mot de passe devinable** | À partir du **profil public fictif** d'un personnage (chien, club, année), retrouver son mot de passe parmi des candidats | Pages fictives servies par le site | Ne jamais bâtir un mot de passe sur des infos publiques | 🟠 |
| I3 | **Le pseudo qui suit partout** | Le même pseudo apparaît sur **plusieurs pages fictives** ; recouper pour trouver l'info que le personnage croyait privée | Pages fictives servies par le site | Réutiliser un pseudo relie tes traces entre elles | 🟠 |
| I4 | **Vrai ou faux profil** | Comparer des profils fictifs et repérer les **trois indices** qui trahissent un faux compte | Profils fictifs servis par le site | Vérifier une source, repérer un compte automatisé | 🟠 |

---

## 4. Les outils fournis (tous auto-hébergés, aucun CDN)

Rangés dans `static/libs/` ou dans le module, réutilisables entre défis — et utiles en cours au-delà des défis.

| Outil | Sert à | Techno |
|-------|--------|--------|
| Calculateur de sous-réseau | R1 | JS pur |
| Visionneuse de paquets | R3 | déjà écrite, à conserver |
| Roue de César | C1 | JS pur |
| Convertisseur binaire / table ASCII | C2 | JS pur |
| Décodeur base64 | C3 | `atob` natif |
| Hacheur SHA-256 | C4 | `crypto.subtle`, aucune lib |
| Compteur de fréquences | C5 | JS pur |
| Lecteur EXIF | F3 | petit parseur maison (marqueurs APP1/COM) |

**Fichiers réels à générer une fois** (script Python, stdlib seule) : fausse image (F1), document
texte-blanc (F2), photo avec EXIF fabriqué (F3), archive gigogne via `zipfile` (F4), image +
données ajoutées (F5), pages du personnage fictif (I2, I3, I4).

## 5. La méthode, défi par défi

Chaque page garde la trame actuelle et gagne un encadré selon le type :

- **Recherche autorisée** (R2, R4, R5, C2, C3, I1) : encadré « 🔎 Tu peux chercher sur le web » qui
  dit **quoi** chercher et **quelle source** fait foi. La réponse est unique parce que la source et
  l'année sont fixées.
- **Manipulation de fichier** (F1→F5) : encadré « 🧰 Méthode » qui explique le geste système une
  fois — afficher les extensions de fichiers, ouvrir-avec, décompresser — sans donner la réponse.
- **Outil intégré** (R1, R3, C1, C4, C5, F3) : l'outil est sur la page, l'élève l'utilise.
- **Après réussite** : l'encadré « Ce que tu viens de faire », plus une ligne « Et dans la vraie
  vie » qui bascule côté défense (comment se protéger de ce qu'on vient de voir).

## 6. Ce qui change côté code (léger)

- `core/cyberdefis.py` reste le fichier unique des défis : on remplace le contenu du dict, la
  mécanique (flags côté serveur, indices, leçons) ne bouge pas.
- Ajouter les **5 catégories** au lieu de 2 → aucune modif de moteur, juste des entrées.
- Nouvelle route statique pour servir les **fichiers réels** des défis F* et I* (ou simple dépôt
  dans le dossier du défi, déjà servi tel quel).
- Les **outils** : un fichier JS par outil, importé par les pages qui en ont besoin.

## 7. Ordre de livraison proposé

| Vague | Contenu | Pourquoi |
|-------|---------|----------|
| **1** | Catégorie 3 (fichiers F1→F5) + outil EXIF + script de génération | Le plus neuf et le plus parlant ; valide le format « manipulation ». |
| **2** | Refonte Réseaux (R1, R2, R4, R5 en recherche web) + Web durci | On corrige le « trop guidé » sur l'existant. |
| **3** | Codes secrets (C1→C5) + les 4 outils crypto | Bloc cohérent, très réutilisable en classe. |
| **4** | Identité & enquête (I1→I4) + personnage fictif | Le plus sensible ; on le fait après avoir posé la charte. |

## 8. Cadre éthique (à afficher, défi 0)

Trois règles, formulées pour des collégiens :

1. **On s'entraîne ici, sur des cibles pour ça.** Les mêmes gestes sur le site, le compte ou le
   téléphone de quelqu'un d'autre sont interdits par la loi — même « pour rigoler ».
2. **L'enquête ne vise que des personnages inventés.** On apprend à voir ce qu'une personne
   laisse filtrer d'elle-même pour **mieux se protéger** — jamais pour surveiller un camarade.
3. **Le but, c'est de savoir se défendre.** Chaque défi finit par « et comment on s'en protège ».

C'est cette bascule permanente vers la **défense** qui distingue un cours de cybersécurité d'un
mode d'emploi. Elle est intégrée à chaque leçon de fin.
