# agent_win_offline_proof.ps1 - Test Windows agent offline resilience
param(
    [string]$ApiBase = "http://127.0.0.1:9999",
    [string]$TestDuration = 300  # 5 minutes
)

$ErrorActionPreference = "Stop"

function Write-Ok { Write-Host "[ok] $args" -ForegroundColor Green }
function Write-Fail { 
    Write-Host "[fail] $args" -ForegroundColor Red
    exit 1
}

# Check prerequisites
if (-not (Get-Service "SIEMAgent" -ErrorAction SilentlyContinue)) {
    Write-Fail "SIEMAgent service not installed"
}

# Get initial event count
$headers = @{ "Content-Type" = "application/json" }
$initialResponse = Invoke-RestMethod -Uri "$ApiBase/api/v2/admin/metrics/events" -Method Get -Headers $headers
$initialCount = $initialResponse.count

Write-Ok "Initial event count: $initialCount"

# Generate test events
Write-Host "Generating 1000 test events..."
$service = Get-Service "SIEMAgent"
$spoolPath = "C:\ProgramData\SIEM\spool"

# Track spool size before
$spoolSizeBefore = (Get-ChildItem $spoolPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

# Send events via Windows Event Log (agent should pick these up)
for ($i = 1; $i -le 1000; $i++) {
    $eventMessage = "Test event $i from Windows offline proof at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-EventLog -LogName Application -Source "SIEMAgent" -EventID 1000 -EntryType Information -Message $eventMessage
    
    if ($i % 100 -eq 0) {
        Write-Host "Generated $i events..."
    }
}

Write-Ok "Generated 1000 test events"
Start-Sleep -Seconds 5

# Block network egress (Windows Firewall)
Write-Host "Blocking network egress..."
$ruleName = "SIEM_TEST_BLOCK_EGRESS"
New-NetFirewallRule -DisplayName $ruleName -Direction Outbound -RemoteAddress $ApiBase.Split("//")[1].Split(":")[0] -Action Block -ErrorAction SilentlyContinue

Write-Ok "Network blocked, waiting 30 seconds..."
Start-Sleep -Seconds 30

# Check spool growth
$spoolSizeDuring = (Get-ChildItem $spoolPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$spoolGrowth = $spoolSizeDuring - $spoolSizeBefore
Write-Ok "Spool grew by $([math]::Round($spoolGrowth, 2)) MB during disconnect"

# Unblock network
Write-Host "Restoring network connectivity..."
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

Write-Ok "Network restored, waiting for agent to flush spool..."
Start-Sleep -Seconds 60

# Check final count
$finalResponse = Invoke-RestMethod -Uri "$ApiBase/api/v2/admin/metrics/events" -Method Get -Headers $headers
$finalCount = $finalResponse.count
$eventsIngested = $finalCount - $initialCount

# Check spool shrinkage
$spoolSizeAfter = (Get-ChildItem $spoolPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$spoolShrink = $spoolSizeDuring - $spoolSizeAfter

# Generate report
$report = @"
Windows Agent Offline Proof Report
==================================
Initial event count: $initialCount
Final event count: $finalCount
Events generated: 1000
Events ingested: $eventsIngested
Data loss: $(1000 - $eventsIngested)

Spool Metrics:
- Size before: $([math]::Round($spoolSizeBefore, 2)) MB
- Size during disconnect: $([math]::Round($spoolSizeDuring, 2)) MB
- Size after reconnect: $([math]::Round($spoolSizeAfter, 2)) MB
- Growth during disconnect: $([math]::Round($spoolGrowth, 2)) MB
- Shrinkage after reconnect: $([math]::Round($spoolShrink, 2)) MB

Result: $(if ($eventsIngested -eq 1000) { "PASS - Zero data loss" } else { "FAIL - Lost $($1000 - $eventsIngested) events" })
"@

$report | Out-File -FilePath ".\target\test-artifacts\agent_win_offline_report.txt"
Write-Host $report

# Create TSV for gate validation
"$eventsIngested" | Out-File -FilePath ".\target\test-artifacts\events_count.tsv"

if ($eventsIngested -ne 1000) {
    Write-Fail "Data loss detected: expected 1000, got $eventsIngested"
}

Write-Ok "Windows agent offline proof PASS - Zero data loss"
