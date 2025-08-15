#!/usr/bin/env bash
# scripts/grep-sweeps.sh - Find common UI action anti-patterns

set -euo pipefail

echo "🔍 UI Action Anti-Pattern Sweep"
echo "================================"

cd "$(dirname "$0")/.."

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counter for issues found
ISSUE_COUNT=0

# Function to report findings
report_finding() {
    local title="$1"
    local pattern="$2"
    local description="$3"
    
    echo -e "\n${BLUE}## $title${NC}"
    echo -e "${YELLOW}Pattern: $pattern${NC}"
    echo -e "Description: $description"
    echo ""
    
    local matches
    matches=$(rg -n --hidden --glob '!node_modules' --glob '!.git' --glob '!*.md' --glob '!ActionButton.tsx' --glob '!ActionMenuItem.tsx' "$pattern" src || true)
    
    if [[ -n "$matches" ]]; then
        echo -e "${RED}❌ Issues found:${NC}"
        echo "$matches"
        ISSUE_COUNT=$((ISSUE_COUNT + $(echo "$matches" | wc -l)))
    else
        echo -e "${GREEN}✅ No issues found${NC}"
    fi
}

echo "Scanning src/ directory for UI action anti-patterns..."
echo ""

# 1. Empty/noop handlers
report_finding \
    "Empty/No-op Click Handlers" \
    'onClick=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}' \
    "Buttons with empty click handlers that do nothing"

# 2. Buttons with no handler/nav/submit
echo -e "\n${BLUE}## Buttons Missing Handlers${NC}"
echo -e "${YELLOW}Pattern: <(Button|button) without onClick/href/type=submit${NC}"
echo -e "Description: Interactive buttons that appear to have no action"
echo ""

# Find buttons, then filter out those with handlers
button_matches=$(rg -n --hidden --glob '!node_modules' --glob '!.git' --glob '!*.md' --glob '!ActionButton.tsx' --glob '!ActionMenuItem.tsx' '<(Button|button)([^>])*>' src || true)
if [[ -n "$button_matches" ]]; then
    missing_handlers=$(echo "$button_matches" | rg -v 'onClick|type="submit"|href|data-intent' || true)
    if [[ -n "$missing_handlers" ]]; then
        echo -e "${RED}❌ Issues found:${NC}"
        echo "$missing_handlers"
        ISSUE_COUNT=$((ISSUE_COUNT + $(echo "$missing_handlers" | wc -l)))
    else
        echo -e "${GREEN}✅ No issues found${NC}"
    fi
else
    echo -e "${GREEN}✅ No buttons found${NC}"
fi

# 3. Dropdown items missing onSelect/onClick
echo -e "\n${BLUE}## Dropdown Items Missing Handlers${NC}"
echo -e "${YELLOW}Pattern: <(DropdownMenuItem|CommandItem) without onSelect/onClick${NC}"
echo -e "Description: Menu items that appear to have no action"
echo ""

dropdown_matches=$(rg -n --hidden --glob '!node_modules' --glob '!.git' --glob '!*.md' --glob '!ActionButton.tsx' --glob '!ActionMenuItem.tsx' '<(DropdownMenuItem|CommandItem)([^>])*>' src || true)
if [[ -n "$dropdown_matches" ]]; then
    missing_dropdown_handlers=$(echo "$dropdown_matches" | rg -v 'on(Select|Click)=' || true)
    if [[ -n "$missing_dropdown_handlers" ]]; then
        echo -e "${RED}❌ Issues found:${NC}"
        echo "$missing_dropdown_handlers"
        ISSUE_COUNT=$((ISSUE_COUNT + $(echo "$missing_dropdown_handlers" | wc -l)))
    else
        echo -e "${GREEN}✅ No issues found${NC}"
    fi
else
    echo -e "${GREEN}✅ No dropdown items found${NC}"
fi

# 4. Missing action metadata
echo -e "\n${BLUE}## Missing Action Metadata${NC}"
echo -e "${YELLOW}Pattern: Actionable elements without data-action${NC}"
echo -e "Description: Interactive elements missing audit/testing metadata"
echo ""

actionable_matches=$(rg -n --hidden --glob '!node_modules' --glob '!.git' --glob '!*.md' --glob '!ActionButton.tsx' --glob '!ActionMenuItem.tsx' '<(Button|button|DropdownMenuItem|CommandItem|AlertDialogAction)([^>])*>' src || true)
if [[ -n "$actionable_matches" ]]; then
    missing_metadata=$(echo "$actionable_matches" | rg -v 'data-action=' || true)
    if [[ -n "$missing_metadata" ]]; then
        echo -e "${RED}❌ Issues found:${NC}"
        echo "$missing_metadata"
        ISSUE_COUNT=$((ISSUE_COUNT + $(echo "$missing_metadata" | wc -l)))
    else
        echo -e "${GREEN}✅ No issues found${NC}"
    fi
else
    echo -e "${GREEN}✅ No actionable elements found${NC}"
fi

# 5. Direct fetch/axios usage (should use lib/http.ts)
report_finding \
    "Direct HTTP Calls" \
    '(fetch\(|axios\.|XMLHttpRequest)' \
    "Direct HTTP calls that should go through lib/http.ts"

# 6. TODO/FIXME comments in UI code
report_finding \
    "TODO/FIXME Comments" \
    '(TODO|FIXME|XXX):.*' \
    "Unfinished code that may affect functionality"

# 7. Console.log in production code (except dev warnings)
report_finding \
    "Console Logs" \
    'console\.(log|info|debug)' \
    "Console statements that should be removed for production"

# 8. Hardcoded URLs
report_finding \
    "Hardcoded URLs" \
    '(http://|https://)[^\s"]*' \
    "Hardcoded URLs that should be configurable"

# 9. Missing error handling
echo -e "\n${BLUE}## Potential Missing Error Handling${NC}"
echo -e "${YELLOW}Pattern: API calls without .catch or try/catch${NC}"
echo -e "Description: Async operations that may not handle errors"
echo ""

api_calls=$(rg -n --hidden --glob '!node_modules' --glob '!.git' '(await|\.then\()' src || true)
if [[ -n "$api_calls" ]]; then
    no_error_handling=$(echo "$api_calls" | rg -v '(\.catch|try|catch)' || true)
    if [[ -n "$no_error_handling" ]]; then
        echo -e "${YELLOW}⚠️  Potential issues (manual review needed):${NC}"
        echo "$no_error_handling" | head -10  # Limit output
        echo "... (showing first 10 matches)"
    else
        echo -e "${GREEN}✅ No obvious issues found${NC}"
    fi
else
    echo -e "${GREEN}✅ No async calls found${NC}"
fi

# Summary
echo ""
echo "================================"
if [[ $ISSUE_COUNT -gt 0 ]]; then
    echo -e "${RED}🚨 Found $ISSUE_COUNT total issues that need review${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Review each flagged item above"
    echo "2. Fix missing handlers or mark intentional with disabled/aria-disabled"
    echo "3. Add data-action attributes for audit tracking"
    echo "4. Run the static audit script: npm run audit:actions"
    echo "5. Run e2e tests: npm run cypress:run"
    exit 1
else
    echo -e "${GREEN}✅ No anti-patterns found! UI actions look properly wired.${NC}"
    exit 0
fi
