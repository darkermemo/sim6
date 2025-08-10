#!/usr/bin/env bash
set -Eeuo pipefail

# Config (override if you like)
: "${BASE_URL:=http://127.0.0.1:9999}"
: "${CLICKHOUSE_URL:=http://127.0.0.1:8123}"
: "${CLICKHOUSE_DATABASE:=dev}"
: "${REDIS_URL:=redis://127.0.0.1:6379}"
: "${TENANT:=default}"
: "${RET_DAYS:=30}"
: "${BATCH:=50}"           # events/sec (EPS ~= BATCH)
: "${RUN_ID:=SOAK-$(date -u +%Y%m%d-%H%M%SZ)}"

ART="target/test-artifacts/soak"
LOG_SRV="/tmp/siem_srv.log"
LOG_RUN="/tmp/siem_runner.log"
PID_SRV="/tmp/siem_srv.pid"
PID_RUN="/tmp/siem_runner.pid"
PID_FEED="/tmp/soak_feeder.pid"
PID_SAMP="/tmp/soak_sampler.pid"

mkdir -p "$ART"
printf "RUN_ID=%s\nTENANT=%s\nBATCH=%s\n" "$RUN_ID" "$TENANT" "$BATCH" > "$ART/env.txt"

# 0) Quick backend sanity
curl -sS -w "\nCH:%{http_code}\n" "$CLICKHOUSE_URL/ping" -o /dev/null || true
redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1 || true

# 1) Start API if not up
if ! curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
  echo "[soak] starting API…"
  (
    RUST_LOG=info,siem_unified_pipeline=info \
    CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
    REDIS_URL="$REDIS_URL" \
    cargo run -q -p siem_unified_pipeline --bin siem-pipeline >"$LOG_SRV" 2>&1 & echo $! > "$PID_SRV"
  )
  for i in {1..120}; do curl -fsS "$BASE_URL/health" >/dev/null 2>&1 && break || sleep 0.5; done
fi

# 2) Start stream runner if not up
if ! pgrep -F "$PID_RUN" >/dev/null 2>&1; then
  echo "[soak] starting stream runner…"
  (
    RUST_LOG=info,siem_unified_pipeline=info \
    CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" \
    REDIS_URL="$REDIS_URL" \
    cargo run -q -p siem_unified_pipeline --bin siem-stream-runner >"$LOG_RUN" 2>&1 & echo $! > "$PID_RUN"
  )
  sleep 1
fi

# 3) Bump limits high to avoid 429 during soak
curl -sS -X PUT -H 'content-type: application/json' \
  --data "{\"eps_limit\":100000,\"burst_limit\":100000,\"retention_days\":$RET_DAYS}" \
  "$BASE_URL/api/v2/admin/tenants/$TENANT/limits" > "$ART/limits_put.json" || true

# 4) Start feeder (EPS ≈ BATCH/sec)
echo "[soak] starting feeder at ~${BATCH} EPS (tenant=$TENANT, run=$RUN_ID)"
(
  while true; do
    now=$(date +%s)
    # Emit BATCH NDJSON lines to stdin → POST
    i=1
    while [ $i -le $BATCH ]; do
      printf '{"event_id":"soak-%s-%s-%s","event_timestamp":%s,"tenant_id":"%s","event_category":"app","event_action":"log","event_outcome":"success","message":"soak %s #%s","raw_event":"{"run":"%s"}","metadata":"{}","source_type":"soak","created_at":%s,"retention_days":%s}\n' "$RUN_ID" "$now" "$i" "$now" "$TENANT" "$RUN_ID" "$i" "$RUN_ID" "$now" "$RET_DAYS"
      i=$((i+1))
    done | curl -sS -o "$ART/ing.last.json" \
      -w "time:%{time_total} code:%{http_code}\n" \
      -H 'content-type: application/x-ndjson' --data-binary @- \
      "$BASE_URL/api/v2/ingest/bulk" >> "$ART/ing.codes.txt"
    sleep 1
  done
) & echo $! > "$PID_FEED"

# 5) Start sampler (metrics + CH evidence every 60s)
(
  while true; do
    ts=$(date -u +%Y%m%d-%H%M%SZ)
    curl -sS "$BASE_URL/metrics" > "$ART/metrics.$ts.txt" || true
    clickhouse client -q "SELECT count() c FROM $CLICKHOUSE_DATABASE.events WHERE source_type='soak' AND tenant_id='$TENANT' AND event_timestamp>=toUInt32(now())-3600 FORMAT Pretty" > "$ART/ev_last_hour.$ts.txt" || true
    clickhouse client -q "SELECT rule_id, tenant_id, last_error, updated_at FROM $CLICKHOUSE_DATABASE.rule_state WHERE updated_at>=toUInt32(now())-3600 AND last_error!='' ORDER BY updated_at DESC LIMIT 20 FORMAT Pretty" > "$ART/rule_err.$ts.txt" || true
    sleep 60
  done
) & echo $! > "$PID_SAMP"

echo "[soak] STARTED"
echo "  api pid:      $(cat "$PID_SRV" 2>/dev/null || echo '-')"
echo "  runner pid:   $(cat "$PID_RUN" 2>/dev/null || echo '-')"
echo "  feeder pid:   $(cat "$PID_FEED")"
echo "  sampler pid:  $(cat "$PID_SAMP")"
echo "artifacts → $ART"
