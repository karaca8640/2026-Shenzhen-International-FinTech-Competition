$ErrorActionPreference = 'Stop'
$recordPath = Join-Path $PSScriptRoot '.tmp\refundpath-processes.json'
if (-not (Test-Path -LiteralPath $recordPath)) { Write-Output 'No RefundPath process record found.'; return }
$records = @(Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json)
foreach ($record in $records) {
    $ownedProcess = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    if ($null -ne $ownedProcess -and $ownedProcess.Path -eq $record.executable -and $ownedProcess.StartTime.ToUniversalTime().Ticks -eq $record.started_ticks) {
        # Windows virtualenv launchers may start a child Python process.
        $processSnapshot = @(Get-CimInstance Win32_Process)
        $descendants = [System.Collections.Generic.List[int]]::new()
        $descendants.Add($ownedProcess.Id)
        for ($index = 0; $index -lt $descendants.Count; $index++) {
            foreach ($child in $processSnapshot | Where-Object { $_.ParentProcessId -eq $descendants[$index] }) {
                if (-not $descendants.Contains([int]$child.ProcessId)) { $descendants.Add([int]$child.ProcessId) }
            }
        }
        for ($index = $descendants.Count - 1; $index -gt 0; $index--) {
            Stop-Process -Id $descendants[$index] -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue
    }
}
Remove-Item -LiteralPath $recordPath
Write-Output 'Recorded RefundPath processes stopped.'
