#!/bin/bash

# Comprehensive Runtime Error Detection Script
# Runs all automated tools to catch UI runtime errors

set -e

echo "🔍 Starting Comprehensive Runtime Error Detection..."
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

# Track results
ERROR_COUNT=0
WARNING_COUNT=0

# 1. TypeScript Type Checking
print_status "Running TypeScript type checking..."
if npm run type-check; then
    print_success "TypeScript type checking passed"
else
    print_error "TypeScript type checking failed"
    ((ERROR_COUNT++))
fi
echo ""

# 2. ESLint with Runtime Error Rules
print_status "Running ESLint with runtime error detection rules..."
if npx eslint . --ext ts,tsx --config .eslintrc.runtime-errors.js --max-warnings 0; then
    print_success "ESLint runtime error detection passed"
else
    print_warning "ESLint found potential runtime errors (check output above)"
    ((WARNING_COUNT++))
fi
echo ""

# 3. API Response Validation Test
print_status "Testing API response validation with Zod schemas..."
if npm run test -- --run src/__tests__/schema-validation.spec.ts; then
    print_success "API validation schemas are working"
else
    print_warning "API validation test issues detected"
    ((WARNING_COUNT++))
fi
echo ""

# 4. Component Smoke Tests
print_status "Running component smoke tests..."
if npm run test -- --run src/__tests__/smoke-tests.spec.tsx; then
    print_success "Component smoke tests passed"
else
    print_error "Component smoke tests failed - runtime errors detected"
    ((ERROR_COUNT++))
fi
echo ""

# 5. Build Test (catches many runtime issues)
print_status "Running production build test..."
if npm run build; then
    print_success "Production build successful"
else
    print_error "Production build failed - likely runtime errors"
    ((ERROR_COUNT++))
fi
echo ""

# 6. Playwright End-to-End Runtime Error Detection
print_status "Running Playwright runtime error detection tests..."
if npx playwright test tests/runtime-error-detection.spec.ts --reporter=list; then
    print_success "Playwright runtime error detection passed"
else
    print_error "Playwright detected runtime errors in browser"
    ((ERROR_COUNT++))
fi
echo ""

# Summary
echo "================================================"
echo "🎯 Runtime Error Detection Summary"
echo "================================================"

if [ $ERROR_COUNT -eq 0 ] && [ $WARNING_COUNT -eq 0 ]; then
    print_success "✅ All runtime error detection tests passed!"
    print_success "Your SIEM UI is free from detectable runtime errors."
    exit 0
elif [ $ERROR_COUNT -eq 0 ]; then
    print_warning "⚠️  $WARNING_COUNT warnings detected, but no critical errors."
    print_warning "Consider reviewing the warnings above."
    exit 0
else
    print_error "❌ $ERROR_COUNT critical errors detected!"
    if [ $WARNING_COUNT -gt 0 ]; then
        print_error "Also found $WARNING_COUNT warnings."
    fi
    print_error "Please fix the errors above before deploying."
    exit 1
fi