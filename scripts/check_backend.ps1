param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [switch]$SkipHttp
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    throw ".venv nao encontrada. Rode .\scripts\run_backend.ps1 primeiro."
}

& $venvPython -c "import fastapi, uvicorn; print('deps ok')"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& $venvPython -c "import backend.app.main; print('import ok')"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not $SkipHttp) {
    $docsUrl = $BaseUrl.TrimEnd("/") + "/docs"

    try {
        $response = Invoke-WebRequest -Uri $docsUrl -UseBasicParsing -TimeoutSec 5
    }
    catch {
        Write-Error "HTTP check falhou para $docsUrl. Backend esta rodando?"
        exit 1
    }

    if ($response.StatusCode -ne 200) {
        Write-Error "HTTP check falhou para $docsUrl com status $($response.StatusCode)."
        exit 1
    }

    Write-Host "http ok (/docs)"
}
else {
    Write-Host "http check skipped (use -SkipHttp)"
}
