# agent_offline_spool_proof.ps1 - Production-grade offline resilience test
param(
    [string]$ApiBase = "http://127.0.0.1:9999",
    [int]$EventCount = 10000,
    [int]$EventsPerSecond = 200,
    [int]$OutageDurationMinutes = 5
)

$ErrorActionPreference = "Stop"

# Test configuration
$sourceId = "win-offline-test-$(Get-Date -Format 'yyyyMMddHHmmss')"
$tenantId = 1
$spoolPath = "C:\ProgramData\SIEM\spool"

# Initialize metrics
$metrics = @{
    StartTime = Get-Date
    EventsGenerated = 0
    EventsSent = 0
    EventsFailed = 0
    SpoolSizeStart = 0
    SpoolSizePeak = 0
    SpoolSizeEnd = 0
    CpuSamples = @()
    MemorySamples = @()
}

function Write-TestLog {
    param($Message, $Level = "Info")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $color = switch ($Level) {
        "Error" { "Red" }
        "Warning" { "Yellow" }
        "Success" { "Green" }
        default { "White" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Get-SpoolSize {
    if (Test-Path $spoolPath) {
        $size = (Get-ChildItem $spoolPath -Recurse -ErrorAction SilentlyContinue | 
                 Measure-Object -Property Length -Sum).Sum
        return [math]::Round($size / 1MB, 2)
    }
    return 0
}

function Get-ProcessMetrics {
    $proc = Get-Process -Name "vector" -ErrorAction SilentlyContinue
    if ($proc) {
        return @{
            CPU = [math]::Round($proc.CPU, 2)
            WorkingSetMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
            ThreadCount = $proc.Threads.Count
        }
    }
    return $null
}

function Send-SequencedEvent {
    param([int]$Sequence)
    
    $event = @{
        tenant_id = $tenantId
        source_id = $sourceId
        source_seq = $Sequence
        source_type = "windows_agent"
        event_timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        message = "Offline test event seq=$Sequence at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')"
        hostname = $env:COMPUTERNAME
        severity = "info"
    }
    
    # Log to Windows Event Log (agent should pick this up)
    $eventXml = "<Event><System><EventID>1000</EventID><Level>4</Level><Task>0</Task><Keywords>0x80000000000000</Keywords></System><EventData><Data>$($event | ConvertTo-Json -Compress)</Data></EventData></Event>"
    
    Write-EventLog -LogName Application -Source "SIEMAgent" -EventID 1000 -EntryType Information -Message ($event | ConvertTo-Json -Compress)
    
    return $event
}

function Update-Ledger {
    param($TenantId, $SourceId, $Seq, $Status = "accepted")
    
    $ledgerInsert = @"
INSERT INTO dev.agent_ingest_ledger (tenant_id, source_id, seq, status) 
VALUES ($TenantId, '$SourceId', $Seq, '$Status')
"@
    
    & clickhouse-client --query $ledgerInsert 2>$null
}

Write-TestLog "=== Windows Agent Offline Spool Test ===" "Success"
Write-TestLog "Configuration:"
Write-TestLog "  Events: $EventCount at $EventsPerSecond EPS"
Write-TestLog "  Outage: $OutageDurationMinutes minutes"
Write-TestLog "  Source ID: $sourceId"

# Get initial metrics
$metrics.SpoolSizeStart = Get-SpoolSize
Write-TestLog "Initial spool size: $($metrics.SpoolSizeStart) MB"

# Create firewall rule name
$firewallRuleName = "SIEM_OFFLINE_TEST_$(Get-Random)"

# Phase 1: Generate events before outage (10% of total)
$phase1Count = [int]($EventCount * 0.1)
Write-TestLog "Phase 1: Generating $phase1Count events before outage..."

for ($i = 1; $i -le $phase1Count; $i++) {
    Send-SequencedEvent -Sequence $i | Out-Null
    Update-Ledger -TenantId $tenantId -SourceId $sourceId -Seq $i
    $metrics.EventsGenerated++
    
    if ($i % 100 -eq 0) {
        Write-TestLog "  Generated $i/$phase1Count events"
    }
    
    # Throttle to match EPS
    Start-Sleep -Milliseconds ([int](1000 / $EventsPerSecond))
}

# Verify Phase 1 delivery
Start-Sleep -Seconds 5
$phase1Delivered = & clickhouse-client --query "SELECT count() FROM dev.events WHERE source_id = '$sourceId' AND source_seq <= $phase1Count" 2>$null
Write-TestLog "Phase 1 delivered: $phase1Delivered/$phase1Count events"

# Phase 2: Block network and continue generating
Write-TestLog "Phase 2: Blocking network egress..."
New-NetFirewallRule -DisplayName $firewallRuleName `
                    -Direction Outbound `
                    -RemoteAddress ($ApiBase -replace 'https?://', '' -replace ':\d+', '') `
                    -RemotePort 9999 `
                    -Action Block `
                    -Protocol TCP | Out-Null

Write-TestLog "Network blocked. Generating remaining events during outage..."

# Start monitoring thread
$monitorJob = Start-Job -ScriptBlock {
    param($spoolPath, $sourceId)
    
    $samples = @()
    while ($true) {
        $sample = @{
            Timestamp = Get-Date
            SpoolSizeMB = if (Test-Path $spoolPath) { 
                (Get-ChildItem $spoolPath -Recurse -ErrorAction SilentlyContinue | 
                 Measure-Object -Property Length -Sum).Sum / 1MB 
            } else { 0 }
            ProcessCPU = 0
            ProcessMemoryMB = 0
        }
        
        $proc = Get-Process -Name "vector" -ErrorAction SilentlyContinue
        if ($proc) {
            $sample.ProcessCPU = [math]::Round($proc.CPU, 2)
            $sample.ProcessMemoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
        }
        
        $samples += $sample
        Start-Sleep -Seconds 5
    }
} -ArgumentList $spoolPath, $sourceId

# Generate events during outage
$outageStartTime = Get-Date
$outageEndTime = $outageStartTime.AddMinutes($OutageDurationMinutes)

while ((Get-Date) -lt $outageEndTime -and $metrics.EventsGenerated -lt $EventCount) {
    $seq = $metrics.EventsGenerated + 1
    Send-SequencedEvent -Sequence $seq | Out-Null
    Update-Ledger -TenantId $tenantId -SourceId $sourceId -Seq $seq
    $metrics.EventsGenerated++
    
    if ($seq % 1000 -eq 0) {
        $spoolSize = Get-SpoolSize
        $metrics.SpoolSizePeak = [math]::Max($metrics.SpoolSizePeak, $spoolSize)
        $processMetrics = Get-ProcessMetrics
        
        Write-TestLog "  Generated $seq/$EventCount | Spool: $spoolSize MB | CPU: $($processMetrics.CPU)% | Mem: $($processMetrics.WorkingSetMB) MB"
    }
    
    # Throttle to match EPS
    Start-Sleep -Milliseconds ([int](1000 / $EventsPerSecond))
}

# Stop monitoring
Stop-Job $monitorJob
$monitoringSamples = Receive-Job $monitorJob
Remove-Job $monitorJob

# Get peak spool size during outage
$metrics.SpoolSizePeak = ($monitoringSamples | Measure-Object -Property SpoolSizeMB -Maximum).Maximum

Write-TestLog "Outage complete. Peak spool size: $($metrics.SpoolSizePeak) MB"

# Phase 3: Restore network and measure flush time
Write-TestLog "Phase 3: Restoring network connectivity..."
Remove-NetFirewallRule -DisplayName $firewallRuleName

$flushStartTime = Get-Date

# Monitor flush progress
$previousCount = 0
$stableIterations = 0
$maxWaitMinutes = 3

while ($stableIterations -lt 6 -and (Get-Date).Subtract($flushStartTime).TotalMinutes -lt $maxWaitMinutes) {
    Start-Sleep -Seconds 10
    
    $currentCount = & clickhouse-client --query "SELECT count() FROM dev.events WHERE source_id = '$sourceId'" 2>$null
    $spoolSize = Get-SpoolSize
    $processMetrics = Get-ProcessMetrics
    
    Write-TestLog "  Delivered: $currentCount/$($metrics.EventsGenerated) | Spool: $spoolSize MB | CPU: $($processMetrics.CPU)% | Mem: $($processMetrics.WorkingSetMB) MB"
    
    if ($currentCount -eq $previousCount) {
        $stableIterations++
    } else {
        $stableIterations = 0
    }
    
    $previousCount = $currentCount
    
    # Record metrics
    if ($processMetrics) {
        $metrics.CpuSamples += $processMetrics.CPU
        $metrics.MemorySamples += $processMetrics.WorkingSetMB
    }
}

$flushDuration = (Get-Date).Subtract($flushStartTime).TotalSeconds
$metrics.SpoolSizeEnd = Get-SpoolSize

# Final verification
Write-TestLog "Performing final verification..."

# Check ledger gaps
$gaps = & clickhouse-client --query @"
SELECT count() as gap_count
FROM dev.ledger_missing
WHERE tenant_id = $tenantId AND source_id = '$sourceId'
"@ 2>$null

# Get final counts
$finalStats = & clickhouse-client --query @"
SELECT 
    count() as events_delivered,
    max(source_seq) as max_seq,
    count(DISTINCT source_seq) as unique_seqs
FROM dev.events
WHERE source_id = '$sourceId'
FORMAT JSON
"@ 2>$null | ConvertFrom-Json

# Calculate metrics
$metrics.EventsSent = $finalStats.data.events_delivered
$metrics.EventsFailed = $metrics.EventsGenerated - $metrics.EventsSent
$metrics.EndTime = Get-Date
$metrics.TotalDuration = $metrics.EndTime.Subtract($metrics.StartTime).TotalMinutes
$metrics.FlushDurationSeconds = $flushDuration
$metrics.DataLossCount = $metrics.EventsFailed
$metrics.DuplicateCount = $finalStats.data.events_delivered - $finalStats.data.unique_seqs

# Performance metrics
$metrics.AvgCpuPercent = if ($metrics.CpuSamples.Count -gt 0) { 
    [math]::Round(($metrics.CpuSamples | Measure-Object -Average).Average, 2) 
} else { 0 }

$metrics.MaxMemoryMB = if ($metrics.MemorySamples.Count -gt 0) { 
    [math]::Round(($metrics.MemorySamples | Measure-Object -Maximum).Maximum, 2) 
} else { 0 }

# Generate artifacts
$artifactPath = ".\target\test-artifacts\win"
New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null

# Save metrics
$metrics | ConvertTo-Json -Depth 3 | Out-File "$artifactPath\spool_profile.json" -Encoding UTF8

# Save TSV for gate validation
@"
metric	value
events_generated	$($metrics.EventsGenerated)
events_delivered	$($metrics.EventsSent)
data_loss_count	$($metrics.DataLossCount)
duplicate_count	$($metrics.DuplicateCount)
spool_size_peak_mb	$($metrics.SpoolSizePeak)
flush_duration_sec	$($metrics.FlushDurationSeconds)
avg_cpu_percent	$($metrics.AvgCpuPercent)
max_memory_mb	$($metrics.MaxMemoryMB)
"@ | Out-File "$artifactPath\spool_metrics.tsv" -Encoding UTF8

# Performance profile
@"
timestamp	cpu_percent	memory_mb	spool_mb
"@ | Out-File "$artifactPath\cpu_mem_profile.tsv" -Encoding UTF8

foreach ($sample in $monitoringSamples) {
    "$($sample.Timestamp.ToString('yyyy-MM-dd HH:mm:ss'))	$($sample.ProcessCPU)	$($sample.ProcessMemoryMB)	$($sample.SpoolSizeMB)" |
        Add-Content "$artifactPath\cpu_mem_profile.tsv"
}

# Summary report
Write-TestLog "`n=== Offline Spool Test Summary ===" "Success"
Write-TestLog "Events Generated: $($metrics.EventsGenerated)"
Write-TestLog "Events Delivered: $($metrics.EventsSent)"
Write-TestLog "Data Loss: $($metrics.DataLossCount) events"
Write-TestLog "Duplicates: $($metrics.DuplicateCount) events"
Write-TestLog "Spool Peak: $($metrics.SpoolSizePeak) MB"
Write-TestLog "Flush Time: $([math]::Round($flushDuration, 1)) seconds"
Write-TestLog "Avg CPU: $($metrics.AvgCpuPercent)%"
Write-TestLog "Max Memory: $($metrics.MaxMemoryMB) MB"

# Validate against requirements
$passed = $true
$failures = @()

if ($metrics.DataLossCount -gt 0) {
    $failures += "Data loss detected: $($metrics.DataLossCount) events"
    $passed = $false
}

if ($flushDuration -gt 180) {
    $failures += "Flush time exceeded 180s: $([math]::Round($flushDuration, 1))s"
    $passed = $false
}

if ($metrics.SpoolSizePeak -gt 2048) {
    $failures += "Spool size exceeded 2GB: $($metrics.SpoolSizePeak) MB"
    $passed = $false
}

if ($metrics.AvgCpuPercent -gt 30) {
    $failures += "CPU exceeded 30%: $($metrics.AvgCpuPercent)%"
    $passed = $false
}

if ($metrics.MaxMemoryMB -gt 250) {
    $failures += "Memory exceeded 250MB: $($metrics.MaxMemoryMB) MB"
    $passed = $false
}

if ($passed) {
    Write-TestLog "`n[PASS] All requirements met" "Success"
    exit 0
} else {
    Write-TestLog "`n[FAIL] Requirements not met:" "Error"
    foreach ($failure in $failures) {
        Write-TestLog "  - $failure" "Error"
    }
    exit 1
}
