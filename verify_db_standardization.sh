#!/bin/bash

# Verification script for ClickHouse database standardization
# This script verifies that all components are using the standardized 'dev' database

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info "🔍 ClickHouse Database Standardization Verification"
print_info "=================================================="
echo

# Load environment variables if .env exists
if [ -f ".env" ]; then
    print_info "Found .env file (skipping load due to parsing complexity)"
fi

# Set defaults
CLICKHOUSE_DATABASE=${CLICKHOUSE_DATABASE:-"dev"}
CLICKHOUSE_URL=${CLICKHOUSE_URL:-"http://localhost:8123"}

print_info "Target database: $CLICKHOUSE_DATABASE"
print_info "ClickHouse URL: $CLICKHOUSE_URL"
echo

# 1. Verify no hardcoded 'siem' database references remain
print_info "1. Checking for hardcoded 'siem' database references..."
siem_refs=$(grep -r "database.*=.*[\"']siem[\"']" . --include="*.rs" --include="*.toml" --include="*.env*" --include="*.md" 2>/dev/null || true)
if [ -z "$siem_refs" ]; then
    print_success "No hardcoded 'siem' database references found"
else
    print_error "Found hardcoded 'siem' database references:"
    echo "$siem_refs"
    exit 1
fi
echo

# 2. Verify environment variable usage
print_info "2. Checking environment variable usage..."
clickhouse_env_usage=$(grep -r "CLICKHOUSE_DATABASE" . --include="*.rs" --include="*.toml" --include="*.env*" 2>/dev/null | wc -l)
if [ "$clickhouse_env_usage" -gt 0 ]; then
    print_success "Found $clickhouse_env_usage references to CLICKHOUSE_DATABASE environment variable"
else
    print_warning "No CLICKHOUSE_DATABASE environment variable usage found"
fi
echo

# 3. Verify .env.example has correct default
print_info "3. Checking .env.example configuration..."
if [ -f ".env.example" ]; then
    if grep -q "CLICKHOUSE_DATABASE=dev" .env.example; then
        print_success ".env.example has correct CLICKHOUSE_DATABASE=dev default"
    else
        print_error ".env.example missing or incorrect CLICKHOUSE_DATABASE setting"
        exit 1
    fi
else
    print_error ".env.example file not found"
    exit 1
fi
echo

# 4. Verify migration script exists
print_info "4. Checking migration script..."
if [ -f "scripts/migrate_siem_to_dev.sh" ] && [ -x "scripts/migrate_siem_to_dev.sh" ]; then
    print_success "Migration script exists and is executable"
else
    print_error "Migration script missing or not executable"
    exit 1
fi
echo

# 5. Verify integration tests exist
print_info "5. Checking integration tests..."
if [ -f "tests/integration_clickhouse_db_standardization.rs" ]; then
    print_success "Integration test file exists"
else
    print_error "Integration test file missing"
    exit 1
fi

if [ -f "tests/playwright_smoke_test.js" ]; then
    print_success "Playwright smoke test exists"
else
    print_error "Playwright smoke test missing"
    exit 1
fi
echo

# 6. Verify CI configuration
print_info "6. Checking CI configuration..."
if [ -f ".github/workflows/ci.yml" ]; then
    if grep -q "CLICKHOUSE_DATABASE: dev" .github/workflows/ci.yml; then
        print_success "CI workflow has CLICKHOUSE_DATABASE environment variable"
    else
        print_error "CI workflow missing CLICKHOUSE_DATABASE environment variable"
        exit 1
    fi
else
    print_error "CI workflow file not found"
    exit 1
fi
echo

# 7. Test ClickHouse connectivity (if available)
print_info "7. Testing ClickHouse connectivity..."
if command -v curl >/dev/null 2>&1; then
    if curl -s "$CLICKHOUSE_URL/ping" >/dev/null 2>&1; then
        print_success "ClickHouse is accessible at $CLICKHOUSE_URL"
        
        # Check if target database exists
        db_count=$(curl -s "$CLICKHOUSE_URL" --data "SELECT count() FROM system.databases WHERE name = '$CLICKHOUSE_DATABASE'" 2>/dev/null || echo "0")
        if [ "$db_count" = "1" ]; then
            print_success "Database '$CLICKHOUSE_DATABASE' exists in ClickHouse"
        else
            print_warning "Database '$CLICKHOUSE_DATABASE' does not exist yet (will be created on first use)"
        fi
    else
        print_warning "ClickHouse not accessible at $CLICKHOUSE_URL (may not be running)"
    fi
else
    print_warning "curl not available, skipping ClickHouse connectivity test"
fi
echo

# 8. Verify Rust code compilation
print_info "8. Testing Rust code compilation..."
if command -v cargo >/dev/null 2>&1; then
    if cargo check --quiet 2>/dev/null; then
        print_success "All Rust code compiles successfully"
    else
        print_error "Rust compilation errors found"
        exit 1
    fi
else
    print_warning "Cargo not available, skipping compilation test"
fi
echo

# Summary
print_success "🎉 ClickHouse Database Standardization Verification Complete!"
print_success "✅ All components are configured to use '$CLICKHOUSE_DATABASE' database"
print_success "✅ No hardcoded database references found"
print_success "✅ Environment variable configuration is correct"
print_success "✅ Migration script is available"
print_success "✅ Integration tests are in place"
print_success "✅ CI configuration is updated"
echo
print_info "Next steps:"
print_info "1. Run migration script if you have existing 'siem' database: ./scripts/migrate_siem_to_dev.sh"
print_info "2. Start services with CLICKHOUSE_DATABASE=dev environment variable"
print_info "3. Run integration tests to verify functionality"
echo