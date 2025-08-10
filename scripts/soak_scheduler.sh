#!/usr/bin/env bash
set -Eeuo pipefail

# Short scheduler soak: waits N minutes and collects metrics snapshot
# Usage: MINUTES=2 ./scripts/soak_scheduler.sh

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
MINUTES="${MINUTES:-2}"

sleep "$MINUTES"m || true
curl -fsS "$BASE_URL/metrics" -o siem_unified_pipeline/target/test-artifacts/soak_scheduler_metrics.txt || true
exit 0


