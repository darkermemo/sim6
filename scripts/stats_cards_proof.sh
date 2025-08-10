#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
ART="$ROOT/siem_unified_pipeline/target/test-artifacts"
OUT="$ART/final_reportv1.md"
mkdir -p "$ART"

curl -fsS "$BASE_URL/health" -o "$ART/stats_health.json" >/dev/null
curl -fsS "$BASE_URL/metrics" -o /tmp/metrics.txt

# Slice key metrics families likely used by stats cards
grep -E '^(siem_v2_(ingest_total|rate_limit_total|stream_enqueue_total|stream_ack_total|stream_lag_ms|rules_run_total|alerts_written_total))' /tmp/metrics.txt | sort > "$ART/stats_metrics_slice.txt" || true

ts=$(date -u +%FT%TZ)
{
  echo
  echo "## Stats Cards Proof — ${ts}"
  echo
  echo "**Metrics slice:**"
  echo '```txt'
  sed -n '1,200p' "$ART/stats_metrics_slice.txt"
  echo '```'
} >> "$OUT"

echo "[stats] proof complete"


