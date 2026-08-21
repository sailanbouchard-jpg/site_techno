---
titre: Entraînement — Chaîne d'énergie et chaîne d'information
---

::palette defaut

# TRAMWAY

=rep> K2

::col 50% 50%
    ::c
        =img> s image_tramway.png "Photo d'un tramway de Bordeaux"
        =img> xs schema_tramway_pentographe.png "Alimentation par le haut : le Pentographe"
    ::/c
    ::c
        =img> m schema_tramway_bas.png "Alimentation par le bas : les Patins"
    ::/c
::/col


::diag l centre

  ::dracine bleu
    =txt> Ouvrir / fermer le portail
  ::/dracine

  ::dniveau vert "Fonctions techniques"
    ::dcase id=ft1 parent=racine
      =txt> Générer le mouvement
    ::/dcase
    ::dcase id=ft2 parent=racine
      =txt> Transmettre le mouvement au portail
    ::/dcase
    ::dcase id=ft3 parent=racine
      =txt> Assurer le guidage du portail
    ::/dcase
  ::/dniveau

  ::dniveau orange "Solutions techniques"
    ::dcase parent=ft1
      =rep> q1
    ::/dcase
    ::dcase parent=ft1
      =rep> q1b
    ::/dcase
    ::dcase parent=ft2
      =rep> q2
    ::/dcase
    ::dcase parent=ft3
      =rep> q3
    ::/dcase
  ::/dniveau

::/diag



::tbl 28% 24% 24% 24%
  ::trh
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