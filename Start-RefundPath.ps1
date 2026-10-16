param([switch]$Setup, [switch]$Dev)
$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
try { $existingApi = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 1 } catch { $existingApi = $null }
if ($existingApi.product -eq 'RefundPath') {
    Write-Output 'RefundPath is already running at http://127.0.0.1:8000 . Stop it before setup or changing modes.'
    return
}
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8000 is occupied by another application. It was preserved.'
}
$pythonPath = Join-Path $repoRoot '.venv\Scripts\python.exe'
$taskTemp = Join-Path $repoRoot '.tmp'
New-Item -ItemType Directory -Path $taskTemp -Force | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.env'))) {
    Copy-Item -LiteralPath (Join-Path $repoRoot '.env.example') -Destination (Join-Path $repoRoot '.env')
}
if (-not (Test-Path -LiteralPath $pythonPath)) {
    & python -m venv (Join-Path $repoRoot '.venv')
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.12 or 3.13 and retry.' }
    $Setup = $true
}
if ($Setup) {
    & $pythonPath -m pip install -r (Join-Path $repoRoot 'backend\requirements-refundpath-dev.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
    Push-Location (Join-Path $repoRoot 'frontend')
    try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm installation failed.' } }
    finally { Pop-Location }
}
if ($Dev -and -not (Test-Path -LiteralPath (Join-Path $repoRoot 'frontend\node_modules\vite'))) {
    throw 'Run .\Start-RefundPath.ps1 -Setup to install the frontend dependencies.'
}
if (-not $Dev -and -not (Test-Path -LiteralPath (Join-Path $repoRoot 'frontend\dist\index.html'))) {
    throw 'Run npm run build in frontend first, or use -Dev after dependency setup.'
}
$apiProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--no-access-log') -WorkingDirectory (Join-Path $repoRoot 'backend') -WindowStyle Hidden -PassThru
$records = @(@{ id = $apiProcess.Id; executable = $apiProcess.Path; started_ticks = $apiProcess.StartTime.ToUniversalTime().Ticks })
if ($Dev) {
    $nodePath = (Get-Command node.exe).Source
    $uiProcess = Start-Process -FilePath $nodePath -ArgumentList @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory (Join-Path $repoRoot 'frontend') -WindowStyle Hidden -PassThru
    $records += @{ id = $uiProcess.Id; executable = $uiProcess.Path; started_ticks = $uiProcess.StartTime.ToUniversalTime().Ticks }
    Write-Output 'RefundPath development UI is starting at http://127.0.0.1:5173 .'
} else {
    Write-Output 'RefundPath is starting at http://127.0.0.1:8000 .'
}
Write-Output 'Processes run locally with no real submissions. The default serves the production build directly from the API.'
$records | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskTemp 'refundpath-processes.json') -Encoding utf8
Write-Output 'Use .\Stop-RefundPath.ps1 to stop these background processes.'
