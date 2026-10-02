# Déploiement — mettre le site en ligne

## La seule chose à retenir

Ouvrir PowerShell dans le dossier `site_techno_v3` et taper :

```
.\deployer.cmd
```

C'est tout. Le script pose une question (le message décrivant vos changements),
demande le mot de passe du serveur, puis fait tout le reste. Il affiche chaque
étape et s'arrête net au moindre problème.

Si vous préférez donner le message directement :

```
.\deployer.cmd "Correction du simulateur"
```

**Pourquoi `.cmd` et pas `.ps1`.** Windows refuse par défaut d'exécuter les
scripts PowerShell (`l'exécution de scripts est désactivée sur ce système`). Le
fichier `deployer.cmd` lance `deployer.ps1` en levant ce blocage **pour ce seul
appel**, sans rien changer aux réglages de sécurité de Windows. C'est le même
principe que `ds.cmd` et `deepseek.cmd`, déjà présents dans le projet.

Vous pourriez aussi autoriser les scripts une fois pour toutes avec
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, mais c'est une
modification durable des réglages de sécurité de votre session Windows, et elle
n'apporte rien ici : passez par `.\deployer.cmd`.

---

## Ce que le script fait, dans l'ordre

**Sur le PC**
1. Enregistre vos modifications (`git add` + `git commit`)
2. Les envoie sur GitHub (`git push`)

**Sur le serveur**
3. **Sauvegarde** `data.db` et `uploads/` dans `/opt/site_techno/sauvegardes/`
4. Récupère le code depuis GitHub
5. Installe les dépendances si `requirements.txt` a changé
6. Crée les tables manquantes dans la base
7. Reconstruit le site (`build.py`)
8. Redémarre le service
9. Affiche l'état : mot de passe admin, nombre de comptes élèves, de réponses,
   de fichiers déposés

L'étape 3 passe avant toute modification : si quelque chose casse ensuite, les
données sont déjà à l'abri. Les 20 dernières sauvegardes sont conservées.

---

## Ce que le script ne fait jamais

- **Il ne supprime aucun compte élève.**
- **Il ne supprime aucune réponse d'élève.**
- **Il n'appelle jamais `seed_test.py`.** Ce script-là efface tous les comptes et
  toutes les réponses : il est réservé au poste de développement.

Les créations de tables sont toutes en `CREATE TABLE IF NOT EXISTS` et les
évolutions de colonnes en `ALTER TABLE … ADD COLUMN`. Les données existantes
traversent les mises à jour sans être touchées.

---

## Le mot de passe administrateur

**À faire une fois, avant la première mise en ligne.**

Le mot de passe admin est lu depuis `admin_password.txt`, à la racine du projet.
Ce fichier est exclu de git : il n'est jamais envoyé sur GitHub et reste propre
à chaque machine. S'il est absent, le code retombe sur `admin` — valeur publique,
donc inutilisable en ligne.

Sur le serveur, créez-le :

```
ssh root@178.170.25.223
nano /opt/site_techno/admin_password.txt
```

Écrivez le mot de passe sur une seule ligne, enregistrez (Ctrl+O, Entrée, Ctrl+X),
puis :

```
systemctl restart site_techno
```

Sur votre PC, vous pouvez créer le même fichier avec un mot de passe différent
(ou ne rien faire : en local, `admin` suffit).

À chaque déploiement, le script rappelle si ce fichier manque.

---

## Il n'y a pas de compte élève en ligne — et c'est voulu

L'administrateur **n'est pas un compte dans la base**. C'est une simple
vérification de mot de passe ([server.py](server.py), route de connexion). Il n'y
a donc rien à créer : une table `eleves` vide est exactement l'état souhaité
avant la rentrée. L'admin fonctionne quand même, et il fait tout.

Le script affiche le nombre de comptes à chaque déploiement. S'il affiche autre
chose que `0`, il vous le signale sans rien supprimer.

### Si vous voulez vraiment retirer des comptes de test en ligne

