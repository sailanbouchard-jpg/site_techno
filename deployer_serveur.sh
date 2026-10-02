#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# deployer_serveur.sh — partie serveur du déploiement
#
# Ce script ne se lance PAS à la main. Il est envoyé et exécuté sur le serveur
# Ikoula par deployer.ps1, depuis le PC. Pour déployer : .\deployer.ps1
#
# Il ne supprime JAMAIS de compte élève ni de réponse d'élève.
# Il n'appelle jamais seed_test.py (qui, lui, efface tous les comptes).
# ──────────────────────────────────────────────────────────────────────────────

set -e   # au moindre échec, on s'arrête : jamais de déploiement à moitié fait

DOSSIER="/opt/site_techno"
SERVICE="site_techno"
PYTHON="$DOSSIER/.venv/bin/python"
PIP="$DOSSIER/.venv/bin/pip"
HORODATAGE=$(date +%Y%m%d-%H%M%S)

cd "$DOSSIER"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  SERVEUR — $(hostname)"
echo "════════════════════════════════════════════════════════════"

# ── 1. Sauvegarde ─────────────────────────────────────────────────────────────
# data.db et uploads/ sont exclus de git : ils n'existent que sur ce serveur.
# On les sauvegarde AVANT toute modification.
echo ""
echo "[1/6] Sauvegarde de la base et des dépôts d'élèves…"
mkdir -p sauvegardes
cp data.db "sauvegardes/data.db.$HORODATAGE"
echo "      ✓ sauvegardes/data.db.$HORODATAGE"
if [ -d uploads ] && [ -n "$(ls -A uploads 2>/dev/null)" ]; then
    tar czf "sauvegardes/uploads.$HORODATAGE.tar.gz" uploads
    echo "      ✓ sauvegardes/uploads.$HORODATAGE.tar.gz"
else
    echo "      · uploads/ vide, rien à sauvegarder"
fi
# On ne garde que les 20 sauvegardes les plus récentes de chaque sorte.
ls -1t sauvegardes/data.db.*        2>/dev/null | tail -n +21 | xargs -r rm --
ls -1t sauvegardes/uploads.*.tar.gz 2>/dev/null | tail -n +21 | xargs -r rm --

# ── 2. Récupération du code ───────────────────────────────────────────────────
echo ""
echo "[2/6] Récupération du code depuis GitHub…"
git pull --ff-only
echo "      ✓ $(git log --oneline -1)"

# ── 3. Dépendances ────────────────────────────────────────────────────────────
echo ""
echo "[3/6] Vérification des dépendances Python…"
"$PIP" install -q -r requirements.txt
echo "      ✓ à jour"

# ── 4. Base de données ────────────────────────────────────────────────────────
# gunicorn importe server:app, donc le bloc __main__ de server.py ne tourne
# jamais en production : init_db() doit être appelé ici, à la main.
# Toutes les créations sont en CREATE TABLE IF NOT EXISTS → aucune perte.
echo ""
echo "[4/6] Mise à jour des tables de la base…"
"$PYTHON" -c "from core.database import init_db; init_db()"
echo "      ✓ tables à jour, données conservées"

# ── 5. Construction du site ───────────────────────────────────────────────────
# site/ est exclu de git : sans ce build, le contenu visible ne change pas.
echo ""
echo "[5/6] Construction du site (site/)…"
"$PYTHON" build.py > /tmp/build_site.log 2>&1 || {
    echo "      ✗ ÉCHEC du build. Dernières lignes :"
    tail -25 /tmp/build_site.log
    exit 1
}
echo "      ✓ $(find site -name '*.html' | wc -l) pages générées"

# ── 6. Redémarrage ────────────────────────────────────────────────────────────
echo ""
echo "[6/6] Redémarrage du service…"
systemctl restart "$SERVICE"
sleep 2
if systemctl is-active --quiet "$SERVICE"; then
    echo "      ✓ $SERVICE actif"
else
    echo "      ✗ $SERVICE NE DÉMARRE PAS. Journal :"
    journalctl -u "$SERVICE" -n 30 --no-pager
    exit 1
fi

# ── État du site en ligne ─────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ÉTAT DU SITE EN LIGNE"
echo "════════════════════════════════════════════════════════════"

if [ -f admin_password.txt ]; then
    echo "  Mot de passe admin : défini (admin_password.txt)"
else
    echo ""
    echo "  ⚠  AUCUN MOT DE PASSE ADMIN DÉFINI"
    echo "     Le site accepte donc « admin », qui est la valeur par défaut"
    echo "     écrite dans le code public. À corriger maintenant :"
    echo ""
    echo "       ssh root@178.170.25.223"
    echo "       nano /opt/site_techno/admin_password.txt"
    echo "       systemctl restart site_techno"
    echo ""
fi

"$PYTHON" - <<'PYTHON_FIN'
from core.database import get_connection
with get_connection() as conn:
    nb = lambda t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    eleves, reponses, fichiers = nb("eleves"), nb("reponses"), nb("drop_fichiers")
print(f"  Comptes élèves     : {eleves}")
print(f"  Réponses stockées  : {reponses}")
print(f"  Fichiers déposés   : {fichiers}")
if eleves:
    print("")
    print(f"  ⚠  {eleves} compte(s) élève présent(s) en ligne alors que vous")
    print("     n'en voulez aucun pour l'instant. Rien n'a été supprimé :")
    print("     ce script ne touche jamais aux données d'élèves.")
    print("     Pour les retirer, voyez DEPLOIEMENT.md.")
PYTHON_FIN

echo ""
echo "  ✓ Déploiement terminé."
echo ""
