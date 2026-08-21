---
titre: L'éolienne — un système qui se pilote seul
mode: pages
---

::palette defaut


::pg 
=obj> Comment une éolienne peut-elle fonctionner en sécurité, sans opérateur humain, 24 h sur 24 ?

=esp> s

::resume
=txt> {{q1}}
=esp> xs
=txt> {{q2}}
=esp> xs
=txt> {{q5}}
=esp> xs
=txt> {{q6}}
::/resume 


# L'éolienne — un système automatique

=sep>

## 1 · Mise en situation

=txt> Le village de Montbrun installe une éolienne pour produire son électricité. Problème : aucun technicien ne peut la surveiller en permanence. Elle doit se gérer seule, en temps réel, en toute sécurité.

::col 55% 45%
  ::c
    =img> m "Vue d'ensemble d'une éolienne moderne" 311_dessin_eolienne.png
  ::/c
  ::c
    =esp> s
    ::alr
    =txt> Par vent violent, les pales atteignent <b>300 km/h</b> en bout de pale. Sans arrêt automatique, la structure peut se rompre.
    ::/alr
    =esp> s
    ::def
    =txt> <b>Seuils de fonctionnement :</b>
    =txt> • En dessous de <b>2,8 m/s</b> → arrêt (vent insuffisant)
    =txt> • De 2,8 à <b>14 m/s</b> → production croissante
    =txt> • De 14 à <b>25 m/s</b> → puissance nominale
    =txt> • Au-dessus de <b>25 m/s</b> → arrêt d'urgence
    ::/def
  ::/c
::/col

=ques> En une phrase complète, explique pourquoi l'éolienne s'arrête par vent trop faible ET par vent trop fort.

=rep> q1

=ques> Recherche sur internet : quel pourcentage du temps une éolienne terrestre fonctionne-t-elle en moyenne par an ? Rédige ta réponse en une phrase complète.

=rep> q2


=sep>

## 2 · Qu'est-ce qu'un système automatique ?

=txt> L'éolienne ne se pilote pas à la main. Elle appartient à une catégorie de systèmes qui agissent seuls : les <b>systèmes automatiques</b>.

::def
=txt> <b>Système automatique</b> : système qui accomplit une tâche <b>sans intervention humaine directe</b>, en captant des informations de son environnement, en les traitant, puis en agissant en conséquence.
::/def

=esp> s

=txt> Tout système automatique comporte trois fonctions :

::col 33% 34% 33%
  ::c
    ::cdr bleu
    =txt> <b>1. Acquérir</b>
    =txt> Des capteurs mesurent le monde réel (vitesse, température, position…)
    ::/cdr
  ::/c
  ::c
    ::cdr violet
    =txt> <b>2. Traiter</b>
    =txt> Un processeur analyse les mesures et décide de l'action à effectuer.
    ::/cdr
  ::/c
  ::c
    ::cdr vert
    =txt> <b>3. Agir</b>
    =txt> Des actionneurs modifient le monde réel (moteur, frein, vanne…)
    ::/cdr
  ::/c
::/col

=esp> s

=txt> Coche tous les systèmes automatiques ci-dessous, puis clique sur <b>Vérifier</b>. Si besoin, clique sur <b>Recommencer</b> pour modifier tes réponses.

=qcm> q3 multiple | *Un lave-linge programmable | Une tondeuse à gazon classique | *Un thermostat de chauffage | *Un distributeur automatique de boissons | Un vélo | *Un ascenseur

=sep>

## 3 · Les composants de l'éolienne

::col
  ::c
    =txt> L'éolienne est composée de plusieurs organes, chacun jouant un rôle précis dans la <b>transformation de l'énergie</b> ou dans la <b>gestion automatique</b>.

    =vid> s centre https://www.youtube.com/watch?v=OPwzddhun4Y "Fonctionnement d'une éolienne — Vestas (3 min)"
  ::/c
  ::c
    =img> m right "Coupe d'une éolienne et ses composants principaux" 311_schema_eolienne.png
  ::/c
::/col

=esp> s

=txt> Clique sur un composant à gauche, puis sur sa fonction à droite. Un trait se trace automatiquement pour relier les deux.

=associer> q4 | Pales=Captent l'énergie cinétique du vent | Multiplicateur=Augmente la vitesse de rotation | Alternateur=Transforme la rotation en électricité | Anémomètre=Mesure la vitesse du vent | Girouette=Mesure la direction du vent | Régulateur=Prend les décisions automatiques

