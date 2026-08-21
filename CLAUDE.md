# CLAUDE.md — Guide pour l'IA qui travaille sur ce projet

Ce fichier est lu automatiquement par Claude Code à chaque session. Il décrit la philosophie, l'architecture et les règles du projet. **Lis-le entièrement avant de toucher au code.**

---

## Vue d'ensemble

Plateforme pédagogique Flask pour collège (3ème–5ème). Le backend génère un site HTML statique à partir de fichiers `.md` propriétaires, et sert des routes JSON pour les réponses des élèves (SQLite), l'authentification, et les dépôts de fichiers. Le site généré est servi en statique ; les interactions élèves passent par `/api/`.

---

## Philosophie fondamentale

### 1. Local d'abord, imports jamais
- **Zéro dépendance externe au runtime** si possible. Pas de CDN, pas d'API externe, pas de services tiers.
- Les imports Python se limitent à la bibliothèque standard + Flask + Werkzeug. Avant d'ajouter un `pip install`, cherche si la stdlib suffit.
- Le JS frontend est du **vanilla ES6 pur** : pas de React, pas de Vue, pas de jQuery, pas de bundler. Un fichier `.js` dans `static/`, un `<script src="">` dans le template, c'est tout.
- Si un fichier de ressource externe est nécessaire (librairie JS, modèle, etc.), il doit être **téléchargé une fois et stocké dans le projet** (`static/libs/`), jamais chargé depuis un CDN en production.

### 2. Code rudimentaire et lisible
- **Pas d'abstraction prématurée.** Trois fonctions similaires valent mieux qu'une classe générique obscure.
- **Pas de sur-ingénierie.** Si la solution tient en 20 lignes de code direct, ne la transforme pas en architecture à cinq couches.
- Chaque fonction fait une chose. Chaque fichier a un rôle clair.
- Le code doit être lisible par quelqu'un qui ne connaît pas le projet.

### 3. Tout ce qui peut être configuré, l'est
- **Couleurs, dimensions, polices, espacements** → dans les fichiers `.palette` (jamais hardcodés dans le rendu).
- **Chemins de fichiers** → dans les constantes en tête de fichier ou dans un registre dédié, jamais éparpillés dans le code.
- **Noms de blocs, routes API, clés de base de données** → dans des constantes nommées, pas en chaînes littérales dispersées.
- Règle : si tu écris la même valeur deux fois, c'est une constante.

### 4. Commentaires utiles, pas décoratifs
- Commente le **pourquoi**, pas le quoi. Le nom de la fonction dit déjà ce qu'elle fait.
- Style Python : `# ── Section ──` pour les séparations logiques, docstring courte en tête de fonction si la signature ne suffit pas.
- Style JS : `// ── Section ──` pour les blocs, commentaire inline pour les choix non-évidents.
- **Pas de blocs de commentaires multi-lignes** pour expliquer du code qui devrait être auto-explicatif.

---

## Architecture du projet

```
site_techno_v3/
│
├── server.py           # Serveur Flask : routes API + auth + service du site statique
├── build.py            # Point d'entrée du build : génère site/ depuis contenu/
│
├── core/               # Moteur de rendu (pipeline Markdown → HTML)
│   ├── registry.py          # Registre des blocs : nom → fonction de rendu
│   ├── page_renderer.py     # Orchestre le pipeline complet d'une page
│   ├── page_builder.py      # Construit les pages HTML finales (métadonnées + corps)
│   ├── page_catalog.py      # Scanne contenu/, construit le catalogue 3 niveaux
│   ├── palette/
│   │   └── palette_loader.py    # Charge les fichiers .palette en dict Python
│   ├── parser/
│   │   ├── source_tokenizer.py  # Tokenize le Markdown propriétaire en liste de blocs
│   │   └── document_renderer.py # Transforme les tokens en HTML
│   └── blocks/
│       ├── structure_blocks.py  # Blocs de mise en page (pg, col, def, alr, tbl…)
│       ├── text_blocks.py       # Blocs texte (h1, h2, h3, txt, ques, obj…)
│       ├── media_blocks.py      # Blocs médias (img, gif, vid, pdf, lien…)
│       └── interactive_blocks.py # Blocs interactifs (qcm, associer, trier, repg…)
│
├── contenu/            # Sources Markdown des activités (snake_case, noms français)
│   └── [niveau]/s[N]_[nom]/activite_[N]_[slug].md
│
├── palettes/           # Fichiers de thème .palette
│   └── defaut.palette  # Palette par défaut (référence pour toutes les clés)
│
├── templates/          # Templates HTML Flask (Jinja2 minimal)
│   ├── base.html       # Template principal : navbar + contenu + JS élèves
│   ├── navbar.html     # Barre de navigation (auth, menu)
│   └── ...
│
├── static/             # Assets servis directement
│   ├── style.css       # CSS unique — layout/structure seulement, pas de couleurs
│   └── libs/           # Librairies JS auto-hébergées (téléchargées une fois)
│
├── site/               # Sortie du build (généré, ne pas éditer à la main)
├── pages/              # Pages HTML standalone (hors pipeline Markdown)
├── uploads/            # Dépôts de fichiers élèves
└── data.db             # Base SQLite (élèves, réponses, groupes, bloc-notes)
```

