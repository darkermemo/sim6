#!/usr/bin/env bash
# Pre-push Hook Setup Script
# Installs a git pre-push hook that runs CI locally before allowing pushes
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}🔧 $1${NC}"
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

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "Not a git repository. Please run this script from the project root."
    exit 1
fi

# Check if ci_local.sh exists
if [ ! -f "scripts/ci_local.sh" ]; then
    print_error "scripts/ci_local.sh not found. Please create it first."
    exit 1
fi

echo -e "${BLUE}🚀 Setting up git pre-push hook...${NC}\n"

HOOK_PATH=".git/hooks/pre-push"

# Backup existing hook if it exists
if [ -f "$HOOK_PATH" ]; then
    print_warning "Existing pre-push hook found. Backing up to pre-push.backup"
    cp "$HOOK_PATH" "$HOOK_PATH.backup"
fi

# Create the pre-push hook
print_step "Creating pre-push hook"
cat > "$HOOK_PATH" << 'HOOK_EOF'
#!/usr/bin/env bash
# Pre-push hook that runs local CI to prevent GitHub Actions failures
# This hook runs before every git push and blocks the push if CI fails

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛡️  Running local CI before push...${NC}\n"

# Get the remote name and URL being pushed to
remote="$1"
url="$2"

echo "Pushing to: $remote ($url)"
echo ""

# Check if we should skip the hook (escape hatch)
if [ "${SKIP_CI_HOOK:-}" = "1" ]; then
    echo -e "${YELLOW}⚠️  SKIP_CI_HOOK=1 detected - bypassing pre-push validation${NC}"
    echo -e "${YELLOW}⚠️  Use this only in emergencies!${NC}"
    exit 0
fi

# Run the local CI script
if ! scripts/ci_local.sh; then
    echo ""
    echo -e "${RED}❌ PUSH ABORTED: Local CI checks failed${NC}"
    echo ""
    echo "Your push has been blocked because local CI validation failed."
    echo "Please fix the issues above and try pushing again."
    echo ""
    echo -e "${YELLOW}💡 Quick fixes:${NC}"
    echo "  - Run 'cargo fmt --all' for formatting issues"
    echo "  - Run 'cargo clippy --fix' for lint issues"
    echo "  - Run 'cargo test' to fix failing tests"
    echo "  - Check the full output above for specific errors"
    echo ""
    echo -e "${YELLOW}🚨 Emergency bypass (use only if absolutely necessary):${NC}"
    echo "  SKIP_CI_HOOK=1 git push $remote"
    echo ""
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Local CI passed! Push proceeding...${NC}"
echo ""
HOOK_EOF

# Make the hook executable
chmod +x "$HOOK_PATH"

print_success "Pre-push hook installed successfully"

# Create convenience script for emergency bypass
print_step "Creating emergency bypass script"
cat > "scripts/emergency_push.sh" << 'BYPASS_EOF'
#!/usr/bin/env bash
# Emergency push script that bypasses the pre-push hook
# Use only when you need to push urgently and will fix CI issues later

set -euo pipefail

echo "🚨 EMERGENCY PUSH MODE 🚨"
echo ""
echo "This will bypass all local CI checks and push directly."
echo "Use this only in emergencies!"
echo ""

# Get all command line arguments for git push
if [ $# -eq 0 ]; then
    echo "Usage: $0 <git push arguments>"
    echo "Example: $0 origin main"
    echo "Example: $0 origin feature-branch --force"
    exit 1
fi

echo "Git push command: git push $*"
echo ""
read -p "Are you sure you want to proceed? (type 'yes' to continue): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Pushing with CI checks bypassed..."
SKIP_CI_HOOK=1 git push "$@"

echo ""
echo "⚠️  Push completed, but remember to fix CI issues ASAP!"
echo "⚠️  Run 'scripts/ci_local.sh' to see what needs to be fixed."
BYPASS_EOF

chmod +x "scripts/emergency_push.sh"
print_success "Emergency push script created"

# Test the hook (dry run)
print_step "Testing the pre-push hook setup"
if [ -x "$HOOK_PATH" ]; then
    print_success "Hook is executable and ready"
else
    print_error "Hook is not executable"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 PRE-PUSH HOOK SETUP COMPLETED! 🎉${NC}"
echo ""
echo -e "${BLUE}How it works:${NC}"
echo "• Every 'git push' will now run 'scripts/ci_local.sh' first"
echo "• If CI fails, the push is blocked"
echo "• If CI passes, the push proceeds normally"
echo ""
echo -e "${BLUE}Available commands:${NC}"
echo "• scripts/ci_local.sh              - Run CI manually"
echo "• scripts/emergency_push.sh <args> - Emergency bypass (use sparingly!)"
echo "• SKIP_CI_HOOK=1 git push <args>   - Direct bypass"
echo ""
echo -e "${YELLOW}What happens next:${NC}"
echo "1. Your next 'git push' will automatically run CI checks"
echo "2. Fix any issues found before the push completes"
echo "3. Enjoy zero CI failures on GitHub! 🚀"
echo ""
echo -e "${GREEN}Golden rule: Never push until scripts/ci_local.sh is green! ✅${NC}"