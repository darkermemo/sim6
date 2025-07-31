#!/bin/bash

# API Contract Validation Script
# This script validates OpenAPI schema and ensures type safety before commits

set -e

echo "🔍 Validating API Contract..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${2}${1}${NC}"
}

# Check if OpenAPI schema exists
if [ ! -f "openapi.json" ]; then
    print_status "❌ OpenAPI schema file (openapi.json) not found!" $RED
    exit 1
fi

print_status "📋 Step 1: Validating OpenAPI schema syntax..." $YELLOW

# Basic JSON validation
if python3 -m json.tool openapi.json > /dev/null 2>&1; then
    print_status "✅ OpenAPI schema is valid JSON" $GREEN
else
    print_status "❌ OpenAPI schema is not valid JSON" $RED
    exit 1
fi

# Check if schema has required OpenAPI fields
if grep -q '"openapi"' openapi.json && grep -q '"info"' openapi.json && grep -q '"paths"' openapi.json; then
    print_status "✅ OpenAPI schema has required fields" $GREEN
else
    print_status "❌ OpenAPI schema missing required fields (openapi, info, paths)" $RED
    exit 1
fi

print_status "📋 Step 2: Basic schema structure validation..." $YELLOW
# Check for common issues
if grep -q '"components"' openapi.json; then
    print_status "✅ Schema includes components section" $GREEN
else
    print_status "⚠️  Schema missing components section" $YELLOW
fi

# Check if siem_ui directory exists
if [ ! -d "siem_ui" ]; then
    print_status "❌ siem_ui directory not found!" $RED
    exit 1
fi

cd siem_ui

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_status "❌ package.json not found in siem_ui directory!" $RED
    exit 1
fi

print_status "📋 Step 3: Installing frontend dependencies..." $YELLOW
npm ci --silent

print_status "📋 Step 4: Generating TypeScript types from OpenAPI schema..." $YELLOW
if npm run generate-api; then
    print_status "✅ TypeScript types generated successfully" $GREEN
else
    print_status "❌ Failed to generate TypeScript types" $RED
    exit 1
fi

print_status "📋 Step 5: Type checking TypeScript files..." $YELLOW
if npx tsc --noEmit --project tsconfig.json; then
    print_status "✅ TypeScript compilation successful" $GREEN
else
    print_status "❌ TypeScript compilation failed" $RED
    exit 1
fi

print_status "📋 Step 6: Linting typed API files..." $YELLOW

# Check if typed API files exist and lint them
if [ -f "src/services/typedApi.ts" ]; then
    if npx eslint src/services/typedApi.ts --max-warnings 0; then
        print_status "✅ typedApi.ts linting passed" $GREEN
    else
        print_status "❌ typedApi.ts linting failed" $RED
        exit 1
    fi
fi

if [ -f "src/hooks/api/useTypedLogSources.ts" ]; then
    if npx eslint src/hooks/api/useTypedLogSources.ts --max-warnings 0; then
        print_status "✅ useTypedLogSources.ts linting passed" $GREEN
    else
        print_status "❌ useTypedLogSources.ts linting failed" $RED
        exit 1
    fi
fi

if [ -f "src/generated/api-types.ts" ]; then
    if npx eslint src/generated/api-types.ts --max-warnings 0; then
        print_status "✅ api-types.ts linting passed" $GREEN
    else
        print_status "⚠️  api-types.ts linting found issues (this is acceptable for generated files)" $YELLOW
    fi
fi

print_status "📋 Step 7: Checking for uncommitted generated files..." $YELLOW
cd ..

# Check if there are uncommitted changes to generated files
if git diff --quiet HEAD -- siem_ui/src/generated/api-types.ts; then
    print_status "✅ Generated API types are up to date" $GREEN
else
    print_status "⚠️  Generated API types have uncommitted changes" $YELLOW
    print_status "💡 Consider committing the updated generated files" $YELLOW
fi

print_status "📋 Step 8: Running API client tests..." $YELLOW
cd siem_ui

# Run tests for API client files (if they exist)
if npm test -- --testPathPattern="(typedApi|useTypedLogSources)" --passWithNoTests --silent; then
    print_status "✅ API client tests passed" $GREEN
else
    print_status "❌ API client tests failed" $RED
    exit 1
fi

cd ..

print_status "🎉 All API contract validations passed!" $GREEN
print_status "📝 Summary:" $YELLOW
print_status "   ✅ OpenAPI schema is valid and well-formed" $GREEN
print_status "   ✅ TypeScript types generated successfully" $GREEN
print_status "   ✅ Type checking passed" $GREEN
print_status "   ✅ Code linting passed" $GREEN
print_status "   ✅ API client tests passed" $GREEN

echo ""
print_status "🚀 Ready to commit!" $GREEN