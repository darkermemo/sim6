#!/bin/bash

# Security Fix Script for h2 Vulnerability
# This script updates the h2 crate to fix CVE-2024-32650

echo "🔒 Starting security fix for h2 vulnerability..."

# Check current h2 version
echo "Current h2 version:"
cargo tree | grep "h2 v" | head -5

# Update h2 crate specifically
echo -e "\n📦 Updating h2 crate..."
cargo update -p h2

# Run cargo audit to check if vulnerability is fixed
echo -e "\n🔍 Running security audit..."
if ! command -v cargo-audit &> /dev/null; then
    echo "Installing cargo-audit..."
    cargo install cargo-audit
fi

cargo audit

# Check new h2 version
echo -e "\n✅ New h2 version:"
cargo tree | grep "h2 v" | head -5

# Rebuild to ensure everything compiles
echo -e "\n🔨 Rebuilding project..."
cargo build --release

# Run tests to ensure nothing broke
echo -e "\n🧪 Running tests..."
cargo test

echo -e "\n✅ Security fix complete!"
echo "If h2 is still below 0.3.26, you may need to update dependencies that pin it:"
cargo tree -i h2 | grep -v "h2 v"