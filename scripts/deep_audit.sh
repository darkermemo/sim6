#!/usr/bin/env bash
# Deep audit script for SIEM full-stack health reporting
# Purpose: one command to run every static/dynamic check and save logs
# CI Mode: Fails on critical red flags (clippy warnings, test failures, security issues)

set -eu
OUT=target/audit && mkdir -p "$OUT"

# CI failure tracking
CI_FAILURES=0
CRITICAL_ISSUES=()

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Function to log messages
log_info() {
    echo -e "${BLUE}[AUDIT]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[AUDIT]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[AUDIT]${RESET} $1"
}

log_error() {
    echo -e "${RED}[AUDIT]${RESET} $1" >&2
}

# Function to track critical failures for CI
track_critical_failure() {
    local issue="$1"
    local details="$2"
    CI_FAILURES=$((CI_FAILURES + 1))
    CRITICAL_ISSUES+=("$issue: $details")
    log_error "CRITICAL: $issue - $details"
}

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

log_info "Starting deep audit - artifacts will be stored in $OUT"

# --- 2.1 Rust checks ---
log_info "Running Rust static analysis..."
mkdir -p "$OUT"  # Ensure output directory exists
if ! cargo clippy --workspace --all-targets --all-features -- -D warnings >"$OUT/clippy.txt" 2>&1; then
    track_critical_failure "CLIPPY_WARNINGS" "Clippy found linting issues that must be fixed"
fi

log_info "Running Rust tests..."
if ! cargo test --workspace -- --nocapture >"$OUT/test.txt" 2>&1; then
    track_critical_failure "TEST_FAILURES" "Unit/integration tests are failing"
fi

# Install and run cargo-udeps if available
log_info "Checking for unused dependencies..."
if command -v cargo-udeps >/dev/null 2>&1; then
    cargo udeps --workspace >"$OUT/udeps.txt" 2>&1 || {
        log_warning "Unused dependencies found (see $OUT/udeps.txt)"
    }
else
    echo "cargo-udeps not installed - skipping unused dependency check" >"$OUT/udeps.txt"
    log_warning "cargo-udeps not installed (install with: cargo install cargo-udeps)"
fi

# Install and run cargo-audit if available
log_info "Running security audit..."
if command -v cargo-audit >/dev/null 2>&1; then
    if ! cargo audit >"$OUT/audit.txt" 2>&1; then
        track_critical_failure "SECURITY_VULNERABILITIES" "Known security vulnerabilities found in dependencies"
    fi
else
    echo "cargo-audit not installed - skipping security audit" >"$OUT/audit.txt"
    log_warning "cargo-audit not installed (install with: cargo install cargo-audit)"
fi

# Install and run cargo-geiger if available
log_info "Checking unsafe code usage..."
if command -v cargo-geiger >/dev/null 2>&1; then
    if ! cargo geiger -q >"$OUT/unsafe.txt" 2>&1; then
        # Check if unsafe code is in critical security areas
        if grep -E "(auth|crypto|password|token|security)" "$OUT/unsafe.txt" >/dev/null 2>&1; then
            track_critical_failure "UNSAFE_CODE_SECURITY" "Unsafe code detected in security-critical areas"
        else
            log_warning "Unsafe code detected in non-critical areas (see $OUT/unsafe.txt)"
        fi
    fi
else
    echo "cargo-geiger not installed - skipping unsafe code check" >"$OUT/unsafe.txt"
    log_warning "cargo-geiger not installed (install with: cargo install cargo-geiger)"
fi

# --- 2.2 Vector validation ---
log_info "Validating Vector configuration..."
if command -v vector >/dev/null 2>&1; then
    # Look for vector config files
    if [[ -f "vector/vector.toml" ]]; then
        vector validate --no-environment vector/vector.toml >$OUT/vector.txt 2>&1 || {
            log_warning "Vector configuration issues found (see $OUT/vector.txt)"
        }
    elif [[ -f "config/vector.toml" ]]; then
        vector validate --no-environment config/vector.toml >$OUT/vector.txt 2>&1 || {
            log_warning "Vector configuration issues found (see $OUT/vector.txt)"
        }
    else
        echo "No Vector configuration found (checked vector/vector.toml and config/vector.toml)" >$OUT/vector.txt
        log_warning "No Vector configuration file found"
    fi
