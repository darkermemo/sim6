#!/bin/bash

# SIEM Platform QA Safety Harness
# Comprehensive validation script for frontend and backend

set -e  # Exit on any error

echo "🚀 Starting SIEM Platform QA Safety Harness..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to run a command and capture its exit code
run_check() {
    local name="$1"
    local cmd="$2"
    local optional="$3"
    
    print_status "Running $name..."
    
    if eval "$cmd"; then
        print_success "$name passed"
        return 0
    else
        if [ "$optional" = "optional" ]; then
            print_warning "$name failed (optional)"
            return 0
        else
            print_error "$name failed"
            return 1
        fi
    fi
}

# Initialize counters
PASSED=0
FAILED=0
WARNINGS=0

# Change to the UI directory
cd "$(dirname "$0")/.."

print_status "Working directory: $(pwd)"

# 1. Install dependencies if needed
print_status "Checking dependencies..."
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
fi

# 2. TypeScript compilation check
if run_check "TypeScript Compilation" "npx tsc --noEmit"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 3. ESLint check
if run_check "ESLint" "npm run lint"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 4. Unit tests
if run_check "Unit Tests" "npm run test -- --run"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 5. Build check
if run_check "Build Process" "npm run build"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# 6. API connectivity check
print_status "Checking API connectivity..."
API_HEALTH_CHECK="curl -s -f http://localhost:8081/api/v1/health || curl -s -f http://localhost:8080/api/v1/health"
if run_check "API Health Check" "$API_HEALTH_CHECK" "optional"; then
    ((PASSED++))
else
    ((WARNINGS++))
    print_warning "API server not running - some tests may fail"
fi

# 7. Schema validation test
print_status "Testing API schema validation..."
SCHEMA_TEST="node -e '
import { validateApiResponse, TenantsResponseSchema } from "./dist/schemas/api.js";
try {
  const mockData = { success: true, data: [{ id: "1", name: "test", description: "test", status: "Active", created: "2024-01-01" }] };
  validateApiResponse(TenantsResponseSchema, mockData);
  console.log("Schema validation working");
} catch (e) {
  console.error("Schema validation failed:", e.message);
  process.exit(1);
}'"

if run_check "Schema Validation" "$SCHEMA_TEST" "optional"; then
    ((PASSED++))
else
    ((WARNINGS++))
fi

# 8. E2E tests (if Playwright is available and server is running)
if command_exists "npx" && [ -f "playwright.config.ts" ]; then
    print_status "Checking if UI server is running..."
    if curl -s -f http://localhost:3000 >/dev/null 2>&1; then
        if run_check "E2E Tests" "npx playwright test --reporter=line" "optional"; then
            ((PASSED++))
        else
            ((WARNINGS++))
        fi
    else
        print_warning "UI server not running on port 3000 - skipping E2E tests"
        print_warning "Start the UI server with 'npm run dev' to run E2E tests"
        ((WARNINGS++))
    fi
else
    print_warning "Playwright not available - skipping E2E tests"
    ((WARNINGS++))
fi

# 9. Security audit
if run_check "Security Audit" "npm audit --audit-level=high" "optional"; then
    ((PASSED++))
else
    ((WARNINGS++))
fi

# 10. Bundle size check
print_status "Checking bundle size..."
if [ -d "dist" ]; then
    BUNDLE_SIZE=$(du -sh dist | cut -f1)
    print_status "Bundle size: $BUNDLE_SIZE"
    
    # Check if bundle is reasonable size (less than 10MB)
    BUNDLE_SIZE_BYTES=$(du -s dist | cut -f1)
    if [ "$BUNDLE_SIZE_BYTES" -lt 10240 ]; then  # 10MB in KB
        print_success "Bundle size is reasonable"
        ((PASSED++))
    else
        print_warning "Bundle size is large: $BUNDLE_SIZE"
        ((WARNINGS++))
    fi
else
    print_warning "No dist directory found - run build first"
    ((WARNINGS++))
fi

# Summary
echo ""
echo "================================================"
echo "🏁 QA Safety Harness Complete"
echo "================================================"
print_success "Passed: $PASSED"
if [ $WARNINGS -gt 0 ]; then
    print_warning "Warnings: $WARNINGS"
fi
if [ $FAILED -gt 0 ]; then
    print_error "Failed: $FAILED"
fi

# Overall result
if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        print_success "🎉 All checks passed! Ready for deployment."
        exit 0
    else
        print_warning "⚠️  Some warnings detected. Review before deployment."
        exit 0
    fi
else
    print_error "❌ Some critical checks failed. Fix issues before deployment."
    exit 1
fi