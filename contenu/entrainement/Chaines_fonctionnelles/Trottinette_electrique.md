---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# TROTTINETTE ÉLECTRIQUE

=txt> Une trottinette électrique est un petit véhicule individuel pensé pour les trajets courts en ville : elle doit être <b>légère</b>, <b>pliable</b> et capable de rouler une vingtaine de kilomètres sur une seule charge. Pour répondre à ce besoin, le constructeur a logé toute la partie « énergie » (batterie, moteur) dans le plateau et la roue arrière, et toute la partie « pilotage » (poignées, écran) sur le guidon, directement sous la main du conducteur.

=txt> Quand le pilote tourne la <b>poignée de commande</b>, il indique la vitesse qu'il souhaite atteindre. Cette information part vers <b>l'ordinateur de bord</b>, qui la traite pour calculer la puissance à envoyer au moteur, puis qui affiche la vitesse et le niveau de charge sur <b>l'écran d'affichage</b>, bien visible du pilote. La consigne calculée est ensuite transmise au <b>régulateur du moteur</b>, qui ajuste précisément le courant envoyé au <b>moteur</b> ; celui-ci fait tourner la <b>roue</b>, qui propulse la trottinette vers l'avant.

=txt> Repère bien que la <b>batterie</b> de la trottinette est déjà chargée avant de rouler : elle ne fait donc que <i>stocker</i> l'énergie électrique, sans qu'il y ait besoin d'une case « alimenter » séparée — c'est pour cela que la première case de la chaîne d'énergie porte une croix : aucun composant ne remplit cette fonction ici. Remarque aussi que l'écran d'affichage remplit la fonction <i>communiquer</i> dans les deux sens : il renseigne le pilote sur l'état de la trottinette, et c'est cette même consigne de vitesse qui repart vers le régulateur du moteur (la flèche « Ordres » du schéma).

=img> l schema_trottinette.png "Constitution d'une trottinette électrique et de son tableau de bord"

=options> fonctions | TRANSMETTRE | ACQUÉRIR | STOCKER | COMMUNIQUER | CONVERTIR | ALIMENTER | DISTRIBUER | TRAITER
=options> composants | Écran d'affichage | Moteur | Poignées de commande | Batterie | Roue | Ordinateur de bord | Ordres du pilote | Régulateur du moteur
=options> energie | Thermique | Cinétique | Lumineuse | Électrique | Potentielle

::schema chaine_fonctionnelle.png xl
  =choix> q_fct1_c1 x=33.2% y=14.7% e=80% options=fonctions
  =choix> q_fct2_c1 x=50.5% y=14.7% e=80% options=fonctions
  =choix> q_fct3_c1 x=68.2% y=14.9% e=80% options=fonctions
  =corrige> q_fct4_c1 x=17.7% y=59.2% e=80% "X"
  =choix> q_fct5_c1 x=33.8% y=59.4% e=80% options=fonctions
  =choix> q_fct6_c1 x=50.4% y=59.2% e=80% options=fonctions
  =choix> q_fct7_c1 x=66.7% y=59% e=80% options=fonctions
  =choix> q_fct8_c1 x=82.6% y=59% e=80% options=fonctions
  =choix> q_fct9_c1 x=33.2% y=27.3% e=80% options=composants
  =choix> q_fct10_c1 x=50.5% y=27.4% e=80% options=composants
  =choix> q_fct11_c1 x=68.2% y=27.6% e=80% options=composants
  =choix> q_fct13_c1 x=33.8% y=72.4% e=80% options=composants
  =choix> q_fct14_c1 x=50.3% y=72.7% e=80% options=composants
  =choix> q_fct15_c1 x=66.6% y=72.7% e=80% options=composants
  =choix> q_fct16_c1 x=82.6% y=72.7% e=80% options=composants
  =choix> q_fct17_c1 x=10.1% y=14.6% e=110% options=composants
  =choix> q_fct18_c1 x=13.6% y=93.7% e=80% options=energie
  =choix> q_fct19_c1 x=86.4% y=93.5% e=80% options=energie
::/schema

=verif> mode=1 | q_fct1_c1=ACQUÉRIR | q_fct2_c1=TRAITER | q_fct3_c1=COMMUNIQUER | q_fct5_c1=STOCKER | q_fct6_c1=DISTRIBUER | q_fct7_c1=CONVERTIR | q_fct8_c1=TRANSMETTRE | q_fct9_c1=Poignées de commande | q_fct10_c1=Ordinateur de bord | q_fct11_c1=Écran d'affichage | q_fct13_c1=Batterie | q_fct14_c1=Régulateur du moteur | q_fct15_c1=Moteur | q_fct16_c1=Roue | q_fct17_c1=Ordres du pilote | q_fct18_c1=Électrique | q_fct19_c1=Cinétique
