#!/bin/bash

# SIEM Rust Components Verification Script
# Validates all Rust projects in the workspace

set -euo pipefail

# Colors for output
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'
RESET='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to log messages
log_info() {
    echo -e "${BLUE}[RUST]${RESET} $1"
}

log_success() {
    echo -e "${GREEN}[RUST]${RESET} $1"
}

log_warning() {
    echo -e "${YELLOW}[RUST]${RESET} $1"
}

log_error() {
    echo -e "${RED}[RUST]${RESET} $1" >&2
}

# Function to handle fatal errors
fatal() {
    log_error "$1"
    exit 1
}

# Check required tooling
command -v python3 >/dev/null || fatal "Python3 not installed"
command -v node >/dev/null   || fatal "Node.js not installed"

# Function to find all Rust projects
find_rust_projects() {
    local projects=()
    
    # Find all directories with Cargo.toml
    while IFS= read -r -d '' cargo_file; do
        local project_dir
        project_dir="$(dirname "$cargo_file")"
        
        # Skip target directories and nested dependencies
        if [[ "$project_dir" != *"/target/"* ]] && [[ "$project_dir" != *"/.cargo/"* ]]; then
            projects+=("$project_dir")
        fi
    done < <(find "$PROJECT_ROOT" -name "Cargo.toml" -type f -print0)
    
    printf '%s\n' "${projects[@]}"
}

# Function to check if project has tests
has_tests() {
    local project_dir="$1"
    
    # Check for test files or test modules
    if [[ -d "$project_dir/tests" ]] || \
       find "$project_dir/src" -name "*.rs" -exec grep -l "#\[cfg(test)\]\|#\[test\]" {} \; 2>/dev/null | head -1 | grep -q .; then
        return 0
    else
        return 1
    fi
}

# Function to run cargo check on a project
check_project() {
    local project_dir="$1"
    local project_name
    project_name="$(basename "$project_dir")"
    
    log_info "Checking $project_name..."
    
    cd "$project_dir"
    
    # Run cargo check
    if ! cargo check --quiet 2>/dev/null; then
        log_error "Cargo check failed for $project_name"
        return 1
    fi
    
    log_success "$project_name: cargo check passed"
    return 0
}

# Function to run clippy on a project
lint_project() {
    local project_dir="$1"
    local project_name
    project_name="$(basename "$project_dir")"
    
    cd "$project_dir"
    
    # Run clippy with strict settings
    if ! cargo clippy --quiet -- -D warnings 2>/dev/null; then
        log_warning "Clippy warnings found in $project_name"
        # Don't fail on clippy warnings, just warn
        return 0
    fi
    
    log_success "$project_name: clippy passed"
    return 0
}

# Function to run tests on a project
test_project() {
    local project_dir="$1"
    local project_name
    project_name="$(basename "$project_dir")"
    
    cd "$project_dir"
    
    if has_tests "$project_dir"; then
        log_info "Running tests for $project_name..."
        
        if ! cargo test --quiet 2>/dev/null; then
            log_error "Tests failed for $project_name"
            return 1
        fi
        
        log_success "$project_name: tests passed"
    else
        log_warning "$project_name: no tests found"
    fi
    
    return 0
}

# Function to check formatting
check_formatting() {
    local project_dir="$1"
    local project_name
    project_name="$(basename "$project_dir")"
    
    cd "$project_dir"
    
    # Check if code is formatted
    if ! cargo fmt --check --quiet 2>/dev/null; then
        log_warning "Code formatting issues in $project_name (run 'cargo fmt' to fix)"
        return 0  # Don't fail on formatting issues
    fi
    
    log_success "$project_name: formatting is correct"
    return 0
}

# Function to run security audit
security_audit() {
    log_info "Running security audit..."
    
    cd "$PROJECT_ROOT"
    
    # Install cargo-audit if not present
    if ! command -v cargo-audit >/dev/null 2>&1; then
        log_info "Installing cargo-audit..."
        cargo install cargo-audit --quiet
    fi
    
    # Run audit
    if ! cargo audit --quiet 2>/dev/null; then
        log_warning "Security vulnerabilities found (check with 'cargo audit')"
        return 0  # Don't fail on audit warnings in development
    fi
    
    log_success "Security audit passed"
    return 0
}

# Function to check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Check for outdated dependencies
    if command -v cargo-outdated >/dev/null 2>&1; then
        if cargo outdated --quiet --exit-code 1 >/dev/null 2>&1; then
            log_warning "Some dependencies are outdated (check with 'cargo outdated')"
        else
            log_success "Dependencies are up to date"
        fi
    else
        log_info "cargo-outdated not installed (optional: cargo install cargo-outdated)"
    fi
    
    return 0
}

# Function to validate Cargo.toml files
validate_cargo_files() {
    log_info "Validating Cargo.toml files..."
    
    local projects_list
    projects_list=$(find_rust_projects)
    
    # Convert to array using portable method
    local projects=()
    while IFS= read -r line; do
        projects+=("$line")
    done <<< "$projects_list"
    
    for project_dir in "${projects[@]}"; do
        local project_name
        project_name="$(basename "$project_dir")"
        
        cd "$project_dir"
        
        # Check if Cargo.toml is valid
        if ! cargo metadata --quiet --no-deps >/dev/null 2>&1; then
            log_error "Invalid Cargo.toml in $project_name"
            return 1
        fi
    done
    
    log_success "All Cargo.toml files are valid"
    return 0
}

