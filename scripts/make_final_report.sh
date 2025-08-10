#!/bin/bash

# Final Report Generator for SIEM System
# Generates final_reportv1.md with comprehensive artifacts, logs, and snapshots

set -euo pipefail

# Configuration
REPORT_FILE="final_reportv1.md"
TEMP_REPORT="${REPORT_FILE}.tmp"
RUN_ID=$(date -u +"%Y%m%d-%H%M%SZ")
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
ARTIFACTS_DIR="target/test-artifacts"
REPORTS_DIR="reports"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to redact secrets
redact_secrets() {
    sed -E 's/(password=|token=|authorization:)[^[:space:]"]+/\1[REDACTED]/gi'
}

# Function to get file info
get_file_info() {
    local file="$1"
    if [[ -f "$file" ]]; then
        local size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "unknown")
        local sha256=$(shasum -a 256 "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")
        echo "| $(basename "$file") | $size | $sha256 |"
    else
        echo "| $(basename "$file") | MISSING | MISSING |"
    fi
}

# Function to embed file content (truncated)
embed_file_content() {
    local file="$1"
    local max_lines="${2:-100}"
    local description="$3"
    
    echo "#### $description"
    echo ""
    if [[ -f "$file" ]]; then
        echo "**File:** \`$file\`"
        echo ""
        echo "\`\`\`"
        head -n "$max_lines" "$file" | redact_secrets
        local total_lines=$(wc -l < "$file" 2>/dev/null || echo "0")
        if [[ $total_lines -gt $max_lines ]]; then
            echo ""
            echo "... (truncated, showing first $max_lines of $total_lines lines)"
        fi
        echo "\`\`\`"
    else
        echo "**Status:** MISSING - Expected at \`$file\`"
    fi
    echo ""
}

# Function to capture ClickHouse schema
capture_clickhouse_schema() {
    echo "### ClickHouse Schema Snapshot"
    echo ""
    
    # Test ClickHouse connectivity first
    # Prefer clickhouse client binary named 'clickhouse'
    if command -v clickhouse >/dev/null 2>&1; then
        local CH_CMD="clickhouse"
    else
        echo "**Status:** MISSING - ClickHouse client not found"
        echo ""
        return
    fi
    
    # Try to connect and get schema info
    echo "#### Table Structure"
    echo ""
    echo "\`\`\`sql"
    if $CH_CMD --query "DESCRIBE dev.events" 2>/dev/null; then
        echo "\`\`\`"
    else
        echo "-- ERROR: Could not describe dev.events table"
        echo "\`\`\`"
        echo "**Status:** ERROR - Could not connect to ClickHouse or table does not exist"
        echo ""
        return
    fi
    echo ""
    
    echo "#### Event Counts"
    echo ""
    echo "\`\`\`sql"
    echo "-- Total events count"
    if $CH_CMD --query "SELECT count() FROM dev.events" 2>/dev/null; then
        echo ""
        echo "-- Time range"
        $CH_CMD --query "SELECT min(event_timestamp) as earliest, max(event_timestamp) as latest FROM dev.events" 2>/dev/null || echo "-- ERROR: Could not get time range"
    else
        echo "-- ERROR: Could not count events"
    fi
    echo "\`\`\`"
    echo ""
    
    echo "#### Column Metadata"
    echo ""
    echo "\`\`\`sql"
    $CH_CMD --query "SELECT name, type FROM system.columns WHERE database='dev' AND table='events' ORDER BY name" 2>/dev/null || echo "-- ERROR: Could not get column metadata"
    echo "\`\`\`"
    echo ""
}

# Function to perform API smoke tests
perform_api_smoke_tests() {
    echo "### API Smoke Tests"
    echo ""
    
    local base_url="http://localhost:9999"
    local endpoints=(
        "/dev"
        "/dev/"
        "/dev/events"
        "/dev/rules"
        "/dev/metrics/live"
        "/dev/health"
        "/dev/metrics/eps"
        "/api/v1/health"
        "/api/v1/metrics?format=prometheus"
    )
    
    echo "| Endpoint | Status | Response Time | Notes |"
    echo "|----------|--------|---------------|-------|"
    
    for endpoint in "${endpoints[@]}"; do
        local start_time=$(date +%s%N)
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$base_url$endpoint" 2>/dev/null || echo "ERROR")
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 ))
        
        local notes=""
        if [[ "$status_code" == "200" ]]; then
            notes="✅ OK"
        elif [[ "$status_code" == "ERROR" ]]; then
            notes="❌ Connection failed"
            response_time="N/A"
        else
            notes="⚠️ HTTP $status_code"
        fi
        
        echo "| $endpoint | $status_code | ${response_time}ms | $notes |"
    done
    echo ""
}

