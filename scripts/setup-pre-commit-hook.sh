#!/bin/bash

# SIEM Schema Validation Pre-Commit Hook Setup
# This script sets up automatic schema validation before every git commit

set -e

echo "🔧 Setting up SIEM schema validation pre-commit hook..."

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Error: Not in a git repository. Run this from the project root."
    exit 1
fi

# Check if schema validator exists
if [ ! -f "schema_validator_v2.rs" ]; then
    echo "❌ Error: schema_validator_v2.rs not found. Ensure you're in the correct directory."
    exit 1
fi

# Create the pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# SIEM Schema Validation Pre-Commit Hook
# Automatically validates database schema consistency before commits

echo "🔍 Running SIEM schema validation..."
echo "📋 Checking SQL queries against database schema..."

# Build and run the schema validator
cargo build --bin schema_validator_v2 --quiet
if [ $? -ne 0 ]; then
    echo "❌ Failed to build schema validator!"
    exit 1
fi

# Run schema validation
./target/debug/schema_validator_v2
validation_result=$?

if [ $validation_result -ne 0 ]; then
    echo ""
    echo "❌ Schema validation FAILED!"
    echo "🚨 Critical schema issues detected that would break the build."
    echo ""
    echo "📄 Check the following files for details:"
    echo "   - schema_validation_report.md (human-readable)"
    echo "   - schema_validation_report.json (machine-readable)"
    echo ""
    echo "🔧 Common fixes:"
    echo "   1. Check column names in SQL queries match database_setup.sql"
    echo "   2. Remove hardcoded 'dev.' database prefixes"
    echo "   3. Ensure all referenced tables exist in schema"
    echo ""
    echo "💡 Run 'cargo run --bin schema_validator_v2' to see detailed issues"
    echo ""
    echo "🚫 Commit blocked. Fix schema issues and try again."
    exit 1
fi

echo "✅ Schema validation passed! Proceeding with commit..."
echo ""
EOF

# Make the hook executable
chmod +x .git/hooks/pre-commit

echo "✅ Pre-commit hook installed successfully!"
echo ""
echo "🎯 What happens now:"
echo "   • Every 'git commit' will automatically run schema validation"
echo "   • Commits will be blocked if critical schema issues are found"
echo "   • You'll see detailed error reports to help fix issues"
echo ""
echo "🧪 Test the hook:"
echo "   git add ."
echo "   git commit -m 'test schema validation'"
echo ""
echo "🔧 To disable temporarily (not recommended):"
echo "   git commit --no-verify -m 'bypass validation'"
echo ""
echo "📚 For more info, see CONTRIBUTING.md"