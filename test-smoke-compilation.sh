#!/bin/bash

# Test script to verify smoke test compilation and basic structure
set -e

echo "🧪 Testing smoke test compilation..."

# Test compilation
cd smoke
cargo check
echo "✅ Smoke test compiles successfully"

# Test that binaries exist
echo "🔍 Checking required binaries..."
if cargo metadata --format-version 1 | jq -r '.packages[].targets[] | select(.kind[] == "bin") | .name' | grep -q "siem_consumer"; then
    echo "✅ siem_consumer binary found"
else
    echo "❌ siem_consumer binary not found"
    exit 1
fi

if cargo metadata --format-version 1 | jq -r '.packages[].targets[] | select(.kind[] == "bin") | .name' | grep -q "siem_api"; then
    echo "✅ siem_api binary found"
else
    echo "❌ siem_api binary not found"
    exit 1
fi

echo "🎉 Smoke test setup is complete and ready!"
echo "📝 To run the full test: make smoke (requires Docker)"