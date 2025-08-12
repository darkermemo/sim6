# agent_perf_proof.ps1 - Windows agent performance and resource validation
param(
    [string]$ApiBase = "http://127.0.0.1:9999",
    [int]$TargetEPS = 2000,
    [int]$BurstEPS = 5000,
    [int]$TestDurationMinutes = 5,
    [int]$BurstDurationSeconds = 60
)

$ErrorActionPreference = "Stop"

# Performance requirements
$requirements = @{
    MaxCpuPercent = 25
    MaxMemoryMB = 250
    MaxSpoolGB = 2
    MinAcceptanceRate = 0.95
    MaxP95LatencyMs = 300
}

# Test setup
$sourceId = "win-perf-test-$(Get-Date -Format 'yyyyMMddHHmmss')"
$tenantId = 1

# Metrics collection
$metrics = @{
    StartTime = Get-Date
    CpuSamples = @()
    MemorySamples = @()
    LatencySamples = @()
    EventsSent = 0
    EventsAccepted = 0
    EventsThrottled = 0
    Errors = @()
}

function Write-PerfLog {
    param($Message, $Level = "Info")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $color = switch ($Level) {
        "Error" { "Red" }
        "Warning" { "Yellow" }
        "Success" { "Green" }
        "Metric" { "Cyan" }
        default { "White" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Start-PerformanceMonitor {
    param($Duration)
    
    $job = Start-Job -ScriptBlock {
        param($duration)
        
        $endTime = (Get-Date).AddSeconds($duration)
        $samples = @()
        
        while ((Get-Date) -lt $endTime) {
            $sample = @{
                Timestamp = Get-Date
                CpuPercent = 0
                MemoryMB = 0
                HandleCount = 0
                ThreadCount = 0
                DiskIOMBps = 0
            }
            
            # Get process metrics
            $proc = Get-Process -Name "vector" -ErrorAction SilentlyContinue
            if ($proc) {
                # CPU calculation (requires two samples)
                $cpu1 = $proc.TotalProcessorTime.TotalMilliseconds
                Start-Sleep -Milliseconds 500
                $proc.Refresh()
                $cpu2 = $proc.TotalProcessorTime.TotalMilliseconds
                $cpuPercent = (($cpu2 - $cpu1) / 500) * 100 / [Environment]::ProcessorCount
                
                $sample.CpuPercent = [math]::Round($cpuPercent, 2)
                $sample.MemoryMB = [math]::Round($proc.WorkingSet64 / 1MB, 2)
                $sample.HandleCount = $proc.HandleCount
                $sample.ThreadCount = $proc.Threads.Count
            }
            
            # Disk I/O (simplified)
            $diskCounter = Get-Counter "\Process(vector)\IO Data Bytes/sec" -ErrorAction SilentlyContinue
            if ($diskCounter) {
                $sample.DiskIOMBps = [math]::Round($diskCounter.CounterSamples[0].CookedValue / 1MB, 2)
            }
            
            $samples += $sample
            Start-Sleep -Seconds 1
        }
        
        return $samples
    } -ArgumentList $Duration
    
    return $job
}

function Send-BurstEvents {
    param($EPS, $Duration)
    
    Write-PerfLog "Starting burst: $EPS EPS for $Duration seconds" "Metric"
    
    $endTime = (Get-Date).AddSeconds($Duration)
    $eventInterval = 1000 / $EPS
    $batchSize = [math]::Min(100, $EPS / 10)
    $sentCount = 0
    
    while ((Get-Date) -lt $endTime) {
        $batchStart = Get-Date
        $events = @()
        
        # Build batch
        for ($i = 0; $i -lt $batchSize; $i++) {
            $seq = $script:metrics.EventsSent + 1
            $events += @{
                tenant_id = $tenantId
                source_id = $sourceId
                source_seq = $seq
                source_type = "windows_perf_test"
                event_timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
                message = "Performance test event seq=$seq burst=$EPS"
                hostname = $env:COMPUTERNAME
                test_batch = [Guid]::NewGuid().ToString()
            }
            $script:metrics.EventsSent++
        }
        
        # Send batch with timing
        $sendStart = Get-Date
        try {
            $response = Invoke-WebRequest -Uri "$ApiBase/api/v2/ingest/ndjson" `
                                        -Method POST `
                                        -ContentType "application/x-ndjson" `
                                        -Body ($events | ForEach-Object { $_ | ConvertTo-Json -Compress }) `
                                        -UseBasicParsing `
                                        -TimeoutSec 5
            
            $latencyMs = (Get-Date).Subtract($sendStart).TotalMilliseconds
            $script:metrics.LatencySamples += $latencyMs
            
            if ($response.StatusCode -eq 200) {
                $result = $response.Content | ConvertFrom-Json
                $script:metrics.EventsAccepted += $result.accepted
                $script:metrics.EventsThrottled += $result.throttled
                $sentCount += $batchSize
            }
        }
        catch {
            $script:metrics.Errors += @{
                Timestamp = Get-Date
                Error = $_.Exception.Message
                StatusCode = $_.Exception.Response.StatusCode.value__
            }
            
            if ($_.Exception.Response.StatusCode.value__ -eq 429) {
                $script:metrics.EventsThrottled += $batchSize
                Write-PerfLog "Rate limited (429)" "Warning"
                Start-Sleep -Seconds 1
            }
        }
        
        # Maintain target rate
        $batchDuration = (Get-Date).Subtract($batchStart).TotalMilliseconds
        $targetDuration = $batchSize * $eventInterval
        if ($batchDuration -lt $targetDuration) {
            Start-Sleep -Milliseconds ([int]($targetDuration - $batchDuration))
        }
        
        # Progress update
        if ($sentCount % 1000 -eq 0) {
            Write-PerfLog "  Sent: $sentCount | Accepted: $($script:metrics.EventsAccepted) | Throttled: $($script:metrics.EventsThrottled)"
        }
    }
    
    Write-PerfLog "Burst complete. Sent: $sentCount events" "Metric"
}

# Test execution
Write-PerfLog "=== Windows Agent Performance Test ===" "Success"
Write-PerfLog "Configuration:"
Write-PerfLog "  Sustained: $TargetEPS EPS for $TestDurationMinutes minutes"
Write-PerfLog "  Burst: $BurstEPS EPS for $BurstDurationSeconds seconds"
Write-PerfLog "  Requirements: CPU<$($requirements.MaxCpuPercent)%, Mem<$($requirements.MaxMemoryMB)MB, P95<$($requirements.MaxP95LatencyMs)ms"

# Phase 1: Warm-up (10% rate for 30s)
Write-PerfLog "`nPhase 1: Warm-up" "Metric"
$warmupMonitor = Start-PerformanceMonitor -Duration 30
Send-BurstEvents -EPS ([int]($TargetEPS * 0.1)) -Duration 30
Stop-Job $warmupMonitor
$warmupSamples = Receive-Job $warmupMonitor
Remove-Job $warmupMonitor

# Phase 2: Sustained load
Write-PerfLog "`nPhase 2: Sustained load ($TargetEPS EPS)" "Metric"
$sustainedMonitor = Start-PerformanceMonitor -Duration ($TestDurationMinutes * 60)
$sustainedStart = Get-Date

for ($minute = 1; $minute -le $TestDurationMinutes; $minute++) {
    Send-BurstEvents -EPS $TargetEPS -Duration 60
    Write-PerfLog "Minute $minute/$TestDurationMinutes complete" "Metric"
}

Stop-Job $sustainedMonitor
$sustainedSamples = Receive-Job $sustainedMonitor
Remove-Job $sustainedMonitor

# Phase 3: Burst test
Write-PerfLog "`nPhase 3: Burst test ($BurstEPS EPS)" "Metric"
$burstMonitor = Start-PerformanceMonitor -Duration $BurstDurationSeconds
Send-BurstEvents -EPS $BurstEPS -Duration $BurstDurationSeconds
Stop-Job $burstMonitor
$burstSamples = Receive-Job $burstMonitor
Remove-Job $burstMonitor

# Collect all samples
$allSamples = $warmupSamples + $sustainedSamples + $burstSamples

# Calculate metrics
$cpuStats = $allSamples | Where-Object { $_.CpuPercent -gt 0 } | Measure-Object -Property CpuPercent -Average -Maximum
$memStats = $allSamples | Measure-Object -Property MemoryMB -Average -Maximum
$latencyStats = $metrics.LatencySamples | Sort-Object
$p95Index = [int]($latencyStats.Count * 0.95)
$p95Latency = if ($latencyStats.Count -gt 0) { $latencyStats[$p95Index] } else { 0 }

$results = @{
    TotalEventsSent = $metrics.EventsSent
    TotalEventsAccepted = $metrics.EventsAccepted
    TotalEventsThrottled = $metrics.EventsThrottled
    AcceptanceRate = if ($metrics.EventsSent -gt 0) { 
        [math]::Round($metrics.EventsAccepted / $metrics.EventsSent, 4) 
    } else { 0 }
    AvgCpuPercent = [math]::Round($cpuStats.Average, 2)
    MaxCpuPercent = [math]::Round($cpuStats.Maximum, 2)
    AvgMemoryMB = [math]::Round($memStats.Average, 2)
    MaxMemoryMB = [math]::Round($memStats.Maximum, 2)
    P95LatencyMs = [math]::Round($p95Latency, 2)
    ErrorCount = $metrics.Errors.Count
}

# Generate artifacts
$artifactPath = ".\target\test-artifacts\win"
New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null

# Save detailed metrics
@{
    TestConfig = @{
        TargetEPS = $TargetEPS
        BurstEPS = $BurstEPS
        TestDurationMinutes = $TestDurationMinutes
        BurstDurationSeconds = $BurstDurationSeconds
    }
    Results = $results
    Requirements = $requirements
    Samples = $allSamples
    Errors = $metrics.Errors
} | ConvertTo-Json -Depth 4 | Out-File "$artifactPath\perf_results.json" -Encoding UTF8

# Save TSV for validation
@"
metric	value	requirement	passed
avg_cpu_percent	$($results.AvgCpuPercent)	$($requirements.MaxCpuPercent)	$(if ($results.AvgCpuPercent -le $requirements.MaxCpuPercent) { "true" } else { "false" })
max_cpu_percent	$($results.MaxCpuPercent)	$($requirements.MaxCpuPercent)	$(if ($results.MaxCpuPercent -le $requirements.MaxCpuPercent) { "true" } else { "false" })
avg_memory_mb	$($results.AvgMemoryMB)	$($requirements.MaxMemoryMB)	$(if ($results.AvgMemoryMB -le $requirements.MaxMemoryMB) { "true" } else { "false" })
max_memory_mb	$($results.MaxMemoryMB)	$($requirements.MaxMemoryMB)	$(if ($results.MaxMemoryMB -le $requirements.MaxMemoryMB) { "true" } else { "false" })
p95_latency_ms	$($results.P95LatencyMs)	$($requirements.MaxP95LatencyMs)	$(if ($results.P95LatencyMs -le $requirements.MaxP95LatencyMs) { "true" } else { "false" })
acceptance_rate	$($results.AcceptanceRate)	$($requirements.MinAcceptanceRate)	$(if ($results.AcceptanceRate -ge $requirements.MinAcceptanceRate) { "true" } else { "false" })
"@ | Out-File "$artifactPath\perf_metrics.tsv" -Encoding UTF8

# CPU/Memory timeline
@"
timestamp	cpu_percent	memory_mb	threads	handles	disk_io_mbps
"@ | Out-File "$artifactPath\resource_timeline.tsv" -Encoding UTF8

foreach ($sample in $allSamples) {
    "$($sample.Timestamp.ToString('yyyy-MM-dd HH:mm:ss'))	$($sample.CpuPercent)	$($sample.MemoryMB)	$($sample.ThreadCount)	$($sample.HandleCount)	$($sample.DiskIOMBps)" |
        Add-Content "$artifactPath\resource_timeline.tsv"
}

# Summary
Write-PerfLog "`n=== Performance Test Summary ===" "Success"
Write-PerfLog "Events Sent: $($results.TotalEventsSent)"
Write-PerfLog "Events Accepted: $($results.TotalEventsAccepted) ($([math]::Round($results.AcceptanceRate * 100, 2))%)"
Write-PerfLog "Events Throttled: $($results.TotalEventsThrottled)"
Write-PerfLog "CPU: Avg=$($results.AvgCpuPercent)%, Max=$($results.MaxCpuPercent)% (limit: $($requirements.MaxCpuPercent)%)"
Write-PerfLog "Memory: Avg=$($results.AvgMemoryMB)MB, Max=$($results.MaxMemoryMB)MB (limit: $($requirements.MaxMemoryMB)MB)"
Write-PerfLog "Latency P95: $($results.P95LatencyMs)ms (limit: $($requirements.MaxP95LatencyMs)ms)"
Write-PerfLog "Errors: $($results.ErrorCount)"

# Validate against requirements
$passed = $true
$failures = @()

if ($results.MaxCpuPercent -gt $requirements.MaxCpuPercent) {
    $failures += "CPU exceeded limit: $($results.MaxCpuPercent)% > $($requirements.MaxCpuPercent)%"
    $passed = $false
}

if ($results.MaxMemoryMB -gt $requirements.MaxMemoryMB) {
    $failures += "Memory exceeded limit: $($results.MaxMemoryMB)MB > $($requirements.MaxMemoryMB)MB"
    $passed = $false
}

if ($results.P95LatencyMs -gt $requirements.MaxP95LatencyMs) {
    $failures += "P95 latency exceeded limit: $($results.P95LatencyMs)ms > $($requirements.MaxP95LatencyMs)ms"
    $passed = $false
}

if ($results.AcceptanceRate -lt $requirements.MinAcceptanceRate) {
    $failures += "Acceptance rate below minimum: $([math]::Round($results.AcceptanceRate * 100, 2))% < $([math]::Round($requirements.MinAcceptanceRate * 100, 2))%"
    $passed = $false
}

if ($passed) {
    Write-PerfLog "`n[PASS] All performance requirements met" "Success"
    exit 0
} else {
    Write-PerfLog "`n[FAIL] Performance requirements not met:" "Error"
    foreach ($failure in $failures) {
        Write-PerfLog "  - $failure" "Error"
    }
    exit 1
}
