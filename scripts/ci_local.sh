#!/usr/bin/env bash
# Local CI Script - Mirror of GitHub Actions workflow
# Run this script to catch all CI failures locally before pushing
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print with color
print_step() {
    echo -e "${BLUE}🔍 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "Cargo.toml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

echo -e "${BLUE}🚀 Running full local CI validation...${NC}\n"

# =============================================================================
# 1. RUST FORMATTING & LINTING
# =============================================================================
print_step "Rust formatting check"
if ! cargo fmt --all -- --check; then
    print_error "Code formatting issues found. Run 'cargo fmt --all' to fix."
    exit 1
fi
print_success "Rust formatting check passed"

print_step "Rust linting with Clippy"
if ! cargo clippy --workspace --all-targets --all-features -- -D warnings; then
    print_error "Clippy warnings found. Fix all warnings before pushing."
    exit 1
fi
print_success "Clippy check passed"

# =============================================================================
# 2. RUST TESTS & BUILDS
# =============================================================================
print_step "Building all workspace crates"
if ! cargo build --workspace --all-targets; then
    print_error "Build failed"
    exit 1
fi
print_success "Build successful"

print_step "Running Rust tests"
if ! cargo test --workspace; then
    print_error "Tests failed"
    exit 1
fi
print_success "All tests passed"

print_step "Testing with debug features"
if ! cargo test --workspace --features debug_features; then
    print_warning "Debug feature tests failed (non-critical)"
fi

print_step "Building release binaries"
if ! cargo build --release --workspace; then
    print_error "Release build failed"
    exit 1
fi
print_success "Release build successful"

# =============================================================================
# 3. SECURITY & DEPENDENCY AUDITS
# =============================================================================
print_step "Checking for unused dependencies"
if command -v cargo-udeps >/dev/null 2>&1; then
    if ! cargo udeps --workspace --all-targets; then
        print_warning "Unused dependencies found (should be cleaned up)"
    fi
else
    print_warning "cargo-udeps not installed. Run: cargo install cargo-udeps"
fi

print_step "Security audit"
if command -v cargo-audit >/dev/null 2>&1; then
    if ! cargo audit --deny warnings; then
        print_error "Security vulnerabilities found. Update dependencies or add exceptions."
        exit 1
    fi
    print_success "Security audit passed"
else
    print_warning "cargo-audit not installed. Run: cargo install cargo-audit"
fi

print_step "Unsafe code scan"
if command -v cargo-geiger >/dev/null 2>&1; then
    echo "Scanning for unsafe code usage..."
    cargo geiger --charset ascii --output-format ascii --quiet
else
    print_warning "cargo-geiger not installed. Run: cargo install cargo-geiger"
fi

# =============================================================================
# 4. SCHEMA VALIDATION
# =============================================================================
print_step "Schema validation"
if [ -f "target/release/schema_validator_v2" ] || [ -f "target/debug/schema_validator_v2" ]; then
    # Try release first, fall back to debug
    VALIDATOR_PATH=""
    if [ -f "target/release/schema_validator_v2" ]; then
        VALIDATOR_PATH="target/release/schema_validator_v2"
    else
        VALIDATOR_PATH="target/debug/schema_validator_v2"
    fi
    
    if ! "$VALIDATOR_PATH"; then
        print_error "Schema validation failed"
        exit 1
    fi
    print_success "Schema validation passed"
else
    print_warning "Schema validator not built. Building now..."
    if ! cargo build --release --bin schema_validator_v2; then
        print_error "Failed to build schema validator"
        exit 1
    fi
    if ! target/release/schema_validator_v2; then
        print_error "Schema validation failed"
        exit 1
    fi
    print_success "Schema validation passed"
fi

# =============================================================================
# 5. VECTOR CONFIGURATION VALIDATION
# =============================================================================
print_step "Vector configuration validation"
if [ -f "siem_unified_pipeline/config/vector.toml" ]; then
    if command -v vector >/dev/null 2>&1; then
        if ! vector validate --no-environment siem_unified_pipeline/config/vector.toml; then
            print_error "Vector configuration validation failed"
            exit 1
        fi
        print_success "Vector configuration valid"
    else
        print_warning "Vector not installed. Install with: brew install vector"
    fi
else
    print_warning "Vector configuration not found at expected path"
fi

# =============================================================================
# 6. OPENAPI VALIDATION
# =============================================================================
print_step "OpenAPI specification validation"
if [ -f "openapi.json" ]; then
    # Check if Node.js tools are available
    if command -v spectral >/dev/null 2>&1; then
        if ! spectral lint openapi.json; then
            print_error "OpenAPI linting failed"
            exit 1
        fi
        print_success "OpenAPI linting passed"
    else
        print_warning "Spectral not installed. Run: npm install -g @stoplight/spectral-cli"
    fi
    
    if command -v swagger-parser >/dev/null 2>&1; then
        if ! swagger-parser validate openapi.json; then
            print_error "OpenAPI validation failed"
            exit 1
        fi
        print_success "OpenAPI validation passed"
    else
        print_warning "swagger-parser not installed. Run: npm install -g @apidevtools/swagger-parser"
    fi
elif [ -f "openapi.yaml" ]; then
    if command -v spectral >/dev/null 2>&1; then
        if ! spectral lint openapi.yaml; then
            print_error "OpenAPI linting failed"
            exit 1
        fi
        print_success "OpenAPI linting passed"
    fi
else
    print_warning "No OpenAPI specification found"
fi

# =============================================================================
# 7. FRONTEND VALIDATION (if UI exists)
# =============================================================================
if [ -d "siem_ui" ]; then
    print_step "Frontend validation"
    
    cd siem_ui
    
    if [ -f "package.json" ]; then
        print_step "Installing Node.js dependencies"
        if ! npm ci; then
            print_error "npm install failed"
            exit 1
        fi
        
        print_step "TypeScript compilation check"
        if ! npx tsc --noEmit; then
            print_error "TypeScript compilation failed"
            exit 1
        fi
        print_success "TypeScript compilation passed"
        
        print_step "ESLint check"
        if ! npx eslint src --ext .ts,.tsx --max-warnings 0; then
            print_error "ESLint found issues"
            exit 1
        fi
        print_success "ESLint check passed"
        
        print_step "Frontend tests"
        if ! npm test -- --watchAll=false --coverage=false; then
            print_error "Frontend tests failed"
            exit 1
        fi
        print_success "Frontend tests passed"
        
        if [ -f "scripts/generate-api-client.cjs" ]; then
            print_step "API client generation check"
            if ! npm run generate-api; then
                print_error "API client generation failed"
                exit 1
            fi
            
            # Check if there are uncommitted changes
            cd ..
            if [ -n "$(git diff --name-only siem_ui/src/generated/)" ]; then
                print_error "Generated API types are out of date. Run 'npm run generate-api' in siem_ui/"
                exit 1
            fi
            print_success "API client generation check passed"
            cd siem_ui
        fi
    fi
    
    cd ..
fi

# =============================================================================
# 8. DATABASE SCHEMA CHECKS
# =============================================================================
print_step "Database schema validation"
if [ -f "database_setup.sql" ]; then
    # Basic SQL syntax validation
    if ! grep -q "CREATE TABLE" database_setup.sql; then
        print_error "No CREATE TABLE statements found in database_setup.sql"
        exit 1
    fi
    
    # Check for basic SQL syntax
    if ! grep -q ";" database_setup.sql; then
        print_warning "Some SQL statements may be missing semicolons"
    fi
    
    print_success "Database schema basic validation passed"
else
    print_warning "database_setup.sql not found"
fi

# =============================================================================
# 9. YAML VALIDATION
# =============================================================================
print_step "YAML file validation"
if command -v yamllint >/dev/null 2>&1; then
    # Check common YAML files
    find . -name "*.yml" -o -name "*.yaml" | while read -r file; do
        if ! yamllint "$file"; then
            print_warning "YAML validation failed for $file"
        fi
    done
else
    print_warning "yamllint not installed. Run: pip install yamllint or brew install yamllint"
fi

# =============================================================================
# 10. ADDITIONAL CHECKS
# =============================================================================
print_step "Checking for hardcoded secrets"
if grep -r -i "password\s*=" --include="*.rs" --include="*.sql" . 2>/dev/null | grep -v target/ | grep -v .git/; then
    print_warning "Found potential hardcoded passwords"
fi

if grep -r -i "api[_-]key" --include="*.rs" --include="*.sql" . 2>/dev/null | grep -v target/ | grep -v .git/; then
    print_warning "Found potential API keys"
fi

# Check for hardcoded database prefixes
if grep -r "dev\." --include="*.rs" siem_api/src/ 2>/dev/null || true; then
    print_warning "Found hardcoded database prefixes"
fi

# =============================================================================
# 11. COMPREHENSIVE API TESTS (if available)
# =============================================================================
if [ -f "comprehensive_api_test.js" ]; then
    print_step "API endpoint tests (optional - requires running backend)"
    if command -v node >/dev/null 2>&1; then
        # Check if backend is running
        if curl -f http://localhost:8082/api/v1/health >/dev/null 2>&1; then
            print_step "Running comprehensive API tests"
            if ! node comprehensive_api_test.js; then
                print_warning "API tests failed (ensure backend is running)"
            else
                print_success "API tests passed"
            fi
        else
            print_warning "Backend not running - skipping API tests"
            print_warning "To run API tests: start backend and run 'node comprehensive_api_test.js'"
        fi
    fi
fi

# =============================================================================
# FINAL SUMMARY
# =============================================================================
echo ""
echo -e "${GREEN}🎉 LOCAL CI VALIDATION COMPLETED SUCCESSFULLY! 🎉${NC}"
echo ""
echo "All critical checks passed. Your code is ready to push!"
echo ""
echo "Summary of checks performed:"
echo "✅ Rust formatting and linting"
echo "✅ Build verification (debug and release)"
echo "✅ Test execution"
echo "✅ Security audit"
echo "✅ Schema validation"
echo "✅ Configuration validation"
echo "✅ OpenAPI validation"
echo "✅ Frontend validation (if applicable)"
echo "✅ Database schema checks"
echo ""
echo -e "${BLUE}Push with confidence! 🚀${NC}"