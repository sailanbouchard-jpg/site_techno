# ──────────────────────────────────────────────────────────────────────────────
# deployer.ps1 — met le site en ligne, de bout en bout
#
# À lancer depuis ce dossier, dans PowerShell :
#
#     .\deployer.ps1
#     .\deployer.ps1 "Correction du simulateur"     (message de commit)
#
# Ce qu'il fait :
#   PC      → commit + push sur GitHub
#   serveur → sauvegarde, pull, tables, build, redémarrage
#
# Il ne supprime JAMAIS de compte élève ni de réponse d'élève.
#
# Le mot de passe SSH est demandé une seule fois, par SSH lui-même.
# Il n'est écrit nulle part dans ce fichier : c'est volontaire.
# ──────────────────────────────────────────────────────────────────────────────

param([string]$Message = "")

# ── Coordonnées du serveur ────────────────────────────────────────────────────
# Les seules valeurs à changer si le serveur déménage un jour.
$SERVEUR         = "root@178.170.25.223"
$DOSSIER_DISTANT = "/opt/site_techno"
$SCRIPT_SERVEUR  = "deployer_serveur.sh"

$ErrorActionPreference = "Stop"

function Titre($texte) {
    Write-Host ""
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $texte" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Stopper($texte) {
    Write-Host ""
    Write-Host "  ✗ $texte" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ── Vérification : sommes-nous dans le bon dossier ? ──────────────────────────
if (-not (Test-Path "server.py")) {
    Stopper "Lancez ce script depuis le dossier site_techno_v3."
}

Titre "PC — envoi du travail sur GitHub"

# ── Commit ────────────────────────────────────────────────────────────────────
$modifs = git status --porcelain
if ($modifs) {
    $nb = ($modifs | Measure-Object).Count
    Write-Host ""
    Write-Host "  $nb fichier(s) modifié(s) :" -ForegroundColor Yellow
    $modifs | Select-Object -First 15 | ForEach-Object { Write-Host "    $_" }
    if ($nb -gt 15) { Write-Host "    … et $($nb - 15) autre(s)" }

    if (-not $Message) {
        Write-Host ""
        $Message = Read-Host "  Message de commit (Entrée = « Mise a jour du site »)"
        if (-not $Message) { $Message = "Mise a jour du site" }
    }

    Write-Host ""
    Write-Host "  Enregistrement…"
    git add -A
    if (-not $?) { Stopper "git add a echoue." }
    git commit -q -m $Message
    if (-not $?) { Stopper "git commit a echoue." }
    Write-Host "      ✓ commit créé" -ForegroundColor Green
}
else {
    Write-Host ""
    Write-Host "  Aucune modification locale." -ForegroundColor Gray
}

# ── Push ──────────────────────────────────────────────────────────────────────
Write-Host "  Envoi vers GitHub…"
git push -q
if (-not $?) { Stopper "git push a echoue. Verifiez votre connexion et vos identifiants GitHub." }
Write-Host "      ✓ GitHub à jour" -ForegroundColor Green

# ── Serveur ───────────────────────────────────────────────────────────────────
Titre "SERVEUR — mise en ligne"
Write-Host ""
Write-Host "  Connexion à $SERVEUR" -ForegroundColor Gray
Write-Host "  (le mot de passe du serveur va être demandé)" -ForegroundColor Gray

# Le serveur récupère d'abord le script de déploiement depuis GitHub,
# puis l'exécute. Une seule connexion SSH, donc un seul mot de passe.
$commande = "cd $DOSSIER_DISTANT && git pull --ff-only --quiet && bash $SCRIPT_SERVEUR"
ssh $SERVEUR $commande

if ($LASTEXITCODE -ne 0) {
    Stopper "Le deploiement sur le serveur a echoue (code $LASTEXITCODE). Rien n'a ete supprime : une sauvegarde de la base a ete faite avant toute modification, dans $DOSSIER_DISTANT/sauvegardes/."
}

Write-Host ""
Write-Host "  ✓ Site en ligne à jour." -ForegroundColor Green
Write-Host ""
