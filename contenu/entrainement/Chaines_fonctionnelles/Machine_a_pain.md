---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# MACHINE À PAIN

=txt> Une machine à pain permet de pétrir, faire lever puis cuire le pain automatiquement, sans surveillance : il suffit de verser les ingrédients et de choisir un programme. La cuve contient aussi des hélices mélangeuses entraînées par deux moteurs pour pétrir la pâte, mais cet exercice se concentre uniquement sur la partie qui gère et produit la <b>chaleur de cuisson</b>.

=txt> 
::col 60% 25%
  ::c
    =img> l schema_machine_a_pain.png "Constituants d'une machine à pain"
  ::/c
  ::c
    =esp> xl
    =img> m gauche schema_machine_a_pain2.png "Une machine à pain domestique"
  ::/c
::/col

=txt> Un <b>capteur de température</b> mesure en continu la chaleur de la <b>pâte à pain</b>. Cette information est traitée par le <b>programmateur</b> de la machine, qui suit ainsi l'avancement du programme choisi et affiche l'étape en cours sur l'<b>écran d'affichage</b>. Branchée sur le secteur, la machine est alimentée par l'<b>alimentation 230V</b> ; c'est ce même programmateur qui distribue alors le courant à la <b>résistance électrique</b> au bon moment, laquelle convertit ce courant en chaleur pour cuire la pâte.

=txt> Le <b>programmateur</b> remplit ici deux fonctions : il <i>traite</i> l'information de température, et il <i>distribue</i> aussi l'énergie vers la résistance — un même composant peut remplir deux fonctions à des endroits différents de la chaîne. Remarque enfin que deux cases de la chaîne d'énergie portent une croix : il n'y a ni fonction <i>stocker</i> (la machine est branchée en permanence, sans batterie) ni fonction <i>transmettre</i> (la chaleur produite par la résistance se diffuse directement dans la cuve, sans aucun mécanisme de transport).

=options> fonctions | CONVERTIR | ALIMENTER | COMMUNIQUER | STOCKER | TRAITER | TRANSMETTRE | DISTRIBUER | ACQUÉRIR
=options> composants | Programmateur | Capteur de température | Écran d'affichage | Alimentation 230V | Résistance électrique | Température de la pâte à pain
=options> energie | Cinétique | Thermique | Lumineuse | Potentielle | Électrique

::schema chaine_fonctionnelle.png xl
  =choix> q_fct1_c1 x=33.2% y=14.7% e=80% options=fonctions
  =choix> q_fct2_c1 x=50.5% y=14.7% e=80% options=fonctions
  =choix> q_fct3_c1 x=68.2% y=14.9% e=80% options=fonctions
  =choix> q_fct4_c1 x=17.7% y=59.2% e=80% options=fonctions
  =corrige> q_fct5_c1 x=33.8% y=59.4% e=80% "X"
  =choix> q_fct6_c1 x=50.4% y=59.2% e=80% options=fonctions
  =choix> q_fct7_c1 x=66.7% y=59% e=80% options=fonctions
  =corrige> q_fct8_c1 x=82.6% y=59% e=80% "X"
  =choix> q_fct9_c1 x=33.2% y=27.3% e=80% options=composants
  =choix> q_fct10_c1 x=50.5% y=27.4% e=80% options=composants
  =choix> q_fct11_c1 x=68.2% y=27.6% e=80% options=composants
  =choix> q_fct12_c1 x=17.8% y=72.1% e=80% options=composants
  =choix> q_fct14_c1 x=50.3% y=72.7% e=80% options=composants
  =choix> q_fct15_c1 x=66.6% y=72.7% e=80% options=composants
  =choix> q_fct17_c1 x=10.1% y=14.6% e=110% options=composants
  =choix> q_fct18_c1 x=13.6% y=93.7% e=80% options=energie
  =choix> q_fct19_c1 x=86.4% y=93.5% e=80% options=energie
::/schema

=verif> mode=1 | q_fct1_c1=ACQUÉRIR | q_fct2_c1=TRAITER | q_fct3_c1=COMMUNIQUER | q_fct4_c1=ALIMENTER | q_fct6_c1=DISTRIBUER | q_fct7_c1=CONVERTIR | q_fct9_c1=Capteur de température | q_fct10_c1=Programmateur | q_fct11_c1=Écran d'affichage | q_fct12_c1=Alimentation 230V | q_fct14_c1=Programmateur | q_fct15_c1=Résistance électrique | q_fct17_c1=Température de la pâte à pain | q_fct18_c1=Électrique | q_fct19_c1=Thermique
