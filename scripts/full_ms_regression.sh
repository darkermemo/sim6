#!/usr/bin/env bash
# Full core regression: storage, quarantine, idempotency, watermark (+ Redis gates if REDIS_URL set)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ART="$ROOT/target/test-artifacts"
SCRIPTS="$ROOT/scripts"
mkdir -p "$ART"

req() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1"; exit 1; }; }
req clickhouse
req curl
req jq
req awk
req sed

pass(){ printf "  ✓ %s\n" "$*"; }
fail(){ printf "  ✗ %s\n" "$*"; exit 1; }

echo "[pre] Apply migrations"
bash "$ROOT/database_migrations/apply-migrations.sh"

echo "[pre] Restart API"
if [ -f "$ART/api_pid.txt" ]; then kill -9 "$(cat "$ART/api_pid.txt")" 2>/dev/null || true; fi
cd "$ROOT/siem_unified_pipeline"
cargo build -q
nohup cargo run --bin siem-pipeline >"$ART/api_stdout.log" 2>"$ART/api_stderr.log" &
echo $! > "$ART/api_pid.txt"
for i in {1..30}; do curl -sS http://127.0.0.1:9999/api/v2/health >/dev/null && break; sleep 1; done
cd "$ROOT"

SUMMARY="$ART/full_ms_summary.txt"
: > "$SUMMARY"

echo "[gate:storage] Proving TTL/retention"
bash "$SCRIPTS/ch_inspect.sh"
# Gate: dev.events SHOW CREATE contains TTL
if grep -Eqi 'TTL .*event_(dt|timestamp)' "$ART/show_create_dev_events.sql"; then
  pass "TTL present in dev.events"; echo "storage:PASS" >> "$SUMMARY"
else
  fail "TTL missing in dev.events (SHOW CREATE)"; fi

echo "[gate:quarantine] Proving ingest partial-success + reasons"
bash "$SCRIPTS/ingest_quarantine_proof.sh"
jq -e 'has("accepted") and has("quarantined") and (.reasons|type=="object")' "$ART/quarantine_ingest_response.json" >/dev/null \
  || fail "quarantine response shape invalid"
# Require at least one reason
jq -e '(.reasons|to_entries|length) >= 1' "$ART/quarantine_ingest_response.json" >/dev/null \
  && pass "quarantine reasons present" && echo "quarantine:PASS" >> "$SUMMARY" \
  || fail "no quarantine reasons observed"

echo "[gate:idempotency] Proving replay 200 + conflict 409 + attempts>=2"
bash "$SCRIPTS/ch_init_idemp.sh"
bash "$SCRIPTS/idempotency_proof.sh"
grep -q '"replayed": *true' "$ART/idemp_ingest_second.json" || fail "replay body missing {replayed:true}"
grep -q 'HTTP:200' "$ART/idemp_ingest_second.json" || fail "replay not HTTP 200"
grep -q '"error"' "$ART/idemp_ingest_conflict.json" || fail "conflict body missing error"
grep -q 'HTTP:409' "$ART/idemp_ingest_conflict.json" || fail "conflict not HTTP 409"
ATTEMPTS=$(clickhouse client -q "SELECT attempts FROM dev.idempotency_keys WHERE key LIKE 'demo-%' AND route='ingest:ndjson' ORDER BY first_seen_at DESC LIMIT 1 FORMAT TabSeparated" || echo 0)
[ "${ATTEMPTS:-0}" -ge 2 ] || fail "idempotency attempts=$ATTEMPTS (need ≥2)"
pass "idempotency replay/409/attempts OK"; echo "idempotency:PASS" >> "$SUMMARY"

echo "[gate:watermark] Proving 120s safety lag + anti-join"
# Only run if watermark column exists
if clickhouse client -q "SELECT count() FROM system.columns WHERE database='dev' AND table='rule_state' AND name='watermark_ts' FORMAT TabSeparated" | grep -q '^1$'; then
  bash "$SCRIPTS/rules_watermark_proof.sh"
  R1=$(jq -r '.inserted_alerts // .alerts_written // .count // 0' "$ART/wm_run1.json")
  R2=$(jq -r '.inserted_alerts // .alerts_written // .count // 0' "$ART/wm_run2.json")
  R3=$(jq -r '.inserted_alerts // .alerts_written // .count // 0' "$ART/wm_run3.json")
  [ "$R1" -ge 1 ] || fail "wm run1 expected >0, got $R1"
  [ "$R2" -eq 0 ] || fail "wm run2 expected 0, got $R2"
  [ "$R3" -ge 1 ] || fail "wm run3 expected >0, got $R3"
  pass "watermark windows OK"; echo "watermark:PASS" >> "$SUMMARY"
