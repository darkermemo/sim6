#!/usr/bin/env bash
set -Eeuo pipefail
cargo fmt --all -- --check
cargo build --workspace --all-targets
cargo test  --workspace --all-targets
cargo clippy --workspace --all-targets --no-deps -- -D warnings