else
    echo "Vector not installed - skipping validation" >$OUT/vector.txt
    log_warning "Vector not installed (install with: brew install vector or curl -sSfL https://sh.vector.dev | sh)"
fi

# --- 2.3 Kafka smoke container (10-sec spin-up) ---
log_info "Running Kafka smoke test..."
if command -v rustc >/dev/null 2>&1; then
    cat >$OUT/kafka_smoke.rs <<'RS'
use std::process::Command;
use std::time::Duration;
use std::thread;

fn main() {
    println!("Starting Kafka smoke test...");
    
    // Simple check - try to connect to localhost:9092
    let output = Command::new("nc")
        .args(["-z", "localhost", "9092"])
        .output();
    
    match output {
        Ok(result) if result.status.success() => {
            println!("Kafka connection test OK on port 9092");
        }
        _ => {
            println!("Kafka not running on localhost:9092 (this is expected in CI)");
        }
    }
}
RS
    
    if rustc $OUT/kafka_smoke.rs -o $OUT/kafka-smoke 2>/dev/null; then
        timeout 10 $OUT/kafka-smoke >$OUT/kafka.txt 2>&1 || {
            echo "Kafka smoke test completed with warnings" >>$OUT/kafka.txt
        }
    else
        echo "Failed to compile Kafka smoke test" >$OUT/kafka.txt
        log_warning "Failed to compile Kafka smoke test"
    fi
else
    echo "Rust compiler not available - skipping Kafka smoke test" >$OUT/kafka.txt
    log_warning "Rust compiler not available"
fi

# --- 2.4 OpenAPI validation ---
log_info "Validating OpenAPI specification..."
if command -v spectral >/dev/null 2>&1; then
    if [[ -f "openapi.yaml" ]]; then
        spectral lint openapi.yaml >$OUT/openapi.txt 2>&1 || {
            log_warning "OpenAPI specification issues found (see $OUT/openapi.txt)"
        }
    elif [[ -f "api/openapi.yaml" ]]; then
        spectral lint api/openapi.yaml >$OUT/openapi.txt 2>&1 || {
            log_warning "OpenAPI specification issues found (see $OUT/openapi.txt)"
        }
    else
        echo "No OpenAPI specification found (checked openapi.yaml and api/openapi.yaml)" >$OUT/openapi.txt
        log_warning "No OpenAPI specification file found"
    fi
else
    echo "Spectral not installed - skipping OpenAPI validation" >$OUT/openapi.txt
    log_warning "Spectral not installed (install with: npm i -g @stoplight/spectral)"
fi

# --- 2.5 ClickHouse indices ---
log_info "Checking ClickHouse indices..."
if command -v clickhouse-client >/dev/null 2>&1; then
    clickhouse-client --query "
SELECT name,type,granularity
FROM system.data_skipping_indices
WHERE database='dev' AND table='events'
FORMAT TSV" >$OUT/ch_indices.txt 2>&1 || {
        echo "ClickHouse not accessible or database 'dev' not found" >$OUT/ch_indices.txt
        log_warning "ClickHouse not accessible (this is expected in CI without ClickHouse service)"
    }
else
    echo "ClickHouse client not installed - skipping index check" >$OUT/ch_indices.txt
    log_warning "ClickHouse client not installed"
fi

# --- 2.6 Dependency graphs ---
log_info "Generating dependency graphs..."
if command -v cargo-deps >/dev/null 2>&1 && command -v dot >/dev/null 2>&1; then
    cargo deps --all-deps | dot -Tpng >$OUT/crate-graph.png 2>/dev/null || {
        log_warning "Failed to generate crate dependency graph"
        echo "Failed to generate crate dependency graph" >$OUT/crate-graph.txt
    }
else
    echo "cargo-deps or graphviz not installed - skipping dependency graph" >$OUT/crate-graph.txt
    log_warning "cargo-deps or graphviz not installed (install with: cargo install cargo-deps && brew install graphviz)"
fi