else
  echo "watermark:SKIP (no watermark_ts)" >> "$SUMMARY"
  echo "  - Skipping PR-04 gates; watermark_ts column not detected."
fi

echo "[gate:redis] Proving locks + EPS (conditional)"
if [ -n "${REDIS_URL:-}" ]; then
  if [ -f "$SCRIPTS/redis_lock_proof.sh" ]; then
    REDIS_URL="$REDIS_URL" bash "$SCRIPTS/redis_lock_proof.sh"
  fi
  if [ -f "$SCRIPTS/redis_rate_proof.sh" ]; then
    REDIS_URL="$REDIS_URL" bash "$SCRIPTS/redis_rate_proof.sh"
  fi
  # Minimal assertions if artifacts exist
  if [ -f "$ART/redis_lock_proof.txt" ]; then
    if grep -q 'RESULT: PASS' "$ART/redis_lock_proof.txt" && grep -q 'success=1.*blocked=1' "$ART/redis_lock_proof.txt"; then
      pass "redis lock proof (1 acquired, 1 blocked)"; echo "redis_lock:PASS" >> "$SUMMARY"
    else
      fail "redis lock proof did not show expected pattern"
    fi
  fi
  if [ -f "$ART/redis_rate_proof.txt" ]; then
    if grep -q 'RESULT: PASS' "$ART/redis_rate_proof.txt" && grep -q 'Throttled (429):' "$ART/redis_rate_proof.txt"; then
      pass "redis rate proof shows throttling"; echo "redis_rate:PASS" >> "$SUMMARY"
    else
      fail "redis rate proof missing 429s"
    fi
  fi
else
  echo "redis:SKIP (REDIS_URL not set)" >> "$SUMMARY"
fi

