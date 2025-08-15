#!/usr/bin/env bash
# scripts/setup-audit-system.sh - One-command setup for UI action audit system

set -euo pipefail

echo "🔧 Setting up UI Action Audit System"
echo "===================================="

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Run this script from the ui-v3 directory"
    exit 1
fi

# Install dependencies if not present
echo "📦 Checking dependencies..."
if ! npm list ts-morph globby picocolors cypress cypress-real-events tsx > /dev/null 2>&1; then
    echo "Installing audit dependencies..."
    npm install -D ts-morph globby picocolors cypress cypress-real-events tsx
else
    echo "✅ Dependencies already installed"
fi

# Make scripts executable
echo "🔐 Making scripts executable..."
chmod +x scripts/*.sh
chmod +x scripts/*.js

# Run initial audit to establish baseline
echo "🔍 Running initial audit..."
echo ""

# First run grep sweep
if npm run audit:grep; then
    echo "✅ Grep sweep passed"
else
    echo "⚠️  Grep sweep found issues (expected for first run)"
fi

echo ""

# Then run static analysis
if npm run audit:actions; then
    echo "✅ Static analysis passed"
else
    echo "⚠️  Static analysis found issues (expected for first run)"
fi

echo ""
echo "📋 Setup Complete!"
echo "=================="
echo ""
echo "📁 Files created:"
echo "  • scripts/audit-actions-simple.js    - Static analysis"
echo "  • scripts/grep-sweeps.sh             - Pattern detection"
echo "  • src/components/ui/ActionButton.tsx - Runtime guard"
echo "  • cypress/e2e/actions-wire.cy.ts     - E2E verification"
echo "  • docs/UI_ACTION_AUDIT_SYSTEM.md     - Documentation"
echo ""
echo "🚀 Available commands:"
echo "  npm run audit:grep      - Pattern detection"
echo "  npm run audit:actions   - Static analysis"
echo "  npm run audit:full      - Both audits"
echo "  npm run cypress:open    - Open Cypress UI"
echo "  npm run cypress:run     - Run E2E tests"
echo "  npm run test:actions    - Full audit + E2E"
echo ""
echo "📊 Generated reports:"
echo "  • action-audit-simple.json - Machine-readable results"
echo "  • action-audit-simple.md   - Human-readable report"
echo ""
echo "📖 Next steps:"
echo "1. Review reports generated above"
echo "2. Fix flagged issues using ActionButton/ActionMenuItem wrappers"
echo "3. Add data-action attributes following page:feature:verb convention"
echo "4. Run 'npm run test:actions' to verify fixes"
echo "5. See docs/UI_ACTION_AUDIT_SYSTEM.md for detailed guide"
echo ""

# Check if there are issues to address
if [[ -f "action-audit-simple.json" ]]; then
    issue_count=$(cat action-audit-simple.json | jq length 2>/dev/null || echo "unknown")
    if [[ "$issue_count" != "0" && "$issue_count" != "unknown" ]]; then
        echo "⚠️  Found $issue_count issues to review in action-audit-simple.md"
        echo "   Start by examining the top 5 issues and applying fixes."
    fi
fi
