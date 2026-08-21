---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# SYSTEME DE FILTRATION DE PISCINE

=txt> L'eau d'une piscine se trouble très vite si elle n'est pas brassée et nettoyée en permanence : poussières, pollen, micro-organismes... Pour garder une eau claire et saine sans intervention humaine constante, le système de filtration fait circuler en boucle toute l'eau du bassin à travers un filtre, jour et nuit.

::col 60% 25%
  ::c
    =img> l schema_filtration_piscine.png "Système de filtration d'une piscine"
  ::/c
  ::c
    =img> m gauche schema_pompe.png "Constituants de la pompe à eau"
    =gif> xs animation_pompe_centrifuge.gif "Simulation du fonctionnement d'une pompe a eau"
    
  ::/c
::/col

=txt> Une <b>sonde</b> plongée dans le bassin mesure en continu l'état de l'eau (température, pH...). Cette information est envoyée au <b>boîtier de contrôle</b>, qui la traite pour décider si la pompe doit fonctionner. Branché sur le secteur, ce boîtier est <i>alimenté</i> par l'<b>alimentation 230V</b>, et c'est lui qui distribue ensuite le courant nécessaire au <b>moteur</b> de la pompe. Le moteur entraîne alors la <b>turbine</b>, qui transmet ce mouvement à l'eau et la fait circuler à travers le filtre.

=txt> Remarque que le <b>boîtier de contrôle</b> remplit ici deux fonctions différentes : il <i>traite</i> l'information donnée par la sonde, et il <i>distribue</i> ensuite l'énergie électrique vers le moteur — un même composant peut très bien apparaître deux fois dans la chaîne. Remarque aussi qu'il n'y a ici ni fonction <i>communiquer</i> (le boîtier ne renvoie aucune information à un utilisateur, d'où la croix) ni fonction <i>stocker</i> (l'eau est filtrée en direct, sans réserve d'énergie).

=options> fonctions | STOCKER | DISTRIBUER | ACQUÉRIR | TRANSMETTRE | COMMUNIQUER | CONVERTIR | TRAITER | ALIMENTER
=options> composants | Boîtier de contrôle | Alimentation 230V | Sonde | État de l'eau | Turbine | Moteur
=options> energie | Lumineuse | Électrique | Cinétique | Thermique | Potentielle

::schema chaine_fonctionnelle.png xl
  =choix> q_fct1_c1 x=33.2% y=14.7% e=80% options=fonctions
  =choix> q_fct2_c1 x=50.5% y=14.7% e=80% options=fonctions
  =corrige> q_fct3_c1 x=68.2% y=14.9% e=80% "X"
  =choix> q_fct4_c1 x=17.7% y=59.2% e=80% options=fonctions
  =corrige> q_fct5_c1 x=33.8% y=59.4% e=80% "X"
  =choix> q_fct6_c1 x=50.4% y=59.2% e=80% options=fonctions
  =choix> q_fct7_c1 x=66.7% y=59% e=80% options=fonctions
  =choix> q_fct8_c1 x=82.6% y=59% e=80% options=fonctions
  =choix> q_fct9_c1 x=33.2% y=27.3% e=80% options=composants
  =choix> q_fct10_c1 x=50.5% y=27.4% e=80% options=composants
  =choix> q_fct12_c1 x=17.8% y=72.1% e=80% options=composants
  =choix> q_fct14_c1 x=50.3% y=72.7% e=80% options=composants
  =choix> q_fct15_c1 x=66.6% y=72.7% e=80% options=composants
  =choix> q_fct16_c1 x=82.6% y=72.7% e=80% options=composants
  =choix> q_fct17_c1 x=10.1% y=14.6% e=110% options=composants
  =choix> q_fct18_c1 x=13.6% y=93.7% e=80% options=energie
  =choix> q_fct19_c1 x=86.4% y=93.5% e=80% options=energie
::/schema

=verif> mode=1 | q_fct1_c1=ACQUÉRIR | q_fct2_c1=TRAITER | q_fct4_c1=ALIMENTER | q_fct6_c1=DISTRIBUER | q_fct7_c1=CONVERTIR | q_fct8_c1=TRANSMETTRE | q_fct9_c1=Sonde | q_fct10_c1=Boîtier de contrôle | q_fct12_c1=Alimentation 230V | q_fct14_c1=Boîtier de contrôle | q_fct15_c1=Moteur | q_fct16_c1=Turbine | q_fct17_c1=État de l'eau | q_fct18_c1=Électrique | q_fct19_c1=Cinétique
