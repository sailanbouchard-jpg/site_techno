// model/Force.js
// ───────────────
// Rôle : fabrique et évaluation d'une "force" : une grandeur scalaire qui
// varie dans le temps, appliquée le long d'un axe fixe (x ou y) sur un ou
// plusieurs nœuds. evaluateForce() est le SEUL point d'entrée que physics/ et
// render/ utilisent pour connaître la valeur d'une force à l'instant t : ni
// l'un ni l'autre ne sait ce qu'est un "sinus", ils appellent juste evaluateForce().
//
// CHOIX: l'éditeur (ui/forceEditor.js) ne permet de créer que des forces de
// type "sine", pour garder l'éditeur simple. Mais ce fichier est écrit pour
// accepter N'IMPORTE QUEL type de force variable dans le temps (aléatoire,
// mesurée, keyframes...) : ajouter un type plus tard ne demande qu'un nouveau
// "case" dans evaluateForce(), sans toucher à physics/ ni à render/.
//
// Ne doit PAS contenir : de logique de structure (nœuds/poutres -> Structure.js),
// de dessin, de gestion d'événements.
// Dépendances : aucune.

export function createForce({ id, type = "sine", axis = "x", a = 0, b = 1000, period = 2, phase = 0, color }) {
  return { id, type, axis, a, b, period, phase, color };
}

// Valeur scalaire de la force à l'instant `time` (peut être négative : c'est
// le signe qui donne le sens le long de l'axe fixe de la force).
export function evaluateForce(force, time) {
  switch (force.type) {
    case "sine": {
      // F(t) = A + B·sin(2π/période · t + phase) : une constante A, plus une
      // oscillation d'amplitude B autour de cette constante.
      //
      //   F
      //   │     ╭─╮         ╭─╮
      // A ┼────╱───╲──────╱───╲────  (A = décalage constant)
      //   │  ╱       ╲  ╱       ╲
      //   │╱           ╲╱         t →
      //   (amplitude B = hauteur des bosses au-dessus/dessous de A)
      const angularFrequency = (2 * Math.PI) / force.period;
      return force.a + force.b * Math.sin(angularFrequency * time + force.phase);
    }
    default:
      throw new Error(`Type de force inconnu : ${force.type}`);
  }
}
