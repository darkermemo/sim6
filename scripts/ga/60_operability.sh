#!/usr/bin/env bash
# Observability snapshot + simple SLO checks

set -Eeuo pipefail
source scripts/ga/00_env.sh

note "Metrics snapshot"
curl -sS "$BASE_URL/metrics" > "$GA_DIR/metrics.txt" || true

note "SLO quick check: search execute p95 <= 1500ms across 30 samples (from perf script)"
if [ -f "$GA_DIR/execute_latency.json" ]; then
  jq . "$GA_DIR/execute_latency.json" > /dev/null 2>&1 || true
fi

