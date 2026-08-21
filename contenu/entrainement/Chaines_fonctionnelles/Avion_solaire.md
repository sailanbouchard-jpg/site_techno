---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# AVION SOLAIRE

=txt> Solar Impulse 2 est un avion expérimental qui a fait le tour du monde sans utiliser une seule goutte de carburant : toute son énergie vient du Soleil. Pour y arriver, l'avion doit produire en permanence assez d'électricité pour voler de jour <i>et</i> de nuit, tout en restant le plus léger possible — une contrainte très différente de celle d'un avion radiocommandé, qui se contente d'une batterie chargée au sol.

::col 50% 50%
    ::c
        =img> xl schema_solar_impulse2.png "Solar Impulse 2 : un avion solaire ayant bouclé le tour du monde"
    ::/c
    ::c
        =img> m schema_solar_impulse.png "Constituants électriques d'une aile de Solar Impulse 2"
    ::/c
::/col

=txt> Les <b>panneaux photovoltaïques</b>, qui recouvrent toute la surface des ailes, alimentent en permanence le circuit électrique de l'avion. Une partie de cette énergie charge la <b>batterie</b>, qui la stocke pour les phases de vol de nuit. Pendant ce temps, un <b>tube de pitot</b> mesure en continu la vitesse de l'air : le <b>variateur</b> traite cette information pour calculer la puissance nécessaire, puis l'affiche au pilote sur l'<b>écran de bord</b>. Ce même variateur distribue ensuite le courant utile au <b>moteur électrique</b>, qui convertit l'énergie électrique en énergie de rotation ; celle-ci est enfin transmise à l'<b>hélice</b>, qui propulse l'avion.

=txt> Le <b>variateur</b> joue ici un double rôle : il <i>traite</i> l'information de vitesse venue du tube de pitot (chaîne d'information), et il <i>distribue</i> aussi la puissance électrique au moteur (chaîne d'énergie) — un même composant peut très bien remplir deux fonctions différentes. Remarque également que cet avion est le seul de cette série d'exercices à posséder à la fois une fonction <i>alimenter</i> (les panneaux solaires, en continu) <i>et</i> une fonction <i>stocker</i> (la batterie, pour la nuit) : contrairement à l'avion radiocommandé ou à la trottinette, son énergie n'est pas uniquement puisée dans une batterie déjà chargée.

=options> fonctions | ACQUÉRIR | TRAITER | COMMUNIQUER | ALIMENTER | STOCKER | DISTRIBUER | CONVERTIR | TRANSMETTRE
=options> composants | Vitesse du vent | Tube de pitot | Variateur | Écran de bord | Panneau photovoltaïque | Batterie | Moteur | Hélice
=options> energie | Lumineuse | Cinétique | Thermique | Électrique | Potentielle

::schema chaine_fonctionnelle.png xl
  =choix> q_fct1_c1 x=33.2% y=14.7% e=80% options=fonctions
  =choix> q_fct2_c1 x=50.5% y=14.7% e=80% options=fonctions
  =choix> q_fct3_c1 x=68.2% y=14.9% e=80% options=fonctions
  =choix> q_fct4_c1 x=17.7% y=59.2% e=80% options=fonctions
  =choix> q_fct5_c1 x=33.8% y=59.4% e=80% options=fonctions
  =choix> q_fct6_c1 x=50.4% y=59.2% e=80% options=fonctions
  =choix> q_fct7_c1 x=66.7% y=59% e=80% options=fonctions
  =choix> q_fct8_c1 x=82.6% y=59% e=80% options=fonctions
  =choix> q_fct9_c1 x=33.2% y=27.3% e=80% options=composants
  =choix> q_fct10_c1 x=50.5% y=27.4% e=80% options=composants
  =choix> q_fct11_c1 x=68.2% y=27.6% e=80% options=composants
  =choix> q_fct12_c1 x=17.8% y=72.1% e=80% options=composants
  =choix> q_fct13_c1 x=33.8% y=72.4% e=80% options=composants
  =choix> q_fct14_c1 x=50.3% y=72.7% e=80% options=composants
  =choix> q_fct15_c1 x=66.6% y=72.7% e=80% options=composants
  =choix> q_fct16_c1 x=82.6% y=72.7% e=80% options=composants
  =choix> q_fct17_c1 x=10.1% y=14.6% e=110% options=composants
  =choix> q_fct18_c1 x=13.6% y=93.7% e=80% options=energie
  =choix> q_fct19_c1 x=86.4% y=93.5% e=80% options=energie
::/schema

=verif> mode=1 | q_fct1_c1=ACQUÉRIR | q_fct2_c1=TRAITER | q_fct3_c1=COMMUNIQUER | q_fct4_c1=ALIMENTER | q_fct5_c1=STOCKER | q_fct6_c1=DISTRIBUER | q_fct7_c1=CONVERTIR | q_fct8_c1=TRANSMETTRE | q_fct9_c1=Tube de pitot | q_fct10_c1=Variateur | q_fct11_c1=Écran de bord | q_fct12_c1=Panneau photovoltaïque | q_fct13_c1=Batterie | q_fct14_c1=Variateur | q_fct15_c1=Moteur | q_fct16_c1=Hélice | q_fct17_c1=Vitesse du vent | q_fct18_c1=Électrique | q_fct19_c1=Cinétique