# Function to capture git metadata
capture_git_metadata() {
    echo "### Git Metadata"
    echo ""
    echo "| Property | Value |"
    echo "|----------|-------|"
    echo "| Branch | $(git branch --show-current 2>/dev/null || echo 'unknown') |"
    echo "| Commit | $(git rev-parse HEAD 2>/dev/null || echo 'unknown') |"
    echo "| Short Commit | $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown') |"
    echo "| Tag | $(git describe --tags --exact-match 2>/dev/null || echo 'none') |"
    echo "| Dirty State | $(git diff --quiet 2>/dev/null && echo 'clean' || echo 'dirty') |"
    echo "| Last Commit Date | $(git log -1 --format=%cd 2>/dev/null || echo 'unknown') |"
    echo "| Author | $(git log -1 --format='%an <%ae>' 2>/dev/null || echo 'unknown') |"
    echo ""
}

# Function to generate table of contents
generate_toc() {
    echo "## Table of Contents"
    echo ""
    echo "1. [Run Information](#run-information)"
    echo "2. [Git Metadata](#git-metadata)"
    echo "3. [Artifacts Index](#artifacts-index)"
    echo "4. [ClickHouse Schema Snapshot](#clickhouse-schema-snapshot)"
    echo "5. [API Smoke Tests](#api-smoke-tests)"
    echo "6. [Key Artifacts](#key-artifacts)"
    echo "7. [SSE Test Summaries](#sse-test-summaries)"
    echo "8. [Lint Status](#lint-status)"
    echo "9. [Schema Parity](#schema-parity)"
    echo "10. [Parsing Harness](#parsing-harness)"
    echo "11. [Status Reports](#status-reports)"
    echo "12. [Integration Reports](#integration-reports)"
    echo ""
}

