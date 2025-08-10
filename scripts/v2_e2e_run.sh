#!/usr/bin/env bash
set -Eeuo pipefail

# End-to-end bench runner: build → start API → generate + load → parse → seed rules → run-now → metrics → report

BASE_URL="${BASE_URL:-http://127.0.0.1:9999}"
CLICKHOUSE_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
CLICKHOUSE_DATABASE="${CLICKHOUSE_DATABASE:-dev}"
TENANT="${TENANT:-default}"
ART="target/test-artifacts"
GEN="target/generated"
mkdir -p "$ART" "$GEN"

note(){ printf '[e2e] %s\n' "$*"; }
fail(){ echo "❌ $*" >&2; exit 1; }

note "Build crates"
cargo build -q -p siem_unified_pipeline -p siem_tools || fail "build failed"

note "Start API (if not up)"
if ! curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
  pkill -f siem-pipeline >/dev/null 2>&1 || true
  (CLICKHOUSE_URL="$CLICKHOUSE_URL" CLICKHOUSE_DATABASE="$CLICKHOUSE_DATABASE" RUST_LOG=info \
    cargo run -q -p siem_unified_pipeline --bin siem-pipeline > /tmp/siem_srv.log 2>&1 &)
  for i in {1..100}; do curl -fsS "$BASE_URL/health" >/dev/null 2>&1 && break || sleep 0.1; done
fi
curl -fsS "$BASE_URL/health" | jq . > "$ART/health.json" || fail "/health"

note "Generate sources"
pushd siem_tools >/dev/null
./target/debug/siem gen okta-system-log --seed 42 --count 200 --tenant "$TENANT" --out "$GEN/okta-system-log.raw" --out-ndjson "$GEN/okta-system-log.ndjson"
./target/debug/siem gen gcp-audit        --seed 42 --count 200 --tenant "$TENANT" --out "$GEN/gcp-audit.raw"       --out-ndjson "$GEN/gcp-audit.ndjson"
./target/debug/siem gen zeek-http        --seed 42 --count 200 --tenant "$TENANT" --out "$GEN/zeek-http.raw"       --out-ndjson "$GEN/zeek-http.ndjson"
./target/debug/siem gen cisco-asa        --seed 42 --count 200 --tenant "$TENANT" --out "$GEN/cisco-asa.raw"       --out-ndjson "$GEN/cisco-asa.ndjson"
./target/debug/siem gen fortigate        --seed 42 --count 200 --tenant "$TENANT" --out "$GEN/fortigate.raw"       --out-ndjson "$GEN/fortigate.ndjson"
./target/debug/siem gen otel-logs        --seed 42 --count 200 --tenant "$TENANT" --out "$GEN/otel-logs.raw"       --out-ndjson "$GEN/otel-logs.ndjson"
popd >/dev/null

note "Load to ClickHouse"
pushd siem_tools >/dev/null
./target/debug/siem load-ch --file "$GEN/okta-system-log.ndjson" --table dev.events
./target/debug/siem load-ch --file "$GEN/gcp-audit.ndjson"        --table dev.events
./target/debug/siem load-ch --file "$GEN/zeek-http.ndjson"        --table dev.events
./target/debug/siem load-ch --file "$GEN/cisco-asa.ndjson"        --table dev.events
./target/debug/siem load-ch --file "$GEN/fortigate.ndjson"        --table dev.events
./target/debug/siem load-ch --file "$GEN/otel-logs.ndjson"        --table dev.events
popd >/dev/null

note "Parse detect/normalize (smoke)"
head -n 1 "$GEN/zeek-http.raw" | {
  read -r L; jq -n --arg sample "$L" '{sample:$sample}' | curl -fsS -X POST "$BASE_URL/api/v2/parse/detect" -H 'content-type: application/json' --data-binary @- \
    | tee "$ART/detect_zeek_http.json" >/dev/null; }
jq -n --arg t "$TENANT" --argjson recs "$(jq -Rs 'split("\n")[:-1]' < "$GEN/okta-system-log.raw")" '{tenant_id:$t, samples:$recs}' \
  | curl -fsS -X POST "$BASE_URL/api/v2/parse/normalize" -H 'content-type: application/json' --data-binary @- \
  | tee "$ART/normalize_okta.json" >/dev/null

note "Seed rules (6)"
bash scripts/rules-seed2.sh

note "Run-now all rules"
bash scripts/rules-run-now.sh | tee "$ART/rules_run_now.txt" >/dev/null

note "Metrics snapshot"
curl -fsS "$BASE_URL/metrics" | egrep '^(siem_v2_(compile_total|search_execute_seconds|rules_run_total|alerts_written_total))' || true > "$ART/metrics_short.txt"

note "Append final report"
bash scripts/final_report_append.sh || true

note "DONE"


