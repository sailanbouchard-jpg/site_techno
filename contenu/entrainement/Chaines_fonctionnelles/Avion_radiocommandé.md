---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# AVION RADIOCOMMANDÉ

=txt> Un avion radiocommandé est piloté à distance par une personne restée au sol : il n'a donc pas de pilote automatique, mais il doit tout de même <i>recevoir</i>, <i>comprendre</i> et <i>exécuter</i> les ordres envoyés depuis la radiocommande. Pour avancer, il s'appuie sur un moteur électrique qui entraîne une hélice ; des servomoteurs, non détaillés dans ce schéma, permettent par ailleurs d'incliner les ailerons via des câbles pour diriger l'appareil.

=txt> Le <b>récepteur</b> capte en permanence le signal radio émis par la radiocommande : c'est lui qui acquiert les <b>ordres de la Radiocommande</b>. Ce signal est ensuite décodé par la <b>carte électronique</b>, qui détermine la commande à appliquer, puis la fait circuler via le <b>fil électrique</b> jusqu'à la partie motorisation. La <b>batterie</b> embarquée, déjà chargée avant le vol, stocke l'énergie électrique nécessaire. Le <b>régulateur du moteur</b> reçoit l'ordre transmis et distribue le courant en conséquence ; le <b>moteur</b> convertit alors cette énergie électrique en énergie de rotation, que l'<b>hélice</b> transmet à l'air pour propulser l'avion.

=txt> Ici, la batterie est rechargée avant le vol et non pendant : il n'y a donc pas de fonction <i>alimenter</i> distincte, seulement <i>stocker</i> — la première case de la chaîne d'énergie porte donc une croix. Observe aussi où arrive la flèche « Ordres » sur le schéma : elle entre exactement au niveau du régulateur du moteur, qui réalise la fonction <i>distribuer</i>.

=img> l schema_avion_rc.png "Constituants d'un avion radiocommandé : récepteur, carte électronique, batteries, servomoteur"

=options> fonctions | ACQUÉRIR | TRAITER | COMMUNIQUER | STOCKER | DISTRIBUER | CONVERTIR | TRANSMETTRE
=options> composants | Ordres de la Radiocommande | Récepteur | Carte électronique | Fil électrique | Batterie | Régulateur du moteur | Moteur | Hélice
=options> energie | Cinétique | Potentielle | Électrique | Thermique | Lumineuse

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

=verif> mode=1 | q_fct1_c1=ACQUÉRIR | q_fct2_c1=TRAITER | q_fct3_c1=COMMUNIQUER | q_fct5_c1=STOCKER | q_fct6_c1=DISTRIBUER | q_fct7_c1=CONVERTIR | q_fct8_c1=TRANSMETTRE | q_fct9_c1=Récepteur | q_fct10_c1=Carte électronique | q_fct11_c1=Fil électrique | q_fct13_c1=Batterie | q_fct14_c1=Régulateur du moteur | q_fct15_c1=Moteur | q_fct16_c1=Hélice | q_fct17_c1=Ordres de la Radiocommande | q_fct18_c1=Électrique | q_fct19_c1=Cinétique
