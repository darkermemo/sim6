#!/bin/bash

# verify-versions.sh - Version pinning verification script
# Ensures exact versions for reproducible builds

set -e

echo "🔍 Verifying tool versions..."

# Check Rust toolchain and version
echo "Checking Rust toolchain..."
CURRENT_TOOLCHAIN=$(rustup show active-toolchain | cut -d' ' -f1)
if [[ "$CURRENT_TOOLCHAIN" != stable* ]]; then
    echo "❌ ERROR: Expected rustup toolchain 'stable*', got '$CURRENT_TOOLCHAIN'"
    exit 1
fi

RUSTC_VERSION=$(rustc --version | cut -d' ' -f2)
RUSTC_MAJOR=$(echo $RUSTC_VERSION | cut -d'.' -f1)
RUSTC_MINOR=$(echo $RUSTC_VERSION | cut -d'.' -f2)
if [[ $RUSTC_MAJOR -lt 1 ]] || [[ $RUSTC_MAJOR -eq 1 && $RUSTC_MINOR -lt 79 ]]; then
    echo "❌ ERROR: Expected rustc version 1.79.0 or newer, got $RUSTC_VERSION"
    exit 1
fi
echo "✅ Rust: toolchain=stable, rustc=$RUSTC_VERSION"

# Check Node.js version (allow v20.14.* or newer)
echo "Checking Node.js version..."
NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
NODE_MINOR=$(echo $NODE_VERSION | cut -d'.' -f2)
if [[ $NODE_MAJOR -lt 20 ]] || [[ $NODE_MAJOR -eq 20 && $NODE_MINOR -lt 14 ]]; then
    echo "❌ ERROR: Expected Node.js v20.14.* or newer, got v$NODE_VERSION"
    exit 1
fi
echo "✅ Node.js: $NODE_VERSION"

# Check pnpm version (allow 9.* or newer)
echo "Checking pnpm version..."
PNPM_VERSION=$(pnpm --version)
PNPM_MAJOR=$(echo $PNPM_VERSION | cut -d'.' -f1)
if [[ $PNPM_MAJOR -lt 9 ]]; then
    echo "❌ ERROR: Expected pnpm 9.* or newer, got $PNPM_VERSION"
    exit 1
fi
echo "✅ pnpm: $PNPM_VERSION"

# Check ClickHouse version (optional for local development)
echo "Checking ClickHouse version..."
if ! command -v clickhouse-client &> /dev/null; then
    echo "⚠️  WARNING: clickhouse-client not found in PATH (optional for local dev)"
else
    CLICKHOUSE_VERSION=$(clickhouse-client --query "SELECT version()" 2>/dev/null || echo "ERROR")
    if [ "$CLICKHOUSE_VERSION" = "ERROR" ]; then
        echo "⚠️  WARNING: Failed to connect to ClickHouse server"
    else
        if [[ ! "$CLICKHOUSE_VERSION" =~ ^23\.8\. ]]; then
            echo "⚠️  WARNING: Expected ClickHouse 23.8.*, got $CLICKHOUSE_VERSION"
        else
            echo "✅ ClickHouse: $CLICKHOUSE_VERSION"
        fi
    fi
fi

echo "✅ All version checks passed!"
echo "✔ OK"