#!/usr/bin/env bash
# Workflow Status Display Script
# Shows the current status of the no-surprises CI workflow
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                     NO-SURPRISES CI WORKFLOW STATUS                         ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_section() {
    echo -e "${CYAN}▶ $1${NC}"
    echo "────────────────────────────────────────────────────────────"
}

check_exists() {
    if [ -f "$1" ]; then
        echo -e "✅ ${GREEN}$1${NC}"
        return 0
    else
        echo -e "❌ ${RED}$1 (missing)${NC}"
        return 1
    fi
}

check_executable() {
    if [ -x "$1" ]; then
        echo -e "✅ ${GREEN}$1 (executable)${NC}"
        return 0
    else
        echo -e "❌ ${RED}$1 (not executable)${NC}"
        return 1
    fi
}

check_tool() {
    if command -v "$1" >/dev/null 2>&1; then
        local version=$(eval "$2" 2>/dev/null || echo "unknown")
        echo -e "✅ ${GREEN}$1${NC} ${YELLOW}($version)${NC}"
        return 0
    else
        echo -e "❌ ${RED}$1 (not installed)${NC}"
        return 1
    fi
}

print_header

# =============================================================================
# 1. CORE SCRIPTS STATUS
# =============================================================================
print_section "CORE SCRIPTS"
script_status=0

check_executable "scripts/ci_local.sh" || script_status=1
check_executable "scripts/setup_ci_toolchain.sh" || script_status=1
check_executable "scripts/setup_pre_push_hook.sh" || script_status=1
check_exists "scripts/README.md" || script_status=1

if [ -f "scripts/emergency_push.sh" ]; then
    check_executable "scripts/emergency_push.sh"
else
    echo -e "⚠️  ${YELLOW}scripts/emergency_push.sh (not created yet - run setup_pre_push_hook.sh)${NC}"
fi

echo ""

# =============================================================================
# 2. GIT HOOKS STATUS
# =============================================================================
print_section "GIT HOOKS"
hook_status=0

if [ -f ".git/hooks/pre-push" ]; then
    if [ -x ".git/hooks/pre-push" ]; then
        echo -e "✅ ${GREEN}.git/hooks/pre-push (installed and executable)${NC}"
        
        # Check if it calls our CI script
        if grep -q "scripts/ci_local.sh" .git/hooks/pre-push; then
            echo -e "✅ ${GREEN}Hook calls scripts/ci_local.sh${NC}"
        else
            echo -e "⚠️  ${YELLOW}Hook exists but doesn't call our CI script${NC}"
            hook_status=1
        fi
    else
        echo -e "❌ ${RED}.git/hooks/pre-push (not executable)${NC}"
        hook_status=1
    fi
else
    echo -e "❌ ${RED}.git/hooks/pre-push (not installed)${NC}"
    echo -e "   ${YELLOW}Run: ./scripts/setup_pre_push_hook.sh${NC}"
    hook_status=1
fi

echo ""

# =============================================================================
# 3. REQUIRED TOOLS STATUS
# =============================================================================
print_section "RUST TOOLCHAIN"
rust_status=0

check_tool "rustc" "rustc --version" || rust_status=1
check_tool "cargo" "cargo --version" || rust_status=1
check_tool "rustfmt" "rustfmt --version" || rust_status=1
check_tool "cargo-clippy" "cargo clippy --version" || rust_status=1

echo ""
print_section "CARGO HELPER TOOLS"
cargo_tools_status=0

check_tool "cargo-udeps" "cargo udeps --version" || cargo_tools_status=1
check_tool "cargo-audit" "cargo audit --version" || cargo_tools_status=1
check_tool "cargo-geiger" "cargo geiger --version" || cargo_tools_status=1

echo ""
print_section "VALIDATION TOOLS"
validation_status=0

check_tool "spectral" "spectral --version" || validation_status=1
check_tool "yamllint" "yamllint --version" || validation_status=1

# Optional tools
if command -v vector >/dev/null 2>&1; then
    check_tool "vector" "vector --version"
else
    echo -e "⚠️  ${YELLOW}vector (optional - for Vector config validation)${NC}"
fi

if command -v swagger-parser >/dev/null 2>&1; then
    check_tool "swagger-parser" "swagger-parser --version"
else
    echo -e "⚠️  ${YELLOW}swagger-parser (optional - for OpenAPI validation)${NC}"
