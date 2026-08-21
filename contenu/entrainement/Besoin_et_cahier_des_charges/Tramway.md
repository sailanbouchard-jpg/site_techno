---
titre: Tramway — Besoin et cahier des charges
entrainement: oui
---

::palette defaut

# TRAMWAY

## Comment un tramway est-il alimenté ?

::col 50% 50%
    ::c
        =img> s image_tramway.png "Un tramway circulant dans le centre-ville de Bordeaux, sans aucun câble aérien"
        =img> xs schema_tramway_pentographe.png "Alimentation par le haut : le pantographe capte le courant de la caténaire"
    ::/c
    ::c
        =img> m schema_tramway_bas.png "Alimentation par le bas : le patin collecteur capte le courant au niveau du rail (APS)"
    ::/c
::/col

=txt> Une ville qui grandit doit déplacer chaque jour des milliers d'<b>habitants</b> entre leur domicile, leur travail ou leur lieu d'études. Si chacun prend sa voiture, les rues se saturent et la <b>pollution</b> augmente. Le <b>tramway</b> propose une alternative : un véhicule électrique transportant plusieurs centaines de passagers, qui circule sur des rails au cœur des quartiers urbains.

=txt> Comme tout véhicule électrique, le tramway doit être <b>alimenté en énergie</b> en permanence : il n'embarque pas assez de batteries pour rouler toute la journée. La solution la plus répandue consiste à tendre un câble au-dessus de la voie, la <b>caténaire</b>, et à équiper le toit du tramway d'un bras articulé, le <b>pantographe</b>, qui capte le courant en glissant contre ce câble. Solution simple et peu coûteuse, mais elle impose poteaux et fils au-dessus de chaque rue.

=txt> Certaines villes, comme <b>Bordeaux</b>, évitent ces fils disgracieux au-dessus de leurs monuments historiques grâce à une <b>alimentation par le sol</b> (<b>APS</b>) : le courant circule dans des barres encastrées entre les rails, découpées en <b>tronçons isolés les uns des autres</b>. Un <b>patin collecteur</b> sous le tramway glisse sur ces barres et ne met sous tension que le tronçon situé sous le véhicule : le reste du rail reste hors tension, donc <b>aucune électrisation</b> pour un piéton qui traverse la voie.

=txt> Une fois capté, par le pantographe ou par le patin, le courant circule dans un <b>câblage embarqué sous le plancher</b> jusqu'au <b>moteur électrique</b>, qui entraîne les roues.

=txt> Dans les deux cas, le tramway ne brûle aucun carburant et ne rejette donc <b>aucune émission directe</b> de gaz polluants, contrairement à un bus ou une voiture thermique.

=sep>

## Le besoin satisfait par le tramway

=options> besoin | Déplacer les habitants en ville en limitant la pollution automobile | Relier deux villes éloignées à grande vitesse | Transporter des marchandises entre deux usines | Capter le courant électrique sans fils aériens visibles | Transporter jusqu'à 300 passagers par rame | Relier la gare SNCF au centre historique

=ques> D'après ce que tu viens de lire, quel est le besoin auquel répond un tramway comme celui de Bordeaux ?

=choix> q1_besoin options=besoin

=sep>

## Du besoin aux solutions techniques

=ques> Complète le diagramme fonctionnel du tramway.

=options> solutions | Caténaire et pantographe (mode aérien) | Patin sur le rail (mode au sol) | Câblage sous le plancher | Moteur électrique | Frein à disque | Roues en acier sur les rails | Climatisation de la cabine | Panneaux solaires sur le toit | Capteur de vitesse

