---
titre: Simuler les pertes thermiques annuelles
mode: pages
---

::palette defaut


::pg
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