=ques> Le régulateur est souvent comparé au "cerveau" de l'éolienne. En une phrase complète, explique ce qu'il fait concrètement.

=rep> q5

=sep>

## 4 · La courbe de puissance

=img> m "Courbe puissance / vitesse de vent d'une éolienne" 311_courbe_de_vent.png

=txt> Cette courbe montre comment la puissance produite varie avec la vitesse du vent. On y lit directement les deux vitesses-seuil qui commandent le démarrage et l'arrêt d'urgence.

::col 50% 50%
  ::c
    ::def vert
    =txt> <b>Vitesse d'enclenchement</b> (cut-in speed)
    =txt> Vitesse minimale pour commencer à produire. En dessous, l'énergie récupérable ne compense pas les frottements mécaniques.
    ::/def
  ::/c
  ::c
    ::def rouge
    =txt> <b>Vitesse de décrochage</b> (cut-out speed)
    =txt> Vitesse au-delà de laquelle l'éolienne s'arrête pour protéger ses pales et sa structure.
    ::/def
  ::/c
::/col

=ques> Sur la courbe, identifie les deux vitesses-seuil. Rédige une phrase complète donnant leur nom et leur valeur en m/s.

=rep> q6

=sep>

## 5 · L'algorithme de contrôle

=txt> Pour réagir au vent, le régulateur suit un <b>algorithme</b> : une suite de conditions qui déterminent, à chaque instant, l'état de l'éolienne.

::def
=txt> <b>Algorithme</b> : suite d'instructions ordonnées permettant à un système de prendre une décision de façon automatique, reproductible et prévisible.
::/def

=txt> L'algorithme ci-dessous décrit la logique de mise en marche et d'arrêt. Complète les cases vides à partir des seuils que tu as identifiés.

=ques> Complète l'algorithme de contrôle de l'éolienne.

::schema 311_algo_marche_arret.png l
  =rep> q71 x=47.8% y=35.7% l=13%
  =rep> q72 x=20.7% y=64.1% l=23%
  =rep> q73 x=47.8% y=64.6% l=23%
  =rep> q74 x=76.7% y=64.9% l=23%
::/schema

=sep>

## 6 · La chaîne automatique

=txt> Les ingénieurs décrivent un système automatique à l'aide de la <b>chaîne automatique</b>, divisée en deux parties complémentaires.

::col 50% 50%
  ::c
    ::def bleu
    =txt> <b>Chaîne d'information</b>
    =txt> Mesurer → Décider → Commander
    =txt> Capteur → Traitement → Pré-actionneur
    ::/def
  ::/c
  ::c
    ::def vert
    =txt> <b>Chaîne d'énergie</b>
    =txt> Alimenter → Convertir → Transmettre → Agir
    =txt> Source → Conversion → Transmission → Actionneur
    ::/def
  ::/c
::/col

=esp> s

=txt> Voici les éléments de la chaîne d'information de l'éolienne dans le désordre. Glisse-les pour les remettre dans le bon ordre.

=trier> q8 | Anémomètre (capte la vitesse du vent) | Régulateur (analyse et décide) | Moteur + frein (reçoit la commande) | Pales orientées ou freinées (effet réel sur le système)

=ques> Complète la chaîne automatique de l'éolienne sur le schéma ci-dessous.

::schema 311_chaine_automatique.png xl
  =rep> q91 x=22.6% y=13.8%
  =rep> q92 x=43.8% y=14%
  =rep> q93 x=22.6% y=30%
  =rep> q94 x=17.9% y=62%
  =rep> q95 x=57.6% y=48% l=12%
  =rep> q96 x=77.8% y=48% l=12%
  =rep> q97 x=56.8% y=62%
  =rep> q98 x=77.4% y=62%
  =rep> q99 x=23.1% y=85%
  =rep> q910 x=72.7% y=85%
::/schema

=sep>

## 7 · Document ressource

=txt> L'alternateur est le composant qui produit l'électricité. Il fonctionne sur le principe de l'<b>induction électromagnétique</b>, découvert par Faraday en 1831.

=pdf> m "Fiche technique : fonctionnement de l'alternateur" fiche_alternateur.pdf

=sep>

## 8 · Bilan personnel

=repg> q10 | Ce système est automatique car {raison} | Il acquiert l'information grâce à {capteur} | Il agit sur l'éolienne grâce à {actionneur} | Un risque sans ce système : {risque}