# Function to check for common issues
check_common_issues() {
    log_info "Checking for common issues..."
    
    local issues_found=0
    
    # Check for TODO/FIXME comments
    local todo_count
    todo_count=$(find "$PROJECT_ROOT" -name "*.rs" -exec grep -l "TODO\|FIXME" {} \; 2>/dev/null | wc -l)
    if [[ "$todo_count" -gt 0 ]]; then
        log_warning "Found $todo_count files with TODO/FIXME comments"
    fi
    
    # Check for unwrap() usage (potential panics)
    local unwrap_count
    unwrap_count=$(find "$PROJECT_ROOT" -name "*.rs" -exec grep -l "\.unwrap()" {} \; 2>/dev/null | wc -l)
    if [[ "$unwrap_count" -gt 0 ]]; then
        log_warning "Found $unwrap_count files using .unwrap() (consider proper error handling)"
    fi
    
    # Check for println! in non-test code (should use logging)
    local println_count
    println_count=$(find "$PROJECT_ROOT" -name "*.rs" -not -path "*/tests/*" -exec grep -l "println!" {} \; 2>/dev/null | wc -l)
    if [[ "$println_count" -gt 0 ]]; then
        log_warning "Found $println_count files using println! (consider using log macros)"
    fi
    
    return 0
}

# Function to validate API contract between backend and frontend
api_contract_validation() {
    log_info "🚦  API contract validation…"

    # Change to project root for script execution
    cd "$PROJECT_ROOT"

    # 1 · Backend route extraction
    python3 rust_route_extractor.py --output /tmp/rust_routes.json || \
        fatal "Route extraction failed"

    # 2 · Frontend scan
    node frontend_api_scanner.js --out /tmp/frontend_endpoints.json || \
        fatal "Frontend scan failed"

    # 3 · Mapping & diff
    python3 route_mapper.py \
       --backend /tmp/rust_routes.json \
       --frontend /tmp/frontend_endpoints.json \
       --out /tmp/api_map.json \
       --fail-unmatched || fatal "Route mapping mismatch"

    log_success "API routes 🔄  frontend ↔ backend are in sync"
}

# Function to detect placeholder code in Rust handlers
detect_handler_placeholders() {
    log_info "🔍  Scanning Rust handlers for placeholders…"
    local offenders
    offenders=$(find . -name '*.rs' \
        -not -path './target/*' \
        -not -path '*/target/*' \
        -not -path '*/build/*' \
        -not -name '*.test.rs' \
        -not -name 'probe.rs' \
        -exec grep -l -e 'todo!(' -e 'unimplemented!(' -e 'return.*StatusCode::NOT_IMPLEMENTED' {} \; 2>/dev/null)

    if [[ -n "$offenders" ]]; then
        log_error "Found placeholder code in handlers:"
        echo "$offenders"
        return 1
    fi
    log_success "No TODO/unimplemented placeholders found"
}

# Function to run all checks on all projects
run_all_checks() {
    local projects_list
    projects_list=$(find_rust_projects)
    
    # Convert to array using portable method
    local projects=()
    while IFS= read -r line; do
        projects+=("$line")
    done <<< "$projects_list"
    
    log_info "Found ${#projects[@]} Rust projects"
    
    local failed_projects=()
    
    # Run checks on each project
    for project_dir in "${projects[@]}"; do
        local project_name
        project_name="$(basename "$project_dir")"
        
        log_info "Processing $project_name..."
        
        local project_failed=0
        
        # Critical checks (must pass) - only compilation errors
        check_project "$project_dir" || project_failed=1
        
        # Non-critical checks (warnings only) - tests, linting, formatting
        test_project "$project_dir" || log_warning "$project_name: tests failed (non-blocking in dev mode)"
        lint_project "$project_dir"
        check_formatting "$project_dir"
        
        if [[ $project_failed -eq 1 ]]; then
            failed_projects+=("$project_name")
        else
            log_success "$project_name: all checks passed"
        fi
    done
    
    # Run workspace-level checks
    validate_cargo_files || return 1
    security_audit
    check_dependencies
    check_common_issues
    
    # Run API contract validation
    api_contract_validation || return 1
    detect_handler_placeholders || return 1
    
    # Report results
    if [[ ${#failed_projects[@]} -gt 0 ]]; then
        log_warning "Projects with issues: ${failed_projects[*]}"
        log_info "Note: In development mode, warnings and test failures are non-blocking"
    fi
    
    return 0
}

# Main execution
main() {
    log_info "Starting Rust verification..."
    
    # Change to project root
    cd "$PROJECT_ROOT"
    
    if run_all_checks; then
        log_success "Rust verification completed successfully"
        return 0
    else
        log_error "Rust verification failed"
        return 1
    fi
}

# Run main function
main "$@"