fi

if command -v act >/dev/null 2>&1; then
    check_tool "act" "act --version"
else
    echo -e "⚠️  ${YELLOW}act (optional - for local GitHub Actions testing)${NC}"
fi

echo ""

# =============================================================================
# 4. PROJECT-SPECIFIC CHECKS
# =============================================================================
print_section "PROJECT STRUCTURE"
project_status=0

check_exists "Cargo.toml" || project_status=1
check_exists ".github/workflows/api-tests.yml" || project_status=1
check_exists ".github/workflows/schema-validation.yml" || project_status=1
check_exists "docs/NO_SURPRISES_CI_WORKFLOW.md" || project_status=1

if [ -f "openapi.json" ] || [ -f "openapi.yaml" ]; then
    echo -e "✅ ${GREEN}OpenAPI specification found${NC}"
else
    echo -e "⚠️  ${YELLOW}OpenAPI specification (not found - OpenAPI validation will be skipped)${NC}"
fi

if [ -d "siem_ui" ]; then
    echo -e "✅ ${GREEN}Frontend directory (siem_ui)${NC}"
    if [ -f "siem_ui/package.json" ]; then
        echo -e "✅ ${GREEN}Frontend package.json${NC}"
    else
        echo -e "⚠️  ${YELLOW}siem_ui/package.json (not found)${NC}"
    fi
else
    echo -e "⚠️  ${YELLOW}Frontend directory (not found - frontend validation will be skipped)${NC}"
fi

echo ""

# =============================================================================
# 5. QUICK TEST
# =============================================================================
print_section "QUICK VALIDATION TEST"

echo -e "${BLUE}Running quick CI validation...${NC}"
if ./scripts/ci_local.sh >/dev/null 2>&1; then
    echo -e "✅ ${GREEN}CI script runs successfully!${NC}"
    test_status=0
else
    echo -e "❌ ${RED}CI script failed - check for issues${NC}"
    echo -e "   ${YELLOW}Run: ./scripts/ci_local.sh${NC}"
    test_status=1
fi

echo ""

# =============================================================================
# 6. FINAL STATUS SUMMARY
# =============================================================================
print_section "OVERALL STATUS"

total_issues=$((script_status + hook_status + rust_status + cargo_tools_status + validation_status + project_status + test_status))

if [ $total_issues -eq 0 ]; then
    echo -e "🎉 ${GREEN}PERFECT! No-surprises CI workflow is fully operational!${NC}"
    echo ""
    echo -e "${GREEN}✓ All scripts are installed and executable${NC}"
    echo -e "${GREEN}✓ Git pre-push hook is active${NC}"  
    echo -e "${GREEN}✓ All required tools are available${NC}"
    echo -e "${GREEN}✓ CI validation passes${NC}"
    echo ""
    echo -e "${BLUE}🚀 You're ready to push with confidence!${NC}"
else
    echo -e "⚠️  ${YELLOW}$total_issues issue(s) found - see details above${NC}"
    echo ""
    echo -e "${YELLOW}Quick fixes:${NC}"
    
    if [ $script_status -ne 0 ]; then
        echo -e "  ${YELLOW}• Fix script permissions: chmod +x scripts/*.sh${NC}"
    fi
    
    if [ $hook_status -ne 0 ]; then
        echo -e "  ${YELLOW}• Install pre-push hook: ./scripts/setup_pre_push_hook.sh${NC}"
    fi
    
    if [ $rust_status -ne 0 ] || [ $cargo_tools_status -ne 0 ] || [ $validation_status -ne 0 ]; then
        echo -e "  ${YELLOW}• Install missing tools: ./scripts/setup_ci_toolchain.sh${NC}"
    fi
    
    if [ $test_status -ne 0 ]; then
        echo -e "  ${YELLOW}• Debug CI issues: ./scripts/ci_local.sh${NC}"
    fi
fi

echo ""
echo -e "${PURPLE}📖 For detailed information, see: docs/NO_SURPRISES_CI_WORKFLOW.md${NC}"
echo -e "${PURPLE}📖 For quick reference, see: scripts/README.md${NC}"
echo ""

# Golden rule reminder
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  ${YELLOW}GOLDEN RULE: Never push until scripts/ci_local.sh is green! ✅${BLUE}           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════════════════╝${NC}"