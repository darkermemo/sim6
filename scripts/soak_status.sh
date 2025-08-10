#!/usr/bin/env bash
set -Eeuo pipefail
ART="target/test-artifacts/soak"
BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://127.0.0.1:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"

echo "== PIDs =="
for f in /tmp/siem_srv.pid /tmp/siem_runner.pid /tmp/soak_feeder.pid /tmp/soak_sampler.pid; do
  [ -f "$f" ] && { printf "%-22s %s\n" "$(basename "$f")" "$(cat "$f")"; } || true
done

echo "== Ingest return codes (last 10) =="; tail -n 10 "$ART/ing.codes.txt" 2>/dev/null || echo "(no data yet)"
echo "== Metrics slice =="
curl -sS "$BASE_URL/metrics" | egrep '^(siem_v2_(ingest_total|rate_limit_total|stream_enqueue_total|stream_lag_ms|alerts_written_total))' || true

echo "== Events ingested in last hour (soak) =="; tail -n 5 "$ART"/ev_last_hour.*.txt 2>/dev/null || echo "(pending sampler)"
echo "== Recent rule errors (if any) =="; sed -n '1,40p' "$ART"/rule_err.*.txt 2>/dev/null || echo "(pending sampler)"
