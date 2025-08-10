#!/usr/bin/env bash
set -Eeuo pipefail

# This repo has multiple crates but no root Cargo.toml workspace.
# Run formatting, build, tests, and clippy in each crate.

echo "[lint] formatting siem_unified_pipeline"
(
  cd siem_unified_pipeline
  cargo fmt --all -- --check
)

echo "[lint] formatting siem_tools"
(
  cd siem_tools
  cargo fmt --all -- --check
)

echo "[lint] build & test siem_unified_pipeline"
(
  cd siem_unified_pipeline
  cargo build --all-targets
  cargo test  --all-targets
  cargo clippy --all-targets --no-deps -- -D warnings
)

echo "[lint] build & test siem_tools"
(
  cd siem_tools
  cargo build --all-targets
  cargo test  --all-targets
  cargo clippy --all-targets --no-deps -- -D warnings
)

