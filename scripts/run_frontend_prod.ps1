$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm nao encontrado no PATH. Instale Node.js e tente novamente."
}

Write-Host "Instalando dependencias do frontend (npm ci)..."
npm ci

Write-Host "Gerando build de producao (dist/)..."
npm run build

Write-Host "Subindo frontend estatico em http://127.0.0.1:8081 ..."
if (Get-Command serve -ErrorAction SilentlyContinue) {
    serve -s dist -l 8081
}
else {
    Write-Host "'serve' nao encontrado globalmente. Usando npx serve..."
    npx --yes serve -s dist -l 8081
}
