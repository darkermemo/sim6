#!/usr/bin/env bash
# collector_perf_proof.sh - Production-grade collector performance validation
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts/collector"
mkdir -p "$ART"

API_BASE="http://127.0.0.1:9999"
COLLECTOR_BASE="http://127.0.0.1:8514"
CH_CLIENT="clickhouse client"

# Performance requirements
MAX_CPU_PERCENT=70
MAX_IO_WAIT_PERCENT=10
MIN_EPS=5000
MAX_FLUSH_MINUTES=5

# Test configuration
TENANT_ID=1
SOURCE_ID="collector-perf-$(date +%s)"
TARGET_EPS=5000
TEST_DURATION_SEC=300  # 5 minutes

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[perf]${NC} $1"; }
warn() { echo -e "${YELLOW}[perf]${NC} $1"; }
error() { echo -e "${RED}[perf]${NC} $1"; }

# Initialize metrics
METRICS_FILE="$ART/collector_metrics.json"
cat > "$METRICS_FILE" <<EOF
{
  "start_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "samples": []
}
EOF

# Performance monitoring function
monitor_performance() {
    local duration=$1
    local end_time=$(($(date +%s) + duration))
    
    while [ $(date +%s) -lt $end_time ]; do
        # CPU and I/O wait
        local cpu_stats=$(top -bn1 | grep "Cpu(s)")
        local cpu_idle=$(echo "$cpu_stats" | awk -F',' '{print $4}' | awk '{print $1}' | sed 's/%id//')
        local io_wait=$(echo "$cpu_stats" | awk -F',' '{print $5}' | awk '{print $1}' | sed 's/%wa//')
        local cpu_used=$(echo "100 - $cpu_idle" | bc -l)
        
        # Memory
        local mem_stats=$(free -m | grep "^Mem:")
        local mem_total=$(echo "$mem_stats" | awk '{print $2}')
        local mem_used=$(echo "$mem_stats" | awk '{print $3}')
        local mem_percent=$(echo "scale=2; $mem_used * 100 / $mem_total" | bc -l)
        
        # Network throughput (approximate)
        local rx_bytes_1=$(cat /sys/class/net/eth0/statistics/rx_bytes 2>/dev/null || echo 0)
        local tx_bytes_1=$(cat /sys/class/net/eth0/statistics/tx_bytes 2>/dev/null || echo 0)
        sleep 1
        local rx_bytes_2=$(cat /sys/class/net/eth0/statistics/rx_bytes 2>/dev/null || echo 0)
        local tx_bytes_2=$(cat /sys/class/net/eth0/statistics/tx_bytes 2>/dev/null || echo 0)
        
        local rx_mbps=$(echo "scale=2; ($rx_bytes_2 - $rx_bytes_1) / 1048576" | bc -l)
        local tx_mbps=$(echo "scale=2; ($tx_bytes_2 - $tx_bytes_1) / 1048576" | bc -l)
        
        # Disk usage for spool
        local spool_mb=$(du -sm /var/spool/siem-collector 2>/dev/null | awk '{print $1}' || echo 0)
        
        # Process specific metrics
        local collector_pid=$(pgrep -f "collector" | head -1)
        local proc_cpu=0
        local proc_mem_mb=0
        local proc_threads=0
        
        if [ -n "$collector_pid" ]; then
            proc_cpu=$(ps -p "$collector_pid" -o %cpu= 2>/dev/null || echo 0)
            proc_mem_mb=$(ps -p "$collector_pid" -o rss= 2>/dev/null | awk '{print $1/1024}' || echo 0)
            proc_threads=$(ps -p "$collector_pid" -o nlwp= 2>/dev/null || echo 0)
        fi
        
        # Record sample
        local sample=$(cat <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cpu_percent": $cpu_used,
  "io_wait_percent": $io_wait,
  "memory_percent": $mem_percent,
  "memory_mb": $mem_used,
  "network_rx_mbps": $rx_mbps,
  "network_tx_mbps": $tx_mbps,
  "spool_mb": $spool_mb,
  "process_cpu": $proc_cpu,
  "process_mem_mb": $proc_mem_mb,
  "process_threads": $proc_threads
}
EOF
)
        
        # Append to metrics file
        jq ".samples += [$sample]" "$METRICS_FILE" > "$METRICS_FILE.tmp" && mv "$METRICS_FILE.tmp" "$METRICS_FILE"
        
        sleep 4
    done
}

