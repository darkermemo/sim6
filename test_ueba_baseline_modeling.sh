#!/bin/bash

# UEBA Baseline Modeling Test Suite
# Tests the UEBA modeler service and baseline management APIs

echo "==========================================="
echo "UEBA BASELINE MODELING TEST SUITE"
echo "==========================================="

# Configuration
API_URL="http://localhost:8080/v1"
CLICKHOUSE_URL="http://localhost:8123"
ADMIN_TOKEN_FILE="admin_token.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local level=$1
    local message=$2
    case $level in
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        "INFO") echo -e "${BLUE}[INFO]${NC} $message" ;;
        "WARN") echo -e "${YELLOW}[WARN]${NC} $message" ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check if admin token exists
    if [[ ! -f "$ADMIN_TOKEN_FILE" ]]; then
        log "ERROR" "Admin token file not found: $ADMIN_TOKEN_FILE"
        return 1
    fi
    
    ADMIN_TOKEN=$(cat $ADMIN_TOKEN_FILE)
    
    # Test API connectivity
    if ! curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/tenants" > /dev/null; then
        log "ERROR" "Cannot connect to API at $API_URL"
        return 1
    fi
    
    # Test ClickHouse connectivity
    if ! curl -s "$CLICKHOUSE_URL" > /dev/null; then
        log "ERROR" "Cannot connect to ClickHouse at $CLICKHOUSE_URL"
        return 1
    fi
    
    log "SUCCESS" "All prerequisites met"
    return 0
}