=obj> Comment choisir le bon isolant pour notre conteneur, et combien coûte réellement le chauffage chaque année ?

=esp> s

::resume
=txt> {{q1}}.
=esp> xs
=txt> {{q4}}.
=esp> xs
=txt> {{q6}}
=esp> xs
=txt> {{q9}}.
=esp> xs
=txt> {{q10}}.
::/resume


# Simuler les pertes thermiques annuelles

=sep>

## Mise en situation

::col 62% 38%
  ::c
    =txt> Notre conteneur est construit et ses dimensions sont fixées. Reste la question essentielle : <b>quel isolant mettre dans les parois</b>, et combien ça coûte vraiment chaque année ? Vous allez comparer la <b>laine de verre</b>, la <b>laine de bois</b> et le <b>Plastique Stirodur</b>.
    =esp> xs
    ::def
    =txt> <b>Trois facteurs déterminent les pertes thermiques :</b>
    =txt> • <b>S</b> — surface totale des parois (m²), calculée dans les activités précédentes
    =txt> • <b>R</b> — résistance thermique de l'isolant (m².K/W) ; plus R est grand, moins la chaleur passe
    =txt> • <b>DJU</b> — rigueur du climat ; plus l'hiver est rude, plus les DJU sont élevés
    ::/def
  ::/c
  ::c
    =esp> m
    =gif> centre l "La chaleur traverse les parois en continu : c'est la conduction thermique. Un isolant ralentit ce transfert." conduction_thermique_barre.gif
  ::/c
::/col

=esp> xs

=txt> Avant de commencer, remets les cinq étapes de la démarche dans le bon ordre :

=trier> q0 | Trouver la température légale de consigne | Calculer les DJU de notre région (rigueur du climat) | Rappeler les caractéristiques des parois du conteneur (surface) | Simuler les pertes thermiques annuelles pour chaque isolant | Calculer le coût du chauffage et choisir l'isolant

=sep>

## Partie 1 · La température légale de consigne

::col 38% 62%
  ::c
    =txt> La loi française fixe la température minimale à maintenir dans un logement chauffé. C'est cette valeur qui servira de consigne dans les calculs de DJU.
    =esp> xs
    =lien> centre m "Lois françaises sur le chauffage (service-public.gouv.fr)" logo_rf.png https://www.service-public.gouv.fr/particuliers/vosdroits/F32563
  ::/c
  ::c
    =ques> Q1 — Quelle est la température minimale légale dans un logement en France pendant la période de chauffe ? (→ résumé)
    =rep> q1
    =esp> xs
    =ques> Q2 — Pendant quelle période de l'année cette obligation s'applique-t-elle exactement ?
    =rep> q2
  ::/c
::/col

=esp> xs

=ques> Q3 — Si un logement loué ne respecte pas cette température minimale, quels recours le locataire peut-il engager ? Décris les étapes concrètes.
=rep> q3

=sep>

## Partie 2 · Les Degrés-Jours Unifiés (DJU)

::col 58% 42%
  ::c
    ::def
    =txt> <b>DJU — comment ça marche :</b>
    =txt> Chaque jour d'hiver, on mesure l'écart entre la consigne intérieure et la température extérieure. On additionne tous ces écarts sur l'année.
    =txt> Exemple : si dehors il fait 5°C et que la consigne est 18°C → écart de 13°C ce jour-là.
    =txt> <b>Plus les DJU sont élevés, plus l'hiver est long et froid — et plus la facture est lourde.</b>
    ::/def
  ::/c
  ::c
    ::cdr jaune
    =txt> <b>Formule des pertes :</b>
    =txt> <b>Pertes (kWh) = S × DJU × 24 ÷ (1 000 × R)</b>
    =esp> xs
    =txt> <b>Coût (€) = Pertes × 0,25</b>
    =txt> <i>(prix du kWh en 2024 : ~0,25 €)</i>
    ::/cdr
  ::/c
::/col

=esp> xs