---

## Le système de palettes

**C'est le cœur de la personnalisation du projet. Toujours passer par les palettes pour les propriétés visuelles.**

### Format `.palette`
```
[nom_section]
cle=valeur
cle2=valeur2
# commentaire ignoré
```

### Sections disponibles dans `defaut.palette`
`corps`, `h1`, `h2`, `h3`, `pg`, `def`, `alr`, `ques`, `rep`, `obj`, `resume`, `qcm`, `assoc`, `trier`, `repg`, `lien`, `tbl`, `pages`, couleurs nommées (`bleu`, `vert`, `orange`, `rouge`, `jaune`, `violet`, `gris`)

### Règles d'utilisation
- Chaque section correspond à un type de bloc.
- Une clé absente → pas d'émission CSS pour cette propriété (comportement souhaité, pas une erreur).
- Pour ajouter une propriété configurable à un bloc : ajoute la clé dans `defaut.palette` ET lis-la dans le renderer du bloc. Ne hardcode jamais une couleur ou dimension dans un renderer.
- Pour modifier l'apparence d'un bloc, **modifie la palette, pas le renderer**.

---

## Ajouter un nouveau bloc

1. **Écrire le renderer** dans le fichier `core/blocks/` approprié :
   - Signature : `def render_nom_bloc(token, palette, **ctx) -> str`
   - Lire les propriétés visuelles depuis `palette["nom_section"]["cle"]`
   - Retourner du HTML en chaîne
2. **Enregistrer** dans `core/registry.py` : `REGISTRY["nom_bloc"] = render_nom_bloc`
3. **Ajouter la section** dans `palettes/defaut.palette` avec des valeurs par défaut sensées
4. **Documenter la syntaxe** dans un commentaire en tête du renderer (exemple de token attendu)

---

## Ajouter une route Flask

1. Dans `server.py`, ajouter la route dans la section appropriée (marquée par `# ── Section ──`)
2. Routes API : préfixe `/api/`, retournent `jsonify()`
3. Routes templates : `render_template()` uniquement pour les pages spéciales (hors pipeline Markdown)
4. Toujours vérifier `session["eleve_id"]` pour les routes élèves, ou utiliser le décorateur existant

---

## Conventions de nommage

| Contexte | Convention | Exemple |
|---|---|---|
| Fichiers Python | snake_case | `page_renderer.py` |
| Fichiers Markdown | snake_case | `activite_01_energie.md` |
| Fonctions Python | snake_case | `render_def_block()` |
| Variables Python | snake_case | `active_palette` |
| Classes Python | PascalCase | (rares dans ce projet) |
| Clés palette | snake_case | `fond`, `bordure`, `police_rep` |
| Sections palette | minuscule | `[rep]`, `[qcm]` |
| Classes CSS | kebab-case | `.block-rep`, `.rep-textarea` |
| Variables JS | camelCase | `activiteSlug`, `saveAnswer` |
| Fonctions JS | camelCase | `makeAutoGrow()`, `loadReponses()` |
| Commentaires | Français | `# Charge les palettes depuis le dossier` |
| Noms de fichiers contenu | snake_case + français | `s01_energie_formes/` |

---

## JavaScript frontend — règles

- **Tout le JS est inline dans les templates** (dans des blocs `<script>`), sauf les librairies externes qui vont dans `static/libs/`.
- **Pattern IIFE obligatoire** : chaque module JS est une fonction auto-exécutée `(function() { ... })();` pour éviter la pollution du scope global.
- **Pas de `var`** : utiliser `const` et `let`.
- **Pas de framework** : `document.querySelector`, `addEventListener`, `fetch`. C'est tout.
- Les appels API suivent le pattern : `fetch(url).then(r => r.ok ? r.json() : null).then(data => { ... })`
- Le JS ne contient pas de couleurs ni dimensions : ces valeurs viennent des variables CSS injectées par la palette (`var(--rep-bg)`, etc.).

---

## CSS — règles

- `static/style.css` : **structure et layout uniquement**. Aucune couleur hardcodée ici.
- Les couleurs arrivent via des variables CSS custom injectées inline par le renderer Python : `style="--rep-bg: #f0f0f0; --rep-bordure: #ccc;"`.
- Pour ajouter une propriété visuelle CSS : ajouter la clé dans la palette, l'émettre comme variable CSS dans le renderer, l'utiliser via `var(--ma-cle)` dans le CSS ou inline.

---

## Ce qu'il ne faut jamais faire

- ❌ Hardcoder une couleur (`#3a86ff`, `red`) dans un renderer Python ou un fichier CSS
- ❌ Hardcoder un chemin de fichier en dur dans une fonction (utiliser une constante en tête de fichier)
- ❌ Ajouter un `pip install` sans vérifier si la stdlib suffit
- ❌ Charger une ressource depuis un CDN externe en production
- ❌ Modifier des fichiers dans `site/` à la main (c'est un dossier généré)
- ❌ Écrire du JS qui injecte des couleurs (les couleurs viennent du CSS/palette)
- ❌ Créer une abstraction générique pour un cas particulier
- ❌ Ajouter de la gestion d'erreur pour des cas qui ne peuvent pas se produire
