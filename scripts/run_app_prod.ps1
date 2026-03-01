param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 8081,
    [int]$BackendWorkers = 2,
    [int]$BackendTimeoutSec = 180,
    [int]$FrontendTimeoutSec = 300,
    [int]$PollIntervalSec = 2
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:StepNumber = 1
function Write-Step {
    param([string]$Message)
    Write-Host ("[{0}] {1}" -f $script:StepNumber, $Message)
    $script:StepNumber++
}

function Get-LogTail {
    param(
        [string]$Path,
        [int]$Lines = 25
    )

    if (-not (Test-Path $Path)) {
        return "[sem log em $Path]"
    }

    $content = Get-Content -Path $Path -Tail $Lines -ErrorAction SilentlyContinue
    if (-not $content) {
        return "[log vazio em $Path]"
    }

    return ($content -join [Environment]::NewLine)
}

function Get-ProcessFailureDetails {
    param(
        [string]$Name,
        [System.Diagnostics.Process]$Process,
        [string]$StdOutPath,
        [string]$StdErrPath
    )

    $details = @()
    $details += "$Name encerrou inesperadamente."
    $details += "PID: $($Process.Id)"
    $details += "ExitCode: $($Process.ExitCode)"
    $details += "STDERR (ultimas linhas):"
    $details += (Get-LogTail -Path $StdErrPath -Lines 35)
    $details += "STDOUT (ultimas linhas):"
    $details += (Get-LogTail -Path $StdOutPath -Lines 20)

    return ($details -join [Environment]::NewLine)
}

function Wait-HttpReady {
    param(
        [string]$Name,
        [string[]]$Urls,
        [System.Diagnostics.Process]$Process,
        [int]$TimeoutSec,
        [int]$PollIntervalSec,
        [string]$StdOutPath,
        [string]$StdErrPath
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)

    while ((Get-Date) -lt $deadline) {
        $Process.Refresh()
        if ($Process.HasExited) {
            throw (Get-ProcessFailureDetails -Name $Name -Process $Process -StdOutPath $StdOutPath -StdErrPath $StdErrPath)
        }

        foreach ($url in $Urls) {
            try {
                $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 5 -UseBasicParsing
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                    return $url
                }
            }
            catch {
            }
        }

        Start-Sleep -Seconds $PollIntervalSec
    }

    throw "Timeout aguardando $Name ficar pronto. URLs testadas: $($Urls -join ', ')"
}

function Stop-ProcessTree {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$Name
    )

    if ($null -eq $Process) {
        return
    }

    try {
        $Process.Refresh()
    }
    catch {
        return
    }

    if ($Process.HasExited) {
        return
    }

    Write-Host "Encerrando $Name (PID $($Process.Id)) ..."
    & taskkill /PID $Process.Id /T /F | Out-Null
}

