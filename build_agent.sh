#!/bin/bash

set -e

echo "Building SIEM Agent for production..."

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$PROJECT_ROOT/siem_agent"
BUILD_DIR="$PROJECT_ROOT/dist"

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/macos-x64"

echo "Building for macOS..."
cd "$AGENT_DIR"
cargo build --release

# Copy binary
cp "target/release/siem_agent" "$BUILD_DIR/macos-x64/"

echo "Build completed successfully!"
echo "Binary available at: $BUILD_DIR/macos-x64/siem_agent"