# Main report generation function
generate_report() {
    log_info "Generating final report..."
    
    # Start with header
    cat > "$TEMP_REPORT" << EOF
# SIEM System Final Report v1

**Generated:** $TIMESTAMP  
**Run ID:** $RUN_ID  
**Report Version:** 1.0  

EOF

    # Generate table of contents
    generate_toc >> "$TEMP_REPORT"
    
    # Run Information
    cat >> "$TEMP_REPORT" << EOF
## Run Information

| Property | Value |
|----------|-------|
| Timestamp | $TIMESTAMP |
| Run ID | $RUN_ID |
| Hostname | $(hostname) |
| User | $(whoami) |
| Working Directory | $(pwd) |
| Shell | $SHELL |

EOF

    # Git metadata
    capture_git_metadata >> "$TEMP_REPORT"
    
    # Artifacts index
    cat >> "$TEMP_REPORT" << EOF
## Artifacts Index

### Test Artifacts Directory: $ARTIFACTS_DIR

| File | Size (bytes) | SHA256 |
|------|--------------|--------|
EOF

    if [[ -d "$ARTIFACTS_DIR" ]]; then
        find "$ARTIFACTS_DIR" -type f | sort | while read -r file; do
            get_file_info "$file" >> "$TEMP_REPORT"
        done
    else
        echo "| MISSING | MISSING | Directory $ARTIFACTS_DIR does not exist |" >> "$TEMP_REPORT"
    fi
    
    cat >> "$TEMP_REPORT" << EOF

### Reports Directory: $REPORTS_DIR

| File | Size (bytes) | SHA256 |
|------|--------------|--------|
EOF

    if [[ -d "$REPORTS_DIR" ]]; then
        find "$REPORTS_DIR" -type f | sort | while read -r file; do
            get_file_info "$file" >> "$TEMP_REPORT"
        done
    else
        echo "| MISSING | MISSING | Directory $REPORTS_DIR does not exist |" >> "$TEMP_REPORT"
    fi
    
    echo "" >> "$TEMP_REPORT"
    
    # ClickHouse schema snapshot
    capture_clickhouse_schema >> "$TEMP_REPORT"
    
    # API smoke tests
    perform_api_smoke_tests >> "$TEMP_REPORT"
    
    # Key artifacts
    cat >> "$TEMP_REPORT" << EOF
## Key Artifacts

EOF

    # Embed key JSON/TSV/log files
    embed_file_content "$ARTIFACTS_DIR/eps.json" 50 "EPS Metrics" >> "$TEMP_REPORT"
    embed_file_content "$ARTIFACTS_DIR/health.json" 50 "Health Check Results" >> "$TEMP_REPORT"
    embed_file_content "$ARTIFACTS_DIR/e2e-health-metrics.json" 50 "E2E Health Metrics" >> "$TEMP_REPORT"
    embed_file_content "$ARTIFACTS_DIR/search_sample.json" 30 "Search Sample Results" >> "$TEMP_REPORT"
    embed_file_content "$ARTIFACTS_DIR/ch_eps_query.json" 30 "ClickHouse EPS Query" >> "$TEMP_REPORT"
    
    # SSE test summaries
    cat >> "$TEMP_REPORT" << EOF
## SSE Test Summaries

EOF
    embed_file_content "$ARTIFACTS_DIR/e2e-sse.json" 50 "SSE Test Results" >> "$TEMP_REPORT"
    
    # Lint status
    cat >> "$TEMP_REPORT" << EOF
## Lint Status

### Rustfmt Check

\`\`\`
EOF
    
    if (cd siem_tools && cargo fmt --check 2>&1 | head -20) >> "$TEMP_REPORT"; then
        echo "✅ Code formatting is correct" >> "$TEMP_REPORT"
    else
        echo "⚠️ Code formatting issues found" >> "$TEMP_REPORT"
    fi
    
    cat >> "$TEMP_REPORT" << EOF
\`\`\`

### Clippy Check

\`\`\`
EOF
    
    if (cd siem_tools && cargo clippy --all-targets --no-deps -- -D warnings 2>&1 | head -30) >> "$TEMP_REPORT"; then
        echo "✅ No clippy warnings" >> "$TEMP_REPORT"
    else
        echo "⚠️ Clippy warnings found" >> "$TEMP_REPORT"
    fi
    
    echo "\`\`\`" >> "$TEMP_REPORT"
    echo "" >> "$TEMP_REPORT"
    
    # Schema parity
    cat >> "$TEMP_REPORT" << EOF
## Schema Parity

EOF
    embed_file_content "ch_schema_expected.json" 50 "Expected ClickHouse Schema" >> "$TEMP_REPORT"
    embed_file_content "ch_schema_actual.json" 50 "Actual ClickHouse Schema" >> "$TEMP_REPORT"
    embed_file_content "ch_schema_diff.json" 50 "Schema Differences" >> "$TEMP_REPORT"
    
    # Parsing harness
    cat >> "$TEMP_REPORT" << EOF
## Parsing Harness

EOF
    embed_file_content "parse_metrics_summary.tsv" 50 "Parse Metrics Summary" >> "$TEMP_REPORT"
    embed_file_content "parse_fail_samples.json" 30 "Parse Failure Samples" >> "$TEMP_REPORT"
    
    # Status reports
    cat >> "$TEMP_REPORT" << EOF
## Status Reports

EOF
    embed_file_content "status.md" 100 "Current Status" >> "$TEMP_REPORT"
    
    # Integration reports
    cat >> "$TEMP_REPORT" << EOF
## Integration Reports

EOF
    embed_file_content "$REPORTS_DIR/integration_status.md" 50 "Integration Status" >> "$TEMP_REPORT"
    embed_file_content "$REPORTS_DIR/integration_findings.json" 50 "Integration Findings" >> "$TEMP_REPORT"
    embed_file_content "$REPORTS_DIR/audit_completion_summary.md" 50 "Audit Completion Summary" >> "$TEMP_REPORT"
    
    # Quick indicators comparison
    if [[ -f "$REPORT_FILE" ]]; then
        cat >> "$TEMP_REPORT" << EOF
## Changes Since Last Run

### Quick Indicators Comparison

EOF
        
        # Extract quick indicators from previous report if it exists
        if grep -A 10 "Quick Indicators" "$REPORT_FILE" >/dev/null 2>&1; then
            echo "Previous run indicators found - comparison would go here" >> "$TEMP_REPORT"
        else
            echo "No previous quick indicators found for comparison" >> "$TEMP_REPORT"
        fi
        echo "" >> "$TEMP_REPORT"
    fi
    
    # Footer
    cat >> "$TEMP_REPORT" << EOF
---

**Report Generation Completed:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")  
**Total Artifacts Processed:** $(find "$ARTIFACTS_DIR" "$REPORTS_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')  
**Report Generator Version:** 1.0  
EOF

    # Move temp file to final location atomically
    mv "$TEMP_REPORT" "$REPORT_FILE"
    
    log_info "Report generated successfully: $REPORT_FILE"
}

# Main execution
main() {
    log_info "Starting final report generation..."
    log_info "Run ID: $RUN_ID"
    log_info "Timestamp: $TIMESTAMP"
    
    # Check for critical dependencies
    local missing_deps=()
    
    if [[ ! -d "$ARTIFACTS_DIR" ]]; then
        log_warn "Artifacts directory missing: $ARTIFACTS_DIR"
    fi
    
    if [[ ! -d "$REPORTS_DIR" ]]; then
        log_warn "Reports directory missing: $REPORTS_DIR"
    fi
    
    # Generate the report
    generate_report
    
    # Validate the report was created
    if [[ ! -f "$REPORT_FILE" ]]; then
        log_error "Failed to create report file: $REPORT_FILE"
        exit 1
    fi
    
    local report_size=$(stat -f%z "$REPORT_FILE" 2>/dev/null || stat -c%s "$REPORT_FILE" 2>/dev/null)
    log_info "Report created successfully: $REPORT_FILE ($report_size bytes)"
    
    # Check for critical missing files
    local critical_missing=0
    
    if [[ ! -f "$ARTIFACTS_DIR/health.json" ]]; then
        log_error "Critical artifact missing: $ARTIFACTS_DIR/health.json"
        critical_missing=1
    fi
    
    if [[ $critical_missing -eq 1 ]]; then
        log_error "Critical files are missing. Report generated but with warnings."
        exit 1
    fi
    
    log_info "Final report generation completed successfully!"
}

# Run main function
main "$@"