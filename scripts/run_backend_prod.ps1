param(
    [int]$Port = 8000,
    [int]$Workers = 2
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$venvDir = Join-Path $repoRoot ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$activateScript = Join-Path $venvDir "Scripts\Activate.ps1"

if (-not (Test-Path $venvPython)) {
    Write-Host "Criando ambiente virtual em $venvDir ..."
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv $venvDir
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv $venvDir
    }
    else {
        throw "Python nao encontrado no PATH. Instale Python 3 e tente novamente."
    }
}

if (-not (Test-Path $venvPython)) {
    throw "Nao foi possivel criar a .venv. Verifique permissoes e instalacao do Python."
}

if (Test-Path $activateScript) {
    try {
        . $activateScript
        Write-Host "Ambiente virtual ativado."
    }
    catch {
        Write-Warning "Falha ao ativar via Activate.ps1. Continuando com python da .venv."
    }
}

Write-Host "Instalando dependencias do backend..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r "backend/requirements.txt"

Write-Host "Iniciando FastAPI (production-like) em http://127.0.0.1:$Port com $Workers workers ..."
& $venvPython -m uvicorn backend.app.main:app --host 127.0.0.1 --port $Port --workers $Workers
