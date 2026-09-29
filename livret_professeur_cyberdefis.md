# Cyber-défis — livret du professeur

> Corrigé de référence, **généré automatiquement** depuis `core/cyberdefis.py` (via `generer_livret_cyberdefis.py`). Les flags, indices et leçons y sont la source unique — ne pas éditer ce fichier à la main.

> Un flag s'écrit `FLAG{…}`. La validation ignore majuscules, accents, tirets et espaces : seul le contenu entre accolades compte.

---

## Sous le capot du Web

*Une page web est un document reçu par ton ordinateur. Ce que cela implique, un défi après l'autre.*

### W1 — La face cachée des pages web

**Résumé.** Le flag est dans la page, mais l'affichage ne le montre pas.

**Réponse.** `FLAG{CODE_SOURCE}`

**Indices (donnés dans l'ordre, à la demande).**
1. On peut cacher plein de choses dans le code source d'une page…

**Ce que l'élève retient.** Une page web est un document envoyé à ton ordinateur, que le navigateur met ensuite en forme. Son code source contient parfois davantage que ce qui s'affiche : commentaires, éléments masqués, textes préparés à l'avance. Une information confidentielle n'a donc pas sa place dans une page — elle resterait lisible à qui en ouvre le code.

### W2 — Fouiller les dossiers d'un site web

**Résumé.** Un fichier mal rangé dans le même dossier que cette page, à retrouver par son adresse.

**Réponse.** `FLAG{6ix7even}`

**Indices (donnés dans l'ordre, à la demande).**
1. En regardant l'URL d'une page web, on voit dans quel dossier du site on se trouve. En modifiant cette URL, on peut tomber sur des fichiers cachés…

**Ce que l'élève retient.** Une page à laquelle aucun lien ne mène reste accessible à qui connaît son adresse, et un fichier rangé à côté se devine parfois. « Discret » n'est pas « protégé » : seule une vérification sur le serveur protège réellement un fichier. En déposer un sensible dans un dossier public est une faute courante.

### W3 — La page cachée

**Résumé.** Deux versions de la page existent : une en français, une en anglais.

**Réponse.** `FLAG{IN_ENGLISH_PLEASE}`

**Indices.** Aucun.

**Ce que l'élève retient.** L'adresse d'une page peut contenir des paramètres — ici la langue, après le point d'interrogation. Les modifier demande au serveur une autre version de la page. Savoir lire et changer une URL fait partie des gestes de base pour explorer un site et comprendre ce qu'il attend.

### W4 — Le bouton grisé

**Résumé.** Un profil « administrateur » proposé en grisé. Le débloquer donne l'accès.

**Réponse.** `FLAG{ADMIN}`

**Indices (donnés dans l'ordre, à la demande).**
1. Avec Clic droit → Inspecter, on peut modifier le code source d'une page. Comment cela pourrait-il être utile ?

**Ce que l'élève retient.** Une fois la page reçue, son code se trouve sur ton ordinateur et tu peux le modifier. Les attributs comme disabled ne font qu'ajuster l'affichage ; les retirer ne franchit aucune barrière réelle. La seule vérification qui compte est celle du serveur — ici, c'est lui qui a accepté l'accès, une faute de conception que le défi met volontairement en scène.

### W5 — Voulez-vous des cookies ?

**Résumé.** En arrivant, ton navigateur a enregistré un cookie. Le flag est dedans.

**Réponse.** `FLAG{J'<3_LES_DEFIS}`

**Indices (donnés dans l'ordre, à la demande).**
1. Avec Clic droit → Inspecter, on peut vraiment trouver plein de choses utiles !

**Ce que l'élève retient.** Un cookie est un court texte que le site fait enregistrer par ton navigateur pour te reconnaître d'une visite à l'autre : un identifiant, un nombre de visites, une langue préférée… Il est stocké sur ton ordinateur, donc tout ce qu'un site y inscrit en clair, tu peux le lire. Les sites sérieux n'y placent qu'un identifiant illisible et gardent le reste sur le serveur.

### W6 — Reprenez donc des cookies !

**Résumé.** Un mini-jeu : atteindre 999 999 sans recharger la page un million de fois.

**Réponse.** `FLAG{VICTOIRE}`

**Indices (donnés dans l'ordre, à la demande).**
1. Je vais quand même pas recharger la page 999 999 fois, si ?

**Ce que l'élève retient.** Le score est gardé dans un cookie, sur ta machine — donc modifiable. Un jeu, un site ou une note qui accordent leur confiance à une valeur stockée chez toi peuvent être trompés en la changeant. Ce qui doit vraiment compter se calcule et se vérifie sur le serveur, jamais dans le navigateur du visiteur.

---

## Réseaux informatiques

*Les adresses qui identifient les machines, et ce qu'on peut lire d'un réseau local.*

### R1 — Le bon réseau

**Résumé.** Cinq machines du collège. Une seule est sur le même réseau local que ton poste.

**Réponse.** `FLAG{POSTE-B12}`

**Indices (donnés dans l'ordre, à la demande).**
1. Avec le masque 255.255.255.0, les trois premiers nombres d'une adresse désignent le réseau ; le quatrième désigne la machine.

**Ce que l'élève retient.** Une adresse IP ne prend son sens qu'avec son masque : c'est lui qui sépare la partie « réseau » de la partie « machine ». Deux machines du même réseau local échangent directement, par le commutateur ; pour toute autre destination, les données passent par le routeur. C'est la distinction entre ce qui est « chez soi » et ce qui sort vers Internet.

### R2 — Qui a branché son appareil au CDI ?

**Résumé.** Quatre appareils branchés au CDI, un seul absent de l'inventaire.

**Réponse.** `FLAG{SAMSUNG}`

**Indices (donnés dans l'ordre, à la demande).**
1. L'adresse MAC d'une machine, c'est un peu comme son nom. En lisant une adresse MAC, on peut y trouver le nom du constructeur…

**Ce que l'élève retient.** L'adresse MAC est inscrite dans la carte réseau à la fabrication ; ses trois premiers octets sont attribués à un fabricant, et ces attributions sont publiques. On peut donc retrouver la marque d'un appareil sans y avoir accès. C'est ainsi qu'un administrateur repère ce qui est réellement connecté à son réseau — et remarque un appareil qui n'a rien à y faire.

---

## Codes secrets

*Coder, décoder, chiffrer : des méthodes anciennes aux notions qui protègent aujourd'hui les communications.*

### C1 — Le chiffrement de César

**Résumé.** Un message chiffré par décalage des lettres, comme au temps de César.

**Réponse.** `FLAG{DECALAGE}`

**Indices.** Aucun.

**Ce que l'élève retient.** Le chiffre de César remplace chaque lettre par celle située un nombre fixe de positions plus loin dans l'alphabet ; ce nombre est la clé. Vingt-cinq décalages seulement sont possibles, et il suffit de les essayer pour retrouver le message. Une méthode aussi simple ne protège rien de sérieux, mais elle introduit l'idée de clé, au cœur de tout chiffrement.

### C2 — Le binaire

**Résumé.** Un espace de connexion qui ne comprend que le binaire.

**Réponse.** `FLAG{10110010}`

**Indices (donnés dans l'ordre, à la demande).**
1. Cet espace de connexion ne comprend que le binaire.

**Ce que l'élève retient.** Dans une machine, tout est représenté par des nombres, y compris le texte : chaque caractère correspond à un octet — huit chiffres binaires — selon une table commune. Traduire du binaire en lettres n'est qu'un changement d'écriture, pas un déchiffrement. Encoder et chiffrer sont deux opérations différentes : la première rend lisible par une machine, la seconde protège.

### C3 — Le base64

**Résumé.** Un message encodé en base64, à retraduire en clair.

**Réponse.** `FLAG{TRADUIT}`

**Indices (donnés dans l'ordre, à la demande).**
1. Beaucoup de sites savent décoder le base64. À toi d'en trouver un.

**Ce que l'élève retient.** Le base64 sert à transporter des données à travers des systèmes qui n'acceptent que du texte ordinaire : une image jointe à un courriel, par exemple, y est convertie. Ce n'est en aucun cas une protection — le décodage est immédiat et sans clé. Confondre du base64 avec un contenu chiffré est une erreur fréquente.

---

## Manipulation de fichiers

*Renommer, ouvrir autrement, décompresser : ce qu'un fichier contient ne se limite pas à ce qu'il montre.*

### F1 — Changer l'extension d'un fichier

**Résumé.** Un fichier en .jpg qui ne s'ouvre pas comme une image.

**Réponse.** `FLAG{FICHIERTXT}`

**Indices (donnés dans l'ordre, à la demande).**
1. Dans l'Explorateur de fichiers de Windows, va dans Affichage → Afficher (ou options d'affichage) et coche « Extensions de noms de fichiers ».

**Ce que l'élève retient.** L'extension d'un fichier est une étiquette qui indique aux logiciels comment l'ouvrir ; elle ne détermine pas son contenu. Renommer un fichier ne transforme pas ce qu'il contient. C'est le principe d'un piège courant : une pièce jointe nommée « photo.jpg » peut être tout autre chose, et son extension réelle est ce qu'il faut vérifier avant de l'ouvrir.

### F2 — Le texte invisible

**Résumé.** Ce document paraît vide. Il contient pourtant un texte.

**Réponse.** `FLAG{blanc-sur-blanc}`

**Indices (donnés dans l'ordre, à la demande).**
1. Le raccourci Ctrl+A sélectionne tout le contenu d'un document.
2. Une fois le texte sélectionné, la surbrillance le fait apparaître : il était écrit en blanc sur fond blanc.

**Ce que l'élève retient.** Ce qui est invisible à l'écran n'est pas absent du fichier. Un texte écrit dans la même couleur que le fond, ou placé hors de la zone visible, reste présent dans le document et voyage avec lui. Masquer une information par l'apparence ne l'efface pas.

### F3 — Les informations cachées d'une image

**Résumé.** Une image contient, en plus de l'image, des informations sur sa création.

**Réponse.** `FLAG{metadonnees}`

**Indices (donnés dans l'ordre, à la demande).**
1. Télécharge l'image, puis dépose-la dans le lecteur de métadonnées de la page.
2. Le lecteur affiche plusieurs champs : appareil, date, lieu, et une description. Le flag est dans la description.

**Ce que l'élève retient.** Une image enregistre souvent, à côté de l'image elle-même, des informations sur sa création : l'appareil utilisé, la date, parfois le lieu précis. Ces métadonnées voyagent avec le fichier lorsqu'on le partage. Retirer les métadonnées d'une photo avant de la publier évite de révéler, sans y penser, où et quand elle a été prise.

### F4 — Les archives imbriquées

**Résumé.** Une archive contient une archive, qui contient une archive. Il faut aller au bout.

**Réponse.** `FLAG{tout-au-fond}`

**Indices (donnés dans l'ordre, à la demande).**
1. Décompresser une archive .zip se fait par un clic droit, puis « Extraire tout ».
2. Chaque archive extraite en contient une autre. Recommence jusqu'au fichier texte final.

**Ce que l'élève retient.** Une archive regroupe et compresse des fichiers, et rien n'empêche qu'elle en contienne d'autres. Atteindre le contenu demande de répéter la même opération avec méthode. C'est aussi pourquoi un fichier compressé reçu doit être ouvert avec prudence : son apparence ne dit rien de ce qu'il renferme.

### F5 — Le message ajouté

**Résumé.** Cette image s'affiche normalement. Un texte a pourtant été ajouté à la fin du fichier.

**Réponse.** `FLAG{a-la-fin-du-fichier}`

**Indices (donnés dans l'ordre, à la demande).**
1. Un fichier image peut aussi s'ouvrir avec un éditeur de texte : clic droit, « Ouvrir avec », puis le Bloc-notes.
2. Le début du fichier est illisible, c'est l'image. Fais défiler jusqu'en bas : un passage lisible y a été ajouté.

**Ce que l'élève retient.** Un même fichier peut se lire de plusieurs manières : comme une image par une visionneuse, comme du texte par un éditeur. On peut ainsi ajouter des données après la fin de l'image, sans empêcher son affichage. Un fichier présenté comme une simple image ne transporte pas toujours que l'image.