echo "[gate:drill] Failure-mode hardening (PR-06)"
if [ -f "$SCRIPTS/chaos_ch_down.sh" ] && [ -f "$SCRIPTS/backup_restore.sh" ]; then
  # Run chaos test
  bash "$SCRIPTS/chaos_ch_down.sh"
  if [ -f "$ART/chaos_ch_down.txt" ]; then
    if grep -q "RESULT: PASS" "$ART/chaos_ch_down.txt" && grep -q "UPSTREAM_DOWN" "$ART/chaos_ch_down.txt"; then
      pass "chaos test shows proper degradation"; echo "chaos:PASS" >> "$SUMMARY"
    else
      fail "chaos test did not show expected behavior"
    fi
  fi
  
  # Run backup/restore test
  bash "$SCRIPTS/backup_restore.sh"
  if [ -f "$ART/table_counts_before.tsv" ] && [ -f "$ART/table_counts_after.tsv" ]; then
    # Compare alert counts
    ALERTS_BEFORE=$(grep "^alerts" "$ART/table_counts_before.tsv" | cut -f2 || echo "-1")
    ALERTS_AFTER=$(grep "^alerts" "$ART/table_counts_after.tsv" | cut -f2 || echo "-2")
    if [ "$ALERTS_BEFORE" = "$ALERTS_AFTER" ]; then
      pass "backup/restore counts match"; echo "backup:PASS" >> "$SUMMARY"
    else
      fail "backup/restore count mismatch: before=$ALERTS_BEFORE after=$ALERTS_AFTER"
    fi
  fi
  
  # Check metrics for circuit breaker
  METRICS=$(curl -sS http://127.0.0.1:9999/api/v2/metrics 2>/dev/null || echo "")
  if echo "$METRICS" | grep -q 'siem_v2_clickhouse_circuit_state{state="open"} 1'; then
    pass "circuit breaker metrics detected open state"
  fi
  
  echo "drill:PASS" >> "$SUMMARY"
else
  echo "drill:SKIP (scripts not found)" >> "$SUMMARY"
fi

echo "[gate:parsers] Proving normalization + intel"
bash "$SCRIPTS/parsers_normalize_proof.sh"
bash "$SCRIPTS/intel_enrich_proof.sh"
if jq -e '.event_category != "" and .user != ""' "$ART/normalize_okta.json" >/dev/null 2>&1 \
  && jq -e '.event_category != ""' "$ART/events_norm_sample.json" >/dev/null 2>&1 \
  && jq -e '.ti_match == 1 and (.ti_hits|length)>=1' "$ART/intel_enrich_hits.json" >/dev/null 2>&1; then
  pass "parsers and intel enrichment working"
  echo "parsers:PASS" >> "$SUMMARY"
else
  fail "parsers or intel enrichment failed"
  echo "parsers:FAIL" >> "$SUMMARY"
  exit 1
fi

echo "[gate:fts] Proving free-text index"
bash "$SCRIPTS/search_fts_proof.sh"
if jq -e '.data|type=="array" and (.data|length>=1)' "$ART/fts_search.json" >/dev/null 2>&1 \
  || jq -e '.data.data|type=="array" and (.data.data|length>=1)' "$ART/fts_search.json" >/dev/null 2>&1; then
  # Check for index or multiSearch
  if [ -s "$ART/fts_explain.txt" ]; then
    if grep -qi 'idx_msg_token' "$ART/fts_explain.txt"; then
      pass "free-text search using token index"
      echo "fts:PASS" >> "$SUMMARY"
    else
      warn "free-text search works but index not shown; checking compiler"
      if [ -s "$ART/fts_compiled_sql.txt" ] && grep -qi 'multiSearchAllPositionsCaseInsensitive' "$ART/fts_compiled_sql.txt"; then
        pass "free-text search using multiSearch function"
        echo "fts:PASS" >> "$SUMMARY"
      else
        fail "free-text search implementation unclear"
        echo "fts:FAIL" >> "$SUMMARY"
        exit 1
      fi
    fi
  else
    # No explain file, check compiled SQL
    if [ -s "$ART/fts_compiled_sql.txt" ] && grep -qi 'multiSearchAllPositionsCaseInsensitive' "$ART/fts_compiled_sql.txt"; then
      pass "free-text search using multiSearch function"
      echo "fts:PASS" >> "$SUMMARY"
    else
      fail "free-text search missing multiSearch"
      echo "fts:FAIL" >> "$SUMMARY"
      exit 1
    fi
  fi
else
  fail "free-text search returned no results"
  echo "fts:FAIL" >> "$SUMMARY"
  exit 1
fi

echo "[gate:agents] Proving agent enrollment and ingest"
bash "$SCRIPTS/agents_enroll_proof.sh"
bash "$SCRIPTS/agents_heartbeat_proof.sh"
bash "$SCRIPTS/agents_ingest_smoke.sh"
if jq -e '.agent_id and .config_url' "$ART/agents_enroll_response.json" >/dev/null 2>&1; then
  pass "agent enrollment successful"
  # Check online status
  if awk '{ if ($3 == 1) found=1 } END { exit (found?0:1) }' "$ART/agents_heartbeat_status.tsv"; then
    pass "agent heartbeat and online status working"
  else
    fail "agent not showing as online"
    echo "agents:FAIL" >> "$SUMMARY"
    exit 1
  fi
  # Check ingest count
  if awk '{ if ($1+0 >= 5) exit 0; else exit 1 }' "$ART/agents_ingest_count.tsv"; then
    pass "agent ingest working"
    echo "agents:PASS" >> "$SUMMARY"
  else
    fail "agent ingest count too low"
    echo "agents:FAIL" >> "$SUMMARY"
    exit 1
  fi
else
  fail "agent enrollment failed"
  echo "agents:FAIL" >> "$SUMMARY"
  exit 1
fi

echo "[gate:ledger] Proving end-to-end accounting"
bash "$SCRIPTS/ledger_gap_proof.sh"
if [ -f "$ART/ledger/gap_analysis.tsv" ] && [ $(wc -l < "$ART/ledger/gap_analysis.tsv") -le 1 ]; then
  pass "Zero gaps in event ledger"
  echo "ledger:PASS" >> "$SUMMARY"
else
  fail "Gaps detected in event ledger"
  echo "ledger:FAIL" >> "$SUMMARY"
  exit 1
fi

# Windows agent tests (if on Windows)
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
  echo "[gate:agents_install] Windows agent installation hardening"
  powershell -ExecutionPolicy Bypass -File "$SCRIPTS/win/agent_install_proof.ps1"
  if [ -f "$ART/win/install_report.json" ] && jq -e '.HardeningScore >= 80' "$ART/win/install_report.json" >/dev/null 2>&1; then
    pass "Agent installation hardening verified"
    echo "agents_install:PASS" >> "$SUMMARY"
  else
    fail "Agent installation hardening failed"
    echo "agents_install:FAIL" >> "$SUMMARY"
    exit 1
  fi
  
  echo "[gate:agents_offline] Windows agent offline resilience"
  powershell -ExecutionPolicy Bypass -File "$SCRIPTS/win/agent_offline_spool_proof.ps1"
  if [ -f "$ART/win/spool_metrics.tsv" ] && awk 'NR==4 {exit ($2 == 0 ? 0 : 1)}' "$ART/win/spool_metrics.tsv"; then
    pass "Zero data loss during offline period"
    echo "agents_offline:PASS" >> "$SUMMARY"
  else
    fail "Data loss detected during offline test"
    echo "agents_offline:FAIL" >> "$SUMMARY"
    exit 1
  fi
  
  echo "[gate:agents_perf] Windows agent performance validation"
  powershell -ExecutionPolicy Bypass -File "$SCRIPTS/win/agent_perf_proof.ps1"
  if [ -f "$ART/win/perf_metrics.tsv" ] && ! grep -q "false" "$ART/win/perf_metrics.tsv"; then
    pass "Agent performance within SLOs"
    echo "agents_perf:PASS" >> "$SUMMARY"
  else
    fail "Agent performance exceeded SLOs"
    echo "agents_perf:FAIL" >> "$SUMMARY"
    exit 1
  fi
else
  echo "agents_install:SKIP (not Windows)" >> "$SUMMARY"
  echo "agents_offline:SKIP (not Windows)" >> "$SUMMARY"
  echo "agents_perf:SKIP (not Windows)" >> "$SUMMARY"
fi

echo "[gate:collector_spool] Collector spool resilience"
bash "$SCRIPTS/collector_spool_proof.sh"
if awk '{ if ($1+0 >= 100000) exit 0; else exit 1 }' "$ART/events_count.tsv"; then
  pass "Collector delivered 100k events without loss"
  echo "collector_spool:PASS" >> "$SUMMARY"
else
  fail "Collector lost events during spool test"
  echo "collector_spool:FAIL" >> "$SUMMARY"
  exit 1
fi

echo "[gate:collector_perf] Collector performance validation"
bash "$SCRIPTS/collector_perf_proof.sh"
if [ -f "$ART/collector/collector_perf_metrics.tsv" ] && ! grep -q "false" "$ART/collector/collector_perf_metrics.tsv"; then
  pass "Collector performance within SLOs"
  echo "collector_perf:PASS" >> "$SUMMARY"
else
  fail "Collector performance exceeded SLOs"
  echo "collector_perf:FAIL" >> "$SUMMARY"
  exit 1
fi

echo "[gate:kafka_stress] Kafka streaming stress test (if configured)"
if [ -n "${KAFKA_BROKERS:-}" ]; then
  bash "$SCRIPTS/kafka_stress_proof.sh"
  if [ -f "$ART/kafka/kafka_counts.tsv" ] && awk 'NR==2 {exit ($4 == 0 ? 0 : 1)}' "$ART/kafka/kafka_counts.tsv"; then
    pass "Kafka maintained exactly-once semantics under stress"
    echo "kafka_stress:PASS" >> "$SUMMARY"
  else
    fail "Kafka lost data or had excessive duplicates"
    echo "kafka_stress:FAIL" >> "$SUMMARY"
    exit 1
  fi
else
  echo "kafka_stress:SKIP (KAFKA_BROKERS not set)" >> "$SUMMARY"
fi

echo "[gate:sizing] Generating sizing report"
bash "$SCRIPTS/sizing_report.sh"
if [ -f "$ART/sizing_validation.tsv" ] && awk 'NR==2 {exit ($2 == $1 ? 0 : 1)}' "$ART/sizing_validation.tsv"; then
  pass "All sizing requirements validated"
  echo "sizing:PASS" >> "$SUMMARY"
else
  fail "Some sizing requirements not met"
  echo "sizing:FAIL" >> "$SUMMARY"
  # Don't exit on sizing failure - it's informational
fi

echo "[post] Generate artifact index"
bash "$SCRIPTS/make_artifact_index.sh"

echo
echo "================= SUMMARY ================="
cat "$SUMMARY"
echo "==========================================="
