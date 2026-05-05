# scripts/kill-docs-servers.ps1
#
# Kill orphaned dendrite-wiki-mcp dev servers on Windows.
#
# Hits processes that match either of:
#   - listening on a project-configured port (5177 docs:dev, 4177 docs:preview, 5417 standalone bridge)
#   - command line contains 'vitepress' AND ('dev' OR 'preview') AND a path under this repo
#   - command line contains 'review-bridge' (tsx scripts/review-bridge.ts) AND a path under this repo
#
# It will NOT touch Claude Code, your IDE, or unrelated Node processes — the matching is scoped to
# this repo's working tree, and command-line and port checks are required, not heuristic.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/kill-docs-servers.ps1
#   npm run docs:kill
#
# Exit codes: 0 if nothing matched OR all matches killed cleanly; 1 if any kill failed.

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectRootLower = $projectRoot.ToLower()
$watchedPorts = @(5177, 4177, 5417)
$matches = @{}

function Add-Match {
    param([int]$ProcessId, [string]$Reason)
    if ($ProcessId -le 0) { return }
    if (-not $matches.ContainsKey($ProcessId)) {
        $matches[$ProcessId] = [pscustomobject]@{
            ProcessId = $ProcessId
            Reasons   = New-Object System.Collections.ArrayList
        }
    }
    [void]$matches[$ProcessId].Reasons.Add($Reason)
}

# 1. Find anything listening on the watched ports. Get-NetTCPConnection throws when nothing
# matches (which is the common case), so wrap in try/catch and silence the no-match path
# specifically — only surface true unexpected failures.
foreach ($port in $watchedPorts) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
        foreach ($connection in $connections) {
            Add-Match -ProcessId $connection.OwningProcess -Reason "listening on :$port"
        }
    } catch {
        $message = if ($_.Exception) { $_.Exception.Message } else { "$_" }
        if ($message -notlike '*No matching*') {
            Write-Host "Warning: could not query port ${port}: $message" -ForegroundColor DarkYellow
        }
    }
}

# 2. Find Node processes with command lines that match this project's dev/bridge servers.
$candidates = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
foreach ($proc in $candidates) {
    if ([string]::IsNullOrEmpty($proc.CommandLine)) { continue }
    $cmd = $proc.CommandLine.ToLower()

    $touchesProject = $cmd.Contains($projectRootLower)
    $isVitepressServer = ($cmd.Contains('vitepress') -and ($cmd.Contains(' dev') -or $cmd.Contains(' preview')))
    $isReviewBridge = $cmd.Contains('review-bridge')

    if ($touchesProject -and ($isVitepressServer -or $isReviewBridge)) {
        $reason = if ($isVitepressServer) { 'vitepress dev/preview server' } else { 'review-bridge' }
        Add-Match -ProcessId ([int]$proc.ProcessId) -Reason $reason
    }
}

if ($matches.Count -eq 0) {
    Write-Host 'No dendrite-wiki-mcp dev/bridge processes found.' -ForegroundColor Green
    exit 0
}

Write-Host ''
Write-Host "Found $($matches.Count) process(es) to kill:" -ForegroundColor Yellow
$sortedMatches = $matches.Values | Sort-Object -Property ProcessId
foreach ($entry in $sortedMatches) {
    $proc = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
    $name = if ($null -ne $proc) { $proc.ProcessName } else { '<already exited>' }
    $reasons = ($entry.Reasons | Sort-Object -Unique) -join ', '
    Write-Host ("  PID {0,6}  {1,-12}  {2}" -f $entry.ProcessId, $name, $reasons)
}
Write-Host ''

$failures = 0
foreach ($entry in $sortedMatches) {
    try {
        Stop-Process -Id $entry.ProcessId -Force -ErrorAction Stop
        Write-Host ("  killed PID {0}" -f $entry.ProcessId) -ForegroundColor Green
    } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
        # Process already exited between discovery and kill — fine.
        Write-Host ("  PID {0} already exited" -f $entry.ProcessId) -ForegroundColor DarkGray
    } catch {
        Write-Host ("  failed to kill PID {0}: {1}" -f $entry.ProcessId, $_.Exception.Message) -ForegroundColor Red
        $failures++
    }
}

Write-Host ''
if ($failures -gt 0) {
    Write-Host "$failures process(es) could not be killed. Try running this script in an elevated PowerShell window." -ForegroundColor Red
    exit 1
}

Write-Host 'All matched processes killed.' -ForegroundColor Green
exit 0
