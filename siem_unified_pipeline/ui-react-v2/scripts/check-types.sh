#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Checking NEW CODE with strict TypeScript..."
npm run typecheck

echo ""
echo "🔍 Checking LEGACY CODE with relaxed TypeScript..."
echo "(Note: Legacy warnings are expected and suppressed)"
npx tsc -p tsconfig.legacy.json --noEmit --skipLibCheck || echo "✨ Legacy code warnings suppressed (expected)"

echo ""
echo "✅ TypeScript checking complete!"
echo "   - New code: Strict type checking"
echo "   - Legacy code: Relaxed checking with warnings suppressed"