# Syslog generator function
generate_syslog_traffic() {
    local eps=$1
    local duration=$2
    local total_events=$((eps * duration))
    
    log "Generating $total_events events at $eps EPS..."
    
    # Mix of different syslog formats
    local vendors=("f5" "paloalto" "fortinet" "cisco" "zeek")
    local severities=("info" "warning" "error" "critical")
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    local sent=0
    
    while [ $(date +%s) -lt $end_time ]; do
        # Batch send for efficiency
        local batch=""
        local batch_size=$((eps / 10))  # 100ms batches
        
        for i in $(seq 1 $batch_size); do
            local seq=$((sent + i))
            local vendor=${vendors[$((seq % ${#vendors[@]}))]}
            local severity=${severities[$((seq % ${#severities[@]}))]}
            local timestamp=$(date '+%b %d %H:%M:%S')
            local src_ip="10.0.$((seq % 256)).$((seq % 100))"
            local dst_ip="192.168.$((seq % 256)).$((seq % 100))"
            
            case $vendor in
                f5)
                    batch+="<134>$timestamp bigip1 tmm[$$]: Rule /Common/test : Client $src_ip:$((seq % 65535)) -> $dst_ip:443 action=allow seq=$seq\n"
                    ;;
                paloalto)
                    batch+="<14>$timestamp PA-VM 1,$(date +%Y/%m/%d),$timestamp,$src_ip,$dst_ip,0.0.0.0,0.0.0.0,allow-test,,,tcp,vsys1,trust,untrust,eth1/1,eth1/2,Forward,$timestamp,$seq,1,443,443,0,0,0x0,tcp,allow,1024,1024,0,1,$timestamp,0,any,0,$seq,0x0,$src_ip-$src_ip,$dst_ip-$dst_ip,0,1,0,seq=$seq\n"
                    ;;
                fortinet)
                    batch+="<189>date=$(date +%Y-%m-%d) time=$timestamp devname=\"FG-TEST\" logid=\"0000000013\" type=\"traffic\" subtype=\"forward\" level=\"$severity\" vd=\"root\" srcip=$src_ip dstip=$dst_ip action=\"accept\" seq=$seq\n"
                    ;;
                cisco)
                    batch+="<166>$timestamp: %ASA-6-302013: Built outbound TCP connection $seq for outside:$dst_ip/443 to inside:$src_ip/$((seq % 65535))\n"
                    ;;
                zeek)
                    batch+="$(date +%s.%N)\tC$seq\t$src_ip\t$((seq % 65535))\t$dst_ip\t443\ttcp\tssl\t1.234\t1024\t2048\tSF\tT\tT\t0\tShADadfF\t15\t2536\t20\t3456\tseq=$seq\n"
                    ;;
            esac
            
            # Update ledger
            echo "INSERT INTO dev.agent_ingest_ledger (tenant_id, source_id, seq, status) VALUES ($TENANT_ID, '$SOURCE_ID', $seq, 1)" | \
                $CH_CLIENT 2>/dev/null || true
        done
        
        # Send batch via UDP syslog
        echo -ne "$batch" | nc -u -w 0 127.0.0.1 514
        
        sent=$((sent + batch_size))
        
        # Progress update
        if [ $((sent % 10000)) -eq 0 ]; then
            log "  Sent $sent/$total_events events"
        fi
        
        # Maintain target rate
        sleep 0.1
    done
    
    log "✓ Generated $sent syslog events"
}

# Main test execution
log "=== Collector Performance Test ==="
log "Configuration:"
log "  Target: $TARGET_EPS EPS for $TEST_DURATION_SEC seconds"
log "  Requirements: CPU<$MAX_CPU_PERCENT%, IO Wait<$MAX_IO_WAIT_PERCENT%"

# Check collector health
if ! curl -fsS "$COLLECTOR_BASE/health" > "$ART/collector_health_start.json" 2>/dev/null; then
    error "Collector not running at $COLLECTOR_BASE"
    exit 1
fi

# Get initial event count
INITIAL_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events 
WHERE source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "0")

# Start performance monitoring
log "Starting performance monitoring..."
monitor_performance $TEST_DURATION_SEC &
MONITOR_PID=$!

# Phase 1: Warm-up (10% rate for 30s)
log "Phase 1: Warm-up at $((TARGET_EPS / 10)) EPS"
generate_syslog_traffic $((TARGET_EPS / 10)) 30

# Phase 2: Sustained load
log "Phase 2: Sustained load at $TARGET_EPS EPS"
generate_syslog_traffic $TARGET_EPS $((TEST_DURATION_SEC - 30))

# Wait for monitoring to complete
wait $MONITOR_PID

# Allow processing to settle
log "Waiting for processing to complete..."
sleep 10

# Collect final metrics
FINAL_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.events 
WHERE source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "0")

EVENTS_DELIVERED=$((FINAL_COUNT - INITIAL_COUNT))
EXPECTED_EVENTS=$((TARGET_EPS * TEST_DURATION_SEC))
DELIVERY_RATE=$(echo "scale=2; $EVENTS_DELIVERED * 100 / $EXPECTED_EVENTS" | bc -l)

# Analyze performance metrics
log "Analyzing performance metrics..."

# Calculate statistics from samples
STATS=$(jq '
{
  duration_sec: ((.samples | last).timestamp as $end | .samples | first | .timestamp as $start | 
    (($end | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime) - ($start | strptime("%Y-%m-%dT%H:%M:%SZ") | mktime))),
  cpu: {
    avg: (.samples | map(.cpu_percent) | add / length),
    max: (.samples | map(.cpu_percent) | max),
    p95: (.samples | map(.cpu_percent) | sort | .[length * 0.95 | floor])
  },
  io_wait: {
    avg: (.samples | map(.io_wait_percent) | add / length),
    max: (.samples | map(.io_wait_percent) | max)
  },
  memory: {
    avg_mb: (.samples | map(.memory_mb) | add / length),
    max_mb: (.samples | map(.memory_mb) | max)
  },
  process: {
    avg_cpu: (.samples | map(.process_cpu) | add / length),
    max_cpu: (.samples | map(.process_cpu) | max),
    avg_mem_mb: (.samples | map(.process_mem_mb) | add / length),
    max_mem_mb: (.samples | map(.process_mem_mb) | max),
    avg_threads: (.samples | map(.process_threads) | add / length)
  },
  network: {
    avg_rx_mbps: (.samples | map(.network_rx_mbps) | add / length),
    max_rx_mbps: (.samples | map(.network_rx_mbps) | max),
    avg_tx_mbps: (.samples | map(.network_tx_mbps) | add / length),
    max_tx_mbps: (.samples | map(.network_tx_mbps) | max)
  },
  spool: {
    max_mb: (.samples | map(.spool_mb) | max)
  }
}
' "$METRICS_FILE")

# Save performance profile
echo "$STATS" > "$ART/performance_stats.json"

# Extract key metrics
CPU_MAX=$(echo "$STATS" | jq -r '.cpu.max')
IO_WAIT_MAX=$(echo "$STATS" | jq -r '.io_wait.max')
ACTUAL_EPS=$(echo "scale=0; $EVENTS_DELIVERED / $TEST_DURATION_SEC" | bc -l)

# Generate TSV for validation
cat > "$ART/collector_perf_metrics.tsv" <<EOF
metric	value	requirement	passed
events_expected	$EXPECTED_EVENTS	-	-
events_delivered	$EVENTS_DELIVERED	-	-
delivery_rate_percent	$DELIVERY_RATE	100	$([ $(echo "$DELIVERY_RATE >= 100" | bc) -eq 1 ] && echo "true" || echo "false")
actual_eps	$ACTUAL_EPS	$MIN_EPS	$([ $(echo "$ACTUAL_EPS >= $MIN_EPS" | bc) -eq 1 ] && echo "true" || echo "false")
cpu_max_percent	$CPU_MAX	$MAX_CPU_PERCENT	$([ $(echo "$CPU_MAX <= $MAX_CPU_PERCENT" | bc) -eq 1 ] && echo "true" || echo "false")
io_wait_max_percent	$IO_WAIT_MAX	$MAX_IO_WAIT_PERCENT	$([ $(echo "$IO_WAIT_MAX <= $MAX_IO_WAIT_PERCENT" | bc) -eq 1 ] && echo "true" || echo "false")
EOF

# Check ledger for gaps
GAP_COUNT=$($CH_CLIENT -q "
SELECT count() 
FROM dev.ledger_missing 
WHERE tenant_id = $TENANT_ID 
  AND source_id = '$SOURCE_ID'
FORMAT TabSeparated
" 2>/dev/null || echo "0")

# Summary
log "=== Performance Test Summary ==="
log "Events: $EVENTS_DELIVERED / $EXPECTED_EVENTS ($DELIVERY_RATE%)"
log "Actual EPS: $ACTUAL_EPS (target: $MIN_EPS)"
log "CPU Max: ${CPU_MAX}% (limit: $MAX_CPU_PERCENT%)"
log "IO Wait Max: ${IO_WAIT_MAX}% (limit: $MAX_IO_WAIT_PERCENT%)"
log "Ledger Gaps: $GAP_COUNT"

# Validate
PASSED=true
FAILURES=()

if [ "$GAP_COUNT" -gt 0 ]; then
    FAILURES+=("Ledger gaps detected: $GAP_COUNT")
    PASSED=false
fi

if [ $(echo "$ACTUAL_EPS < $MIN_EPS" | bc) -eq 1 ]; then
    FAILURES+=("EPS below minimum: $ACTUAL_EPS < $MIN_EPS")
    PASSED=false
fi

if [ $(echo "$CPU_MAX > $MAX_CPU_PERCENT" | bc) -eq 1 ]; then
    FAILURES+=("CPU exceeded limit: ${CPU_MAX}% > $MAX_CPU_PERCENT%")
    PASSED=false
fi

if [ $(echo "$IO_WAIT_MAX > $MAX_IO_WAIT_PERCENT" | bc) -eq 1 ]; then
    FAILURES+=("IO wait exceeded limit: ${IO_WAIT_MAX}% > $MAX_IO_WAIT_PERCENT%")
    PASSED=false
fi

if [ "$PASSED" = true ]; then
    log "✓ [PASS] All performance requirements met"
    exit 0
else
    error "[FAIL] Performance requirements not met:"
    for failure in "${FAILURES[@]}"; do
        error "  - $failure"
    done
    exit 1
fi
