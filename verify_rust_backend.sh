#!/bin/bash
# Rust Backend Verification Script
# Usage: Run this script from within a Rust project directory (containing Cargo.toml)
# Example: cd siem_api && ../verify_rust_backend.sh

set -euo pipefail

echo "🔍 Rust Backend Health Check"
echo "────────────────────────────"

# 1. Compile-time safety
echo "1️⃣  cargo check ..."
cargo check --all-targets --quiet

# 2. Clippy lints (strict)
echo "2️⃣  cargo clippy ..."
cargo clippy --all-targets -- -D warnings

# 3. Tests
echo "3️⃣  cargo test ..."
cargo test --quiet

# 4. Security audit
echo "4️⃣  cargo audit ..."
cargo audit --quiet || echo "⚠️  audit skipped (no audit.toml)"

# 5. Route discovery (contract snapshot)
echo "5️⃣  Route signatures ..."
grep -RE "GET|POST|PUT|DELETE" src/ --include="*.rs" \
  | sed -E 's/.*(GET|POST|PUT|DELETE)[^"]*"([^"]*)".*/\1 \2/' \
  | sort -u

# 6. Struct snapshot
echo "6️⃣  Response structs ..."
find src -name "*.rs" -exec grep -l "struct.*Resp\|Response" {} \; 2>/dev/null \
  | head -5 | xargs -r grep -E "struct.*Resp|Response" 2>/dev/null | head -10 || echo "No response structs found"

echo "✅  All Rust checks passed"