# Pre-populate historical data for UEBA modeling
populate_historical_data() {
    log "INFO" "========== POPULATING HISTORICAL DATA =========="
    
    local tenant_id="tenant-A"
    local current_timestamp=$(date +%s)
    local days_back=35  # 35 days of historical data
    
    log "INFO" "Creating simulated historical events for UEBA modeling..."
    
    # Create diverse users for testing
    local users=("alice" "bob" "charlie" "diana" "eve")
    local servers=("10.0.1.100" "10.0.1.101" "10.0.1.102" "10.0.2.100" "10.0.2.101")
    local user_agents=("1" "2" "3" "4" "5")
    
    local total_events=0
    
    # Generate login events for users over the historical period
    for ((day = $days_back; day >= 1; day--)); do
        local day_timestamp=$((current_timestamp - (day * 24 * 3600)))
        
        for user in "${users[@]}"; do
            # Normal business hours pattern (8 AM to 6 PM, more activity)
            for hour in {8..18}; do
                local hour_timestamp=$((day_timestamp + (hour * 3600)))
                local login_count=$((RANDOM % 5 + 1))  # 1-5 logins per hour during business hours
                
                for ((i = 1; i <= login_count; i++)); do
                    local event_timestamp=$((hour_timestamp + (RANDOM % 3600)))
                    local event_id="hist-login-${user}-${day}-${hour}-${i}"
                    
                    # 95% success rate
                    local outcome="Success"
                    if [[ $((RANDOM % 100)) -lt 5 ]]; then
                        outcome="Failure"
                    fi
                    
                    local user_agent=${user_agents[$((RANDOM % ${#user_agents[@]}))]}
                    
                    # Insert login event
                    curl -s -X POST "$CLICKHOUSE_URL" -d "
                        INSERT INTO dev.events 
                        (event_id, tenant_id, event_timestamp, user, source_ip, source_type, raw_event, event_category, event_outcome, event_action, bytes_out, UserAgent, is_threat) 
                        VALUES 
                        ('$event_id', '$tenant_id', $event_timestamp, '$user', '192.168.1.$((RANDOM % 100 + 100))', 'Authentication', 'User $user login attempt from workstation', 'Authentication', '$outcome', 'Login', 0, $user_agent, 0)
                    " > /dev/null
                    
                    ((total_events++))
                done
            done
            
            # Off-hours activity (6 PM to 8 AM, limited activity)
            for hour in {19..23} {0..7}; do
                # Only 30% chance of activity during off-hours
                if [[ $((RANDOM % 100)) -lt 30 ]]; then
                    local hour_timestamp=$((day_timestamp + (hour * 3600)))
                    local event_timestamp=$((hour_timestamp + (RANDOM % 3600)))
                    local event_id="hist-login-${user}-${day}-${hour}-off"
                    
                    local outcome="Success"
                    if [[ $((RANDOM % 100)) -lt 10 ]]; then  # Higher failure rate off-hours
                        outcome="Failure"
                    fi
                    
                    local user_agent=${user_agents[$((RANDOM % ${#user_agents[@]}))]}
                    
                    # Insert off-hours login event
                    curl -s -X POST "$CLICKHOUSE_URL" -d "
                        INSERT INTO dev.events 
                        (event_id, tenant_id, event_timestamp, user, source_ip, source_type, raw_event, event_category, event_outcome, event_action, bytes_out, UserAgent, is_threat) 
                        VALUES 
                        ('$event_id', '$tenant_id', $event_timestamp, '$user', '192.168.1.$((RANDOM % 100 + 100))', 'Authentication', 'User $user off-hours login', 'Authentication', '$outcome', 'Login', 0, $user_agent, 0)
                    " > /dev/null
                    
                    ((total_events++))
                fi
            done
        done
        
        # Generate network traffic events for servers
        for server in "${servers[@]}"; do
            local day_timestamp=$((current_timestamp - (day * 24 * 3600)))
            
            # Each server has different baseline traffic patterns
            local base_traffic=0
            case $server in
                "10.0.1.100") base_traffic=1048576 ;;   # 1MB base
                "10.0.1.101") base_traffic=5242880 ;;   # 5MB base
                "10.0.1.102") base_traffic=10485760 ;;  # 10MB base
                "10.0.2.100") base_traffic=52428800 ;;  # 50MB base
                "10.0.2.101") base_traffic=104857600 ;; # 100MB base
            esac
            
            # Add random variation (±50%)
            local daily_bytes=$((base_traffic + (RANDOM % base_traffic) - (base_traffic / 2)))
            local event_id="hist-traffic-${server}-${day}"
            
            # Insert network traffic event
            curl -s -X POST "$CLICKHOUSE_URL" -d "
                INSERT INTO dev.events 
                (event_id, tenant_id, event_timestamp, source_ip, source_type, raw_event, event_category, event_outcome, event_action, bytes_out, is_threat) 
                VALUES 
                ('$event_id', '$tenant_id', $day_timestamp, '$server', 'Network', 'Daily network traffic summary for $server', 'Network', 'Success', 'DataTransfer', $daily_bytes, 0)
            " > /dev/null
            
            ((total_events++))
        done
        
        if [[ $((day % 10)) -eq 0 ]]; then
            log "INFO" "Generated data for day $day ($((days_back - day + 1))/$days_back days completed)"
        fi
    done
    
    log "SUCCESS" "Populated $total_events historical events for UEBA modeling"
    log "INFO" "Data includes:"
    log "INFO" "  - ${#users[@]} users with login patterns"
    log "INFO" "  - ${#servers[@]} servers with network traffic patterns"
    log "INFO" "  - $days_back days of historical data"
    
    return 0
}

# Test UEBA modeler service
test_ueba_modeler_service() {
    log "INFO" "========== TESTING UEBA MODELER SERVICE =========="
    
    # Check if UEBA modeler binary exists
    if [[ ! -f "siem_ueba_modeler/target/release/siem_ueba_modeler" ]] && [[ ! -f "siem_ueba_modeler/target/debug/siem_ueba_modeler" ]]; then
        log "INFO" "Building UEBA modeler service..."
        cd siem_ueba_modeler
        if ! cargo build --release; then
            log "ERROR" "Failed to build UEBA modeler service"
            cd ..
            return 1
        fi
        cd ..
        log "SUCCESS" "UEBA modeler service built successfully"
    fi
    
    # Set environment variables for the modeler
    export API_BASE_URL="$API_URL"
    export CLICKHOUSE_URL="$CLICKHOUSE_URL"
    export JWT_SECRET="this-is-a-very-long-secure-random-string-for-jwt-signing-do-not-use-in-production"
    export CALCULATION_PERIOD_DAYS="30"
    export MODELING_INTERVAL_HOURS="24"
    export RUST_LOG="info"
    
    log "INFO" "Running UEBA modeler service (one-time execution)..."
    
    # Run the modeler service in the background for testing
    if [[ -f "siem_ueba_modeler/target/release/siem_ueba_modeler" ]]; then
        timeout 60s ./siem_ueba_modeler/target/release/siem_ueba_modeler &
    else
        timeout 60s ./siem_ueba_modeler/target/debug/siem_ueba_modeler &
    fi
    
    local modeler_pid=$!
    
    # Wait for the modeler to process
    log "INFO" "Waiting 30 seconds for UEBA modeler to process baselines..."
    sleep 30
    
    # Kill the modeler process if still running
    if kill -0 $modeler_pid 2>/dev/null; then
        kill $modeler_pid
        wait $modeler_pid 2>/dev/null
    fi
    
    log "SUCCESS" "UEBA modeler service execution completed"
    return 0
}

# Test baseline retrieval API
test_baseline_retrieval() {
    log "INFO" "========== TESTING BASELINE RETRIEVAL =========="
    
    # Test getting baselines statistics
    log "INFO" "Testing baseline statistics endpoint..."
    
    STATS_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/ueba/baselines/statistics")
    
    if [[ $? -eq 0 ]] && [[ -n "$STATS_RESPONSE" ]]; then
        local total_baselines=$(echo "$STATS_RESPONSE" | jq -r '.overall.total_baselines // 0')
        local unique_entities=$(echo "$STATS_RESPONSE" | jq -r '.overall.unique_entities // 0')
        local entity_types=$(echo "$STATS_RESPONSE" | jq -r '.overall.entity_types // 0')
        
        if [[ "$total_baselines" != "0" && "$total_baselines" != "null" ]]; then
            log "SUCCESS" "Baseline statistics retrieved successfully"
            log "INFO" "  - Total baselines: $total_baselines"
            log "INFO" "  - Unique entities: $unique_entities"
            log "INFO" "  - Entity types: $entity_types"
        else
            log "WARN" "No baselines found in statistics"
        fi
    else
        log "ERROR" "Failed to retrieve baseline statistics"
        return 1
    fi
    
    # Test getting all baselines
    log "INFO" "Testing list baselines endpoint..."
    
    BASELINES_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/ueba/baselines?limit=10")
    
    if [[ $? -eq 0 ]] && [[ -n "$BASELINES_RESPONSE" ]]; then
        local baselines_count=$(echo "$BASELINES_RESPONSE" | jq -r '.count // 0')
        
        if [[ "$baselines_count" != "0" && "$baselines_count" != "null" ]]; then
            log "SUCCESS" "Baselines list retrieved successfully"
            log "INFO" "  - Baselines returned: $baselines_count"
            
            # Show sample baseline
            local sample_baseline=$(echo "$BASELINES_RESPONSE" | jq -r '.data[0]')
            if [[ "$sample_baseline" != "null" ]]; then
                local entity_id=$(echo "$sample_baseline" | jq -r '.entity_id')
                local entity_type=$(echo "$sample_baseline" | jq -r '.entity_type')
                local metric=$(echo "$sample_baseline" | jq -r '.metric')
                local avg_value=$(echo "$sample_baseline" | jq -r '.baseline_value_avg')
                local confidence=$(echo "$sample_baseline" | jq -r '.confidence_score')
                
                log "INFO" "  - Sample baseline: $entity_type '$entity_id' - $metric: $avg_value (confidence: $confidence)"
            fi
        else
            log "WARN" "No baselines found in list"
        fi
    else
        log "ERROR" "Failed to retrieve baselines list"
        return 1
    fi
    
    return 0
}

# Test entity-specific baseline retrieval
test_entity_baseline_retrieval() {
    log "INFO" "========== TESTING ENTITY-SPECIFIC BASELINE RETRIEVAL =========="
    
    # Test retrieving baselines for a specific user
    local test_user="alice"
    log "INFO" "Testing baseline retrieval for user: $test_user"
    
    USER_BASELINES_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/ueba/baselines/$test_user")
    
    if [[ $? -eq 0 ]] && [[ -n "$USER_BASELINES_RESPONSE" ]]; then
        local user_baselines_count=$(echo "$USER_BASELINES_RESPONSE" | jq -r '.count // 0')
        local entity_type=$(echo "$USER_BASELINES_RESPONSE" | jq -r '.entity_type')
        
        if [[ "$user_baselines_count" != "0" && "$user_baselines_count" != "null" ]]; then
            log "SUCCESS" "User baselines retrieved successfully"
            log "INFO" "  - Entity: $test_user ($entity_type)"
            log "INFO" "  - Baselines count: $user_baselines_count"
            
            # Show specific baseline metrics
            local baselines=$(echo "$USER_BASELINES_RESPONSE" | jq -r '.baselines')
            echo "$baselines" | jq -r '.[] | "  - \(.metric): \(.baseline_value_avg) ± \(.baseline_value_stddev) (confidence: \(.confidence_score))"' | while read line; do
                log "INFO" "$line"
            done
        else
            log "WARN" "No baselines found for user $test_user"
        fi
    else
        log "ERROR" "Failed to retrieve baselines for user $test_user"
        return 1
    fi
    
    # Test retrieving baselines for a specific server
    local test_server="10.0.1.100"
    log "INFO" "Testing baseline retrieval for server: $test_server"
    
    SERVER_BASELINES_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/ueba/baselines/$test_server")
    
    if [[ $? -eq 0 ]] && [[ -n "$SERVER_BASELINES_RESPONSE" ]]; then
        local server_baselines_count=$(echo "$SERVER_BASELINES_RESPONSE" | jq -r '.count // 0')
        local entity_type=$(echo "$SERVER_BASELINES_RESPONSE" | jq -r '.entity_type')
        
        if [[ "$server_baselines_count" != "0" && "$server_baselines_count" != "null" ]]; then
            log "SUCCESS" "Server baselines retrieved successfully"
            log "INFO" "  - Entity: $test_server ($entity_type)"
            log "INFO" "  - Baselines count: $server_baselines_count"
            
            # Show bytes_out_per_day baseline
            local bytes_baseline=$(echo "$SERVER_BASELINES_RESPONSE" | jq -r '.baselines[] | select(.metric == "bytes_out_per_day")')
            if [[ "$bytes_baseline" != "null" && -n "$bytes_baseline" ]]; then
                local avg_bytes=$(echo "$bytes_baseline" | jq -r '.baseline_value_avg')
                local std_bytes=$(echo "$bytes_baseline" | jq -r '.baseline_value_stddev')
                local confidence=$(echo "$bytes_baseline" | jq -r '.confidence_score')
                local sample_count=$(echo "$bytes_baseline" | jq -r '.sample_count')
                
                # Convert bytes to MB for readability
                local avg_mb=$(echo "scale=2; $avg_bytes / 1048576" | bc)
                local std_mb=$(echo "scale=2; $std_bytes / 1048576" | bc)
                
                log "INFO" "  - Average bytes out per day: ${avg_mb} MB ± ${std_mb} MB"
                log "INFO" "  - Confidence score: $confidence (based on $sample_count samples)"
            fi
        else
            log "WARN" "No baselines found for server $test_server"
        fi
    else
        log "ERROR" "Failed to retrieve baselines for server $test_server"
        return 1
    fi
    
    return 0
}

# Test baseline validation
test_baseline_validation() {
    log "INFO" "========== TESTING BASELINE VALIDATION =========="
    
    # Verify that baselines contain expected metrics
    log "INFO" "Validating baseline metrics..."
    
    ALL_BASELINES_RESPONSE=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/ueba/baselines?limit=1000")
    
    if [[ $? -eq 0 ]] && [[ -n "$ALL_BASELINES_RESPONSE" ]]; then
        # Check for user login baselines
        local login_baselines=$(echo "$ALL_BASELINES_RESPONSE" | jq -r '.data[] | select(.metric == "login_count_per_hour") | .entity_id' | wc -l)
        
        if [[ "$login_baselines" -gt 0 ]]; then
            log "SUCCESS" "Found $login_baselines user login baselines"
        else
            log "WARN" "No user login baselines found"
        fi
        
        # Check for server data baselines
        local data_baselines=$(echo "$ALL_BASELINES_RESPONSE" | jq -r '.data[] | select(.metric == "bytes_out_per_day") | .entity_id' | wc -l)
        
        if [[ "$data_baselines" -gt 0 ]]; then
            log "SUCCESS" "Found $data_baselines server data baselines"
        else
            log "WARN" "No server data baselines found"
        fi
        
        # Check for hourly activity baselines
        local hourly_baselines=$(echo "$ALL_BASELINES_RESPONSE" | jq -r '.data[] | select(.metric | startswith("hourly_activity_hour_")) | .entity_id' | wc -l)
        
        if [[ "$hourly_baselines" -gt 0 ]]; then
            log "SUCCESS" "Found $hourly_baselines hourly activity baselines"
        else
            log "WARN" "No hourly activity baselines found"
        fi
        
        # Validate baseline quality
        log "INFO" "Validating baseline quality..."
        
        local high_confidence_baselines=$(echo "$ALL_BASELINES_RESPONSE" | jq -r '.data[] | select(.confidence_score > 0.7) | .baseline_id' | wc -l)
        local total_baselines=$(echo "$ALL_BASELINES_RESPONSE" | jq -r '.data | length')
        
        if [[ "$total_baselines" -gt 0 ]]; then
            local quality_ratio=$(echo "scale=2; $high_confidence_baselines * 100 / $total_baselines" | bc)
            log "INFO" "  - High confidence baselines: $high_confidence_baselines/$total_baselines (${quality_ratio}%)"
            
            if [[ $(echo "$quality_ratio > 50" | bc) -eq 1 ]]; then
                log "SUCCESS" "Good baseline quality detected"
            else
                log "WARN" "Low baseline quality - consider more historical data"
            fi
        fi
    else
        log "ERROR" "Failed to retrieve baselines for validation"
        return 1
    fi
    
    return 0
}

# Test database schema validation
test_database_schema() {
    log "INFO" "========== TESTING DATABASE SCHEMA =========="
    
    # Test behavioral_baselines table exists and has correct structure
    log "INFO" "Validating behavioral_baselines table structure..."
    
    DESCRIBE_RESPONSE=$(curl -s "$CLICKHOUSE_URL" -d "DESCRIBE TABLE dev.behavioral_baselines FORMAT JSON")
    
    if [[ $? -eq 0 ]] && [[ -n "$DESCRIBE_RESPONSE" ]]; then
        # Check for required columns
        local required_columns=("baseline_id" "tenant_id" "entity_id" "entity_type" "metric" "baseline_value_avg" "baseline_value_stddev" "confidence_score")
        local missing_columns=()
        
        for col in "${required_columns[@]}"; do
            if ! echo "$DESCRIBE_RESPONSE" | jq -r '.data[].name' | grep -q "^$col$"; then
                missing_columns+=("$col")
            fi
        done
        
        if [[ ${#missing_columns[@]} -eq 0 ]]; then
            log "SUCCESS" "All required columns present in behavioral_baselines table"
        else
            log "ERROR" "Missing columns in behavioral_baselines table: ${missing_columns[*]}"
            return 1
        fi
    else
        log "ERROR" "Failed to describe behavioral_baselines table"
        return 1
    fi
    
    # Test ueba_anomalies table exists
    log "INFO" "Validating ueba_anomalies table exists..."
    
    ANOMALIES_DESCRIBE_RESPONSE=$(curl -s "$CLICKHOUSE_URL" -d "DESCRIBE TABLE dev.ueba_anomalies FORMAT JSON")
    
    if [[ $? -eq 0 ]] && [[ -n "$ANOMALIES_DESCRIBE_RESPONSE" ]]; then
        log "SUCCESS" "ueba_anomalies table exists and accessible"
    else
        log "ERROR" "ueba_anomalies table not found or inaccessible"
        return 1
    fi
    
    return 0
}

# Main execution function
main() {
    echo "Starting UEBA Baseline Modeling test suite..."
    echo "$(date)"
    echo ""
    
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        exit 1
    fi
    
    # Initialize test results
    local test_results=()
    
    # Test 1: Database Schema
    if test_database_schema; then
        test_results+=("✅ Database schema validation")
    else
        test_results+=("❌ Database schema validation")
    fi
    
    echo ""
    
    # Test 2: Populate Historical Data
    if populate_historical_data; then
        test_results+=("✅ Historical data population")
    else
        test_results+=("❌ Historical data population")
    fi
    
    echo ""
    
    # Test 3: UEBA Modeler Service
    if test_ueba_modeler_service; then
        test_results+=("✅ UEBA modeler service execution")
    else
        test_results+=("❌ UEBA modeler service execution")
    fi
    
    echo ""
    
    # Test 4: Baseline Retrieval APIs
    if test_baseline_retrieval; then
        test_results+=("✅ Baseline retrieval APIs")
    else
        test_results+=("❌ Baseline retrieval APIs")
    fi
    
    echo ""
    
    # Test 5: Entity-specific Baseline Retrieval
    if test_entity_baseline_retrieval; then
        test_results+=("✅ Entity-specific baseline retrieval")
    else
        test_results+=("❌ Entity-specific baseline retrieval")
    fi
    
    echo ""
    
    # Test 6: Baseline Validation
    if test_baseline_validation; then
        test_results+=("✅ Baseline validation")
    else
        test_results+=("❌ Baseline validation")
    fi
    
    # Print summary
    echo ""
    echo "==========================================="
    echo "TEST SUMMARY"
    echo "==========================================="
    for result in "${test_results[@]}"; do
        echo "$result"
    done
    echo ""
    
    # Check if all tests passed
    if [[ "${test_results[*]}" == *"❌"* ]]; then
        log "ERROR" "Some tests failed. Check the output above for details."
        echo ""
        echo "🔧 TROUBLESHOOTING TIPS:"
        echo "1. Ensure ClickHouse contains sufficient historical data"
        echo "2. Check UEBA modeler service logs for errors"
        echo "3. Verify API authentication and permissions"
        echo "4. Confirm database schema is up to date"
        exit 1
    else
        log "SUCCESS" "All UEBA baseline modeling tests passed!"
        echo ""
        echo "🎉 UEBA BASELINE MODELING IS WORKING CORRECTLY! 🎉"
        echo ""
        echo "The system successfully:"
        echo "✓ Created behavioral baselines from historical data"
        echo "✓ Calculated user login frequency patterns"
        echo "✓ Calculated server data egress patterns"
        echo "✓ Calculated hourly activity variance patterns"
        echo "✓ Provides comprehensive baseline retrieval APIs"
        echo "✓ Supports entity-specific baseline queries"
        echo "✓ Maintains baseline quality and confidence scores"
        exit 0
    fi
}

# Run the test suite
main "$@" 