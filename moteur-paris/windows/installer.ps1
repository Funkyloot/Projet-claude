# Installation du Moteur de paris sous Windows 10 / 11.
# Sources officielles uniquement : Python (python.org, via winget de Microsoft) et PyPI.
$ErrorActionPreference = "Continue"
$Source = Split-Path -Parent $PSScriptRoot
$Cible = Join-Path $env:LOCALAPPDATA "MoteurDeParis"
$Nom = "Moteur de paris"

function Echec($texte) {
    Write-Host ""
    Write-Host "ÉCHEC : $texte" -ForegroundColor Red
    exit 1
}

function Trouver-Python {
    $essais = @()
    if (Get-Command py -ErrorAction SilentlyContinue) { $essais += ,@("py", "-3") }
    foreach ($v in "313", "312", "311", "310") {
        $chemin = Join-Path $env:LOCALAPPDATA "Programs\Python\Python$v\python.exe"
        if (Test-Path $chemin) { $essais += ,@($chemin) }
    }
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notlike "*WindowsApps*") { $essais += ,@($cmd.Source) }
    foreach ($e in $essais) {
        $exe = $e[0]
        $arguments = @($e | Select-Object -Skip 1) + @("-c", "import sys; print(sys.executable if sys.version_info >= (3, 10) else '')")
        $sortie = & $exe @arguments 2>$null
        if ($LASTEXITCODE -eq 0 -and $sortie -and "$sortie".Trim()) { return "$sortie".Trim() }
    }
    return $null
}

Write-Host "=== Installation : $Nom ===" -ForegroundColor Green
Write-Host "Application installée dans : $Cible"

# 0. Arrêter une version déjà installée (mise à jour)
$ancien = Join-Path $Cible "environnement\Scripts\pythonw.exe"
if (Test-Path $ancien) {
    Write-Host "Arrêt de la version en cours…"
    Start-Process -FilePath $ancien -ArgumentList "`"$Cible\lanceur.pyw`" --arreter-silencieux" -Wait -ErrorAction SilentlyContinue
}

# 1. Python 3.10 ou plus récent
$python = Trouver-Python
if (-not $python) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Echec "Python est absent. Installez Python 3.12 depuis https://www.python.org/downloads/ (cochez « Add python.exe to PATH »), puis relancez cet installateur."
    }
    Write-Host "Installation de Python 3.12 (officiel, via winget de Microsoft)…"
    winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
    $python = Trouver-Python
    if (-not $python) { Echec "Python n'a pas pu être installé. Installez-le depuis https://www.python.org/downloads/ puis relancez." }
}
Write-Host "Python trouvé : $python"

# 2. Environnement isolé et dépendances (PyPI)
Write-Host "Préparation de l'application (quelques minutes la première fois)…"
New-Item -ItemType Directory -Force -Path $Cible | Out-Null
& $python -m venv (Join-Path $Cible "environnement")
if ($LASTEXITCODE -ne 0) { Echec "création de l'environnement Python impossible." }
$pyv = Join-Path $Cible "environnement\Scripts\python.exe"
& $pyv -m pip install --quiet --disable-pip-version-check --upgrade pip
& $pyv -m pip install --quiet --disable-pip-version-check "$Source"
if ($LASTEXITCODE -ne 0) { Echec "installation des composants impossible (connexion internet ?)." }

New-Item -ItemType Directory -Force -Path (Join-Path $Cible "data") | Out-Null
Copy-Item -Force (Join-Path $Source "bureau\lanceur.pyw") $Cible
Copy-Item -Force (Join-Path $Source "bureau\icone.ico") $Cible

# 3. Icônes : bureau, menu Démarrer, démarrage automatique avec Windows
$pythonw = Join-Path $Cible "environnement\Scripts\pythonw.exe"
$shell = New-Object -ComObject WScript.Shell
function Raccourci($chemin, $option, $description) {
    $r = $shell.CreateShortcut($chemin)
    $r.TargetPath = $pythonw
    $r.Arguments = "`"$Cible\lanceur.pyw`" $option".Trim()
    $r.WorkingDirectory = $Cible
    $r.IconLocation = "$Cible\icone.ico,0"
    $r.Description = $description
    $r.Save()
}
$bureau = [Environment]::GetFolderPath("Desktop")
$menu = [Environment]::GetFolderPath("Programs")
$demarrage = [Environment]::GetFolderPath("Startup")
Raccourci (Join-Path $bureau "$Nom.lnk") "" "Ouvrir le Moteur de paris"
Raccourci (Join-Path $menu "$Nom.lnk") "" "Ouvrir le Moteur de paris"
Raccourci (Join-Path $menu "Arrêter $Nom.lnk") "--arreter" "Arrêter le Moteur de paris"
Raccourci (Join-Path $demarrage "$Nom (arrière-plan).lnk") "--service" "Démarre le Moteur de paris avec Windows"

# 4. Démarrage immédiat en arrière-plan
Start-Process -FilePath $pythonw -ArgumentList "`"$Cible\lanceur.pyw`" --service" -WorkingDirectory $Cible

Write-Host ""
Write-Host "=== Terminé ===" -ForegroundColor Green
Write-Host "Double-cliquez sur l'icône « $Nom » de votre bureau."
Write-Host "Si Windows demande l'accès au réseau : cochez « Réseaux privés » (pour y accéder depuis le téléphone)."