**Opération destructrice, non réversible, et volontairement absente du script.**
À taper à la main, en connaissance de cause :

```
ssh root@178.170.25.223
cd /opt/site_techno
cp data.db "sauvegardes/data.db.avant-purge-$(date +%Y%m%d-%H%M%S)"
.venv/bin/python -c "
from core.database import get_connection
with get_connection() as conn:
    for t in ('groupes', 'bloc_notes', 'reponses', 'eleves'):
        conn.execute(f'DELETE FROM {t}')
print('Comptes et réponses supprimés.')
"
systemctl restart site_techno
```

Les fichiers déjà déposés par les élèves dans `uploads/` ne sont pas touchés par
cette commande.

---

## Les coordonnées

| | |
|---|---|
| Serveur | `ssh root@178.170.25.223` (Debian 13, VPS Ikoula) |
| Dépôt GitHub | https://github.com/sailanbouchard-jpg/site_techno |
| Dossier sur le serveur | `/opt/site_techno` |
| Environnement Python | `/opt/site_techno/.venv` |
| Service systemd | `site_techno.service` |
| Serveur d'application | gunicorn, 2 workers, `127.0.0.1:8000` |
| Serveur frontal | nginx (reverse proxy vers le port 8000) |
| Sauvegardes | `/opt/site_techno/sauvegardes/` |

Rien n'est automatique : ni GitHub Actions, ni webhook. Le serveur ne bouge que
quand vous lancez `deployer.cmd`.

---

## Les fichiers du déploiement

| Fichier | Rôle |
|---|---|
| `deployer.cmd` | Ce que vous lancez. Contourne le blocage Windows des `.ps1` |
| `deployer.ps1` | Le déploiement côté PC : commit, push, puis appel du serveur |
| `deployer_serveur.sh` | Exécuté sur le serveur, appelé par le précédent |

Le serveur récupère `deployer_serveur.sh` depuis GitHub au début de chaque
déploiement : pour le modifier, éditez-le ici et relancez `deployer.cmd`.

---

## Si ça casse

Le script s'arrête à la première erreur et affiche le journal. Pour en voir plus :

```
ssh root@178.170.25.223
systemctl status site_techno --no-pager
journalctl -u site_techno -n 50 --no-pager
```

### Revenir à la base de la veille

```
cd /opt/site_techno
ls -lt sauvegardes/
systemctl stop site_techno
cp sauvegardes/data.db.20261002-181500 data.db      # choisir la bonne date
systemctl start site_techno
```

---

## Points de vigilance connus

### La migration des réponses peut être destructrice

`init_db()` contient une branche qui fait `DROP TABLE reponses` si la table est
encore à l'ancien schéma partagé (colonne `numero_groupe`, sans `eleve_id`). La
base en production est déjà au schéma individuel : cette branche ne se déclenche
pas. C'est la raison pour laquelle la sauvegarde passe en premier.

### Le catalogue est vide sous gunicorn

`CATALOG` est initialisé à `{}` au niveau module et rempli par
`_reload_catalog()`, appelé uniquement dans le bloc `__main__` de `server.py`.
En production il reste donc vide. Les pages d'activité ne s'en aperçoivent pas :
leur navbar a été figée dans le HTML au moment du build. Mais toute route qui
reconstruit la navbar à la volée renvoie une navbar vide. À corriger un jour en
appelant `_reload_catalog()` au niveau module.

### Pourquoi le build tourne sur le serveur

`gunicorn` importe `server:app`, donc le bloc `if __name__ == "__main__":` de
`server.py` ne s'exécute jamais en production — ni `site_builder.main()`, ni
`init_db()`. Et `site/` est exclu de git. Sans l'étape 7, le code serait à jour
mais le contenu visible du site ne changerait pas d'un pixel.

### Ce qui n'est jamais envoyé par git

`data.db`, `uploads/`, `secret_key.txt`, `admin_password.txt`,
`imprimantes.json`, `site/`, `*.log`. Les premiers sont la mémoire du serveur et
ne doivent jamais être versionnés. `site/` se régénère.
