---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# HYDROLIENNE PORTABLE

=txt> Une hydrolienne portable est un petit appareil que l'on plonge dans le courant d'une rivière pour recharger un téléphone ou une lampe en pleine nature, sans avoir à transporter de batterie déjà chargée ni à attendre un panneau solaire. Tant que l'eau coule, l'appareil produit de l'électricité.

=txt> L'<b>hélice</b>, immergée dans le courant, est entraînée en rotation par la force de l'eau. Cette rotation, plutôt lente, est transmise à un <b>multiplicateur</b> : un petit jeu d'engrenages qui l'accélère fortement avant de l'envoyer vers la <b>génératrice</b>, qui a besoin de tourner vite pour produire de l'électricité. La génératrice convertit alors cette énergie de rotation en énergie électrique, laquelle est stockée dans une <b>batterie</b> interne. L'utilisateur peut ensuite venir y brancher son téléphone sur la <b>prise USB</b> pour le recharger.

=txt> Cette hydrolienne fonctionne <i>toute seule</i>, sans aucun capteur ni écran : il n'y a donc pas de chaîne d'information, et les trois premières cases du schéma (en haut) portent une croix. Observe aussi que la fonction <i>transmettre</i> apparaît deux fois dans la chaîne d'énergie : une première fois pour le multiplicateur, qui transmet un mouvement mécanique plus rapide à la génératrice, et une seconde fois pour la prise USB, qui transmet l'énergie électrique stockée vers l'appareil à charger.

=img> l schema_hydrolienne.png "Hydrolienne portable : de la rotation de l'hélice à la recharge par prise USB"

=options> fonctions | COMMUNIQUER | CONVERTIR | ALIMENTER | TRAITER | TRANSMETTRE | ACQUÉRIR | STOCKER | DISTRIBUER
=options> composants | Multiplicateur | Batterie | Prise USB | Hélice | Génératrice
=options> energie | Potentielle | Cinétique | Lumineuse | Thermique | Électrique

::schema chaine_fonctionnelle.png xl
  =corrige> q_fct1_c1 x=33.2% y=14.7% e=80% "X"
  =corrige> q_fct2_c1 x=50.5% y=14.7% e=80% "X"
  =corrige> q_fct3_c1 x=68.2% y=14.9% e=80% "X"
  =choix> q_fct4_c1 x=17.7% y=59.2% e=80% options=fonctions
  =choix> q_fct5_c1 x=33.8% y=59.4% e=80% options=fonctions
  =choix> q_fct6_c1 x=50.4% y=59.2% e=80% options=fonctions
  =choix> q_fct7_c1 x=66.7% y=59% e=80% options=fonctions
  =choix> q_fct8_c1 x=82.6% y=59% e=80% options=fonctions
  =choix> q_fct12_c1 x=17.8% y=72.1% e=80% options=composants
  =choix> q_fct13_c1 x=33.8% y=72.4% e=80% options=composants
  =choix> q_fct14_c1 x=50.3% y=72.7% e=80% options=composants
  =choix> q_fct15_c1 x=66.6% y=72.7% e=80% options=composants
  =choix> q_fct16_c1 x=82.6% y=72.7% e=80% options=composants
  =choix> q_fct18_c1 x=13.6% y=93.7% e=80% options=energie
  =choix> q_fct19_c1 x=86.4% y=93.5% e=80% options=energie
::/schema

=verif> mode=1 | q_fct4_c1=ALIMENTER | q_fct5_c1=TRANSMETTRE | q_fct6_c1=CONVERTIR | q_fct7_c1=STOCKER | q_fct8_c1=TRANSMETTRE | q_fct12_c1=Hélice | q_fct13_c1=Multiplicateur | q_fct14_c1=Génératrice | q_fct15_c1=Batterie | q_fct16_c1=Prise USB | q_fct18_c1=Cinétique | q_fct19_c1=Électrique