::col 38% 62%
  ::c
    =lien> centre m "Calculer les DJU — GRDF Cégibat" logo_cegibat.png https://cegibat.grdf.fr/simulateur/calcul-dju
    =esp> xs
    ::alr
    =txt> <b>Protocole Bordeaux-Mérignac :</b>
    =txt> ① Station : <b>Bordeaux-Mérignac (33)</b>
    =txt> ② Méthode : <b>Météo</b> · Usage : <b>Chauffage</b>
    =txt> ③ Consigne : <b>ta réponse Q1</b> (en °C)
    =txt> ④ Période : <b>du 01/01/2024 au 31/12/2024</b>
    ::/alr
  ::/c
  ::c
    =ques> Q4 — Quelle est la valeur des DJU obtenue pour Bordeaux-Mérignac en 2024 ? (→ résumé)
    =rep> q4
    =esp> xs
    =ques> Q5 — Refais le calcul pour Lille (59), même période. Quelle valeur obtiens-tu ? Pourquoi est-elle différente ?
    =rep> q5
  ::/c
::/col

=esp> xs

=ques> Q6 — En te basant sur ce que tu viens d'apprendre, explique en une ou deux phrases le lien entre les DJU d'une région et ses besoins en isolation. (→ résumé)
=rep> q6

=sep>

## Partie 3 · Les parois de notre conteneur

::col 50% 50%
  ::c
    =ques> Q7a — Modèle / dimensions du conteneur choisi :
    =rep> q7a
  ::/c
  ::c
    =ques> Q7b — Surface totale des parois à isoler (m²) :
    =rep> q7b
  ::/c
::/col

=sep>

## Partie 4 · Simulation des pertes thermiques

::col 38% 62%
  ::c
    =lien> centre m "Simulateur de pertes thermiques — La bouche ouverte" logo_laboucheouverte.png https://www.laboucheouverte.fr/calcul-pertes-thermiques/
  ::/c
  ::c
    ::alr
    =txt> ⚠️ <b>Prix du kWh :</b> Le simulateur affiche peut-être ~0,07 €/kWh (ancien tarif). Calcule le coût toi-même : <b>Pertes (kWh) × 0,25</b>.
    =txt> Saisis : surface (Q7b), DJU Bordeaux (Q4), et la valeur R de chaque isolant.
    ::/alr
  ::/c
::/col

=esp> xs

::tbl 28% 24% 24% 24%

  ::trh bleu
    ::tc
      =txt> Matériau isolant
    ::/tc
    ::tc centre
      =txt> R (m².K/W)
    ::/tc
    ::tc centre
      =txt> Pertes annuelles (kWh)
    ::/tc
    ::tc centre
      =txt> Coût annuel (€) à 0,25 €/kWh
    ::/tc
  ::/trh

  ::tr
    ::tc
      =txt> Laine de verre
    ::/tc
    ::tc centre
      =rep> q8ar
    ::/tc
    ::tc centre
      =rep> q8ap
    ::/tc
    ::tc centre
      =rep> q8ac
    ::/tc
  ::/tr

  ::tr
    ::tc
      =txt> Laine de bois
    ::/tc
    ::tc centre
      =rep> q8br
    ::/tc
    ::tc centre
      =rep> q8bp
    ::/tc
    ::tc centre
      =rep> q8bc
    ::/tc
  ::/tr

  ::tr
    ::tc
      =txt> Styrène (Stirodur)
    ::/tc
    ::tc centre
      =rep> q8sr
    ::/tc
    ::tc centre
      =rep> q8sp
    ::/tc
    ::tc centre
      =rep> q8sc
    ::/tc
  ::/tr

::/tbl

=sep>

## Partie 5 · Analyse des résultats

::alr
=txt> <b>Le choc des chiffres.</b> Les coûts que vous venez de calculer peuvent dépasser <b>800 à 1 000 € par an</b> pour un mauvais isolant — sur un conteneur qui n'est même pas grand. C'est pourquoi l'isolation est toujours la première priorité dans un bâtiment.
::/alr

=esp> xs

::col 50% 50%
  ::c
    =ques> Q9 — Quel isolant permet les pertes les plus faibles ? Justifie en t'appuyant sur les valeurs de R. (→ résumé)
    =rep> q9
  ::/c
  ::c
    =ques> Q10 — Calcule la différence de coût annuel entre le meilleur et le moins bon isolant. (→ résumé)
    =rep> q10
  ::/c
::/col

=esp> xs

=ques> Q11 — Le coût du chauffage est-il le seul critère pour choisir un isolant ? Cite d'autres facteurs (coût d'achat, impact environnemental, facilité de pose, durabilité…).
=rep> q11

=esp> xs

::cdr vert
=ques> Q12 — Conclusion : quel isolant choisirais-tu pour notre conteneur, et pourquoi ? Justifie avec au moins deux critères.
::/cdr

=rep> q12

::/pg
