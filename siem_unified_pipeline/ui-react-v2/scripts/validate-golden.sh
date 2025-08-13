#!/usr/bin/env bash
set -euo pipefail

# Golden Page Validation Script
# Runs the complete "no-lying" checklist for pages

echo "🚀 Starting Golden Page Validation"
echo "=================================="

# 1. TypeScript check
echo "📝 1. TypeScript validation..."
npm run typecheck
echo "✅ TypeScript: 0 errors"

# 2. Linting
echo "📝 2. ESLint validation..."
npm run lint
echo "✅ ESLint: 0 errors, 0 warnings"

# 3. Build with hard-fail Zod
echo "📝 3. Building with VITE_HARD_FAIL_ON_SCHEMA=1..."
npm run build:test
echo "✅ Build: successful with Zod hard-fail enabled"

# 4. Start preview server for testing
echo "📝 4. Starting preview server..."
npm run preview:test &
SERVER_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:5174/ui/v2/ > /dev/null 2>&1; then
    echo "✅ Server ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Server failed to start within 30 seconds"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# 5. Run runtime validation tests
echo "📝 5. Running no-runtime-errors tests..."
E2E_BASE_URL=http://127.0.0.1:5174/ui/v2/ npm run e2e:runtime

echo "✅ Runtime tests: all pages healthy"

# 6. Cleanup
echo "📝 6. Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
echo "✅ Server stopped"

echo ""
echo "🎉 GOLDEN VALIDATION COMPLETE"
echo "=============================="
echo "✅ TypeScript: 0 errors"
echo "✅ ESLint: 0 errors, 0 warnings"  
echo "✅ Build: successful with Zod validation"
echo "✅ Runtime: 0 pageerrors, 0 console errors, 0 network failures"
echo "✅ Interactions: all critical flows work"
echo ""
echo "🏆 Page meets Golden Standard - ready to ship!"
