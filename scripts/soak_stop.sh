#!/usr/bin/env bash
set -Eeuo pipefail
ART="target/test-artifacts/soak"
OUT="target/test-artifacts/final_reportv1.md"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"

kill_if(){ [ -f "$1" ] && { kill "$(cat "$1")" 2>/dev/null || true; rm -f "$1"; }; }

echo "[soak] stopping feeder + sampler (API/runner left running)"
kill_if /tmp/soak_feeder.pid
kill_if /tmp/soak_sampler.pid
sleep 1

# Summarize metrics
last_metrics=$(ls -1t "$ART"/metrics.*.txt 2>/dev/null | head -n1)
ing_line=$(grep -m1 '^siem_v2_ingest_total' "$last_metrics" 2>/dev/null || true)
rate_line=$(grep -m1 '^siem_v2_rate_limit_total' "$last_metrics" 2>/dev/null || true)
enq_line=$(grep -m1 '^siem_v2_stream_enqueue_total' "$last_metrics" 2>/dev/null || true)
lag_line=$(grep -m1 '^siem_v2_stream_lag_ms' "$last_metrics" 2>/dev/null || true)
alw_line=$(grep -m1 '^siem_v2_alerts_written_total' "$last_metrics" 2>/dev/null || true)

# Append "Soak Proof" to final report
ts=$(date -u +%FT%TZ)
mkdir -p "$(dirname "$OUT")"
{
  echo "### Soak Proof: STOP ($ts)"
  echo
  echo "Ingest (last metrics):"
  echo '```txt'
  echo "${ing_line:-N/A}"
  echo "${rate_line:-N/A}"
  echo "${enq_line:-N/A}"
  echo "${lag_line:-N/A}"
  echo "${alw_line:-N/A}"
  echo '```'
  echo
  echo "Recent rule errors (last hour):"
  echo '```txt'
  (cat "$ART"/rule_err.*.txt 2>/dev/null | sed -n '1,60p') || echo "none"
  echo '```'
} >> "$OUT"

echo "[soak] STOPPED. Summary appended to $OUT"
