param(
    [string]$PythonExe = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$pythonCommand = $null
$pythonPrefix = @()

if ($PythonExe) {
    $pythonCommand = $PythonExe
}
elseif (Test-Path $venvPython) {
    $pythonCommand = $venvPython
}
elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCommand = "python"
}
elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCommand = "py"
    $pythonPrefix = @("-3")
}
else {
    throw "Python nao encontrado. Instale Python 3 e tente novamente."
}

function Invoke-Python {
    param([string[]]$Args)

    & $pythonCommand @pythonPrefix @Args
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao executar: $pythonCommand $($pythonPrefix -join ' ') $($Args -join ' ')"
    }
}

$specPath = Join-Path $repoRoot "backend\pyinstaller\backend.spec"
$distPath = Join-Path $repoRoot "build\backend-dist"
$workPath = Join-Path $repoRoot "build\backend-build"
$targetExe = Join-Path $repoRoot "build\backend.exe"

if (-not (Test-Path $specPath)) {
    throw "Spec do PyInstaller nao encontrado: $specPath"
}

Write-Host "Instalando dependencias do backend..."
Invoke-Python -Args @("-m", "pip", "install", "--upgrade", "pip")
Invoke-Python -Args @("-m", "pip", "install", "-r", "backend/requirements.txt")
Invoke-Python -Args @("-m", "pip", "install", "pyinstaller")

Write-Host "Gerando backend.exe com PyInstaller..."
Invoke-Python -Args @(
    "-m", "PyInstaller",
    $specPath,
    "--noconfirm",
    "--clean",
    "--distpath", $distPath,
    "--workpath", $workPath
)

$builtExe = Join-Path $distPath "backend.exe"
if (-not (Test-Path $builtExe)) {
    throw "Nao foi possivel gerar backend.exe em $builtExe"
}

Copy-Item -Path $builtExe -Destination $targetExe -Force
Write-Host "Backend empacotado com sucesso: $targetExe"
