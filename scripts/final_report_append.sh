#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Generate the report; do not abort on non-zero exit so we can still copy if it was created
bash scripts/make_final_report.sh || true
# Copy to artifacts snapshot
mkdir -p target/test-artifacts
cp -f final_reportv1.md target/test-artifacts/final_reportv1.md
# Always print a tail for visibility in CI/local logs
TAIL_LINES=${TAIL_LINES:-200}
tail -n "$TAIL_LINES" target/test-artifacts/final_reportv1.md || true
