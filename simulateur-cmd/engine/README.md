# Simulateur CMD — le moteur

Un « OS dans le navigateur » pour les défis de techno. JavaScript pur, modules ES natifs, zéro dépendance, zéro build. Tout est dans `/simulateur-cmd/`, rien ne dépend du reste du site.

## Architecture (4 couches étanches)

| Couche | Dossier | Rôle | Connaît |
|---|---|---|---|
| Noyau | `core/` | VFS, machine, env, état, shell | rien au-dessus |
| Commandes | `commands/` | une commande = un fichier | le contexte `ctx` |
| UI | `ui/` | terminal DOM, éditeur, styles | tout, seule à toucher le DOM |
| Défi | `challenge/` | niveaux, validation, sauvegarde | le noyau |

L'unité de base est la **Machine** (fichiers + profil + env + état, sérialisable en JSON). Un terminal n'est qu'une **vue** branchée dessus. `ctx.network` est réservé (null) pour la future simulation réseau.

Le style est séparé en deux : `ui/terminal.css` = **structure uniquement**, `ui/theme.css` = **toutes les couleurs/dimensions/effets** (l'équivalent des `.palette` du site). Pour changer le look → theme.css, jamais terminal.css.

## Ajouter une commande

1. Créer `commands/macommande.js` :

```js
export default {
  name: "macommande",
  aliases: [],
  description: "Une ligne pour help",
  usage: "macommande <arg>",
  run(ctx, args) {
    // ctx = { machine, session, fs, env, registry, io, network }
    const abs = ctx.fs.resolve(args[0] || ".", ctx.machine.cwd);
    ctx.io.writeLine(`[[vert]]ok :[[/]] ${abs}`);   // JAMAIS de DOM ici
  },
};
```

2. L'ajouter à la liste dans `commands/index.js`. C'est tout.

La sortie accepte le balisage `[[style]]…[[/]]` (vert, cyan, jaune, rouge, gris, titre, ok, err, flag, dossier, cache…) rendu par l'UI via les classes `.mk-*` de theme.css.

## Créer une machine

```js
import { Machine, Terminal } from "./engine.js";

const machine = Machine.create(
  { hostname: "poste-01", user: "eleve", motd: "…", bootLines: ["…"], theme: "hacker" },
  { "/home/eleve/fichier.txt": "contenu", "/home/eleve/Dossier/": null }   // seed du VFS
);
const terminal = Terminal.mount(document.getElementById("terminal"), machine, {});
```

`machine.serialize()` / `Machine.deserialize(json)` restaurent une machine identique. Cycle de vie : `poweron`, `poweroff`, `reboot` (le boot est animé par l'UI).

## Brancher un adaptateur de persistance

Interface : `load(key) -> Promise<data|null>` et `save(key, data) -> Promise<void>`. Fournis : `LocalStorageAdapter` (dev) et `NullAdapter` (tests). Pour brancher les comptes élèves du site, écrire un adaptateur qui fait `fetch('/api/…')` avec la même interface — le moteur ne change pas.

## Créer un défi

Voir `/challenges/00-prise-en-main/` comme modèle. Une page de défi n'importe que `engine.js` + son `challenge.def.js` :

```js
Challenge.create({ id, title, studentId, adapter, machineSeed, levels });
// level = { id, title, brief, hints:[…], mode:'flag'|'etat',
//           validate(ctx, submission) -> bool, onEnter(machine)? }
```

Validation par **flag** (comparer le code saisi) ou par **état atteint** (inspecter `ctx.machine.fs`, `cwd`, `ctx.session.history`…). Sauvegarde **uniquement** à la réussite d'un niveau ; au rechargement l'élève repart à son niveau le plus avancé.

## Tester sans navigateur

```
node ../test-headless.js      # depuis /simulateur-cmd/ : node test-headless.js
```

Le noyau se pilote en headless : `Session.create(machine, createMemoryIO())` puis `session.execute("mkdir dossier")`. Voir `demo.html` pour la vérification visuelle.