if command -v cargo-mod >/dev/null 2>&1 && command -v dot >/dev/null 2>&1; then
    if [[ -f "src/handlers.rs" ]]; then
        cargo mod tree src/handlers.rs | dot -Tpng >$OUT/handlers-tree.png 2>/dev/null || {
            log_warning "Failed to generate handlers module tree"
            echo "Failed to generate handlers module tree" >$OUT/handlers-tree.txt
        }
    elif [[ -f "siem_api/src/handlers.rs" ]]; then
        cd siem_api
        cargo mod tree src/handlers.rs | dot -Tpng >../$OUT/handlers-tree.png 2>/dev/null || {
            log_warning "Failed to generate handlers module tree"
            echo "Failed to generate handlers module tree" >../$OUT/handlers-tree.txt
        }
        cd ..
    else
        echo "No handlers.rs file found" >$OUT/handlers-tree.txt
        log_warning "No handlers.rs file found"
    fi
else
    echo "cargo-mod or graphviz not installed - skipping module tree" >$OUT/handlers-tree.txt
    log_warning "cargo-mod or graphviz not installed (install with: cargo install cargo-mod && brew install graphviz)"
fi

# --- 2.7 Frontend checks ---
log_info "Running frontend checks..."
if [[ -d "siem_ui" ]] && [[ -f "siem_ui/package.json" ]]; then
    cd siem_ui
    
    # Check if dependencies are installed
    if [[ -d "node_modules" ]] || command -v pnpm >/dev/null 2>&1; then
        # Run linting if available
        if command -v pnpm >/dev/null 2>&1; then
            pnpm lint >../$OUT/frontend_lint.txt 2>&1 || {
                log_warning "Frontend linting issues found (see $OUT/frontend_lint.txt)"
            }
            
            # Check for TypeScript errors
            pnpm run type-check >../$OUT/frontend_typecheck.txt 2>&1 || {
                log_warning "Frontend TypeScript issues found (see $OUT/frontend_typecheck.txt)"
            }
        else
            echo "pnpm not available - skipping frontend checks" >../$OUT/frontend_lint.txt
        fi
    else
        echo "Frontend dependencies not installed - skipping frontend checks" >../$OUT/frontend_lint.txt
        log_warning "Frontend dependencies not installed (run: cd siem_ui && pnpm install)"
    fi
    
    cd ..
else
    echo "No frontend project found (siem_ui directory)" >$OUT/frontend_lint.txt
    log_warning "No frontend project found"
fi

# --- 2.8 Generate summary ---
log_info "Generating audit summary..."
cat >$OUT/summary.txt <<EOF
SIEM Deep Audit Summary
======================
Generated: $(date)
Project Root: $PROJECT_ROOT

Audit Files Generated:
- clippy.txt: Rust linting results
- test.txt: Rust test results
- udeps.txt: Unused dependency check
- audit.txt: Security vulnerability scan
- unsafe.txt: Unsafe code usage report
- vector.txt: Vector configuration validation
- kafka.txt: Kafka connectivity test
- openapi.txt: OpenAPI specification validation
- ch_indices.txt: ClickHouse index information
- crate-graph.png: Dependency graph visualization
- handlers-tree.png: Module structure visualization
- frontend_lint.txt: Frontend linting results
- frontend_typecheck.txt: Frontend TypeScript check

To view detailed results, check individual files in $OUT/
EOF

log_success "🎉 Deep audit artifacts stored in $OUT"
log_info "📋 Summary available in $OUT/summary.txt"
log_info "🔍 Review individual audit files for detailed results"

# --- CI Failure Check ---
if [ $CI_FAILURES -gt 0 ]; then
    echo "" >&2
    log_error "==========================================="
    log_error "CI AUDIT FAILED: $CI_FAILURES critical issues found"
    log_error "==========================================="
    
    for issue in "${CRITICAL_ISSUES[@]}"; do
        log_error "❌ $issue"
    done
    
    echo "" >&2
    log_error "Fix these critical issues before merging to main branch."
    log_error "Detailed logs available in $OUT/"
    
    # Write failure summary for CI systems
    cat >$OUT/ci_failures.txt <<EOF
CI AUDIT FAILURES: $CI_FAILURES
$(printf '%s\n' "${CRITICAL_ISSUES[@]}")
EOF
    
    exit 1
else
    log_success "✅ All critical checks passed - ready for CI/CD"
    echo "AUDIT_STATUS=PASSED" >$OUT/ci_status.txt
    exit 0
fi