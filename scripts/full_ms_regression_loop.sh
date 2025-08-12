#!/usr/bin/env bash
set -euo pipefail
ART=target/test-artifacts
ITERATIONS=${1:-10}        # run N cycles
PAUSE=${PAUSE_BETWEEN:-5}  # seconds between cycles

ok() { echo "[ok] $*"; }
fail() { echo "[fail] $*"; exit 1; }

check_ch() {
  curl -fsS --max-time 2 http://127.0.0.1:8123/ping >/dev/null || fail "ClickHouse HTTP down"
  clickhouse client -q "SELECT 1" --receive_timeout=2 >/dev/null || fail "ClickHouse native down"
}

restart_api() {
  pgrep -f siem-pipeline && kill -9 $(pgrep -f siem-pipeline) 2>/dev/null || true
  pushd siem_unified_pipeline >/dev/null
  cargo build -q
  popd >/dev/null
  nohup ./siem_unified_pipeline/target/debug/siem-pipeline >"$ART/api_stdout.log" 2>"$ART/api_stderr.log" &
  echo $! > "$ART/api_pid.txt"
  for i in {1..30}; do curl -sS http://127.0.0.1:9999/api/v2/health >/dev/null && break; sleep 1; done
}

mkdir -p "$ART"
: > "$ART/full_ms_summary_history.txt"

for i in $(seq 1 "$ITERATIONS"); do
  echo "=== RUN $i/{$ITERATIONS} ==="
  check_ch
  restart_api
  bash scripts/full_ms_regression.sh
  SUM="$ART/full_ms_summary.txt"
  cat "$SUM" | tr -d '\r' >> "$ART/full_ms_summary_history.txt"
  # strict gate: every line must end with :PASS or :SKIP (where allowed)
  grep -E ':(PASS|SKIP)$' "$SUM" >/dev/null || { echo "Summary not green on run $i"; sed -n '1,120p' "$SUM"; exit 1; }
  ok "run $i PASS"
  sleep "$PAUSE"
done

ok "All $ITERATIONS runs PASS"
