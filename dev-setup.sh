#!/bin/bash

# SIEM Development Setup Script
# This script ensures consistent development environment setup
# with proper feature flags and environment variables

set -e

echo "🚀 SIEM Development Setup"
echo "========================"

# Load environment variables
if [ -f ".env" ]; then
    echo "✅ Loading environment variables from .env"
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
else
    echo "❌ .env file not found. Please create one based on .env.example"
    exit 1
fi

# Verify DEV_ADMIN_TOKEN is set
if [ -z "$DEV_ADMIN_TOKEN" ]; then
    echo "❌ DEV_ADMIN_TOKEN not set in .env file"
    echo "   This is required for the dev-auth feature"
    exit 1
fi

echo "✅ DEV_ADMIN_TOKEN configured"

# Build with dev-auth feature
echo "🔨 Building siem_clickhouse_search with dev-auth feature..."
cd siem_clickhouse_search
cargo build --features dev-auth

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

# Run tests sequentially to avoid interference
echo "🧪 Running dev_token tests sequentially..."
cargo test dev_token --features dev-auth -- --test-threads=1

if [ $? -eq 0 ]; then
    echo "✅ All dev_token tests passed"
else
    echo "❌ Some tests failed"
    exit 1
fi

echo ""
echo "🎉 Development setup complete!"
echo ""
echo "To run the search service:"
echo "  cd siem_clickhouse_search"
echo "  cargo run --features dev-auth"
echo ""
echo "To run tests:"
echo "  cargo test --features dev-auth -- --test-threads=1"
echo ""
echo "Environment configured with:"
echo "  - DEV_ADMIN_TOKEN: ${DEV_ADMIN_TOKEN:0:20}..."
echo "  - ENVIRONMENT: $ENVIRONMENT"
echo "  - RUST_LOG: $RUST_LOG"
echo "  - Features: dev-auth, metrics"
echo ""
echo "⚠️  Remember: dev-auth is for development only!"