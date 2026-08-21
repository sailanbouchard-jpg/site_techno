---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
entrainement: oui
---

::palette defaut

# ROVER MARTIEN

=img> xl image_opportunity.png "Image réalisée en 3D du rover Opportunity"

::col 50% 45%
    ::c
        =img> m schema_opportunity.png "Schéma des composants du rover"  
    ::/c
    ::c
        =txt> Opportunity était un robot qui a exploré la surface de Mars entre 2004 et 2018.

        =txt> Il fut lancé le 8 juillet 2003 par une fusée Delta II, et a atteint la surface de Mars après un voyage de six mois et demi. L'objectif de la mission était d'étudier la géologie martienne, notamment de rechercher des traces d'eau passée, et Opportunity était capable de se déplacer pour explorer différentes zones. Comparé aux rovers plus récents, c'était un petit robot : environ 185 kilogrammes, quelques instruments scientifiques, à peu près la taille d'une voiturette de golf.

        =txt> Il se déplaçait grâce à six roues qui disposaient chacune de leur moteur électrique intégré, et il pouvait évoluer sur des terrains accidentés grâce à ses suspensions et ses roues flexibles. Le robot était piloté à distance grâce à ses antennes qui recevaient le signal depuis la Terre. L'ordinateur de bord pilotait les roues et exécutait les commandes qu'il recevait.

        =txt> Les moteurs, l'ordinateur de bord, et tous les appareils électriques comme les antennes ou les caméras étaient alimentés par la batterie du rover. Cette batterie se rechargeait uniquement grâce à ses panneaux solaires.

        =txt> Opportunity disposait d'un bras télécommandé de 0,8 mètre de long qui lui permettait d'analyser le sol et les roches aux alentours. Au bout de ce bras se trouvaient une caméra microscopique, un spectromètre pour analyser la composition des roches, et un outil capable de gratter la surface des roches pour voir ce qu'il y a en dessous.

        =txt> Le principal défi lors de la conception était d'imaginer un robot qui ait le moins de chances possible d'avoir des pannes... On ne peut pas aller le réparer s'il y a un problème !
    ::/c
::/col




=options> fonctions | CONVERTIR | ACQUÉRIR | TRANSMETTRE | COMMUNIQUER | ALIMENTER | TRAITER | STOCKER | DISTRIBUER
=options> composants | Hélice | Récepteur | Carte électronique | Batterie | Fil électrique | Ordres de la Radiocommande | Moteur | Régulateur du moteur
=options> energie | Cinétique | Potentielle | Électrique | Thermique | Lumineuse

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

=verif> mode=1 | q_fct1_c1= ACQUÉRIR | q_fct2_c1=TRAITER | q_fct3_c1=COMMUNIQUER | q_fct4_c1=ALIMENTER | q_fct5_c1=STOCKER | q_fct6_c1=DISTRIBUER | q_fct7_c1=CONVERTIR | q_fct8_c1=TRANSMETTRE | q_fct9_c1=Récepteur | q_fct10_c1=Carte électronique | q_fct11_c1=Fil électrique | q_fct12_c1=Alimentation 230V | q_fct13_c1=Batterie | q_fct14_c1=Régulateur du moteur | q_fct15_c1=Moteur | q_fct16_c1=Hélice | q_fct17_c1=Informations de l'extérieur | q_fct18_c1=Électrique | q_fct19_c1=Cinétique