::diag xl xs gauche

  ::dracine bleu "Fonction d'usage"
    =choix> q2_usage options=besoin
  ::/dracine

  ::dniveau vert "Fonctions techniques"
    ::dcase id=ft1 parent=racine
      =txt> Capter l'énergie électrique
    ::/dcase
    ::dcase id=ft2 parent=racine
      =txt> Transmettre le courant au moteur
    ::/dcase
    ::dcase id=ft3 parent=racine
      =txt> Transformer l'énergie en mouvement
    ::/dcase
  ::/dniveau

  ::dniveau orange "Solutions techniques"
    ::dcase parent=ft1
      =choix> q2_st1a options=solutions
    ::/dcase
    ::dcase parent=ft1
      =choix> q2_st1b options=solutions
    ::/dcase
    ::dcase parent=ft2
      =choix> q2_st2 options=solutions
    ::/dcase
    ::dcase parent=ft3
      =choix> q2_st3 options=solutions
    ::/dcase
  ::/dniveau

::/diag

=sep>

## Le cahier des charges fonctionnel du tramway

=ques> Complète le cahier des charges fonctionnel du tramway.

=options> cahier | Capacité d'accueil maximale | Aucun risque toléré | Risque d'électrisation des piétons | Mode de captation du courant | Caténaire (aérien) ou APS (au sol) | S'intégrer au centre historique | Aucun câble visible en centre historique | Émissions polluantes directes | Vitesse maximale de 70 km/h | Durée de vie garantie de 30 ans

::tbl 10% 30% 30% 30%
  ::trh
    ::tc centre
    ::/tc
    ::tc centre
      =txt> Fonction
    ::/tc
    ::tc centre
      =txt> Critère d'appréciation
    ::/tc
    ::tc centre
      =txt> Niveau d'exigence
    ::/tc
  ::/trh

  ::tr
    ::tc centre
      =txt> FT1
    ::/tc
    ::tc
      =txt> Transporter des passagers en milieu urbain
    ::/tc
    ::tc centre
      =choix> q3_crit1 options=cahier
    ::/tc
    ::tc centre
      =txt> 300 passagers maximum
    ::/tc
  ::/tr

  ::tr
    ::tc v2 centre
      =txt> FC1
    ::/tc
    ::tc v2
      =txt> Garantir la sécurité des usagers
    ::/tc
    ::tc centre
      =txt> Risque de déraillement
    ::/tc
    ::tc centre
      =choix> q3_niv2a options=cahier
    ::/tc
  ::/tr
  ::tr
    ::tc centre
      =choix> q3_crit2b options=cahier
    ::/tc
    ::tc centre
      =txt> Nul : le rail n'est sous tension que sous le tramway
    ::/tc
  ::/tr

  ::tr
    ::tc centre
      =txt> FT2
    ::/tc
    ::tc
      =txt> Être alimenté en énergie électrique
    ::/tc
    ::tc centre
      =choix> q3_crit3 options=cahier
    ::/tc
    ::tc centre
      =choix> q3_niv3 options=cahier
    ::/tc
  ::/tr

  ::tr
    ::tc centre
      =txt> FC2
    ::/tc
    ::tc
      =choix> q3_fonc4 options=cahier
    ::/tc
    ::tc centre
      =txt> Présence de câbles aériens dans le champ de vision
    ::/tc
    ::tc centre
      =choix> q3_niv4 options=cahier
    ::/tc
  ::/tr

  ::tr
    ::tc centre
      =txt> FC3
    ::/tc
    ::tc
      =txt> Respecter l'environnement
    ::/tc
    ::tc centre
      =choix> q3_crit5 options=cahier
    ::/tc
    ::tc centre
      =txt> Nulles (motorisation 100% électrique)
    ::/tc
  ::/tr
::/tbl

=sep>

=txt> Une fois toutes les cases remplies, clique sur <b>Vérifier les réponses</b>.

=verif> mode=3 | q1_besoin=Déplacer les habitants en ville en limitant la pollution automobile | q2_usage=Déplacer les habitants en ville en limitant la pollution automobile | q2_st1a=Caténaire et pantographe (mode aérien) | q2_st1b=Patin sur le rail (mode au sol) | q2_st2=Câblage sous le plancher | q2_st3=Moteur électrique | q3_crit1=Capacité d'accueil maximale | q3_niv2a=Aucun risque toléré | q3_crit2b=Risque d'électrisation des piétons | q3_crit3=Mode de captation du courant | q3_niv3=Caténaire (aérien) ou APS (au sol) | q3_fonc4=S'intégrer au centre historique | q3_niv4=Aucun câble visible en centre historique | q3_crit5=Émissions polluantes directes