function New-FrontendCommand {
    param(
        [string]$RepoRoot,
        [string]$FrontendScript,
        [string]$ApiUrl,
        [int]$Port
    )

    $safeRepoRoot = $RepoRoot.Replace("'", "''")
    $safeFrontendScript = $FrontendScript.Replace("'", "''")
    $safeApiUrl = $ApiUrl.Replace("'", "''")

@"
Set-Location '$safeRepoRoot'
`$env:VITE_API_URL = '$safeApiUrl'
function global:serve {
    param([Parameter(ValueFromRemainingArguments=`$true)] [string[]]`$IgnoredArgs)
    npx --yes serve -s dist -l $Port
}
& '$safeFrontendScript'
"@
}

$backendProcess = $null
$frontendProcess = $null
$ctrlCSubscription = $null
$exitCode = 0
$global:RunAppStopRequested = $false

try {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    Set-Location $repoRoot

    $backendScript = Join-Path $PSScriptRoot "run_backend_prod.ps1"
    $frontendScript = Join-Path $PSScriptRoot "run_frontend_prod.ps1"

    Write-Step "Validando scripts e preparando logs"
    if (-not (Test-Path $backendScript)) {
        throw "Arquivo nao encontrado: $backendScript"
    }
    if (-not (Test-Path $frontendScript)) {
        throw "Arquivo nao encontrado: $frontendScript"
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logDir = Join-Path $env:TEMP "pixel-perfect-launcher"
    New-Item -Path $logDir -ItemType Directory -Force | Out-Null

    $backendOutLog = Join-Path $logDir "backend-$timestamp.out.log"
    $backendErrLog = Join-Path $logDir "backend-$timestamp.err.log"
    $frontendOutLog = Join-Path $logDir "frontend-$timestamp.out.log"
    $frontendErrLog = Join-Path $logDir "frontend-$timestamp.err.log"

    $ctrlCSubscription = Register-ObjectEvent -InputObject ([Console]) -EventName CancelKeyPress -SourceIdentifier "run_app_prod_ctrl_c" -Action {
        $event.SourceEventArgs.Cancel = $true
        $global:RunAppStopRequested = $true
    }

    Write-Step "Iniciando backend em http://127.0.0.1:$BackendPort (sem reload)"
    $backendArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $backendScript,
        "-Port", $BackendPort,
        "-Workers", $BackendWorkers
    )
    $backendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $backendArgs -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog
    Write-Host "Backend PID: $($backendProcess.Id)"

    Write-Step "Aguardando backend responder (health/docs)"
    $backendReadyUrl = Wait-HttpReady -Name "Backend" -Urls @(
        "http://127.0.0.1:$BackendPort/health",
        "http://127.0.0.1:$BackendPort/docs"
    ) -Process $backendProcess -TimeoutSec $BackendTimeoutSec -PollIntervalSec $PollIntervalSec -StdOutPath $backendOutLog -StdErrPath $backendErrLog
    Write-Host "Backend pronto em: $backendReadyUrl"

    $apiUrl = "http://127.0.0.1:$BackendPort"
    Write-Step "Definindo VITE_API_URL=$apiUrl para o frontend"
    $env:VITE_API_URL = $apiUrl

    Write-Step "Iniciando frontend (build + serve) em http://127.0.0.1:$FrontendPort"
    $frontendCommand = New-FrontendCommand -RepoRoot $repoRoot -FrontendScript $frontendScript -ApiUrl $apiUrl -Port $FrontendPort
    $frontendArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", $frontendCommand
    )
    $frontendProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $frontendArgs -WorkingDirectory $repoRoot -PassThru -RedirectStandardOutput $frontendOutLog -RedirectStandardError $frontendErrLog
    Write-Host "Frontend PID: $($frontendProcess.Id)"

    Write-Step "Aguardando frontend responder"
    $frontendUrl = "http://127.0.0.1:$FrontendPort"
    $frontendReadyUrl = Wait-HttpReady -Name "Frontend" -Urls @($frontendUrl) -Process $frontendProcess -TimeoutSec $FrontendTimeoutSec -PollIntervalSec $PollIntervalSec -StdOutPath $frontendOutLog -StdErrPath $frontendErrLog
    Write-Host "Frontend pronto em: $frontendReadyUrl"

    Write-Step "Abrindo navegador"
    Start-Process $frontendUrl
    Write-Host ""
    Write-Host "AGORA ABRA: $frontendUrl"
    Write-Host "Pressione Ctrl+C para encerrar backend e frontend."
    Write-Host "Logs:"
    Write-Host "  backend out: $backendOutLog"
    Write-Host "  backend err: $backendErrLog"
    Write-Host "  frontend out: $frontendOutLog"
    Write-Host "  frontend err: $frontendErrLog"

    Write-Step "Monitorando processos"
    while ($true) {
        if ($global:RunAppStopRequested) {
            Write-Host ""
            Write-Host "Ctrl+C recebido. Encerrando tudo..."
            break
        }

        $backendProcess.Refresh()
        $frontendProcess.Refresh()

        if ($backendProcess.HasExited) {
            throw (Get-ProcessFailureDetails -Name "Backend" -Process $backendProcess -StdOutPath $backendOutLog -StdErrPath $backendErrLog)
        }
        if ($frontendProcess.HasExited) {
            throw (Get-ProcessFailureDetails -Name "Frontend" -Process $frontendProcess -StdOutPath $frontendOutLog -StdErrPath $frontendErrLog)
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "[ERRO] $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Stop-ProcessTree -Process $frontendProcess -Name "frontend"
    Stop-ProcessTree -Process $backendProcess -Name "backend"

    if ($ctrlCSubscription) {
        Unregister-Event -SourceIdentifier "run_app_prod_ctrl_c" -ErrorAction SilentlyContinue
        Remove-Job -Id $ctrlCSubscription.Id -Force -ErrorAction SilentlyContinue
    }

    $global:RunAppStopRequested = $false
}

exit $exitCode