=sep>

## Test de mise en page — diagramme (hauteur et arrondi des cases)

=options> diag_test_court | Capteur | Frein | Rail | Moteur | Roue | Pantographe

=options> diag_test_long | Système de freinage électromagnétique combiné à un frein à disque pour l'arrêt d'urgence | Réseau de capteurs répartis le long de la voie pour détecter la présence d'obstacles | Dispositif de régulation automatique de la vitesse selon la déclivité de la voie

::diag l xs gauche

  ::dracine bleu "Système tramway"
    =txt> Vue d'ensemble du système de propulsion
  ::/dracine

  ::dniveau vert "Niveau 1"
    ::dcase id=n1_1 parent=racine
      =txt> Énergie
    ::/dcase
    ::dcase id=n1_2 parent=racine
      =txt> Mécanique de roulement et de freinage
    ::/dcase
    ::dcase id=n1_3 parent=racine
      =txt> Contrôle
    ::/dcase
  ::/dniveau

  ::dniveau violet "Niveau 2"
    ::dcase id=n2_1_1 parent=n1_1
      =txt> Captation aérienne
    ::/dcase
    ::dcase id=n2_1_2 parent=n1_1
      =txt> Captation au sol
    ::/dcase
    ::dcase id=n2_1_3 parent=n1_1
      =txt> Conversion
    ::/dcase
    ::dcase id=n2_1_4 parent=n1_1
      =txt> Stockage tampon
    ::/dcase
    ::dcase id=n2_1_5 parent=n1_1
      =txt> Distribution du courant vers les organes embarqués
    ::/dcase
    ::dcase id=n2_2_1 parent=n1_2
      =txt> Transmission
    ::/dcase
    ::dcase id=n2_2_2 parent=n1_2
      =txt> Freinage
    ::/dcase
    ::dcase id=n2_2_3 parent=n1_2
      =txt> Suspension
    ::/dcase
    ::dcase id=n2_3_1 parent=n1_3
      =txt> Signalisation
    ::/dcase
    ::dcase id=n2_3_2 parent=n1_3
      =txt> Sécurité passagers
    ::/dcase
    ::dcase id=n2_3_3 parent=n1_3
      =txt> Supervision centralisée du réseau
    ::/dcase
    ::dcase id=n2_3_4 parent=n1_3
      =txt> Communication
    ::/dcase
  ::/dniveau

  ::dniveau orange "Niveau 3 (final)"
    ::dcase parent=n2_1_1
      =choix> diag_test_f1 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_1_1
      =choix> diag_test_f2 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_1_2
      =choix> diag_test_f3 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_1_2
      =choix> diag_test_f4 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_1_3
      =choix> diag_test_f5 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_1_4
      =choix> diag_test_f6 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_1_4
      =choix> diag_test_f7 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_1_5
      =choix> diag_test_f8 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_2_1
      =choix> diag_test_f9 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_2_1
      =choix> diag_test_f10 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_2_2
      =choix> diag_test_f11 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_2_2
      =choix> diag_test_f12 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_2_2
      =choix> diag_test_f13 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_2_3
      =choix> diag_test_f14 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_3_1
      =choix> diag_test_f15 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_3_1
      =choix> diag_test_f16 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_3_2
      =choix> diag_test_f17 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_3_3
      =choix> diag_test_f18 options=diag_test_long
    ::/dcase
    ::dcase parent=n2_3_3
      =choix> diag_test_f19 options=diag_test_court
    ::/dcase
    ::dcase parent=n2_3_4
      =choix> diag_test_f20 options=diag_test_long
    ::/dcase
  ::/dniveau

::/diag
